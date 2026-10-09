/* global document, window, innerWidth, innerHeight, getComputedStyle */
const { randomUUID, createHash } = require("crypto");
const sharp = require("sharp");
const { sanitizeStructuralCapture } = require("./capture-sanitization.service");
const {verifyConsentBackdrops,restoreConsentBackdrops}=require('./structural-consent-backdrop.service');
const {
  waitForPortfolioImages,
  synchronizeUnavailableExternalEmbeds,
} = require("./portfolio-capture.service");
const COVERAGE_VERSION = 2;
const MAX_PAGE_HEIGHT = 50000;
const MAX_STEPS = 120;
const CAPTURE_BUDGET_MS = 120000;
const SAMPLE_ROLES = ["top", "upper", "middle", "lower", "bottom"];
const {
  selectionConfig, selectStructuralObservations, structuralObservationDOM,
} = require("./structural-observation-selection");
const {createVisionCleanupController}=require("./structural-vision-cleanup.service");
const { createAnimatedCaptureController } = require("./structural-animated-components");
const { createCaptureProfile } = require("./structural-capture-profile");
const { collectReliabilityMeasurement, buildReliabilityRegistry, applyReliabilityRegistry } = require("./structural-reliability.service");
const OBSERVATION_SEQUENCING = "phase_a_fixed_pool_v1";
const {waitForMainPaint,mainPaintDOM,bufferPaintProof,assertPaintedBatch}=require('./structural-paint.service');
const {inspectVisibleVideoDOM,restoreVideoDOM,verifyVideoDOM}=require('./structural-video.service');
const {inspectCaptureImagesDOM}=require('./capture-image-visibility');
const {inspectMediaEvidence,summarizeMediaEvidence}=require('./structural-media-evidence');
const {buildObservationTrace}=require('./structural-observation-trace');

function optionalObservationBudget(remainingMs, measuredCosts, possibleRecaptures = 0) {
  // Keep the existing minimum, but learn the cost of a complete operation from
  // this page. Reserve an equivalent operation for finalization and each
  // possible persistent-layer recapture. This never extends the deadline.
  const estimatedCaptureMs = Math.max(1500, ...measuredCosts);
  const reserveMs = estimatedCaptureMs * (1 + possibleRecaptures);
  const requiredMs = estimatedCaptureMs + reserveMs;
  return { admitted: remainingMs > requiredMs, remainingMs, estimatedCaptureMs, reserveMs, requiredMs };
}

async function structuralStoryboard(views, viewport) {
  const bandHeight = 68;
  const width = viewport.width;
  const panelHeight = viewport.height + bandHeight;
  const lastPosition = views.at(-1).position || 1;
  const layers = views.flatMap((view, index) => {
    const label = `OBSERVATION ${index + 1}/${views.length}   ${SAMPLE_ROLES[index].toUpperCase()}   SCROLL ${Math.round((view.position / lastPosition) * 100)} %   ${view.position} px`;
    const heading = Buffer.from(
      `<svg width="${width}" height="${bandHeight}" xmlns="http://www.w3.org/2000/svg"><rect width="100%" height="100%" fill="white"/><rect y="0" width="100%" height="3" fill="#222"/><text x="24" y="44" font-family="sans-serif" font-size="24" font-weight="bold" fill="#222">${label}</text></svg>`,
    );
    return [
      { input: heading, left: 0, top: index * panelHeight },
      {
        input: view.buffer,
        left: 0,
        top: index * panelHeight + bandHeight,
      },
    ];
  });
  return sharp({
    create: {
      width,
      height: panelHeight * views.length,
      channels: 3,
      background: "white",
    },
  })
    .composite(layers)
    .png()
    .toBuffer();
}

async function traversalStoryboard(views, viewport, totalHeight) {
  // The file is already at its prepared width. Store the actual rounded panel
  // size and location, including label bands; projection never uses a label.
  const width = 720, columns = 3, panelWidth = 240, band = 24;
  const panelHeight = Math.round(viewport.height * panelWidth / viewport.width);
  const height = Math.ceil(views.length / columns) * (panelHeight + band);
  const panels = [], layers = [];
  for (const [i, view] of views.entries()) {
    const x = (i % columns) * panelWidth, y = Math.floor(i / columns) * (panelHeight + band);
    const label = `${i + 1} | ${view.position}-${Math.min(totalHeight, view.position + view.visibleHeight)} px`;
    layers.push({ input: Buffer.from(`<svg width="240" height="24" xmlns="http://www.w3.org/2000/svg"><rect width="100%" height="100%" fill="white"/><text x="6" y="17" font-family="sans-serif" font-size="12" fill="#222">${label}</text></svg>`), left: x, top: y });
    layers.push({ input: await sharp(view.buffer).resize(panelWidth, panelHeight, { fit: "fill" }).png().toBuffer(), left: x, top: y + band });
    panels.push({ observationId: view.id, position: view.position, visibleRangePx: [view.position, Math.min(totalHeight, view.position + view.visibleHeight)],
      rect: { x, y: y + band, width: panelWidth, height: panelHeight },
      scale: Math.min(panelWidth / viewport.width, panelHeight / viewport.height), stabilized: true });
  }
  const buffer = await sharp({ create: { width, height, channels: 3, background: "white" } }).composite(layers).png().toBuffer();
  return { buffer, width, height, panels, complete: true };
}

// Samples visible visual elements after scrolling. CSS motion is cancelled by
// Playwright at screenshot time; this checks JS-driven transforms separately.
function visualMotionDOM() {
  const result = [];
  let index = 0;
  for (const node of document.querySelectorAll("body *")) {
    const style = getComputedStyle(node);
    const containsVisualMedia =
      node.matches("img,picture,video,canvas,svg") ||
      Boolean(node.querySelector("img,picture,video,canvas,svg")) ||
      style.backgroundImage !== "none";
    // Track any transformed visual. Only image-bearing compositions drive the
    // blocking stability gate; small decorative transforms select sampled mode.
    const visual =
      node.matches("img,picture,video,canvas,svg") ||
      style.transform !== "none";
    if (!visual || style.display === "none" || style.visibility === "hidden")
      continue;
    // A closed menu/carousel can keep moving invisible images. They are not
    // part of the observed composition and must not block stabilization either.
    if (
      node.checkVisibility &&
      !node.checkVisibility({ checkOpacity: true, checkVisibilityCSS: true })
    )
      continue;
    // Chromium disables CSS/Web Animations for the final screenshot after the
    // warm-up; don't let their descendants keep the DOM stability gate open.
    let cssAnimatedAncestor = false;
    for (let parent = node; parent; parent = parent.parentElement) {
      if (getComputedStyle(parent).animationName !== "none") {
        cssAnimatedAncestor = true;
        break;
      }
    }
    if (cssAnimatedAncestor) continue;
    let clipped = false;
    for (let parent = node; parent; parent = parent.parentElement) {
      const polygon =
        getComputedStyle(parent).clipPath.match(/^polygon\((.*)\)$/);
      if (!polygon) continue;
      const points = polygon[1]
        .split(",")
        .map((point) => point.trim().split(/\s+/).map(parseFloat));
      if (
        points.length >= 3 &&
        points.every(
          (point) => point.length === 2 && point.every(Number.isFinite),
        ) &&
        Math.abs(
          points.reduce((area, point, i) => {
            const next = points[(i + 1) % points.length];
            return area + point[0] * next[1] - next[0] * point[1];
          }, 0),
        ) < 0.001
      ) {
        clipped = true;
        break;
      }
    }
    if (clipped) continue;
    const rect = node.getBoundingClientRect();
    if (
      rect.width < 60 ||
      rect.height < 60 ||
      rect.width > innerWidth * 2 ||
      rect.height > innerHeight * 2 ||
      rect.right <= 0 ||
      rect.left >= innerWidth ||
      rect.bottom <= 0 ||
      rect.top >= innerHeight
    )
      continue;
    // Infinite CSS motion is neutralized by screenshot({ animations: 'disabled' }).
    if (style.animationName !== "none") continue;
    let key = node.getAttribute("data-gusto-motion-key");
    if (!key) {
      key = `motion-${++index}-${Math.random().toString(36).slice(2)}`;
      node.setAttribute("data-gusto-motion-key", key);
    }
    result.push({
      key,
      tag: node.tagName.toLowerCase(),
      id: node.id || "",
      className:
        typeof node.className === "string" ? node.className.slice(0, 160) : "",
      top: Math.round(rect.top * 2) / 2,
      left: Math.round(rect.left * 2) / 2,
      width: Math.round(rect.width * 2) / 2,
      height: Math.round(rect.height * 2) / 2,
      prominence:
        containsVisualMedia &&
        rect.width * rect.height >= innerWidth * innerHeight * 0.08,
      transform: style.transform,
      opacity: style.opacity,
    });
    if (result.length >= 120) break;
  }
  return result;
}

function scrollDOM({ mode, token, key, target = 0 }) {
  const nodes = [document.body, ...document.querySelectorAll("body *")].filter(
    Boolean,
  );
  const doc = document.scrollingElement || document.documentElement;
  const geometry = (node) => {
    const rect = node.getBoundingClientRect(),
      style = getComputedStyle(node);
    return {
      top: rect.top,
      left: rect.left,
      width: rect.width,
      height: rect.height,
      overflow: style.overflowY,
      transform: style.transform,
      scrollHeight: node.scrollHeight,
      clientHeight: node.clientHeight,
      scrollTop: node.scrollTop,
    };
  };
  if (mode === "identify") {
    const candidates = [];
    for (const node of nodes) {
      if (
        node.matches(
          'header,nav,footer,dialog,[role="dialog"],[aria-modal="true"]',
        ) ||
        node.closest("[data-gusto-cmp-root],[data-gusto-popup-root]")
      )
        continue;
      const box = geometry(node);
      if (
        box.width < innerWidth * 0.6 ||
        box.height < innerHeight * 0.5 ||
        box.top >= innerHeight ||
        box.top + box.height <= 0
      )
        continue;
      const container =
        ["auto", "scroll"].includes(box.overflow) &&
        box.scrollHeight > box.clientHeight + 80;
      const visual = box.height > innerHeight * 1.5;
      if (!container && !visual) continue;
      const existing = node.getAttribute("data-gusto-scroll-root");
      const id = existing?.startsWith(token)
        ? existing
        : `${token}-${Math.random().toString(36).slice(2)}`;
      node.setAttribute("data-gusto-scroll-root", id);
      candidates.push({ key: id, container, ...box });
    }
    return {
      candidates,
      documentHeight: Math.max(doc.scrollHeight, document.body.scrollHeight),
      viewport: { width: innerWidth, height: innerHeight },
    };
  }
  const root = key
    ? nodes.find((node) => node.getAttribute("data-gusto-scroll-root") === key)
    : doc;
  if (!root) return null;
  if (mode === "move") {
    const native=window[Symbol.for('gusto.structural.capture.native-scroll')];
    if (key) (native?.elementScrollTo||root.scrollTo).call(root,{ top: target, behavior: "instant" });
    else (native?.windowScrollTo||window.scrollTo).call(window,{ top: target, behavior: "instant" });
  }
  const box = key
    ? geometry(root)
    : {
        top: 0,
        left: 0,
        width: innerWidth,
        height: innerHeight,
        scrollHeight: Math.max(doc.scrollHeight, document.body.scrollHeight),
        clientHeight: innerHeight,
        scrollTop: window.scrollY,
      };
  const headerBottom = [
    ...document.querySelectorAll(
      'header,nav,[role="banner"],[role="navigation"],[class*="header"],[class*="navbar"]',
    ),
  ].reduce((end, node) => {
    const css = getComputedStyle(node),
      rect = node.getBoundingClientRect();
    return ["fixed", "sticky"].includes(css.position) &&
      rect.top <= Math.max(0, box.top) + 4 &&
      rect.height <= innerHeight * 0.22
      ? Math.max(end, Math.min(innerHeight, rect.bottom))
      : end;
  }, 0);
  return {
    ...box,
    documentHeight: Math.max(doc.scrollHeight, document.body.scrollHeight),
    viewport: { width: innerWidth, height: innerHeight },
    headerBottom,
  };
}

const incomplete = (reason, coverage) =>
  Object.assign(
    new Error(`Capture incomplète — analyse non lancée (${reason}).`),
    {
      status: 422,
      code: "incomplete_page_capture",
      captureCoverage: { ...coverage, complete: false, reason },
    },
  );
function coverageIsComplete(reference) {
  const value = reference.captureCoverage;
  const sampled = value?.captureStrategy === "sampled";
  const positions = value?.positions || [];
  if (sampled && value?.version === 3) {
    const storyboard = value.storyboard;
    const panels = storyboard?.panels || [];
    const ordered = [...panels].sort((a, b) => a.position - b.position);
    const unique = new Set(positions.map((p) => p.role));
    return reference.status !== "incomplete_page_capture" && value.complete === true && value.reachedEnd === true &&
      value.distinctViews === true && value.totalHeight > 0 && value.viewportHeight > 0 &&
      storyboard?.complete === true && storyboard.width > 0 && storyboard.height > 0 && ordered.length > 0 && ordered.length <= MAX_STEPS &&
      ordered[0].position === 0 && ordered.at(-1).visibleRangePx[1] >= value.totalHeight - 5 &&
      ordered.every((p, i) => p.stabilized === true && Number.isFinite(p.position) && p.visibleRangePx?.[0] === p.position &&
        p.visibleRangePx[1] > p.position && p.rect?.width > 0 && p.rect?.height > 0 && p.scale > 0 &&
        (!i || p.position <= ordered[i - 1].visibleRangePx[1] + 8)) &&
      positions.length <= 5 && unique.size === positions.length &&
      positions.every((p, i) => /^observation[1-5]$/.test(p.role) && p.stabilized === true &&
        Number.isFinite(p.position) && p.position >= 0 && p.position < value.totalHeight &&
        p.visibleRangePx?.[0] === p.position && p.visibleRangePx[1] > p.position &&
        (!i || p.position > positions[i - 1].position));
  }
  return (
    reference.status !== "incomplete_page_capture" &&
    value?.version === COVERAGE_VERSION &&
    ["continuous", "sampled"].includes(value.captureStrategy) &&
    value.complete === true &&
    value.reachedEnd === true &&
    value.distinctViews === true &&
    (!sampled ||
      (positions.length === SAMPLE_ROLES.length &&
        positions.every(
          (item, index) =>
            item.role === SAMPLE_ROLES[index] &&
            item.stabilized === true &&
            (index === 0 || item.position > positions[index - 1].position),
        ) &&
        positions[0].position === 0 &&
        positions.at(-1).position >=
          value.totalHeight - value.viewportHeight - 5 &&
        new Set(positions.map((item) => item.signature)).size >= 4))
  );
}

async function captureStructuralPage(page, deadline, initial = {}, options = {}) {
  let captureDiagnostics,adaptiveConfig,visionCleanup,sanitation;
  const end = Math.min(deadline, Date.now() + CAPTURE_BUDGET_MS),
    token = randomUUID();
  page.structuralCaptureDeadline=end;
  const coverage = {
    version: COVERAGE_VERSION,
    complete: false,
    reachedEnd: false,
    distinctViews: false,
    strategy: "unknown",
    captureStrategy: "continuous",
    totalHeight: 0,
    viewportHeight: 0,
    positions: [],
  };
  const animated = createAnimatedCaptureController(page,end);
  const animationDiagnostics = [];
  const measuredCaptureCosts = [];
  const startedAt = Date.now();
  let capturePhase = "identify_scroller", lastCapturePosition = null, currentCaptureState, pendingCaptureRecord;
  const profile = createCaptureProfile();
  const paintDiagnostics={readiness:[],buffers:[]};
  const videoDiagnostics={visits:[],restoration:null};
  const imageGateDiagnostics=[];
  const mediaViews=[];
  // Preserve every captured state, including repeated visits at the same y.
  // Candidate pooling may replace a position; it must not erase original evidence.
  const originalViews=[];
  let captureFailure;
  const time = (operation, work, details) => profile.time(operation, work, { position: lastCapturePosition, ...details });
  const phase = (name) => { capturePhase = name; profile.phase(name); };
  const screenshot = async (settings, purpose = "viewport") => {
    let videoProofs=[];
    const work=async()=>{
      await verifyConsentBackdrops(page);
      if(purpose==='viewport') {
        // Inspect the actual cleaned state about to be captured, never infer
        // obligations from an unmeasurable geometric descriptor or iframe.
        const rows=await page.evaluate(inspectCaptureImagesDOM,{visibleOnly:true,diagnostics:true});
        mediaViews.push(inspectMediaEvidence(rows,{position:lastCapturePosition,origin:capturePhase,videoFrames:videoProofs.length}));
        coverage.mediaEvidence=summarizeMediaEvidence(mediaViews);
      }
      const buffer=await time("screenshot",()=>page.screenshot(settings),{purpose});
      await verifyConsentBackdrops(page);
      if(videoProofs.length){const integrity=await page.evaluate(verifyVideoDOM,videoProofs);
        if(!integrity.valid)throw Object.assign(new Error('Frame vidéo modifiée pendant la capture.'),{status:422,code:'structural_video_freeze_invalid',videoIntegrity:integrity});}
      if(purpose==='viewport') {
        const proof=await time('paint_buffer_gate',()=>bufferPaintProof(buffer));
        paintDiagnostics.buffers.push({position:lastCapturePosition,...proof});
        if(!proof.nonUniform&&(await page.evaluate(mainPaintDOM)).paintedText>0)
          throw Object.assign(new Error('Contenu déclaré peint mais buffer invisible : capture refusée.'),{status:422,code:'structural_empty_visual_capture',paintProofs:[proof]});
      }
      return buffer;
    };
    if(purpose!=="viewport")return work(); // discarded transition-completion witness
    const state=currentCaptureState;
    const origin=capturePhase==="mandatory_traversal"?"traversal":capturePhase==="fixed_samples"?"fixed":"final";
    const args={position:state.position,regionTop:state.regionTop,regionBottom:state.regionBottom,config:adaptiveConfig};
    await verifyAnimation();
    const videoInspection=await time('video_frame_gate',()=>page.evaluate(inspectVisibleVideoDOM));
    if(!videoInspection.valid)throw Object.assign(new Error(videoInspection.reason),{videoGateFailure:videoInspection});
    videoProofs=videoInspection.views;
    videoDiagnostics.visits.push({position:lastCapturePosition,views:videoProofs});
    let measures;
    if(origin!=="final"){
      pendingCaptureRecord=await time("spatial_collection",()=>collectReliabilityMeasurement(page,args,{state,origin}));
      measures=pendingCaptureRecord.measures;
    }else measures=await time("spatial_collection",()=>page.evaluate(structuralObservationDOM,args));
    const buffer=await visionCleanup.capture(measures.positioned,state,origin,work);
    const original={id:`state${String(originalViews.length+1).padStart(4,'0')}`,buffer,measures,
      origin,capturedAt:new Date().toISOString(),position:state.position,
      visibleRangePx:[state.position,Math.min(state.totalHeight,state.position+state.visibleHeight)],
      viewport:state.viewport,sourceCrop:{left:0,top:state.regionTop,width:state.viewport.width,height:state.visibleHeight},
      stabilized:true,sampledState:true,sectionIdentity:'unknown',
      mediaEvidence:mediaViews.at(-1),suppressedLayers:visionCleanup.visits.at(-1)?.suppressed||[],
      externalEmbeds:[...(page.structuralExternalEmbeds?.values()||[])]};
    originalViews.push(original);
    await options.onOriginalObservation?.(original);
    return buffer;
  };
  const waitImages = () => time("image_gate", async () => {
    let result=await waitForPortfolioImages(page,end,{visibleOnly:true});
    const pending=page.structuralResourcePolicy?.pendingFor(
      result.pendingUrls||[],result.awaitsDocumentLoad,result.awaitsActiveImageSource)||[];
    if(result.pending&&pending.length&&Date.now()<end){
      const previous=result.diagnostics,settledAt=Date.now();let timer;
      // Let already queued/transferring visible media settle once. This is not
      // a longer local image gate or a second download. Always re-run the same
      // decode gate afterwards, within the original capture deadline.
      try {await time('visible_transport_settlement',()=>Promise.race([
        Promise.allSettled(pending.map(p=>p.promise)),
        new Promise(resolve=>{timer=setTimeout(resolve,Math.max(1,end-Date.now()));}),
      ]));}finally{clearTimeout(timer);}
      result=await waitForPortfolioImages(page,end,{visibleOnly:true});
      if(result.diagnostics)result.diagnostics.transportSettlement={waitedMs:Date.now()-settledAt,
        urls:[...new Set(pending.map(p=>p.url))],awaitsDocumentLoad:previous?.resources.some(r=>r.awaitsDocumentLoad),previousGate:previous};
    }
    if(result.diagnostics)imageGateDiagnostics.push({phase:capturePhase,position:lastCapturePosition,
      ...result.diagnostics,captureRemainingMs:Math.max(0,end-Date.now()),captureBudgetMs:CAPTURE_BUDGET_MS});
    return result;
  });
  const syncEmbeds = () => time("embed_synchronization", () => synchronizeUnavailableExternalEmbeds(page));
  const restoreAnimation = () => time("animation_restore", () => animated.restore());
  const verifyAnimation = async () => {
    const integrity=await time("animation_integrity", () => animated.verify());
    if(!integrity.valid) throw Object.assign(incomplete(`gel animé non conforme : ${integrity.failures.join(', ')}`,coverage),
      { animationIntegrity: integrity });
  };
  try {
  sanitation = initial.captureSanitization;
  adaptiveConfig = selectionConfig({
    ...(process.env.GUSTO_STRUCTURAL_SELECTION_THRESHOLD !== undefined
      ? { threshold: Number(process.env.GUSTO_STRUCTURAL_SELECTION_THRESHOLD) } : {}),
    ...(process.env.GUSTO_STRUCTURAL_MACRO_CANVAS_WIDTH || process.env.GUSTO_STRUCTURAL_MACRO_CANVAS_HEIGHT
      ? { macroCanvas: { width: Number(process.env.GUSTO_STRUCTURAL_MACRO_CANVAS_WIDTH || 512),
        height: Number(process.env.GUSTO_STRUCTURAL_MACRO_CANVAS_HEIGHT || 512) } } : {}),
    ...options.selectionConfig,
  });
  visionCleanup=createVisionCleanupController(page,{token,config:adaptiveConfig,time});
  const observations = [];
  // All actual visits retain reliability evidence, independent of deduplication
  // of the artistic pool. An optional recorder exposes the same evidence locally.
  const observationTrace = options.observationTrace || {};
  observationTrace.reliabilityRecords = [];
  if (observationTrace) {
    observationTrace.config = adaptiveConfig;
    observationTrace.phaseA = [];
    observationTrace.fixedViews = [];
  }
  const remember = async (buffer, state, origin) => {
    try {
    await verifyAnimation();
    // The same raw descriptor/registry inspection is taken immediately before
    // temporary masking. Scores and reliability never use the hidden DOM.
    const record=pendingCaptureRecord;
    pendingCaptureRecord=null;
    if(!record||record.origin!==origin||record.position!==state.position)throw incomplete("preuve DOM de capture manquante",coverage);
    observationTrace.reliabilityRecords.push(record);
    const measures = record.measures;
    const animatedComponents=animated.components();
    const entry = { buffer, measures, animatedComponents, position: state.position, visibleHeight: state.visibleHeight, stabilized: true, origin };
    await verifyAnimation();
    if (observationTrace && origin === "traversal") observationTrace.phaseA.push({
      ...entry, observedTotalHeight: state.totalHeight,
      capturedElapsedMs: Date.now() - startedAt, afterCompleteTraversal: false,
    });
    if(animatedComponents.length) animationDiagnostics.push({position:state.position,origin,...animated.diagnostic()});
    const existing = observations.findIndex((v) => Math.abs(v.position - state.position) < 2);
    if (existing >= 0) observations[existing] = entry;
    else observations.push(entry);
    return entry;
    } finally { await restoreAnimation(); }
  };
  const check = async () => {
    try {
      // A late widget must be cleared at this scroll position, without a new
      // full-page warm-up that would move the native scroller under the stitch.
      const result = await time("sanitization", () => sanitizeStructuralCapture(page, deadline, {
        rewarm: false,
      }));
      const latest = result.captureSanitization;
      sanitation = {
        ...latest,
        consentDetected: Boolean(
          sanitation?.consentDetected || latest.consentDetected,
        ),
        consentAction:
          latest.consentAction !== "none"
            ? latest.consentAction
            : sanitation?.consentAction || "none",
        consentMethod:
          latest.consentMethod !== "none"
            ? latest.consentMethod
            : sanitation?.consentMethod || "none",
        consentHasBackdrop: Boolean(
          sanitation?.consentHasBackdrop || latest.consentHasBackdrop,
        ),
        consentLabel: latest.consentLabel || sanitation?.consentLabel || "",
        popupDetected: Boolean(
          sanitation?.popupDetected || latest.popupDetected,
        ),
        popupDismissed:
          latest.popupDismissed || sanitation?.popupDismissed || false,
        popupActions: [
          ...(sanitation?.popupActions || []),
          ...(latest.popupActions || []),
        ].slice(-8),
      };
      sanitation.cookieOverlayDetected = sanitation.consentDetected;
      sanitation.cookieOverlayDismissed =
        sanitation.consentDetected && !latest.blockingOverlayDetected;
    } catch (error) {
      error.captureCoverage = { ...coverage, complete: false };
      throw error;
    }
  };
  paintDiagnostics.readiness.push(await time('main_paint_readiness',()=>waitForMainPaint(page,end,{requireContent:true})));
  const identified = await page.evaluate(scrollDOM, {
    mode: "identify",
    token,
  });
  await page.emulateMedia({ reducedMotion: "reduce" });
  const container =
    identified.documentHeight <= identified.viewport.height * 1.2
      ? identified.candidates
          .filter((item) => item.container)
          .sort((a, b) => b.scrollHeight - a.scrollHeight)[0]
      : null;
  let key = container?.key,
    strategy = container ? "scroll_container" : "document",
    baseTop = 0;
  const raw = () => time("scroller_measure", () => page.evaluate(scrollDOM, { mode: "measure", key }));
  const wheel = async (delta) => {
    await page.mouse.move(
      identified.viewport.width / 2,
      identified.viewport.height / 2,
    );
    await page.mouse.wheel(0, delta);
  };
  const direct = async (target) => {
    await page.evaluate(scrollDOM, { mode: "move", key, target });
  };
  if (!container) {
    await direct(Math.round(identified.viewport.height * 0.5));
    await page.waitForTimeout(200);
    const probe = await raw();
    if (probe.scrollTop < 10 && identified.candidates.length) {
      const before = identified.candidates;
      await wheel(identified.viewport.height * 0.7);
      await page.waitForTimeout(500);
      const after = await page.evaluate(scrollDOM, { mode: "identify", token });
      const moved = before
        .map((candidate) => ({
          ...candidate,
          movement:
            candidate.top -
            (after.candidates.find((item) => item.key === candidate.key)?.top ??
              candidate.top),
        }))
        .filter((candidate) => candidate.movement > 20)
        .sort((a, b) => b.height - a.height)[0];
      if (moved) {
        key = moved.key;
        strategy = "smooth_scroll";
      } else throw incomplete("scroller sans déplacement observable", coverage);
    }
  }
  const settle = () => time("scroll_stability", async () => {
    let state = await raw(),
      quiet = 0;
    for (let i = 0; i < 14 && quiet < 3; i++) {
      await page.waitForTimeout(75);
      const next = await raw();
      if (!next) throw incomplete("scroller disparu", coverage);
      quiet =
        Math.abs(next.top - state.top) < 2 &&
        Math.abs(next.scrollTop - state.scrollTop) < 2
          ? quiet + 1
          : 0;
      state = next;
    }
    if (quiet < 3) throw incomplete("scroll non stabilisé", coverage);
    return state;
  });
  const visualHistory = new Map();
  let scrollMotionDetected = false;
  const stabilizeVisuals = () => time("visual_stability", async () => {
    paintDiagnostics.readiness.push({position:lastCapturePosition,...await time('main_paint_readiness',()=>waitForMainPaint(page,end))});
    // Normal warm-up precedes this point. Pin only measured stable-envelope
    // galleries, then apply the existing visual gate to their actual DOM state.
    if((await time("animation_detection_and_freeze", () => animated.freeze())).length) scrollMotionDetected=true;
    const observations = () => time("visual_measure", () => page.evaluate(visualMotionDOM));
    const prominent = (items) => items.filter((item) => item.prominence);
    let allPrevious = await observations();
    let previous = prominent(allPrevious);
    let quiet = 0;
    // Bounded grace for real transitions, without accepting moving compositions.
    for (let i = 0; i < 45 && quiet < 3 && Date.now() < end; i++) {
      await page.waitForTimeout(90);
      const allCurrent = await observations();
      const smallBefore = new Map(
        allPrevious
          .filter((item) => !item.prominence)
          .map((item) => [item.key, item]),
      );
      if (
        allCurrent.some(
          (item) =>
            !item.prominence &&
            smallBefore.has(item.key) &&
            (Math.abs(smallBefore.get(item.key).top - item.top) > 1 ||
              Math.abs(smallBefore.get(item.key).left - item.left) > 1 ||
              smallBefore.get(item.key).transform !== item.transform),
        )
      ) {
        // Small autoplaying decorative media is coherent in an atomic local
        // screenshot, but makes a stitched image misleading: prefer sampled.
        scrollMotionDetected = true;
      }
      const current = prominent(allCurrent);
      const old = new Map(previous.map((item) => [item.key, item]));
      const stable = current.every((item) => {
        const before = old.get(item.key);
        return (
          before &&
          Math.abs(before.top - item.top) <= 1 &&
          Math.abs(before.left - item.left) <= 1 &&
          Math.abs(before.width - item.width) <= 1 &&
          Math.abs(before.height - item.height) <= 1 &&
          before.transform === item.transform &&
          before.opacity === item.opacity
        );
      });
      quiet = stable ? quiet + 1 : 0;
      allPrevious = allCurrent;
      previous = current;
    }
    if (quiet < 3) {
      // The warm-up has already completed. Let Chromium finish CSS transitions
      // for this diagnostic frame, then require three stable DOM observations.
      await screenshot({
        type: "png",
        fullPage: false,
        animations: "disabled",
        timeout: Math.min(10000, Math.max(1, end - Date.now())),
      }, "css_transition_completion");
      allPrevious = await observations();
      previous = prominent(allPrevious);
      quiet = 0;
      for (let i = 0; i < 24 && quiet < 3 && Date.now() < end; i++) {
        await page.waitForTimeout(90);
        const allCurrent = await observations();
        const current = prominent(allCurrent);
        const old = new Map(previous.map((item) => [item.key, item]));
        const stable = current.every((item) => {
          const before = old.get(item.key);
          return (
            before &&
            Math.abs(before.top - item.top) <= 1 &&
            Math.abs(before.left - item.left) <= 1 &&
            Math.abs(before.width - item.width) <= 1 &&
            Math.abs(before.height - item.height) <= 1 &&
            before.transform === item.transform &&
            before.opacity === item.opacity
          );
        });
        quiet = stable ? quiet + 1 : 0;
        allPrevious = allCurrent;
        previous = current;
      }
    }
    if (quiet < 3)
      throw incomplete("éléments visuels non stabilisés", coverage);
    await verifyAnimation();
    for (const item of allPrevious) {
      const earlier = visualHistory.get(item.key);
      if (earlier && earlier.transform !== item.transform)
        scrollMotionDetected = true;
      visualHistory.set(item.key, item);
    }
  });
  if (strategy === "smooth_scroll") {
    await wheel(-MAX_PAGE_HEIGHT * 2);
    await settle();
  } else {
    await direct(0);
    await settle();
  }
  baseTop = (await raw()).top;
  const measure = async () => {
    const data = await raw();
    if (!data) throw incomplete("scroller disparu", coverage);
    const position = Math.max(
      0,
      Math.round(
        strategy === "smooth_scroll" ? baseTop - data.top : data.scrollTop,
      ),
    );
    const totalHeight = Math.round(
      strategy === "smooth_scroll"
        ? Math.max(data.height, data.scrollHeight)
        : data.scrollHeight,
    );
    const regionTop =
      strategy === "smooth_scroll"
        ? Math.max(0, baseTop)
        : Math.max(0, data.top);
    const regionBottom =
      strategy === "document" || strategy === "smooth_scroll"
        ? data.viewport.height
        : Math.min(data.viewport.height, data.top + data.clientHeight);
    const measured = {
      ...data,
      position,
      totalHeight,
      visibleHeight: Math.round(regionBottom - regionTop),
      regionTop: Math.round(regionTop),
      regionBottom: Math.round(regionBottom),
    };
    currentCaptureState=measured;
    return measured;
  };
  const move = (target) => time("scroll_and_settle", async () => {
    const state = await measure();
    if (strategy === "smooth_scroll") await wheel(target - state.position);
    else await direct(target);
    await settle();
    return measure();
  }, { target });
  let state = await measure();
  coverage.strategy = strategy;
  coverage.viewportHeight = state.visibleHeight;
  if (state.visibleHeight < 100)
    throw incomplete("viewport du scroller trop petit", coverage);
  const tiles = [];
  let covered = 0,
    bottomStable = 0,
    firstViewport,
    lastViewport;
  for (let step = 0; step < MAX_STEPS && Date.now() < end; step++) {
    const stepStartedAt = Date.now();
    phase("mandatory_traversal");
    await check(); // popups can appear after scroll; no contaminated tile is admitted.
    state = await measure();
    lastCapturePosition = state.position;
    coverage.totalHeight = state.totalHeight;
    if (state.totalHeight > MAX_PAGE_HEIGHT)
      throw incomplete("limite de hauteur atteinte", coverage);
    const images = await waitImages();
    if (images.failed || images.pending)
      throw incomplete("images non chargées", coverage);
    await stabilizeVisuals();
    await check();
    await syncEmbeds();
    // Capture actual viewports, never rely on fullPage for an internal/JS scroller.
    const image = await screenshot({
      type: "png",
      fullPage: false,
      animations: "disabled",
      timeout: Math.min(25000, Math.max(1, end - Date.now())),
    });
    await remember(image, state, "traversal");
    firstViewport ||= image;
    lastViewport = image;
    const top =
      step === 0
        ? state.regionTop
        : Math.max(state.regionTop, Math.round(state.headerBottom));
    const start = state.position + top - state.regionTop,
      height = state.regionBottom - top;
    if (start > covered + 8 || height < 1)
      throw incomplete("intervalle non parcouru", coverage);
    if (start + height > covered) {
      const trim = Math.max(0, covered - start);
      const buffer = await sharp(image)
        .extract({
          left: 0,
          top: top + trim,
          width: state.viewport.width,
          height: height - trim,
        })
        .png()
        .toBuffer();
      tiles.push({ buffer, top: covered });
      covered = start + height;
    }
    const bottom = Math.max(0, state.totalHeight - state.visibleHeight);
    if (state.position >= bottom - 5 && covered >= state.totalHeight - 5) {
      const oldHeight = state.totalHeight;
      await page.waitForTimeout(250);
      const next = await measure();
      bottomStable = next.totalHeight <= oldHeight + 4 ? bottomStable + 1 : 0;
      if (bottomStable >= 3) {
        coverage.reachedEnd = true;
        measuredCaptureCosts.push(Date.now() - stepStartedAt);
        break;
      }
    } else bottomStable = 0;
    const nextTarget = Math.min(
      bottom,
      state.position + Math.max(50, Math.round(state.visibleHeight * 0.65)),
    );
    const next = await move(nextTarget);
    if (next.position <= state.position + 2 && state.position < bottom - 5)
      throw incomplete("scroll bloqué avant la fin", coverage);
    measuredCaptureCosts.push(Date.now() - stepStartedAt);
  }
  if (!coverage.reachedEnd)
    throw incomplete("fin non atteinte dans le budget de capture", coverage);
  if (observationTrace) observationTrace.phaseAContext = {
    totalHeight: coverage.totalHeight, viewportHeight: coverage.viewportHeight,
    viewport: state.viewport, strategy, reachedEnd: coverage.reachedEnd,
    coveredPx: covered, bottomConfirmations: bottomStable,
    scrollMotionDetected, endedElapsedMs: Date.now() - startedAt,
  };
  // Revisit five distributed positions after lazy content has stabilized.
  const views = [];
  for (const [index, fraction] of [0, 0.2, 0.5, 0.8, 1].entries()) {
    const sampleStartedAt = Date.now();
    phase("fixed_samples");
    if (Date.now() >= end)
      throw incomplete("budget de capture dépassé", coverage);
    const target = Math.round(
      Math.max(0, coverage.totalHeight - state.visibleHeight) * fraction,
    );
    state = await move(target);
    lastCapturePosition = state.position;
    await check();
    state = await measure();
    if (Math.abs(state.position - target) > state.visibleHeight * 0.2)
      throw incomplete("position de lecture non atteinte", coverage);
    if (Math.abs(state.totalHeight - coverage.totalHeight) > 8)
      throw incomplete("longueur encore instable", coverage);
    const images = await waitImages();
    if (images.failed || images.pending)
      throw incomplete("images non chargées", coverage);
    await stabilizeVisuals();
    await check();
    await syncEmbeds();
    const image = await screenshot({
      type: "png",
      fullPage: false,
      animations: "disabled",
      timeout: Math.min(25000, Math.max(1, end - Date.now())),
    });
    const signature = createHash("sha256")
      .update(
        await sharp(image).resize(64, 64, { fit: "fill" }).raw().toBuffer(),
      )
      .digest("hex");
    const observation = await remember(image, state, "fixed");
    views.push({ ...observation, index, signature });
    if (observationTrace) observationTrace.fixedViews.push({ ...observation, index, signature,
      observedTotalHeight: state.totalHeight, capturedElapsedMs: Date.now() - startedAt,
      afterCompleteTraversal: true });
    measuredCaptureCosts.push(Date.now() - sampleStartedAt);
  }
  await time('paint_batch_gate',()=>assertPaintedBatch(views.map(v=>v.buffer)));
  coverage.paintEvidence={version:1,complete:true,verifiedViewports:paintDiagnostics.buffers.length};
  const longPage = coverage.totalHeight > state.visibleHeight * 1.5;
  const selected = [views[0], views[2], views[4]];
  coverage.scrollMotionDetected = scrollMotionDetected;
  coverage.captureStrategy = scrollMotionDetected ? "sampled" : "continuous";
  coverage.distinctViews =
    !longPage ||
    (new Set(selected.map((view) => view.signature)).size === 3 &&
      selected[2].position - selected[0].position >= state.visibleHeight * 0.5);
  coverage.positions = views.map((view) => ({
    role: SAMPLE_ROLES[view.index],
    position: view.position,
    progressPercent: Math.round(
      (view.position / Math.max(1, views.at(-1).position)) * 100,
    ),
    stabilized: true,
    signature: view.signature,
  }));
  if (!coverage.distinctViews)
    throw incomplete("vues haut/milieu/bas identiques", coverage);
  if (
    coverage.captureStrategy === "sampled" &&
    !coverageIsComplete({
      captureCoverage: { ...coverage, complete: true, reachedEnd: true },
    })
  )
    throw incomplete("échantillons locaux incomplets ou redondants", coverage);
  const registry = await time("reliability_aggregation", () => buildReliabilityRegistry(
    observationTrace.reliabilityRecords, adaptiveConfig, [...observationTrace.phaseA, ...observationTrace.fixedViews]));
  captureDiagnostics = { version: 1, sequencing: OBSERVATION_SEQUENCING, registry,
    coverageWitnesses:observationTrace.reliabilityRecords.map(r=>({origin:r.origin,position:r.position,...r.measures.coverageWitnesses})),
    fixedControls: observationTrace.fixedViews.map(({ buffer, measures, animatedComponents, ...v }) => v),
    deliveries: [], finalRecaptures: 0, freshnessRecaptures: 0,
    visionCleanup:{visits:visionCleanup.visits},paint:paintDiagnostics,video:videoDiagnostics,imageGates:imageGateDiagnostics };
  if (coverage.captureStrategy === "sampled" || options.diagnostic) {
    // Only actually observed Phase A + post-traversal fixed positions enter
    // the pool. Never visit or extrapolate optional boundary candidates.
    const lastScroll = Math.max(0, coverage.totalHeight - state.visibleHeight);
    const optionalBudget = { requested: 0, captured: 0, exhausted: false, skipped: [] };
    coverage.optionalCandidateBudget = optionalBudget;
    phase("storyboard_and_selection");
    observations.sort((a, b) => a.position - b.position);
    observations.forEach((v, i) => { v.id = `candidate${i + 1}`; v.domOrder = i;
      v.visibleRangePx = [v.position, Math.min(coverage.totalHeight, v.position + v.visibleHeight)]; });
    const storyboard = await time("storyboard_generation", () => traversalStoryboard(observations, state.viewport, coverage.totalHeight));
    const fixedIds = views.map((v) => observations.find((o) => Math.abs(o.position - v.position) < 2).id);
    const input = { candidates: observations.map(({ buffer, ...v }) => v), fixedIds,
      adaptiveBudgetExhausted: optionalBudget.exhausted,
      storyboard: { ...storyboard, buffer: undefined }, totalHeight: coverage.totalHeight, reachedEnd: coverage.reachedEnd };
    let selection = await time("observation_selection", () => selectStructuralObservations(input, adaptiveConfig));
    captureDiagnostics.scoringSelection = selection;
    captureDiagnostics.pool = observations.map(({ buffer, measures, animatedComponents, ...v }) => v);
    selection = applyReliabilityRegistry(selection, fixedIds, registry);
    if (observationTrace) {
      observationTrace.currentSelection = selection;
      observationTrace.currentStoryboard = storyboard;
      observationTrace.currentObservations = observations;
    }
    let locals = selection.selectedIds.map((id) => ({ ...observations.find((v) => v.id === id) }));
    const presentation = () => (selection.persistentElements || []).map((p) => ({
      ...p, representativeObservationId:null,
      visionExcluded:visionCleanup.visits.some(v=>v.suppressed.some(s=>s.id===p.id)),
      suppressedObservationIds:observations.filter(o=>visionCleanup.visits.some(v=>v.position===o.position&&v.suppressed.some(s=>s.id===p.id))).map(o=>o.id),skipped:[],
    }));
    let persistentPresentation = presentation();
    if (selection.mode === "adaptive") {
      const required = locals.filter((v) => v.origin !== "fixed").length;
      const admission = optionalObservationBudget(end - Date.now(), measuredCaptureCosts, Math.max(0, required - 1));
      if (required && !admission.admitted) {
        optionalBudget.exhausted = true;
        optionalBudget.lastAdmission = admission;
        selection = applyReliabilityRegistry(selectStructuralObservations({ ...input, adaptiveBudgetExhausted: true }, adaptiveConfig), fixedIds, captureDiagnostics.registry);
        locals = selection.selectedIds.map((id) => ({ ...observations.find((v) => v.id === id) }));
        persistentPresentation = presentation();
      }
    }
    for (const view of locals) {
      const needsFreshCapture = view.origin !== "fixed";
      if (!needsFreshCapture) {
        captureDiagnostics.deliveries.push({ id: view.id, position: view.position, source: "validated_post_traversal_fixed", recaptured: false,
          visionClean:true,suppressedLayers:visionCleanup.visits.find(v=>v.origin==='fixed'&&v.position===view.position)?.suppressed.map(v=>v.id)||[] });
        continue;
      }
      phase("final_observation_recapture");
      if (Date.now() + 1500 >= end) throw incomplete("budget de déduplication des couches persistantes dépassé", coverage);
      state = await move(view.position);
      lastCapturePosition = state.position;
      await check();
      state = await measure();
      if (Math.abs(state.position - view.position) > 2 || Math.abs(state.totalHeight - coverage.totalHeight) > 8)
        throw incomplete("géométrie de recapture locale modifiée", coverage);
      const images = await waitImages();
      if (images.failed || images.pending) throw incomplete("images non chargées", coverage);
      await stabilizeVisuals();
      await check();
      await syncEmbeds();
      try {
        await verifyAnimation();
        view.animatedComponents=animated.components();
        view.buffer = await screenshot({ type:"png", fullPage:false,
          animations:"disabled", timeout:Math.min(25000,Math.max(1,end-Date.now())) });
      } finally {
        try { await verifyAnimation(); } finally { await restoreAnimation(); }
      }
      const restored = await measure();
      if (Math.abs(restored.position-view.position)>2 || Math.abs(restored.totalHeight-coverage.totalHeight)>8)
        throw incomplete("géométrie après restauration modifiée",coverage);
      await check();
      {
        view.position = state.position;
        view.visibleRangePx = [view.position, Math.min(coverage.totalHeight, view.position + state.visibleHeight)];
        captureDiagnostics.deliveries.push({ id: view.id, position: view.position, source: "validated_final_recapture",
          recaptured:true,freshnessRequired:true,visionClean:true,
          suppressedLayers:visionCleanup.visits.at(-1).suppressed.map(v=>v.id),geometryRestored:true });
      }
    }
    {
      captureDiagnostics.selection = selection;
      observationTrace.currentSelection = selection;
      captureDiagnostics.finalRecaptures = captureDiagnostics.deliveries.filter((v) => v.recaptured).length;
      captureDiagnostics.freshnessRecaptures = captureDiagnostics.deliveries.filter((v) => v.freshnessRequired).length;
    }
    captureDiagnostics.observationTrace=buildObservationTrace({observations,
      scoring:captureDiagnostics.scoringSelection,delivery:selection,deliveredIds:locals.map(v=>v.id),
      strategy:coverage.captureStrategy,config:adaptiveConfig,registry,totalHeight:coverage.totalHeight});
    if (options.onDiagnostic) await options.onDiagnostic({ input, selection, observations, localViews:locals,
      persistentPresentation, animationDiagnostics, fixedViews: views,
      oldStoryboard: await structuralStoryboard(views, state.viewport), storyboard: storyboard.buffer, captureStrategy: coverage.captureStrategy });
    if (coverage.captureStrategy === "sampled") {
    coverage.version = 3;
    coverage.storyboard = { ...storyboard, buffer: undefined };
    coverage.observationSelection = { version: 1, sequencing: OBSERVATION_SEQUENCING, mode: selection.mode, fallbackReasons: selection.fallbackReasons,
      threshold: adaptiveConfig.threshold, config: adaptiveConfig, candidateCount: observations.length,
      // Nonstructural layer geometry stays in internal diagnostics only.
      persistentElements:persistentPresentation.filter(p=>!p.visionExcluded),
      animatedComponents:animationDiagnostics,
      selected: locals.map((v, i) => ({ role: `observation${i + 1}`, position: v.position,
        ...selection.decisions.find((d) => d.id === v.id), position: v.position,
        projectedDimensions: undefined, relations: undefined,descriptor:undefined })) };
    coverage.positions = locals.map((v, i) => ({ role: `observation${i + 1}`, position: v.position, visibleRangePx: v.visibleRangePx,
      progressPercent: Math.round(v.position / Math.max(1, lastScroll) * 100), stabilized: true,
      signature: createHash("sha256").update(v.buffer).digest("hex") }));
    coverage.overviewKind = "structural_storyboard";
    coverage.visionCleanliness=visionCleanup.summary();
    coverage.mediaEvidence=summarizeMediaEvidence(mediaViews);
    coverage.complete = true;
    coverage.capturedAt = new Date();
    if (!coverageIsComplete({ captureCoverage: coverage })) throw incomplete("storyboard adaptatif incomplet", coverage);
    phase("finalization");
    await move(0);
    await check();
    coverage.captureTiming = { elapsedMs: Date.now() - startedAt, remainingMs: end - Date.now(),
      budgetMs: end - startedAt, maximumMeasuredCaptureMs: Math.max(...measuredCaptureCosts) };
    return {
      buffer: storyboard.buffer,
      originalViews,
      viewBuffers: {
        overview: storyboard.buffer,
        ...Object.fromEntries(
          locals.map((view, index) => [`observation${index + 1}`, view.buffer]),
        ),
      },
      captureCoverage: coverage,
      capturePerformance: profile.snapshot(),
      captureDiagnostics,
      captureSanitization: sanitation,
      localMetadata: {
        viewport: state.viewport,
        documentWidth: state.viewport.width,
        documentHeight: state.documentHeight,
        externalEmbeds: [...(page.structuralExternalEmbeds?.values() || [])],
      },
      viewPositions: Object.fromEntries(
        locals.map((view, index) => [`observation${index + 1}`, view.position]),
      ),
    };
    }
  }
  phase("finalization");
  await move(0);
  await check();
  const prefix = state.regionTop,
    suffix = state.viewport.height - state.regionBottom;
  const layers = tiles.map((tile) => ({
    input: tile.buffer,
    top: prefix + tile.top,
    left: 0,
  }));
  if (prefix)
    layers.unshift({
      input: await sharp(firstViewport)
        .extract({
          left: 0,
          top: 0,
          width: state.viewport.width,
          height: prefix,
        })
        .png()
        .toBuffer(),
      top: 0,
      left: 0,
    });
  if (suffix)
    layers.push({
      input: await sharp(lastViewport)
        .extract({
          left: 0,
          top: state.regionBottom,
          width: state.viewport.width,
          height: suffix,
        })
        .png()
        .toBuffer(),
      top: prefix + coverage.totalHeight,
      left: 0,
    });
  const buffer = await sharp({
    create: {
      width: state.viewport.width,
      height: prefix + coverage.totalHeight + suffix,
      channels: 3,
      background: "white",
    },
  })
    .composite(layers)
    .png()
    .toBuffer();
  coverage.overviewKind = "optimized_full_page";
  if(!captureDiagnostics.observationTrace)captureDiagnostics.observationTrace=buildObservationTrace({observations,
    deliveredIds:selected.map(v=>observations.find(o=>Math.abs(o.position-v.position)<2)?.id || `candidate${observations.findIndex(o=>Math.abs(o.position-v.position)<2)+1}`),
    strategy:'continuous',config:adaptiveConfig,registry,totalHeight:coverage.totalHeight});
  coverage.visionCleanliness=visionCleanup.summary();
  coverage.mediaEvidence=summarizeMediaEvidence(mediaViews);
  coverage.complete = true;
  coverage.capturedAt = new Date();
  return {
    buffer,
    originalViews,
    viewBuffers: {
      visionOverview: buffer,
      top: selected[0].buffer,
      middle: selected[1].buffer,
      bottom: selected[2].buffer,
    },
    captureCoverage: coverage,
    capturePerformance: profile.snapshot(),
    ...(captureDiagnostics ? { captureDiagnostics } : {}),
    captureSanitization: sanitation,
    localMetadata: {
      viewport: state.viewport,
      documentWidth: state.viewport.width,
      documentHeight: state.documentHeight,
      externalEmbeds: [...(page.structuralExternalEmbeds?.values() || [])],
    },
    viewPositions: {
      top: views[0].position,
      middle: views[2].position,
      bottom: views[4].position,
    },
  };
  } catch (error) {
    captureFailure=error;
    error.capturePerformance = profile.snapshot();
    error.captureTiming = { phase: capturePhase, position: lastCapturePosition,
      elapsedMs: Date.now() - startedAt, remainingMs: end - Date.now(), budgetMs: end - startedAt };
    error.captureCoverage ||= { ...coverage, complete: false };
    if(imageGateDiagnostics.length){error.imageGateDiagnostics=imageGateDiagnostics;error.imageGateFailure=imageGateDiagnostics.at(-1);}
    throw error;
  } finally {
    try {
    await restoreAnimation();
    try {videoDiagnostics.restoration=await page.evaluate(restoreVideoDOM);}
    catch(error){
      videoDiagnostics.restoration={restored:false,error:error.message};
      if(captureFailure)captureFailure.videoRestoration=videoDiagnostics.restoration;
      else throw Object.assign(new Error('Restauration vidéo non certifiée.'),{code:'structural_video_restore_failed',status:422});
    }
    } finally {
      if(page.structuralConsentBackdrops?.length) {
        try {
          const proof=await time('consent_backdrop_restore',()=>restoreConsentBackdrops(page));
          if(captureDiagnostics)captureDiagnostics.consentBackdrops=proof;
          if(coverage.visionCleanliness)coverage.visionCleanliness.consentBackdrops={version:proof.version,
            complete:proof.complete,restorationVerified:proof.restorationVerified,maskedLayers:proof.entries.length};
          if(sanitation)sanitation.consentBackdropCleanup=proof;
        } catch(error) {
          if(captureFailure)captureFailure.consentBackdropRestoration=error.consentBackdropIntegrity;
          else throw error;
        }
      }
    }
  }
}
module.exports = {
  captureStructuralPage,
  coverageIsComplete,
  scrollDOM,
  visualMotionDOM,
  COVERAGE_VERSION,
  structuralStoryboard,
  traversalStoryboard,
  optionalObservationBudget,
  OBSERVATION_SEQUENCING,
};
