const crypto = require("node:crypto");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const sharp = require("sharp");
const cloudinary = require("cloudinary").v2;
const Attempt = require("../../models/homepage-generation-attempt.model");
const openai = require("./openai.service");
const designLab = require("./design-lab.service");
const { homepageV2Plan, IMAGE_INPUT_LIMIT } = require("./design-engine-v2.service");
const { requireActiveDirection } = require("./direction-versioning.service");
const { assertProjectEditable } = require("./approval.service");
const { assembleChapters } = require("./image-assembly.service");
const folders = require("./cloudinary-folders");

const CONTRACT_VERSION = "homepage-v2-checkpoint-1";
const OPERATION_LOCK_STALE_MS = 10 * 60 * 1000;
function isStaleOperation(project, now = Date.now()) {
  const startedAt = new Date(project.operationStartedAt).getTime();
  return /^homepage:/.test(project.operation || "") && Number.isFinite(startedAt)
    && project.operationStartedAt != null && startedAt < now - OPERATION_LOCK_STALE_MS;
}
const own = (value) => JSON.parse(JSON.stringify(value?.toObject ? value.toObject() : value));
const canonical = (value) => JSON.stringify(value, (_key, item) => item && typeof item === "object" && !Array.isArray(item)
  ? Object.fromEntries(Object.keys(item).sort().map((key) => [key, item[key]])) : item);
const hash = (value) => crypto.createHash("sha256").update(canonical(value)).digest("hex");
const bytesHash = (buffer) => crypto.createHash("sha256").update(buffer).digest("hex");
const conflict = (message, code = "HOMEPAGE_INCOMPATIBLE") => Object.assign(new Error(message), { status: 409, code });
const publicId = (generationId, key) => `${folders.GENERATIONS}/homepages/${generationId}/${key}`;
const spoolDirectory = () => process.env.DESIGN_LAB_HOMEPAGE_RECOVERY_DIR || path.join(os.tmpdir(), "gusto-homepage-recovery");
function spoolPath(generationId, key, extension) {
  if (!/^[a-f0-9-]{36}$/.test(generationId) || !/^(chapter-[0-2]|assembled)$/.test(key)) throw new Error("Identifiant de récupération invalide.");
  return path.join(spoolDirectory(), `${generationId}-${key}.${extension}`);
}
const spool = {
  async prepare() { await fs.mkdir(spoolDirectory(), { recursive: true, mode: 0o700 }); await fs.access(spoolDirectory(), require("node:fs").constants.W_OK); },
  async write(generationId, key, buffer, metadata) {
    // Flush/rename each file before trying Cloudinary. Keep the original PNG bytes.
    for (const [extension, content] of [["png", buffer], ["json", JSON.stringify(metadata)]]) {
      const target = spoolPath(generationId, key, extension);
      const file = await fs.open(`${target}.tmp`, "w", 0o600);
      try { await file.writeFile(content); await file.sync(); } finally { await file.close(); }
      await fs.rename(`${target}.tmp`, target);
    }
  },
  async read(generationId, key) {
    const buffer = await fs.readFile(spoolPath(generationId, key, "png"));
    const metadata = await fs.readFile(spoolPath(generationId, key, "json"), "utf8").then(JSON.parse).catch(() => ({}));
    return { buffer, ...metadata };
  },
  async remove(generationId, keys) {
    await Promise.all(keys.flatMap((key) => ["png", "json"].map((extension) => fs.rm(spoolPath(generationId, key, extension), { force: true }))));
  },
};
const defaults = () => ({
  create: async (data) => (await Attempt.create(data)).toObject(),
  find: (projectId, generationId) => Attempt.findOne({ projectId, generationId }).select("+plan").lean(),
  pending: (projectId) => Attempt.findOne({ projectId, blocking: true }).lean(),
  update: (attempt, patch) => Attempt.updateOne({ generationId: attempt.generationId, revision: attempt.revision, status: { $ne: "abandoned" } }, { $set: patch, $inc: { revision: 1 } }),
  download: (image) => designLab.downloadOwnImage(image, 48 * 1024 * 1024),
  generate: (...args) => openai.generateImage(...args),
  upload: (buffer, generationId, key) => designLab.uploadImage(buffer, folders.GENERATIONS, { publicId: publicId(generationId, key), format: "png" }),
  lookup: async (generationId, key) => {
    try {
      const result = await cloudinary.api.resource(publicId(generationId, key), { resource_type: "image" });
      return { publicId: result.public_id, url: result.secure_url };
    } catch (error) { if ((error.error?.http_code || error.http_code) === 404) return null; throw error; }
  },
  assemble: assembleChapters,
  spool,
});
async function checkpoint(attempt, patch, deps) {
  const result = await deps.update(attempt, patch);
  if (result.matchedCount !== 1) throw conflict("La tentative a changé pendant l’opération.", "HOMEPAGE_CHECKPOINT_CONFLICT");
  Object.assign(attempt, patch, { revision: attempt.revision + 1 });
}
function identity(project, direction) {
  assertProjectEditable(project);
  requireActiveDirection(project, direction._id);
  const plan = own(homepageV2Plan(project, direction));
  const contextHash = hash({
    projectId: String(project._id), name: project.name, brief: own(project.brief || {}),
    documentaryContext: own(project.existingWebsiteContext || null), creativeSettings: own(project.creativeSettings || {}),
    direction: { id: String(direction._id), slot: direction.slot, version: direction.version, generationId: direction.generationId,
      name: direction.name, concept: direction.concept, brandSystem: direction.brandSystem, visualSystem: direction.visualSystem,
      siteInformationArchitecture: direction.siteInformationArchitecture },
    styleFrame: plan.styleFrame,
    // Include the eligible input pool/order: a changed assignment must not silently resume.
    assets: own(project.assets || []),
  });
  const model = openai.MODEL_CONFIG.imageGenerationModel, quality = openai.MODEL_CONFIG.imageQuality;
  return { plan, contextHash, model, quality, planHash: hash({ contractVersion: CONTRACT_VERSION, plan, model, quality }) };
}
async function prepare({ project, direction, generationId }, context, overrides = {}) {
  const deps = { ...defaults(), ...overrides };
  context.stage = "input";
  const current = identity(project, direction);
  let attempt;
  if (generationId) {
    attempt = await deps.find(project._id, generationId);
    if (!attempt || String(attempt.directionId) !== String(direction._id)) throw Object.assign(new Error("Tentative introuvable."), { status: 404 });
    context.generationId = generationId;
    context.attempt = attempt;
    // An acknowledged official result is already promoted; never append it again.
    if (project.generations.some((item) => item.generationId === generationId)) return { attempt, plan: attempt.plan, alreadyPromoted: true };
    if (attempt.status === "abandoned") throw conflict("Cette tentative a été abandonnée.");
    if (attempt.contractVersion !== CONTRACT_VERSION || attempt.contextHash !== current.contextHash || attempt.planHash !== current.planHash
      || attempt.planHash !== hash({ contractVersion: attempt.contractVersion, plan: attempt.plan, model: attempt.model, quality: attempt.quality }))
      throw conflict("Le contexte ou le contrat homepage a changé. Abandonnez explicitement cette tentative avant d’en créer une nouvelle.");
  } else {
    const pending = await deps.pending(project._id);
    if (pending) throw conflict("Une tentative homepage existe déjà. Reprenez, finalisez ou abandonnez-la explicitement.", "HOMEPAGE_ATTEMPT_PENDING");
    context.stage = "prepare";
    await deps.spool.prepare();
    context.generationId = crypto.randomUUID();
    attempt = await deps.create({ generationId: context.generationId, projectId: project._id, directionId: direction._id,
      directionSlot: direction.slot, directionVersion: direction.version, styleFrameId: current.plan.styleFrameId,
      status: "prepared", stage: "prepare", blocking: true, revision: 0, contractVersion: CONTRACT_VERSION,
      contextHash: current.contextHash, planHash: current.planHash, plan: current.plan, model: current.model, quality: current.quality,
      chapters: current.plan.segments.map((segment) => ({ index: segment.index, status: "pending", uncertain: false,
        selectedMomentIds: segment.sections.map((section) => section.id), selectedAssetIds: segment.assets.map((asset) => String(asset._id)),
        cloudinaryPublicId: publicId(context.generationId, `chapter-${segment.index}`) })),
      assembled: { status: "pending", cloudinaryPublicId: publicId(context.generationId, "assembled") },
    });
  }
  context.attempt = attempt;
  return { attempt, plan: attempt.plan };
}
async function validPNG(buffer, size, expectedHash) {
  const metadata = await sharp(buffer).metadata().catch(() => null);
  if (metadata?.format !== "png" || metadata.width !== size.width || metadata.height !== size.height || (expectedHash && bytesHash(buffer) !== expectedHash))
    throw Object.assign(new Error("Image checkpoint invalide ou altérée."), { status: 502, code: "HOMEPAGE_IMAGE_INVALID" });
}
async function findImage(attempt, key, size, expectedHash, deps) {
  const image = await deps.lookup(attempt.generationId, key);
  if (image) {
    const downloaded = await deps.download(image);
    await validPNG(downloaded.buffer, size, expectedHash);
    return { image, buffer: downloaded.buffer };
  }
  const saved = await deps.spool.read(attempt.generationId, key).catch((error) => { if (error.code === "ENOENT") return null; throw error; });
  if (!saved) return null;
  await validPNG(saved.buffer, size, expectedHash || saved.sha256);
  return { buffer: saved.buffer, saved };
}
async function retain(buffer, attempt, key, metadata, deps) {
  let spoolError;
  await deps.spool.write(attempt.generationId, key, buffer, { ...metadata, sha256: bytesHash(buffer) }).catch((error) => { spoolError = error; });
  try { return await deps.upload(buffer, attempt.generationId, key); }
  catch (error) {
    // An upload may have succeeded but lost its acknowledgement. Stable IDs
    // allow the next manual request to look it up without a new paid call.
    if (spoolError) error.storageUncertain = true;
    throw error;
  }
}
function official(attempt, plan, image) {
  const assets = [...new Map(plan.segments.flatMap((segment) => segment.assets).map((asset) => [String(asset._id), asset])).values()];
  return { generationId: attempt.generationId, engineVersion: "v2", styleFrameId: attempt.styleFrameId,
    directionId: attempt.directionId, parentGenerationId: null, userPrompt: "",
    generatedPrompt: plan.segments.map((segment) => segment.prompt).join("\n\n--- NEXT CHAPTER ---\n\n"), image, model: attempt.model,
    assetsUsed: assets.map((asset) => ({ assetId: asset._id, name: asset.name, role: asset.role, signature: asset.signature })),
    generationStrategy: { type: plan.strategy, overlapPx: plan.overlapPx, homepageBlueprint: plan.homepageBlueprint,
      segments: plan.segments.map((segment) => ({ index: segment.index, width: segment.size.width, height: segment.size.height,
        sections: segment.sections.map((section) => section.contentIntent), sectionIds: segment.sections.map((section) => section.id), assetIds: segment.assets.map((asset) => asset._id) })) },
    outputDimensions: { width: plan.width, height: plan.height } };
}
async function execute(prepared, context, { allowGenerate = true, confirmUncertainRetry = false, onProgress = async () => {} } = {}, overrides = {}) {
  const deps = { ...defaults(), ...overrides }, { attempt, plan } = prepared;
  if (prepared.alreadyPromoted) return null;
  const finalSize = { width: plan.width, height: plan.height };
  context.stage = "recovery";
  const assembled = await findImage(attempt, "assembled", finalSize, attempt.assembled.sha256, deps);
  if (assembled) {
    const image = assembled.image || await deps.upload(assembled.buffer, attempt.generationId, "assembled");
    context.stage = "persistence";
    await checkpoint(attempt, { status: "ready", stage: context.stage, assembled: { status: "persisted", cloudinaryPublicId: image.publicId, secureUrl: image.url, sha256: bytesHash(assembled.buffer) } }, deps);
    return official(attempt, plan, image);
  }
  const rendered = [], downloaded = new Map();
  let frameImage;
  for (const segment of plan.segments) {
    context.chapterIndex = segment.index;
    context.stage = `chapter_${segment.index + 1}`;
    const chapter = attempt.chapters[segment.index], key = `chapter-${segment.index}`;
    await onProgress(context.stage);
    let found = await findImage(attempt, key, segment.size, chapter.sha256, deps);
    if (!found) {
      if (chapter.status === "persisted") throw conflict("Un chapitre déjà payé est introuvable. Aucun nouvel appel automatique n’est autorisé.", "HOMEPAGE_CHECKPOINT_MISSING");
      if (!allowGenerate) throw conflict("Il manque un chapitre. Utilisez Reprendre la génération ; la finalisation ne lance jamais OpenAI.", "HOMEPAGE_CHAPTER_MISSING");
      if ((chapter.uncertain || chapter.status === "generating") && !confirmUncertainRetry)
        throw conflict("L’appel précédent peut avoir été traité sans réponse récupérée. Confirmez explicitement une nouvelle tentative potentiellement payante.", "HOMEPAGE_UNCERTAIN_CALL");
      frameImage ||= await deps.download(plan.styleFrame.image);
      const images = [frameImage];
      if (rendered.length) {
        images.push({ buffer: rendered.at(-1), mime: "image/png" });
        if (plan.overlapPx) images.push({ buffer: await sharp(rendered.at(-1)).extract({ left: 0,
          top: plan.segments[segment.index - 1].size.height - plan.overlapPx, width: segment.size.width, height: plan.overlapPx }).png().toBuffer(), mime: "image/png" });
      }
      for (const asset of segment.assets) {
        if (!downloaded.has(String(asset._id))) downloaded.set(String(asset._id), await deps.download(asset));
        images.push(downloaded.get(String(asset._id)));
      }
      if (images.length > IMAGE_INPUT_LIMIT) throw Object.assign(new Error("Trop d’images pour la homepage."), { status: 400 });
      chapter.status = "generating"; chapter.uncertain = true; chapter.error = undefined;
      await checkpoint(attempt, { status: "running", stage: context.stage, chapters: attempt.chapters }, deps);
      console.info("[design-lab] homepage:chapter_call", { generationId: attempt.generationId, chapter: segment.index + 1, model: attempt.model });
      let output;
      try { output = await deps.generate(segment.prompt, images, { size: `${segment.size.width}x${segment.size.height}` }); }
      catch (error) {
        chapter.status = "failed";
        chapter.uncertain = !error.httpStatus || error.status === 504;
        chapter.openaiRequestId = error.requestId || null;
        chapter.error = { code: chapter.uncertain ? "HOMEPAGE_UNCERTAIN_CALL" : "HOMEPAGE_OPENAI_ERROR", httpStatus: error.httpStatus || null };
        await checkpoint(attempt, { status: "failed", stage: context.stage, chapters: attempt.chapters }, deps);
        throw error;
      }
      chapter.openaiRequestId = output.requestId || null;
      await validPNG(output.buffer, segment.size);
      // Never proceed to the next chapter while its predecessor is RAM-only.
      const image = await retain(output.buffer, attempt, key, { requestId: chapter.openaiRequestId, model: output.model }, deps);
      found = { image, buffer: output.buffer };
    }
    const image = found.image || await deps.upload(found.buffer, attempt.generationId, key);
    chapter.status = "persisted"; chapter.uncertain = false; chapter.error = undefined;
    chapter.openaiRequestId ||= found.saved?.requestId || null;
    chapter.cloudinaryPublicId = image.publicId; chapter.secureUrl = image.url; chapter.sha256 = bytesHash(found.buffer);
    await checkpoint(attempt, { status: "running", stage: context.stage, chapters: attempt.chapters }, deps);
    rendered.push(found.buffer);
    console.info("[design-lab] homepage:chapter_persisted", { generationId: attempt.generationId, chapter: segment.index + 1 });
    await onProgress(context.stage); // Heartbeat must succeed before spending again.
  }
  context.chapterIndex = null;
  context.stage = "assembly";
  await checkpoint(attempt, { stage: context.stage }, deps); await onProgress(context.stage);
  const buffer = await deps.assemble(rendered, plan.segments.map((segment) => segment.size), plan.overlapPx);
  context.stage = "upload";
  await checkpoint(attempt, { stage: context.stage }, deps); await onProgress(context.stage);
  const image = await retain(buffer, attempt, "assembled", { model: attempt.model }, deps);
  context.stage = "persistence";
  await checkpoint(attempt, { status: "ready", stage: context.stage,
    assembled: { status: "persisted", cloudinaryPublicId: image.publicId, secureUrl: image.url, sha256: bytesHash(buffer) } }, deps);
  return official(attempt, plan, image);
}
function promote(project, generation) {
  const existing = project.generations.find((item) => item.generationId === generation?.generationId);
  if (existing) return existing;
  if (!generation) return null;
  requireActiveDirection(project, generation.directionId);
  project.generations.push(generation);
  const saved = project.generations.at(-1);
  project.selectedDirection = saved.directionId; project.selectedGeneration = saved._id; project.status = "exploration";
  return saved;
}
async function complete(context, overrides = {}) {
  const deps = { ...defaults(), ...overrides }, attempt = context.attempt;
  try {
    await checkpoint(attempt, { status: "completed", stage: "completed", blocking: false, errorCode: null }, deps);
    await deps.spool.remove(attempt.generationId, [...attempt.chapters.map((chapter) => `chapter-${chapter.index}`), "assembled"]);
  } catch (_error) { console.warn("[design-lab] homepage:journal_pending", { generationId: context.generationId }); }
}
async function fail(error, context, overrides = {}) {
  const deps = { ...defaults(), ...overrides };
  const details = { generationId: context.generationId || null, stage: context.stage, chapterIndex: context.chapterIndex ?? null,
    code: error.code || (context.stage?.startsWith("chapter_") ? "HOMEPAGE_CHAPTER_ERROR" : "HOMEPAGE_PERSISTENCE_ERROR") };
  // Input conflicts must not mutate an existing attempt (especially completed/abandoned).
  if (context.attempt && context.stage !== "input") await checkpoint(context.attempt, { status: "failed", stage: context.stage, errorCode: details.code }, deps).catch(() => {});
  console.warn("[design-lab] homepage:failed", details);
  const message = error.status === 409 || context.stage === "input" ? error.message
    : context.stage === "prepare" ? "La préparation de la tentative homepage a échoué. Aucun appel OpenAI n’a été effectué."
    : context.stage?.startsWith("chapter_") ? `Génération interrompue au chapitre ${context.chapterIndex + 1}. Les chapitres déjà sauvegardés ont été conservés. Reprenez la tentative pour les réutiliser.`
      : "La finalisation de la homepage a échoué. Les résultats sauvegardés sont conservés ; récupérez la tentative sans nouvelle génération.";
  return Object.assign(new Error(message), { status: error.status || 502, homepage: details });
}
async function abandon(project, generationId, overrides = {}) {
  assertProjectEditable(project);
  const deps = { ...defaults(), ...overrides }, attempt = await deps.find(project._id, generationId);
  if (!attempt) throw Object.assign(new Error("Tentative introuvable."), { status: 404 });
  if (attempt.status === "completed" || project.generations.some((generation) => generation.generationId === generationId))
    throw conflict("Une homepage officielle ne peut pas être abandonnée via son journal.");
  if (attempt.status !== "abandoned") await checkpoint(attempt, { status: "abandoned", blocking: false, stage: "abandoned" }, deps);
  // No deletion: historical paid chapters, official homepages and other assets survive.
}
function summary(attempt) {
  return { generationId: attempt.generationId, directionId: attempt.directionId, directionSlot: attempt.directionSlot,
    directionVersion: attempt.directionVersion, status: attempt.status, blocking: attempt.blocking, stage: attempt.stage, createdAt: attempt.createdAt,
    chapters: attempt.chapters.map(({ index, status, uncertain, openaiRequestId, secureUrl }) => ({ index, status, uncertain, openaiRequestId, secureUrl })),
    canFinalize: !!attempt.assembled?.secureUrl || attempt.chapters.every((chapter) => chapter.status === "persisted"),
    needsUncertainConfirmation: attempt.chapters.some((chapter) => chapter.uncertain || chapter.status === "generating"),
    assembled: { status: attempt.assembled?.status, secureUrl: attempt.assembled?.secureUrl }, errorCode: attempt.errorCode };
}
module.exports = { CONTRACT_VERSION, OPERATION_LOCK_STALE_MS, isStaleOperation, prepare, execute, promote, complete, fail, abandon, summary, identity, publicId, spool };
