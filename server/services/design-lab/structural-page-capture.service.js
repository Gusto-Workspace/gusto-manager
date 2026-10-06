/* global document, window, innerWidth, innerHeight, getComputedStyle */
const { randomUUID, createHash } = require("crypto");
const sharp = require("sharp");
const { sanitizeStructuralCapture } = require("./capture-sanitization.service");
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
  selectionConfig, structuralObservationDOM, selectStructuralObservations,
} = require("./structural-observation-selection");
const { persistentVisibilityDOM } = require("./structural-persistent-elements");
const { createAnimatedCaptureController } = require("./structural-animated-components");

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
    if (key) root.scrollTo({ top: target, behavior: "instant" });
    else window.scrollTo({ top: target, behavior: "instant" });
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
  const end = Math.min(deadline, Date.now() + CAPTURE_BUDGET_MS),
    token = randomUUID();
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
  const verifyAnimation = async () => {
    const integrity=await animated.verify();
    if(!integrity.valid) throw incomplete(`gel animé non conforme : ${integrity.failures.join(', ')}`,coverage);
  };
  try {
  let sanitation = initial.captureSanitization;
  const adaptiveConfig = selectionConfig({
    ...(process.env.GUSTO_STRUCTURAL_SELECTION_THRESHOLD !== undefined
      ? { threshold: Number(process.env.GUSTO_STRUCTURAL_SELECTION_THRESHOLD) } : {}),
    ...(process.env.GUSTO_STRUCTURAL_MACRO_CANVAS_WIDTH || process.env.GUSTO_STRUCTURAL_MACRO_CANVAS_HEIGHT
      ? { macroCanvas: { width: Number(process.env.GUSTO_STRUCTURAL_MACRO_CANVAS_WIDTH || 512),
        height: Number(process.env.GUSTO_STRUCTURAL_MACRO_CANVAS_HEIGHT || 512) } } : {}),
    ...options.selectionConfig,
  });
  const observations = [];
  const remember = async (buffer, state, origin) => {
    try {
    await verifyAnimation();
    const measures = await page.evaluate(structuralObservationDOM, {
      position: state.position, regionTop: state.regionTop, regionBottom: state.regionBottom, config: adaptiveConfig,
    });
    const animatedComponents=animated.components();
    const entry = { buffer, measures, animatedComponents, position: state.position, visibleHeight: state.visibleHeight, stabilized: true, origin };
    await verifyAnimation();
    if(animatedComponents.length) animationDiagnostics.push({position:state.position,origin,...animated.diagnostic()});
    const existing = observations.findIndex((v) => Math.abs(v.position - state.position) < 2);
    if (existing >= 0) observations[existing] = entry;
    else observations.push(entry);
    return entry;
    } finally { await animated.restore(); }
  };
  const check = async () => {
    try {
      // A late widget must be cleared at this scroll position, without a new
      // full-page warm-up that would move the native scroller under the stitch.
      const result = await sanitizeStructuralCapture(page, deadline, {
        rewarm: false,
      });
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
  const raw = () => page.evaluate(scrollDOM, { mode: "measure", key });
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
  const settle = async () => {
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
  };
  const visualHistory = new Map();
  let scrollMotionDetected = false;
  const stabilizeVisuals = async () => {
    // Normal warm-up precedes this point. Pin only measured stable-envelope
    // galleries, then apply the existing visual gate to their actual DOM state.
    if((await animated.freeze()).length) scrollMotionDetected=true;
    const observations = () => page.evaluate(visualMotionDOM);
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
      await page.screenshot({
        type: "png",
        fullPage: false,
        animations: "disabled",
        timeout: Math.min(10000, Math.max(1, end - Date.now())),
      });
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
  };
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
    return {
      ...data,
      position,
      totalHeight,
      visibleHeight: Math.round(regionBottom - regionTop),
      regionTop: Math.round(regionTop),
      regionBottom: Math.round(regionBottom),
    };
  };
  const move = async (target) => {
    const state = await measure();
    if (strategy === "smooth_scroll") await wheel(target - state.position);
    else await direct(target);
    await settle();
    return measure();
  };
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
    await check(); // popups can appear after scroll; no contaminated tile is admitted.
    state = await measure();
    coverage.totalHeight = state.totalHeight;
    if (state.totalHeight > MAX_PAGE_HEIGHT)
      throw incomplete("limite de hauteur atteinte", coverage);
    const images = await waitForPortfolioImages(page, deadline, {
      visibleOnly: true,
    });
    if (images.failed || images.pending)
      throw incomplete("images non chargées", coverage);
    await stabilizeVisuals();
    await check();
    await synchronizeUnavailableExternalEmbeds(page);
    // Capture actual viewports, never rely on fullPage for an internal/JS scroller.
    const image = await page.screenshot({
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
  }
  if (!coverage.reachedEnd)
    throw incomplete("fin non atteinte dans le budget de capture", coverage);
  // Revisit five distributed positions after lazy content has stabilized.
  const views = [];
  for (const [index, fraction] of [0, 0.2, 0.5, 0.8, 1].entries()) {
    if (Date.now() >= end)
      throw incomplete("budget de capture dépassé", coverage);
    const target = Math.round(
      Math.max(0, coverage.totalHeight - state.visibleHeight) * fraction,
    );
    state = await move(target);
    await check();
    state = await measure();
    if (Math.abs(state.position - target) > state.visibleHeight * 0.2)
      throw incomplete("position de lecture non atteinte", coverage);
    if (Math.abs(state.totalHeight - coverage.totalHeight) > 8)
      throw incomplete("longueur encore instable", coverage);
    const images = await waitForPortfolioImages(page, deadline, {
      visibleOnly: true,
    });
    if (images.failed || images.pending)
      throw incomplete("images non chargées", coverage);
    await stabilizeVisuals();
    await check();
    await synchronizeUnavailableExternalEmbeds(page);
    const image = await page.screenshot({
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
  }
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
  if (coverage.captureStrategy === "sampled" || options.diagnostic) {
    // Boundary candidates supplement the traversal's density/column/image
    // changes. Equivalent positions and nested landmarks are deduplicated.
    const lastScroll = Math.max(0, coverage.totalHeight - state.visibleHeight);
    const targets = observations.flatMap((v) => v.measures.anchors)
      .map((a) => ({ ...a, position: Math.min(lastScroll, Math.round(a.position)) }))
      .sort((a, b) => a.position - b.position || a.domOrder - b.domOrder)
      .filter((a, i, all) => !i || a.position - all[i - 1].position >= 32)
      .filter((a) => !observations.some((v) => Math.abs(v.position - a.position) < 32));
    // Bound extra work generically over the whole page, not its first sections.
    const bounded = targets.length <= adaptiveConfig.maxBoundaryViews ? targets :
      Array.from({ length: adaptiveConfig.maxBoundaryViews }, (_, i) => targets[Math.floor(i * targets.length / adaptiveConfig.maxBoundaryViews)]);
    for (const target of bounded) {
      if (Date.now() + 1500 >= end || observations.length >= MAX_STEPS) break;
      state = await move(target.position);
      await check();
      state = await measure();
      if (Math.abs(state.totalHeight - coverage.totalHeight) > 8 || Math.abs(state.position - target.position) > state.visibleHeight * 0.2)
        throw incomplete("géométrie du candidat instable", coverage);
      const images = await waitForPortfolioImages(page, deadline, { visibleOnly: true });
      if (images.failed || images.pending) throw incomplete("images non chargées", coverage);
      await stabilizeVisuals();
      await check();
      await synchronizeUnavailableExternalEmbeds(page);
      const buffer = await page.screenshot({ type: "png", fullPage: false, animations: "disabled", timeout: Math.min(25000, Math.max(1, end - Date.now())) });
      await remember(buffer, state, target.kind);
    }
    observations.sort((a, b) => a.position - b.position);
    observations.forEach((v, i) => { v.id = `candidate${i + 1}`; v.domOrder = i;
      v.visibleRangePx = [v.position, Math.min(coverage.totalHeight, v.position + v.visibleHeight)]; });
    const storyboard = await traversalStoryboard(observations, state.viewport, coverage.totalHeight);
    const fixedIds = views.map((v) => observations.find((o) => Math.abs(o.position - v.position) < 2).id);
    const input = { candidates: observations.map(({ buffer, ...v }) => v), fixedIds,
      storyboard: { ...storyboard, buffer: undefined }, totalHeight: coverage.totalHeight, reachedEnd: coverage.reachedEnd };
    const selection = selectStructuralObservations(input, adaptiveConfig);
    const locals = selection.selectedIds.map((id) => ({ ...observations.find((v) => v.id === id) }));
    const persistentPresentation = (selection.persistentElements || []).map((p) => ({
      ...p, representativeObservationId: p.deduplicationEligible
        ? locals.find((v) => p.stableObservationIds.includes(v.id))?.id || null : null,
      suppressedObservationIds: [], skipped: [],
    }));
    for (const view of locals) {
      const layers = persistentPresentation.filter((p) => p.deduplicationEligible &&
        p.representativeObservationId !== view.id && p.stableObservationIds.includes(view.id));
      if (!layers.length) continue;
      if (Date.now() + 1500 >= end) throw incomplete("budget de déduplication des couches persistantes dépassé", coverage);
      state = await move(view.position);
      await check();
      state = await measure();
      if (Math.abs(state.position - view.position) > 2 || Math.abs(state.totalHeight - coverage.totalHeight) > 8)
        throw incomplete("géométrie de recapture locale modifiée", coverage);
      const images = await waitForPortfolioImages(page, deadline, { visibleOnly: true });
      if (images.failed || images.pending) throw incomplete("images non chargées", coverage);
      await stabilizeVisuals();
      await check();
      await synchronizeUnavailableExternalEmbeds(page);
      let hidden;
      try {
        await verifyAnimation();
        view.animatedComponents=animated.components();
        hidden = await page.evaluate(persistentVisibilityDOM, { mode:"hide", token,
          tolerance:adaptiveConfig.persistentTolerance,
          elements:layers.map((p)=>({id:p.id,rect:p.occurrences.find((o)=>o.observationId===view.id).rect})) });
        if (hidden.ids.length) view.buffer = await page.screenshot({ type:"png", fullPage:false,
          animations:"disabled", timeout:Math.min(25000,Math.max(1,end-Date.now())) });
      } finally {
        await page.evaluate(persistentVisibilityDOM, { mode:"restore", token });
        try { await verifyAnimation(); } finally { await animated.restore(); }
      }
      for (const p of layers) {
        if (hidden.ids.includes(p.id)) p.suppressedObservationIds.push(view.id);
        else p.skipped.push({observationId:view.id,reason:hidden.skipped.find((s)=>s.id===p.id)?.reason || "not_hidden"});
      }
      const restored = await measure();
      if (Math.abs(restored.position-view.position)>2 || Math.abs(restored.totalHeight-coverage.totalHeight)>8)
        throw incomplete("géométrie après restauration modifiée",coverage);
      await check();
    }
    // Full descriptors and rejected candidates stay in the local benchmark.
    // Mongo retains only selected summaries and the storyboard's geometry.
    if (options.onDiagnostic) await options.onDiagnostic({ input, selection, observations, localViews:locals,
      persistentPresentation, animationDiagnostics, fixedViews: views,
      oldStoryboard: await structuralStoryboard(views, state.viewport), storyboard: storyboard.buffer, captureStrategy: coverage.captureStrategy });
    if (coverage.captureStrategy === "sampled") {
    coverage.version = 3;
    coverage.storyboard = { ...storyboard, buffer: undefined };
    coverage.observationSelection = { version: 1, mode: selection.mode, fallbackReasons: selection.fallbackReasons,
      threshold: adaptiveConfig.threshold, config: adaptiveConfig, candidateCount: observations.length,
      persistentElements:persistentPresentation,
      animatedComponents:animationDiagnostics,
      selected: locals.map((v, i) => ({ role: `observation${i + 1}`, position: v.position,
        ...selection.decisions.find((d) => d.id === v.id), projectedDimensions: undefined, relations: undefined })) };
    coverage.positions = locals.map((v, i) => ({ role: `observation${i + 1}`, position: v.position, visibleRangePx: v.visibleRangePx,
      progressPercent: Math.round(v.position / Math.max(1, lastScroll) * 100), stabilized: true,
      signature: createHash("sha256").update(v.buffer).digest("hex") }));
    coverage.overviewKind = "structural_storyboard";
    coverage.complete = true;
    coverage.capturedAt = new Date();
    if (!coverageIsComplete({ captureCoverage: coverage })) throw incomplete("storyboard adaptatif incomplet", coverage);
    await move(0);
    await check();
    return {
      buffer: storyboard.buffer,
      viewBuffers: {
        overview: storyboard.buffer,
        ...Object.fromEntries(
          locals.map((view, index) => [`observation${index + 1}`, view.buffer]),
        ),
      },
      captureCoverage: coverage,
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
  coverage.complete = true;
  coverage.capturedAt = new Date();
  return {
    buffer,
    viewBuffers: {
      visionOverview: buffer,
      top: selected[0].buffer,
      middle: selected[1].buffer,
      bottom: selected[2].buffer,
    },
    captureCoverage: coverage,
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
  } finally { await animated.restore(); }
}
module.exports = {
  captureStructuralPage,
  coverageIsComplete,
  scrollDOM,
  visualMotionDOM,
  COVERAGE_VERSION,
  structuralStoryboard,
  traversalStoryboard,
};
