const crypto = require("crypto");
const { versionContext } = require("./direction-versioning.service");
const {
  buildCreativeTerritoriesRequest,
  buildDirectionExpansionRequest,
  referenceCandidates,
  eligibleAssets,
} = require("./design-engine-v2.service");

const VALIDATOR_VERSION = "editorial-primitives-2";
const SEMANTIC_VERSION = "directions-v2-editorial-1";
const copy = (value) => JSON.parse(JSON.stringify(value));
const canonical = (value) => {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === "object") return Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonical(value[key])]));
  return value;
};
const digest = (value) => crypto.createHash("sha256").update(JSON.stringify(canonical(copy(value)))).digest("hex");

function checkpointIdentity(project, references, portfolioSummary, { count, avoid, model, schemas, targetSlot = null, replacesDirectionId = null }) {
  const territoryRequest = buildCreativeTerritoriesRequest(project, references, portfolioSummary, { count, avoid, targetSlot: targetSlot || "A" });
  const ids = count === 1 ? [targetSlot || "A"] : ["A", "B", "C"];
  // Only instructions are taken from these placeholders. No invented territory is sent to OpenAI.
  const placeholders = ids.map((id) => ({ id, likelyReferenceAnchors: [0, 1] }));
  const expansionInstructions = ids.map((id) => buildDirectionExpansionRequest(project, references, portfolioSummary, placeholders, id, { avoid }).instructions);
  return {
    contractVersion: digest({ semanticVersion: SEMANTIC_VERSION, model, reasoning: "high", schemas, territoryInstructions: territoryRequest.instructions, expansionInstructions }),
    contextHash: digest({
      projectId: String(project._id),
      directionVersions: versionContext(project),
      targetSlot,
      replacesDirectionId,
      payload: territoryRequest.payload,
      referenceIds: references.map((reference) => String(reference._id)),
      referenceDetails: referenceCandidates(references),
      referenceImages: references.map((reference) => reference.image),
      assetImages: eligibleAssets(project).map((asset) => ({ assetId: String(asset._id), url: asset.url, publicId: asset.publicId })),
    }),
    ids,
    targetSlot,
    replacesDirectionId,
  };
}

function prepareCheckpoint(existing, identity, count) {
  if (existing) {
    const statuses = ["pending", "running", "received", "valid", "failed"];
    const malformed = !existing.generationId || !Array.isArray(existing.territories) || identity.ids.some((id) => {
      const record = existing.expansions?.[id];
      return !record || !statuses.includes(record.status) || !Number.isInteger(record.attempts) || record.attempts < 0 || (record.status === "valid" && !record.result);
    });
    if (malformed || existing.contractVersion !== identity.contractVersion || existing.contextHash !== identity.contextHash || existing.count !== count) {
      const error = new Error("Le checkpoint de directions est incompatible avec le contrat ou le contexte actuel. Abandonnez-le explicitement avant un nouveau run.");
      error.status = 409;
      error.code = "DIRECTIONS_CHECKPOINT_INCOMPATIBLE";
      throw error;
    }
    return { ...copy(existing), validatorVersion: VALIDATOR_VERSION };
  }
  return {
    generationId: crypto.randomUUID(),
    contractVersion: identity.contractVersion,
    validatorVersion: VALIDATOR_VERSION,
    contextHash: identity.contextHash,
    count,
    targetSlot: identity.targetSlot,
    replacesDirectionId: identity.replacesDirectionId,
    status: "running",
    territoriesResult: null,
    territories: [],
    expansions: Object.fromEntries(identity.ids.map((id) => [id, { status: "pending", result: null, attempts: 0, error: null }])),
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
}

function checkpointError(error) {
  return {
    status: error.status || 500,
    code: error.code || null,
    category: error.validation?.category || null,
    reason: error.validation?.reason || (error.status === 504 ? "timeout" : "stage_failed"),
    fieldPath: error.validation?.fieldPath || null,
  };
}

module.exports = { checkpointIdentity, prepareCheckpoint, checkpointError, VALIDATOR_VERSION };
