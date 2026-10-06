const test = require("node:test");
const assert = require("node:assert/strict");
const { Writable } = require("node:stream");
const crypto = require("node:crypto");
const sharp = require("sharp");
const cloudinary = require("cloudinary").v2;
const DesignReference = require("../models/design-reference.model");
const GustoPortfolioSite = require("../models/gusto-portfolio-site.model");
const referenceRouter = require("../routes/admin/design-lab.routes");
const portfolioRouter = require("../routes/admin/design-lab-portfolio.routes");
const openai = require("../services/design-lab/openai.service");
const { getReferenceProgress } = require("../services/design-lab/reference-progress.service");
const {
  analyzePortfolioSite,
  replacePortfolioAnalysis,
  initialPortfolioProgress,
  nextPortfolioProgress,
} = require("../services/design-lab/portfolio-analysis.service");

function handler(router, method, path) {
  return router.stack.find((layer) => layer.route?.path === path && layer.route.methods[method])
    .route.stack.at(-1).handle;
}
function response() {
  return {
    status(code) { this.code = code; return this; },
    json(body) { this.body = body; return this; },
  };
}
const analysis = {
  referenceType: "raw_webpage",
  presentationArtifacts: [],
  visualTags: ["éditorial"],
  businessTags: [],
  analysis: { identity: "Identité" },
  characteristics: {},
  sectionInspirations: {},
};

test("Portfolio : le schéma expose une progression persistable dès la création", () => {
  const site = new GustoPortfolioSite({ name: "Test", url: "https://example.com/" });
  assert.equal(site.progress.status, "idle");
  site.progress = nextPortfolioProgress(initialPortfolioProgress(), {
    currentStage: "capturing_page", totalPages: 3, capturedPages: 1,
    currentPageIndex: 1, currentPageLabel: "Accueil",
  });
  assert.equal(site.validateSync(), undefined);
  assert.equal(site.toObject().progress.currentPageLabel, "Accueil");
});

test("référence : préparation, upload, Luna stable, sauvegarde et 100 %", async () => {
  const id = crypto.randomUUID();
  const png = await sharp({
    create: { width: 40, height: 60, channels: 3, background: "#abcdef" },
  }).png().toBuffer();
  const originalUpload = cloudinary.uploader.upload_stream;
  const originalCreate = DesignReference.create;
  const originalAnalyze = openai.analyzeReference;
  let releaseAnalysis;
  let enteredAnalysis;
  const entered = new Promise((resolve) => { enteredAnalysis = resolve; });
  const waiting = new Promise((resolve) => { releaseAnalysis = resolve; });
  const milestones = [];
  cloudinary.uploader.upload_stream = (_options, callback) => new Writable({
    write(_chunk, _encoding, done) { done(); },
    final(done) {
      milestones.push(getReferenceProgress(id).progress);
      callback(null, { secure_url: "https://res.cloudinary.com/demo/ref.webp", public_id: "ref" });
      done();
    },
  });
  DesignReference.create = async (fields) => {
    milestones.push(getReferenceProgress(id).progress);
    return { ...fields, save: async () => {
      milestones.push(getReferenceProgress(id).progress);
    } };
  };
  openai.analyzeReference = async () => {
    enteredAnalysis();
    await waiting;
    return analysis;
  };
  try {
    const res = response();
    const pending = handler(referenceRouter, "post", "/admin/design-lab/references")({
      file: { buffer: png, mimetype: "image/png", originalname: "Ref.png" },
      body: { name: "Ref", manualTags: "manuel", operationId: id },
    }, res);
    await entered;
    assert.equal(getReferenceProgress(id).currentStep, "analyzing");
    assert.equal(getReferenceProgress(id).progress, 60);
    const polled = response();
    await handler(referenceRouter, "get", "/admin/design-lab/references/progress/:operationId")(
      { params: { operationId: id } }, polled,
    );
    assert.equal(polled.body.progress.progress, 60);
    releaseAnalysis();
    await pending;
    assert.deepEqual(milestones, [30, 50, 90]);
    assert.equal(res.code, 201);
    assert.equal(getReferenceProgress(id).status, "completed");
    assert.equal(getReferenceProgress(id).progress, 100);
    assert.deepEqual(res.body.reference.manualTags, ["manuel"]);
  } finally {
    cloudinary.uploader.upload_stream = originalUpload;
    DesignReference.create = originalCreate;
    openai.analyzeReference = originalAnalyze;
  }
});

test("référence : échec Luna conserve le palier et n'affiche jamais 100 %", async () => {
  const id = crypto.randomUUID();
  const originalFind = DesignReference.findOneAndUpdate;
  const originalAnalyze = openai.analyzeReference;
  const reference = {
    _id: "ref", image: { url: "https://example.com/ref.webp" },
    manualTags: ["manuel"], save: async () => {},
  };
  DesignReference.findOneAndUpdate = async () => reference;
  openai.analyzeReference = async () => { throw new Error("Luna indisponible"); };
  const originalUpdate = DesignReference.updateOne;
  DesignReference.updateOne = async () => ({});
  try {
    const res = response();
    await handler(referenceRouter, "post", "/admin/design-lab/references/:id/analyze")(
      { params: { id: "507f1f77bcf86cd799439011" }, body: { operationId: id } }, res,
    );
    assert.equal(getReferenceProgress(id).status, "failed");
    assert.equal(getReferenceProgress(id).progress, 60);
    assert.match(getReferenceProgress(id).message, /analyse visuelle/);
    assert.deepEqual(reference.manualTags, ["manuel"]);
  } finally {
    DesignReference.findOneAndUpdate = originalFind;
    DesignReference.updateOne = originalUpdate;
    openai.analyzeReference = originalAnalyze;
  }
});

test("Portfolio : formule monotone, synthèse, succès et échec sans 100 %", () => {
  let state = initialPortfolioProgress();
  const values = [state.progress];
  for (const event of [
    { currentStage: "discovering" },
    { currentStage: "capturing_page", totalPages: 3, capturedPages: 1 },
    { currentStage: "capturing_page", capturedPages: 3, failedPages: 1 },
    { currentStage: "uploading_page", completedPages: 0 },
    { currentStage: "analyzing_page", completedPages: 0 },
    { currentStage: "analyzing_page", completedPages: 1 },
    { currentStage: "synthesizing" },
    { currentStage: "saving" },
    { currentStage: "completed" },
  ]) {
    state = nextPortfolioProgress(state, event);
    values.push(state.progress);
  }
  assert.deepEqual(values, [0, 5, 18, 35, 51, 51, 68, 85, 95, 100]);
  assert.equal(state.status, "completed");
  const failed = nextPortfolioProgress({ ...state, progress: 95 }, { currentStage: "failed" });
  assert.equal(failed.status, "failed");
  assert.equal(failed.progress, 95);
});

test("Portfolio : découverte, page courante, échec partiel et unique synthèse", async () => {
  const originalCaptureSetting = process.env.GUSTO_PORTFOLIO_CAPTURE_ENABLED;
  process.env.GUSTO_PORTFOLIO_CAPTURE_ENABLED = "true";
  try {
    const png = await sharp({
      create: { width: 40, height: 80, channels: 3, background: "#123456" },
    }).png().toBuffer();
    const pages = [
      { url: "https://example.com/", label: "Accueil", pageType: "home", buffer: png, captureIndex: 1 },
      { url: "https://example.com/carte", label: "Carte", pageType: "menu", buffer: png, captureIndex: 2 },
    ];
    let state = initialPortfolioProgress();
    const states = [];
    let visualCalls = 0;
    let profileCalls = 0;
    const result = await analyzePortfolioSite({ _id: "site", url: "https://example.com/" }, {
      capture: async (_url, callbacks) => {
        await callbacks.onPageStart(pages[0], 1, 0);
        await callbacks.onPage(pages[0], 1, 0);
        await callbacks.onDiscovered(3);
        await callbacks.onPageStart(pages[1], 2, 3);
        await callbacks.onPage(pages[1], 2, 3);
        await callbacks.onPageStart({ label: "Traiteur", pageType: "editorial" }, 3, 3);
        await callbacks.onPageError({ label: "Traiteur", pageType: "editorial" }, 3, 3);
        return { pages, discovered: 3, failures: [{ url: "/traiteur" }] };
      },
      upload: async () => ({ url: "https://res.cloudinary.com/demo/x.webp", publicId: "x" }),
      analyze: async () => { visualCalls += 1; return { visualTags: [], analysis: {} }; },
      synthesize: async () => { profileCalls += 1; return {}; },
      destroy: async () => {},
      onProgress: async (event) => {
        state = nextPortfolioProgress(state, event);
        states.push({ ...state });
      },
    });
    assert.equal(result.captureStats.discovered, 3);
    assert.equal(result.captureStats.failed, 1);
    assert.equal(visualCalls, 1); // Identical screenshots are still deduplicated.
    assert.equal(profileCalls, 1);
    assert.ok(states.some((entry) => entry.totalPages === 3 && entry.currentPageLabel === "Traiteur"));
    assert.ok(states.some((entry) => entry.failedPages === 1));
    assert.equal(states.at(-1).currentStage, "saving");
    assert.equal(states.at(-1).progress, 95);
    assert.ok(states.every((entry, index) => !index || entry.progress >= states[index - 1].progress));
  } finally {
    if (originalCaptureSetting === undefined)
      delete process.env.GUSTO_PORTFOLIO_CAPTURE_ENABLED;
    else process.env.GUSTO_PORTFOLIO_CAPTURE_ENABLED = originalCaptureSetting;
  }
});

test("Portfolio : le polling après refresh lit la progression persistée", async () => {
  const site = {
    _id: "507f1f77bcf86cd799439011",
    pages: [], analyzing: true, analysisStartedAt: new Date(),
    progress: initialPortfolioProgress(),
  };
  const originalFind = GustoPortfolioSite.findById;
  GustoPortfolioSite.findById = async () => site;
  let release;
  let reached;
  const waiting = new Promise((resolve) => { release = resolve; });
  const midStage = new Promise((resolve) => { reached = resolve; });
  const model = {
    updateOne: async (_filter, update) => {
      Object.assign(site, update.$set);
      return { modifiedCount: 1 };
    },
  };
  try {
    const pending = replacePortfolioAnalysis(site, {
      model,
      destroy: async () => {},
      analyze: async (_site, { onProgress }) => {
        await onProgress({
          currentStage: "analyzing_page", currentPageIndex: 2,
          totalPages: 3, currentPageLabel: "Carte",
          completedPages: 1, failedPages: 0,
          message: "Analyse visuelle : Carte",
        });
        reached();
        await waiting;
        await onProgress({ currentStage: "saving", message: "Enregistrement…" });
        return {
          pages: [], visualProfile: {}, captureStats: { discovered: 3, failed: 0 },
          analyzedAt: new Date(), newImages: [],
        };
      },
    });
    await midStage;
    const res = response();
    await handler(portfolioRouter, "get", "/admin/design-lab/portfolio/:id")(
      { params: { id: site._id } }, res,
    );
    assert.equal(res.body.site.progress.currentPageLabel, "Carte");
    assert.equal(res.body.site.progress.totalPages, 3);
    assert.equal(res.body.site.progress.completedPages, 1);
    assert.equal(res.body.site.progress.progress, 51);
    release();
    await pending;
    assert.equal(site.progress.status, "completed");
    assert.equal(site.progress.progress, 100);
    assert.equal(site.analyzing, false);
  } finally {
    GustoPortfolioSite.findById = originalFind;
  }
});

test("Portfolio : un échec persisté garde l'étape fautive et reste sous 100 %", async () => {
  const site = {
    _id: "507f1f77bcf86cd799439012",
    pages: [], analyzing: true, analysisStartedAt: new Date(),
    progress: initialPortfolioProgress(),
  };
  const model = {
    updateOne: async (_filter, update) => {
      Object.assign(site, update.$set);
      return { modifiedCount: 1 };
    },
  };
  const result = await replacePortfolioAnalysis(site, {
    model,
    destroy: async () => {},
    analyze: async (_site, { onProgress }) => {
      await onProgress({
        currentStage: "analyzing_page", currentPageIndex: 2,
        totalPages: 3, currentPageLabel: "Traiteur",
        completedPages: 1, message: "Analyse visuelle : Traiteur",
      });
      throw new Error("Vision indisponible");
    },
  });
  assert.equal(result, false);
  assert.equal(site.progress.status, "failed");
  assert.equal(site.progress.currentStage, "analyzing_page");
  assert.ok(site.progress.progress < 100);
  assert.match(site.progress.message, /analyse visuelle de « Traiteur »/);
  assert.equal(site.lastError, "Vision indisponible");
  assert.equal(site.analyzing, false);
});
