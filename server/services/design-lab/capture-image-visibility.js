/* global document, window, getComputedStyle, Image */
// Self-contained: executed in Chromium. The browser selects currentSrc for
// picture/srcset; never inspect inactive <source> URLs or resolved img.src.
async function inspectCaptureImagesDOM({
  visibleOnly = false,
  decode = false,
  maxWaitMs = 5000,
} = {}) {
  const visibility = (node) => {
    const rect = node.getBoundingClientRect();
    let left = rect.left,
      right = rect.right,
      top = rect.top,
      bottom = rect.bottom,
      opacity = 1;
    if (!rect.width || !rect.height) return false;
    for (let parent = node; parent; parent = parent.parentElement) {
      const style = getComputedStyle(parent);
      opacity *= Number(style.opacity);
      if (
        style.display === "none" ||
        ["hidden", "collapse"].includes(style.visibility) ||
        style.contentVisibility === "hidden" ||
        opacity <= 0.01 ||
        (parent.tagName === "DIALOG" && !parent.open)
      )
        return false;
      if (
        parent.tagName === "DETAILS" &&
        !parent.open &&
        !node.closest("summary")
      )
        return false;
      if (
        parent !== node &&
        /(hidden|clip|scroll|auto)/.test(style.overflowX + style.overflowY)
      ) {
        const box = parent.getBoundingClientRect();
        if (/(hidden|clip|scroll|auto)/.test(style.overflowX)) {
          left = Math.max(left, box.left);
          right = Math.min(right, box.right);
        }
        if (/(hidden|clip|scroll|auto)/.test(style.overflowY)) {
          top = Math.max(top, box.top);
          bottom = Math.min(bottom, box.bottom);
        }
      }
      // Degenerate clip-path polygons are common in closed navigation menus.
      const polygon = style.clipPath.match(/^polygon\((.*)\)$/);
      if (polygon) {
        const points = polygon[1]
          .replace(/^(?:evenodd|nonzero),\s*/, "")
          .split(",")
          .map((point) => point.trim().split(/\s+/).map(parseFloat));
        if (
          points.length >= 3 &&
          points.every(
            (point) => point.length === 2 && point.every(Number.isFinite),
          )
        ) {
          const area = points.reduce((sum, point, index) => {
            const next = points[(index + 1) % points.length];
            return sum + point[0] * next[1] - next[0] * point[1];
          }, 0);
          if (Math.abs(area) < 0.001) return false;
        }
      }
      const inset = style.clipPath.match(/^inset\(([^)]*)\)/);
      if (inset) {
        const values = inset[1].replace(/\s+round[\s\S]*$/, "").split(/\s+/);
        const toPixels = (value, extent) =>
          value?.endsWith("%")
            ? (Number.parseFloat(value) / 100) * extent
            : Number.parseFloat(value) || 0;
        const box = parent.getBoundingClientRect();
        const [
          topValue = "0",
          rightValue = topValue,
          bottomValue = topValue,
          leftValue = rightValue,
        ] = values;
        const clipTop = toPixels(topValue, box.height);
        const clipRight = toPixels(rightValue, box.width);
        const clipBottom = toPixels(bottomValue, box.height);
        const clipLeft = toPixels(leftValue, box.width);
        top = Math.max(top, box.top + clipTop);
        right = Math.min(right, box.right - clipRight);
        bottom = Math.min(bottom, box.bottom - clipBottom);
        left = Math.max(left, box.left + clipLeft);
      }
      const circle = style.clipPath.match(/^circle\(([^\s)]+)/);
      if (circle && (Number.parseFloat(circle[1]) || 0) === 0) return false;
    }
    if (
      node.checkVisibility &&
      !node.checkVisibility({ checkOpacity: true, checkVisibilityCSS: true })
    )
      return false;
    if (visibleOnly) {
      left = Math.max(left, 0);
      top = Math.max(top, 0);
      right = Math.min(right, window.innerWidth);
      bottom = Math.min(bottom, window.innerHeight);
    }
    return (
      right - left >= 32 &&
      bottom - top >= 32 &&
      (right - left) * (bottom - top) >= 4096
    );
  };
  const images = [...document.images].filter((image) => {
    const rect = image.getBoundingClientRect();
    const picture = image.closest("picture");
    const hasPictureAlternative = Boolean(
      picture?.querySelector("source[srcset]") ||
        image.getAttribute("srcset")?.trim(),
    );
    const emptyRenderedSource =
      visibleOnly && image.getAttribute("src") === "" && !hasPictureAlternative;
    return (
      rect.width >= 120 &&
      rect.height >= 120 &&
      visibility(image) &&
      Boolean(
        image.currentSrc ||
          image.getAttribute("src")?.trim() ||
          image.getAttribute("srcset")?.trim() ||
          image.getAttribute("data-src")?.trim() ||
          emptyRenderedSource,
      )
    );
  });
  const rows = images.map((image) => ({
    url:
      image.currentSrc ||
      (image.getAttribute("src")?.trim()
        ? new URL(image.getAttribute("src"), document.baseURI).href
        : ""),
    complete: image.complete,
    naturalWidth: image.naturalWidth,
    naturalHeight: image.naturalHeight,
    // Empty lazy placeholders are rediscovered before making a final decision.
    pending:
      !image.complete ||
      (!image.currentSrc && !image.getAttribute("src")?.trim()),
  }));
  // CSS backgrounds have no complete/naturalWidth API. Probe only large,
  // actually rendered backgrounds, using the same intercepted/cached transport.
  // Keep these per-document probes outside the site's DOM and layout.
  if (visibleOnly) {
    window.__gustoBackgroundProbes ||= new Map();
    for (const node of document.querySelectorAll("body *")) {
      const box = node.getBoundingClientRect();
      if (box.width < 120 || box.height < 120 || !visibility(node)) continue;
      const css = getComputedStyle(node).backgroundImage;
      const urls = [...css.matchAll(/url\(["']?([^"')]+)["']?\)/g)];
      for (const [, value] of urls) {
        const url = new URL(value, document.baseURI).href;
        if (!/^https?:/.test(url)) continue;
        let probe = window.__gustoBackgroundProbes.get(url);
        if (!probe) {
          probe = new Image();
          probe.src = url;
          window.__gustoBackgroundProbes.set(url, probe);
        }
        if (!rows.some((row) => row.url === url))
          rows.push({
            url,
            complete: probe.complete,
            naturalWidth: probe.naturalWidth,
            naturalHeight: probe.naturalHeight,
            pending: !probe.complete,
          });
      }
    }
    for (const video of document.querySelectorAll("video")) {
      const box = video.getBoundingClientRect();
      if (box.width < 120 || box.height < 120 || !visibility(video)) continue;
      const url =
        video.currentSrc ||
        (video.getAttribute("src")?.trim()
          ? new URL(video.getAttribute("src"), document.baseURI).href
          : "");
      if (!url) continue;
      if (video.readyState >= 2 && video.videoWidth) continue;
      const poster = video.getAttribute("poster");
      if (poster?.trim()) {
        const posterUrl = new URL(poster, document.baseURI).href;
        let probe = window.__gustoBackgroundProbes.get(posterUrl);
        if (!probe) {
          probe = new Image();
          probe.src = posterUrl;
          window.__gustoBackgroundProbes.set(posterUrl, probe);
        }
        rows.push({
          url: posterUrl,
          complete: probe.complete,
          naturalWidth: probe.naturalWidth,
          pending: !probe.complete,
        });
      } else
        rows.push({
          url,
          complete: Boolean(video.error),
          naturalWidth: 0,
          pending: !video.error,
        });
    }
  }
  if (decode)
    await Promise.all(
      images.map(async (image, index) => {
        if (!image.complete || !image.naturalWidth || !image.decode) return;
        let timer;
        try {
          await Promise.race([
            image.decode(),
            new Promise((_, reject) => {
              timer = setTimeout(
                () => reject(new Error("decode timeout")),
                maxWaitMs,
              );
            }),
          ]);
        } catch {
          rows[index].pending = true;
        } finally {
          clearTimeout(timer);
        }
      }),
    );
  return rows;
}

// External iframe documents can fail independently from the parent page. Keep
// the iframe element and its measured box, but use a local srcdoc for capture so
// the failed third-party rendering is replaced with a neutral placeholder.
async function applyExternalEmbedPlaceholdersDOM(failures = []) {
  const normalize = (value) => {
    try {
      const url = new URL(value, document.baseURI);
      url.hash = "";
      return url.href;
    } catch {
      return "";
    }
  };
  const failedByUrl = new Map(
    failures.map((failure) => [normalize(failure.url), failure]),
  );
  const output = [];
  for (const frame of document.querySelectorAll("iframe")) {
    const source = normalize(frame.getAttribute("src") || "");
    const failure = failedByUrl.get(source);
    if (!source || !failure) continue;
    const rect = frame.getBoundingClientRect();
    if (!Number.isFinite(rect.width) || !Number.isFinite(rect.height)) continue;
    let visibleWidth = Math.max(
      0,
      Math.min(rect.right, innerWidth) - Math.max(0, rect.left),
    );
    let visibleHeight = Math.max(
      0,
      Math.min(rect.bottom, innerHeight) - Math.max(0, rect.top),
    );
    let opacity = 1;
    let visible = true;
    for (let parent = frame; parent; parent = parent.parentElement) {
      const style = getComputedStyle(parent);
      opacity *= Number(style.opacity);
      if (
        style.display === "none" ||
        ["hidden", "collapse"].includes(style.visibility) ||
        opacity <= 0.01 ||
        (parent.tagName === "DIALOG" && !parent.open) ||
        (parent.tagName === "DETAILS" && !parent.open && !frame.closest("summary"))
      ) {
        visible = false;
        break;
      }
      if (
        parent !== frame &&
        /(hidden|clip|scroll|auto)/.test(style.overflowX + style.overflowY)
      ) {
        const box = parent.getBoundingClientRect();
        if (/(hidden|clip|scroll|auto)/.test(style.overflowX)) {
          visibleWidth = Math.max(
            0,
            Math.min(rect.right, box.right, innerWidth) -
              Math.max(rect.left, box.left, 0),
          );
        }
        if (/(hidden|clip|scroll|auto)/.test(style.overflowY)) {
          visibleHeight = Math.max(
            0,
            Math.min(rect.bottom, box.bottom, innerHeight) -
              Math.max(rect.top, box.top, 0),
          );
        }
      }
    }
    if (
      !visible ||
      rect.width <= 0 ||
      rect.height <= 0 ||
      visibleWidth <= 0 ||
      visibleHeight <= 0
    )
      continue;
    if (frame.getAttribute("data-gusto-external-embed-unavailable") !== "true") {
      const css = getComputedStyle(frame);
      // Freeze the current used CSS size so even embeds with auto dimensions
      // keep the exact layout footprint after their remote document is replaced.
      frame.style.setProperty("width", css.width, "important");
      frame.style.setProperty("height", css.height, "important");
      frame.setAttribute("data-gusto-external-embed-unavailable", "true");
      frame.srcdoc =
        '<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><style>html,body{width:100%;height:100%;margin:0;overflow:hidden;background:#e9e9e9}</style></head><body></body></html>';
    }
    const url = new URL(source);
    output.push({
      domain: url.hostname,
      networkStatus: Number.isInteger(failure.networkStatus)
        ? failure.networkStatus
        : null,
      status: "unavailable",
      width: rect.width,
      height: rect.height,
      x: rect.left + window.scrollX,
      y: rect.top + window.scrollY,
      viewportX: rect.left,
      viewportY: rect.top,
      externalEmbedUnavailable: true,
    });
  }
  return output;
}

module.exports = {
  inspectCaptureImagesDOM,
  applyExternalEmbedPlaceholdersDOM,
};
