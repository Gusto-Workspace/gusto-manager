const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const sharp = require("sharp");
const SiteProject = require("../models/site-project.model");
const Attempt = require("../models/homepage-generation-attempt.model");
const service = require("../services/design-lab/homepage-generation.service");
const { seedVersionedFixture } = require("./helpers/direction-versions.fixture");
const clone = (value) => JSON.parse(JSON.stringify(value));
const png = (width = 1024, height = 1536, background = "#445566") => sharp({ create: { width, height, channels: 3, background } }).png().toBuffer();
function fixture() {
  const project = new SiteProject({ name: "Maison des chapitres", slug: "maison-des-chapitres", brief: { city: "Montauban" } });
  project.assets.push({ name: "food.png", role: "food", image: undefined, url: "https://res.cloudinary.com/demo/food.png", publicId: "Gusto_Workspace/design-lab/food" });
  project.directions.push({ name: "La tablée", brandSystem: { brandIdea: "Une table généreuse" }, visualSystem: { rhythmMap: [], sectionClimatePlan: [] },
    siteInformationArchitecture: { homepageRole: "Invitation", primaryPages: [{ id: "home", label: "Accueil" }], homepageMoments: Array.from({ length: 6 }, (_, index) => ({ id: `moment-${index}`,
      purpose: `Moment ${index}`, contentIntent: `Récit ${index}`, placement: "homepage_primary", destinationPageId: null,
      assetNeeds: index === 0 ? ["food"] : [] })) } });
  const direction = project.directions[0]; seedVersionedFixture(project, direction);
  direction.styleFrames.push({ prompt: "Contrat visuel", image: { url: "https://res.cloudinary.com/demo/frame.png", publicId: "Gusto_Workspace/design-lab/frame" }, approvedAt: new Date("2026-10-01T00:00:00Z") });
  direction.approvedStyleFrameId = direction.styleFrames[0]._id;
  return { project, direction };
}
function harness() {
  const records = new Map(), binaries = new Map(), remote = new Map(), calls = [];
  const deps = {
    create: async (data) => {
      assert.ok(![...records.values()].some((record) => record.blocking));
      records.set(data.generationId, clone(data)); return clone(data);
    },
    find: async (_projectId, generationId) => clone(records.get(generationId)),
    pending: async () => [...records.values()].find((record) => record.blocking) || null,
    update: async (attempt, patch) => {
      const old = records.get(attempt.generationId);
      if (!old || old.revision !== attempt.revision || old.status === "abandoned") return { matchedCount: 0 };
      Object.assign(old, clone(patch), { revision: old.revision + 1 }); return { matchedCount: 1 };
    },
    lookup: async (generationId, key) => remote.get(service.publicId(generationId, key))?.image || null,
    download: async (image) => ({ buffer: remote.get(image.publicId)?.buffer || await png(32, 32), mime: "image/png" }),
    generate: async (prompt, images, options) => {
      const index = Number(/CHAPTER (\d+)/.exec(prompt)[1]) - 1;
      calls.push({ index, prompt, images: images.map((image) => ({ ...image, buffer: Buffer.from(image.buffer) })), options });
      const [width, height] = options.size.split("x").map(Number);
      return { buffer: await png(width, height, ["#443322", "#334422", "#223344"][index]), model: "mock-flare", requestId: `req_chapter_${index}` };
    },
    upload: async (buffer, generationId, key) => {
      const publicId = service.publicId(generationId, key);
      const image = { publicId, url: `https://res.cloudinary.com/demo/image/upload/${publicId}.png` };
      if (remote.has(publicId)) assert.deepEqual(buffer, remote.get(publicId).buffer);
      remote.set(publicId, { image, buffer: Buffer.from(buffer) }); return image;
    },
    assemble: require("../services/design-lab/image-assembly.service").assembleChapters,
    spool: {
      prepare: async () => {},
      write: async (generationId, key, buffer, metadata) => binaries.set(`${generationId}:${key}`, { buffer: Buffer.from(buffer), ...metadata }),
      read: async (generationId, key) => {
        const saved = binaries.get(`${generationId}:${key}`); if (!saved) throw Object.assign(new Error("Absent"), { code: "ENOENT" }); return saved;
      },
      remove: async (generationId, keys) => keys.forEach((key) => binaries.delete(`${generationId}:${key}`)),
    },
  };
  return { deps, records, binaries, remote, calls };
}
async function start(f, h) {
  const context = {};
  const prepared = await service.prepare(f, context, h.deps);
  return { context, prepared, id: context.generationId };
}
async function interrupt(f, h, index) {
  const run = await start(f, h), original = h.deps.generate;
  h.deps.generate = async (...args) => {
    if (args[0].includes(`CHAPTER ${index + 1}/`)) {
      h.calls.push({ index }); throw Object.assign(new Error("API fixture failure"), { status: 502, httpStatus: 500 });
    }
    return original(...args);
  };
  await assert.rejects(service.execute(run.prepared, run.context, {}, h.deps));
  await service.fail(new Error("interrupted"), run.context, h.deps);
  h.deps.generate = original;
  return run;
}

test("Homepage : trois checkpoints avant les appels suivants, puis promotion unique", async () => {
  const f = fixture(), h = harness(), run = await start(f, h), before = JSON.stringify(f.direction.toObject());
  const generate = h.deps.generate;
  h.deps.generate = async (...args) => {
    const index = Number(/CHAPTER (\d+)/.exec(args[0])[1]) - 1;
    assert.ok(h.records.get(run.id).chapters.slice(0, index).every((chapter) => chapter.status === "persisted"));
    assert.equal(f.project.generations.length, 0);
    return generate(...args);
  };
  const generation = await service.execute(run.prepared, run.context, {}, h.deps);
  assert.equal(h.calls.length, 3); assert.deepEqual(h.calls.map((call) => call.index), [0, 1, 2]);
  assert.ok(h.calls.every((call) => call.options.size === "1024x1536" && !call.options.isVariation));
  assert.ok(h.calls.every((call) => call.prompt.includes("STYLE_FRAME_APPROVED")));
  assert.equal(h.remote.size, 4);
  service.promote(f.project, generation); service.promote(f.project, generation);
  await f.project.validate();
  assert.equal(f.project.generations.length, 1); assert.equal(f.project.generations[0].generationId, run.id);
  assert.deepEqual(generation.outputDimensions, { width: 1024, height: 4352 });
  assert.equal(JSON.stringify(f.direction.toObject()), before);
  await service.complete(run.context, h.deps);
  assert.equal(h.records.get(run.id).status, "completed"); assert.equal(h.records.get(run.id).blocking, false);
  assert.equal(h.binaries.size, 0); assert.equal(h.remote.size, 4);
});

for (const failedIndex of [0, 1, 2]) test(`Échec chapitre ${failedIndex + 1} : reprise des seuls ${3 - failedIndex} chapitres restants`, async () => {
  const f = fixture(), h = harness(), run = await interrupt(f, h, failedIndex);
  const checkpoint = h.records.get(run.id);
  assert.deepEqual(checkpoint.chapters.map((chapter) => chapter.status), Array.from({ length: 3 }, (_, index) => index < failedIndex ? "persisted" : index === failedIndex ? "failed" : "pending"));
  const before = h.calls.length;
  const prepared = await service.prepare({ ...f, generationId: run.id }, run.context, h.deps);
  const generation = await service.execute(prepared, run.context, {}, h.deps);
  assert.deepEqual(h.calls.slice(before).map((call) => call.index), Array.from({ length: 3 - failedIndex }, (_, index) => failedIndex + index));
  if (failedIndex) {
    const previous = h.remote.get(service.publicId(run.id, `chapter-${failedIndex - 1}`)).buffer;
    assert.deepEqual(h.calls[before].images[1].buffer, previous);
    const strip = await sharp(previous).extract({ left: 0, top: 1408, width: 1024, height: 128 }).png().toBuffer();
    assert.deepEqual(h.calls[before].images[2].buffer, strip);
  }
  assert.deepEqual(prepared.plan, run.prepared.plan);
  service.promote(f.project, generation); assert.equal(f.project.generations.length, 1);
});

for (const failure of ["chapter_upload", "chapter_journal", "heartbeat", "assembly", "final_upload", "final_journal", "mongo_official", "lost_upload_ack"]) test(`Résultats payés conservés après ${failure}`, async () => {
  const f = fixture(), h = harness(), run = await start(f, h);
  const upload = h.deps.upload, update = h.deps.update, assemble = h.deps.assemble;
  let triggered = false;
  h.deps.upload = async (...args) => {
    const key = args[2];
    if (!triggered && ((failure === "chapter_upload" && key === "chapter-0") || (failure === "final_upload" && key === "assembled"))) { triggered = true; throw new Error("Upload fixture failure"); }
    const image = await upload(...args);
    if (!triggered && failure === "lost_upload_ack" && key === "chapter-0") { triggered = true; throw new Error("Acknowledgement lost"); }
    return image;
  };
  h.deps.update = async (attempt, patch) => {
    if (!triggered && ((failure === "chapter_journal" && patch.chapters?.[0]?.status === "persisted") || (failure === "final_journal" && patch.assembled?.status === "persisted"))) { triggered = true; throw new Error("Mongo journal fixture failure"); }
    return update(attempt, patch);
  };
  h.deps.assemble = async (...args) => { if (failure === "assembly" && !triggered) { triggered = true; throw new Error("Sharp fixture failure"); } return assemble(...args); };
  let result;
  try {
    result = await service.execute(run.prepared, run.context, { onProgress: async () => {
      if (failure === "heartbeat" && !triggered && h.records.get(run.id).chapters[0].status === "persisted") { triggered = true; throw new Error("Network failure after durable chapter"); }
    } }, h.deps);
    if (failure === "mongo_official") { triggered = true; throw new Error("Official Mongo save fixture failure"); }
  } catch (error) { await service.fail(error, run.context, h.deps); }
  assert.ok(triggered); assert.equal(f.project.generations.length, 0);
  assert.ok(h.binaries.size || h.remote.size);
  const previousCalls = h.calls.length;
  h.deps.upload = upload; h.deps.update = update; h.deps.assemble = assemble;
  const prepared = await service.prepare({ ...f, generationId: run.id }, run.context, h.deps);
  const allPaid = ["assembly", "final_upload", "final_journal", "mongo_official"].includes(failure);
  result = await service.execute(prepared, run.context, { allowGenerate: !allPaid }, h.deps);
  assert.equal(h.calls.length - previousCalls, allPaid ? 0 : 2);
  service.promote(f.project, result); service.promote(f.project, result);
  assert.equal(f.project.generations.length, 1); assert.equal(h.remote.size, 4);
});

test("Récupérer une tentative incomplète ne génère aucune image manquante", async () => {
  const f = fixture(), h = harness(), run = await interrupt(f, h, 1), before = h.calls.length;
  const prepared = await service.prepare({ ...f, generationId: run.id }, run.context, h.deps);
  await assert.rejects(service.execute(prepared, run.context, { allowGenerate: false }, h.deps), { status: 409 });
  assert.equal(h.calls.length, before); assert.equal(h.records.get(run.id).chapters[0].status, "persisted");
});

for (const change of ["direction_status", "direction_version", "style_frame", "brand", "plan", "asset", "brief", "contract", "prompt_hash", "stored_plan"]) test(`Reprise incompatible ${change} refusée avant OpenAI`, async () => {
  const f = fixture(), h = harness(), run = await start(f, h);
  if (change === "direction_status") f.direction.status = "archived";
  if (change === "direction_version") f.direction.version++;
  if (change === "style_frame") f.direction.styleFrames[0].prompt += " changed";
  if (change === "brand") f.direction.brandSystem.brandIdea = "Autre";
  if (change === "plan") f.direction.siteInformationArchitecture.homepageMoments[2].contentIntent += " changed";
  if (change === "asset") f.project.assets[0].url += "?v=2";
  if (change === "brief") f.project.brief.city = "Paris";
  if (change === "contract") h.records.get(run.id).contractVersion = "old";
  if (change === "prompt_hash") h.records.get(run.id).planHash = "old";
  if (change === "stored_plan") h.records.get(run.id).plan.segments[0].prompt += " corrupted";
  await assert.rejects(service.prepare({ ...f, generationId: run.id }, run.context, h.deps), { status: 409 });
  assert.equal(h.calls.length, 0);
});

test("Nouvelle tentative bloquée tant que l'ancienne n'est pas explicitement abandonnée", async () => {
  const f = fixture(), h = harness(), run = await interrupt(f, h, 1);
  const images = h.remote.size, assets = JSON.stringify(f.project.assets);
  await assert.rejects(service.prepare(f, {}, h.deps), { status: 409 });
  await service.abandon(f.project, run.id, h.deps);
  assert.equal(h.records.get(run.id).status, "abandoned"); assert.equal(h.remote.size, images);
  assert.equal(JSON.stringify(f.project.assets), assets);
  await assert.rejects(service.prepare({ ...f, generationId: run.id }, {}, h.deps), { status: 409 });
  const next = await start(f, h); assert.notEqual(next.id, run.id);
});

test("Une homepage officielle n'est jamais effacée par Abandonner", async () => {
  const f = fixture(), h = harness(), run = await start(f, h);
  service.promote(f.project, await service.execute(run.prepared, run.context, {}, h.deps));
  await assert.rejects(service.abandon(f.project, run.id, h.deps), { status: 409 });
  assert.equal(f.project.generations.length, 1); assert.equal(h.remote.size, 4);
  const again = await service.prepare({ ...f, generationId: run.id }, {}, h.deps);
  assert.equal(again.alreadyPromoted, true);
});

test("Appel sans réponse récupérée : pas de retry automatique ni de dépense silencieuse", async () => {
  const f = fixture(), h = harness(), run = await start(f, h);
  h.deps.generate = async () => { h.calls.push({ index: 0 }); throw Object.assign(new Error("timeout"), { status: 504 }); };
  await assert.rejects(service.execute(run.prepared, run.context, {}, h.deps));
  const prepared = await service.prepare({ ...f, generationId: run.id }, run.context, h.deps);
  await assert.rejects(service.execute(prepared, run.context, {}, h.deps), { code: "HOMEPAGE_UNCERTAIN_CALL" });
  assert.equal(h.calls.length, 1);
  assert.equal(service.summary(h.records.get(run.id)).needsUncertainConfirmation, true);
});

test("Checkpoint Mongo : unique tentative bloquante et aucun binaire dans le schéma", () => {
  assert.ok(Attempt.schema.indexes().some(([keys, options]) => keys.projectId && options.unique && options.partialFilterExpression?.blocking));
  assert.equal(Attempt.schema.path("plan").options.select, false);
  assert.equal(Attempt.schema.path("buffer"), undefined);
});

test("UI : progression réelle, reprise/finalisation/abandon et double clic bloqué", async () => {
  const page = await fs.readFile(require.resolve("../../client/src/pages/dashboard/admin/sites/[id].page.js"), "utf8");
  const component = await fs.readFile(require.resolve("../../client/src/components/dashboard/admin/sites/homepage-attempt.component.js"), "utf8");
  assert.match(page, /runningAction\.current \|\| busy \|\| \(project\?\.operation && !staleHomepageAction\)/);
  assert.match(page, /\!\!pendingHomepage \|\| !direction\.approvedStyleFrameId/);
  assert.match(component, /Reprendre la génération/); assert.match(component, /Récupérer \/ finaliser \(sans OpenAI\)/);
  assert.match(component, /Abandonner la tentative/); assert.match(component, /Chapitre \$\{match\[1\]\}\/\$\{attempt\.chapters\.length\}/);
});

test("Verrou Homepage expiré : signal de lecture uniquement, même seuil strict que le backend", () => {
  const now = Date.parse("2026-10-04T16:30:00Z");
  const project = { operation: "homepage:fixture", operationStartedAt: new Date(now - service.OPERATION_LOCK_STALE_MS - 1), status: "generating" };
  const before = clone(project);
  assert.equal(service.isStaleOperation(project, now), true);
  assert.deepEqual(clone(project), before);
  assert.equal(service.isStaleOperation({ ...project, operationStartedAt: new Date(now - service.OPERATION_LOCK_STALE_MS) }, now), false);
  assert.equal(service.isStaleOperation({ ...project, operationStartedAt: new Date(now - 60000) }, now), false);
  assert.equal(service.isStaleOperation({ ...project, operation: "directions:fixture" }, now), false);
  assert.equal(service.isStaleOperation({ ...project, operationStartedAt: null }, now), false);
  assert.equal(service.isStaleOperation({ ...project, operationStartedAt: "invalid" }, now), false);
});

test("UI : verrou expiré autorise seulement les actions explicites de tentative, jamais une relance au refresh", async () => {
  const page = await fs.readFile(require.resolve("../../client/src/pages/dashboard/admin/sites/[id].page.js"), "utf8");
  const component = await fs.readFile(require.resolve("../../client/src/components/dashboard/admin/sites/homepage-attempt.component.js"), "utf8");
  assert.match(page, /homepageOperationStale && pendingHomepage/);
  assert.match(page, /\[\`\$\{attemptPath\}\/resume\`, \`\$\{attemptPath\}\/recover\`\]\.includes\(path\)/);
  assert.match(page, /\(\!\!project\.operation && !homepageOperationStale\)/);
  assert.match(page, /if \(pendingHomepage\.needsUncertainConfirmation && !confirmed\) return/);
  assert.match(component, /operationBlocked \? "Aucune relance automatique/);
  assert.equal((component.match(/disabled=\{disabled \|\| !compatibleDirection\}/g) || []).length, 2);
  assert.match(page, /setInterval\(\(\) => load\(\)\.catch/);
});

function routeHarness(f, h) {
  let stored = f.project.toObject(), failSave = null;
  const cloudinary = require("cloudinary").v2;
  const originals = [
    [SiteProject, "findOneAndUpdate"], [SiteProject, "findById"], [SiteProject, "exists"], [SiteProject, "updateOne"],
    [cloudinary.uploader, "destroy"], ...["prepare", "execute", "complete", "fail", "abandon"].map((key) => [service, key]),
  ].map(([object, key]) => [object, key, object[key]]);
  const functions = Object.fromEntries(originals.filter(([object]) => object === service).map(([_object, key, fn]) => [key, fn]));
  for (const key of ["prepare", "complete", "fail", "abandon"]) service[key] = (...args) => functions[key](...args, h.deps);
  service.execute = (prepared, context, options) => functions.execute(prepared, context, options, h.deps);
  let destroys = 0;
  cloudinary.uploader.destroy = async () => { destroys++; };
  SiteProject.findOneAndUpdate = async (_query, update) => {
    if (stored.operation || stored.status === "approved") return null;
    Object.assign(stored, clone(update.$set));
    const p = new SiteProject(stored);
    p.save = async () => {
      assert.equal(p.$where.operation, stored.operation);
      await p.validate();
      const failure = failSave; failSave = null;
      if (failure !== "before_commit") stored = p.toObject();
      if (failure) throw new Error("Mongo official fixture failure");
      return p;
    };
    return p;
  };
  SiteProject.findById = () => ({ select: async () => new SiteProject(stored) });
  SiteProject.exists = async (query) => query.operation === stored.operation;
  SiteProject.updateOne = async (query, update) => {
    if (query.operation !== stored.operation) return { matchedCount: 0 };
    Object.assign(stored, clone(update.$set)); return { matchedCount: 1 };
  };
  const routePath = require.resolve("../routes/admin/design-lab.routes"); delete require.cache[routePath];
  const router = require(routePath);
  const action = async (mode = "new", generationId = null) => {
    const suffix = mode === "new" ? "/generations" : `/homepage-attempts/:generationId/${mode}`;
    const handler = router.stack.find((layer) => layer.route?.path === `/admin/design-lab/projects/:id/directions/:directionId${suffix}`).route.stack.at(-1).handle;
    const res = { code: 200, status(code) { this.code = code; return this; }, json(body) { this.body = JSON.parse(JSON.stringify(body)); return this; } };
    await handler({ params: { id: String(f.project._id), directionId: String(f.direction._id), generationId }, body: {} }, res);
    return res;
  };
  return { action, stored: () => stored, failNextSave: (type) => { failSave = type; }, destroys: () => destroys,
    restore: () => { for (const [object, key, fn] of originals) object[key] = fn; delete require.cache[routePath]; } };
}

for (const failure of ["before_commit", "lost_ack_after_commit"]) test(`Route Mongo ${failure} : récupération zéro appel, promotion atomique/idempotente`, async () => {
  const f = fixture(), h = harness(), route = routeHarness(f, h);
  const directionsBefore = clone(route.stored().directions);
  try {
    route.failNextSave(failure);
    const failed = await route.action();
    assert.equal(failed.code, 502); assert.equal(h.calls.length, 3); assert.equal(route.destroys(), 0);
    assert.equal(route.stored().generations.length, failure === "before_commit" ? 0 : 1);
    const attempt = [...h.records.values()][0]; assert.equal(attempt.assembled.status, "persisted");
    assert.ok(attempt.chapters.every((chapter) => chapter.status === "persisted"));
    const recovered = await route.action("recover", attempt.generationId);
    assert.equal(recovered.code, 200, recovered.body?.message);
    assert.equal(route.stored().generations.length, 1); assert.equal(route.stored().status, "exploration");
    assert.equal(h.calls.length, 3); assert.equal(route.destroys(), 0);
    const again = await route.action("recover", attempt.generationId);
    assert.equal(again.code, 200); assert.equal(route.stored().generations.length, 1); assert.equal(h.calls.length, 3);
    assert.deepEqual(clone(route.stored().directions), directionsBefore);
  } finally { route.restore(); }
});

test("Double clic backend bloqué pendant l'appel ; aucun quatrième appel", async () => {
  const f = fixture(), h = harness(), route = routeHarness(f, h);
  const generate = h.deps.generate;
  let release, started;
  const ready = new Promise((resolve) => { started = resolve; });
  const gate = new Promise((resolve) => { release = resolve; });
  h.deps.generate = async (...args) => { started(); await gate; return generate(...args); };
  try {
    const first = route.action(); await ready;
    const duplicate = await route.action();
    assert.equal(duplicate.code, 409); release();
    const success = await first;
    assert.equal(success.code, 200, success.body?.message); assert.equal(h.calls.length, 3);
    assert.equal(route.stored().generations.length, 1);
  } finally { release(); route.restore(); }
});
