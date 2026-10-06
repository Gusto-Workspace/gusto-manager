const PRIMARY_SLOTS = ["A", "B", "C"];
const id = (value) => String(value?._id || value || "");
const invalid = (message) => Object.assign(new Error(message), { status: 409 });
const isActivePrimary = (direction) => direction?.status === "active" && PRIMARY_SLOTS.includes(direction.slot);

function activeDirections(project) {
  return (project.directions || []).filter(isActivePrimary).sort((a, b) => PRIMARY_SLOTS.indexOf(a.slot) - PRIMARY_SLOTS.indexOf(b.slot));
}
function directionHistory(project, slot = null) {
  return (project.directions || []).filter((direction) => !isActivePrimary(direction) && (!slot || direction.slot === slot));
}
function requireActiveDirection(project, directionId) {
  const direction = (project.directions || []).find((item) => id(item) === id(directionId));
  if (!direction) throw Object.assign(new Error("Direction introuvable."), { status: 404 });
  if (!isActivePrimary(direction)) throw invalid("Cette version de direction est historique ; sélectionnez une version principale active.");
  return direction;
}

function validateDirectionVersions(directions = []) {
  const active = directions.filter(isActivePrimary);
  const initialized = directions.some((direction) => ["active", "archived"].includes(direction.status));
  if (initialized && (active.length !== 3 || new Set(active.map((direction) => direction.slot)).size !== 3))
    throw invalid("Un set principal doit contenir exactement une direction active pour chaque slot A/B/C.");
  const versions = new Set();
  for (const direction of directions) {
    if (direction.status === "legacy_unassigned") {
      if (direction.slot != null || direction.version != null || direction.replacesDirectionId != null)
        throw invalid("Une direction legacy non assignée ne peut pas occuper un slot principal.");
      continue;
    }
    if (!["active", "archived"].includes(direction.status) || !PRIMARY_SLOTS.includes(direction.slot)
      || !Number.isInteger(direction.version) || direction.version < 1 || !direction.generationId)
      throw invalid("Métadonnées de version de direction invalides.");
    const key = `${direction.slot}:${direction.version}`;
    if (versions.has(key)) throw invalid("Version de slot dupliquée.");
    versions.add(key);
    if (direction.version > 1 && !direction.replacesDirectionId) throw invalid("Une nouvelle version doit identifier la version remplacée.");
    if (direction.replacesDirectionId) {
      const previous = directions.find((item) => id(item) === id(direction.replacesDirectionId));
      if (!previous || previous.slot !== direction.slot || previous.version >= direction.version || previous.status !== "archived")
        throw invalid("La version remplacée doit être une version archivée antérieure du même slot.");
    }
  }
}

function versionContext(project) {
  return (project.directions || []).filter((direction) => PRIMARY_SLOTS.includes(direction.slot))
    .map((direction) => ({ id: id(direction), slot: direction.slot, version: direction.version, status: direction.status }));
}
function clearHistoricalSelection(project) {
  const activeIds = new Set(activeDirections(project).map(id));
  const generation = (project.generations || []).find((item) => id(item) === id(project.selectedGeneration));
  if ((project.selectedDirection && !activeIds.has(id(project.selectedDirection)))
    || (project.selectedGeneration && (!generation || !activeIds.has(id(generation.directionId)) || id(generation.directionId) !== id(project.selectedDirection)))) {
    project.selectedDirection = null;
    project.selectedGeneration = null;
  }
}
function newVersion(project, raw, slot, generationId) {
  const history = project.directions.filter((direction) => direction.slot === slot);
  const previous = history.find(isActivePrimary) || [...history].sort((a, b) => b.version - a.version)[0];
  const data = raw.toObject ? raw.toObject() : { ...raw };
  for (const key of ["_id", "createdAt", "updatedAt", "styleFrames", "approvedStyleFrameId", "slot", "status", "version", "generationId", "replacesDirectionId"]) delete data[key];
  return { ...data, slot, version: Math.max(0, ...history.map((direction) => direction.version || 0)) + 1,
    status: "active", generationId, replacesDirectionId: previous?._id || null, styleFrames: [], approvedStyleFrameId: null };
}
function assertEditableVersionSet(project) {
  require("./approval.service").assertProjectEditable(project);
  validateDirectionVersions(project.directions);
}
function promoteDirectionSet(project, directions, generationId) {
  assertEditableVersionSet(project);
  if (!generationId || directions.length !== 3 || directions.some((direction, index) => direction.slot && direction.slot !== PRIMARY_SLOTS[index]))
    throw invalid("Le run doit fournir exactement trois directions dans l'ordre A/B/C avec son generationId.");
  const replacements = directions.map((direction, index) => newVersion(project, direction, PRIMARY_SLOTS[index], generationId));
  for (const direction of activeDirections(project)) direction.status = "archived";
  project.directions.push(...replacements);
  clearHistoricalSelection(project);
  validateDirectionVersions(project.directions);
  return activeDirections(project);
}
function promoteSingleDirection(project, directionId, replacement, generationId) {
  assertEditableVersionSet(project);
  const previous = requireActiveDirection(project, directionId);
  if (!generationId || (replacement.slot && replacement.slot !== previous.slot)) throw invalid("Slot ou generationId de régénération incohérent.");
  const next = newVersion(project, replacement, previous.slot, generationId);
  previous.status = "archived";
  project.directions.push(next);
  clearHistoricalSelection(project);
  validateDirectionVersions(project.directions);
  return project.directions.at(-1);
}

module.exports = { PRIMARY_SLOTS, isActivePrimary, activeDirections, directionHistory, requireActiveDirection,
  validateDirectionVersions, versionContext, clearHistoricalSelection, promoteDirectionSet, promoteSingleDirection };
