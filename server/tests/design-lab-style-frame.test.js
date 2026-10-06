const test = require("node:test");
const assert = require("node:assert/strict");
const mongoose = require("mongoose");
const sharp = require("sharp");
const fs = require("node:fs/promises");
const path = require("node:path");
const SiteProject = require("../models/site-project.model");
const Attempt = require("../models/style-frame-generation-attempt.model");
const DesignReference = require("../models/design-reference.model");
const openai = require("../services/design-lab/openai.service");
const designLab = require("../services/design-lab/design-lab.service");
const service = require("../services/design-lab/style-frame.service");
const { seedVersionedFixture } = require("./helpers/direction-versions.fixture");
const { styleFramePlan } = require("../services/design-lab/design-engine-v2.service");

const image = (name) => ({ url: `https://res.cloudinary.com/demo/image/upload/${name}.png`, publicId: `gusto/design-lab/references/${name}` });
function fixture(count = 6) {
  const project = new SiteProject({ name: "Maison des sources", slug: "maison-des-sources", creativeSettings: { brandContinuity: "reinvent" } });
  for (const role of ["logo", "chef", "food", "restaurantInterior", "restaurantExterior"]) project.assets.push({ ...image(role), name: role, role });
  const references = [0, 1].map((n) => ({ _id: new mongoose.Types.ObjectId(), name: `Reference ${n}`, image: image(`ref-${n}`) }));
  const moments = Array.from({ length: count }, (_, index) => ({
    id: `moment-${index}`, purpose: `Sujet libre ${index}`, momentRole: index ? "section" : "hero", placement: "homepage_primary",
    climate: index % 2 ? "quietNeutral" : "photographicImmersive", surface: index % 2 ? "light" : "dark",
    layoutMode: index % 3 ? "asymmetricEditorial" : "fullBleedPhotography", intensity: index % 2 ? "calme" : "fort",
    homeElements: index % 2 ? ["headline", "short_copy"] : ["headline", "photography"],
    assetNeeds: index % 2 ? [] : ["food"], signatureMovesAllowed: index === 2 ? ["Grille interrompue"] : [],
  }));
  project.directions.push({ name: "Une identité vivante", engineVersion: "v2",
    brandSystem: { typographicVoice: "grotesque", spatialLanguage: "vide actif", colorSystem: { baseSurface: "bleu" } },
    visualSystem: { layoutGrammar: "ruptures éditoriales", rhythmMap: moments.map((m) => ({ sectionId: m.id, intensity: m.intensity, rationale: "Alternance" })),
      sectionClimatePlan: moments.map((m) => ({ sectionId: m.id, climate: m.climate, surface: m.surface })),
      signatureMoves: [{ description: "Grille interrompue", allowedContexts: ["moment-2"] }],
      referenceAnchors: references.map((ref) => ({ referenceId: String(ref._id), principles: ["rythme"] })) },
    siteInformationArchitecture: { homepageMoments: moments },
  });
  const direction = project.directions[0];
  seedVersionedFixture(project, direction);
  project.selectedDirection = direction._id;
  direction.styleFrames.push({ image: image("old-frame"), prompt: "Ancien rendu", model: "old-model", size: "1536x1024" });
  return { project, direction, references };
}

const png = () => sharp({ create: { width: 16, height: 24, channels: 3, background: "#ccc" } }).png().toBuffer();
function harness() {
  const records = new Map(), binaries = new Map(), uploads = new Map(), calls = [];
  const deps = {
    create: async (data) => { const record = { ...data, createdAt: new Date() }; records.set(data.generationId, record); return record; },
    update: async (id, data) => { Object.assign(records.get(id), data); return { matchedCount: 1 }; },
    find: async (_projectId, id) => records.get(id), pending: async () => null,
    download: async () => ({ buffer: await png(), mime: "image/png" }),
    generate: async (prompt, images, options) => { calls.push({ prompt, images, options }); return { buffer: await png(), model: "mock-image", requestId: "req_test", httpStatus: 200 }; },
    upload: async (_buffer, id) => { const result = { url: image(id).url, publicId: service.publicId(id) }; uploads.set(id, result); return result; },
    lookup: async (id) => uploads.get(id) || null,
    spool: { prepare: async () => {}, write: async (id, buffer, metadata) => { binaries.set(id, { buffer, ...metadata }); },
      read: async (id) => { if (!binaries.has(id)) throw new Error("absent"); return binaries.get(id); }, remove: async (id) => { binaries.delete(id); } },
  };
  return { deps, records, binaries, uploads, calls };
}
const contextFor = (direction) => ({ stage: "input", directionId: String(direction._id) });

for (const count of [4, 6, 8]) test(`Style Frame sélectionne trois moments réels sur ${count}, dans l'ordre avec contraste`, () => {
  const { project, direction, references } = fixture(count);
  const before = JSON.stringify(direction.toObject());
  const plan = styleFramePlan(project, direction, references);
  assert.equal(plan.size, "1024x1536");
  assert.equal(plan.moments.length, 3);
  assert.equal(plan.moments[0].id, "moment-0");
  assert.equal(new Set(plan.moments.map((m) => m.id)).size, 3);
  assert.ok(plan.moments.every((m) => direction.siteInformationArchitecture.homepageMoments.some((source) => source.id === m.id)));
  assert.ok(plan.moments.every((m, i) => !i || m.sourceIndex > plan.moments[i - 1].sourceIndex));
  assert.ok(new Set(plan.moments.map((m) => m.climate)).size > 1);
  assert.ok(new Set(plan.moments.map((m) => m.layoutMode)).size > 1);
  assert.match(plan.prompt, /exactly THREE/);
  assert.match(plan.prompt, /not a full homepage/);
  assert.ok(!/Cuisine|Traiteur|Histoire familiale/.test(plan.prompt));
  const selected = JSON.parse(plan.prompt.split("SELECTED_MOMENTS_IN_READING_ORDER: ")[1].split("\n")[0]);
  assert.equal(selected.length, 3);
  assert.equal(JSON.stringify(direction.toObject()), before);
});

test("Style Frame : rhythmMap et sectionClimatePlan priment sur les annotations du moment", () => {
  const { project, direction, references } = fixture(4);
  direction.visualSystem.sectionClimatePlan[2].climate = "darkContrast";
  direction.visualSystem.sectionClimatePlan[2].surface = "cobalt";
  direction.visualSystem.rhythmMap[2].intensity = "dense";
  const plan = styleFramePlan(project, direction, references);
  const moment = plan.moments.find((m) => m.id === "moment-2");
  assert.ok(moment);
  assert.equal(moment.climate, "darkContrast");
  assert.equal(moment.surface, "cobalt");
  assert.equal(moment.intensity, "dense");
  assert.ok(plan.styleFrameCoverage.visualSystemAspectsCovered.includes("signatureMoves"));
});

test("Nouvelle proposition exclut le rendu précédent ; Affiner le place séparément en première image", () => {
  const { project, direction, references } = fixture();
  const previous = direction.styleFrames[0];
  const fresh = styleFramePlan(project, direction, references);
  assert.ok(!fresh.inputs.some((input) => input.kind === "CURRENT_STYLE_FRAME_TO_REFINE"));
  const refined = styleFramePlan(project, direction, references, { mode: "refine", currentFrame: previous, feedback: "Conserver la grille, calmer les accents." });
  assert.equal(refined.inputs[0].kind, "CURRENT_STYLE_FRAME_TO_REFINE");
  assert.equal(refined.inputs[0].image.url, previous.image.url);
  assert.equal(refined.inputs.filter((input) => input.kind === "CLIENT_ASSET").length, 5);
  assert.equal(refined.inputs.filter((input) => input.kind === "VISUAL_REFERENCE").length, 2);
  assert.ok(!refined.inputs.some((input) => /portfolio/.test(input.image.url)));
  assert.match(refined.prompt, /Conserver la grille, calmer les accents/);
  assert.ok(!refined.officialPrompt.includes("Conserver la grille, calmer les accents"));
  assert.doesNotThrow(() => styleFramePlan(project, direction, references, { mode: "refine", currentFrame: previous, feedback: "" }));
  assert.throws(() => styleFramePlan(project, direction, references, { feedback: "x".repeat(1501) }), { status: 400 });
});

test("Contraste absent : trois échantillons valides, aucune validation artistique fatale", () => {
  const { project, direction, references } = fixture(4);
  for (const moment of direction.siteInformationArchitecture.homepageMoments) Object.assign(moment, { climate: "quiet", layoutMode: "quietText", surface: "white", intensity: "calme" });
  direction.visualSystem.sectionClimatePlan = []; direction.visualSystem.rhythmMap = [];
  assert.equal(styleFramePlan(project, direction, references).moments.length, 3);
});

for (const [category, error] of [
  ["STYLE_FRAME_OPENAI_SERVER_ERROR", { httpStatus: 500, openaiErrorType: "server_error", openaiErrorCode: "server_error", requestId: "req_d7f3a86d88f24120accaa5645e94a325" }],
  ["STYLE_FRAME_OPENAI_RATE_LIMIT", { httpStatus: 429 }],
  ["STYLE_FRAME_OPENAI_CLIENT_ERROR", { httpStatus: 400 }],
  ["STYLE_FRAME_OPENAI_TIMEOUT", { status: 504 }],
]) test(`${category} : une seule requête, aucun rendu officiel et métadonnées conservées`, async () => {
  const f = fixture(), h = harness(), context = contextFor(f.direction);
  const before = JSON.stringify(f.direction.toObject());
  const prepared = await service.prepareStyleFrame(f, context, h.deps);
  let calls = 0;
  h.deps.generate = async () => { calls++; throw Object.assign(new Error("Erreur upstream"), error); };
  await assert.rejects(service.executeStyleFrame(prepared, context, h.deps), asyncError => {
    return service.category(asyncError, context.stage) === category;
  });
  const wrapped = await service.failAttempt(Object.assign(new Error("Erreur upstream"), error), context, h.deps);
  assert.equal(calls, 1);
  assert.equal(wrapped.styleFrame.errorCategory, category);
  assert.equal(wrapped.styleFrame.stage, "openai");
  assert.equal(wrapped.styleFrame.requestId, error.requestId || null);
  assert.equal(h.records.get(context.generationId).status, "failed");
  assert.equal(JSON.stringify(f.direction.toObject()), before);
  assert.equal(h.uploads.size, 0);
});

test("Succès : journal, image identifiable, promotion officielle et nettoyage de l'erreur", async () => {
  const f = fixture(), h = harness(), context = contextFor(f.direction);
  const before = JSON.stringify(f.direction.brandSystem);
  const prepared = await service.prepareStyleFrame(f, context, h.deps);
  const frame = await service.executeStyleFrame(prepared, context, h.deps);
  f.direction.styleFrames.push(frame);
  await f.project.validate();
  await service.completeAttempt(context, h.deps);
  assert.equal(h.calls.length, 1);
  assert.equal(h.calls[0].options.isVariation, false);
  assert.equal(h.records.get(context.generationId).status, "completed");
  assert.equal(h.records.get(context.generationId).errorCategory, null);
  assert.equal(frame.image.publicId, service.publicId(context.generationId));
  assert.equal(frame.styleFrameCoverage.selectedMomentIds.length, 3);
  assert.equal(f.direction.styleFrames[0].image.publicId, image("old-frame").publicId);
  assert.equal(JSON.stringify(f.direction.brandSystem), before);
  assert.equal(h.binaries.size, 0);
});

for (const failure of ["cloudinary", "journal_after_upload", "project_save"]) test(`Image payée récupérable après panne ${failure}, sans nouvel appel image`, async () => {
  const f = fixture(), h = harness(), context = contextFor(f.direction);
  const prepared = await service.prepareStyleFrame(f, context, h.deps);
  const upload = h.deps.upload, update = h.deps.update;
  if (failure === "cloudinary") h.deps.upload = async () => { throw new Error("upload failed"); };
  if (failure === "journal_after_upload") h.deps.update = async (id, data) => {
    if (data.status === "uploaded") throw new Error("mongo failed");
    return update(id, data);
  };
  if (failure === "project_save") {
    await service.executeStyleFrame(prepared, context, h.deps);
    await service.failAttempt(new Error("project save failed"), context, h.deps);
  } else {
    let caught;
    try { await service.executeStyleFrame(prepared, context, h.deps); } catch (error) { caught = error; }
    assert.ok(caught);
    await service.failAttempt(caught, context, h.deps);
  }
  assert.equal(f.direction.styleFrames.length, 1);
  assert.equal(h.calls.length, 1);
  assert.equal(h.binaries.size, 1);
  h.deps.upload = upload; h.deps.update = update;
  const frame = await service.recoverStyleFrame(f.project, f.direction, context.generationId, context, h.deps);
  f.direction.styleFrames.push(frame);
  await service.completeAttempt(context, h.deps);
  const again = await service.recoverStyleFrame(f.project, f.direction, context.generationId, context, h.deps);
  assert.equal(again.generationId, frame.generationId);
  assert.equal(h.calls.length, 1);
  assert.equal(f.direction.styleFrames.length, 2);
  assert.equal(h.uploads.size, 1);
});

test("Affinage : mode édition, feedback uniquement dans la tentative, frame initial intact", async () => {
  const f = fixture(), h = harness(), context = contextFor(f.direction);
  const before = JSON.stringify(f.direction.styleFrames[0].toObject());
  const prepared = await service.prepareStyleFrame({ ...f, mode: "refine", currentFrame: f.direction.styleFrames[0], feedback: "Alléger le second moment." }, context, h.deps);
  const frame = await service.executeStyleFrame(prepared, context, h.deps);
  assert.equal(h.calls.length, 1);
  assert.equal(h.calls[0].options.isVariation, true);
  assert.equal(prepared.attempt.refinementFeedback, "Alléger le second moment.");
  assert.ok(!frame.prompt.includes("Alléger le second moment"));
  assert.equal(JSON.stringify(f.direction.styleFrames[0].toObject()), before);
});

test("Relance manuelle utilise le même plan ; contexte changé rejeté sans dépense", async () => {
  const f = fixture(), h = harness();
  const first = await service.prepareStyleFrame(f, contextFor(f.direction), h.deps);
  first.attempt.status = "failed"; first.attempt.errorCategory = "STYLE_FRAME_OPENAI_SERVER_ERROR";
  const second = await service.prepareStyleFrame({ ...f, retryGenerationId: first.attempt.generationId }, contextFor(f.direction), h.deps);
  assert.equal(second.plan, first.plan);
  assert.notEqual(second.attempt.generationId, first.attempt.generationId);
  f.project.creativeSettings.visualDensity = 99;
  await assert.rejects(service.prepareStyleFrame({ ...f, retryGenerationId: first.attempt.generationId }, contextFor(f.direction), h.deps), { status: 409 });
  assert.equal(h.calls.length, 0);
});

test("Tentative payée en attente : nouvelle génération refusée, priorité à la récupération", async () => {
  const f = fixture(), h = harness();
  h.deps.pending = async () => ({ status: "uploaded" });
  await assert.rejects(service.prepareStyleFrame(f, contextFor(f.direction), h.deps), { status: 409 });
  assert.equal(h.records.size, 0);
  assert.equal(h.calls.length, 0);
});

test("Réponse invalide et erreur de téléchargement distinguées, jamais de retry", async () => {
  const f = fixture(), h = harness(), context = contextFor(f.direction);
  const prepared = await service.prepareStyleFrame(f, context, h.deps);
  h.deps.download = async () => { throw new Error("missing source"); };
  await assert.rejects(service.executeStyleFrame(prepared, context, h.deps));
  assert.equal(context.stage, "download");
  assert.equal(h.calls.length, 0);
  h.deps.download = async () => ({ buffer: await png(), mime: "image/png" });
  let calls = 0;
  h.deps.generate = async () => { calls++; return { buffer: Buffer.from("not an image"), httpStatus: 200, requestId: "req_invalid" }; };
  await assert.rejects(service.executeStyleFrame(prepared, context, h.deps), (error) => error.responseInvalid);
  assert.equal(calls, 1);
  assert.equal(h.uploads.size, 0);
});

test("Transport image mocké : HTTP/type/code/requestId conservés, Flare vs Sunburst, portrait/high", async () => {
  const original = global.fetch;
  const calls = [];
  global.fetch = async (url, options) => {
    calls.push({ url, body: options.body });
    return { ok: false, status: 500, headers: { get: () => "req_transport" }, json: async () => ({ error: { type: "server_error", code: "processing_error", message: "The server had an error while processing your request." } }) };
  };
  const originalKey = process.env.OPENAI_API_KEY;
  process.env.OPENAI_API_KEY = "mock-key-never-used";
  try {
    await assert.rejects(openai.generateImage("mock prompt", [{ buffer: await png(), mime: "image/png" }]), (error) => error.httpStatus === 500 && error.openaiErrorType === "server_error" && error.openaiErrorCode === "processing_error" && error.requestId === "req_transport");
    assert.equal(calls.length, 1);
    assert.equal(calls[0].body.get("model"), openai.MODEL_CONFIG.imageGenerationModel);
    assert.equal(calls[0].body.get("size"), "1024x1536");
    assert.equal(calls[0].body.get("quality"), openai.MODEL_CONFIG.imageQuality);
    await assert.rejects(openai.generateImage("mock refinement", [{ buffer: await png(), mime: "image/png" }], { isVariation: true }));
    assert.equal(calls.length, 2);
    assert.equal(calls[1].body.get("model"), openai.MODEL_CONFIG.imageEditModel);
  } finally { global.fetch = original; if (originalKey === undefined) delete process.env.OPENAI_API_KEY; else process.env.OPENAI_API_KEY = originalKey; }
});

test("UI : deux modes, feedback limité, garde double clic, erreur unique et nettoyage après succès", async () => {
  const root = path.resolve(__dirname, "../../client/src");
  const page = await fs.readFile(path.join(root, "pages/dashboard/admin/sites/[id].page.js"), "utf8");
  const modal = await fs.readFile(path.join(root, "components/dashboard/admin/sites/style-frame-refinement.component.js"), "utf8");
  assert.match(page, /runningAction\.current \|\| busy \|\| \(project\?\.operation && !staleHomepageAction\)/);
  assert.match(page, /Nouvelle proposition/);
  assert.match(page, /Affiner ce Style Frame/);
  assert.match(page, /Récupérer la tentative \(sans OpenAI\)/);
  assert.match(modal, /maxLength=\{1500\}/);
  assert.match(page, /styleFrameErrorMessage\(error \|\| project.lastError\)/);
  assert.ok(!page.includes("Dernière erreur : {project.lastError}"));
  assert.match(page, /setStyleFrameError\(null\)/);
});

test("Journal exposé minimal : aucun prompt, feedback ou base64", () => {
  const result = service.summary({ generationId: "test", plan: { prompt: "secret" }, refinementFeedback: "private", base64: "heavy" });
  assert.ok(!("plan" in result));
  assert.ok(!("refinementFeedback" in result));
  assert.ok(!("base64" in result));
});

function routeHarness() {
  const f = fixture(), h = harness();
  let stored = JSON.parse(JSON.stringify(f.project.toObject())), saves = 0, writes = 0, destroys = 0;
  let saveError = false;
  const cloudinary = require("cloudinary").v2;
  const originals = [
    [SiteProject, "findOneAndUpdate"], [SiteProject, "exists"], [SiteProject, "updateOne"], [SiteProject, "findById"],
    [Attempt, "create"], [Attempt, "updateOne"], [Attempt, "findOne"],
    [DesignReference, "find"], [designLab, "downloadOwnImage"], [designLab, "uploadImage"],
    [openai, "generateImage"], [cloudinary.uploader, "destroy"], [cloudinary.api, "resource"],
    ...Object.keys(service.spool).map((key) => [service.spool, key]),
  ].map(([object, key]) => [object, key, object[key]]);
  SiteProject.findOneAndUpdate = async (_query, update) => {
    if (stored.operation) return null;
    Object.assign(stored, update.$set); writes++;
    const document = new SiteProject(stored);
    document.save = async () => {
      saves++;
      if (saveError) throw new Error("Mongo write unavailable");
      await document.validate(); stored = JSON.parse(JSON.stringify(document.toObject())); return document;
    };
    return document;
  };
  SiteProject.findById = () => ({ select: async () => stored });
  SiteProject.exists = async () => true;
  SiteProject.updateOne = async (_query, update) => { Object.assign(stored, update.$set); writes++; return { matchedCount: 1 }; };
  Attempt.create = h.deps.create;
  Attempt.updateOne = ({ generationId }, update) => h.deps.update(generationId, update.$set);
  Attempt.findOne = (query) => {
    if (query.generationId) return { select: async () => h.records.get(query.generationId) };
    return Promise.resolve([...h.records.values()].find((attempt) => attempt.status === "uploaded" || (attempt.status === "running" && attempt.stage === "openai") ||
      (attempt.status === "failed" && ["STYLE_FRAME_PERSISTENCE_ERROR", "STYLE_FRAME_CLOUDINARY_ERROR"].includes(attempt.errorCategory))) || null);
  };
  DesignReference.find = () => ({ lean: async () => f.references });
  designLab.downloadOwnImage = h.deps.download;
  designLab.uploadImage = (buffer, _folder, options) => h.deps.upload(buffer, options.publicId.split("/").at(-1));
  openai.generateImage = h.deps.generate;
  cloudinary.uploader.destroy = async () => { destroys++; };
  cloudinary.api.resource = async (id) => {
    const result = h.uploads.get(id.split("/").at(-1));
    if (!result) throw { http_code: 404 };
    return { secure_url: result.url, public_id: result.publicId };
  };
  Object.assign(service.spool, h.deps.spool);
  const routePath = require.resolve("../routes/admin/design-lab.routes");
  delete require.cache[routePath];
  const router = require(routePath);
  const handler = (route) => router.stack.find((layer) => layer.route?.path === `/admin/design-lab/projects/:id/directions/:directionId/${route}` && layer.route.methods.post).route.stack.at(-1).handle;
  const response = () => ({ code: 200, status(code) { this.code = code; return this; }, json(body) { this.body = body; return this; } });
  const request = (body = {}, extraParams = {}) => ({ body, params: { id: String(f.project._id), directionId: String(f.direction._id), ...extraParams } });
  return { f, h, handler, response, request, stored: () => stored, counts: () => ({ saves, writes, destroys }),
    setSaveError: (value) => { saveError = value; },
    restore: () => { for (const [object, key, value] of originals) object[key] = value; delete require.cache[routePath]; } };
}

test("Route : sauvegarde atomique mockée, panne Mongo ne supprime pas l'image payée, récupération idempotente", async () => {
  const r = routeHarness();
  const oldFrame = r.stored().directions[0].styleFrames[0];
  const initialSystems = JSON.stringify({ brand: r.stored().directions[0].brandSystem, visual: r.stored().directions[0].visualSystem });
  try {
    r.setSaveError(true);
    const failed = r.response();
    await r.handler("style-frames")(r.request(), failed);
    assert.equal(failed.code, 502);
    assert.equal(failed.body.styleFrameError.errorCategory, "STYLE_FRAME_PERSISTENCE_ERROR");
    const generationId = failed.body.styleFrameError.generationId;
    assert.equal(r.h.calls.length, 1);
    assert.equal(r.stored().directions[0].styleFrames.length, 1);
    assert.equal(r.h.uploads.size, 1);
    assert.equal(r.counts().destroys, 0);
    r.setSaveError(false);
    const blocked = r.response();
    await r.handler("style-frames")(r.request(), blocked);
    assert.equal(blocked.code, 409);
    assert.equal(r.h.calls.length, 1);
    const recovered = r.response();
    await r.handler("style-frame-attempts/:generationId/recover")(r.request({}, { generationId }), recovered);
    assert.equal(recovered.code, 200, recovered.body?.message);
    assert.equal(r.stored().directions[0].styleFrames.length, 2);
    assert.equal(r.stored().lastError, "");
    assert.equal(r.h.calls.length, 1);
    assert.deepEqual(r.stored().directions[0].styleFrames[0], oldFrame);
    assert.equal(JSON.stringify({ brand: r.stored().directions[0].brandSystem, visual: r.stored().directions[0].visualSystem }), initialSystems);
    const duplicate = r.response();
    await r.handler("style-frame-attempts/:generationId/recover")(r.request({}, { generationId }), duplicate);
    assert.equal(duplicate.code, 200);
    assert.equal(r.stored().directions[0].styleFrames.length, 2);
    assert.equal(r.h.calls.length, 1);
  } finally { r.restore(); }
});

test("Route : OpenAI server_error conservé, aucun Cloudinary/Mongo officiel ; relance manuelle seule", async () => {
  const r = routeHarness();
  const original = JSON.stringify(r.stored().directions);
  let calls = 0;
  openai.generateImage = async () => { calls++; throw Object.assign(new Error("The server had an error while processing your request."), {
    status: 502, httpStatus: 500, openaiErrorType: "server_error", openaiErrorCode: "server_error", requestId: "req_d7f3a86d88f24120accaa5645e94a325" }); };
  try {
    const response = r.response();
    await r.handler("style-frames")(r.request(), response);
    assert.equal(response.code, 502);
    assert.equal(response.body.styleFrameError.httpStatus, 500);
    assert.equal(response.body.styleFrameError.requestId, "req_d7f3a86d88f24120accaa5645e94a325");
    assert.equal(response.body.styleFrameError.stage, "openai");
    assert.equal(calls, 1);
    assert.equal(r.counts().saves, 0);
    assert.equal(r.h.uploads.size, 0);
    assert.equal(JSON.stringify(r.stored().directions), original);
    assert.equal(r.stored().lastError, response.body.message);
  } finally { r.restore(); }
});

test("Route : feedback trop long refusé avant lock/API ; double clic concurrent bloqué", async () => {
  const r = routeHarness();
  try {
    const rejected = r.response();
    await r.handler("style-frames/:frameId/refine")(r.request({ feedback: "x".repeat(1501) }, { frameId: String(r.f.direction.styleFrames[0]._id) }), rejected);
    assert.equal(rejected.code, 400);
    assert.equal(r.counts().writes, 0);
    assert.equal(r.h.calls.length, 0);
    let release, started;
    const gate = new Promise((resolve) => { release = resolve; });
    const reached = new Promise((resolve) => { started = resolve; });
    const generate = openai.generateImage;
    openai.generateImage = async (...args) => { started(); await gate; return generate(...args); };
    const first = r.response();
    const running = r.handler("style-frames")(r.request(), first);
    await reached;
    const second = r.response();
    await r.handler("style-frames")(r.request(), second);
    assert.equal(second.code, 409);
    release(); await running;
    assert.equal(first.code, 200);
    assert.equal(r.h.calls.length, 1);
    assert.equal(r.stored().directions[0].styleFrames.length, 2);
  } finally { r.restore(); }
});

test("Route Affiner : feedback et image courante, un seul appel édition, ancien rendu inchangé", async () => {
  const r = routeHarness(), old = r.stored().directions[0].styleFrames[0];
  try {
    const response = r.response();
    await r.handler("style-frames/:frameId/refine")(r.request({ feedback: "Plus de respiration." }, { frameId: String(old._id) }), response);
    assert.equal(response.code, 200);
    assert.equal(r.h.calls.length, 1);
    assert.equal(r.h.calls[0].options.isVariation, true);
    assert.match(r.h.calls[0].prompt, /CURRENT_STYLE_FRAME_TO_REFINE/);
    assert.match(r.h.calls[0].prompt, /Plus de respiration/);
    assert.deepEqual(r.stored().directions[0].styleFrames[0], old);
  } finally { r.restore(); }
});
