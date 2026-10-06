const crypto = require("node:crypto");
const fs = require("node:fs/promises");
const { constants } = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const sharp = require("sharp");
const cloudinary = require("cloudinary").v2;
const Attempt = require("../../models/style-frame-generation-attempt.model");
const openai = require("./openai.service");
const designLab = require("./design-lab.service");
const { styleFramePlan } = require("./design-engine-v2.service");
const folders = require("./cloudinary-folders");

const canonical = (value) => JSON.stringify(value, (_key, item) => item && typeof item === "object" && !Array.isArray(item)
  ? Object.fromEntries(Object.keys(item).sort().map((key) => [key, item[key]])) : item);
const hash = (value) => crypto.createHash("sha256").update(canonical(value)).digest("hex");
const snapshotHash = (direction) => hash({ name: direction.name, concept: direction.concept,
  brandSystem: direction.brandSystem, visualSystem: direction.visualSystem, siteInformationArchitecture: direction.siteInformationArchitecture });
const publicId = (generationId) => `${folders.GENERATIONS}/style-frames/${generationId}`;
const spoolDirectory = () => process.env.DESIGN_LAB_STYLE_FRAME_RECOVERY_DIR || path.join(os.tmpdir(), "gusto-style-frame-recovery");
const spoolPath = (generationId, extension) => {
  if (!/^[a-f0-9-]{36}$/.test(generationId)) throw new Error("Generation ID invalide.");
  return path.join(spoolDirectory(), `${generationId}.${extension}`);
};
const spool = {
  async prepare() { await fs.mkdir(spoolDirectory(), { recursive: true, mode: 0o700 }); await fs.access(spoolDirectory(), constants.W_OK); },
  async write(generationId, buffer, metadata) {
    for (const [extension, content] of [["png", buffer], ["json", JSON.stringify(metadata)]]) {
      const target = spoolPath(generationId, extension);
      await fs.writeFile(`${target}.tmp`, content, { mode: 0o600 });
      await fs.rename(`${target}.tmp`, target);
    }
  },
  async read(generationId) {
    const buffer = await fs.readFile(spoolPath(generationId, "png"));
    const metadata = await fs.readFile(spoolPath(generationId, "json"), "utf8").then(JSON.parse).catch(() => ({}));
    return { buffer, ...metadata };
  },
  async remove(generationId) {
    await Promise.all(["png", "json"].map((extension) => fs.rm(spoolPath(generationId, extension), { force: true })));
  },
};

function category(error, stage) {
  if (error.persistenceError) return "STYLE_FRAME_PERSISTENCE_ERROR";
  if (error.responseInvalid || stage === "response") return "STYLE_FRAME_RESPONSE_INVALID";
  if (stage === "input") return "STYLE_FRAME_INPUT_ERROR";
  if (stage === "download") return "STYLE_FRAME_ASSET_DOWNLOAD_ERROR";
  if (stage === "openai") {
    if (error.status === 504 || error.name === "AbortError") return "STYLE_FRAME_OPENAI_TIMEOUT";
    if (error.httpStatus === 429) return "STYLE_FRAME_OPENAI_RATE_LIMIT";
    if (error.httpStatus >= 500 || error.openaiErrorType === "server_error") return "STYLE_FRAME_OPENAI_SERVER_ERROR";
    if (error.httpStatus >= 400) return "STYLE_FRAME_OPENAI_CLIENT_ERROR";
  }
  if (stage === "cloudinary") return "STYLE_FRAME_CLOUDINARY_ERROR";
  if (["persistence", "prepare", "spool"].includes(stage)) return "STYLE_FRAME_PERSISTENCE_ERROR";
  return "STYLE_FRAME_UNKNOWN_ERROR";
}
function structuredError(error, context) {
  if (error.styleFrame) return error;
  const details = { errorCategory: category(error, context.stage), httpStatus: error.httpStatus || null,
    openaiErrorType: error.openaiErrorType || null, openaiErrorCode: error.openaiErrorCode || null,
    requestId: error.requestId || context.requestId || null, directionId: context.directionId,
    generationId: context.generationId || null, stage: context.stage };
  const messages = {
    STYLE_FRAME_OPENAI_SERVER_ERROR: "Génération interrompue par le service d’image OpenAI. Aucun Style Frame n’a été enregistré. Vous pouvez relancer manuellement.",
    STYLE_FRAME_OPENAI_TIMEOUT: "Délai OpenAI dépassé. Aucun Style Frame n’a été enregistré. Réessayez manuellement.",
    STYLE_FRAME_OPENAI_RATE_LIMIT: "Le service d’image OpenAI est momentanément limité. Vous pouvez relancer manuellement.",
    STYLE_FRAME_INPUT_ERROR: "Les paramètres ou les images du Style Frame sont invalides.",
    STYLE_FRAME_ASSET_DOWNLOAD_ERROR: "Une image source du Style Frame n’a pas pu être chargée.",
    STYLE_FRAME_RESPONSE_INVALID: "Le service d’image n’a pas renvoyé d’image exploitable.",
    STYLE_FRAME_CLOUDINARY_ERROR: "L’image générée n’a pas pu être sauvegardée. Utilisez Récupérer la tentative avant toute nouvelle génération.",
    STYLE_FRAME_PERSISTENCE_ERROR: "La sauvegarde du Style Frame a échoué. Utilisez Récupérer la tentative avant toute nouvelle génération.",
  };
  const wrapped = Object.assign(new Error(messages[details.errorCategory] || "La génération du Style Frame a échoué. Consultez les détails de la tentative."), {
    status: error.status || (details.errorCategory === "STYLE_FRAME_INPUT_ERROR" ? 400 : 502), styleFrame: details,
  });
  if (context.stage === "input" && [404, 409].includes(error.status)) wrapped.message = error.message;
  if (context.stage === "prepare") wrapped.message = "La préparation de la tentative a échoué. Aucun appel OpenAI n’a été effectué.";
  // Keep the standard upstream server-error message; arbitrary messages may
  // echo a prompt and therefore are not safe to print verbatim.
  const knownServerMessage = /^The server had an error while processing your request\.$/.test(error.message)
    || /^The server had an error while processing your request\. Sorry about that! You can retry your request, or contact us through our help center at help\.openai\.com if (?:the error persists|you keep seeing this error)\. \(Please include the request ID req_[A-Za-z0-9_-]+ in your message\.\)$/.test(error.message);
  const serverMessage = details.errorCategory === "STYLE_FRAME_OPENAI_SERVER_ERROR" && knownServerMessage ? error.message : null;
  console.error(JSON.stringify({ event: "style-frame:failed", ...details, ...(serverMessage ? { message: serverMessage } : {}) }));
  return wrapped;
}
const summary = (attempt) => Object.fromEntries(["generationId", "directionId", "mode", "status", "stage", "createdAt", "selectedMomentIds", "selectedClientAssetIds", "selectedReferenceIds", "openaiRequestId", "errorCategory", "httpStatus", "openaiErrorType", "openaiErrorCode", "cloudinaryPublicId", "secureUrl"].map((key) => [key, attempt[key] ?? null]));
const defaults = () => ({
  create: (data) => Attempt.create(data),
  update: (generationId, data) => Attempt.updateOne({ generationId }, { $set: data }),
  find: (projectId, generationId) => Attempt.findOne({ projectId, generationId }).select("+plan +refinementFeedback"),
  pending: (projectId, directionId) => Attempt.findOne({ projectId, directionId, $or: [
    { status: "uploaded" }, { status: "failed", errorCategory: { $in: ["STYLE_FRAME_CLOUDINARY_ERROR", "STYLE_FRAME_PERSISTENCE_ERROR"] } },
    { status: "running", stage: "openai" },
  ] }),
  download: (image) => designLab.downloadOwnImage(image),
  generate: (...args) => openai.generateImage(...args),
  upload: (buffer, generationId) => designLab.uploadImage(buffer, folders.GENERATIONS, { publicId: publicId(generationId) }),
  lookup: async (generationId) => {
    try {
      const result = await cloudinary.api.resource(publicId(generationId), { resource_type: "image" });
      return { url: result.secure_url, publicId: result.public_id };
    } catch (error) { if (error.error?.http_code === 404 || error.http_code === 404) return null; throw error; }
  },
  spool,
});

async function failAttempt(error, context, overrides = {}) {
  const deps = { ...defaults(), ...overrides };
  const wrapped = structuredError(error, context);
  if (context.generationId) await deps.update(context.generationId, { status: "failed", stage: context.stage,
    errorCategory: wrapped.styleFrame.errorCategory, httpStatus: wrapped.styleFrame.httpStatus,
    openaiErrorType: wrapped.styleFrame.openaiErrorType, openaiErrorCode: wrapped.styleFrame.openaiErrorCode,
    openaiRequestId: wrapped.styleFrame.requestId }).catch(() => {});
  return wrapped;
}

async function prepareStyleFrame({ project, direction, references, mode, currentFrame, feedback, retryGenerationId }, context, overrides = {}) {
  const deps = { ...defaults(), ...overrides };
  context.stage = "input";
  const plan = styleFramePlan(project, direction, references, { mode, currentFrame, feedback });
  const pending = await deps.pending(project._id, direction._id);
  if (pending) throw Object.assign(new Error("Récupérez la tentative existante avant une nouvelle génération."), { status: 409 });
  const model = plan.mode === "refine" ? openai.MODEL_CONFIG.imageEditModel : openai.MODEL_CONFIG.imageGenerationModel;
  const planHash = hash({ plan, model, quality: openai.MODEL_CONFIG.imageQuality });
  const directionSnapshotHash = snapshotHash(direction);
  let effectivePlan = plan;
  if (retryGenerationId) {
    const old = await deps.find(project._id, retryGenerationId);
    if (!old || String(old.directionId) !== String(direction._id) || old.planHash !== planHash || old.directionSnapshotHash !== directionSnapshotHash)
      throw Object.assign(new Error("Le contexte a changé ; choisissez Nouvelle proposition."), { status: 409 });
    if (old.status !== "failed" || ["STYLE_FRAME_PERSISTENCE_ERROR", "STYLE_FRAME_CLOUDINARY_ERROR"].includes(old.errorCategory) || old.secureUrl)
      throw Object.assign(new Error("Récupérez la tentative existante sans nouvel appel image."), { status: 409 });
    effectivePlan = old.plan;
  }
  context.stage = "prepare";
  context.generationId = crypto.randomUUID();
  await deps.spool.prepare(); // Fail before spending if the recovery directory is unavailable.
  const attempt = await deps.create({ generationId: context.generationId, projectId: project._id, directionId: direction._id,
    mode: plan.mode, status: "prepared", stage: context.stage, planHash, directionSnapshotHash,
    selectedMomentIds: plan.styleFrameCoverage.selectedMomentIds,
    selectedClientAssetIds: plan.inputs.filter((input) => input.kind === "CLIENT_ASSET").map((input) => input.assetId),
    selectedReferenceIds: plan.inputs.filter((input) => input.kind === "VISUAL_REFERENCE").map((input) => input.referenceId),
    currentFrameId: currentFrame ? String(currentFrame._id) : null, refinementFeedback: plan.refinementFeedback,
    plan: effectivePlan, model, quality: openai.MODEL_CONFIG.imageQuality, cloudinaryPublicId: publicId(context.generationId) });
  return { attempt, plan: effectivePlan };
}

function officialFrame(attempt, plan, image) {
  return { generationId: attempt.generationId, mode: attempt.mode, image, prompt: plan.officialPrompt,
    model: attempt.model, size: plan.size, styleFrameCoverage: plan.styleFrameCoverage,
    inputs: plan.inputs.map(({ image: _image, ...input }) => input) };
}

async function executeStyleFrame(prepared, context, overrides = {}) {
  const deps = { ...defaults(), ...overrides };
  const { attempt, plan } = prepared;
  context.stage = "download";
  await deps.update(attempt.generationId, { status: "running", stage: context.stage }).catch((error) => { error.persistenceError = true; throw error; });
  const images = await Promise.all(plan.inputs.map((input) => deps.download(input.image)));
  context.stage = "openai";
  await deps.update(attempt.generationId, { stage: context.stage }).catch((error) => { error.persistenceError = true; throw error; });
  console.info(JSON.stringify({ event: "style-frame:openai", generationId: attempt.generationId, directionId: context.directionId, mode: attempt.mode }));
  // Exactly one paid call, including refinement. No automatic retry.
  const output = await deps.generate(plan.prompt, images, { size: plan.size, isVariation: attempt.mode === "refine" });
  context.requestId = output.requestId || null;
  context.stage = "response";
  const metadata = await sharp(output.buffer).metadata().catch(() => null);
  if (!metadata?.width || !metadata?.height || metadata.format !== "png")
    throw Object.assign(new Error("Image OpenAI invalide."), { responseInvalid: true, httpStatus: output.httpStatus, requestId: context.requestId });
  // Binary only; no base64 in Mongo. Keep it until official promotion succeeds.
  context.stage = "spool";
  let spoolError;
  await deps.spool.write(attempt.generationId, output.buffer, { model: output.model, requestId: context.requestId }).catch((error) => { spoolError = error; });
  context.stage = "cloudinary";
  let image;
  try { image = await deps.upload(output.buffer, attempt.generationId); }
  catch (error) { if (spoolError) context.stage = "spool"; throw error; }
  context.stage = "persistence";
  attempt.model = output.model;
  await deps.update(attempt.generationId, { status: "uploaded", stage: context.stage, model: output.model,
    openaiRequestId: context.requestId, cloudinaryPublicId: image.publicId, secureUrl: image.url });
  return officialFrame(attempt, plan, image);
}

async function recoverStyleFrame(project, direction, generationId, context, overrides = {}) {
  const deps = { ...defaults(), ...overrides };
  context.generationId = generationId;
  context.stage = "input";
  const attempt = await deps.find(project._id, generationId);
  if (!attempt || String(attempt.directionId) !== String(direction._id)) throw Object.assign(new Error("Tentative introuvable."), { status: 404 });
  const existing = direction.styleFrames.find((frame) => frame.generationId === generationId);
  if (existing) return existing; // Response/attempt update lost after a successful project save.
  if (attempt.directionSnapshotHash !== snapshotHash(direction)) throw Object.assign(new Error("La direction a changé ; récupération non promouvable."), { status: 409 });
  context.requestId = attempt.openaiRequestId;
  context.stage = "cloudinary";
  let image = await deps.lookup(generationId);
  if (!image) {
    const saved = await deps.spool.read(generationId).catch(() => null);
    if (!saved) {
      context.stage = "input";
      // Explicit recovery checked both stores. A later manual new proposal is
      // possible; this recovery request itself never calls OpenAI.
      await deps.update(generationId, { status: "failed", errorCategory: "STYLE_FRAME_RESPONSE_INVALID", stage: "input" });
      throw Object.assign(new Error("Aucune image récupérable pour cette tentative. Aucun appel OpenAI n’a été effectué. Une nouvelle proposition manuelle est possible."), { status: 409 });
    }
    context.requestId = saved.requestId || context.requestId;
    if (saved.model) attempt.model = saved.model;
    image = await deps.upload(saved.buffer, generationId);
  }
  context.stage = "persistence";
  await deps.update(generationId, { status: "uploaded", stage: context.stage, model: attempt.model,
    cloudinaryPublicId: image.publicId, secureUrl: image.url, openaiRequestId: context.requestId });
  return officialFrame(attempt, attempt.plan, image);
}

async function completeAttempt(context, overrides = {}) {
  const deps = { ...defaults(), ...overrides };
  try {
    await deps.update(context.generationId, { status: "completed", stage: "completed", errorCategory: null,
      httpStatus: null, openaiErrorType: null, openaiErrorCode: null });
    await deps.spool.remove(context.generationId);
  } catch (_error) {
    // Official project save already succeeded. Recovery detects generationId.
    console.error(JSON.stringify({ event: "style-frame:journal_pending", generationId: context.generationId, stage: "completed" }));
  }
}

module.exports = { prepareStyleFrame, executeStyleFrame, recoverStyleFrame, completeAttempt, failAttempt,
  structuredError, summary, category, hash, snapshotHash, publicId, spool };
