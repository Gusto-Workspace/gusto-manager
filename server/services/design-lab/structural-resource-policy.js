const MiB = 1024 * 1024;
// Per capture, not a global backend policy. Reserve image capacity independently
// from scripts, fonts, videos and third-party traffic.
const STRUCTURAL_RESOURCE_LIMITS = Object.freeze({
  image: 32 * MiB,
  document: 4 * MiB,
  asset: 8 * MiB,
  media: 32 * MiB,
  images: 128 * MiB,
  nonImages: 80 * MiB,
  mediaTotal: 64 * MiB,
  total: 208 * MiB,
  requests: 160,
});
function resourceBudgetError(url, detectedBytes, limitBytes, limitKind) {
  return Object.assign(
    new Error(
      `structural_media_budget_exceeded : ${url} (${detectedBytes} octets ; limite ${limitKind} : ${limitBytes} octets).`,
    ),
    {
      status: 422,
      code: "structural_media_budget_exceeded",
      resourceUrl: url,
      detectedBytes,
      limitBytes,
      limitKind,
    },
  );
}
function technicalResource(url, type) {
  if (!["image", "fetch", "xhr", "script", "other"].includes(type))
    return false;
  const parsed = new URL(url);
  return (
    /(^|\.)(google-analytics\.com|googletagmanager\.com|doubleclick\.net|connect\.facebook\.net|analytics\.tiktok\.com)$/.test(
      parsed.hostname,
    ) ||
    /\/(?:tracking[-_]?pixel|beacon|pixel\.gif|collect)(?:\/|$)/i.test(
      parsed.pathname,
    )
  );
}
function createStructuralResourcePolicy(limits = STRUCTURAL_RESOURCE_LIMITS) {
  const cache = new Map(),
    failures = new Map();
  const stats = {
    transferredBytes: 0,
    imageBytes: 0,
    nonImageBytes: 0,
    mediaBytes: 0,
    uniqueRequests: 0,
    cacheHits: 0,
    skippedTechnical: 0,
  };
  const waiting = [];
  const reserved = { total: 0, images: 0, nonImages: 0, media: 0 };
  let active = 0;
  const availableBudget = (item) => {
    let bytes = item.perResource;
    let kind = "resource";
    const available = (cap, stat, reserve) =>
      cap - stats[stat] - reserved[reserve];
    const total = available(limits.total, "transferredBytes", "total");
    if (total < bytes) {
      bytes = total;
      kind = "total";
    }
    if (item.type === "image") {
      const images = available(limits.images, "imageBytes", "images");
      if (images < bytes) {
        bytes = images;
        kind = "images";
      }
    } else {
      const others = available(limits.nonImages, "nonImageBytes", "nonImages");
      if (others < bytes) {
        bytes = others;
        kind = "nonImages";
      }
    }
    if (item.type === "media") {
      const media = available(limits.mediaTotal, "mediaBytes", "media");
      if (media < bytes) {
        bytes = media;
        kind = "mediaTotal";
      }
    }
    // Don't start a partial-cap download while other in-flight reservations
    // may soon release unused bytes. Reconsider it when an active transfer ends.
    if (bytes > 0 && bytes < item.perResource && active > 0)
      return { bytes: 0, kind };
    return { bytes, kind };
  };
  const release = (item) => {
    reserved.total -= item.reservation;
    if (item.type === "image") reserved.images -= item.reservation;
    else reserved.nonImages -= item.reservation;
    if (item.type === "media") reserved.media -= item.reservation;
    active--;
    drain();
  };
  const drain = () => {
    waiting.sort((a, b) => b.priority - a.priority);
    while (active < 12 && waiting.length) {
      let index = waiting.findIndex((item) => availableBudget(item).bytes > 0);
      if (index < 0) {
        if (active === 0) {
          const item = waiting.shift();
          clearTimeout(item.timer);
          const result = availableBudget(item);
          const used =
            result.kind === "images"
              ? stats.imageBytes + reserved.images
              : result.kind === "mediaTotal"
                ? stats.mediaBytes + reserved.media
                : result.kind === "nonImages"
                  ? stats.nonImageBytes + reserved.nonImages
                  : stats.transferredBytes + reserved.total;
          item.reject(
            resourceBudgetError(
              item.url,
              used + 1,
              item.limitBytes[result.kind],
              result.kind,
            ),
          );
          continue;
        }
        return;
      }
      const item = waiting.splice(index, 1)[0];
      clearTimeout(item.timer);
      const result = availableBudget(item);
      item.reservation = result.bytes;
      item.limitKind =
        result.bytes < item.perResource ? result.kind : "resource";
      reserved.total += item.reservation;
      if (item.type === "image") reserved.images += item.reservation;
      else reserved.nonImages += item.reservation;
      if (item.type === "media") reserved.media += item.reservation;
      active++;
      item.resolve(item);
    }
  };
  const acquire = (item) =>
    new Promise((resolve, reject) => {
      item.resolve = resolve;
      item.reject = reject;
      item.timer = setTimeout(
        () => {
          const index = waiting.indexOf(item);
          if (index >= 0) waiting.splice(index, 1);
          reject(
            Object.assign(
              new Error("Délai d’attente du budget réseau dépassé."),
              { status: 504 },
            ),
          );
          drain();
        },
        Math.max(1, item.deadline - Date.now()),
      );
      waiting.push(item);
      drain();
    });
  const keyOf = (value) => {
    const url = new URL(value);
    url.hash = "";
    return url.href;
  };
  async function fetch(url, type, fetchResource, options, visible = false) {
    const key = keyOf(url);
    if (technicalResource(key, type)) {
      stats.skippedTechnical++;
      return null;
    }
    if (cache.has(key)) {
      stats.cacheHits++;
      return cache.get(key);
    }
    // Bound queued promises/cache entries too, not just active downloads.
    if (stats.uniqueRequests >= limits.requests) {
      throw resourceBudgetError(
        key,
        stats.uniqueRequests + 1,
        limits.requests,
        "requests",
      );
    }
    stats.uniqueRequests++;
    const perResource =
      type === "image"
        ? limits.image
        : type === "document"
          ? limits.document
          : type === "media"
            ? limits.media
            : limits.asset;
    let charged = 0;
    let allowedBytes = perResource;
    let limitKind = "resource";
    const rejectBudget = (size, cap, kind) => {
      throw resourceBudgetError(key, size, cap, kind);
    };
    const accountBytes = (amount) => {
      charged += amount;
      stats.transferredBytes += amount;
      if (type === "image") stats.imageBytes += amount;
      else stats.nonImageBytes += amount;
      if (type === "media") stats.mediaBytes += amount;
      if (charged > allowedBytes) {
        if (limitKind === "resource")
          rejectBudget(charged, perResource, "resource");
        const stat =
          limitKind === "images"
            ? stats.imageBytes
            : limitKind === "mediaTotal"
              ? stats.mediaBytes
              : limitKind === "nonImages"
                ? stats.nonImageBytes
                : stats.transferredBytes;
        const cap =
          limits[limitKind === "mediaTotal" ? "mediaTotal" : limitKind];
        rejectBudget(stat, cap, limitKind);
      }
      if (stats.transferredBytes > limits.total)
        rejectBudget(stats.transferredBytes, limits.total, "total");
      if (type === "image" && stats.imageBytes > limits.images)
        rejectBudget(stats.imageBytes, limits.images, "images");
      if (type !== "image" && stats.nonImageBytes > limits.nonImages)
        rejectBudget(stats.nonImageBytes, limits.nonImages, "nonImages");
      if (type === "media" && stats.mediaBytes > limits.mediaTotal)
        rejectBudget(stats.mediaBytes, limits.mediaTotal, "mediaTotal");
    };
    const pending = (async () => {
      let reservationHeld = false;
      // Browsers request visible/lazy images during traversal. Reserve their
      // slots ahead of optional media and background third-party traffic.
      try {
        const acquired = await acquire({
          url: key,
          type,
          perResource,
          deadline: options.deadline || Date.now() + 25000,
          detectedBytes:
            type === "image"
              ? stats.imageBytes + reserved.images + 1
              : stats.transferredBytes + reserved.total + 1,
          limitBytes: {
            total: limits.total,
            images: limits.images,
            nonImages: limits.nonImages,
            mediaTotal: limits.mediaTotal,
          },
          priority:
            type === "document"
              ? 4
              : type === "image"
                ? 3
                : ["stylesheet", "script", "font"].includes(type)
                  ? 2
                  : type === "media" && visible
                    ? 2
                    : 0,
        });
        reservationHeld = true;
        allowedBytes = acquired.reservation;
        limitKind = acquired.limitKind;
        // Refuse further downloads once their reserved category is exhausted.
        const result = await fetchResource(key, {
          ...options,
          maxBytes: allowedBytes,
          accountBytes,
          budgetError: (size) => {
            if (limitKind === "resource")
              return resourceBudgetError(key, size, perResource, "resource");
            const stat =
              limitKind === "images"
                ? stats.imageBytes
                : limitKind === "mediaTotal"
                  ? stats.mediaBytes
                  : limitKind === "nonImages"
                    ? stats.nonImageBytes
                    : stats.transferredBytes;
            const cap =
              limits[limitKind === "mediaTotal" ? "mediaTotal" : limitKind];
            return resourceBudgetError(key, stat + size, cap, limitKind);
          },
        });
        // Also applies to injected transports; decoded output is bounded too.
        if (result.body.length > allowedBytes) {
          if (limitKind === "resource")
            rejectBudget(result.body.length, perResource, "resource");
          const stat =
            limitKind === "images"
              ? stats.imageBytes
              : limitKind === "mediaTotal"
                ? stats.mediaBytes
                : limitKind === "nonImages"
                  ? stats.nonImageBytes
                  : stats.transferredBytes;
          const cap =
            limits[limitKind === "mediaTotal" ? "mediaTotal" : limitKind];
          rejectBudget(stat + result.body.length, cap, limitKind);
        }
        if (result.body.length > charged)
          accountBytes(result.body.length - charged);
        const finalKey = keyOf(result.url || key);
        if (!cache.has(finalKey)) cache.set(finalKey, Promise.resolve(result));
        return result;
      } catch (error) {
        failures.set(key, error);
        throw error;
      } finally {
        if (reservationHeld) release({ type, reservation: allowedBytes });
      }
    })();
    cache.set(key, pending);
    return pending;
  }
  return { fetch, failures, stats, limits };
}
module.exports = {
  STRUCTURAL_RESOURCE_LIMITS,
  resourceBudgetError,
  technicalResource,
  createStructuralResourcePolicy,
};
