const express = require("express");
const mongoose = require("mongoose");
const multer = require("multer");
const cloudinary = require("cloudinary").v2;
const crypto = require("crypto");
const authenticateAdmin = require("../../middleware/authenticate-admin");
const { requireAdminRole } = require("../../middleware/authenticate-admin");
const SiteProject = require("../../models/site-project.model");
const DesignReference = require("../../models/design-reference.model");
const openai = require("../../services/design-lab/openai.service");
const {
  selectReferences,
  uploadImage,
  downloadOwnImage,
  prepareUploadedRaster,
  uniqueTags,
  excludeTags,
  applyReferenceAnalysis,
} = require("../../services/design-lab/design-lab.service");

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
  });

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
  return {
    name,
    slug,
    restaurantId: body.restaurantId || null,
    brief,
    creativeSettings: settings,
  };
}

async function lockedProject(id, operation, status, task) {
  const token = `${operation}:${crypto.randomUUID()}`;
  const project = await SiteProject.findOneAndUpdate(
    {
      _id: id,
      $or: [
        { operation: "" },
        { operationStartedAt: { $lt: new Date(Date.now() - 10 * 60 * 1000) } },
      ],
    },
    {
      $set: {
        operation: token,
        operationStartedAt: new Date(),
        status,
        lastError: "",
      },
    },
    { new: true },
  );
  if (!project) {
    const exists = await SiteProject.exists({ _id: id });
    throw Object.assign(
      new Error(
        exists ? "Une génération est déjà en cours." : "Projet introuvable.",
      ),
      { status: exists ? 409 : 404 },
    );
  }
  const priorGenerationIds = new Set(
    project.generations.map((generation) => String(generation._id)),
  );
  try {
    const result = await task(project);
    if (!(await SiteProject.exists({ _id: id, operation: token })))
      throw Object.assign(new Error("Projet supprimé pendant la génération."), {
        status: 404,
      });
    project.operation = "";
    project.operationStartedAt = null;
    project.lastError = "";
    await project.save();
    return result || project;
  } catch (error) {
    const newImages = project.generations
      .filter((generation) => !priorGenerationIds.has(String(generation._id)))
      .map((generation) => generation.image?.publicId)
      .filter(Boolean);
    await Promise.allSettled(
      newImages.map((publicId) => cloudinary.uploader.destroy(publicId)),
    );
    const fallbackStatus = project.approvedGeneration
      ? "approved"
      : project.generations.length
        ? "exploration"
        : project.directions.length
          ? "directions_ready"
          : "brief_ready";
    await SiteProject.updateOne(
      { _id: id, operation: token },
      {
        $set: {
          operation: "",
          operationStartedAt: null,
          status: fallbackStatus,
          lastError: error.message,
        },
      },
    );
    throw error;
  }
}

function imagePrompt(project, direction, instruction = "") {
  return `Create a tall, complete DESKTOP RESTAURANT WEBSITE HOMEPAGE DESIGN MOCKUP, portrait canvas showing the web page from navbar and hero through several visually varied sections and optional footer. This is a website UI design, not a poster, moodboard, flyer or lifestyle photo. Restaurant: ${project.name}; ${project.brief.city || ""}; ${project.brief.restaurantType || ""}. Story: ${project.brief.story || project.brief.description || ""}. Positioning: ${project.brief.positioning || ""}. Art direction: ${direction.name}. ${direction.concept}. ${direction.artisticIntent}. Layout: ${direction.layoutPrinciples}. Typography: ${direction.typographyDirection}. Colors: ${direction.colorDirection}. Photography: ${direction.photographyDirection}. Signature elements: ${direction.signatureElements.join(", ")}. Section ideas: ${direction.sectionIdeas.join(", ")}. ${direction.imageGenerationPrompt}. ${openai.creativeInstructions(project.creativeSettings)}. Avoid centered generic hero, three-card grids, repeated alternating image/text blocks, uniform containers, rounded cards everywhere, decorative gradients and generic SaaS/WordPress styling. Keep navigation legible, reservation easily found and mobile adaptation plausible. Use supplied restaurant images as actual brand material where relevant; build around signature graphics if supplied. ${instruction}`.slice(
    0,
    11000,
  );
}

async function makeGeneration(project, direction, parent, instruction) {
  const chosen = project.assets
    .filter(
      (asset) =>
        asset.signature ||
        [
          "logo",
          "restaurantInterior",
          "restaurantExterior",
          "food",
          "chef",
        ].includes(asset.role),
    )
    .slice(0, parent ? 1 : 2);
  const imageSources = parent
    ? [parent.image, ...chosen.map((asset) => asset)]
    : chosen;
  const images = await Promise.all(
    imageSources.map((image) => downloadOwnImage(image)),
  );
  const prompt = imagePrompt(
    project,
    direction,
    parent
      ? `Edit the supplied existing homepage mockup faithfully. Preserve the established design direction and section identity while applying this requested change: ${instruction}.`
      : "",
  );
  const output = await openai.generateImage(prompt, images, {
    isVariation: Boolean(parent),
  });
  if (
    !(await SiteProject.exists({
      _id: project._id,
      operation: project.operation,
    }))
  )
    throw Object.assign(new Error("Projet supprimé pendant la génération."), {
      status: 404,
    });
  const image = await uploadImage(
    output.buffer,
    "gusto/design-lab/generations",
  );
  project.generations.push({
    directionId: direction._id,
    parentGenerationId: parent?._id || null,
    userPrompt: instruction || "",
    generatedPrompt: prompt,
    image,
    model: output.model,
  });
  const generation = project.generations[project.generations.length - 1];
  project.selectedDirection = direction._id;
  project.selectedGeneration = generation._id;
  project.status = "exploration";
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
      .json({ project: await SiteProject.create(validateProject(req.body)) });
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
    res.json({ project });
  } catch (error) {
    errorResponse(res, error);
  }
});

router.put("/admin/design-lab/projects/:id", async (req, res) => {
  if (!validId(req.params.id))
    return res.status(400).json({ message: "ID invalide." });
  try {
    const project = await SiteProject.findById(req.params.id);
    if (!project)
      return res.status(404).json({ message: "Projet introuvable." });
    if (project.operation)
      return res.status(409).json({ message: "Génération en cours." });
    Object.assign(project, validateProject(req.body, project));
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

router.delete("/admin/design-lab/projects/:id", async (req, res) => {
  if (!validId(req.params.id))
    return res.status(400).json({ message: "ID invalide." });
  try {
    const project = await SiteProject.findByIdAndDelete(req.params.id);
    if (!project)
      return res.status(404).json({ message: "Projet introuvable." });
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
      if (project.operation)
        return res.status(409).json({ message: "Génération en cours." });
      const role = clean(req.body.role, 40) || "other";
      const webpBuffer = await prepareUploadedRaster(req.file, {
        assetRole: role,
      });
      const image = await uploadImage(
        webpBuffer,
        `gusto/design-lab/projects/${project._id}/assets`,
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
      if (project.operation)
        return res.status(409).json({ message: "Génération en cours." });
      if (req.body.role !== undefined)
        asset.role = clean(req.body.role, 40) || "other";
      if (typeof req.body.signature === "boolean")
        asset.signature = req.body.signature;
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

router.post(
  "/admin/design-lab/references",
  upload.single("image"),
  async (req, res) => {
    if (!req.file)
      return res
        .status(400)
        .json({ message: "Image JPEG, PNG ou WebP requise (12 Mo max)." });
    try {
      const webpBuffer = await prepareUploadedRaster(req.file, {
        reference: true,
      });
      const image = await uploadImage(
        webpBuffer,
        "gusto/design-lab/references",
        { format: "webp" },
      );
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
      try {
        const result = await openai.analyzeReference(image.url);
        applyReferenceAnalysis(reference, result);
        reference.analyzedAt = new Date();
        await reference.save();
      } catch (error) {
        reference.lastError = error.message;
        await reference.save();
      }
      res.status(201).json({ reference });
    } catch (error) {
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
  try {
    const result = await openai.analyzeReference(reference.image.url);
    applyReferenceAnalysis(reference, result);
    reference.analyzedAt = new Date();
    reference.analyzing = false;
    reference.analysisStartedAt = null;
    await reference.save();
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
      if (project.operation)
        return res.status(409).json({ message: "Génération en cours." });
      const references = selectReferences(
        project,
        await DesignReference.find({ active: true }).lean(),
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
    const project = await lockedProject(
      req.params.id,
      "directions",
      "analyzing",
      async (project) => {
        const references = selectReferences(
          project,
          await DesignReference.find({ active: true }).lean(),
        );
        project.selectedReferences = references.map((ref) => ref._id);
        const directions = await openai.generateDirections(project, references);
        project.directions.push(...directions);
        project.status = "directions_ready";
        await DesignReference.updateMany(
          { _id: { $in: project.selectedReferences } },
          { $inc: { useCount: 1 } },
        );
        return project;
      },
    );
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
      const project = await lockedProject(
        req.params.id,
        "direction",
        "analyzing",
        async (project) => {
          const old = project.directions.id(req.params.directionId);
          if (!old)
            throw Object.assign(new Error("Direction introuvable."), {
              status: 404,
            });
          const references = selectReferences(
            project,
            await DesignReference.find({ active: true }).lean(),
          );
          const [replacement] = await openai.generateDirections(
            project,
            references,
            {
              count: 1,
              avoid: project.directions
                .map((direction) => `${direction.name}: ${direction.concept}`)
                .slice(-5),
            },
          );
          project.directions.push(replacement);
          project.status = "directions_ready";
          return project;
        },
      );
      res.json({ project });
    } catch (error) {
      errorResponse(res, error);
    }
  },
);

router.post(
  "/admin/design-lab/projects/:id/directions/:directionId/generations",
  async (req, res) => {
    if (!validId(req.params.id) || !validId(req.params.directionId))
      return res.status(400).json({ message: "ID invalide." });
    try {
      const project = await lockedProject(
        req.params.id,
        "image",
        "generating",
        async (project) => {
          const direction = project.directions.id(req.params.directionId);
          if (!direction)
            throw Object.assign(new Error("Direction introuvable."), {
              status: 404,
            });
          await makeGeneration(project, direction, null, "");
          return project;
        },
      );
      res.json({ project });
    } catch (error) {
      errorResponse(res, error);
    }
  },
);

router.patch(
  "/admin/design-lab/projects/:id/directions/:directionId/select",
  async (req, res) => {
    if (!validId(req.params.id) || !validId(req.params.directionId))
      return res.status(400).json({ message: "ID invalide." });
    try {
      const project = await SiteProject.findById(req.params.id);
      if (!project?.directions.id(req.params.directionId))
        return res.status(404).json({ message: "Direction introuvable." });
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
          const direction = parent && project.directions.id(parent.directionId);
          if (!direction)
            throw Object.assign(new Error("Génération introuvable."), {
              status: 404,
            });
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
      if (project.operation)
        return res.status(409).json({ message: "Génération en cours." });
      project.approvedGeneration = generation._id;
      project.selectedGeneration = generation._id;
      project.selectedDirection = generation.directionId;
      project.status = "approved";
      await project.save();
      res.json({ project });
    } catch (error) {
      errorResponse(res, error);
    }
  },
);

router.use((error, _req, res, _next) => {
  if (error instanceof multer.MulterError)
    return res
      .status(400)
      .json({ message: "Fichier trop volumineux (12 Mo max)." });
  errorResponse(res, error);
});

module.exports = router;
