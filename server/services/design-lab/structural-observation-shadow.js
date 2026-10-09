// Local shadow analysis only: no browser, model, network or persistence access.
const sharp = require("sharp");
const { createHash } = require("node:crypto");
const { selectStructuralObservations, selectionConfig } = require("./structural-observation-selection");
const { traversalStoryboard, coverageIsComplete, COVERAGE_VERSION } = require("./structural-page-capture.service");
const { buildReliabilityRegistry, applyReliabilityRegistry } = require("./structural-reliability.service");
const fractions = [0, 0.2, 0.5, 0.8, 1];
const roles = ["top", "upper", "middle", "lower", "bottom"];
const signature = async (buffer) => createHash("sha256").update(
  await sharp(buffer).resize(64, 64, { fit: "fill" }).raw().toBuffer()).digest("hex");

function fixedProof(views, context) {
  const { totalHeight, viewportHeight } = context;
  const bottom = Math.max(0, totalHeight - viewportHeight);
  const targets = fractions.map((f) => Math.round(bottom * f));
  const longPage = totalHeight > viewportHeight * 1.5;
  const triplet = [views[0], views[2], views[4]];
  const tripletDistinct = !longPage || (triplet.every(Boolean) &&
    new Set(triplet.map((v) => v.signature)).size === 3 &&
    triplet[2].position - triplet[0].position >= viewportHeight * 0.5);
  const positions = views.map((v, i) => ({ role: roles[i], position: v.position,
    stabilized: v.stabilized, signature: v.signature }));
  // Run the actual unchanged v2 preselection predicate on real observed data.
  // Its success alone is explicitly not a proof of post-traversal freshness.
  const gatePass = coverageIsComplete({ captureCoverage: { version: COVERAGE_VERSION,
    captureStrategy: "sampled", complete: context.reachedEnd === true,
    reachedEnd: context.reachedEnd === true, distinctViews: Boolean(tripletDistinct),
    totalHeight, viewportHeight, positions } });
  const samples = views.map((v, i) => ({ observationId: v.id || `fixed${i + 1}`,
    nominalRole: roles[i], target: targets[i], position: v.position,
    visibleRangePx: v.visibleRangePx || [v.position, Math.min(totalHeight, v.position + v.visibleHeight)],
    targetErrorPx: Math.abs(v.position - targets[i]),
    targetTolerancePx: v.visibleHeight * 0.2,
    targetReached: Math.abs(v.position - targets[i]) <= v.visibleHeight * 0.2,
    heightErrorPx: Math.abs(v.observedTotalHeight - totalHeight),
    heightStable: Math.abs(v.observedTotalHeight - totalHeight) <= 8,
    stabilized: v.stabilized === true, signature: v.signature,
    capturedElapsedMs: v.capturedElapsedMs,
    afterCompleteTraversal: v.afterCompleteTraversal === true }));
  return { samples, actualFixedGatePass: gatePass, tripletDistinct: Boolean(tripletDistinct),
    uniqueSignatures: new Set(views.map((v) => v.signature)).size,
    allFiveGeometryChecksPass: samples.length === 5 && samples.every((s) => s.targetReached && s.heightStable && s.stabilized),
    allFivePostTraversal: samples.length === 5 && samples.every((s) => s.afterCompleteTraversal),
    topCovered: views[0]?.position === 0,
    middleCovered: views.some((v) => v.position <= totalHeight / 2 && v.position + v.visibleHeight >= totalHeight / 2),
    bottomCovered: Boolean(views.at(-1) && views.at(-1).position + views.at(-1).visibleHeight >= totalHeight - 5) };
}

function panelProof(candidates, storyboard, context, allowedOrigins = ["traversal"]) {
  const panels = [...storyboard.panels].sort((a, b) => a.position - b.position);
  const geometryValid = panels.every((p) => p.stabilized === true && Number.isFinite(p.position) &&
    p.visibleRangePx[0] === p.position && p.visibleRangePx[1] > p.position && p.rect.width > 0 && p.rect.height > 0 && p.scale > 0);
  const gaps = panels.slice(1).flatMap((p, i) => p.position > panels[i].visibleRangePx[1] + 8
    ? [{ from: panels[i].visibleRangePx[1], to: p.position }] : []);
  const covers = (y) => panels.some((p) => p.visibleRangePx[0] <= y && p.visibleRangePx[1] >= y);
  const complete = context.reachedEnd === true && context.coveredPx >= context.totalHeight - 5 &&
    geometryValid && panels.length > 0 && panels.length <= 120 && panels[0].position === 0 &&
    panels.at(-1).visibleRangePx[1] >= context.totalHeight - 5 && gaps.length === 0;
  return { complete, geometryValid, gaps, allObserved: candidates.every((c) => allowedOrigins.includes(c.origin)),
    topCovered: covers(0), middleCovered: covers(context.totalHeight / 2), bottomCovered: covers(context.totalHeight - 5),
    observedPanelCount: panels.length, uniqueSignatures: new Set(candidates.map((c) => c.signature)).size,
    bottomConfirmations: context.bottomConfirmations, stitchCoveredPx: context.coveredPx };
}

async function analyzeStructuralShadow(trace, product, options = {}) {
  const includeFixed = options.includeFixed === true;
  const config = selectionConfig(trace.config);
  const source = includeFixed ? [...(trace.phaseA || []), ...(trace.fixedViews || [])] : trace.phaseA || [];
  const context = trace.phaseAContext || { totalHeight: source.at(-1)?.observedTotalHeight || 0,
    viewportHeight: source[0]?.visibleHeight || 0, viewport: source[0]?.measures.viewport,
    reachedEnd: false, coveredPx: 0 };
  if (!source.length) return { report: { version: 1, mode: "shadow_unavailable", reason: "no_validated_phase_a_viewports",
    strictlyEquivalent: false }, candidates: [], storyboard: null, currentStoryboard: null };
  const allowedOrigins = includeFixed ? ["traversal", "fixed"] : ["traversal"];
  if (source.some((v) => !allowedOrigins.includes(v.origin) || v.stabilized !== true || !Buffer.isBuffer(v.buffer)))
    throw new Error(includeFixed ? "Shadow requires actual validated traversal/fixed observations exclusively"
      : "Shadow requires actual validated traversal observations exclusively");
  if (includeFixed && (!(trace.phaseA || []).length || trace.phaseAContext?.reachedEnd !== true))
    throw new Error("Fixed-pool shadow requires the actual completed Phase A traversal");
  if (includeFixed && ((trace.fixedViews || []).length !== 5 || trace.fixedViews.some((v) =>
    v.origin !== "fixed" || v.afterCompleteTraversal !== true)))
    throw new Error("Fixed-pool shadow requires five actual post-traversal fixed captures");
  // Last validated observation wins, exactly as the real collector. In the
  // fixed-pool experiment the five actual fixed recaptures intentionally win;
  // optional boundary captures never enter either shadow pool.
  const unique = [];
  for (const v of source) {
    const clone = { ...v, measures: structuredClone(v.measures) };
    const existing = unique.findIndex((old) => Math.abs(old.position - v.position) < 2);
    if (existing < 0) unique.push(clone); else unique[existing] = clone;
  }
  unique.sort((a, b) => a.position - b.position);
  for (const [i, v] of unique.entries()) {
    v.id = `${includeFixed ? "pool" : "phaseA"}${i + 1}`; v.domOrder = i;
    v.visibleRangePx = [v.position, Math.min(context.totalHeight, v.position + v.visibleHeight)];
    v.signature = await signature(v.buffer);
  }
  const storyboard = await traversalStoryboard(unique, context.viewport, context.totalHeight);
  const coverage = panelProof(unique, storyboard, context, allowedOrigins);
  storyboard.complete = coverage.complete;
  // Phase-A-only fallback targets remain plans. In the fixed-pool experiment
  // fixedIds point exclusively to the five real post-traversal captures.
  const fixedIds = includeFixed ? trace.fixedViews.map((v) => unique.find((c) =>
    c.origin === "fixed" && Math.abs(c.position - v.position) < 2)?.id) : [];
  if (fixedIds.some((id) => !id)) throw new Error("Actual fixed capture missing from shadow pool");
  const input = { candidates: unique.map(({ buffer, ...v }) => v), fixedIds,
    storyboard: { ...storyboard, buffer: undefined }, totalHeight: context.totalHeight, reachedEnd: context.reachedEnd };
  const scoringSelection = selectStructuralObservations(input, config);
  const reliabilityRegistry = options.reliabilityRegistry ? buildReliabilityRegistry(trace.reliabilityRecords || [],config,source) : null;
  const selection = reliabilityRegistry ? applyReliabilityRegistry(scoringSelection,fixedIds,reliabilityRegistry) : scoringSelection;
  const repetition = Array.from({ length: 20 }, () => {
    const scored=selectStructuralObservations(input, config);
    return JSON.stringify(reliabilityRegistry ? applyReliabilityRegistry(scored,fixedIds,
      buildReliabilityRegistry(trace.reliabilityRecords || [],config,source)) : scored);
  });
  const selected = selection.selectedIds.map((id) => unique.find((v) => v.id === id));
  const bottom = Math.max(0, context.totalHeight - context.viewportHeight);
  const proposed = selection.mode === "adaptive" || includeFixed ? selected.map((v) => ({ id: v.id, position: v.position,
    visibleRangePx: v.visibleRangePx, observed: true, origin: v.origin,
    afterCompleteTraversal: v.afterCompleteTraversal,
    phaseBRecaptureRequired: !includeFixed || v.afterCompleteTraversal !== true }))
    : fractions.map((f, i) => ({ id: `plannedFixed${i + 1}`, position: Math.round(bottom * f),
      observed: false, phaseBRecaptureRequired: true }));
  const nearest = fractions.map((f) => [...unique].sort((a, b) =>
    Math.abs(a.position - Math.round(bottom * f)) - Math.abs(b.position - Math.round(bottom * f)) || a.position - b.position)[0]);
  const fixed = (trace.fixedViews || []).map((v, i) => ({ ...v, id: `fixed${i + 1}` }));
  const currentProof = fixedProof(fixed, context), shadowProof = includeFixed ? currentProof : fixedProof(nearest, context);
  const missing = [];
  if (!coverage.complete) missing.push("incomplete_phase_a_coverage");
  if (!shadowProof.actualFixedGatePass) missing.push("fixed_gate_numeric_predicates_not_demonstrated");
  if (!shadowProof.allFiveGeometryChecksPass) missing.push("fixed_target_or_height_geometry_not_demonstrated");
  if (!shadowProof.allFivePostTraversal) missing.push("no_post_traversal_revalidation_of_five_control_viewports");
  // The collector does not prove that prior sources/styles/pixels are unchanged
  // after later lazy loading. Signature differences are reported, not repaired.
  if (!includeFixed) missing.push("no_cross_phase_source_layout_identity_proof");
  const comparisonViews = includeFixed ? fixed : nearest;
  const signatures = fixed.map((v, i) => ({ fixedId: v.id, phaseAId: comparisonViews[i]?.id,
    fixedPosition: v.position, phaseAPosition: comparisonViews[i]?.position,
    same64PixelSignature: v.signature === comparisonViews[i]?.signature }));
  const performance = product.capturePerformance || product.error?.capturePerformance;
  const phases = performance?.phases || {};
  const deliveryAverageMs = fixed.length ? (phases.fixed_samples || 0) / fixed.length : null;
  const selectedPersistent = selection.persistentElements.filter((p) => p.deduplicationEligible);
  const adaptiveRecaptures = selected.reduce((count, v) => count + Number(selectedPersistent.some((p) =>
    p.stableObservationIds.includes(v.id) && selected.find((c) => p.stableObservationIds.includes(c.id))?.id !== v.id)), 0);
  const existingRecaptures = performance?.operations.filter((o) => o.phase === "persistent_layer_recapture" && o.operation === "screenshot")
    .reduce((sum, o) => sum + o.count, 0) || 0;
  const plannedRecaptures = includeFixed || selection.mode === "adaptive" ? adaptiveRecaptures : existingRecaptures;
  const recaptureAverageMs = existingRecaptures ? phases.persistent_layer_recapture / existingRecaptures : deliveryAverageMs;
  const freshDeliveryViews = includeFixed ? proposed.filter((v) => v.phaseBRecaptureRequired).length : proposed.length;
  const estimatedMs = deliveryAverageMs === null ? null : (phases.identify_scroller || 0) + (phases.mandatory_traversal || 0) +
    (includeFixed ? phases.fixed_samples || 0 : 0) +
    (phases.storyboard_and_selection || 0) + (phases.finalization || 0) + freshDeliveryViews * deliveryAverageMs +
    plannedRecaptures * recaptureAverageMs;
  const currentSelection = trace.currentSelection;
  const currentStoryboard = trace.currentStoryboard || null;
  const current = { status: product.status || "blocked", strategy: product.captureCoverage?.captureStrategy,
    mode: currentSelection?.mode || product.captureCoverage?.captureStrategy || "blocked",
    positions: product.captureCoverage?.positions || [], fallbackReasons: currentSelection?.fallbackReasons || [],
    selection: currentSelection || null, fixedProof: currentProof };
  const lostUnreliable = (currentSelection?.decisions || []).filter((c) => c.reliability?.reliable === false &&
    !unique.some((v) => Math.abs(v.position - c.position) < 2));
  const measurementFallbackLost = includeFixed && currentSelection?.mode === "fixed_fallback" && selection.mode === "adaptive" &&
    currentSelection.fallbackReasons.some((reason) => reason !== "adaptive_budget_exhausted");
  const report = { version: 1, architecture: includeFixed ? "phase_a_and_five_fixed" : "phase_a_only",
    evidenceOrigin: includeFixed ? "fresh_product_capture_traversal_and_fixed_only" : "fresh_product_capture_mandatory_traversal_only",
    noDeliveredCaptureModification: true, phaseAContext: context,
    rawPhaseAObservations: (trace.phaseA || []).length, rawPoolObservations: source.length,
    deduplicatedPhaseAObservations: includeFixed ? undefined : unique.length,
    ...(reliabilityRegistry ? { reliabilityRegistry } : {}),
    current, shadow: { mode: selection.mode, fallbackReasons: selection.fallbackReasons, proposedViews: proposed,
      ...(reliabilityRegistry ? { scoringSelection, adaptiveEligibility: { eligible:reliabilityRegistry.adaptiveEligible,status:reliabilityRegistry.status } } : {}),
      pool: { candidateCount: unique.length, fixedIds, positions: unique.map((v) => ({id:v.id,position:v.position,
        origin:v.origin,afterCompleteTraversal:v.afterCompleteTraversal,observedTotalHeight:v.observedTotalHeight})) },
      selection, storyboard: { ...storyboard, buffer: undefined }, panelProof: coverage,
      fiveNearestObservedProof: shadowProof, phaseBExecuted: false,
      repeatability: { runs: 20, identical: repetition.filter((s) => s === JSON.stringify(selection)).length } },
    coverageComparison: { strictlyEquivalent: missing.length === 0,
      scope: includeFixed ? "five_fixed_control_evidence_only" : "phase_a_replacement_of_fixed_controls",
      missingEvidence: missing, signatures },
    acceptance: { measurementFallbackPreserved: !measurementFallbackLost,
      simulationCoherent: includeFixed && current.status === "ready_for_vision" && missing.length === 0 && !measurementFallbackLost,
      reasons: measurementFallbackLost ? ["measurement_fallback_not_preserved"] : [],
      excludedUnreliableCandidates: lostUnreliable.map((c) => ({id:c.id,position:c.position,reasons:c.reliability.reasons})),
      proposedSequencingExecuted: false },
    estimate: { isEstimate: true, conditionalOnUnchangedPhaseACost: true, qualityProofResolved: includeFixed && missing.length === 0,
      qualityProofScope: includeFixed ? "five_fixed_control_evidence_only" : "phase_a_replacement_of_fixed_controls",
      currentCaptureMs: product.captureCoverage?.captureTiming?.elapsedMs || performance?.elapsedMs,
      deliveryAverageMs, plannedDeliveryViews: proposed.length, freshDeliveryViews, reusedFixedViews: includeFixed ? proposed.length - freshDeliveryViews : 0,
      plannedPersistentRecaptures: plannedRecaptures,
      estimatedCaptureMs: estimatedMs,
      estimatedSavedMs: estimatedMs === null ? null : (product.captureCoverage?.captureTiming?.elapsedMs || performance?.elapsedMs) - estimatedMs,
      excludesUnimplementedQualityProofCost: !includeFixed } };
  return { report, input, candidates: unique, selected, storyboard, currentStoryboard };
}
module.exports = { analyzeStructuralShadow, fixedProof, panelProof, signature };
