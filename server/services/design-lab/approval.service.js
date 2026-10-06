const { requireActiveDirection } = require("./direction-versioning.service");

function frozenProjectError() {
  const error = new Error("Projet approuvé et gelé. Réouvrez-le pour le modifier.");
  error.status = 409;
  return error;
}

function assertProjectEditable(project) {
  if (
    project.status === "approved" ||
    project.approvedGeneration ||
    project.approvedAt ||
    project.approvedSnapshot
  )
    throw frozenProjectError();
}

function snapshotValue(value) {
  return value == null ? null : JSON.parse(JSON.stringify(value));
}

function buildApprovalSnapshot(project, generation, references, approvedAt) {
  const direction = requireActiveDirection(project, generation.directionId);
  const byId = new Map(
    references.map((reference) => [String(reference._id), reference]),
  );
  const directionSnapshot = snapshotValue(direction);
  const styleFrame = direction.styleFrames.id(generation.styleFrameId);
  if (direction.engineVersion !== "v2" || generation.engineVersion !== "v2" || !styleFrame?.approvedAt || !generation.styleFrameId) {
    const error = new Error("La génération doit référencer un Style Frame validé du moteur actuel.");
    error.status = 409;
    throw error;
  }
  if (styleFrame) directionSnapshot.approvedStyleFrameId = generation.styleFrameId;
  return {
    projectId: project._id,
    restaurantId: project.restaurantId || null,
    name: project.name,
    slug: project.slug,
    brief: snapshotValue(project.brief),
    existingWebsiteContext: snapshotValue(project.existingWebsiteContext),
    creativeSettings: snapshotValue(project.creativeSettings),
    assets: project.assets.map(snapshotValue),
    direction: directionSnapshot,
    styleFrame: snapshotValue(styleFrame),
    generation: snapshotValue(generation),
    referencesUsed: direction.referencesUsed.map((id) => {
      const reference = byId.get(String(id));
      return {
        referenceId: id,
        name: reference?.name || "Référence indisponible",
        image: reference?.image || undefined,
        visualTags: reference?.visualTags || [],
        analysis: snapshotValue(reference?.analysis),
      };
    }),
    approvedAt,
  };
}

function approveProject(project, generation, references, approvedAt = new Date()) {
  assertProjectEditable(project);
  const snapshot = buildApprovalSnapshot(
    project,
    generation,
    references,
    approvedAt,
  );
  project.approvedSnapshot = snapshot;
  project.approvedGeneration = generation._id;
  project.approvedAt = approvedAt;
  project.selectedGeneration = generation._id;
  project.selectedDirection = generation.directionId;
  project.status = "approved";
  return snapshot;
}

function reopenProject(project) {
  if (
    project.status !== "approved" &&
    !project.approvedGeneration &&
    !project.approvedAt &&
    !project.approvedSnapshot
  ) {
    const error = new Error("Seul un projet approuvé peut être réouvert.");
    error.status = 409;
    throw error;
  }
  if (project.approvedSnapshot)
    project.approvalHistory.push(snapshotValue(project.approvedSnapshot));
  project.approvedSnapshot = null;
  project.approvedGeneration = null;
  project.approvedAt = null;
  project.status = "exploration";
  return project;
}

module.exports = {
  assertProjectEditable,
  frozenProjectError,
  buildApprovalSnapshot,
  approveProject,
  reopenProject,
};
