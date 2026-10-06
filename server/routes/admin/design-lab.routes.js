const express = require("express");
const mongoose = require("mongoose");
const multer = require("multer");
const cloudinary = require("cloudinary").v2;
const crypto = require("crypto");
const sharp = require("sharp");
const authenticateAdmin = require("../../middleware/authenticate-admin");
const { requireAdminRole } = require("../../middleware/authenticate-admin");
const SiteProject = require("../../models/site-project.model");
const Restaurant = require("../../models/restaurant.model");
const DesignReference = require("../../models/design-reference.model");
const GustoPortfolioSite = require("../../models/gusto-portfolio-site.model");
const { buildPortfolioSummary } = require("../../services/design-lab/portfolio.service");
const cloudinaryFolders = require("../../services/design-lab/cloudinary-folders");
const openai = require("../../services/design-lab/openai.service");
const StyleFrameAttempt = require("../../models/style-frame-generation-attempt.model");
const styleFrames = require("../../services/design-lab/style-frame.service");
const HomepageAttempt = require("../../models/homepage-generation-attempt.model");
const homepages = require("../../services/design-lab/homepage-generation.service");
const { activeDirections, directionHistory, requireActiveDirection, validateDirectionVersions,
  promoteDirectionSet, promoteSingleDirection } = require("../../services/design-lab/direction-versioning.service");
const {
  IMAGE_INPUT_LIMIT,
  homepageV2Plan,
  assertStyleFrameApproved,
} = require("../../services/design-lab/design-engine-v2.service");
const { assembleChapters } = require("../../services/design-lab/image-assembly.service");
const {
  assertProjectEditable,
  frozenProjectError,
  approveProject,
  reopenProject,
} = require("../../services/design-lab/approval.service");
const {
  crawlExistingWebsite,
} = require("../../services/design-lab/existing-website.service");
const {
  selectReferences,
  uploadImage,
  downloadOwnImage,
  prepareUploadedRaster,
  uniqueTags,
  excludeTags,
  applyReferenceAnalysis,
} = require("../../services/design-lab/design-lab.service");
const {
  getReferenceProgress,
  setReferenceProgress,
} = require("../../services/design-lab/reference-progress.service");

const router = express.Router();
router.use("/admin/design-lab", authenticateAdmin, requireAdminRole);

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 12 * 1024 * 1024 },
  fileFilter: (_req, file, callback) =>
    callback(
      null,
      ["image/jpeg", "image/png", "image/webp"].includes(file.mimetype),
    ),
});
const validId = (value) => mongoose.isValidObjectId(value);
const clean = (value, max = 2000) =>
  typeof value === "string" ? value.trim().slice(0, max) : "";
const errorResponse = (res, error) =>
  res.status(error.status || 500).json({
    message: error.status ? error.message : "Erreur interne du Design Lab.",
    ...(error.styleFrame ? { styleFrameError: error.styleFrame } : {}),
    ...(error.homepage ? { homepageError: error.homepage } : {}),
  });
const referenceStepLabels = {
  preparing: "préparation de l'image",
  uploading: "upload Cloudinary",
  analyzing: "analyse visuelle",
  saving: "enregistrement",
};
const DIRECTION_LOCK_STALE_MS = 20 * 60 * 1000;

async function portfolioFor(project) {
  const sites = await GustoPortfolioSite.find({ active: true, analyzedAt: { $ne: null } }).lean();
  return buildPortfolioSummary(sites, project);
}

async function directionCheckpointOptions(project) {
  const stored = await SiteProject.findById(project._id).select("+directionGenerationCheckpoint");
  const token = project.operation;
  return {
    checkpoint: stored?.directionGenerationCheckpoint || null,
    onCheckpoint: async (checkpoint) => {
      const result = await SiteProject.updateOne(
        { _id: project._id, operation: token },
        { $set: { directionGenerationCheckpoint: checkpoint } },
      );
      if (result.matchedCount !== 1) throw Object.assign(new Error("Verrou de génération perdu ; checkpoint non enregistré."), { status: 409 });
    },
  };
}

function consumeDirectionCheckpoint(project) {
  // Directions + checkpoint deletion are committed in the same Mongo document save.
  project.directionGenerationCheckpoint = null;
  project.markModified("directionGenerationCheckpoint");
  project.$where = { operation: project.operation };
}

function validateProject(body, existing) {
  const name = clean(body.name, 120);
  const slug = clean(body.slug, 100).toLowerCase();
  if (!name || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug))
    throw Object.assign(new Error("Nom et slug valide requis."), {
      status: 400,
    });
  if (body.restaurantId && !validId(body.restaurantId))
    throw Object.assign(new Error("Restaurant invalide."), { status: 400 });
  const briefKeys = [
    "city",
    "restaurantType",
    "description",
    "story",
    "positioning",
    "target",
    "particularities",
    "existingWebsite",
    "notes",
  ];
  const brief = Object.fromEntries(
    briefKeys.map((key) => [
      key,
      clean(body.brief?.[key], key === "notes" ? 5000 : 2000),
    ]),
  );
  brief.services = Array.isArray(body.brief?.services)
    ? body.brief.services
        .slice(0, 20)
        .map((item) => clean(item, 80))
        .filter(Boolean)
    : [];
  const current = existing?.creativeSettings || {};
  const settings = {};
  for (const field of [
    "creativity",
    "gustoSimilarity",
    "visualDensity",
    "compositionFreedom",
  ]) {
    const value = body.creativeSettings?.[field] ?? current[field] ?? 50;
    if (
      !Number.isInteger(Number(value)) ||
      Number(value) < 0 ||
      Number(value) > 100
    )
      throw Object.assign(new Error(`Réglage ${field} invalide.`), {
        status: 400,
      });
    settings[field] = Number(value);
  }
  settings.styles = Array.isArray(body.creativeSettings?.styles)
    ? [
        ...new Set(
          body.creativeSettings.styles
            .slice(0, 12)
            .map((item) => clean(item, 50))
            .filter(Boolean),
        ),
      ]
    : current.styles || [];
  settings.brandContinuity = body.creativeSettings?.brandContinuity ?? current.brandContinuity ?? "reinvent";
  if (!["reinvent", "evolve", "preserve"].includes(settings.brandContinuity))
    throw Object.assign(new Error("Continuité de marque invalide."), { status: 400 });
  return {
    name,
    slug,
    restaurantId: body.restaurantId || null,
    brief,
    creativeSettings: settings,
  };
}

async function validateRestaurant(projectFields) {
  if (
    projectFields.restaurantId &&
    !(await Restaurant.exists({ _id: projectFields.restaurantId }))
  )
    throw Object.assign(new Error("Restaurant Gusto introuvable."), {
      status: 400,
    });
  return projectFields;
}

async function lockedProject(id, operation, status, task, { preservePaidImages = false, onError } = {}) {
  const token = `${operation}:${crypto.randomUUID()}`;
  const lockUpdate = {
    operation: token,
    operationStage: operation === "directions" || operation === "direction" ? "territories" : "",
    operationStartedAt: new Date(),
    lastError: "",
  };
  // A failed reanalysis must not leave an older site summary available to
  // later direction generation, even when the URL itself has not changed.
  if (operation === "website-context") lockUpdate.existingWebsiteContext = null;
  if (status) lockUpdate.status = status;
  const project = await SiteProject.findOneAndUpdate(
    {
      _id: id,
      status: { $ne: "approved" },
      approvedGeneration: null,
      approvedAt: null,
      approvedSnapshot: null,
      $or: [
        { operation: "" },
        { operation: { $regex: /^directions?:/ }, operationStartedAt: { $lt: new Date(Date.now() - DIRECTION_LOCK_STALE_MS) } },
        { operation: { $not: /^directions?:/ }, operationStartedAt: { $lt: new Date(Date.now() - homepages.OPERATION_LOCK_STALE_MS) } },
      ],
    },
    { $set: lockUpdate },
    { new: true },
  );
  if (!project) {
    const existing = await SiteProject.findById(id).select(
      "status approvedGeneration approvedAt approvedSnapshot",
    );
    if (
      existing?.status === "approved" ||
      existing?.approvedGeneration ||
      existing?.approvedAt ||
      existing?.approvedSnapshot
    ) throw frozenProjectError();
    throw Object.assign(
      new Error(
        existing ? "Une génération est déjà en cours." : "Projet introuvable.",
      ),
      { status: existing ? 409 : 404 },
    );
  }
  const priorGenerationIds = new Set(
    project.generations.map((generation) => String(generation._id)),
  );
  const priorStyleFrameIds = new Set(project.directions.flatMap((direction) =>
    direction.styleFrames.map((frame) => String(frame._id))));
  try {
    const result = await task(project);
    if (!(await SiteProject.exists({ _id: id, operation: token })))
      throw Object.assign(new Error("Projet supprimé pendant la génération."), {
        status: 404,
      });
    project.operation = "";
    project.operationStage = "";
    project.operationStartedAt = null;
    project.lastError = "";
    await project.save();
    return result || project;
  } catch (error) {
    if (onError) error = await onError(error);
    const newImages = project.generations
      .filter((generation) => !priorGenerationIds.has(String(generation._id)))
      .map((generation) => generation.image?.publicId)
      .filter(Boolean);
    newImages.push(...project.directions.flatMap((direction) => direction.styleFrames
      .filter((frame) => !priorStyleFrameIds.has(String(frame._id)))
      .map((frame) => frame.image?.publicId)
      .filter(Boolean)));
    await Promise.allSettled(
      (preservePaidImages ? [] : newImages).map((publicId) => cloudinary.uploader.destroy(publicId)),
    );
    const fallbackStatus = status
      ? project.approvedGeneration
        ? "approved"
        : project.generations.length
          ? "exploration"
          : project.directions.length
            ? "directions_ready"
            : "brief_ready"
      : project.status;
    await SiteProject.updateOne(
      { _id: id, operation: token },
      {
        $set: {
          operation: "",
          operationStage: "",
          operationStartedAt: null,
          status: fallbackStatus,
          lastError: error.message,
        },
      },
    );
    throw error;
  }
}

async function setDirectionStage(project, stage) {
  const result = await SiteProject.updateOne(
    { _id: project._id, operation: project.operation },
    { $set: { operationStage: stage } },
  );
  if (!result.matchedCount) throw Object.assign(new Error("Opération de directions interrompue."), { status: 409 });
  project.operationStage = stage;
}

async function makeGeneration(project, direction, parent, instruction) {
  const context = { projectId: String(project._id), directionId: String(direction._id) };
  const startedAt = Date.now();
  // A stitched homepage can exceed the 20 MB limit used for ordinary assets.
  // Only its cropped chapter, never the full image, is sent to Images Edits.
  const parentImage = parent
    ? await downloadOwnImage(parent.image, 48 * 1024 * 1024)
    : null;
  const plan = homepageV2Plan(project, direction, { parent, instruction });
  const approvedStyleFrameImage = plan.styleFrame
    ? await downloadOwnImage(plan.styleFrame.image)
    : null;
  console.info("mockup:direction", { ...context, name: direction.name, variation: Boolean(parent) });
  console.info("mockup:format", {
    ...context, strategy: plan.strategy, width: plan.width,
    height: plan.height, segmentCount: plan.segments.length,
    overlapPx: plan.overlapPx,
  });
  const downloaded = new Map();
  const rendered = [];
  let imageModel = "";
  for (const segment of plan.segments) {
    console.info("mockup:assets_selected", {
      ...context, segment: segment.index + 1, count: segment.assets.length,
      assets: segment.assets.map((asset) => ({
        assetId: String(asset._id), role: asset.role, signature: asset.signature,
      })),
    });
    console.info("mockup:assets_excluded", {
      ...context, segment: segment.index + 1,
      assets: (segment.excluded || []).map(({ asset, reason }) => ({
        assetId: String(asset._id), role: asset.role, signature: asset.signature, reason,
      })),
    });
    if (process.env.NODE_ENV !== "production" && process.env.GUSTO_DESIGN_LAB_DEBUG_PROMPT === "true")
      console.info("mockup:prompt", { ...context, segment: segment.index + 1, prompt: segment.prompt });
    const images = [];
    if (approvedStyleFrameImage) images.push(approvedStyleFrameImage);
    if (parentImage) {
      const top = plan.segments.slice(0, segment.index)
        .reduce((sum, item) => sum + item.size.height, 0)
        - segment.index * plan.overlapPx;
      const buffer = await sharp(parentImage.buffer).extract({
        left: 0, top, width: segment.size.width, height: segment.size.height,
      }).png().toBuffer();
      images.push({ buffer, mime: "image/png" });
    } else if (rendered.length) {
      images.push({ buffer: rendered[rendered.length - 1], mime: "image/png" });
    }
    if (rendered.length && plan.overlapPx) {
      const previous = plan.segments[segment.index - 1];
      const strip = await sharp(rendered[rendered.length - 1]).extract({
        left: 0,
        top: previous.size.height - plan.overlapPx,
        width: previous.size.width,
        height: plan.overlapPx,
      }).png().toBuffer();
      images.push({ buffer: strip, mime: "image/png" });
    }
    for (const asset of segment.assets) {
      const id = String(asset._id);
      if (!downloaded.has(id)) downloaded.set(id, await downloadOwnImage(asset));
      images.push(downloaded.get(id));
    }
    if (images.length > IMAGE_INPUT_LIMIT)
      throw Object.assign(new Error("Trop d'images pour la requête OpenAI."), { status: 400 });
    const callStartedAt = Date.now();
    console.info("mockup:request_started", {
      ...context, segment: segment.index + 1, imageCount: images.length,
      size: `${segment.size.width}x${segment.size.height}`,
    });
    try {
      const output = await openai.generateImage(segment.prompt, images, {
        isVariation: Boolean(parent),
        size: `${segment.size.width}x${segment.size.height}`,
      });
      const dimensions = await sharp(output.buffer).metadata();
      if (dimensions.width !== segment.size.width || dimensions.height !== segment.size.height)
        throw Object.assign(new Error("Dimensions de la maquette OpenAI inattendues."), { status: 502 });
      rendered.push(output.buffer);
      imageModel = output.model;
      console.info("mockup:request_completed", {
        ...context, segment: segment.index + 1, model: output.model,
        elapsedMs: Date.now() - callStartedAt,
      });
    } catch (error) {
      console.warn("mockup:request_failed", {
        ...context, segment: segment.index + 1,
        elapsedMs: Date.now() - callStartedAt, status: error.status || 500,
      });
      throw error;
    }
    const heartbeat = await SiteProject.updateOne(
      { _id: project._id, operation: project.operation },
      { $set: { operationStartedAt: new Date() } },
    );
    if (!heartbeat.matchedCount)
      throw Object.assign(new Error("Projet supprimé pendant la génération."), { status: 404 });
  }
  if (
    !(await SiteProject.exists({
      _id: project._id,
      operation: project.operation,
    }))
  )
    throw Object.assign(new Error("Projet supprimé pendant la génération."), {
      status: 404,
    });
  const buffer = await assembleChapters(
    rendered, plan.segments.map((segment) => segment.size), plan.overlapPx,
  );
  const image = await uploadImage(buffer, cloudinaryFolders.GENERATIONS);
  const assetsUsed = [...new Map(plan.segments.flatMap((segment) => segment.assets)
    .map((asset) => [String(asset._id), asset])).values()];
  project.generations.push({
    engineVersion: direction.engineVersion,
    styleFrameId: plan.styleFrameId || null,
    directionId: direction._id,
    parentGenerationId: parent?._id || null,
    userPrompt: instruction || "",
    generatedPrompt: plan.segments.map((segment) => segment.prompt).join("\n\n--- NEXT CHAPTER ---\n\n"),
    image,
    model: imageModel,
    assetsUsed: assetsUsed.map((asset) => ({
      assetId: asset._id, name: asset.name, role: asset.role, signature: asset.signature,
    })),
    generationStrategy: {
      type: plan.strategy,
      overlapPx: plan.overlapPx,
      homepageBlueprint: plan.homepageBlueprint,
      segments: plan.segments.map((segment) => ({
        index: segment.index, width: segment.size.width, height: segment.size.height,
        sections: segment.sections.map((section) => section.contentIntent),
        sectionIds: segment.sections.map((section) => section.id),
        assetIds: segment.assets.map((asset) => asset._id),
      })),
    },
    outputDimensions: { width: plan.width, height: plan.height },
  });
  const generation = project.generations[project.generations.length - 1];
  project.selectedDirection = direction._id;
  project.selectedGeneration = generation._id;
  project.status = "exploration";
  console.info("mockup:completed", { ...context, elapsedMs: Date.now() - startedAt, width: plan.width, height: plan.height });
  return generation;
}

router.get("/admin/design-lab/projects", async (_req, res) => {
  try {
    res.json({
      projects: await SiteProject.find()
        .select("name slug status createdAt updatedAt approvedGeneration")
        .sort({ updatedAt: -1 })
        .lean(),
    });
  } catch (error) {
    errorResponse(res, error);
  }
});

router.post("/admin/design-lab/projects", async (req, res) => {
  try {
    res
      .status(201)
      .json({
        project: await SiteProject.create(
          await validateRestaurant(validateProject(req.body)),
        ),
      });
  } catch (error) {
    const responseError =
      error.code === 11000
        ? Object.assign(new Error("Ce slug existe déjà."), { status: 409 })
        : error;
    errorResponse(res, responseError);
  }
});

router.get("/admin/design-lab/projects/:id", async (req, res) => {
  if (!validId(req.params.id))
    return res.status(400).json({ message: "ID invalide." });
  try {
    const project = await SiteProject.findById(req.params.id);
    if (!project)
      return res.status(404).json({ message: "Projet introuvable." });
    const attempts = await StyleFrameAttempt.find({ projectId: project._id }).sort({ createdAt: -1 }).limit(50).lean();
    res.json({ project, styleFrameAttempts: attempts.map(styleFrames.summary), homepageOperationStale: homepages.isStaleOperation(project) });
  } catch (error) {
    errorResponse(res, error);
  }
});

router.get("/admin/design-lab/projects/:id/directions/history", async (req, res) => {
  if (!validId(req.params.id)) return res.status(400).json({ message: "ID invalide." });
  try {
    const project = await SiteProject.findById(req.params.id);
    if (!project) return res.status(404).json({ message: "Projet introuvable." });
    const directions = directionHistory(project).map((direction) => direction.toObject());
    const ids = new Set(directions.map((direction) => String(direction._id)));
    res.json({ directions, generations: project.generations.filter((generation) => ids.has(String(generation.directionId))) });
  } catch (error) { errorResponse(res, error); }
});

router.get("/admin/design-lab/projects/:id/homepage-attempts", async (req, res) => {
  if (!validId(req.params.id)) return res.status(400).json({ message: "ID invalide." });
  try {
    const attempts = await HomepageAttempt.find({ projectId: req.params.id }).sort({ createdAt: -1 }).limit(50).lean();
    res.json({ attempts: attempts.map(homepages.summary) });
  } catch (error) { errorResponse(res, error); }
});

router.put("/admin/design-lab/projects/:id", async (req, res) => {
  if (!validId(req.params.id))
    return res.status(400).json({ message: "ID invalide." });
  try {
    const project = await SiteProject.findById(req.params.id);
    if (!project)
      return res.status(404).json({ message: "Projet introuvable." });
    assertProjectEditable(project);
    if (project.operation)
      return res.status(409).json({ message: "Génération en cours." });
    const previousWebsite = project.brief?.existingWebsite;
    Object.assign(
      project,
      await validateRestaurant(validateProject(req.body, project)),
    );
    if (project.brief?.existingWebsite !== previousWebsite)
      project.existingWebsiteContext = null;
    if (project.status === "draft") project.status = "brief_ready";
    await project.save();
    res.json({ project });
  } catch (error) {
    const responseError =
      error.code === 11000
        ? Object.assign(new Error("Ce slug existe déjà."), { status: 409 })
        : error;
    errorResponse(res, responseError);
  }
});

router.post(
  "/admin/design-lab/projects/:id/existing-website-context",
  async (req, res) => {
    if (!validId(req.params.id))
      return res.status(400).json({ message: "ID invalide." });
    try {
      const project = await lockedProject(
        req.params.id,
        "website-context",
        null,
        async (locked) => {
          if (!locked.brief?.existingWebsite)
            throw Object.assign(
              new Error("Enregistrez d'abord l'URL du site existant."),
              {
                status: 400,
              },
            );
          const { text, sourcePages, pagesDiscovered, pagesFailed } =
            await crawlExistingWebsite(locked.brief.existingWebsite);
          const context = await openai.analyzeExistingWebsiteText(text);
          locked.existingWebsiteContext = {
            restaurantSummary: context.restaurantSummary,
            story: context.story,
            positioning: context.positioning,
            cuisine: context.cuisine,
            chef: context.chef,
            team: context.team,
            services: context.services,
            specialties: context.specialties,
            values: context.values,
            notableFacts: context.notableFacts,
            location: context.location,
            contact: context.contact,
            openingHours: context.openingHours,
            usefulContent: context.usefulContent,
            sourcePages,
            pagesDiscovered,
            pagesFailed,
            analyzedAt: new Date(),
          };
          return locked;
        },
      );
      res.json({ project });
    } catch (error) {
      errorResponse(res, error);
    }
  },
);

router.delete("/admin/design-lab/projects/:id", async (req, res) => {
  if (!validId(req.params.id))
    return res.status(400).json({ message: "ID invalide." });
  try {
    const project = await SiteProject.findOneAndDelete({
      _id: req.params.id,
      status: { $ne: "approved" },
      approvedGeneration: null,
      approvedAt: null,
      approvedSnapshot: null,
    });
    if (!project) {
      const existing = await SiteProject.findById(req.params.id).select(
        "status approvedGeneration approvedAt approvedSnapshot",
      );
      if (
        existing?.status === "approved" ||
        existing?.approvedGeneration ||
        existing?.approvedAt ||
        existing?.approvedSnapshot
      )
        throw frozenProjectError();
      return res.status(404).json({ message: "Projet introuvable." });
    }
    const imageIds = [
      ...project.assets.map((asset) => asset.publicId),
      ...project.generations.map((generation) => generation.image.publicId),
    ];
    await Promise.allSettled(
      imageIds.map((publicId) => cloudinary.uploader.destroy(publicId)),
    );
    res.json({ ok: true });
  } catch (error) {
    errorResponse(res, error);
  }
});

router.post(
  "/admin/design-lab/projects/:id/assets",
  upload.single("image"),
  async (req, res) => {
    if (!validId(req.params.id) || !req.file)
      return res.status(400).json({
        message: "Projet ou image invalide (JPEG, PNG, WebP, 12 Mo max).",
      });
    try {
      const project = await SiteProject.findById(req.params.id);
      if (!project)
        return res.status(404).json({ message: "Projet introuvable." });
      assertProjectEditable(project);
      if (project.operation)
        return res.status(409).json({ message: "Génération en cours." });
      const role = clean(req.body.role, 40) || "other";
      const webpBuffer = await prepareUploadedRaster(req.file, {
        assetRole: role,
      });
      const image = await uploadImage(
        webpBuffer,
        cloudinaryFolders.projectAssets(project._id),
        { format: "webp" },
      );
      project.assets.push({
        ...image,
        role,
        signature: req.body.signature === "true",
        name: clean(req.body.name, 120) || req.file.originalname,
      });
      await project.save();
      res.status(201).json({ project });
    } catch (error) {
      errorResponse(res, error);
    }
  },
);

router.patch(
  "/admin/design-lab/projects/:id/assets/:assetId",
  async (req, res) => {
    if (!validId(req.params.id) || !validId(req.params.assetId))
      return res.status(400).json({ message: "ID invalide." });
    try {
      const project = await SiteProject.findById(req.params.id);
      const asset = project?.assets.id(req.params.assetId);
      if (!asset)
        return res.status(404).json({ message: "Asset introuvable." });
      assertProjectEditable(project);
      if (project.operation)
        return res.status(409).json({ message: "Génération en cours." });
      if (req.body.role !== undefined)
        asset.role = clean(req.body.role, 40) || "other";
      if (typeof req.body.signature === "boolean")
        asset.signature = req.body.signature;
      if (typeof req.body.benchmarkExcluded === "boolean")
        asset.benchmarkExcluded = req.body.benchmarkExcluded;
      await project.save();
      res.json({ project });
    } catch (error) {
      errorResponse(res, error);
    }
  },
);

router.delete(
  "/admin/design-lab/projects/:id/assets/:assetId",
  async (req, res) => {
    if (!validId(req.params.id) || !validId(req.params.assetId))
      return res.status(400).json({ message: "ID invalide." });
    try {
      const project = await SiteProject.findById(req.params.id);
      const asset = project?.assets.id(req.params.assetId);
      if (!asset)
        return res.status(404).json({ message: "Asset introuvable." });
      assertProjectEditable(project);
      if (project.operation)
        return res.status(409).json({ message: "Génération en cours." });
      const publicId = asset.publicId;
      asset.deleteOne();
      await project.save();
      await cloudinary.uploader.destroy(publicId).catch(() => {});
      res.json({ project });
    } catch (error) {
      errorResponse(res, error);
    }
  },
);

router.get("/admin/design-lab/references", async (_req, res) => {
  try {
    res.json({
      references: await DesignReference.find().sort({ createdAt: -1 }).lean(),
    });
  } catch (error) {
    errorResponse(res, error);
  }
});

router.get("/admin/design-lab/references/progress/:operationId", (req, res) => {
  const progress = getReferenceProgress(req.params.operationId);
  if (!progress) return res.status(404).json({ message: "Opération introuvable." });
  return res.json({ progress });
});

router.post(
  "/admin/design-lab/references",
  upload.single("image"),
  async (req, res) => {
    if (!req.file)
      return res
        .status(400)
        .json({ message: "Image JPEG, PNG ou WebP requise (12 Mo max)." });
    const operationId = req.body.operationId;
    let currentStep = "preparing";
    setReferenceProgress(operationId, {
      status: "running", currentStep, progress: 0,
      message: "Préparation de l'image…",
    });
    try {
      const webpBuffer = await prepareUploadedRaster(req.file, {
        reference: true,
      });
      currentStep = "uploading";
      setReferenceProgress(operationId, {
        currentStep, progress: 30, message: "Upload Cloudinary…",
      });
      const image = await uploadImage(
        webpBuffer,
        cloudinaryFolders.REFERENCES,
        { format: "webp" },
      );
      currentStep = "saving";
      setReferenceProgress(operationId, {
        currentStep, progress: 50, message: "Création de la référence…",
      });
      const reference = await DesignReference.create({
        name: clean(req.body.name, 120) || req.file.originalname,
        image,
        source: clean(req.body.source, 500),
        manualTags: uniqueTags(
          clean(req.body.manualTags, 500)
            .split(",")
            .map((tag) => tag.trim())
            .filter(Boolean),
        ).slice(0, 20),
      });
      currentStep = "analyzing";
      setReferenceProgress(operationId, {
        currentStep, progress: 60, message: "Analyse visuelle en cours…",
      });
      try {
        const result = await openai.analyzeReference(image.url);
        applyReferenceAnalysis(reference, result);
        reference.analyzedAt = new Date();
        currentStep = "saving";
        setReferenceProgress(operationId, {
          currentStep, progress: 90, message: "Enregistrement de la référence…",
        });
        await reference.save();
        setReferenceProgress(operationId, {
          status: "completed", currentStep: "completed", progress: 100,
          message: "Analyse terminée",
        });
      } catch (error) {
        const failedStep = currentStep;
        reference.lastError = error.message;
        currentStep = "saving";
        await reference.save();
        setReferenceProgress(operationId, {
          status: "failed", currentStep: failedStep,
          message: `Échec pendant : ${referenceStepLabels[failedStep]}`,
        });
      }
      res.status(201).json({ reference });
    } catch (error) {
      setReferenceProgress(operationId, {
        status: "failed", currentStep,
        message: `Échec pendant : ${referenceStepLabels[currentStep] || "analyse"}`,
      });
      errorResponse(res, error);
    }
  },
);

router.patch("/admin/design-lab/references/:id", async (req, res) => {
  if (!validId(req.params.id))
    return res.status(400).json({ message: "ID invalide." });
  try {
    const reference = await DesignReference.findById(req.params.id);
    if (!reference)
      return res.status(404).json({ message: "Référence introuvable." });
    if (req.body.name !== undefined) reference.name = clean(req.body.name, 120);
    if (req.body.source !== undefined)
      reference.source = clean(req.body.source, 500);
    if (typeof req.body.active === "boolean")
      reference.active = req.body.active;
    if (Array.isArray(req.body.manualTags)) {
      reference.manualTags = uniqueTags(
        req.body.manualTags
          .slice(0, 20)
          .map((tag) => clean(tag, 50))
          .filter(Boolean),
      );
      reference.visualTags = excludeTags(
        reference.visualTags,
        reference.manualTags,
      );
      reference.businessTags = excludeTags(reference.businessTags, [
        ...reference.manualTags,
        ...reference.visualTags,
      ]);
    }
    await reference.save();
    res.json({ reference });
  } catch (error) {
    errorResponse(res, error);
  }
});

router.delete("/admin/design-lab/references/:id", async (req, res) => {
  if (!validId(req.params.id))
    return res.status(400).json({ message: "ID invalide." });
  try {
    const reference = await DesignReference.findByIdAndDelete(req.params.id);
    if (!reference)
      return res.status(404).json({ message: "Référence introuvable." });
    await cloudinary.uploader.destroy(reference.image.publicId).catch(() => {});
    res.json({ ok: true });
  } catch (error) {
    errorResponse(res, error);
  }
});

router.post("/admin/design-lab/references/:id/analyze", async (req, res) => {
  if (!validId(req.params.id))
    return res.status(400).json({ message: "ID invalide." });
  const reference = await DesignReference.findOneAndUpdate(
    {
      _id: req.params.id,
      $or: [
        { analyzing: false },
        { analysisStartedAt: { $lt: new Date(Date.now() - 10 * 60 * 1000) } },
      ],
    },
    { $set: { analyzing: true, analysisStartedAt: new Date(), lastError: "" } },
    { new: true },
  );
  if (!reference)
    return res
      .status(409)
      .json({ message: "Référence introuvable ou analyse déjà en cours." });
  const operationId = req.body?.operationId;
  let currentStep = "analyzing";
  setReferenceProgress(operationId, {
    status: "running", currentStep, progress: 60,
    message: "Analyse visuelle en cours…",
  });
  try {
    const result = await openai.analyzeReference(reference.image.url);
    applyReferenceAnalysis(reference, result);
    reference.analyzedAt = new Date();
    reference.analyzing = false;
    reference.analysisStartedAt = null;
    currentStep = "saving";
    setReferenceProgress(operationId, {
      currentStep, progress: 90, message: "Enregistrement de la référence…",
    });
    await reference.save();
    setReferenceProgress(operationId, {
      status: "completed", currentStep: "completed", progress: 100,
      message: "Analyse terminée",
    });
    res.json({ reference });
  } catch (error) {
    await DesignReference.updateOne(
      { _id: reference._id },
      {
        $set: {
          analyzing: false,
          analysisStartedAt: null,
          lastError: error.message,
        },
      },
    );
    setReferenceProgress(operationId, {
      status: "failed", currentStep,
      message: `Échec pendant : ${referenceStepLabels[currentStep]}`,
    });
    errorResponse(res, error);
  }
});

router.post(
  "/admin/design-lab/projects/:id/select-references",
  async (req, res) => {
    if (!validId(req.params.id))
      return res.status(400).json({ message: "ID invalide." });
    try {
      const project = await SiteProject.findById(req.params.id);
      if (!project)
        return res.status(404).json({ message: "Projet introuvable." });
      assertProjectEditable(project);
      if (project.operation)
        return res.status(409).json({ message: "Génération en cours." });
      const references = selectReferences(
        project,
        await DesignReference.find({ active: true }).lean(),
        8,
        await portfolioFor(project),
      );
      project.selectedReferences = references.map((ref) => ref._id);
      await project.save();
      res.json({ project, references });
    } catch (error) {
      errorResponse(res, error);
    }
  },
);

router.post("/admin/design-lab/projects/:id/directions", async (req, res) => {
  if (!validId(req.params.id))
    return res.status(400).json({ message: "ID invalide." });
  try {
    const startedAt = Date.now();
    const project = await lockedProject(
      req.params.id,
      "directions",
      "analyzing",
      async (project) => {
        validateDirectionVersions(project.directions);
        const portfolioSummary = await portfolioFor(project);
        const references = selectReferences(
          project,
          await DesignReference.find({ active: true }).lean(),
          8,
          portfolioSummary,
        );
        project.selectedReferences = references.map((ref) => ref._id);
        const directions = await openai.generateDirectionsV2(project, references, {
          ...await directionCheckpointOptions(project),
          portfolioSummary,
          onStage: (stage) => setDirectionStage(project, stage),
        });
        promoteDirectionSet(project, directions, directions[0]?.generationId);
        consumeDirectionCheckpoint(project);
        project.status = "directions_ready";
        return project;
      },
    );
    // The three directions are committed together by lockedProject before this
    // ancillary usage counter is updated. A counter failure must not discard them.
    try {
      await DesignReference.updateMany(
        { _id: { $in: project.selectedReferences } },
        { $inc: { useCount: 1 } },
      );
    } catch (error) {
      console.warn("[design-lab] directions:reference_usage_update_failed", {
        projectId: String(project._id),
      });
    }
    console.info("[design-lab] directions:completed", { projectId: String(project._id), directionCount: activeDirections(project).length,
      generationId: activeDirections(project)[0]?.generationId, slots: activeDirections(project).map(({ slot, version }) => ({ slot, version })), elapsedMs: Date.now() - startedAt });
    res.json({ project });
  } catch (error) {
    errorResponse(res, error);
  }
});

router.post(
  "/admin/design-lab/projects/:id/directions/:directionId/regenerate",
  async (req, res) => {
    if (!validId(req.params.id) || !validId(req.params.directionId))
      return res.status(400).json({ message: "ID invalide." });
    try {
      const startedAt = Date.now();
      const project = await lockedProject(
        req.params.id,
        "direction",
        "analyzing",
        async (project) => {
          const portfolioSummary = await portfolioFor(project);
          validateDirectionVersions(project.directions);
          const old = requireActiveDirection(project, req.params.directionId);
          const references = selectReferences(
            project,
            await DesignReference.find({ active: true }).lean(),
            8,
            portfolioSummary,
          );
          if (old.engineVersion !== "v2")
            throw Object.assign(new Error("Direction d'un ancien moteur non prise en charge."), { status: 409 });
          const [replacement] = await openai.generateDirectionsV2(
            project,
            references,
            {
              ...await directionCheckpointOptions(project),
              count: 1,
              targetSlot: old.slot,
              replacesDirectionId: String(old._id),
              portfolioSummary,
              avoid: activeDirections(project)
                .map((direction) => `${direction.name}: ${direction.concept}`)
                .slice(-5),
              onStage: (stage) => setDirectionStage(project, stage),
            },
          );
          promoteSingleDirection(project, old._id, replacement, replacement.generationId);
          consumeDirectionCheckpoint(project);
          project.status = "directions_ready";
          return project;
        },
      );
      console.info("[design-lab] directions:completed", { projectId: String(project._id), directionCount: activeDirections(project).length,
        generatedCount: 1, replacement: activeDirections(project).filter((direction) => String(direction.replacesDirectionId) === req.params.directionId)
          .map(({ _id, slot, version, generationId, replacesDirectionId }) => ({ directionId: String(_id), slot, version, generationId, replacesDirectionId: String(replacesDirectionId) })),
        elapsedMs: Date.now() - startedAt });
      res.json({ project });
    } catch (error) {
      errorResponse(res, error);
    }
  },
);

router.delete("/admin/design-lab/projects/:id/directions-checkpoint", async (req, res) => {
  if (!validId(req.params.id)) return res.status(400).json({ message: "ID invalide." });
  try {
    const project = await SiteProject.findById(req.params.id);
    if (!project) return res.status(404).json({ message: "Projet introuvable." });
    assertProjectEditable(project);
    if (project.operation) throw Object.assign(new Error("Génération en cours."), { status: 409 });
    const result = await SiteProject.updateOne(
      { _id: project._id, operation: "", status: { $ne: "approved" }, approvedGeneration: null, approvedAt: null, approvedSnapshot: null },
      { $unset: { directionGenerationCheckpoint: "" } },
    );
    if (result.matchedCount !== 1) throw Object.assign(new Error("Projet modifié pendant l'abandon du checkpoint."), { status: 409 });
    res.json({ ok: true });
  } catch (error) { errorResponse(res, error); }
});

function styleFrameAction(mode) {
  return async (req, res) => {
    const context = { directionId: req.params.directionId, stage: "input" };
    try {
      if (!validId(req.params.id) || !validId(req.params.directionId) || (mode === "refine" && !validId(req.params.frameId)))
        throw Object.assign(new Error("ID invalide."), { status: 400 });
      const feedback = req.body?.feedback ?? "";
      if (typeof feedback !== "string" || feedback.length > 1500)
        throw Object.assign(new Error("Feedback invalide (1500 caractères maximum)."), { status: 400 });
      const recoveryId = mode === "recover" ? req.params.generationId : null;
      const retryGenerationId = req.body?.retryGenerationId;
      if ((recoveryId && !/^[a-f0-9-]{36}$/.test(recoveryId)) || (retryGenerationId && !/^[a-f0-9-]{36}$/.test(retryGenerationId)))
        throw Object.assign(new Error("Generation ID invalide."), { status: 400 });
      const operation = mode === "recover" ? "style-frame-recovery" : mode === "refine" ? "style-frame-refine" : "style-frame";
      const project = await lockedProject(req.params.id, operation, "generating", async (locked) => {
        const direction = requireActiveDirection(locked, req.params.directionId);
        if (String(locked.selectedDirection || "") !== String(direction._id))
          throw Object.assign(new Error("Sélectionnez cette direction avant de générer son Style Frame."), { status: 409 });
        let frame;
        if (mode === "recover") {
          frame = await styleFrames.recoverStyleFrame(locked, direction, recoveryId, context);
        } else {
          const currentFrame = mode === "refine" ? direction.styleFrames.id(req.params.frameId) : null;
          const referenceIds = (direction.visualSystem?.referenceAnchors || []).map((anchor) => anchor.referenceId);
          const references = await DesignReference.find({ _id: { $in: referenceIds } }).lean();
          const prepared = await styleFrames.prepareStyleFrame({ project: locked, direction, references, mode, currentFrame, feedback, retryGenerationId }, context);
          frame = await styleFrames.executeStyleFrame(prepared, context);
        }
        if (!direction.styleFrames.some((existing) => existing.generationId === frame.generationId)) direction.styleFrames.push(frame);
        locked.selectedDirection = direction._id;
        locked.status = "directions_ready";
        context.stage = "persistence";
        return locked;
      }, { preservePaidImages: true, onError: (error) => styleFrames.failAttempt(error, context) });
      await styleFrames.completeAttempt(context);
      res.json({ project });
    } catch (error) {
      errorResponse(res, error.styleFrame ? error : styleFrames.structuredError(error, context));
    }
  };
}
router.post("/admin/design-lab/projects/:id/directions/:directionId/style-frames", styleFrameAction("new_proposal"));
router.post("/admin/design-lab/projects/:id/directions/:directionId/style-frames/:frameId/refine", styleFrameAction("refine"));
router.post("/admin/design-lab/projects/:id/directions/:directionId/style-frame-attempts/:generationId/recover", styleFrameAction("recover"));

router.patch(
  "/admin/design-lab/projects/:id/directions/:directionId/style-frames/:frameId/approve",
  async (req, res) => {
    if (![req.params.id, req.params.directionId, req.params.frameId].every(validId))
      return res.status(400).json({ message: "ID invalide." });
    try {
      const project = await SiteProject.findById(req.params.id);
      if (!project) return res.status(404).json({ message: "Projet introuvable." });
      assertProjectEditable(project);
      if (project.operation) return res.status(409).json({ message: "Génération en cours." });
      const direction = requireActiveDirection(project, req.params.directionId);
      const frame = direction?.styleFrames.id(req.params.frameId);
      if (!frame)
        return res.status(404).json({ message: "Style Frame introuvable." });
      frame.approvedAt = new Date();
      direction.approvedStyleFrameId = frame._id;
      project.selectedDirection = direction._id;
      const selectedGeneration = project.generations.id(project.selectedGeneration);
      if (selectedGeneration && String(selectedGeneration.directionId) !== String(direction._id))
        project.selectedGeneration = null;
      await project.save();
      res.json({ project });
    } catch (error) {
      errorResponse(res, error);
    }
  },
);

function homepageAction(mode) {
  return async (req, res) => {
    const context = { stage: "input" };
    if (!validId(req.params.id) || !validId(req.params.directionId))
      return res.status(400).json({ message: "ID invalide." });
    if (mode !== "new" && !/^[a-f0-9-]{36}$/.test(req.params.generationId || ""))
      return res.status(400).json({ message: "Generation ID invalide." });
    try {
      const project = await lockedProject(
        req.params.id,
        "homepage",
        "generating",
        async (project) => {
          const direction = requireActiveDirection(project, req.params.directionId);
          const prepared = await homepages.prepare({ project, direction,
            generationId: mode === "new" ? null : req.params.generationId }, context);
          const generation = await homepages.execute(prepared, context, { allowGenerate: mode !== "recover",
            confirmUncertainRetry: req.body?.confirmUncertainRetry === true,
            onProgress: async () => {
              const result = await SiteProject.updateOne({ _id: project._id, operation: project.operation },
                { $set: { operationStartedAt: new Date() } });
              if (result.matchedCount !== 1) throw Object.assign(new Error("Verrou de génération perdu."), { status: 409 });
            },
          });
          homepages.promote(project, generation);
          if (prepared.alreadyPromoted) project.status = "exploration";
          context.stage = "persistence";
          project.$where = { operation: project.operation };
          return project;
        },
        { preservePaidImages: true, onError: (error) => homepages.fail(error, context) },
      );
      await homepages.complete(context);
      res.json({ project });
    } catch (error) {
      errorResponse(res, error);
    }
  };
}
router.post("/admin/design-lab/projects/:id/directions/:directionId/generations", homepageAction("new"));
router.post("/admin/design-lab/projects/:id/directions/:directionId/homepage-attempts/:generationId/resume", homepageAction("resume"));
router.post("/admin/design-lab/projects/:id/directions/:directionId/homepage-attempts/:generationId/recover", homepageAction("recover"));
router.delete("/admin/design-lab/projects/:id/homepage-attempts/:generationId", async (req, res) => {
  if (!validId(req.params.id) || !/^[a-f0-9-]{36}$/.test(req.params.generationId || ""))
    return res.status(400).json({ message: "ID invalide." });
  try {
    await lockedProject(req.params.id, "homepage-abandon", null, async (project) => {
      await homepages.abandon(project, req.params.generationId);
      return project;
    }, { preservePaidImages: true });
    res.json({ ok: true });
  } catch (error) { errorResponse(res, error); }
});

router.patch(
  "/admin/design-lab/projects/:id/directions/:directionId/select",
  async (req, res) => {
    if (!validId(req.params.id) || !validId(req.params.directionId))
      return res.status(400).json({ message: "ID invalide." });
    try {
      const project = await SiteProject.findById(req.params.id);
      if (!project) return res.status(404).json({ message: "Projet introuvable." });
      assertProjectEditable(project);
      requireActiveDirection(project, req.params.directionId);
      if (project.operation)
        return res.status(409).json({ message: "Génération en cours." });
      project.selectedDirection = req.params.directionId;
      const latest = [...project.generations]
        .reverse()
        .find(
          (generation) =>
            String(generation.directionId) === req.params.directionId,
        );
      project.selectedGeneration = latest?._id || null;
      await project.save();
      res.json({ project });
    } catch (error) {
      errorResponse(res, error);
    }
  },
);

router.post(
  "/admin/design-lab/projects/:id/generations/:generationId/variations",
  async (req, res) => {
    if (!validId(req.params.id) || !validId(req.params.generationId))
      return res.status(400).json({ message: "ID invalide." });
    const instruction = clean(req.body.instruction, 1200);
    if (!instruction)
      return res
        .status(400)
        .json({ message: "Instruction de variation requise." });
    try {
      const project = await lockedProject(
        req.params.id,
        "variation",
        "generating",
        async (project) => {
          const parent = project.generations.id(req.params.generationId);
          if (!parent)
            throw Object.assign(new Error("Génération introuvable."), {
              status: 404,
            });
          const direction = requireActiveDirection(project, parent.directionId);
          assertStyleFrameApproved(direction, parent.styleFrameId);
          await makeGeneration(project, direction, parent, instruction);
          return project;
        },
      );
      res.json({ project });
    } catch (error) {
      errorResponse(res, error);
    }
  },
);

router.patch("/admin/design-lab/projects/:id/selection", async (req, res) => {
  if (!validId(req.params.id) || !validId(req.body.generationId))
    return res.status(400).json({ message: "ID invalide." });
  try {
    const project = await SiteProject.findById(req.params.id);
    const generation = project?.generations.id(req.body.generationId);
    if (!generation)
      return res.status(404).json({ message: "Génération introuvable." });
    assertProjectEditable(project);
    requireActiveDirection(project, generation.directionId);
    if (project.operation)
      return res.status(409).json({ message: "Génération en cours." });
    project.selectedGeneration = generation._id;
    project.selectedDirection = generation.directionId;
    await project.save();
    res.json({ project });
  } catch (error) {
    errorResponse(res, error);
  }
});

router.post(
  "/admin/design-lab/projects/:id/generations/:generationId/approve",
  async (req, res) => {
    if (!validId(req.params.id) || !validId(req.params.generationId))
      return res.status(400).json({ message: "ID invalide." });
    try {
      const project = await SiteProject.findById(req.params.id);
      const generation = project?.generations.id(req.params.generationId);
      if (!generation)
        return res.status(404).json({ message: "Génération introuvable." });
      assertProjectEditable(project);
      if (project.operation)
        return res.status(409).json({ message: "Génération en cours." });
      const direction = requireActiveDirection(project, generation.directionId);
      const references = direction?.referencesUsed?.length
        ? await DesignReference.find({
            _id: { $in: direction.referencesUsed },
          })
            .select("name image visualTags analysis")
            .lean()
        : [];
      approveProject(project, generation, references);
      await project.save();
      res.json({ project });
    } catch (error) {
      errorResponse(res, error);
    }
  },
);

router.post("/admin/design-lab/projects/:id/reopen", async (req, res) => {
  if (!validId(req.params.id))
    return res.status(400).json({ message: "ID invalide." });
  try {
    const project = await SiteProject.findById(req.params.id);
    if (!project)
      return res.status(404).json({ message: "Projet introuvable." });
    if (project.operation)
      return res.status(409).json({ message: "Génération en cours." });
    reopenProject(project);
    await project.save();
    res.json({ project });
  } catch (error) {
    errorResponse(res, error);
  }
});

router.use((error, _req, res, _next) => {
  if (error instanceof multer.MulterError)
    return res
      .status(400)
      .json({ message: "Fichier trop volumineux (12 Mo max)." });
  errorResponse(res, error);
});

module.exports = router;
