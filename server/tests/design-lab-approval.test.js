const test = require("node:test");
const assert = require("node:assert/strict");
const mongoose = require("mongoose");
const SiteProject = require("../models/site-project.model");
const Restaurant = require("../models/restaurant.model");
const DesignReference = require("../models/design-reference.model");
const router = require("../routes/admin/design-lab.routes");
const { seedVersionedFixture } = require("./helpers/direction-versions.fixture");
const {
  approveProject,
  reopenProject,
  assertProjectEditable,
} = require("../services/design-lab/approval.service");

function handler(method, path) {
  const layer = router.stack.find(
    (item) => item.route?.path === path && item.route.methods[method],
  );
  assert.ok(layer, `Route ${method.toUpperCase()} ${path} absente`);
  return layer.route.stack.at(-1).handle;
}

function response() {
  return {
    code: 200,
    status(code) {
      this.code = code;
      return this;
    },
    json(body) {
      this.body = body;
      return this;
    },
  };
}

function projectFixture() {
  const project = new SiteProject({
    restaurantId: new mongoose.Types.ObjectId(),
    name: "Le Jardin",
    slug: "le-jardin",
    brief: { story: "Histoire initiale", city: "Paris" },
    creativeSettings: { creativity: 75, styles: ["Éditorial"] },
    assets: [{
      url: "https://res.cloudinary.com/demo/image/upload/logo.webp",
      publicId: "gusto/design-lab/projects/logo",
      role: "logo",
      name: "Logo",
    }],
    status: "exploration",
  });
  const referenceId = new mongoose.Types.ObjectId();
  project.directions.push({
    name: "Direction A",
    concept: "Éditorial",
    referencesUsed: [referenceId],
    brandSystem: { brandIdea: "Maison éditoriale" },
    visualSystem: { designThesis: "Rythme ample" },
    siteInformationArchitecture: { homepageMoments: [{ id: "hero" }] },
    styleFrames: [{
      image: { url: "https://res.cloudinary.com/demo/image/upload/frame.webp", publicId: "gusto/design-lab/generations/frame" },
      prompt: "Style Frame",
      approvedAt: new Date(),
    }],
  });
  project.directions[0].approvedStyleFrameId = project.directions[0].styleFrames[0]._id;
  seedVersionedFixture(project);
  project.generations.push({
    directionId: project.directions[0]._id,
    styleFrameId: project.directions[0].approvedStyleFrameId,
    generatedPrompt: "Premier prompt",
    image: {
      url: "https://res.cloudinary.com/demo/image/upload/home-1.png",
      publicId: "gusto/design-lab/generations/home-1",
    },
  });
  project.save = async () => {
    await project.validate();
    return project;
  };
  return { project, referenceId };
}

test("approbation gelée, snapshot autonome, réouverture et nouvelle approbation", async () => {
  const { project, referenceId } = projectFixture();
  const firstId = project.generations[0]._id;
  const approvedAt = new Date("2026-10-02T10:00:00.000Z");
  approveProject(project, project.generations[0], [{
    _id: referenceId,
    name: "REF 01",
    image: { url: "https://res.cloudinary.com/demo/ref.webp", publicId: "gusto/design-lab/references/ref" },
    visualTags: ["éditorial"],
    analysis: { hero: "Grand titre" },
  }], approvedAt);
  await project.validate();
  assert.equal(project.status, "approved");
  assert.equal(project.approvedAt.toISOString(), approvedAt.toISOString());
  assert.equal(String(project.approvedGeneration), String(firstId));
  assert.equal(String(project.approvedSnapshot.projectId), String(project._id));
  assert.equal(String(project.approvedSnapshot.restaurantId), String(project.restaurantId));
  assert.equal(project.approvedSnapshot.slug, "le-jardin");
  assert.equal(project.approvedSnapshot.brief.story, "Histoire initiale");
  assert.equal(project.approvedSnapshot.creativeSettings.creativity, 75);
  assert.equal(project.approvedSnapshot.assets[0].role, "logo");
  assert.equal(project.approvedSnapshot.direction.name, "Direction A");
  assert.equal(project.approvedSnapshot.styleFrame.prompt, "Style Frame");
  assert.equal(project.approvedSnapshot.generation.generatedPrompt, "Premier prompt");
  assert.equal(String(project.approvedSnapshot.referencesUsed[0].referenceId), String(referenceId));
  assert.deepEqual(project.approvedSnapshot.referencesUsed[0].visualTags, ["éditorial"]);
  assert.throws(() => assertProjectEditable(project), /gelé/);
  assert.throws(
    () => approveProject(project, project.generations[0], []),
    /gelé/,
  );

  reopenProject(project);
  await project.validate();
  assert.equal(project.status, "exploration");
  assert.equal(project.approvedGeneration, null);
  assert.equal(project.approvedAt, null);
  assert.equal(project.approvedSnapshot, null);
  assert.equal(project.approvalHistory.length, 1);
  assert.equal(String(project.generations[0]._id), String(firstId));
  assert.equal(project.approvalHistory[0].brief.story, "Histoire initiale");

  project.brief.story = "Histoire révisée";
  project.assets[0].role = "signatureGraphic";
  project.directions[0].name = "Direction revue";
  project.generations.push({
    directionId: project.directions[0]._id,
    styleFrameId: project.directions[0].approvedStyleFrameId,
    parentGenerationId: firstId,
    userPrompt: "Plus éditorial",
    generatedPrompt: "Nouveau prompt",
    image: {
      url: "https://res.cloudinary.com/demo/image/upload/home-2.png",
      publicId: "gusto/design-lab/generations/home-2",
    },
  });
  approveProject(project, project.generations[1], [], new Date("2026-10-03T10:00:00.000Z"));
  await project.validate();
  assert.equal(project.status, "approved");
  assert.equal(String(project.approvedGeneration), String(project.generations[1]._id));
  assert.equal(project.approvedSnapshot.brief.story, "Histoire révisée");
  assert.equal(project.approvalHistory[0].brief.story, "Histoire initiale");
  assert.equal(project.approvalHistory[0].assets[0].role, "logo");
  assert.equal(project.approvalHistory[0].direction.name, "Direction A");
  assert.equal(String(project.approvalHistory[0].generation._id), String(firstId));
});

test("la route d'approbation fige le contrat final et la référence utilisée", async () => {
  const { project, referenceId } = projectFixture();
  const originalFindById = SiteProject.findById;
  const originalFindReferences = DesignReference.find;
  SiteProject.findById = async () => project;
  DesignReference.find = () => ({
    select: () => ({
      lean: async () => [{
        _id: referenceId,
        name: "REF 01",
        image: {
          url: "https://res.cloudinary.com/demo/ref.webp",
          publicId: "gusto/design-lab/references/ref",
        },
        visualTags: ["éditorial"],
        analysis: { hero: "Grand titre" },
      }],
    }),
  });
  try {
    const res = response();
    await handler(
      "post",
      "/admin/design-lab/projects/:id/generations/:generationId/approve",
    )({
      params: {
        id: String(project._id),
        generationId: String(project.generations[0]._id),
      },
    }, res);
    assert.equal(res.code, 200);
    assert.equal(project.status, "approved");
    assert.ok(project.approvedAt instanceof Date);
    assert.equal(project.approvedSnapshot.referencesUsed[0].name, "REF 01");
    assert.equal(project.approvedSnapshot.referencesUsed[0].analysis.hero, "Grand titre");
  } finally {
    SiteProject.findById = originalFindById;
    DesignReference.find = originalFindReferences;
  }
});

test("le modèle refuse un statut d'approbation incohérent", async () => {
  const { project } = projectFixture();
  project.status = "approved";
  await assert.rejects(project.validate(), /snapshot/);
  project.status = "exploration";
  project.approvedGeneration = project.generations[0]._id;
  await assert.rejects(project.validate(), /Réouvrez/);
  project.approvedGeneration = null;
  approveProject(project, project.generations[0], []);
  project.approvedGeneration = new mongoose.Types.ObjectId();
  await assert.rejects(project.validate(), /ne correspond pas/);
});

test("restaurantId choisi par l'admin est vérifié et enregistré", async () => {
  const id = new mongoose.Types.ObjectId();
  const restaurantId = new mongoose.Types.ObjectId();
  const original = {
    exists: Restaurant.exists,
    create: SiteProject.create,
    findById: SiteProject.findById,
  };
  let existingRestaurant = true;
  let saved;
  Restaurant.exists = async ({ _id }) =>
    existingRestaurant && String(_id) === String(restaurantId);
  SiteProject.create = async (fields) => {
    saved = new SiteProject({ _id: id, ...fields });
    saved.save = async () => {
      await saved.validate();
      return saved;
    };
    return saved;
  };
  SiteProject.findById = async () => saved;
  try {
    const created = response();
    await handler("post", "/admin/design-lab/projects")({
      body: { name: "Le Jardin", slug: "le-jardin", restaurantId: String(restaurantId) },
    }, created);
    assert.equal(created.code, 201);
    assert.equal(String(created.body.project.restaurantId), String(restaurantId));

    const updated = response();
    await handler("put", "/admin/design-lab/projects/:id")({
      params: { id: String(id) },
      body: {
        name: "Le Jardin",
        slug: "le-jardin",
        restaurantId: String(restaurantId),
        brief: { city: "Paris" },
      },
    }, updated);
    assert.equal(updated.code, 200);
    assert.equal(String(saved.restaurantId), String(restaurantId));
    assert.equal(saved.brief.city, "Paris");

    existingRestaurant = false;
    const invalid = response();
    await handler("put", "/admin/design-lab/projects/:id")({
      params: { id: String(id) },
      body: { name: "Le Jardin", slug: "le-jardin", restaurantId: String(restaurantId) },
    }, invalid);
    assert.equal(invalid.code, 400);
    assert.match(invalid.body.message, /introuvable/);
  } finally {
    Restaurant.exists = original.exists;
    SiteProject.create = original.create;
    SiteProject.findById = original.findById;
  }
});

test("routes projet gelé : mutations refusées, lecture et réouverture permises", async () => {
  const Attempt = require("../models/style-frame-generation-attempt.model");
  const originalFindAttempts = Attempt.find;
  Attempt.find = () => ({ sort: () => ({ limit: () => ({ lean: async () => [] }) }) });
  const { project } = projectFixture();
  approveProject(project, project.generations[0], []);
  const original = {
    findById: SiteProject.findById,
    findOneAndUpdate: SiteProject.findOneAndUpdate,
    findOneAndDelete: SiteProject.findOneAndDelete,
  };
  let costlyActions = 0;
  SiteProject.findById = () => ({
    select: async () => project,
    then(resolve, reject) {
      return Promise.resolve(project).then(resolve, reject);
    },
  });
  SiteProject.findOneAndUpdate = async () => {
    costlyActions += 1;
    return null;
  };
  SiteProject.findOneAndDelete = async () => null;
  const id = String(project._id);
  const directionId = String(project.directions[0]._id);
  const generationId = String(project.generations[0]._id);
  const assetId = String(project.assets[0]._id);
  const cases = [
    ["put", "/admin/design-lab/projects/:id", { body: {} }],
    ["post", "/admin/design-lab/projects/:id/existing-website-context"],
    ["post", "/admin/design-lab/projects/:id/assets", { file: { buffer: Buffer.from("unused") } }],
    ["patch", "/admin/design-lab/projects/:id/assets/:assetId", { body: { role: "food" } }],
    ["delete", "/admin/design-lab/projects/:id/assets/:assetId"],
    ["post", "/admin/design-lab/projects/:id/select-references"],
    ["post", "/admin/design-lab/projects/:id/directions"],
    ["post", "/admin/design-lab/projects/:id/directions/:directionId/regenerate"],
    ["post", "/admin/design-lab/projects/:id/directions/:directionId/generations"],
    ["patch", "/admin/design-lab/projects/:id/directions/:directionId/select"],
    ["post", "/admin/design-lab/projects/:id/generations/:generationId/variations", { body: { instruction: "Plus éditorial" } }],
    ["patch", "/admin/design-lab/projects/:id/selection", { body: { generationId } }],
    ["post", "/admin/design-lab/projects/:id/generations/:generationId/approve"],
    ["delete", "/admin/design-lab/projects/:id"],
  ];
  try {
    for (const [method, path, extra] of cases) {
      const res = response();
      await handler(method, path)({
        params: { id, directionId, generationId, assetId },
        body: extra?.body || {},
        file: extra?.file,
      }, res);
      assert.equal(res.code, 409, `${method.toUpperCase()} ${path}`);
      assert.match(res.body.message, /gelé/);
    }
    const read = response();
    await handler("get", "/admin/design-lab/projects/:id")({ params: { id } }, read);
    assert.equal(read.code, 200);
    assert.equal(read.body.project.generations.length, 1);
    assert.ok(read.body.project.approvedSnapshot);
    assert.equal(costlyActions, 5);

    const reopened = response();
    await handler("post", "/admin/design-lab/projects/:id/reopen")({ params: { id } }, reopened);
    assert.equal(reopened.code, 200);
    assert.equal(reopened.body.project.status, "exploration");
    assert.equal(reopened.body.project.approvalHistory.length, 1);
    assert.equal(reopened.body.project.approvedGeneration, null);
  } finally {
    Attempt.find = originalFindAttempts;
    SiteProject.findById = original.findById;
    SiteProject.findOneAndUpdate = original.findOneAndUpdate;
    SiteProject.findOneAndDelete = original.findOneAndDelete;
  }
});
