/* global document, window, getComputedStyle, NodeFilter */
// No network, image hashes, text semantics or hostname enter this module.
const DEFAULT_SELECTION_CONFIG = Object.freeze({
  threshold: 0.25,
  weights: { L: 0.35, D: 0.35, V: 0.3, R: 0.3 },
  resolution: { text: 12, image: 64, relation: 6 },
  macroCanvas: { width: 512, height: 512 },
  maxLocalViews: 5,
  mandatoryEntry: true,
  maxNodes: 6000,
  maxMasses: 384,
  maxLines: 768,
  maxGroups: 64,
  maxBoundaryViews: 12,
  minMeasuredCoverage: 0.85,
  maxUnknownArea: 0.08,
  proximity: 0.12,
  insignificantRelation: 2,
  maxRelationsPerType: 32,
  scorePrecision: 1e-6,
  persistentMinPositions: 3,
  persistentMinCoverage: 0.6,
  persistentTolerance: 2,
  persistentMaxArea: 0.18,
  maxPersistentElements: 64,
});
const clamp = (v) => Math.min(1, Math.max(0, v));
const mean = (v) => (v.length ? v.reduce((a, b) => a + b, 0) / v.length : 0);
const area = (r) => Math.max(0, r.width) * Math.max(0, r.height);
const intersection = (a, b) => {
  const x = Math.max(a.x, b.x),
    y = Math.max(a.y, b.y);
  return {
    x,
    y,
    width: Math.max(0, Math.min(a.x + a.width, b.x + b.width) - x),
    height: Math.max(0, Math.min(a.y + a.height, b.y + b.height) - y),
  };
};
// Exact rectangle union, also used within each occupation cell. Nested masses
// never inflate occupied surface or the weight of a text group.
function unionArea(rects) {
  const xs = [...new Set(rects.flatMap((r) => [r.x, r.x + r.width]))].sort(
    (a, b) => a - b,
  );
  let result = 0;
  for (let i = 1; i < xs.length; i++) {
    const intervals = rects
      .filter((r) => r.x < xs[i] && r.x + r.width > xs[i - 1])
      .map((r) => [r.y, r.y + r.height])
      .sort((a, b) => a[0] - b[0]);
    let end = -Infinity,
      length = 0;
    for (const [start, stop] of intervals) {
      length += Math.max(0, stop - Math.max(start, end));
      end = Math.max(end, stop);
    }
    result += (xs[i] - xs[i - 1]) * length;
  }
  return result;
}
function selectionConfig(overrides = {}) {
  const c = {
    ...DEFAULT_SELECTION_CONFIG,
    ...overrides,
    weights: { ...DEFAULT_SELECTION_CONFIG.weights, ...overrides.weights },
    resolution: {
      ...DEFAULT_SELECTION_CONFIG.resolution,
      ...overrides.resolution,
    },
    macroCanvas: {
      ...DEFAULT_SELECTION_CONFIG.macroCanvas,
      ...overrides.macroCanvas,
    },
  };
  for (const v of [
    c.threshold,
    ...Object.values(c.weights),
    c.minMeasuredCoverage,
    c.maxUnknownArea,
    c.proximity,
    c.persistentMinCoverage,
    c.persistentMaxArea,
  ])
    if (!Number.isFinite(v) || v < 0 || v > 1)
      throw new Error("Invalid structural selection parameter");
  for (const v of [
    ...Object.values(c.resolution),
    ...Object.values(c.macroCanvas),
    c.maxNodes,
    c.maxMasses,
    c.maxLines,
    c.maxGroups,
    c.maxRelationsPerType,
    c.scorePrecision,
    c.persistentTolerance,
    c.persistentMinPositions,
    c.maxPersistentElements,
  ])
    if (!Number.isFinite(v) || v <= 0)
      throw new Error("Invalid structural measurement parameter");
  if (
    !Number.isInteger(c.maxLocalViews) ||
    c.maxLocalViews < 0 ||
    c.maxLocalViews > 5 ||
    !Number.isInteger(c.maxBoundaryViews) ||
    c.maxBoundaryViews < 0 ||
    c.maxBoundaryViews > 12
  )
    throw new Error("Structural observation limit exceeded");
  return c;
}

// Self-contained, bounded Chromium collector. Only numeric geometry leaves the
// page. Range rectangles represent rendered lines, not a text-content estimate.
function structuralObservationDOM({
  position,
  regionTop = 0,
  regionBottom,
  config,
}) {
  const width = window.innerWidth,
    height = window.innerHeight;
  const viewport = { width, height },
    masses = [],
    lines = [],
    anchors = [],
    unknown = [],
    groups = [];
  const positioned = [], owners = new WeakMap();
  // DOM identities are local, stable across scrolls and never a diversity
  // feature. They identify exactly the same node for optional recapture.
  const registry = window.__gustoStructuralPositioned ||= { nodes: new WeakMap(), next: 0 };
  registry.elements ||= new Map();
  const parent = (n) => n.assignedSlot || n.parentElement || n.getRootNode()?.host || null;
  let scanned = 0,
    truncated = false;
  const round = (n) => Math.round(n * 2) / 2;
  const box = (r) => ({
    x: round(r.left),
    y: round(r.top),
    width: round(r.right - r.left),
    height: round(r.bottom - r.top),
  });
  const visible = (node, raw) => {
    let left = Math.max(0, raw.left),
      right = Math.min(width, raw.right),
      top = Math.max(regionTop, raw.top),
      bottom = Math.min(regionBottom ?? height, raw.bottom),
      opacity = 1;
    let escapedPosition = null;
    for (let p = node; p; p = parent(p)) {
      const s = getComputedStyle(p);
      opacity *= Number(s.opacity);
      if (
        s.display === "none" ||
        ["hidden", "collapse"].includes(s.visibility) ||
        s.contentVisibility === "hidden" ||
        opacity <= 0.01 ||
        (p.tagName === "DIALOG" && !p.open) ||
        (p.tagName === "DETAILS" && !p.open && !node.closest("summary"))
      )
        return null;
      // Persistent navigation is retained in screenshots, excluded from novelty.
      const b = p.getBoundingClientRect();
      if (
        ["fixed", "sticky"].includes(s.position) &&
        b.height > 0 && b.height < height * 0.15 &&
        (p.matches('header,nav,[role="banner"],[role="navigation"]') ||
          (b.width >= width * 0.6 && b.top < height * 0.15))
      )
        return null;
      // Overflow does not clip an absolute/fixed descendant whose containing
      // block lies outside that ancestor. Visibility and clip-path still apply.
      const containingBlock = s.transform !== "none" || s.perspective !== "none" ||
        s.filter !== "none" || /paint|layout|strict|content/.test(s.contain) ||
        /transform|perspective|filter/.test(s.willChange);
      const overflowApplies = !escapedPosition || containingBlock ||
        (escapedPosition === "absolute" && s.position !== "static");
      if (overflowApplies) escapedPosition = null;
      if (p !== node && overflowApplies && /(hidden|clip|scroll|auto)/.test(s.overflowX)) {
        left = Math.max(left, b.left);
        right = Math.min(right, b.right);
      }
      if (p !== node && overflowApplies && /(hidden|clip|scroll|auto)/.test(s.overflowY)) {
        top = Math.max(top, b.top);
        bottom = Math.min(bottom, b.bottom);
      }
      if (["absolute", "fixed"].includes(s.position)) escapedPosition = s.position;
      const inset = s.clipPath.match(/^inset\(([^)]*)\)/);
      if (inset) {
        const v = inset[1].replace(/\s+round[\s\S]*$/, "").split(/\s+/);
        const [t = "0", r = t, d = t, l = r] = v;
        const px = (v, n) =>
          v.endsWith("%") ? (parseFloat(v) * n) / 100 : parseFloat(v) || 0;
        left = Math.max(left, b.left + px(l, b.width));
        right = Math.min(right, b.right - px(r, b.width));
        top = Math.max(top, b.top + px(t, b.height));
        bottom = Math.min(bottom, b.bottom - px(d, b.height));
      } else if (s.clipPath !== "none") {
        const pts = s.clipPath
          .match(/^polygon\((.*)\)$/)?.[1]
          .split(",")
          .map((p) => p.trim().split(/\s+/).map(parseFloat));
        const zero =
          pts &&
          pts.every((p) => p.length === 2 && p.every(Number.isFinite)) &&
          Math.abs(
            pts.reduce((a, p, i) => {
              const n = pts[(i + 1) % pts.length];
              return a + p[0] * n[1] - n[0] * p[1];
            }, 0),
          ) < 0.001;
        if (zero || /^circle\(0(?:px|%|\s)/.test(s.clipPath)) return null;
        const tokens = s.clipPath
          .match(/^polygon\((.*)\)$/)?.[1]
          .split(",")
          .map((p) => p.trim().split(/\s+/));
        const pixels = tokens?.map(([x, y]) => [
          x?.endsWith("%") ? (parseFloat(x) * b.width) / 100 : parseFloat(x),
          y?.endsWith("%") ? (parseFloat(y) * b.height) / 100 : parseFloat(y),
        ]);
        const rectangular =
          pixels?.length === 4 &&
          pixels.every((p) => p.every(Number.isFinite)) &&
          new Set(pixels.map((p) => p[0])).size === 2 &&
          new Set(pixels.map((p) => p[1])).size === 2 &&
          new Set(pixels.map((p) => p.join(":"))).size === 4 &&
          pixels.every((p, i) => {
            const next = pixels[(i + 1) % 4];
            return p[0] === next[0] || p[1] === next[1];
          });
        if (rectangular) {
          left = Math.max(left, b.left + Math.min(...pixels.map((p) => p[0])));
          right = Math.min(
            right,
            b.left + Math.max(...pixels.map((p) => p[0])),
          );
          top = Math.max(top, b.top + Math.min(...pixels.map((p) => p[1])));
          bottom = Math.min(
            bottom,
            b.top + Math.max(...pixels.map((p) => p[1])),
          );
        } else unknown.push(box(raw)); // Curved/perspective geometry remains unknown.
      }
    }
    if (right - left < 2 || bottom - top < 2) return null;
    return box({ left, right, top, bottom });
  };
  const walkers = [document.createTreeWalker(
    document.body,
    NodeFilter.SHOW_ELEMENT,
  )];
  let node;
  while (walkers.length) {
    node = walkers.at(-1).nextNode();
    if (!node) { walkers.pop(); continue; }
    if (++scanned > config.maxNodes) {
      truncated = true;
      break;
    }
    if (node.shadowRoot) walkers.push(document.createTreeWalker(node.shadowRoot, NodeFilter.SHOW_ELEMENT));
    if (
      node.matches("script,style,link,meta,source") ||
      (node.closest("svg") !== node && node.closest("svg"))
    )
      continue;
    const s = getComputedStyle(node);
    if (["fixed", "sticky"].includes(s.position) && positioned.length < config.maxPersistentElements) {
      if (!registry.nodes.has(node)) registry.nodes.set(node, ++registry.next);
      const id = `persistent${registry.nodes.get(node)}`;
      registry.elements.set(id,node);
      node.setAttribute("data-gusto-structural-positioned", id);
      owners.set(node, id);
      let opacity = 1, hidden = false;
      for (let p = node; p; p = parent(p)) {
        const css = getComputedStyle(p);
        opacity *= Number(css.opacity);
        hidden ||= css.display === "none" || ["hidden", "collapse"].includes(css.visibility);
      }
      const own = node.getBoundingClientRect();
      const descendants = [...node.querySelectorAll("*")].slice(0, 129);
      // A zero-height fixed host can paint positioned children outside its box.
      const extents = [
        ...(own.width > 0 && own.height > 0 ? [own] : []),
        ...descendants.map((n) => visible(n,n.getBoundingClientRect())).filter(Boolean)
          .map((r)=>({left:r.x,top:r.y,right:r.x+r.width,bottom:r.y+r.height})),
      ];
      if (!hidden && opacity > .01 && extents.length) {
        const left = Math.max(0, Math.min(...extents.map((r) => r.left))),
          top = Math.max(0, Math.min(...extents.map((r) => r.top))),
          right = Math.min(width, Math.max(...extents.map((r) => r.right))),
          bottom = Math.min(height, Math.max(...extents.map((r) => r.bottom)));
        if (right > left && bottom > top) {
          const rect = box({left,top,right,bottom});
          const landmark = (n) => n.matches('header,nav,main,footer,section,article,h1,[role="navigation"],[role="main"]') ||
            (n.matches('[role="banner"]') && n.getBoundingClientRect().top <= height*.15 && n.getBoundingClientRect().width >= width*.6);
          const protectedStructure = landmark(node) ||
            [...node.querySelectorAll('header,nav,main,footer,section,article,h1,[role="banner"],[role="navigation"],[role="main"]')]
              .some((n) => landmark(n) && visible(n,n.getBoundingClientRect()));
          const peripheral = rect.width <= width * .6 && rect.height <= height * .5 &&
            rect.width * rect.height <= width * height * config.persistentMaxArea &&
            (left <= width * .05 || right >= width * .95 || top <= height * .05 || bottom >= height * .95);
          const compositionMedia = descendants.some((n) => {
            if (!n.matches('img,video,canvas,svg')) return false;
            if (!visible(n,n.getBoundingClientRect())) return false;
            const r = n.getBoundingClientRect();
            return Math.min(r.width,r.height) >= 64 && r.width*r.height >= rect.width*rect.height*.15;
          });
          positioned.push({id, rect, positionKind:s.position, protectedStructure,
            deduplicationEligible: !protectedStructure && !compositionMedia && peripheral && descendants.length <= 128 &&
              (node.matches('button,a,iframe,[role="button"]') || Boolean(node.querySelector('button,a,iframe,[role="button"]'))),
            domOrder:scanned});
        }
      }
    }
    const ownerIds = [];
    for (let p = node; p; p = parent(p)) if (owners.has(p)) ownerIds.push(owners.get(p));
    const raw = node.getBoundingClientRect(),
      rect = visible(node, raw);
    if (!rect) continue;
    const domOrder = scanned;
    const matrix3d = s.transform
      .match(/^matrix3d\((.*)\)$/)?.[1]
      .split(",")
      .map(Number);
    const unmeasurable3d =
      matrix3d &&
      matrix3d.some(
        (n, i) =>
          ![0, 5, 10, 12, 13, 14, 15].includes(i) && Math.abs(n) > 0.001,
      );
    if (
      node.matches("canvas") ||
      (node.tagName.includes("-") && !node.shadowRoot && !node.children.length) ||
      s.perspective !== "none" ||
      unmeasurable3d ||
      (/^matrix\(/.test(s.transform) &&
        s.transform
          .slice(7)
          .split(",")
          .slice(1, 3)
          .some((n) => Math.abs(parseFloat(n)) > 0.001))
    )
      unknown.push(rect);
    const embed = node.matches("iframe");
    const image = node.matches("img")
      ? Boolean(node.currentSrc && node.complete && node.naturalWidth)
      : node.matches("video")
        ? Boolean(node.videoWidth || node.poster)
        : /url\(/.test(s.backgroundImage);
    const surface =
      !embed &&
      !image &&
      (node.matches("svg") ||
        s.backgroundColor !== "rgba(0, 0, 0, 0)" ||
        /gradient\(/.test(s.backgroundImage));
    if (embed || image || surface) {
      if (
        rect.width >= 32 &&
        rect.height >= 32 &&
        rect.width * rect.height >= 4096
      )
        masses.push({
          ...rect,
          kind: embed ? "embed" : image ? "image" : "surface",
          domOrder,
          fullArea: round(raw.width * raw.height),
          group: domOrder,
          ownerIds,
        });
    }
    // Walk direct text nodes only, so ancestors never duplicate lines.
    const textRects = [];
    for (const child of node.childNodes) {
      if (child.nodeType !== 3 || !child.textContent.trim()) continue;
      const range = document.createRange();
      range.selectNodeContents(child);
      for (const r of range.getClientRects()) {
        const clipped = visible(node, r);
        if (clipped)
          textRects.push({
            ...clipped,
            kind: "text",
            domOrder,
            group: domOrder,
            fontSize: round(parseFloat(s.fontSize) || 0),
            fullArea: round(r.width * r.height),
            ownerIds,
          });
      }
    }
    lines.push(...textRects);
    if (/flex|grid/.test(s.display)) {
      const members = [...node.children]
        .map((child) => visible(child, child.getBoundingClientRect()))
        .filter(Boolean)
        .filter((r) => r.width >= 16 && r.height >= 16)
        .slice(0, 12);
      if (members.length >= 2) groups.push({ ...rect, domOrder, members, ownerIds });
    }
    if (textRects.length) {
      const left = Math.min(...textRects.map((r) => r.x)),
        top = Math.min(...textRects.map((r) => r.y));
      masses.push({
        x: left,
        y: top,
        width: Math.max(...textRects.map((r) => r.x + r.width)) - left,
        height: Math.max(...textRects.map((r) => r.y + r.height)) - top,
        kind: "text",
        domOrder,
        group: domOrder,
        fullArea: Math.max(1, raw.width * raw.height),
        ownerIds,
      });
    }
    if (
      node.matches("section,footer,h1,h2,h3") ||
      image ||
      /flex|grid/.test(s.display)
    ) {
      if (
        raw.width >= width * 0.15 &&
        raw.height >= 32 &&
        raw.height <= height * 3
      )
        anchors.push({
          position: Math.max(0, round(position + raw.top - regionTop)),
          domOrder,
          kind: node.matches("section,footer")
            ? "landmark"
            : image
              ? "image"
              : textRects.length
                ? "heading"
                : "group",
        });
    }
    if (
      masses.length > config.maxMasses ||
      lines.length > config.maxLines ||
      groups.length > config.maxGroups
    ) {
      truncated = true;
      break;
    }
  }
  // Deduplicate exact repeated media/surface boxes, keeping document order.
  const seen = new Set();
  const deduped = masses.slice(0, config.maxMasses).filter((r) => {
    const key = [r.kind, r.x, r.y, r.width, r.height].join(":");
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  let signal = 0,
    measured = 0;
  for (let row = 0; row < 8; row++)
    for (let col = 0; col < 8; col++) {
      const x = ((col + 0.5) * width) / 8,
        y = ((row + 0.5) * height) / 8;
      let hit = document.elementFromPoint(x, y);
      for (let depth=0;hit?.shadowRoot && depth<32;depth++) {
        const inner=hit.shadowRoot.elementFromPoint(x,y);
        if (!inner || inner===hit) break;
        hit=inner;
      }
      if (hit?.tagName.includes("-") && !hit.shadowRoot && !hit.children.length)
        unknown.push({x:col*width/8,y:row*height/8,width:width/8,height:height/8});
      if (!hit || !visible(hit, hit.getBoundingClientRect())) continue;
      const css = getComputedStyle(hit);
      const hitRect = hit.getBoundingClientRect();
      const mediaSignal =
        (hit.matches("img,video,canvas,iframe,svg") ||
          /url\(|gradient\(/.test(css.backgroundImage)) &&
        hitRect.width >= 32 &&
        hitRect.height >= 32 &&
        hitRect.width * hitRect.height >= 4096;
      // A paragraph's unused block width is empty space, not unmeasured ink.
      const textSignal = [...hit.childNodes].some((n) => {
        if (n.nodeType !== 3 || !n.textContent.trim()) return false;
        const range = document.createRange();
        range.selectNodeContents(n);
        return [...range.getClientRects()].some(
          (r) => x >= r.left && x <= r.right && y >= r.top && y <= r.bottom,
        );
      });
      const hasSignal = mediaSignal || textSignal;
      if (!hasSignal) continue;
      signal++;
      if (
        [...deduped, ...lines].some(
          (r) =>
            x >= r.x && x <= r.x + r.width && y >= r.y && y <= r.y + r.height,
        )
      )
        measured++;
    }
  const groupKeys = new Set();
  const dedupedGroups = groups.slice(0, config.maxGroups).filter((g) => {
    const key = JSON.stringify(g.members);
    if (groupKeys.has(key)) return false;
    groupKeys.add(key);
    return true;
  });
  return {
    viewport,
    masses: deduped,
    lines: lines.slice(0, config.maxLines),
    groups: dedupedGroups,
    anchors: anchors.slice(0, 128),
    unknown: unknown.slice(0, config.maxMasses),
    truncated,
    measuredCoverage: signal ? measured / signal : 1,
    relationsKnown: !truncated,
    position,
    positioned,
  };
}

function persistentElements(candidates, totalHeight, config) {
  const sorted = [...candidates].sort((a,b) => a.position-b.position), byId = new Map();
  const scroll = Math.max(0, totalHeight - (sorted[0]?.visibleHeight || 0));
  if (!scroll) return [];
  for (const c of sorted) for (const p of c.measures?.positioned || []) {
    if (!byId.has(p.id)) byId.set(p.id, []);
    byId.get(p.id).push({ ...p, observationId:c.id, position:c.position });
  }
  const same = (a,b) => ['x','y','width','height'].every((k) => Math.abs(a[k]-b[k]) <= config.persistentTolerance);
  return [...byId].map(([id, samples]) => {
    // Select the largest deterministic stable geometry cluster, not a mean that
    // might merge an entering sticky composition with a stationary UI layer.
    const clusters = samples.map((s) => samples.filter((p) => same(p.rect,s.rect)))
      .sort((a,b) => b.length-a.length || a[0].position-b[0].position);
    const stable = clusters[0];
    let represented = 0;
    for (const [i,c] of sorted.entries()) if (stable.some((p) => p.observationId===c.id)) {
      const left = i ? (sorted[i-1].position+c.position)/2 : 0;
      const right = i<sorted.length-1 ? (c.position+sorted[i+1].position)/2 : scroll;
      represented += Math.max(0,right-left);
    }
    const coverage = represented/scroll;
    const span = (stable.at(-1).position-stable[0].position)/scroll;
    const confirmed = stable.length >= config.persistentMinPositions &&
      coverage >= config.persistentMinCoverage && span >= config.persistentMinCoverage;
    const eligible = confirmed && stable.every((s) => s.deduplicationEligible);
    return {id, positionKind:stable[0].positionKind, confirmed, coverage, span,
      protectedStructure:samples.some((s) => s.protectedStructure),
      deduplicationEligible:eligible && !samples.some((s) => s.protectedStructure),
      reason:!confirmed?'insufficient_persistent_evidence':eligible?'persistent_peripheral_control':'structural_or_uncertain_layer_preserved',
      occurrences:samples.map(({observationId,position,rect})=>({observationId,position,rect})),
      stableObservationIds:stable.map((s)=>s.observationId)};
  });
}

function withoutPersistentMeasures(measures, ids) {
  const keep = (r) => !(r.ownerIds || []).some((id) => ids.includes(id));
  return {...measures, masses:measures.masses.filter(keep), lines:measures.lines.filter(keep),
    groups:(measures.groups || []).filter(keep)};
}

function descriptor(measures) {
  const { width, height } = measures.viewport;
  const maps = { text: [], image: [], empty: [] };
  const rects = measures.masses;
  const textRects = measures.lines;
  const photoRects = rects.filter((r) => r.kind === "image");
  const occupied = [
    ...textRects,
    ...rects.filter((r) => ["image", "embed"].includes(r.kind)),
  ];
  for (let row = 0; row < 8; row++)
    for (let col = 0; col < 8; col++) {
      const cell = {
        x: (col * width) / 8,
        y: (row * height) / 8,
        width: width / 8,
        height: height / 8,
      };
      for (const [key, list] of [
        ["text", textRects],
        ["image", photoRects],
      ])
        maps[key].push(
          clamp(
            unionArea(
              list.map((r) => intersection(r, cell)).filter((r) => area(r)),
            ) / area(cell),
          ),
        );
      maps.empty.push(
        1 -
          clamp(
            unionArea(
              occupied.map((r) => intersection(r, cell)).filter((r) => area(r)),
            ) / area(cell),
          ),
      );
    }
  // Fixed slots: image, text, surface, embed; largest first, then y/x/DOM.
  // Missing masses use six zeros (presence, x, y, w, h, area).
  const geometry = [];
  for (const kind of ["image", "text", "surface", "embed"]) {
    const sorted = rects
      .filter((r) => r.kind === kind)
      .sort(
        (a, b) =>
          area(b) - area(a) ||
          a.y - b.y ||
          a.x - b.x ||
          a.domOrder - b.domOrder,
      )
      .slice(0, 4);
    for (let i = 0; i < 4; i++) {
      const r = sorted[i];
      geometry.push(
        ...(r
          ? [
              1,
              r.x / width,
              r.y / height,
              r.width / width,
              r.height / height,
              area(r) / (width * height),
            ]
          : [0, 0, 0, 0, 0, 0]),
      );
    }
  }
  const empty = [];
  for (let i = 0; i < 8; i++)
    empty.push(
      mean(maps.empty.slice(i * 8, i * 8 + 8)),
      mean(maps.empty.filter((_, j) => j % 8 === i)),
    );
  const scales = Array(8).fill(0);
  for (const line of textRects)
    scales[Math.min(7, Math.floor(clamp(line.fontSize / height) * 8))] +=
      area(line);
  const total = unionArea(textRects) || 1;
  const features = scales.map((n) => clamp(n / total));
  // Four largest flex/grid geometries, no container names or raw CSS. Slots
  // absent from old diagnostic fixtures are zero, just like absent masses.
  const groups = [...(measures.groups || [])]
    .sort(
      (a, b) =>
        area(b) - area(a) || a.y - b.y || a.x - b.x || a.domOrder - b.domOrder,
    )
    .slice(0, 4);
  for (let i = 0; i < 4; i++) {
    const g = groups[i];
    geometry.push(
      ...(g
        ? [
            1,
            g.x / width,
            g.y / height,
            g.width / width,
            g.height / height,
            clamp(g.members.length / 12),
          ]
        : [0, 0, 0, 0, 0, 0]),
    );
  }
  let overlap = 0;
  for (let i = 0; i < rects.length; i++)
    for (let j = i + 1; j < rects.length; j++)
      if (
        rects[i].kind !== "surface" &&
        rects[j].kind !== "surface" &&
        rects[i].group !== rects[j].group
      )
        overlap += area(intersection(rects[i], rects[j]));
  features.push(clamp(overlap / (width * height)));
  return {
    occupation: [...maps.text, ...maps.image, ...maps.empty],
    geometry,
    empty,
    features,
  };
}
const difference = (a, b) => mean(a.map((v, i) => Math.abs(v - b[i])));
function distance(a, b) {
  return clamp(
    0.4 * difference(a.occupation, b.occupation) +
      0.25 * difference(a.geometry, b.geometry) +
      0.2 * difference(a.empty, b.empty) +
      0.15 * difference(a.features, b.features),
  );
}
function compositionRelations(measures, config) {
  const main = measures.masses
    .filter((r) => r.kind !== "surface")
    .sort((a, b) => area(b) - area(a) || a.domOrder - b.domOrder)
    .slice(0, 12);
  // A whole-viewport background has no local composition edge. Contained
  // surface boxes do, unless a media/placeholder already accounts for them.
  const surfaces = measures.masses
    .filter(
      (r) =>
        r.kind === "surface" &&
        area(r) < measures.viewport.width * measures.viewport.height * 0.95 &&
        !main.some(
          (m) => area(intersection(r, m)) / Math.max(area(r), area(m)) > 0.95,
        ),
    )
    .sort((a, b) => area(b) - area(a) || a.domOrder - b.domOrder)
    .slice(0, 4);
  main.push(...surfaces);
  const types = { gap: [], axis: [], overlap: [], columnOffset: [], size: [] };
  const add = (type, value) => {
    if (
      value > config.insignificantRelation &&
      types[type].length < config.maxRelationsPerType
    )
      types[type].push(value);
  };
  // Adjacent children provide actual grid/flex gaps, axes and column offsets,
  // even when those children are wrappers rather than standalone image/text.
  for (const group of measures.groups || []) {
    const members = [...group.members].sort((a, b) => a.y - b.y || a.x - b.x);
    for (let i = 1; i < members.length; i++) {
      const a = members[i - 1],
        b = members[i];
      const sharesY =
        Math.min(a.y + a.height, b.y + b.height) > Math.max(a.y, b.y);
      add(
        "gap",
        sharesY
          ? Math.max(0, b.x - a.x - a.width)
          : Math.max(0, b.y - a.y - a.height),
      );
      add("axis", Math.abs(a.x - b.x));
      if (sharesY) add("columnOffset", Math.abs(a.y - b.y));
      add("size", Math.abs(a.width - b.width));
      add("size", Math.abs(a.height - b.height));
    }
  }
  for (let i = 0; i < main.length; i++)
    for (let j = i + 1; j < main.length; j++) {
      const a = main[i],
        b = main[j],
        overlap = intersection(a, b);
      const horizontal = Math.max(
        0,
        Math.max(a.x, b.x) - Math.min(a.x + a.width, b.x + b.width),
      );
      const vertical = Math.max(
        0,
        Math.max(a.y, b.y) - Math.min(a.y + a.height, b.y + b.height),
      );
      const sharesY =
        Math.min(a.y + a.height, b.y + b.height) > Math.max(a.y, b.y);
      const sharesX =
        Math.min(a.x + a.width, b.x + b.width) > Math.max(a.x, b.x);
      if (sharesY) {
        add("gap", horizontal);
        add("columnOffset", Math.abs(a.y - b.y));
      }
      if (sharesX) add("gap", vertical);
      if (sharesX || sharesY || area(overlap)) {
        add("axis", Math.abs(a.x - b.x));
        add("axis", Math.abs(a.x + a.width / 2 - b.x - b.width / 2));
        add("size", Math.abs(a.width - b.width));
        add("size", Math.abs(a.height - b.height));
      }
      if (area(overlap))
        add("overlap", Math.min(overlap.width, overlap.height));
    }
  return types;
}
function projectionFor(candidate, storyboard, config) {
  const panel = storyboard.panels.find((p) => p.observationId === candidate.id);
  if (!panel) return null;
  const canvasScale = Math.min(
    1,
    config.macroCanvas.width / storyboard.width,
    config.macroCanvas.height / storyboard.height,
  );
  const localScale = Math.min(1, 2000 / candidate.measures.viewport.width);
  return {
    panelScale: panel.scale,
    canvasScale,
    macroScale: panel.scale * canvasScale,
    localScale,
    panelRect: panel.rect,
  };
}
function prepareCandidate(candidate, storyboard, config) {
  const m = candidate.measures,
    projection = projectionFor(candidate, storyboard, config);
  const reasons = [];
  if (
    !projection ||
    !Number.isFinite(projection.macroScale) ||
    projection.macroScale <= 0
  )
    reasons.push("unknown_projection");
  if (!m || !m.viewport?.width || !m.viewport?.height)
    reasons.push("unknown_geometry");
  if (m?.viewport && Array.isArray(m.unknown)) {
    if (m.truncated || !m.relationsKnown)
      reasons.push("incomplete_descriptors");
    if (!(m.measuredCoverage >= config.minMeasuredCoverage))
      reasons.push("insufficient_measured_coverage");
    const screen = { x: 0, y: 0, ...m.viewport };
    if (
      unionArea(m.unknown.map((r) => intersection(r, screen))) / area(screen) >
      config.maxUnknownArea
    )
      reasons.push("unmeasurable_canvas_clip_or_transform");
  }
  if (candidate.stabilized !== true) reasons.push("unstable_observation");
  if (reasons.length)
    return {
      ...candidate,
      reliability: { reliable: false, reasons },
      projection,
    };
  const gain = (d, threshold) =>
    Math.max(
      0,
      clamp((d * projection.localScale) / threshold) -
        clamp((d * projection.macroScale) / threshold),
    );
  const groups = [];
  // Cap each group's union weight at 15% of the viewport; aggregate by kind so
  // many small labels cannot crowd out photography.
  for (const kind of ["text", "image"]) {
    const source =
      kind === "text" ? m.lines : m.masses.filter((r) => r.kind === "image");
    const grouped = new Map();
    for (const r of source) {
      const key = r.group;
      if (!grouped.has(key)) grouped.set(key, []);
      grouped.get(key).push(r);
    }
    let weight = 0,
      sum = 0;
    for (const rects of grouped.values()) {
      const w = Math.min(
        unionArea(rects),
        m.viewport.width * m.viewport.height * 0.15,
      );
      weight += w;
      sum +=
        w *
        mean(
          rects.map((r) =>
            gain(
              kind === "text" ? r.height : Math.min(r.width, r.height),
              config.resolution[kind],
            ),
          ),
        );
    }
    if (weight) groups.push(sum / weight);
  }
  const relations = compositionRelations(m, config);
  const L = mean(groups),
    D = mean(
      Object.values(relations)
        .filter((v) => v.length)
        .map((v) => mean(v.map((d) => gain(d, config.resolution.relation)))),
    );
  const principal = m.masses
    .filter((r) => r.kind !== "surface")
    .sort((a, b) => area(b) - area(a))
    .slice(0, 12);
  const framing = mean(
    principal.map((r) => Math.min(1, area(r) / Math.max(1, r.fullArea))),
  );
  return {
    ...candidate,
    projection,
    descriptor: descriptor(m),
    L,
    D,
    relations,
    framing,
    projectedDimensions: {
      lines: m.lines.map((r) => ({
        real: r.height,
        macro: r.height * projection.macroScale,
        local: r.height * projection.localScale,
      })),
      images: m.masses
        .filter((r) => r.kind === "image")
        .map((r) => ({
          real: [r.width, r.height],
          macro: [
            r.width * projection.macroScale,
            r.height * projection.macroScale,
          ],
          local: [
            r.width * projection.localScale,
            r.height * projection.localScale,
          ],
        })),
    },
    reliability: { reliable: true, reasons: [] },
  };
}
function marginal(candidate, selected, config) {
  const novelty = selected.length
    ? Math.min(
        ...selected.map((s) => distance(candidate.descriptor, s.descriptor)),
      )
    : 1;
  const V = (novelty * (candidate.L + candidate.D)) / 2;
  const R = selected.length
    ? Math.max(
        ...selected.map((s) => {
          const a = candidate.visibleRangePx,
            b = s.visibleRangePx;
          const overlap = Math.max(
            0,
            Math.min(a[1], b[1]) - Math.max(a[0], b[0]),
          );
          const union = a[1] - a[0] + b[1] - b[0] - overlap;
          return (
            0.8 * (1 - distance(candidate.descriptor, s.descriptor)) +
            0.2 * (union > 0 ? overlap / union : 0)
          );
        }),
      )
    : 0;
  const { L, D } = candidate,
    w = config.weights;
  return { L, D, V, R, G: clamp(w.L * L + w.D * D + w.V * V - w.R * R) };
}
function selectStructuralObservations(input, overrides = {}) {
  const config = selectionConfig(overrides),
    { storyboard, totalHeight } = input;
  const persistent = persistentElements(input.candidates, totalHeight, config);
  const excluded = persistent.filter((p) => p.deduplicationEligible);
  const prepared = input.candidates.map((c) =>
    prepareCandidate({...c, measures:c.measures ? withoutPersistentMeasures(c.measures,
      excluded.filter((p) => p.stableObservationIds.includes(c.id)).map((p)=>p.id)) : c.measures}, storyboard, config),
  );
  const unreliable = prepared.filter((c) => !c.reliability.reliable);
  const fallbackReasons = [
    ...new Set(unreliable.flatMap((c) => c.reliability.reasons)),
  ];
  if (!prepared.length) fallbackReasons.push("no_measurable_candidates");
  if (!input.reachedEnd || !storyboard.complete)
    fallbackReasons.push("incomplete_storyboard_coverage");
  const reliableFixed = prepared.filter(
    (c) => c.reliability.reliable && input.fixedIds.includes(c.id),
  );
  if (fallbackReasons.length)
    return {
      version: 1,
      mode: "fixed_fallback",
      config,
      persistentElements: persistent,
      fallbackReasons,
      selectedIds: input.fixedIds,
      decisions: prepared.map((c) => ({
        id: c.id,
        position: c.position,
        selected: input.fixedIds.includes(c.id),
        visibleRangePx: c.visibleRangePx,
        scores: c.reliability.reliable
          ? marginal(
              c,
              reliableFixed.filter((s) => s !== c),
              config,
            )
          : null,
        reason: c.reliability.reliable
          ? "fixed_fallback"
          : c.reliability.reasons.join(","),
        reliability: c.reliability,
        projection: c.projection,
        projectedDimensions: c.projectedDimensions,
      })),
      rounds: [],
      exchanges: [],
    };
  const order = (a, b) => a.position - b.position || a.domOrder - b.domOrder;
  prepared.sort(order);
  for (const c of prepared) {
    // Weight representatives by the length of their Voronoi interval in the
    // traversal, rather than by the number of boundary probes in that region.
    let covered = 0;
    for (let i = 0; i < prepared.length; i++) {
      const p = prepared[i],
        left = i ? (prepared[i - 1].position + p.position) / 2 : 0;
      const right =
        i + 1 < prepared.length
          ? (p.position + prepared[i + 1].position) / 2
          : totalHeight;
      if (distance(c.descriptor, p.descriptor) <= config.proximity)
        covered += right - left;
    }
    c.representativity = covered / totalHeight;
  }
  const quantize = (v) => Math.round(v / config.scorePrecision);
  const rank = (S) =>
    prepared
      .filter((c) => !S.includes(c))
      .map((c) => ({ c, scores: marginal(c, S, config) }))
      .sort(
        (a, b) =>
          quantize(b.scores.G) - quantize(a.scores.G) ||
          quantize(b.c.representativity + b.c.framing) -
            quantize(a.c.representativity + a.c.framing) ||
          // Coverage preferences only break admissible ties, never change G.
          Math.abs(
            a.c.position + a.c.measures.viewport.height / 2 - totalHeight / 2,
          ) -
            Math.abs(
              b.c.position + b.c.measures.viewport.height / 2 - totalHeight / 2,
            ) ||
          order(a.c, b.c),
      );
  let S = config.mandatoryEntry && config.maxLocalViews ? [prepared[0]] : [];
  const mandatoryId = S[0]?.id,
    rounds = [];
  while (S.length < config.maxLocalViews) {
    const ranked = rank(S),
      best = ranked.find((r) => r.scores.G > config.threshold);
    rounds.push({
      selectedBefore: S.map((c) => c.id),
      scores: ranked.map(({ c, scores }) => ({ id: c.id, ...scores })),
    });
    if (!best || best.scores.G <= config.threshold) break;
    S.push(best.c);
  }
  // One deterministic replacement pass. Every optional member must still be
  // admissible against the rest; entry cannot be exchanged. No forced slot.
  const utility = (set) =>
    set.reduce(
      (sum, c) =>
        sum +
        marginal(
          c,
          set.filter((s) => s !== c),
          config,
        ).G,
      0,
    );
  const exchanges = [];
  for (const old of [...S].filter((c) => c.id !== mandatoryId).sort(order)) {
    const base = S.filter((c) => c !== old);
    for (const { c, scores } of rank(base)) {
      if (S.includes(c) || scores.G <= config.threshold) continue;
      const next = [...base, c];
      if (
        next.some(
          (p) =>
            p.id !== mandatoryId &&
            marginal(
              p,
              next.filter((s) => s !== p),
              config,
            ).G <= config.threshold,
        )
      )
        continue;
      if (utility(next) > utility(S) + config.scorePrecision) {
        exchanges.push({
          removed: old.id,
          added: c.id,
          improvement: utility(next) - utility(S),
        });
        S = next;
        break;
      }
    }
  }
  // A later selection can lower an earlier marginal gain. Prune any optional
  // view now under threshold instead of keeping it to fill the maximum.
  for (;;) {
    const below = S.filter(
      (c) =>
        c.id !== mandatoryId &&
        marginal(
          c,
          S.filter((s) => s !== c),
          config,
        ).G <= config.threshold,
    ).sort(
      (a, b) =>
        marginal(
          a,
          S.filter((s) => s !== a),
          config,
        ).G -
          marginal(
            b,
            S.filter((s) => s !== b),
            config,
          ).G || order(a, b),
    );
    if (!below.length) break;
    S = S.filter((c) => c !== below[0]);
  }
  const decisions = prepared.map((c) => {
    const selected = S.includes(c),
      scores = marginal(c, selected ? S.filter((s) => s !== c) : S, config);
    return {
      id: c.id,
      position: c.position,
      visibleRangePx: c.visibleRangePx,
      selected,
      reason:
        c.id === mandatoryId
          ? "mandatory_entry"
          : selected
            ? "marginal_gain_above_threshold"
            : scores.G <= config.threshold
              ? "gain_at_or_below_threshold"
              : "local_view_limit",
      scores,
      projection: c.projection,
      projectedDimensions: c.projectedDimensions,
      relations: c.relations,
      representativity: c.representativity,
      framing: c.framing,
      reliability: c.reliability,
    };
  });
  return {
    version: 1,
    mode: "adaptive",
    config,
    persistentElements: persistent,
    fallbackReasons: [],
    selectedIds: S.sort(order).map((c) => c.id),
    decisions,
    rounds,
    exchanges,
  };
}
module.exports = {
  DEFAULT_SELECTION_CONFIG,
  selectionConfig,
  structuralObservationDOM,
  persistentElements,
  withoutPersistentMeasures,
  unionArea,
  descriptor,
  distance,
  compositionRelations,
  projectionFor,
  prepareCandidate,
  marginal,
  selectStructuralObservations,
};
