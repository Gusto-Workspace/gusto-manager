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
  const admissionEvents=[];
  const admissionEvent=(url,type,visible,decision)=>{
    if(admissionEvents.length<2048)admissionEvents.push({sequence:admissionEvents.length+1,atMs:Date.now(),
      sourceHash:require('crypto').createHash('sha256').update(url).digest('hex'),type,visibleMediaObserved:Boolean(visible),
      // Type/visibility can be known online; future DOM obligations cannot.
      obligationEvidence:visible?'visible_video_owner_matching_declaration':'request_type_only',
      selectedSourceCertified:false,decision,admissions:stats.uniqueRequests});
  };
  const cache = new Map(),
    failures = new Map();
  const inflight = new Map(), recoveries = [];
  const stats = {
    transferredBytes: 0,
    imageBytes: 0,
    nonImageBytes: 0,
    mediaBytes: 0,
    uniqueRequests: 0,
    cacheHits: 0,
    skippedTechnical: 0,
    videoRangeRequests: 0,
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
    const cacheKey = options.byteRange ? `${key}#range=${options.byteRange.start}-${options.byteRange.end}` : key;
    if (technicalResource(key, type)) {
      stats.skippedTechnical++;
      return null;
    }
    if (cache.has(cacheKey)) {
      stats.cacheHits++;
      return cache.get(cacheKey);
    }
    // Bound queued promises/cache entries too, not just active downloads.
    if (stats.uniqueRequests >= limits.requests) {
      admissionEvent(key,type,visible,'refused_requests');
      throw resourceBudgetError(
        key,
        stats.uniqueRequests + 1,
        limits.requests,
        "requests",
      );
    }
    stats.uniqueRequests++;
    admissionEvent(key,type,visible,'admitted');
    const perResource =
      type === "image"
        ? limits.image
        : type === "document"
          ? limits.document
          : type === "media"
            ? Math.min(limits.media, options.byteRange ? options.byteRange.end-options.byteRange.start+1+65536 : limits.media)
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
        const effectiveDeadline = () => Math.min(options.deadline || Date.now()+25000,
          options.captureDeadline?.() || Infinity);
        const settings = {
          ...options,
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
        };
        let result, attemptCharged=charged;
        try {
          result = await fetchResource(key, {...settings,deadline:effectiveDeadline(),maxBytes:allowedBytes});
        } catch (error) {
          const recoverable = ['ECONNRESET','ETIMEDOUT','EAI_AGAIN'].includes(error.code) ||
            (error.code==='ABORT_ERR'&&error.cause?.name==='TimeoutError');
          // A main-document GET has not reached Chromium yet. Recover only a
          // certified transport timeout before headers and any redirect, never
          // a page reload, committed navigation, subframe or unexplained abort.
          const initialDocumentTimeout = type==='document' && options.navigation && !options.allowExternalNavigation &&
            error.code==='ABORT_ERR' && error.cause?.name==='TimeoutError' && error.redirectsObserved===0 &&
            error.transportProof?.responseStarted===false && error.transportProof.signalAborted===true &&
            error.transportProof.abortReason==='TimeoutError';
          // One actual transport recovery, inside the same shared promise. No
          // duplicate browser request, no retry of HTTP/security/budget errors.
          // Reserve enough remaining time for the unchanged 12 s transport cap.
          if(!recoverable||!(['image','script','stylesheet','font'].includes(type)||(type==='media'&&visible)||initialDocumentTimeout)||
            effectiveDeadline()-Date.now()<12000||charged>=allowedBytes||stats.uniqueRequests>=limits.requests)throw error;
          stats.uniqueRequests++;
          const recovery={url:key,range:options.byteRange||null,startedAtMs:Date.now(),
            error:{name:error.name,code:error.code,message:error.message},outcome:'pending'};
          recoveries.push(recovery);
          try {
            attemptCharged=charged;
            result=await fetchResource(key,{...settings,deadline:effectiveDeadline(),maxBytes:allowedBytes-charged});
            recovery.outcome='completed';
          }catch(next){recovery.outcome='failed';recovery.finalError={name:next.name,code:next.code,message:next.message};throw next;}
          finally {recovery.finishedAtMs=Date.now();}
        }
        // Also applies to injected transports; decoded output is bounded too.
        if (result.body.length > allowedBytes-attemptCharged) {
          if (limitKind === "resource")
            rejectBudget(result.body.length+attemptCharged, perResource, "resource");
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
        if (result.body.length > charged-attemptCharged)
          accountBytes(result.body.length - (charged-attemptCharged));
        const finalKey = keyOf(result.url || key);
        if (!options.byteRange && !cache.has(finalKey)) cache.set(finalKey, Promise.resolve(result));
        return result;
      } catch (error) {
        failures.set(key, error);
        throw error;
      } finally {
        inflight.delete(cacheKey);
        if (reservationHeld) release({ type, reservation: allowedBytes });
      }
    })();
    cache.set(cacheKey, pending);
    inflight.set(cacheKey,{url:key,type,promise:pending});
    return pending;
  }
  const videoBytes = new Map(), completedVideos = new Set(), videoReservations = new Map();
  const videoRange = async (url, range, fetchResource, options, visible) => {
    const key=keyOf(url),match=/^bytes=(\d+)-(\d*)$/.exec(range||'bytes=0-');
    if(!match)throw Object.assign(new Error('Plage vidéo non certifiable.'),{code:'structural_video_range_invalid',status:422});
    const start=Number(match[1]),requestedEnd=match[2]?Number(match[2]):start+2*1024*1024-1;
    const end=Math.min(requestedEnd,start+2*1024*1024-1);
    if(!Number.isSafeInteger(start)||!Number.isSafeInteger(end)||end<start)throw Object.assign(new Error('Plage vidéo invalide.'),{code:'structural_video_range_invalid',status:422});
    if(cache.has(`${key}#range=${start}-${end}`))return fetch(url,'media',fetchResource,{...options,byteRange:{start,end}},visible);
    const reserved=end-start+1+65536,cap=Math.min(limits.media,8*1024*1024);
    if((videoBytes.get(key)||0)+(videoReservations.get(key)||0)+reserved>cap)
      throw resourceBudgetError(key,(videoBytes.get(key)||0)+reserved,cap,'videoRepresentative');
    videoReservations.set(key,(videoReservations.get(key)||0)+reserved);
    stats.videoRangeRequests++;
    try {return await fetch(url,'media',async(value,settings)=>{
      let charged=0;
      const result=await fetchResource(value,{...settings,accountBytes:amount=>{
        charged+=amount;videoBytes.set(key,(videoBytes.get(key)||0)+amount);settings.accountBytes(amount);
        if(videoBytes.get(key)>cap)throw resourceBudgetError(key,videoBytes.get(key),cap,'videoRepresentative');
      }});
      // The outer fetch also accounts for injected transports returning a body
      // without streaming callbacks. Keep the per-video ledger equally strict.
      videoBytes.set(key,(videoBytes.get(key)||0)+Math.max(0,(result.body?.length||0)-charged));
      return result;
    },{...options,byteRange:{start,end}},visible);}
    finally {videoReservations.set(key,(videoReservations.get(key)||0)-reserved);}
  };
  const pendingFor=(urls,awaitsDocumentLoad=false,awaitsActiveImageSource=false)=>{
    const requested=new Set(urls.filter(Boolean).map(keyOf));
    return [...inflight.values()].filter(item=>requested.has(item.url)||
      (awaitsActiveImageSource&&item.type==='image')||
      (awaitsDocumentLoad&&['document','script','stylesheet','font','image'].includes(item.type)));
  };
  return { fetch, videoRange, completedVideos, videoBytes, failures, stats, limits, pendingFor, recoveries,
    admissionTrace:()=>({version:1,policy:'unchanged',events:admissionEvents.map(e=>({...e})),truncated:admissionEvents.length>=2048}) };
}
module.exports = {
  STRUCTURAL_RESOURCE_LIMITS,
  resourceBudgetError,
  technicalResource,
  createStructuralResourcePolicy,
};
