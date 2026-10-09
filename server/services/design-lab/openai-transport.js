// Shared native HTTP transport. No app, capture, database or upload dependency.
function key() {
  if (!process.env.OPENAI_API_KEY) {
    const error = new Error("OPENAI_API_KEY absente sur le serveur.");
    error.status = 503;
    throw error;
  }
  return process.env.OPENAI_API_KEY;
}

async function openaiRequest(
  path,
  body,
  {
    multipart = false,
    timeout = 90000,
    onProgress,
    captureMetadata = false,
    method = "POST",
    clientRequestId,
    onRawBody,
    apiKey,
    transport = global.fetch,
  } = {},
) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeout);
  let requestId = null,
    httpStatus = null;
  const startedAt = Date.now();
  let dispatched = false, completedResponse;
  try {
    const headers = {
      Authorization: `Bearer ${apiKey ?? key()}`,
      ...(multipart ? {} : { "Content-Type": "application/json" }),
      ...(clientRequestId ? {"X-Client-Request-Id":clientRequestId} : {}),
    };
    if(method!=="POST"&&!(method==="GET"&&/^responses\/resp_[A-Za-z0-9_-]{1,240}$/.test(path)))
      throw Object.assign(Error('OpenAI transport method/path refused'),{code:'OPENAI_TRANSPORT_PATH_REFUSED'});
    const payload = method==="GET" ? undefined : multipart ? body : JSON.stringify(body);
    await onProgress?.("request_started", { timeoutMs: timeout, startedAt });
    if(controller.signal.aborted)throw Object.assign(new Error('Deadline reached before dispatch'),{name:'AbortError'});
    dispatched = true;
    const response = await transport(`https://api.openai.com/v1/${path}`, {
      method,
      redirect: "error",
      headers,
      body: payload,
      signal: controller.signal,
    });
    requestId = response.headers?.get?.("x-request-id") || null;
    httpStatus = response.status;
    await onProgress?.("response_headers", response.status, { requestId, httpStatus });
    let data;
    if(onRawBody) {
      const raw=await response.text();
      await onRawBody(raw,{requestId,httpStatus,elapsedMs:Date.now()-startedAt,receivedAt:new Date().toISOString()});
      try{data=JSON.parse(raw);}catch(cause){throw Object.assign(Error('Réponse HTTP OpenAI non JSON ; brut conservé.'),{code:'OPENAI_RESPONSE_ENVELOPE_INVALID',status:502,cause});}
    } else data = await response.json().catch((error) => {
      if (controller.signal.aborted || error.name === "AbortError") throw error;
      return {};
    });
    if(response.ok)completedResponse=data;
    if(controller.signal.aborted)throw Object.assign(new Error("Response completed after local deadline"), {name:"AbortError"});
    await onProgress?.("response_body");
    if (!response.ok) {
      const error = new Error(
        data?.error?.message || `Erreur OpenAI (${response.status}).`,
      );
      error.status = response.status === 429 ? 429 : 502;
      Object.assign(error, {
        httpStatus: response.status,
        openaiErrorType: data?.error?.type || null,
        openaiErrorCode: data?.error?.code || null,
        requestId,
        code: "OPENAI_HTTP_ERROR",
      });
      throw error;
    }
    return captureMetadata
      ? { body: data, httpStatus: response.status, requestId }
      : data;
  } catch (error) {
    if (controller.signal.aborted || error.name === "AbortError") {
      const timeoutError = new Error("Délai OpenAI dépassé. Réessayez.");
      timeoutError.status = 504;
      Object.assign(timeoutError, { code:"OPENAI_TIMEOUT", requestId, httpStatus, timeoutMs:timeout,
        structuralPhase:httpStatus?'vision_response_body':'vision_request',
        elapsedMs:Date.now()-startedAt,remainingMs:0,visionDispatched:dispatched,cause:error,
        ...(completedResponse?{completeRawResponse:completedResponse}:{}) });
      throw timeoutError;
    }
    Object.assign(error,{requestId,httpStatus,visionDispatched:dispatched,
      ...(completedResponse?{completeRawResponse:completedResponse}:{})});
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

module.exports={openaiRequest,key};
