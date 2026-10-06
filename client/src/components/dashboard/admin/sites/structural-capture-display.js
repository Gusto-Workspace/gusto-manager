export function structuralCaptureDisplay(reference) {
  const captures = reference?.captures || [];
  if (reference?.captureCoverage?.captureStrategy === "sampled")
    return { visibleCaptures: captures, visionOverview: null };
  return {
    visibleCaptures: captures.filter(
      (view) => !["visionOverview", "overview"].includes(view.type),
    ),
    visionOverview:
      captures.find((view) => view.type === "visionOverview") ||
      captures.find((view) => view.type === "overview") ||
      null,
  };
}
