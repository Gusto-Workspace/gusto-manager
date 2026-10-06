const test = require("node:test");
const assert = require("node:assert/strict");
const mongoose = require("mongoose");
const SiteProject = require("../models/site-project.model");
const versions = require("../services/design-lab/direction-versioning.service");
const { checkpointIdentity, prepareCheckpoint } = require("../services/design-lab/directions-checkpoint.service");
const { buildApprovalSnapshot } = require("../services/design-lab/approval.service");
const openai = require("../services/design-lab/openai.service");
const DesignReference = require("../models/design-reference.model");
const GustoPortfolioSite = require("../models/gusto-portfolio-site.model");

const raw = (name, slot) => ({ name, slot, brandSystem: { brandIdea: name }, visualSystem: { referenceAnchors: [] }, siteInformationArchitecture: { homepageMoments: [{ id: "hero" }] } });
const set = (run) => versions.PRIMARY_SLOTS.map((slot) => ({ ...raw(`${slot} ${run}`, slot), generationId: run }));
function fixture() {
  const project = new SiteProject({ name: "Maison des versions", slug: "maison-des-versions", status: "directions_ready" });
  versions.promoteDirectionSet(project, set("run-1"), "run-1");
  return project;
}
function attachImages(project, direction) {
  direction.styleFrames.push({ image: { url: "https://res.cloudinary.com/demo/frame.png", publicId: "gusto/design-lab/generations/frame" }, prompt: "Frame historique", approvedAt: new Date() });
  direction.approvedStyleFrameId = direction.styleFrames[0]._id;
  project.generations.push({ directionId: direction._id, styleFrameId: direction.approvedStyleFrameId,
    generatedPrompt: "Home historique", image: { url: "https://res.cloudinary.com/demo/home.png", publicId: "gusto/design-lab/generations/home" } });
  project.selectedDirection = direction._id;
  project.selectedGeneration = project.generations[0]._id;
}

test("Première génération : trois slots actifs, v1 et generationId commun", async () => {
  const p = fixture();
  assert.deepEqual(versions.activeDirections(p).map(({ slot, version, status, generationId }) => ({ slot, version, status, generationId })),
    versions.PRIMARY_SLOTS.map((slot) => ({ slot, version: 1, status: "active", generationId: "run-1" })));
  assert.equal(versions.directionHistory(p).length, 0);
  await p.validate();
});

test("Régénérer B archive uniquement B v1 ; v2 vide, lien explicite et sélection effacée", async () => {
  const p = fixture(), [a, b, c] = versions.activeDirections(p);
  attachImages(p, b);
  const aBefore = JSON.stringify(a.toObject()), cBefore = JSON.stringify(c.toObject());
  const frames = JSON.stringify(b.styleFrames), homepage = JSON.stringify(p.generations[0]);
  const next = versions.promoteSingleDirection(p, b._id, { ...raw("Nouveau B", "B"), styleFrames: b.styleFrames, approvedStyleFrameId: b.approvedStyleFrameId }, "run-b-2");
  assert.equal(b.status, "archived");
  assert.equal(next.slot, "B"); assert.equal(next.version, 2); assert.equal(next.status, "active");
  assert.equal(String(next.replacesDirectionId), String(b._id));
  assert.equal(next.generationId, "run-b-2");
  assert.equal(next.styleFrames.length, 0); assert.equal(next.approvedStyleFrameId, null);
  assert.equal(versions.activeDirections(p).length, 3);
  assert.equal(JSON.stringify(a.toObject()), aBefore); assert.equal(JSON.stringify(c.toObject()), cBefore);
  assert.equal(JSON.stringify(b.styleFrames), frames); assert.equal(JSON.stringify(p.generations[0]), homepage);
  assert.equal(p.selectedDirection, null); assert.equal(p.selectedGeneration, null);
  await p.validate();
});

test("Régénérations successives de B : v1/v2 historiques, v3 active", async () => {
  const p = fixture(), b = versions.activeDirections(p)[1];
  const v2 = versions.promoteSingleDirection(p, b._id, raw("B2", "B"), "run-2");
  const v3 = versions.promoteSingleDirection(p, v2._id, raw("B3", "B"), "run-3");
  assert.equal(v3.version, 3); assert.equal(String(v3.replacesDirectionId), String(v2._id));
  assert.deepEqual(versions.directionHistory(p, "B").map((d) => d.version), [1, 2]);
  assert.equal(versions.activeDirections(p).length, 3);
  await p.validate();
});

test("Nouvelle génération complète : archive le set, incrémente chaque slot indépendamment", async () => {
  const p = fixture();
  versions.promoteSingleDirection(p, versions.activeDirections(p)[1]._id, raw("B2", "B"), "run-b-2");
  const previous = versions.activeDirections(p).map((d) => d._id);
  versions.promoteDirectionSet(p, set("run-full-2"), "run-full-2");
  assert.deepEqual(versions.activeDirections(p).map((d) => d.version), [2, 3, 2]);
  assert.equal(versions.activeDirections(p).length, 3);
  assert.equal(versions.directionHistory(p).length, 4);
  assert.ok(previous.every((id) => p.directions.id(id).status === "archived"));
  await p.validate();
});

test("Sélection A conservée si B régénérée", async () => {
  const p = fixture(), [a, b] = versions.activeDirections(p);
  attachImages(p, a);
  versions.promoteSingleDirection(p, b._id, raw("B2", "B"), "run-b-2");
  assert.equal(String(p.selectedDirection), String(a._id));
  assert.equal(String(p.selectedGeneration), String(p.generations[0]._id));
  await p.validate();
});

test("API JSON principale filtre versions et homepages historiques, stockage/historique les conserve", async () => {
  const p = fixture(), b = versions.activeDirections(p)[1];
  attachImages(p, b);
  versions.promoteSingleDirection(p, b._id, raw("B2", "B"), "run-b-2");
  const main = JSON.parse(JSON.stringify(p));
  assert.equal(main.directions.length, 3); assert.ok(main.directions.every(versions.isActivePrimary));
  assert.equal(main.generations.length, 0);
  assert.equal(p.toObject().directions.length, 4); assert.equal(p.generations.length, 1);
  assert.equal(versions.directionHistory(p)[0].styleFrames.length, 1);
  await p.validate();
});

test("Version archivée non sélectionnable/régénérable/approuvable, aucun paiement", () => {
  const p = fixture(), b = versions.activeDirections(p)[1];
  attachImages(p, b);
  versions.promoteSingleDirection(p, b._id, raw("B2", "B"), "run-b-2");
  assert.throws(() => versions.requireActiveDirection(p, b._id), { status: 409 });
  assert.throws(() => versions.promoteSingleDirection(p, b._id, raw("B3", "B"), "run-b-3"), { status: 409 });
  assert.throws(() => buildApprovalSnapshot(p, p.generations[0], [], new Date()), { status: 409 });
});

test("Freeze approved intact, aucun changement des directions ni du snapshot", () => {
  const p = fixture(); p.status = "approved"; p.approvedSnapshot = { marker: "immutable" };
  const before = JSON.stringify(p.toObject());
  assert.throws(() => versions.promoteDirectionSet(p, set("run-2"), "run-2"), /gelé/);
  assert.throws(() => versions.promoteSingleDirection(p, p.directions[1]._id, raw("B2", "B"), "run-b-2"), /gelé/);
  assert.equal(JSON.stringify(p.toObject()), before);
});

test("Legacy non assignée conservée sans promotion hasardeuse", async () => {
  const p = fixture();
  p.directions.push({ ...raw("Ancienne piste"), slot: null, version: null, status: "legacy_unassigned", generationId: null,
    styleFrames: [{ image: { url: "https://res.cloudinary.com/demo/legacy.png", publicId: "legacy-paid" }, prompt: "legacy" }] });
  const legacy = p.directions.at(-1);
  const before = JSON.stringify(legacy.toObject());
  versions.promoteDirectionSet(p, set("run-2"), "run-2");
  assert.equal(JSON.stringify(legacy.toObject()), before);
  assert.equal(legacy.slot, null); assert.equal(legacy.version, null);
  assert.ok(versions.directionHistory(p).includes(legacy));
  assert.equal(JSON.parse(JSON.stringify(p)).directions.length, 3);
  await p.validate();
});

for (const kind of ["partial_active", "no_active_set", "duplicate_slot", "duplicate_version", "wrong_parent", "legacy_assigned", "selected_archive", "selection_mismatch"]) test(`Modèle refuse ${kind}`, async () => {
  const p = fixture();
  if (kind === "partial_active") p.directions[2].status = "archived";
  if (kind === "no_active_set") p.directions.forEach((direction) => { direction.status = "archived"; });
  if (kind === "duplicate_slot") p.directions[2].slot = "A";
  if (kind === "duplicate_version") p.directions.push({ ...raw("doublon", "A"), version: 1, status: "archived", generationId: "bad" });
  if (kind === "wrong_parent") { const b = versions.promoteSingleDirection(p, p.directions[1]._id, raw("B2", "B"), "run-2"); b.replacesDirectionId = p.directions[0]._id; }
  if (kind === "legacy_assigned") p.directions.push({ ...raw("legacy", "B"), status: "legacy_unassigned" });
  if (kind === "selected_archive") { const b = p.directions[1]; versions.promoteSingleDirection(p, b._id, raw("B2", "B"), "run-2"); p.selectedDirection = b._id; }
  if (kind === "selection_mismatch") { attachImages(p, p.directions[1]); p.selectedDirection = p.directions[0]._id; }
  await assert.rejects(p.validate());
});

test("Checkpoint identifie le slot B et sa version source ; reprise incompatible après remplacement", () => {
  const p = fixture(), b = p.directions[1];
  const refs = [0, 1].map((n) => ({ _id: new mongoose.Types.ObjectId(), name: `Ref ${n}`, image: { url: `https://res.cloudinary.com/demo/${n}.png`, publicId: `ref-${n}` } }));
  const options = { count: 1, avoid: [], model: "mock-sol", schemas: {}, targetSlot: "B", replacesDirectionId: String(b._id) };
  const identity = checkpointIdentity(p, refs, null, options);
  assert.deepEqual(identity.ids, ["B"]);
  const checkpoint = prepareCheckpoint(null, identity, 1);
  assert.equal(checkpoint.targetSlot, "B"); assert.equal(checkpoint.replacesDirectionId, String(b._id));
  assert.ok(checkpoint.expansions.B);
  assert.equal(prepareCheckpoint(checkpoint, identity, 1).generationId, checkpoint.generationId);
  versions.promoteSingleDirection(p, b._id, raw("B2", "B"), "run-2");
  assert.throws(() => prepareCheckpoint(checkpoint, checkpointIdentity(p, refs, null, options), 1), /incompatible/);
});

test("Valider un Style Frame B efface la sélection d'une homepage A sans supprimer celle-ci", async () => {
  const project = fixture(), [a, b] = versions.activeDirections(project);
  attachImages(project, a);
  b.styleFrames.push({ image: { url: "https://res.cloudinary.com/demo/b.png", publicId: "b-frame" }, prompt: "B" });
  const homepageBefore = JSON.stringify(project.generations[0]);
  const original = SiteProject.findById;
  let saves = 0;
  SiteProject.findById = async () => project;
  project.save = async () => { await project.validate(); saves++; return project; };
  const routePath = require.resolve("../routes/admin/design-lab.routes"); delete require.cache[routePath];
  try {
    const router = require(routePath);
    const handler = router.stack.find((layer) => layer.route?.path === "/admin/design-lab/projects/:id/directions/:directionId/style-frames/:frameId/approve").route.stack.at(-1).handle;
    const res = { code: 200, status(code) { this.code = code; return this; }, json(body) { this.body = body; return this; } };
    await handler({ params: { id: String(project._id), directionId: String(b._id), frameId: String(b.styleFrames[0]._id) } }, res);
    assert.equal(res.code, 200, res.body?.message); assert.equal(saves, 1);
    assert.equal(String(project.selectedDirection), String(b._id)); assert.equal(project.selectedGeneration, null);
    assert.equal(String(b.approvedStyleFrameId), String(b.styleFrames[0]._id));
    assert.equal(JSON.stringify(project.generations[0]), homepageBefore);
  } finally { SiteProject.findById = original; delete require.cache[routePath]; }
});

test("Routes mockées : Régénérer B remplace le slot, deux relances restent à trois actives ; API/historique distincts", async () => {
  let stored = fixture().toObject(), saves = 0, calls = 0, destroys = 0;
  const cloudinary = require("cloudinary").v2;
  const originals = [ [SiteProject,"findOneAndUpdate"], [SiteProject,"findById"], [SiteProject,"exists"], [SiteProject,"updateOne"],
    [DesignReference,"find"], [GustoPortfolioSite,"find"], [openai,"generateDirectionsV2"], [cloudinary.uploader,"destroy"] ].map(([o,k])=>[o,k,o[k]]);
  const firstBId = stored.directions[1]._id;
  SiteProject.findOneAndUpdate = async (_query, update) => {
    Object.assign(stored, update.$set);
    const p = new SiteProject(stored);
    p.save = async () => { await p.validate(); stored = p.toObject(); saves++; return p; };
    return p;
  };
  SiteProject.findById = () => ({ select: async () => ({ directionGenerationCheckpoint: null }), then: (resolve,reject) => Promise.resolve(new SiteProject(stored)).then(resolve,reject) });
  SiteProject.exists = async () => true;
  SiteProject.updateOne = async (_query, update) => { Object.assign(stored,update.$set); return { matchedCount:1 }; };
  DesignReference.find = () => ({ lean:async()=>[] });
  GustoPortfolioSite.find = () => ({ lean:async()=>[] });
  cloudinary.uploader.destroy = async () => { destroys++; };
  openai.generateDirectionsV2 = async (_project,_references,options) => {
    calls++; assert.equal(options.count,1); assert.equal(options.targetSlot,"B");
    await options.onCheckpoint({ generationId:`mock-run-${calls}`,count:1,targetSlot:"B",replacesDirectionId:options.replacesDirectionId });
    return [{ ...raw(`B nouvelle ${calls}`,"B"),generationId:`mock-run-${calls}` }];
  };
  const routePath = require.resolve("../routes/admin/design-lab.routes"); delete require.cache[routePath];
  const router = require(routePath);
  const handler = (method,route) => router.stack.find((layer)=>layer.route?.path===`/admin/design-lab/projects/:id${route}`&&layer.route.methods[method]).route.stack.at(-1).handle;
  const response = () => ({ code:200,status(code){this.code=code;return this;},json(body){this.body=JSON.parse(JSON.stringify(body));return this;} });
  try {
    for (let n=0;n<2;n++) {
      const b = stored.directions.find((direction)=>direction.slot==="B"&&direction.status==="active");
      const res=response();
      await handler("post","/directions/:directionId/regenerate")({params:{id:String(stored._id),directionId:String(b._id)}},res);
      assert.equal(res.code,200,res.body?.message); assert.equal(res.body.project.directions.length,3);
      assert.equal(res.body.project.directions.find((direction)=>direction.slot==="B").version,n+2);
      assert.equal(stored.directionGenerationCheckpoint ?? null,null);
    }
    assert.equal(calls,2); assert.equal(saves,2); assert.equal(destroys,0);
    const denied=response();
    await handler("post","/directions/:directionId/regenerate")({params:{id:String(stored._id),directionId:String(firstBId)}},denied);
    assert.equal(denied.code,409); assert.equal(calls,2);
    const history=response(); await handler("get","/directions/history")({params:{id:String(stored._id)}},history);
    assert.equal(history.code,200); assert.deepEqual(history.body.directions.map((direction)=>direction.version),[1,2]);
  } finally { for(const [o,k,v]of originals)o[k]=v; delete require.cache[routePath]; }
});
