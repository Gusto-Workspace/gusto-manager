const RETRY_DELAY_MS = 3000;

let redirectInProgress = false;

export function redirectAfterRevokedSession() {
  if (typeof window === "undefined" || redirectInProgress) return;
  redirectInProgress = true;
  localStorage.removeItem("token");

  const currentPath =
    window.location.pathname + window.location.search + window.location.hash;
  const loginUrl = currentPath.startsWith("/dashboard/login")
    ? "/dashboard/login"
    : `/dashboard/login?redirect=${encodeURIComponent(currentPath)}`;

  window.location.replace(loginUrl);
}

function waitBeforeRetry(signal) {
  return new Promise((resolve) => {
    if (signal.aborted) return resolve();
    const timeout = setTimeout(resolve, RETRY_DELAY_MS);
    signal.addEventListener(
      "abort",
      () => {
        clearTimeout(timeout);
        resolve();
      },
      { once: true },
    );
  });
}

async function consumeEventStream(response, signal, onMessage) {
  const reader = response.body?.getReader();
  if (!reader) throw new Error("Streaming response body unavailable");

  const decoder = new TextDecoder();
  let buffer = "";

  while (!signal.aborted) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true }).replace(/\r\n/g, "\n");
    const blocks = buffer.split("\n\n");
    buffer = blocks.pop() || "";

    for (const block of blocks) {
      let eventName = "message";
      const dataLines = [];

      for (const line of block.split("\n")) {
        if (line.startsWith(":")) continue;
        if (line.startsWith("event:")) eventName = line.slice(6).trim();
        else if (line.startsWith("data:")) {
          dataLines.push(line.slice(5).trimStart());
        }
      }

      if (eventName === "auth_error") return { authError: true };
      if (dataLines.length > 0) onMessage?.({ data: dataLines.join("\n") });
    }
  }

  return { authError: false };
}

export function createAuthenticatedEventSource(
  url,
  { getToken = () => localStorage.getItem("token") } = {},
) {
  const controller = new AbortController();
  let active = true;
  const eventSource = {
    onmessage: null,
    onerror: null,
    close() {
      active = false;
      controller.abort();
    },
  };

  async function connect() {
    while (active && !controller.signal.aborted) {
      const connectionToken = getToken();
      if (!connectionToken) {
        redirectAfterRevokedSession();
        return;
      }

      try {
        const response = await fetch(url, {
          headers: {
            Accept: "text/event-stream",
            Authorization: `Bearer ${connectionToken}`,
          },
          cache: "no-store",
          signal: controller.signal,
        });

        if (response.status === 401 || response.status === 403) {
          if (connectionToken !== getToken()) continue;
          redirectAfterRevokedSession();
          return;
        }

        if (!response.ok) {
          throw new Error(`SSE request failed with status ${response.status}`);
        }

        const { authError } = await consumeEventStream(
          response,
          controller.signal,
          (event) => eventSource.onmessage?.(event),
        );

        if (authError) {
          if (connectionToken !== getToken()) continue;
          redirectAfterRevokedSession();
          return;
        }
      } catch (error) {
        if (!controller.signal.aborted) eventSource.onerror?.(error);
      }

      if (active && !controller.signal.aborted) {
        await waitBeforeRetry(controller.signal);
      }
    }
  }

  void connect();

  return eventSource;
}
