const test = require("node:test");
const assert = require("node:assert/strict");
const { Writable } = require("node:stream");
const mongoose = require("mongoose");
const sharp = require("sharp");
const cloudinary = require("cloudinary").v2;
const SiteProject = require("../models/site-project.model");
const DesignReference = require("../models/design-reference.model");
const {
  selectReferences,
  filterPresentationTags,
  sanitizeReferenceAnalysis,
  applyReferenceAnalysis,
  uploadImage,
  downloadOwnImage,
  validateUploadedImage,
  prepareUploadedRaster,
} = require("../services/design-lab/design-lab.service");
const {
  creativeInstructions,
  analyzeReference,
  generateDirections,
  generateImage,
  resolveOpenAIModels,
} = require("../services/design-lab/openai.service");
const authenticateAdmin = require("../middleware/authenticate-admin");

test("SiteProject garde une seule référence d'approbation et valide les curseurs", () => {
  const project = new SiteProject({
    name: "Restaurant A",
    slug: "restaurant-a",
    creativeSettings: { creativity: 80 },
  });
  assert.equal(project.validateSync(), undefined);
  project.creativeSettings.creativity = 101;
  assert.match(project.validateSync().message, /creativity/);
  project.creativeSettings.creativity = 80;
  project.directions.push({ name: "A" });
  project.generations.push({
    directionId: project.directions[0]._id,
    generatedPrompt: "Prompt",
    image: { url: "https://example.com/a.png", publicId: "a" },
  });
  project.approvedGeneration = project.generations[0]._id;
  assert.equal(
    String(project.approvedGeneration),
    String(project.generations[0]._id),
  );
});

test("DesignReference conserve une analyse séparée des restaurants publics", () => {
  const reference = new DesignReference({
    name: "Capture",
    image: { url: "https://example.com/a.png", publicId: "a" },
    manualTags: ["Éditorial"],
  });
  assert.equal(reference.validateSync(), undefined);
  assert.equal(reference.analysis, null);
  assert.equal(reference.referenceType, undefined);
  assert.deepEqual(reference.artifactTypes, []);
  assert.deepEqual(reference.visualTags, []);
  assert.deepEqual(reference.businessTags, []);
});

test("REF 03 : un mockup smartphone reste un artefact, jamais une inspiration", async () => {
  const artifact = {
    type: "device_mockup",
    description:
      "Mockup de smartphone incliné superposé à la planche de présentation de la homepage.",
    shouldIgnore: true,
  };
  const modelResult = {
    referenceType: "webpage_in_presentation",
    presentationArtifacts: [artifact],
    visualTags: ["Éditorial", "aperçu mobile flottant"],
    businessTags: ["restaurant japonais"],
    analysis: {
      composition:
        "Grille éditoriale asymétrique. Smartphone incliné superposé à droite.",
      originality: "Aperçu mobile flottant. Titres à grande échelle.",
      usefulSections: ["Hero éditorial", "Section aperçu mobile flottant"],
    },
    characteristics: {
      composition: "Grille asymétrique. Mockup smartphone flottant.",
      visualDensity: 40,
      asymmetry: 60,
      overlapping: 20,
      whitespace: 40,
    },
    sectionInspirations: { hero: "Grande photo. Aperçu mobile flottant." },
  };
  const previousKey = process.env.OPENAI_API_KEY;
  const previousFetch = global.fetch;
  const calls = [];
  process.env.OPENAI_API_KEY = "test-key";
  global.fetch = async (_url, options) => {
    const body = JSON.parse(options.body);
    calls.push(body);
    const output =
      calls.length === 1
        ? modelResult
        : {
            directions: ["A", "B", "C"].map((name) => ({
              name,
              layoutPrinciples: `${name} unique`,
              artisticIntent: name,
              signatureElements: [],
              sectionIdeas: [],
              referenceIndexes: [0],
            })),
          };
    return {
      ok: true,
      json: async () => ({
        output: [
          { content: [{ type: "output_text", text: JSON.stringify(output) }] },
        ],
      }),
    };
  };
  try {
    const result = await analyzeReference("https://example.com/ref03.webp");
    assert.equal(result.referenceType, "webpage_in_presentation");
    assert.deepEqual(result.presentationArtifacts, [artifact]);
    const storedReference = new DesignReference({
      name: "REF 03",
      image: { url: "https://example.com/ref03.webp", publicId: "ref03" },
      manualTags: ["Choix manuel"],
      visualTags: ["Ancien", "aperçu mobile flottant"],
      businessTags: ["Ancien métier"],
    });
    applyReferenceAnalysis(storedReference, {
      ...result,
      visualTags: [
        "Éditorial",
        "logo monumental",
        "mise en page asymétrique",
        "aperçu mobile flottant",
      ],
    });
    assert.equal(storedReference.validateSync(), undefined);
    assert.equal(storedReference.referenceType, "webpage_in_presentation");
    assert.deepEqual(storedReference.artifactTypes, ["device_mockup"]);
    assert.deepEqual(storedReference.manualTags, ["Choix manuel"]);
    assert.deepEqual(storedReference.visualTags, [
      "Éditorial",
      "logo monumental",
      "mise en page asymétrique",
    ]);
    assert.deepEqual(storedReference.businessTags, ["restaurant japonais"]);
    assert.equal(storedReference.presentationArtifacts, undefined);
    assert.deepEqual(result.visualTags, ["Éditorial"]);
    assert.deepEqual(result.businessTags, ["restaurant japonais"]);
    assert.equal(result.analysis.composition, "Grille éditoriale asymétrique.");
    assert.equal(result.analysis.originality, "Titres à grande échelle.");
    assert.deepEqual(result.analysis.usefulSections, ["Hero éditorial"]);
    assert.doesNotMatch(JSON.stringify(result.characteristics), /smartphone/i);
    assert.doesNotMatch(JSON.stringify(result.sectionInspirations), /mobile/i);
    assert.deepEqual(
      filterPresentationTags(
        ["aperçu mobile flottant", "Éditorial"],
        [artifact],
      ),
      ["Éditorial"],
    );
    assert.deepEqual(sanitizeReferenceAnalysis(modelResult).visualTags, [
      "Éditorial",
    ]);

    const reference = {
      _id: "1",
      name: "REF 03 smartphone",
      active: true,
      manualTags: ["aperçu mobile flottant"],
      visualTags: ["aperçu mobile flottant", "Éditorial"],
      businessTags: ["restaurant japonais"],
      analysis: modelResult.analysis,
      characteristics: modelResult.characteristics,
      artifactTypes: ["device_mockup"],
      useCount: 0,
    };
    const project = {
      name: "Restaurant A",
      brief: {},
      assets: [],
      creativeSettings: {
        styles: ["Éditorial"],
        creativity: 50,
        gustoSimilarity: 50,
        visualDensity: 50,
        compositionFreedom: 50,
      },
    };
    const otherReference = {
      ...reference,
      _id: "2",
      name: "Autre page",
      visualTags: ["aperçu mobile flottant"],
      artifactTypes: [],
    };
    assert.deepEqual(
      selectReferences(
        {
          ...project,
          creativeSettings: {
            ...project.creativeSettings,
            styles: ["aperçu mobile flottant"],
          },
        },
        [reference, otherReference],
        1,
      ).map((item) => item._id),
      ["2"],
    );
    await generateDirections(project, [reference]);
    const sentReference = JSON.parse(calls[1].input[0].content[0].text)
      .references[0];
    assert.deepEqual(sentReference.visualLanguage.visualTags, ["Éditorial"]);
    assert.deepEqual(sentReference.originalBusinessContext.businessTags, [
      "restaurant japonais",
    ]);
    assert.deepEqual(sentReference.manualTags, []);
    assert.equal(sentReference.name, "Référence 1");
    assert.doesNotMatch(
      JSON.stringify(sentReference),
      /smartphone|mobile flottant/i,
    );
    assert.match(calls[0].instructions, /planche/);
    assert.ok(calls[0].text.format.schema.required.includes("visualTags"));
    assert.ok(calls[0].text.format.schema.required.includes("businessTags"));
  } finally {
    global.fetch = previousFetch;
    if (previousKey) process.env.OPENAI_API_KEY = previousKey;
    else delete process.env.OPENAI_API_KEY;
  }
});

test("une réanalyse remplace les deux catégories IA et conserve les tags manuels", () => {
  const reference = new DesignReference({
    name: "REF 03",
    image: { url: "https://example.com/ref03.webp", publicId: "ref03" },
    manualTags: ["À conserver"],
    visualTags: ["ancien visuel"],
    businessTags: ["ancien métier"],
  });
  applyReferenceAnalysis(reference, {
    referenceType: "raw_webpage",
    presentationArtifacts: [],
    visualTags: ["éditorial", "À conserver"],
    businessTags: ["restaurant japonais"],
    analysis: { composition: "Grille éditoriale" },
    characteristics: { visualDensity: 50 },
    sectionInspirations: {},
  });
  assert.deepEqual(reference.manualTags, ["À conserver"]);
  assert.deepEqual(reference.visualTags, ["éditorial"]);
  assert.deepEqual(reference.businessTags, ["restaurant japonais"]);
  applyReferenceAnalysis(reference, {
    referenceType: "raw_webpage",
    presentationArtifacts: [],
    visualTags: ["minimaliste"],
    businessTags: ["bistrot"],
    analysis: { composition: "Grille sobre" },
    characteristics: { visualDensity: 20 },
    sectionInspirations: {},
  });
  assert.deepEqual(reference.manualTags, ["À conserver"]);
  assert.deepEqual(reference.visualTags, ["minimaliste"]);
  assert.deepEqual(reference.businessTags, ["bistrot"]);
});

test("sélection locale privilégie les réglages et pénalise la répétition Gusto", () => {
  const project = {
    creativeSettings: {
      styles: ["Éditorial"],
      creativity: 90,
      gustoSimilarity: 0,
      visualDensity: 20,
      compositionFreedom: 90,
    },
  };
  const refs = [
    {
      _id: "1",
      name: "Éditorial",
      active: true,
      visualTags: ["Éditorial"],
      analysis: {},
      characteristics: {
        visualDensity: 20,
        asymmetry: 90,
        overlapping: 90,
        whitespace: 80,
      },
      useCount: 0,
    },
    {
      _id: "2",
      name: "Éditorial répété",
      active: true,
      visualTags: ["Éditorial"],
      analysis: {},
      characteristics: {
        visualDensity: 20,
        asymmetry: 90,
        overlapping: 90,
        whitespace: 80,
      },
      useCount: 20,
    },
    {
      _id: "3",
      name: "Non analysée",
      active: true,
      visualTags: [],
      analysis: null,
      characteristics: null,
    },
  ];
  assert.deepEqual(
    selectReferences(project, refs).map((ref) => ref._id),
    ["1", "2"],
  );
  assert.match(creativeInstructions(project.creativeSettings), /asymétrie/);
  assert.match(creativeInstructions(project.creativeSettings), /s'éloigner/);
});

test("la sélection privilégie le langage visuel au contexte métier", () => {
  const project = {
    brief: { restaurantType: "restaurant français" },
    creativeSettings: {
      styles: ["éditorial"],
      creativity: 50,
      gustoSimilarity: 50,
      visualDensity: 50,
      compositionFreedom: 50,
    },
  };
  const characteristics = {
    visualDensity: 50,
    asymmetry: 50,
    overlapping: 50,
    whitespace: 50,
  };
  const references = [
    {
      _id: "japon",
      active: true,
      analysis: {},
      characteristics,
      visualTags: ["éditorial"],
      businessTags: ["restaurant japonais"],
      manualTags: [],
      useCount: 0,
    },
    {
      _id: "france",
      active: true,
      analysis: {},
      characteristics,
      visualTags: ["minimaliste"],
      businessTags: ["restaurant français"],
      manualTags: [],
      useCount: 0,
    },
  ];
  assert.deepEqual(
    selectReferences(project, references, 1).map((reference) => reference._id),
    ["japon"],
  );
});

test("auth admin refuse un appel sans token", async () => {
  const status = await new Promise((resolve) => {
    const response = {
      status(code) {
        this.code = code;
        return this;
      },
      json() {
        resolve(this.code);
      },
    };
    authenticateAdmin({ headers: {} }, response, () => resolve(200));
  });
  assert.equal(status, 403);
});

test("rôle seller ne peut pas modifier le Design Lab", () => {
  let status;
  authenticateAdmin.requireAdminRole(
    { user: { role: "seller" } },
    {
      status(code) {
        status = code;
        return this;
      },
      json() {},
    },
    () => {
      status = 200;
    },
  );
  assert.equal(status, 403);
});

test("IDs MongoDB de projet restent valides", () => {
  assert.equal(mongoose.isValidObjectId("bad-id"), false);
});

test("upload rejette un contenu image falsifié", async () => {
  await assert.rejects(
    validateUploadedImage({
      mimetype: "image/png",
      buffer: Buffer.from("not an image"),
    }),
    /Image invalide/,
  );
});

test("les JPEG/PNG de référence deviennent de vrais WebP avant Cloudinary, sans crop", async () => {
  const jpeg = await sharp({
    create: { width: 2500, height: 1250, channels: 3, background: "#534b42" },
  })
    .jpeg()
    .toBuffer();
  const webp = await prepareUploadedRaster(
    { buffer: jpeg, mimetype: "image/jpeg" },
    { reference: true },
  );
  assert.equal(webp.toString("ascii", 8, 12), "WEBP");
  const metadata = await sharp(webp).metadata();
  assert.deepEqual(
    [metadata.format, metadata.width, metadata.height],
    ["webp", 2000, 1000],
  );

  const png = await sharp({
    create: {
      width: 2500,
      height: 1250,
      channels: 4,
      background: { r: 40, g: 80, b: 120, alpha: 0.5 },
    },
  })
    .png()
    .toBuffer();
  const pngAsWebp = await prepareUploadedRaster(
    { buffer: png, mimetype: "image/png" },
    { reference: true },
  );
  const pngMetadata = await sharp(pngAsWebp).metadata();
  assert.deepEqual(
    [
      pngMetadata.format,
      pngMetadata.width,
      pngMetadata.height,
      pngMetadata.hasAlpha,
    ],
    ["webp", 2000, 1000, true],
  );

  const originalUpload = cloudinary.uploader.upload_stream;
  let uploaded;
  cloudinary.uploader.upload_stream = (options, callback) => {
    const chunks = [];
    return new Writable({
      write(chunk, _encoding, done) {
        chunks.push(chunk);
        done();
      },
      final(done) {
        uploaded = { options, buffer: Buffer.concat(chunks) };
        callback(null, {
          secure_url: "https://res.cloudinary.com/test/reference.webp",
          public_id: "gusto/design-lab/references/test",
        });
        done();
      },
    });
  };
  try {
    await uploadImage(webp, "gusto/design-lab/references", { format: "webp" });
    assert.equal(uploaded.options.folder, "gusto/design-lab/references");
    assert.equal(uploaded.options.format, "webp");
    assert.equal(uploaded.buffer.toString("ascii", 8, 12), "WEBP");
    assert.deepEqual(uploaded.buffer, webp);
  } finally {
    cloudinary.uploader.upload_stream = originalUpload;
  }
});

test("une capture de homepage très longue garde toute sa hauteur au ratio WebP", async () => {
  const png = await sharp({
    create: { width: 400, height: 20000, channels: 3, background: "#ffffff" },
  })
    .png()
    .toBuffer();
  const webp = await prepareUploadedRaster(
    { buffer: png, mimetype: "image/png" },
    { reference: true },
  );
  const metadata = await sharp(webp).metadata();
  assert.equal(metadata.format, "webp");
  assert.ok(metadata.height <= 16383 && metadata.height > 16000);
  assert.ok(Math.abs(metadata.width / metadata.height - 400 / 20000) < 0.001);
});

test("un logo PNG transparent devient un WebP sans perte de transparence", async () => {
  const png = await sharp({
    create: {
      width: 120,
      height: 80,
      channels: 4,
      background: { r: 255, g: 0, b: 0, alpha: 0.25 },
    },
  })
    .png()
    .toBuffer();
  const webp = await prepareUploadedRaster(
    { buffer: png, mimetype: "image/png" },
    { assetRole: "logo" },
  );
  const metadata = await sharp(webp).metadata();
  assert.equal(metadata.format, "webp");
  assert.equal(metadata.hasAlpha, true);
  const { data } = await sharp(webp)
    .raw()
    .toBuffer({ resolveWithObject: true });
  assert.equal(data[3], 64);
});

test("un asset WebP adapté reste inchangé", async () => {
  const webp = await sharp({
    create: { width: 300, height: 200, channels: 3, background: "#123456" },
  })
    .webp()
    .toBuffer();
  const prepared = await prepareUploadedRaster({
    buffer: webp,
    mimetype: "image/webp",
  });
  assert.strictEqual(prepared, webp);
});

test("les images WebP Cloudinary restent en WebP pour l'édition OpenAI", async () => {
  const previousFetch = global.fetch;
  const webp = Buffer.from("RIFF....WEBP");
  global.fetch = async () => ({
    ok: true,
    headers: { get: () => "image/webp" },
    arrayBuffer: async () => webp,
  });
  try {
    const image = await downloadOwnImage({
      url: "https://res.cloudinary.com/test/image/upload/reference.webp",
      publicId: "gusto/design-lab/references/reference",
    });
    assert.equal(image.mime, "image/webp");
    assert.deepEqual(image.buffer, webp);
  } finally {
    global.fetch = previousFetch;
  }
});

test("absence de clé OpenAI renvoie une erreur claire sans requête réseau", async () => {
  const previous = process.env.OPENAI_API_KEY;
  delete process.env.OPENAI_API_KEY;
  try {
    await assert.rejects(
      analyzeReference("https://example.com/image.png"),
      /OPENAI_API_KEY absente/,
    );
  } finally {
    if (previous) process.env.OPENAI_API_KEY = previous;
  }
});

test("réponse structurée OpenAI invalide est rejetée", async () => {
  const previousKey = process.env.OPENAI_API_KEY;
  const previousFetch = global.fetch;
  process.env.OPENAI_API_KEY = "test-key";
  global.fetch = async () => ({
    ok: true,
    json: async () => ({
      output: [{ content: [{ type: "output_text", text: "invalid-json" }] }],
    }),
  });
  try {
    await assert.rejects(
      analyzeReference("https://example.com/image.png"),
      /réponse structurée OpenAI est invalide/,
    );
  } finally {
    global.fetch = previousFetch;
    if (previousKey) process.env.OPENAI_API_KEY = previousKey;
    else delete process.env.OPENAI_API_KEY;
  }
});

test("les quatre modèles et la qualité ont des valeurs par défaut et des overrides séparés", () => {
  assert.deepEqual(resolveOpenAIModels({}), {
    referenceAnalysisModel: "gpt-6-luna",
    directionModel: "gpt-6.1-sol",
    imageGenerationModel: "gpt-image-2.5-flare",
    imageEditModel: "gpt-image-2.5-sunburst",
    imageQuality: "high",
  });
  assert.deepEqual(
    resolveOpenAIModels({
      OPENAI_DESIGN_REFERENCE_ANALYSIS_MODEL: "custom-ref",
      OPENAI_DESIGN_DIRECTION_MODEL: "custom-direction",
      OPENAI_DESIGN_IMAGE_GENERATION_MODEL: "custom-image",
      OPENAI_DESIGN_IMAGE_EDIT_MODEL: "custom-edit",
      OPENAI_DESIGN_IMAGE_QUALITY: "xhigh",
    }),
    {
      referenceAnalysisModel: "custom-ref",
      directionModel: "custom-direction",
      imageGenerationModel: "custom-image",
      imageEditModel: "custom-edit",
      imageQuality: "xhigh",
    },
  );
  assert.equal(
    resolveOpenAIModels({ OPENAI_DESIGN_IMAGE_QUALITY: "unsupported" })
      .imageQuality,
    "high",
  );
  assert.equal(
    resolveOpenAIModels({ OPENAI_DESIGN_IMAGE_QUALITY: "max" }).imageQuality,
    "max",
  );
});

test("routing Responses et Images utilise le bon modèle, effort et endpoint", async () => {
  const previousKey = process.env.OPENAI_API_KEY;
  const previousFetch = global.fetch;
  const calls = [];
  process.env.OPENAI_API_KEY = "test-key";
  global.fetch = async (url, options) => {
    calls.push({ url, body: options.body });
    if (url.endsWith("/images/generations") || url.endsWith("/images/edits")) {
      return {
        ok: true,
        json: async () => ({
          data: [{ b64_json: Buffer.from("mock-image").toString("base64") }],
        }),
      };
    }
    const body = JSON.parse(options.body);
    const output =
      body.model === "gpt-6-luna"
        ? {
            referenceType: "raw_webpage",
            presentationArtifacts: [],
            visualTags: ["Éditorial"],
            businessTags: ["restaurant japonais"],
            analysis: {},
            characteristics: {},
            sectionInspirations: {},
          }
        : {
            directions: ["A", "B", "C"].map((name) => ({
              name,
              layoutPrinciples: name,
              artisticIntent: name,
              signatureElements: [],
              sectionIdeas: [],
              referenceIndexes: [],
            })),
          };
    return {
      ok: true,
      json: async () => ({
        output: [
          { content: [{ type: "output_text", text: JSON.stringify(output) }] },
        ],
      }),
    };
  };
  try {
    const analysis = await analyzeReference(
      "https://example.com/reference.png",
    );
    assert.deepEqual(analysis.visualTags, ["Éditorial"]);
    assert.deepEqual(analysis.businessTags, ["restaurant japonais"]);
    await generateDirections(
      {
        name: "Restaurant A",
        brief: {},
        assets: [],
        creativeSettings: {
          creativity: 50,
          gustoSimilarity: 50,
          visualDensity: 50,
          compositionFreedom: 50,
          styles: [],
        },
      },
      [],
    );
    const asset = [{ buffer: Buffer.from("image-bytes"), mime: "image/webp" }];
    assert.equal(
      (await generateImage("initiale")).model,
      "gpt-image-2.5-flare",
    );
    assert.equal(
      (await generateImage("avec asset", asset)).model,
      "gpt-image-2.5-flare",
    );
    assert.equal(
      (await generateImage("variation", asset, { isVariation: true })).model,
      "gpt-image-2.5-sunburst",
    );

    const referenceBody = JSON.parse(calls[0].body);
    const directionBody = JSON.parse(calls[1].body);
    assert.deepEqual(
      [referenceBody.model, referenceBody.reasoning.effort],
      ["gpt-6-luna", "low"],
    );
    assert.deepEqual(
      [directionBody.model, directionBody.reasoning.effort],
      ["gpt-6.1-sol", "high"],
    );
    assert.equal(referenceBody.text.format.strict, true);
    assert.ok(referenceBody.text.format.schema.required.includes("visualTags"));
    assert.ok(
      referenceBody.text.format.schema.required.includes("businessTags"),
    );
    assert.equal(directionBody.text.format.strict, true);
    assert.equal(new URL(calls[2].url).pathname, "/v1/images/generations");
    assert.deepEqual(
      [JSON.parse(calls[2].body).model, JSON.parse(calls[2].body).quality],
      ["gpt-image-2.5-flare", "high"],
    );
    assert.equal(calls[3].body.get("model"), "gpt-image-2.5-flare");
    assert.equal(calls[4].body.get("model"), "gpt-image-2.5-sunburst");
    assert.equal(calls[4].body.getAll("image[]").length, 1);
    assert.equal(calls[4].body.get("image[]").name, "source-0.webp");
    assert.equal(calls[4].body.get("image[]").type, "image/webp");
    assert.equal(calls[4].body.get("quality"), "high");
  } finally {
    global.fetch = previousFetch;
    if (previousKey) process.env.OPENAI_API_KEY = previousKey;
    else delete process.env.OPENAI_API_KEY;
  }
});

test("une variation exige une image parente", async () => {
  await assert.rejects(
    generateImage("variation", [], { isVariation: true }),
    /Image parente requise/,
  );
});
