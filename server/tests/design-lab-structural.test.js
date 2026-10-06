const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const sharp = require("sharp");
const StructuralReference = require("../models/structural-reference.model");
const {
  createStructuralService,
  prepareStructuralViews,
  sourceFields,
  OPERATION_TTL_MS,
  VIEW_TYPES,
} = require("../services/design-lab/structural-reference.service");
const {
  SAMPLED_VIEW_TYPES,
  PROFILE_FIELDS,
  MOMENT_FIELDS,
  RHYTHM_FIELDS,
  structuralCoverageContext,
  structuralViewGeometry,
  buildStructuralVisionRequest,
  structuralAnalysisSchema,
  validateStructuralAnalysis,
} = require("../services/design-lab/structural-reference.contract");
const {
  publicAddress,
  fetchPublicResource,
  capturePortfolioSite,
  CAPTURE_USER_AGENT,
} = require("../services/design-lab/portfolio-capture.service");
const {
  createRouter,
} = require("../routes/admin/design-lab-structural.routes");
const {
  analyzeStructuralReference,
  MODEL_CONFIG,
} = require("../services/design-lab/openai.service");
const id = "507f1f77bcf86cd799439011";
const cleanTrace = () => ({
  version: 3,
  consentDetected: false,
  consentAction: "none",
  consentLabel: "",
  blockingOverlayDetected: false,
  blockingOverlays: [],
  qualityPassed: true,
  sanitizedAt: new Date(),
});
const publicLookup = async () => [{ address: "93.184.215.14" }];
const completeCoverage = () => ({
  version: 2,
  captureStrategy: "continuous",
  strategy: "document",
  totalHeight: 3000,
  viewportHeight: 900,
  complete: true,
  reachedEnd: true,
  distinctViews: true,
  positions: [{ position: 0 }, { position: 1050 }, { position: 2100 }],
});
function fixture(
  overview = "Une ouverture immersive, suivie d’un texte étroit décalé, puis d’une rupture panoramique.",
) {
  return {
    overview,
    layoutProfile: Object.fromEntries(
      PROFILE_FIELDS.map((key) => [
        key,
        "Colonnes inégales et axes partagés, alternance de masses denses et de grands vides.",
      ]),
    ),
    rhythmSequence: ["immersive", "quiet", "photographic"].map(
      (climate, i) => ({
        order: i + 1,
        startPercent: [0, 33, 67][i],
        endPercent: [33, 67, 100][i],
        ...Object.fromEntries(
          RHYTHM_FIELDS.map((field) => [
            field,
            field === "climate"
              ? climate
              : "Une masse dense se relâche dans le vide ; texte étroit puis image large et transition vers la terminaison.",
          ]),
        ),
      }),
    ),
    sparseMomentsJustification: "",
    structuralMoments: [
      "fullBleedPhotography",
      "offsetGrid",
      "wideEditorial",
    ].map((layoutMode, i) => ({
      order: i + 1,
      layoutMode,
      ...Object.fromEntries(
        MOMENT_FIELDS.map((key) => [
          key,
          key === "role"
            ? ["opening", "editorialPause", "imageBreak"][i]
            : "Texte contenu décalé vers un tiers, photographie large et vide intermédiaire.",
        ]),
      ),
      transferablePrinciples: [
        "Maintenir un axe commun sans répéter les proportions.",
      ],
      evidence: {
        sourceViews: [
          ["visionOverview", "top"],
          ["visionOverview", "middle"],
          ["visionOverview", "bottom"],
        ][i],
        startPercent: [0, 33, 67][i],
        endPercent: [33, 67, 100][i],
        observation:
          "Masse photographique et texte de largeur contenue ; alignements visibles dans cette région.",
      },
    })),
    signatureStructuralMoves: [
      "Un axe partagé entre des moments de largeur différente.",
    ],
    transferablePrinciples: ["Utiliser le vide comme transition."],
    avoidCopying: [
      "Ne pas reprendre le layout exact, le branding, les logos, textes ou illustrations propriétaires.",
    ],
    suitableFor: ["Contenu éditorial court et photographies panoramiques."],
    avoidWhen: ["Texte long sans ressources photographiques."],
  };
}
function sampledFixture() {
  const result = fixture();
  result.structuralMoments.forEach((moment) => {
    moment.evidence.sourceViews = moment.evidence.sourceViews.map((view) =>
      view === "visionOverview" ? "overview" : view,
    );
  });
  return result;
}
const png = () =>
  sharp({
    create: {
      width: 300,
      height: 3000,
      channels: 4,
      background: { r: 80, g: 110, b: 120, alpha: 0.5 },
    },
  })
    .png()
    .toBuffer();
const views = () =>
  VIEW_TYPES.map((type) => ({
    type,
    url: `https://res.cloudinary.com/demo/${type}.webp`,
    publicId: `structural/${type}`,
    width: 300,
    height: 1000,
  }));
const gucciMetadata = () => ({
  documentHeight: 900,
  viewport: { width: 1440, height: 900 },
  captureCoverage: {
    ...completeCoverage(),
    totalHeight: 5212,
    viewportHeight: 900,
  },
});
const gucciViews = () =>
  views().map((view) => ({
    ...view,
    viewport: { width: 1440, height: 900 },
    sourceRect: {
      left: 0,
      top: { top: 0, middle: 2156, bottom: 4312 }[view.type] || 0,
      width: 1440,
      height: ["desktop_full", "visionOverview"].includes(view.type)
        ? 5212
        : 900,
    },
  }));
const sampledCoverage = () => ({
  version: 2,
  strategy: "document",
  captureStrategy: "sampled",
  totalHeight: 6128,
  viewportHeight: 900,
  complete: true,
  reachedEnd: true,
  distinctViews: true,
  scrollMotionDetected: true,
  overviewKind: "structural_storyboard",
  positions: [0, 1046, 2614, 4182, 5228].map((position, index) => ({
    role: ["top", "upper", "middle", "lower", "bottom"][index],
    position,
    progressPercent: [0, 20, 50, 80, 100][index],
    stabilized: true,
    signature: `sample-${index}`,
  })),
});
const sampledViews = () =>
  SAMPLED_VIEW_TYPES.map((type) => {
    const sample = sampledCoverage().positions.find(
      (item) => item.role === type,
    );
    return {
      type,
      url: `https://res.cloudinary.com/demo/${type}.webp`,
      publicId: `structural/${type}`,
      width: 1440,
      height: type === "overview" ? 4840 : 900,
      viewport: { width: 1440, height: 900 },
      progressPercent: sample?.progressPercent,
      sourceRect: {
        left: 0,
        top: sample?.position || 0,
        width: 1440,
        height: type === "overview" ? 4840 : 900,
      },
    };
  });
function currentSampledCoverage(totalHeight = 11556, positions = [0, 3924, 10530], mode = "adaptive") {
  return {
    ...sampledCoverage(), version: 3, totalHeight,
    observationSelection: { version: 1, mode, fallbackReasons: mode === "fixed_fallback" ? ["unreliable_geometry"] : [] },
    positions: positions.map((position, i) => ({ role: `observation${i + 1}`, position,
      visibleRangePx: [position, Math.min(totalHeight, position + 900)], stabilized: true })),
    storyboard: { complete: true, width: 720, height: 2400,
      panels: Array.from({ length: Math.ceil(totalHeight / 900) }, (_, i) => {
        const position = Math.min(i * 900, totalHeight - 900);
        return { position, visibleRangePx: [position, position + 900], stabilized: true,
          scale: 1 / 6, rect: { x: 0, y: i * 160, width: 240, height: 150 } };
      }) },
  };
}
function currentSampledViews(coverage = currentSampledCoverage()) {
  return [sampledViews()[0], ...coverage.positions.map((p) => ({
    ...sampledViews()[1], type: p.role, url: `https://fixture.test/${p.role}.webp`,
    sourceRect: { left: 0, top: p.position, width: 1440, height: p.visibleRangePx[1] - p.position }, detail: "high",
  }))];
}
function failedTastaventsCase() {
  // Exact geometry, phase ranges and citations recovered read-only from
  // generation c0ffeea4-18bf-4b10-9310-f75818c4d978. Other prose is synthetic.
  const positions = [0, 2131, 5328, 8525, 10656];
  const metadata = { viewport: { width: 1440, height: 900 }, captureCoverage: {
    ...sampledCoverage(), totalHeight: 11556,
    positions: sampledCoverage().positions.map((p, i) => ({ ...p, position: positions[i] })),
  } };
  const captures = sampledViews().map((c, i) => ({ ...c,
    sourceRect: { ...c.sourceRect, top: i ? positions[i - 1] : 0 } }));
  const ranges = [[0,9],[9,19],[19,31],[31,49],[49,63],[63,74],[74,79],[79,95],[95,100]];
  const sources = [["top"],["upper"],["upper"],["middle"],["middle"],["middle","lower"],["lower"],["lower"],["bottom"]];
  const result = sampledFixture();
  result.rhythmSequence = ranges.map(([startPercent,endPercent], i) => ({ ...fixture().rhythmSequence[i % 3],
    order: i + 1, startPercent, endPercent }));
  result.structuralMoments = ranges.map(([startPercent,endPercent], i) => ({ ...fixture().structuralMoments[i % 3],
    order: i + 1, evidence: { ...fixture().structuralMoments[i % 3].evidence,
      sourceViews: [...sources[i], "overview"], startPercent, endPercent } }));
  result.structuralMoments[5].viewportRelationship = "La bande est annoncée au bas de la vue middle et réapparaît au sommet de la vue lower.";
  result.structuralMoments[5].evidence.observation = "Le storyboard indique la bande d’images entre le champ typographique et la réservation ; la vue lower en montre la fin au sommet du viewport.";
  const rawResponse = { output: [{ content: [{ type: "output_text", text: JSON.stringify(result) }] }] };
  return { captures, metadata, result, rawResponse };
}
function twoPhases() {
  const result = fixture();
  result.rhythmSequence = result.rhythmSequence.slice(0, 2);
  result.structuralMoments = result.structuralMoments.slice(0, 2);
  for (let i = 0; i < 2; i++) {
    Object.assign(result.rhythmSequence[i], {
      startPercent: i * 50,
      endPercent: (i + 1) * 50,
    });
    Object.assign(result.structuralMoments[i].evidence, {
      startPercent: i * 50,
      endPercent: (i + 1) * 50,
      sourceViews: i ? ["middle", "bottom"] : ["top", "middle"],
    });
  }
  return result;
}

test("Tastavents sampled : middle autorisé, rejet evidence.3 uniquement si la plage est distante", () => {
  // Stored capture geometry from the failed TEST attempt. The rejected raw
  // response was not persisted: this is a synthetic reproduction, not its JSON.
  const positions = [0, 2131, 5328, 8525, 10656];
  const captures = sampledViews().map((view, index) => ({
    ...view,
    sourceRect: {
      ...view.sourceRect,
      top: index ? positions[index - 1] : 0,
    },
  }));
  const metadata = {
    viewport: { height: 900 },
    captureCoverage: { ...sampledCoverage(), totalHeight: 11556 },
  };
  const result = sampledFixture();
  const ranges = [[0, 18], [18, 32], [32, 46], [46, 72], [72, 100]];
  const sources = [["top"], ["upper"], ["overview"], ["middle"], ["lower", "bottom"]];
  result.rhythmSequence = ranges.map(([startPercent, endPercent], i) => ({
    ...result.rhythmSequence[i % 3], order: i + 1, startPercent, endPercent,
  }));
  result.structuralMoments = ranges.map(([startPercent, endPercent], i) => ({
    ...result.structuralMoments[i % 3], order: i + 1,
    evidence: { ...result.structuralMoments[i % 3].evidence,
      sourceViews: sources[i], startPercent, endPercent },
  }));
  assert.equal(validateStructuralAnalysis(result, metadata, captures), result);
  // MIDDLE shows 46.11–53.89 % of the page, not a generic middle third.
  result.rhythmSequence[2].endPercent = 60;
  result.structuralMoments[2].evidence.endPercent = 60;
  result.rhythmSequence[3].startPercent = 60;
  result.structuralMoments[3].evidence.startPercent = 60;
  assert.throws(() => validateStructuralAnalysis(result, metadata, captures),
    { message: "Analyse structurelle invalide : evidence.3.sourceViews.middle." });
});

test("Tastavents attempt c0ffeea4 : les six anciennes images v2 donnent exactement evidence.5.middle", () => {
  const { captures, metadata, result } = failedTastaventsCase();
  const request = buildStructuralVisionRequest(captures, metadata);
  assert.deepEqual(request.manifest.viewOrder, SAMPLED_VIEW_TYPES);
  assert.deepEqual(request.manifest.views[3].geometry.visibleRangePx, [5328, 6228]);
  assert.deepEqual(request.content.filter((c) => c.type === "input_image").map((c) => c.image_url), captures.map((c) => c.url));
  assert.throws(() => validateStructuralAnalysis(result, metadata, captures, request.manifest), (error) => {
    assert.deepEqual(error.validation, { fieldPath: "evidence.5.sourceViews.middle", reason: "evidence_outside_visible_range",
      view: "middle", visibleRangePx: [5328,6228], momentRangePx: [7280.28,8551.44], totalHeight: 11556, roundingTolerancePx: 231.12 });
    return true;
  });
});

test("manifeste adaptatif : seuls les vrais identifiants/rectangles sont partagés, anciens crops non envoyés exclus", () => {
  const metadata = { captureCoverage: currentSampledCoverage() };
  const captures = [...currentSampledViews(metadata.captureCoverage), ...sampledViews().slice(1)];
  const request = buildStructuralVisionRequest(captures, metadata);
  assert.deepEqual(request.manifest.viewOrder, ["overview","observation1","observation2","observation3"]);
  assert.deepEqual(request.manifest.views.slice(1).map((v) => v.geometry.visibleRangePx), [[0,900],[3924,4824],[10530,11430]]);
  assert.deepEqual(request.schema.properties.structuralMoments.items.properties.evidence.properties.sourceViews.items.enum,
    request.manifest.viewOrder);
  assert.match(request.instructions, /identifiants réellement envoyés : \["overview","observation1","observation2","observation3"\]/);
  const result = sampledFixture();
  result.structuralMoments.forEach((m) => { m.evidence.sourceViews = ["overview"]; });
  assert.equal(validateStructuralAnalysis(result, metadata, captures, request.manifest), result);
  result.structuralMoments[1].evidence.sourceViews = ["middle"];
  assert.throws(() => validateStructuralAnalysis(result, metadata, captures, request.manifest),
    { message: "Analyse structurelle invalide : evidence.1.sourceViews.middle." });
  const changed = structuredClone(captures);
  changed[2].sourceRect.top = 5328;
  assert.throws(() => buildStructuralVisionRequest(changed, metadata, request.manifest),
    (e) => e.code === "structural_vision_manifest_mismatch");
});

test("contrat Vision : un seul repère de page et intersection des preuves explicités", () => {
  const { structuralInstructions } = require("../services/design-lab/structural-reference.contract");
  const prompt = structuralInstructions("sampled");
  assert.match(prompt, /100 \* positionPx \/ captureCoverage.totalHeight/);
  assert.match(prompt, /ce n'est PAS le même repère/);
  assert.match(prompt, /plage du moment doit intersecter approximatePagePercent/);
  assert.match(structuralAnalysisSchema.properties.rhythmSequence.items.properties.startPercent.description,
    /jamais le pourcentage de déplacement du scroll/);
  assert.match(structuralAnalysisSchema.properties.structuralMoments.items.properties.evidence.properties.sourceViews.description,
    /doit intersecter/);
});

test("géométrie réelle : noms permutés, sourceRect prioritaire et viewport enregistré", () => {
  const captures = gucciViews();
  const first = captures.find((v) => v.type === "top");
  const last = captures.find((v) => v.type === "bottom");
  [first.sourceRect, last.sourceRect] = [last.sourceRect, first.sourceRect];
  first.progressPercent = 0; // Deliberately misleading legacy scroll label.
  const metadata = gucciMetadata();
  assert.deepEqual(structuralViewGeometry(first, metadata, captures).visibleRangePx, [4312, 5212]);
  assert.equal(structuralViewGeometry(first, metadata, captures).scrollY, 4312);
  assert.equal(structuralViewGeometry(first, metadata, captures).viewportHeight, 900);
  const result = fixture();
  result.structuralMoments[0].evidence.sourceViews = ["bottom"];
  result.structuralMoments[2].evidence.sourceViews = ["top"];
  assert.equal(validateStructuralAnalysis(result, metadata, captures), result);
  result.structuralMoments[0].evidence.sourceViews = ["top"];
  assert.throws(() => validateStructuralAnalysis(result, metadata, captures), (error) => {
    assert.equal(error.validation.reason, "evidence_outside_visible_range");
    assert.deepEqual(error.validation.visibleRangePx, [4312, 5212]);
    return true;
  });
});

test("sampled : géométrie manquante refusée au lieu de déduire une position du nom", () => {
  const captures = sampledViews();
  delete captures.find((v) => v.type === "middle").sourceRect;
  assert.throws(() => validateStructuralAnalysis(sampledFixture(), {
    captureCoverage: sampledCoverage(),
  }, captures), (error) => error.validation.reason === "missing_recorded_geometry");
});

// In-memory compare-and-set mock: no Mongo connection, documents or real writes.
function store(initial = {}) {
  let record = {
    _id: id,
    sourceType: "manual_url",
    sourceUrl: "https://example.com/",
    title: "Test",
    slug: "test",
    domain: "example.com",
    manualTags: ["editorial"],
    captures: [],
    status: "pending",
    active: true,
    analysis: null,
    captureSanitization: cleanTrace(),
    captureCoverage: completeCoverage(),
    ...initial,
  };
  const copy = () => record && structuredClone(record);
  function match(filter) {
    if (!record || String(filter._id) !== String(record._id)) return false;
    if (
      filter.operationToken !== undefined &&
      record.operationToken !== filter.operationToken
    )
      return false;
    if (
      filter.$or &&
      ["capturing", "analyzing"].includes(record.status) &&
      !(
        record.operationStartedAt &&
        Date.now() - new Date(record.operationStartedAt) > OPERATION_TTL_MS
      )
    )
      return false;
    return true;
  }
  return {
    get: copy,
    Model: {
      findOneAndUpdate: (filter, update, options = {}) => ({
        lean: async () => {
          if (!match(filter)) return null;
          const previous = copy();
          Object.assign(record, update.$set);
          return options.new === false ? previous : copy();
        },
      }),
      findOneAndDelete: (filter) => ({
        lean: async () => {
          if (!match(filter)) return null;
          const previous = copy();
          record = null;
          return previous;
        },
      }),
      find: () => ({
        sort: () => ({ lean: async () => (record ? [copy()] : []) }),
      }),
      findById: () => ({ lean: async () => copy() }),
      create: async (fields) => {
        Object.assign(record, fields);
        return copy();
      },
    },
  };
}
function attemptStore() {
  const records = new Map();
  const copy = (value) => value && structuredClone(value);
  const match = (row, filter) => Object.entries(filter).every(([key, value]) => String(row[key]) === String(value));
  return {
    records,
    Model: {
      create: async (fields) => {
        const row = { ...structuredClone(fields), _id: String(records.size + 1).padStart(24, "0") };
        records.set(row._id, row); return copy(row);
      },
      findOneAndUpdate: (filter, update) => ({ lean: async () => {
        const row = [...records.values()].find((row) => match(row, filter));
        if (!row) return null;
        Object.assign(row, structuredClone(update.$set)); return copy(row);
      } }),
      findOne: (filter) => ({ lean: async () => copy([...records.values()].find((row) => match(row, filter))) }),
      find: (filter) => ({ select: () => ({ sort: () => ({ lean: async () => [...records.values()].filter((row) => match(row, filter)).map(copy) }) }) }),
    },
  };
}
function harness(initial, overrides = {}) {
  const db = store(initial);
  const attempts = attemptStore();
  const calls = { capture: 0, analyze: 0, uploads: [], destroyed: [] };
  const service = createStructuralService({
    Model: db.Model,
    AttemptModel: attempts.Model,
    logger: { warn() {} },
    captureGate: () => {},
    capture: async (_url, options) => {
      calls.capture++;
      assert.equal(options.singlePage, true);
      assert.equal(options.collectSpatialMetadata, true);
      assert.equal(typeof options.beforeScreenshot, "function");
      assert.equal(typeof options.capturePage, "function");
      return {
        pages: [
          {
            buffer: await png(),
            url: "https://example.com/",
            captureSanitization: cleanTrace(),
            captureCoverage: completeCoverage(),
            localMetadata: {
              viewport: { width: 1440, height: 900 },
              documentHeight: 3000,
              documentWidth: 1440,
              largeImages: [],
            },
          },
        ],
      };
    },
    upload: async (buffer, folder, options) => {
      const metadata = await sharp(buffer).metadata();
      assert.equal(metadata.format, "webp");
      assert.equal(options.format, "webp");
      calls.uploads.push({ folder, metadata });
      return {
        publicId: `${folder}/${calls.uploads.length}`,
        url: `https://res.cloudinary.com/demo/${calls.uploads.length}.webp`,
      };
    },
    analyze: async (captures) => {
      calls.analyze++;
      assert.equal(captures.length, 5);
      assert.equal(db.get().status, "analyzing");
      assert.equal(db.get().captures.length, 5);
      return fixture();
    },
    destroy: async (key) => {
      calls.destroyed.push(key);
    },
    ...overrides,
  });
  return { db, calls, service, attempts };
}

test("Tastavents v2 persisté : nouvelle analyse passe par le sélecteur actuel et checkpoint du lot adaptatif avant l'analyse mockée", async () => {
  const legacy = failedTastaventsCase();
  const coverage = currentSampledCoverage();
  const viewport = await sharp({ create: { width: 300, height: 900, channels: 3, background: "olive" } }).png().toBuffer();
  const macro = await png();
  const expected = sampledFixture();
  expected.structuralMoments.forEach((m) => { m.evidence.sourceViews = ["overview"]; });
  let capturesMade = 0, h;
  h = harness({ captures: legacy.captures, captureCoverage: legacy.metadata.captureCoverage,
    localMetadata: legacy.metadata }, {
    capture: async () => {
      capturesMade++;
      return { pages: [{ buffer: macro, captureSanitization: cleanTrace(), captureCoverage: coverage,
        localMetadata: { viewport: { width: 300, height: 900 } },
        viewBuffers: { overview: macro, observation1: viewport, observation2: viewport, observation3: viewport },
        viewPositions: Object.fromEntries(coverage.positions.map((p) => [p.role, p.position])) }] };
    },
    analyze: async (captures, metadata, options) => {
      h.calls.analyze++;
      const attempt = [...h.attempts.records.values()][0];
      assert.deepEqual(options.visionInput, attempt.captureSnapshot.visionInput);
      assert.deepEqual(options.visionInput.viewOrder, ["overview","observation1","observation2","observation3"]);
      assert.deepEqual(options.visionInput.views.slice(1).map((v) => v.geometry.visibleRangePx), [[0,900],[3924,4824],[10530,11430]]);
      assert.deepEqual(buildStructuralVisionRequest(captures, metadata, options.visionInput).manifest, options.visionInput);
      return expected;
    },
  });
  const result = await h.service.run(id);
  assert.equal(result.status, "analyzed");
  assert.equal(result.captureCoverage.version, 3);
  assert.equal(capturesMade, 1);
  assert.equal(h.calls.analyze, 1);
  assert.equal(h.calls.uploads.length, 4);
});

test("sampled v3 adaptive et fallback courant réutilisés ; aucun quota ou recapture imposée", async () => {
  for (const [mode, positions] of [["adaptive", []], ["adaptive", [0,3924,10530]],
    ["fixed_fallback", [0,2131,5328,8525,10656]]]) {
    const coverage = currentSampledCoverage(11556, positions, mode);
    const expected = sampledFixture();
    expected.structuralMoments.forEach((m) => { m.evidence.sourceViews = ["overview"]; });
    const h = harness({ captures: currentSampledViews(coverage), captureCoverage: coverage }, {
      analyze: async () => expected,
    });
    const result = await h.service.run(id);
    assert.equal(result.status, "analyzed");
    assert.equal(h.calls.capture, 0);
    assert.equal(h.calls.uploads.length, 0);
    const attempt = [...h.attempts.records.values()][0];
    assert.equal(attempt.captureSnapshot.visionInput.views.length, positions.length + 1);
  }
});

test("capture sampled v2 renvoyée par un ancien worker : analyse et uploads refusés", async () => {
  const legacy = failedTastaventsCase();
  const h = harness({ captures: legacy.captures, captureCoverage: legacy.metadata.captureCoverage }, {
    capture: async () => ({ pages: [{ buffer: await png(), captureSanitization: cleanTrace(),
      captureCoverage: legacy.metadata.captureCoverage }] }),
  });
  const result = await h.service.run(id);
  assert.match(result.lastError, /Sélection sampled obsolète/);
  assert.equal(h.calls.analyze, 0);
  assert.equal(h.calls.uploads.length, 0);
  assert.equal(h.attempts.records.size, 0);
});

test("retraitement c0ffeea4 legacy : même rejet géométrique, brut intact, aucune recapture/analyse/upload", async () => {
  const legacy = failedTastaventsCase();
  const previous = fixture("Analyse active antérieure");
  const h = harness({ captures: legacy.captures, captureCoverage: legacy.metadata.captureCoverage,
    localMetadata: legacy.metadata, analysis: previous });
  const attempt = await h.attempts.Model.create({ referenceId: id,
    generationId: "c0ffeea4-18bf-4b10-9310-f75818c4d978", status: "validation_failed",
    rawResponse: legacy.rawResponse, captureSnapshot: { captures: legacy.captures, metadata: legacy.metadata } });
  const result = await h.service.reprocess(id, attempt._id);
  const updated = h.attempts.records.get(attempt._id);
  assert.equal(updated.status, "validation_failed");
  assert.equal(updated.validationError.fieldPath, "evidence.5.sourceViews.middle");
  assert.deepEqual(updated.validationError.visibleRangePx, [5328,6228]);
  assert.deepEqual(updated.validationError.momentRangePx, [7280.28,8551.44]);
  assert.deepEqual(updated.rawResponse, legacy.rawResponse);
  assert.deepEqual(updated.captureSnapshot, attempt.captureSnapshot);
  assert.deepEqual(result.analysis, previous);
  assert.equal(h.calls.capture, 0);
  assert.equal(h.calls.analyze, 0);
  assert.equal(h.calls.uploads.length, 0);
});

test("réponse Vision rejetée : checkpoint avant validation, erreur conservée et analyse active intacte", async () => {
  const previous = fixture("Analyse active antérieure");
  const rejected = fixture();
  rejected.structuralMoments[0].evidence.sourceViews = ["bottom"];
  const raw = { id: "resp_mock", model: "mock-only", output: [{ content: [{ type: "output_text", text: JSON.stringify(rejected) }] }] };
  const oldFetch = global.fetch;
  const oldKey = process.env.OPENAI_API_KEY;
  process.env.OPENAI_API_KEY = "mock-only";
  let paidCalls = 0;
  let h;
  global.fetch = async () => {
    paidCalls++;
    return { ok: true, json: async () => raw };
  };
  h = harness({ captures: gucciViews(), captureCoverage: gucciMetadata().captureCoverage,
    localMetadata: gucciMetadata(), analysis: previous }, { analyze: analyzeStructuralReference });
  try {
    const reference = await h.service.run(id);
    assert.deepEqual(reference.analysis, previous);
    assert.equal(reference.status, "error");
    assert.equal(paidCalls, 1);
    const attempt = [...h.attempts.records.values()][0];
    assert.equal(attempt.status, "validation_failed");
    assert.deepEqual(attempt.rawResponse, raw);
    assert.equal(attempt.validationError.fieldPath, "evidence.0.sourceViews.bottom");
    assert.deepEqual(attempt.validationError.visibleRangePx, [4312, 5212]);
    assert.deepEqual((await h.service.getAttempt(id, attempt._id)).rawResponse, raw);
    const retried = await h.service.reprocess(id, attempt._id);
    assert.deepEqual(retried.analysis, previous);
    assert.equal(paidCalls, 1); // Revalidation fails again, no new paid call.
    assert.equal(h.calls.capture, 0);
    assert.equal(h.calls.uploads.length, 0);
    assert.equal(h.attempts.records.size, 1);
  } finally {
    global.fetch = oldFetch;
    if (oldKey === undefined) delete process.env.OPENAI_API_KEY;
    else process.env.OPENAI_API_KEY = oldKey;
  }
});

test("réponse JSON malformée : brut checkpointé avant parsing, sans remplacer l'analyse", async () => {
  const raw = { output: [{ content: [{ type: "output_text", text: "{ invalid" }] }] };
  const previous = fixture();
  const oldFetch = global.fetch, oldKey = process.env.OPENAI_API_KEY;
  process.env.OPENAI_API_KEY = "mock-only";
  global.fetch = async () => ({ ok: true, json: async () => raw });
  try {
    const h = harness({ captures: gucciViews(), captureCoverage: gucciMetadata().captureCoverage,
      localMetadata: gucciMetadata(), analysis: previous }, { analyze: analyzeStructuralReference });
    await h.service.run(id);
    const attempt = [...h.attempts.records.values()][0];
    assert.deepEqual(attempt.rawResponse, raw);
    assert.equal(attempt.status, "validation_failed");
    assert.equal(attempt.validationError.code, "STRUCTURED_OUTPUT_PARSE_FAILED");
    assert.deepEqual(h.db.get().analysis, previous);
  } finally {
    global.fetch = oldFetch;
    if (oldKey === undefined) delete process.env.OPENAI_API_KEY;
    else process.env.OPENAI_API_KEY = oldKey;
  }
});

test("retraitement explicite d'une réponse conservée : succès sans OpenAI, capture ni upload", async () => {
  const h = harness({ captures: gucciViews(), captureCoverage: gucciMetadata().captureCoverage,
    localMetadata: gucciMetadata(), analysis: fixture("Ancienne analyse") });
  const result = fixture("Réponse conservée désormais conforme");
  const attempt = await h.attempts.Model.create({ referenceId: id, generationId: "mock-attempt",
    status: "validation_failed", rawResponse: { output: [{ content: [{ type: "output_text", text: JSON.stringify(result) }] }] },
    captureSnapshot: { captures: gucciViews(), metadata: gucciMetadata() } });
  const reference = await h.service.reprocess(id, attempt._id);
  assert.deepEqual(reference.analysis, result);
  assert.equal(h.attempts.records.get(attempt._id).status, "applied");
  assert.equal(h.calls.analyze, 0);
  assert.equal(h.calls.capture, 0);
  assert.equal(h.calls.uploads.length, 0);
  const wrongReference = await h.service.reprocess(id, "000000000000000000999999");
  assert.deepEqual(wrongReference.analysis, result);
  assert.equal(h.calls.analyze, 0);
});

test("retraitement : captures remplacées refusées sans paiement ni écrasement", async () => {
  const previous = fixture();
  const h = harness({ captures: gucciViews(), captureCoverage: gucciMetadata().captureCoverage,
    localMetadata: gucciMetadata(), analysis: previous });
  const changed = gucciViews(); changed[1].url += "?different";
  const attempt = await h.attempts.Model.create({ referenceId: id, generationId: "mock-attempt",
    status: "received", parsedResult: fixture(), captureSnapshot: { captures: changed, metadata: gucciMetadata() } });
  const reference = await h.service.reprocess(id, attempt._id);
  assert.match(reference.lastError, /captures ont changé/);
  assert.equal(h.attempts.records.get(attempt._id).status, "received");
  assert.deepEqual(reference.analysis, previous);
  assert.equal(h.calls.analyze, 0);
  assert.equal(h.calls.capture, 0);
});

test("checkpoint indisponible avant l'appel : aucun OpenAI", async () => {
  const h = harness({ captures: views() }, { AttemptModel: { create: async () => { throw new Error("mock storage failure"); } } });
  await h.service.run(id);
  assert.equal(h.calls.analyze, 0);
  assert.equal(h.db.get().status, "error");
});

test("routes checkpoint : inspection et retraitement explicites, IDs invalides refusés", async () => {
  let reprocessed = 0;
  const attemptId = "507f1f77bcf86cd799439012";
  const router = createRouter({
    auth: (_req, _res, next) => next(), role: (_req, _res, next) => next(),
    service: {
      listAttempts: async () => [{ _id: attemptId, status: "validation_failed" }],
      getAttempt: async () => ({ _id: attemptId, rawResponse: { output: [] } }),
      reprocess: async () => { reprocessed++; return { _id: id, status: "analyzed" }; },
    },
  });
  const res = () => ({ statusCode: 200, status(code) { this.statusCode = code; return this; }, json(value) { this.body = value; } });
  const list = res();
  await handler(router, "get", "/:id/analysis-attempts")({ params: { id } }, list);
  assert.equal(list.body.attempts[0].status, "validation_failed");
  const detail = res();
  await handler(router, "get", "/:id/analysis-attempts/:attemptId")({ params: { id, attemptId } }, detail);
  assert.deepEqual(detail.body.attempt.rawResponse, { output: [] });
  const applied = res();
  await handler(router, "post", "/:id/analysis-attempts/:attemptId/reprocess")({ params: { id, attemptId } }, applied);
  assert.equal(applied.body.reference.status, "analyzed");
  const invalid = res();
  await handler(router, "post", "/:id/analysis-attempts/:attemptId/reprocess")({ params: { id, attemptId: "invalid" } }, invalid);
  assert.equal(invalid.statusCode, 400);
  assert.equal(reprocessed, 1);
});
function handler(router, method, suffix = "") {
  return router.stack
    .find(
      (layer) =>
        layer.route?.path ===
          `/admin/design-lab/structural-references${suffix}` &&
        layer.route.methods[method],
    )
    .route.stack.at(-1).handle;
}
function response() {
  return {
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

test("StructuralReference : collection séparée, tags manuels, sources futures préparées", async () => {
  for (const sourceType of ["manual_url", "pinterest", "discovery"]) {
    const doc = new StructuralReference({
      title: "Architecture",
      slug: sourceType,
      sourceType,
      sourceUrl: "https://example.com/",
      domain: "example.com",
      analysis: fixture(),
    });
    await doc.validate();
    assert.equal(doc.analysis.structuralMoments.length, 3);
    assert.deepEqual(doc.manualTags, []);
    assert.equal(doc.toJSON().operationToken, undefined);
  }
  for (const key of [
    "visualTags",
    "businessTags",
    "brandSystem",
    "visualSystem",
    "directions",
    "tags",
  ])
    assert.equal(StructuralReference.schema.path(key), undefined);
});
test("contrat Vision : toutes les propriétés requises, modes contrôlés et rythme aligné", () => {
  assert.deepEqual(validateStructuralAnalysis(fixture()), fixture());
  for (const mutate of [
    (a) => delete a.layoutProfile.gridStrategy,
    (a) => (a.structuralMoments[0].layoutMode = "madeUp"),
    (a) => (a.structuralMoments[1].order = 1),
    (a) => a.rhythmSequence.pop(),
    (a) => (a.businessTags = ["restaurant"]),
    (a) => (a.overview = " "),
    (a) => delete a.structuralMoments[0].evidence,
    (a) => (a.structuralMoments[0].evidence.sourceViews = ["invented"]),
    (a) => (a.structuralMoments[0].evidence.endPercent = 20),
    (a) => (a.rhythmSequence[0].startPercent = -1),
    (a) => delete a.rhythmSequence[0].textImageOrganization,
  ]) {
    const analysis = fixture();
    mutate(analysis);
    assert.throws(() => validateStructuralAnalysis(analysis), /invalide/);
  }
});
test("couverture dynamique : 5212px internes priment sur un document de 900px", () => {
  const context = structuralCoverageContext(gucciMetadata(), gucciViews());
  assert.equal(context.totalHeight, 5212);
  assert.equal(context.viewportCount, 5212 / 900);
  assert.equal(context.minimumWithoutJustification, 3);
  assert.deepEqual(context.requiredDetailViews, ["top", "middle", "bottom"]);
  assert.equal(
    structuralCoverageContext({ viewport: { height: 900 } }, gucciViews())
      .totalHeight,
    5212,
  );
  assert.equal(
    structuralCoverageContext({
      documentHeight: 900,
      viewport: { height: 900 },
    }).minimumWithoutJustification,
    1,
  );
});
test("page longue : phases multi-régions validées, analyse hero-only rejetée", () => {
  assert.deepEqual(
    validateStructuralAnalysis(fixture(), gucciMetadata(), gucciViews()),
    fixture(),
  );
  for (const mutate of [
    (a) =>
      a.structuralMoments.forEach(
        (m) => (m.evidence.sourceViews = ["visionOverview", "top"]),
      ),
    (a) => {
      a.rhythmSequence[2].endPercent = 80;
      a.structuralMoments[2].evidence.endPercent = 80;
    },
  ]) {
    const result = fixture();
    mutate(result);
    assert.throws(
      () => validateStructuralAnalysis(result, gucciMetadata(), gucciViews()),
      /invalide|incomplète/,
    );
  }
  const falseEvidence = fixture();
  falseEvidence.structuralMoments[0].evidence.sourceViews = ["bottom"];
  assert.throws(
    () =>
      validateStructuralAnalysis(falseEvidence, gucciMetadata(), gucciViews()),
    /evidence/,
  );
});
test("page longue : deux phases seulement avec justification explicite et toutes les régions", () => {
  const result = twoPhases();
  assert.throws(
    () => validateStructuralAnalysis(result, gucciMetadata(), gucciViews()),
    (error) => error.code === "incomplete_structural_analysis",
  );
  result.sparseMomentsJustification =
    "Le détail médian et le bas montrent la même grille répétée à espacements constants après la phase d'ouverture ; aucune rupture additionnelle visible.";
  assert.equal(
    validateStructuralAnalysis(result, gucciMetadata(), gucciViews()),
    result,
  );
  result.structuralMoments[1].evidence.sourceViews = ["middle"];
  assert.throws(
    () => validateStructuralAnalysis(result, gucciMetadata(), gucciViews()),
    /incomplète/,
  );
});
test("page courte : une phase possible, aucun quota de diversité artistique", () => {
  const result = fixture();
  result.rhythmSequence = result.rhythmSequence.slice(0, 1);
  result.structuralMoments = result.structuralMoments.slice(0, 1);
  result.rhythmSequence[0].endPercent = 100;
  result.structuralMoments[0].evidence.endPercent = 100;
  assert.equal(
    validateStructuralAnalysis(result, {
      documentHeight: 900,
      viewport: { height: 900 },
    }),
    result,
  );
});
test("analyse pauvre : un seul appel, pas de recapture, ancienne analyse conservée", async () => {
  const previous = fixture("Analyse précédente à conserver");
  let attempts = 0;
  const { service, calls } = harness(
    {
      captures: gucciViews(),
      captureCoverage: gucciMetadata().captureCoverage,
      localMetadata: gucciMetadata(),
      analysis: previous,
    },
    {
      analyze: async () => {
        attempts++;
        return twoPhases();
      },
    },
  );
  const reference = await service.run(id);
  assert.equal(attempts, 1);
  assert.equal(calls.capture, 0);
  assert.equal(calls.uploads.length, 0);
  assert.equal(reference.status, "error");
  assert.match(reference.lastError, /incomplète/);
  assert.deepEqual(reference.analysis, previous);
  assert.deepEqual(reference.captures, gucciViews());
});
test("ajout URL : normalisation, domaine public, tags dédupliqués", async () => {
  let hostname;
  const fields = await sourceFields(
    {
      sourceUrl: "https://example.com/work#details",
      manualTags: [" airy ", "airy", "architecture"],
    },
    async (value) => {
      hostname = value;
    },
  );
  assert.equal(hostname, "example.com");
  assert.equal(fields.sourceUrl, "https://example.com/work");
  assert.equal(fields.sourceType, "manual_url");
  assert.equal(fields.title, "example.com");
  assert.deepEqual(fields.manualTags, ["airy", "architecture"]);
});
test("URL invalide, credentials, ports et sources non activées refusés sans DNS", async () => {
  for (const sourceUrl of [
    "file:///etc/passwd",
    "ftp://example.com",
    "https://user:pass@example.com",
    "http://example.com:8000",
    "http://",
  ])
    await assert.rejects(
      sourceFields({ sourceUrl }, async () => assert.fail("DNS inattendu")),
    );
  for (const sourceType of ["pinterest", "discovery"])
    await assert.rejects(
      sourceFields({ sourceUrl: "https://example.com", sourceType }),
      /URLs manuelles/,
    );
});
test("ingestion réutilise SSRF : localhost, metadata, privé, loopback et DNS mixte bloqués", async () => {
  for (const address of [
    "127.0.0.1",
    "10.0.0.1",
    "192.168.1.2",
    "169.254.169.254",
    "::1",
    "fc00::1",
  ])
    await assert.rejects(
      sourceFields({ sourceUrl: "https://example.com/" }, (host) =>
        publicAddress(host, async () => [{ address }]),
      ),
    );
  await assert.rejects(sourceFields({ sourceUrl: "http://localhost/" }));
  await assert.rejects(
    sourceFields({ sourceUrl: "https://example.com/" }, (host) =>
      publicAddress(host, async () => [
        ...(await publicLookup()),
        { address: "10.0.0.1" },
      ]),
    ),
  );
});
test("capture partagée : redirect privé bloqué sans request privée", async () => {
  let requests = 0;
  await assert.rejects(
    fetchPublicResource("https://example.com/", {
      lookup: publicLookup,
      request: async () => {
        requests++;
        return {
          status: 302,
          headers: { location: "http://127.0.0.1/metadata" },
          body: Buffer.alloc(0),
        };
      },
    }),
  );
  assert.equal(requests, 1);
});
test("cinq fichiers WebP : master, dérivée Vision et crops aux bons offsets", async () => {
  const result = await prepareStructuralViews(await png());
  assert.deepEqual(
    result.map((view) => view.type),
    VIEW_TYPES,
  );
  assert.equal(result[0].height, 3000);
  assert.equal(result[1].height, 3000); // no enlargement of small fixture
  assert.deepEqual(
    result.slice(2).map((view) => view.sourceRect.top),
    [0, 1000, 2000],
  );
  for (const view of result) {
    const meta = await sharp(view.buffer).metadata();
    assert.equal(meta.format, "webp");
    assert.equal(meta.hasAlpha, true);
    assert.ok(view.width <= 2000);
  }
});
test("grande capture : réduction proportionnelle seulement, contexte global intégral", async () => {
  const buffer = await sharp({
    create: { width: 2400, height: 6000, channels: 3, background: "#aaaaaa" },
  })
    .png()
    .toBuffer();
  const result = await prepareStructuralViews(buffer);
  assert.deepEqual([result[0].width, result[0].height], [2000, 5000]);
  assert.deepEqual([result[1].width, result[1].height], [720, 1800]);
  assert.equal(result[4].sourceRect.top, 4200);
});
test("visionOverview continuous : resize de la master PNG, jamais une autre observation", async () => {
  const master = await sharp(
    Buffer.from(
      '<svg xmlns="http://www.w3.org/2000/svg" width="1440" height="3600"><rect width="1440" height="1800" fill="olive"/><rect y="1800" width="1440" height="1800" fill="navy"/></svg>',
    ),
  )
    .png()
    .toBuffer();
  const unrelated = await png();
  const result = await prepareStructuralViews(
    master,
    { width: 1440, height: 900 },
    {
      overview: unrelated,
      visionOverview: unrelated,
      top: unrelated,
      middle: unrelated,
      bottom: unrelated,
    },
  );
  const derivative = result.find((view) => view.type === "visionOverview");
  assert.deepEqual([derivative.width, derivative.height], [720, 1800]);
  assert.deepEqual(derivative.sourceRect, result[0].sourceRect);
  assert.deepEqual(
    derivative.buffer,
    await sharp(master)
      .resize({ width: 720, withoutEnlargement: true })
      .webp({ quality: 80 })
      .toBuffer(),
  );
  assert.equal(
    result.some((view) => view.type === "overview"),
    false,
  );
});
test("ancienne overview continuous : captures réutilisées, nouveau nom de preuve accepté sans migration", async () => {
  const legacy = views().map((view) => ({
    ...view,
    type: view.type === "visionOverview" ? "overview" : view.type,
  }));
  const { service, calls } = harness({ captures: legacy });
  const reference = await service.run(id);
  assert.equal(reference.status, "analyzed");
  assert.equal(calls.capture, 0);
  assert.equal(calls.uploads.length, 0);
  assert.equal(calls.analyze, 1);
  assert.deepEqual(reference.captures, legacy);
  assert.deepEqual(reference.analysis, fixture());
  const duplicate = fixture();
  duplicate.structuralMoments[0].evidence.sourceViews = [
    "visionOverview",
    "overview",
    "top",
  ];
  assert.throws(
    () => validateStructuralAnalysis(duplicate, {}, legacy),
    /duplicate_global_source/,
  );
  const oldAnalysis = fixture();
  oldAnalysis.structuralMoments[0].evidence.sourceViews = [
    "desktop_full",
    "top",
  ];
  const oldDocument = new StructuralReference({
    title: "Legacy",
    slug: "legacy",
    sourceUrl: "https://example.com/",
    domain: "example.com",
    captures: legacy,
    analysis: oldAnalysis,
  });
  assert.equal(oldDocument.validateSync(), undefined);
});
test("ancienne overview en collage : recapture manuelle avant une seule analyse", async () => {
  const legacy = views().map((view) => ({
    ...view,
    type: view.type === "visionOverview" ? "overview" : view.type,
  }));
  const { service, calls } = harness({
    captures: legacy,
    captureCoverage: {
      ...completeCoverage(),
      overviewKind: "distributed_viewports",
    },
  });
  const reference = await service.run(id);
  assert.equal(calls.capture, 1);
  assert.equal(calls.analyze, 1);
  assert.ok(reference.captures.some((view) => view.type === "visionOverview"));
});
test("mode sampled : six WebP, storyboard et positions réelles sans full-page stitchée", async () => {
  const viewport = await sharp({
    create: { width: 300, height: 900, channels: 3, background: "olive" },
  })
    .png()
    .toBuffer();
  const storyboard = await sharp({
    create: { width: 300, height: 4840, channels: 3, background: "white" },
  })
    .png()
    .toBuffer();
  const coverage = sampledCoverage();
  const result = await prepareStructuralViews(
    storyboard,
    { width: 300, height: 900 },
    Object.fromEntries(
      SAMPLED_VIEW_TYPES.map((type) => [
        type,
        type === "overview" ? storyboard : viewport,
      ]),
    ),
    Object.fromEntries(
      coverage.positions.map((item) => [item.role, item.position]),
    ),
    coverage,
  );
  assert.deepEqual(
    result.map((view) => view.type),
    SAMPLED_VIEW_TYPES,
  );
  assert.equal(
    result.some((view) => view.type === "desktop_full"),
    false,
  );
  assert.deepEqual(
    result.slice(1).map((view) => [view.sourceRect.top, view.progressPercent]),
    [
      [0, 0],
      [1046, 20],
      [2614, 50],
      [4182, 80],
      [5228, 100],
    ],
  );
  for (const view of result)
    assert.equal((await sharp(view.buffer).metadata()).format, "webp");
});
test("Mongo schema sampled : stratégie, progression et six rôles admis", () => {
  const document = new StructuralReference({
    title: "Sampled",
    slug: "sampled-test",
    sourceUrl: "https://example.com/",
    domain: "example.com",
    captures: sampledViews(),
    captureCoverage: sampledCoverage(),
  });
  assert.equal(document.validateSync(), undefined);
  assert.equal(document.captureCoverage.captureStrategy, "sampled");
  assert.equal(document.captures.length, 6);
  assert.equal(document.captures[2].progressPercent, 20);
});
test("mode sampled fallback actuel : six uploads, une analyse et aucune full-page défectueuse", async () => {
  const db = store();
  const coverage = currentSampledCoverage(6128, [0,1046,2614,4182,5228], "fixed_fallback");
  const types = ["overview", ...coverage.positions.map((p) => p.role)];
  const viewport = await sharp({
    create: { width: 300, height: 900, channels: 3, background: "olive" },
  })
    .png()
    .toBuffer();
  const storyboard = await sharp({
    create: { width: 300, height: 4840, channels: 3, background: "white" },
  })
    .png()
    .toBuffer();
  let uploads = 0;
  let analyses = 0;
  const service = createStructuralService({
    Model: db.Model,
    AttemptModel: attemptStore().Model,
    logger: { warn() {} },
    captureGate: () => {},
    capture: async () => ({
      pages: [
        {
          buffer: storyboard,
          url: "https://example.com/",
          captureSanitization: cleanTrace(),
          captureCoverage: coverage,
          localMetadata: {
            viewport: { width: 300, height: 900 },
            documentHeight: 6128,
          },
          viewBuffers: Object.fromEntries(
            types.map((type) => [
              type,
              type === "overview" ? storyboard : viewport,
            ]),
          ),
          viewPositions: Object.fromEntries(
            coverage.positions.map((item) => [item.role, item.position]),
          ),
        },
      ],
    }),
    upload: async () => ({
      publicId: `mock/${++uploads}`,
      url: `https://example.com/${uploads}.webp`,
    }),
    analyze: async (captures) => {
      analyses++;
      assert.deepEqual(
        captures.map((view) => view.type),
        types,
      );
      const result = sampledFixture();
      result.structuralMoments.forEach((m) => { m.evidence.sourceViews = ["overview"]; });
      return result;
    },
    destroy: async () => {},
  });
  const result = await service.run(id);
  assert.equal(result.status, "analyzed");
  assert.equal(result.captureCoverage.captureStrategy, "sampled");
  assert.equal(uploads, 6);
  assert.equal(analyses, 1);
});
test("capture mono-page : warm-up, images/fonts avant screenshot, sécurité et metadata opt-in", async () => {
  const previous = process.env.GUSTO_PORTFOLIO_CAPTURE_ENABLED;
  process.env.GUSTO_PORTFOLIO_CAPTURE_ENABLED = "true";
  const events = [];
  let closed = false;
  let routeHandler;
  const page = {
    on() {},
    setDefaultTimeout() {},
    url: () => "https://example.com/",
    waitForTimeout: async () => {},
    goto: async () => {
      events.push("navigate");
      return { ok: () => true };
    },
    evaluate: async (fn) => {
      const source = fn.toString();
      if (source.includes("highestObservedHeight")) {
        assert.match(source, /document.fonts/);
        assert.match(source, /scrollTo/);
        events.push("warmup");
      } else if (source.includes("const images = [...document.images]")) {
        events.push("images");
        return { failed: 0, pending: 0 };
      } else if (source.includes("largeImages:")) {
        events.push("metadata");
        return {
          viewport: { width: 1440, height: 900 },
          documentHeight: 3000,
          largeImages: [],
        };
      } else {
        assert.fail("Pas de crawl ni d’extraction de liens en mode mono-page");
      }
    },
    screenshot: async (options) => {
      assert.equal(options.animations, "disabled");
      assert.equal(options.fullPage, true);
      events.push("screenshot");
      return png();
    },
  };
  try {
    const result = await capturePortfolioSite("https://example.com/", {
      lookup: publicLookup,
      singlePage: true,
      collectSpatialMetadata: true,
      launch: async () => ({
        close: async () => {
          closed = true;
        },
        newContext: async (options) => {
          assert.equal(options.userAgent, CAPTURE_USER_AGENT);
          assert.equal(options.serviceWorkers, "block");
          return {
            route: async (_path, fn) => {
              routeHandler = fn;
            },
            routeWebSocket: async () => {},
            addInitScript: async () => {},
            newPage: async () => page,
          };
        },
      }),
    });
    assert.deepEqual(events, [
      "navigate",
      "warmup",
      "images",
      "screenshot",
      "metadata",
    ]);
    assert.equal(result.discovered, 1);
    assert.equal(result.pages[0].localMetadata.documentHeight, 3000);
    assert.equal(closed, true);
    let aborted = false;
    await routeHandler({
      request: () => ({ method: () => "POST" }),
      abort: () => {
        aborted = true;
      },
    });
    assert.equal(aborted, true);
    events.length = 0;
    const custom = await capturePortfolioSite("https://example.com/", {
      lookup: publicLookup,
      singlePage: true,
      collectSpatialMetadata: true,
      launch: async () => ({
        close: async () => {},
        newContext: async () => ({
          route: async () => {},
          routeWebSocket: async () => {},
          addInitScript: async () => {},
          newPage: async () => page,
        }),
      }),
      beforeScreenshot: async () => {
        events.push("sanitization");
        return { captureSanitization: cleanTrace() };
      },
      capturePage: async (_page, _deadline, details) => {
        assert.equal(details.captureSanitization.qualityPassed, true);
        events.push("viewport_capture");
        return {
          buffer: await png(),
          localMetadata: { documentHeight: 900 },
          captureCoverage: completeCoverage(),
        };
      },
    });
    assert.deepEqual(events, [
      "navigate",
      "warmup",
      "sanitization",
      "viewport_capture",
    ]);
    assert.equal(custom.pages[0].captureCoverage.complete, true);
    assert.equal(custom.pages[0].localMetadata.documentHeight, 900);
  } finally {
    if (previous === undefined)
      delete process.env.GUSTO_PORTFOLIO_CAPTURE_ENABLED;
    else process.env.GUSTO_PORTFOLIO_CAPTURE_ENABLED = previous;
  }
});
test("ingestion complète : captures Cloudinary conservées avant un seul appel Vision mocké", async () => {
  const { service, db, calls } = harness();
  const reference = await service.run(id);
  assert.equal(calls.capture, 1);
  assert.equal(calls.analyze, 1);
  assert.equal(calls.uploads.length, 5);
  assert.ok(
    calls.uploads.every(
      (call) =>
        call.folder ===
        `Gusto_Workspace/design-lab/structural-references/${id}`,
    ),
  );
  assert.equal(reference.status, "analyzed");
  assert.deepEqual(reference.manualTags, ["editorial"]);
  assert.deepEqual(reference.analysis, fixture());
  assert.ok(reference.analyzedAt);
  assert.equal(reference.operationToken, undefined);
  assert.equal(db.get().buffer, undefined);
});
test("réanalyse : remplace l’analyse, préserve tags/captures, ne recapture pas", async () => {
  const { service, calls } = harness({
    captures: views(),
    analysis: fixture("Ancien résumé"),
    status: "analyzed",
  });
  const reference = await service.run(id);
  assert.equal(calls.capture, 0);
  assert.equal(calls.uploads.length, 0);
  assert.equal(calls.analyze, 1);
  assert.deepEqual(reference.analysis, fixture());
  assert.deepEqual(reference.manualTags, ["editorial"]);
});
test("quality gate bloqué : zéro Vision/upload, analyse précédente et captures conservées", async () => {
  const previous = fixture("Ancienne analyse Gucci");
  const blockedTrace = {
    ...cleanTrace(),
    consentDetected: true,
    consentAction: "removed",
    blockingOverlayDetected: true,
    qualityPassed: false,
    blockingOverlays: [
      {
        tag: "div",
        id: "newsletter",
        className: "modal",
        position: "fixed",
        zIndex: 999,
        areaRatio: 0.8,
        reason: "large_dialog",
        frame: "main",
      },
    ],
  };
  const { service, calls } = harness(
    { captures: views(), analysis: previous, captureSanitization: null },
    {
      capture: async () => {
        throw Object.assign(
          new Error("Overlay bloquant détecté — analyse non lancée."),
          {
            status: 422,
            code: "blocked_by_overlay",
            captureSanitization: blockedTrace,
          },
        );
      },
    },
  );
  const reference = await service.run(id);
  assert.equal(reference.status, "blocked_by_overlay");
  assert.deepEqual(reference.analysis, previous);
  assert.deepEqual(reference.manualTags, ["editorial"]);
  assert.deepEqual(reference.captures, views());
  assert.deepEqual(reference.captureSanitization, blockedTrace);
  assert.equal(calls.analyze, 0);
  assert.equal(calls.uploads.length, 0);
  assert.equal(calls.destroyed.length, 0);
});
test("réanalyse : captures anciennes, invalides ou blocked imposent recapture avant un seul Vision", async () => {
  for (const initial of [
    { captureSanitization: null },
    { captureSanitization: { ...cleanTrace(), qualityPassed: false } },
    { captureSanitization: { ...cleanTrace(), blockingOverlayDetected: true } },
    { status: "blocked_by_overlay" },
    { status: "blocked_by_popup" },
    { status: "incomplete_page_capture" },
    { captureCoverage: null },
    { captureCoverage: { ...completeCoverage(), complete: false } },
    { captureCoverage: { ...completeCoverage(), distinctViews: false } },
    { captureCoverage: { ...completeCoverage(), version: 1 } },
    { captureSanitization: { ...cleanTrace(), version: 0 } },
  ]) {
    const { service, calls } = harness({
      captures: views(),
      analysis: fixture("Ancien résumé"),
      ...initial,
    });
    const reference = await service.run(id);
    assert.equal(calls.capture, 1);
    assert.equal(calls.analyze, 1);
    assert.equal(reference.status, "analyzed");
    assert.equal(reference.captureSanitization.qualityPassed, true);
    assert.deepEqual(reference.analysis, fixture());
    assert.deepEqual(
      calls.destroyed,
      views().map((view) => view.publicId),
    );
  }
});
test("popup ou couverture incomplète : zéro Vision/upload et analyse précédente intacte", async () => {
  for (const code of ["blocked_by_popup", "incomplete_page_capture"]) {
    const previous = fixture("Analyse précédente conservée");
    const coverage = {
      ...completeCoverage(),
      complete: false,
      reachedEnd: false,
    };
    const { service, calls } = harness(
      { captures: views(), analysis: previous, captureCoverage: null },
      {
        capture: async () => {
          throw Object.assign(new Error(code), {
            status: 422,
            code,
            captureCoverage: coverage,
          });
        },
      },
    );
    const reference = await service.run(id);
    assert.equal(reference.status, code);
    assert.deepEqual(reference.analysis, previous);
    assert.deepEqual(reference.captures, views());
    assert.equal(reference.captureCoverage.complete, false);
    assert.equal(calls.analyze, 0);
    assert.equal(calls.uploads.length, 0);
    assert.equal(calls.destroyed.length, 0);
  }
});
test("capture propre sans preuve de couverture : zéro Vision malgré un PNG disponible", async () => {
  const { service, calls } = harness(
    { captures: views(), captureCoverage: null, analysis: fixture() },
    {
      capture: async () => ({
        pages: [{ buffer: await png(), captureSanitization: cleanTrace() }],
      }),
    },
  );
  const reference = await service.run(id);
  assert.equal(reference.status, "incomplete_page_capture");
  assert.deepEqual(reference.analysis, fixture());
  assert.deepEqual(reference.captures, views());
  assert.equal(calls.analyze, 0);
  assert.equal(calls.uploads.length, 0);
});
test("budget d'image structurelle dépassé : erreur explicite, zéro Vision/upload, ancienne analyse conservée", async () => {
  const {
    resourceBudgetError,
  } = require("../services/design-lab/structural-resource-policy");
  const previous = fixture("Analyse précédente conservée");
  const { service, calls } = harness(
    { captures: views(), analysis: previous, captureCoverage: null },
    {
      capture: async () => {
        throw resourceBudgetError(
          "https://example.com/hero.jpg",
          40 * 1024 * 1024,
          32 * 1024 * 1024,
          "resource",
        );
      },
    },
  );
  const reference = await service.run(id);
  assert.equal(reference.status, "error");
  assert.match(
    reference.lastError,
    /structural_media_budget_exceeded.*hero\.jpg.*41943040.*33554432/,
  );
  assert.deepEqual(reference.analysis, previous);
  assert.deepEqual(reference.captures, views());
  assert.equal(calls.analyze, 0);
  assert.equal(calls.uploads.length, 0);
});
test("vues réelles : encodage des viewports distincts et géométrie source préservée", async () => {
  const canvas = await png();
  const viewport = await sharp({
    create: { width: 300, height: 900, channels: 3, background: "red" },
  })
    .png()
    .toBuffer();
  const result = await prepareStructuralViews(
    canvas,
    { width: 300, height: 900 },
    { overview: canvas, top: viewport, middle: viewport, bottom: viewport },
    { middle: 1050, bottom: 2100 },
  );
  assert.equal(
    result.find((view) => view.type === "middle").sourceRect.top,
    1050,
  );
  assert.equal(
    result.find((view) => view.type === "bottom").sourceRect.top,
    2100,
  );
  assert.equal(result.find((view) => view.type === "top").height, 900);
  assert.equal(
    result.find((view) => view.type === "visionOverview").sourceRect.height,
    3000,
  );
  const pixel = await sharp(
    result.find((view) => view.type === "middle").buffer,
  )
    .raw()
    .toBuffer();
  assert.ok(pixel[0] > 200 && pixel[1] < 10);
});
test("capture sans preuve de quality gate : zéro Vision et aucune vue définitive uploadée", async () => {
  for (const trace of [
    undefined,
    { ...cleanTrace(), qualityPassed: false },
    { ...cleanTrace(), blockingOverlayDetected: true },
  ]) {
    const { service, calls } = harness(
      { captureSanitization: null },
      {
        capture: async () => ({
          pages: [{ buffer: await png(), captureSanitization: trace }],
        }),
      },
    );
    const reference = await service.run(id);
    assert.equal(reference.status, "error");
    assert.equal(calls.analyze, 0);
    assert.equal(calls.uploads.length, 0);
  }
});
test("capture : quality gate après warm-up et avant screenshot, aucune capture si bloqué", async () => {
  const original = process.env.GUSTO_PORTFOLIO_CAPTURE_ENABLED;
  process.env.GUSTO_PORTFOLIO_CAPTURE_ENABLED = "true";
  const events = [];
  let closed = false;
  const page = {
    on() {},
    setDefaultTimeout() {},
    url: () => "https://example.com/",
    waitForTimeout: async () => {},
    goto: async () => ({ ok: () => true }),
    evaluate: async (fn) => {
      if (fn.toString().includes("highestObservedHeight")) {
        events.push("warmup");
        return;
      }
      if (fn.toString().includes("const images = [...document.images]")) {
        events.push("images");
        return { failed: 0, pending: 0 };
      }
    },
    screenshot: async () => {
      events.push("screenshot");
      throw new Error("Ne doit jamais capturer");
    },
  };
  try {
    await assert.rejects(
      capturePortfolioSite("https://example.com/", {
        lookup: publicLookup,
        singlePage: true,
        beforeScreenshot: async () => {
          events.push("gate");
          throw Object.assign(new Error("blocked"), {
            code: "blocked_by_overlay",
          });
        },
        launch: async () => ({
          newContext: async () => ({
            route: async () => {},
            addInitScript: async () => {},
            newPage: async () => page,
          }),
          close: async () => {
            closed = true;
          },
        }),
      }),
      (error) => error.code === "blocked_by_overlay",
    );
    assert.deepEqual(events, ["warmup", "images", "gate"]);
    assert.equal(closed, true);
  } finally {
    if (original === undefined)
      delete process.env.GUSTO_PORTFOLIO_CAPTURE_ENABLED;
    else process.env.GUSTO_PORTFOLIO_CAPTURE_ENABLED = original;
  }
});
test("timeout capture : erreur claire, aucune analyse Vision ni upload", async () => {
  const { service, calls } = harness(
    {},
    {
      capture: async () => {
        throw Object.assign(new Error("Timeout 25000ms exceeded"), {
          name: "TimeoutError",
        });
      },
    },
  );
  const reference = await service.run(id);
  assert.equal(reference.status, "error");
  assert.match(reference.lastError, /Délai/);
  assert.equal(calls.analyze, 0);
  assert.equal(calls.uploads.length, 0);
});
test("erreur Vision : conserve captures et tags, retry uniquement explicite", async () => {
  const { service, db, calls } = harness(
    {},
    {
      analyze: async () => {
        throw Object.assign(new Error("Délai OpenAI dépassé."), {
          status: 504,
        });
      },
    },
  );
  const reference = await service.run(id);
  assert.equal(reference.status, "error");
  assert.equal(reference.captures.length, 5);
  assert.deepEqual(reference.manualTags, ["editorial"]);
  assert.equal(calls.destroyed.length, 0);
  const next = harness(db.get());
  await next.service.run(id);
  assert.equal(next.calls.capture, 0);
  assert.equal(next.calls.analyze, 1);
});
test("résultat Vision invalide : ne remplace pas une analyse correcte", async () => {
  const previous = fixture("Analyse correcte");
  const { service } = harness(
    { captures: views(), analysis: previous },
    { analyze: async () => ({ overview: "Incomplet" }) },
  );
  const reference = await service.run(id);
  assert.equal(reference.status, "error");
  assert.deepEqual(reference.analysis, previous);
});
test("upload Cloudinary partiel : nettoyage ciblé, pas de Vision", async () => {
  let uploads = 0;
  const { service, calls } = harness(
    {},
    {
      upload: async () => {
        if (++uploads === 3) throw new Error("Cloudinary indisponible");
        return {
          publicId: `owned/${uploads}`,
          url: "https://res.cloudinary.com/demo/test.webp",
        };
      },
    },
  );
  const reference = await service.run(id);
  assert.equal(reference.status, "error");
  assert.equal(reference.captures.length, 0);
  assert.deepEqual(calls.destroyed, ["owned/1", "owned/2"]);
  assert.equal(calls.analyze, 0);
});
test("concurrence : une analyse en cours refuse un second déclenchement", async () => {
  let release;
  let entered;
  const waiting = new Promise((resolve) => {
    release = resolve;
  });
  const started = new Promise((resolve) => {
    entered = resolve;
  });
  const { service } = harness(
    { captures: views() },
    {
      analyze: async () => {
        entered();
        await waiting;
        return fixture();
      },
    },
  );
  const first = service.run(id);
  await started;
  await assert.rejects(service.run(id), (error) => error.status === 409);
  await assert.rejects(service.remove(id), (error) => error.status === 409);
  release();
  assert.equal((await first).status, "analyzed");
});
test("opération interrompue : aucune reprise automatique, un retry manuel après expiration", async () => {
  const { service, calls } = harness({
    captures: views(),
    status: "analyzing",
    operationStartedAt: new Date(Date.now() - OPERATION_TTL_MS - 1000),
    operationToken: "stale",
  });
  assert.equal(calls.analyze, 0);
  assert.equal((await service.run(id)).status, "analyzed");
  assert.equal(calls.analyze, 1);
});
test("édition/activation : seules les propriétés manuelles sont modifiées", async () => {
  const { service } = harness({ captures: views(), analysis: fixture() });
  const reference = await service.patch(id, {
    active: false,
    manualTags: [" dense ", "dense"],
    title: "Éditorial",
    analysis: null,
    sourceType: "discovery",
    captures: [],
  });
  assert.equal(reference.active, false);
  assert.equal(reference.title, "Éditorial");
  assert.deepEqual(reference.manualTags, ["dense"]);
  assert.deepEqual(reference.analysis, fixture());
  assert.equal(reference.captures.length, 5);
  assert.equal(reference.sourceType, "manual_url");
  await assert.rejects(service.patch(id, { active: "false" }), /Activation/);
});
test("suppression : détruit uniquement les captures appartenant à la référence", async () => {
  const { service, db, calls } = harness({ captures: views() });
  await service.remove(id);
  assert.equal(db.get(), null);
  assert.deepEqual(
    calls.destroyed,
    views().map((view) => view.publicId),
  );
});
test("API admin : ajout, lecture, analyse, édition et suppression avec stockage mocké", async () => {
  const { service, db } = harness();
  const router = createRouter({
    Model: db.Model,
    service,
    captureGate: () => {},
    fields: (body) => sourceFields(body, async () => {}),
    auth: (_req, _res, next) => next(),
    role: (_req, _res, next) => next(),
  });
  const created = response();
  await handler(router, "post")(
    {
      params: {},
      body: { sourceUrl: "https://example.com/", manualTags: ["airy"] },
    },
    created,
  );
  assert.equal(created.code, 201);
  assert.equal(created.body.reference.status, "analyzed");
  const detail = response();
  await handler(router, "get", "/:id")({ params: { id } }, detail);
  assert.equal(detail.body.reference.operationToken, undefined);
  const list = response();
  await handler(router, "get")({ params: {} }, list);
  assert.equal(list.body.references.length, 1);
  const edited = response();
  await handler(
    router,
    "patch",
    "/:id",
  )({ params: { id }, body: { active: false } }, edited);
  assert.equal(edited.body.reference.active, false);
  const analyzed = response();
  await handler(router, "post", "/:id/analyze")({ params: { id } }, analyzed);
  assert.deepEqual(analyzed.body.reference.manualTags, ["airy"]);
  const deleted = response();
  await handler(router, "delete", "/:id")({ params: { id } }, deleted);
  assert.equal(deleted.body.deleted, true);
});
test("API : capture désactivée et ID invalide ne déclenchent aucun travail", async () => {
  let work = 0;
  const router = createRouter({
    captureGate: () => {
      throw Object.assign(new Error("Captures désactivées."), { status: 403 });
    },
    service: {
      run: async () => {
        work++;
      },
    },
  });
  const denied = response();
  await handler(router, "post")({ params: {}, body: {} }, denied);
  assert.equal(denied.code, 403);
  const invalid = response();
  await handler(
    router,
    "post",
    "/:id/analyze",
  )({ params: { id: "bad" } }, invalid);
  assert.equal(invalid.code, 400);
  assert.equal(work, 0);
});
test("Vision continuous : un seul POST mocké, quatre images, master exclue, schéma strict", async () => {
  const oldKey = process.env.OPENAI_API_KEY;
  const oldFetch = global.fetch;
  process.env.OPENAI_API_KEY = "mock-only";
  const requests = [];
  global.fetch = async (url, options) => {
    requests.push({ url, body: JSON.parse(options.body) });
    return {
      ok: true,
      json: async () => ({
        output: [
          {
            content: [{ type: "output_text", text: JSON.stringify(fixture()) }],
          },
        ],
      }),
    };
  };
  try {
    assert.deepEqual(
      await analyzeStructuralReference(gucciViews(), gucciMetadata()),
      fixture(),
    );
    assert.equal(requests.length, 1);
    const body = requests[0].body;
    assert.equal(body.model, MODEL_CONFIG.referenceAnalysisModel);
    assert.equal(body.store, false);
    const request = buildStructuralVisionRequest(gucciViews(), gucciMetadata());
    assert.equal(body.instructions, request.instructions);
    const images = body.input[0].content.filter(
      (item) => item.type === "input_image",
    );
    assert.equal(images.length, 4);
    assert.deepEqual(
      images.map((image) => image.detail),
      ["low", "high", "high", "high"],
    );
    assert.equal(
      images.some((image) => image.image_url.includes("desktop_full")),
      false,
    );
    assert.ok(images[0].image_url.includes("visionOverview"));
    assert.deepEqual(body.text.format.schema, request.schema);
    assert.equal(body.text.format.strict, true);
    const content = body.input[0].content;
    const labels = content
      .filter((item) => item.type === "input_text")
      .slice(1)
      .map((item) => JSON.parse(item.text));
    assert.deepEqual(
      labels.map((label) => label.view),
      ["visionOverview", "top", "middle", "bottom"],
    );
    assert.deepEqual(
      labels.map((label) => label.approximatePagePercent),
      [
        [0, 100],
        [0, 17],
        [41, 59],
        [83, 100],
      ],
    );
    assert.match(labels[0].role, /FULL PAGE OPTIMISÉE.*master desktop_full/);
    for (const label of labels.slice(1)) {
      assert.match(label.role, /identifiant sans position implicite/);
      assert.doesNotMatch(label.role, /début|médiane|fin réelle/);
    }
    assert.match(body.instructions, /une seule observation globale/);
    assert.equal(
      JSON.parse(content[0].text).coverageRequirements
        .minimumWithoutJustification,
      3,
    );
    assert.match(
      body.instructions,
      /Do not infer the page structure from the hero alone/,
    );
    await analyzeStructuralReference(
      gucciViews().map((view) => ({
        ...view,
        type: view.type === "visionOverview" ? "overview" : view.type,
        url: view.url.replace("visionOverview", "overview"),
      })),
      gucciMetadata(),
    );
    assert.equal(requests.length, 2); // one call for each explicit invocation
    const legacyImages = requests[1].body.input[0].content.filter(
      (item) => item.type === "input_image",
    );
    assert.equal(legacyImages.length, 4);
    assert.ok(legacyImages[0].image_url.includes("/overview.webp"));
    assert.equal(
      legacyImages.some((item) => item.image_url.includes("desktop_full")),
      false,
    );
    await assert.rejects(
      analyzeStructuralReference(views().slice(0, 2), {}),
      /incomplètes/,
    );
    assert.equal(requests.length, 2);
  } finally {
    global.fetch = oldFetch;
    if (oldKey === undefined) delete process.env.OPENAI_API_KEY;
    else process.env.OPENAI_API_KEY = oldKey;
  }
});
test("Vision sampled : un seul POST mocké, storyboard low, 2 samples low et 3 high, sans full-page", async () => {
  const oldKey = process.env.OPENAI_API_KEY;
  const oldFetch = global.fetch;
  process.env.OPENAI_API_KEY = "mock-only";
  const requests = [];
  global.fetch = async (_url, options) => {
    requests.push(JSON.parse(options.body));
    return {
      ok: true,
      json: async () => ({
        output: [
          {
            content: [
              { type: "output_text", text: JSON.stringify(sampledFixture()) },
            ],
          },
        ],
      }),
    };
  };
  try {
    const metadata = {
      viewport: { width: 1440, height: 900 },
      documentHeight: 6128,
      captureCoverage: sampledCoverage(),
    };
    assert.deepEqual(
      await analyzeStructuralReference(sampledViews(), metadata),
      sampledFixture(),
    );
    assert.equal(requests.length, 1);
    const body = requests[0];
    const content = body.input[0].content;
    const images = content.filter((item) => item.type === "input_image");
    assert.equal(images.length, 6);
    assert.deepEqual(
      images.map((image) => image.detail),
      ["low", "high", "low", "high", "low", "high"],
    );
    assert.equal(
      images.some((image) => image.image_url.includes("desktop_full")),
      false,
    );
    const labels = content
      .filter((item) => item.type === "input_text")
      .slice(1)
      .map((item) => JSON.parse(item.text));
    assert.deepEqual(
      labels.map((label) => label.view),
      SAMPLED_VIEW_TYPES,
    );
    assert.deepEqual(
      labels.map((label) => label.scrollProgressPercent),
      [undefined, 0, 20, 50, 80, 100],
    );
    assert.deepEqual(
      labels.map((label) => label.positionPx),
      [undefined, 0, 1046, 2614, 4182, 5228],
    );
    assert.deepEqual(labels[3].visibleRangePx, [2614, 3514]);
    assert.equal(labels[3].scrollY, 2614);
    assert.equal(labels[3].viewportHeight, 900);
    assert.deepEqual(labels[3].approximatePagePercent, [43, 57]);
    const missingGeometry = sampledViews();
    delete missingGeometry.find((view) => view.type === "middle").sourceRect;
    await assert.rejects(analyzeStructuralReference(missingGeometry, metadata),
      (error) => error.code === "missing_structural_capture_geometry");
    assert.equal(requests.length, 1);
    assert.match(
      body.instructions,
      /These panels are separate stabilized observations/,
    );
    assert.match(body.instructions, /sticky\/fixed répétés/);
    assert.equal(body.store, false);
    assert.deepEqual(body.text.format.schema, buildStructuralVisionRequest(sampledViews(), metadata).schema);
    const invalidEvidence = fixture();
    for (const type of ["desktop_full", "visionOverview"]) {
      invalidEvidence.structuralMoments[0].evidence.sourceViews = [type];
      assert.throws(
        () =>
          validateStructuralAnalysis(invalidEvidence, metadata, sampledViews()),
        /invalide/,
      );
    }
  } finally {
    global.fetch = oldFetch;
    if (oldKey === undefined) delete process.env.OPENAI_API_KEY;
    else process.env.OPENAI_API_KEY = oldKey;
  }
});

test("Vision adaptative : zéro/deux/cinq vues locales, une requête mockée, provenance macro et géométrie", async () => {
  const oldKey = process.env.OPENAI_API_KEY, oldFetch = global.fetch;
  process.env.OPENAI_API_KEY = "mock-only";
  let calls = 0, body;
  const analysis = fixture();
  analysis.structuralMoments.forEach((m) => { m.evidence.sourceViews = ["overview"]; });
  global.fetch = async (_, options) => { calls++; body = JSON.parse(options.body);
    return { ok: true, json: async () => ({ output: [{ content: [{ type: "output_text", text: JSON.stringify(analysis) }] }] }) }; };
  try {
    for (const count of [0, 2, 5]) {
      const captures = [{ type: "overview", url: "https://fixture.test/overview.webp" },
        ...Array.from({ length: count }, (_, i) => ({ type: `observation${i + 1}`, url: `https://fixture.test/${i}.webp`,
          viewport: { width: 1440, height: 900 }, sourceRect: { top: i * 1000, height: 900, width: 1440 }, detail: i ? "low" : "high" }))];
      const metadata = { captureCoverage: { version: 3, captureStrategy: "sampled", totalHeight: 5900, viewportHeight: 900,
        positions: captures.slice(1).map((c) => ({ role: c.type, position: c.sourceRect.top })),
        storyboard: { panels: [{ visibleRangePx: [0, 5900] }] } } };
      const before = calls;
      assert.deepEqual(await analyzeStructuralReference(captures, metadata), analysis);
      assert.equal(calls, before + 1);
      const images = body.input[0].content.filter((c) => c.type === "input_image");
      assert.equal(images.length, count + 1); assert.equal(images[0].detail, "low");
      assert.deepEqual(images.slice(1).map((c) => c.detail), captures.slice(1).map((c) => c.detail));
      if (count) {
        analysis.structuralMoments[2].evidence.sourceViews = ["observation1"];
        assert.throws(() => validateStructuralAnalysis(analysis, metadata, captures), (e) => e.validation.reason === "evidence_outside_visible_range");
        analysis.structuralMoments[2].evidence.sourceViews = ["overview"];
      }
    }
  } finally { global.fetch = oldFetch; if (oldKey === undefined) delete process.env.OPENAI_API_KEY; else process.env.OPENAI_API_KEY = oldKey; }
});
test("séparation : aucune consommation structurelle dans le moteur, DesignReference, Portfolio ou site existant", () => {
  for (const file of [
    "services/design-lab/design-engine-v2.service.js",
    "services/design-lab/design-lab.service.js",
    "services/design-lab/style-frame.service.js",
    "services/design-lab/homepage-generation.service.js",
    "services/design-lab/portfolio.service.js",
    "services/design-lab/existing-website.service.js",
    "models/design-reference.model.js",
    "models/site-project.model.js",
  ])
    assert.doesNotMatch(
      fs.readFileSync(path.join(__dirname, "..", file), "utf8"),
      /StructuralReference|structural-reference/,
    );
});
test("UI : bibliothèque/détail, champs lisibles, tags manuels et aucune source future activée", () => {
  const root = path.join(__dirname, "../../client/src");
  const list = fs.readFileSync(
    path.join(
      root,
      "pages/dashboard/admin/sites/structural-references.page.js",
    ),
    "utf8",
  );
  const detail = fs.readFileSync(
    path.join(
      root,
      "pages/dashboard/admin/sites/structural-references/[id].page.js",
    ),
    "utf8",
  );
  const component = fs.readFileSync(
    path.join(
      root,
      "components/dashboard/admin/sites/structural-reference.component.js",
    ),
    "utf8",
  );
  assert.match(list, /Ajouter une référence structurelle/);
  assert.match(list, /sourceUrl/);
  assert.match(list, /lock.current/);
  assert.doesNotMatch(list, /pinterest|discovery/);
  assert.match(detail, /StructuralAnalysis/);
  assert.match(detail, /Captures et vues de lecture/);
  assert.match(detail, /CaptureSanitizationStatus/);
  assert.match(component, /Overlay bloquant détecté — analyse non lancée/);
  assert.match(component, /Capture propre/);
  assert.match(component, /Consentement cookies supprimé/);
  for (const field of [...PROFILE_FIELDS, ...MOMENT_FIELDS])
    assert.ok(component.includes(field));
  for (const label of [
    "Progression verticale",
    "Moments structurels",
    "Principes transférables",
    "À ne pas copier",
    "Réanalyser",
    "Supprimer",
    "Désactiver",
    "Tags manuels",
  ])
    assert.ok(component.includes(label));
  assert.doesNotMatch(component, /JSON.stringify/);
});
test("UI : une seule capture globale continuous, dérivée technique masquée ; sampled intact", async () => {
  const root = path.join(__dirname, "../../client/src");
  const source = fs.readFileSync(
    path.join(
      root,
      "components/dashboard/admin/sites/structural-capture-display.js",
    ),
    "utf8",
  );
  const { structuralCaptureDisplay } = await import(
    `data:text/javascript;base64,${Buffer.from(source).toString("base64")}`
  );
  for (const type of ["visionOverview", "overview"]) {
    const captures = views().map((view) => ({
      ...view,
      type: view.type === "visionOverview" ? type : view.type,
    }));
    const display = structuralCaptureDisplay({
      captures,
      captureCoverage: completeCoverage(),
    });
    assert.deepEqual(
      display.visibleCaptures.map((view) => view.type),
      ["desktop_full", "top", "middle", "bottom"],
    );
    assert.equal(display.visionOverview.type, type);
  }
  const sampled = structuralCaptureDisplay({
    captures: sampledViews(),
    captureCoverage: sampledCoverage(),
  });
  assert.deepEqual(sampled.visibleCaptures, sampledViews());
  assert.equal(sampled.visionOverview, null);
  const detail = fs.readFileSync(
    path.join(
      root,
      "pages/dashboard/admin/sites/structural-references/[id].page.js",
    ),
    "utf8",
  );
  assert.match(detail, /visibleCaptures\.map/);
  assert.doesNotMatch(detail, /reference\.captures\.map/);
  assert.match(detail, /Version Vision optimisée/);
});
