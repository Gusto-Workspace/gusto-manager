const express = require("express");
const mongoose = require("mongoose");
const cloudinary = require("cloudinary").v2;
const authenticateAdmin = require("../../middleware/authenticate-admin");
const { requireAdminRole } = require("../../middleware/authenticate-admin");
const GustoPortfolioSite = require("../../models/gusto-portfolio-site.model");
const {
  parseWebsiteUrl,
} = require("../../services/design-lab/existing-website.service");
const {
  publicAddress,
  portfolioCaptureEnabled,
} = require("../../services/design-lab/portfolio-capture.service");

const router = express.Router();
router.use("/admin/design-lab/portfolio", authenticateAdmin, requireAdminRole);
const validId = mongoose.isValidObjectId;
const fail = (res, error) =>
  res.status(error.status || 500).json({
    message: error.status ? error.message : "Erreur du Portfolio Gusto.",
  });
const clean = (value, max) =>
  typeof value === "string" ? value.trim().slice(0, max) : "";

async function fields(body, existing) {
  const name = clean(body.name ?? existing?.name, 120);
  let url;
  try {
    url = parseWebsiteUrl(body.url ?? existing?.url);
  } catch {
    throw Object.assign(
      new Error("URL publique Portfolio invalide (HTTP/HTTPS uniquement)."),
      { status: 400 },
    );
  }
  const slug = clean(body.slug ?? existing?.slug, 100).toLowerCase();
  const restaurantId =
    body.restaurantId === ""
      ? null
      : (body.restaurantId ?? existing?.restaurantId ?? null);
  if (
    !name ||
    (slug && !/^[a-z0-9]+(?:-[a-z0-9]+)*$/u.test(slug)) ||
    (restaurantId && !validId(restaurantId))
  )
    throw Object.assign(new Error("Nom, slug ou restaurantId invalide."), {
      status: 400,
    });
  if (!existing || body.url !== undefined) await publicAddress(url.hostname);
  return {
    name,
    url: url.href,
    slug,
    restaurantId,
    active:
      body.active === undefined
        ? (existing?.active ?? true)
        : body.active === true,
  };
}

router.get("/admin/design-lab/portfolio", async (_req, res) => {
  try {
    const sites = await GustoPortfolioSite.find()
      .sort({ updatedAt: -1 })
      .lean();
    res.json({ sites, portfolioCaptureEnabled: portfolioCaptureEnabled() });
  } catch (error) {
    fail(res, error);
  }
});
router.post("/admin/design-lab/portfolio", async (req, res) => {
  try {
    const site = await GustoPortfolioSite.create(await fields(req.body || {}));
    res.status(201).json({ site });
  } catch (error) {
    fail(res, error);
  }
});
router.get("/admin/design-lab/portfolio/:id", async (req, res) => {
  if (!validId(req.params.id))
    return res.status(400).json({ message: "ID invalide." });
  try {
    const site = await GustoPortfolioSite.findById(req.params.id);
    if (!site) return res.status(404).json({ message: "Site introuvable." });
    res.json({ site, portfolioCaptureEnabled: portfolioCaptureEnabled() });
  } catch (error) {
    fail(res, error);
  }
});
router.patch("/admin/design-lab/portfolio/:id", async (req, res) => {
  if (!validId(req.params.id))
    return res.status(400).json({ message: "ID invalide." });
  try {
    const site = await GustoPortfolioSite.findById(req.params.id);
    if (!site) return res.status(404).json({ message: "Site introuvable." });
    if (site.analyzing)
      return res.status(409).json({ message: "Analyse en cours." });
    const priorUrl = site.url;
    const oldImages = site.pages.map((page) => page.screenshot.publicId);
    Object.assign(site, await fields(req.body || {}, site));
    if (site.url !== priorUrl) {
      site.pages = [];
      site.visualProfile = null;
      site.captureStats = { discovered: 0, failed: 0 };
      site.analyzedAt = null;
      site.progress = { status: "idle", progress: 0 };
    }
    await site.save();
    if (site.url !== priorUrl)
      await Promise.allSettled(
        oldImages.map((id) => cloudinary.uploader.destroy(id)),
      );
    res.json({ site });
  } catch (error) {
    fail(res, error);
  }
});
router.delete("/admin/design-lab/portfolio/:id", async (req, res) => {
  if (!validId(req.params.id))
    return res.status(400).json({ message: "ID invalide." });
  try {
    const site = await GustoPortfolioSite.findOneAndDelete({
      _id: req.params.id,
      analyzing: false,
    });
    if (!site)
      return res
        .status(404)
        .json({ message: "Site introuvable ou analyse en cours." });
    await Promise.allSettled(
      site.pages.map((page) =>
        cloudinary.uploader.destroy(page.screenshot.publicId),
      ),
    );
    res.json({ deleted: true });
  } catch (error) {
    fail(res, error);
  }
});

router.post("/admin/design-lab/portfolio/:id/analyze", async (req, res) => {
  if (!portfolioCaptureEnabled())
    return res.status(403).json({
      message: "Les captures Portfolio sont désactivées dans cet environnement.",
    });
  if (!validId(req.params.id))
    return res.status(400).json({ message: "ID invalide." });
  try {
    const {
      replacePortfolioAnalysis,
      initialPortfolioProgress,
    } = require("../../services/design-lab/portfolio-analysis.service");
    const site = await GustoPortfolioSite.findOneAndUpdate(
      {
        _id: req.params.id,
        $or: [
          { analyzing: false },
          { analysisStartedAt: { $lt: new Date(Date.now() - 20 * 60 * 1000) } },
        ],
      },
      {
        $set: {
          analyzing: true,
          analysisStartedAt: new Date(),
          lastError: "",
          progress: initialPortfolioProgress(),
        },
      },
      { new: true },
    );
    if (!site)
      return res
        .status(409)
        .json({ message: "Site introuvable ou analyse déjà en cours." });
    res.status(202).json({ site });
    replacePortfolioAnalysis(site).catch((error) =>
      console.error("Portfolio analysis state update failed:", error),
    );
  } catch (error) {
    fail(res, error);
  }
});

router.post("/admin/design-lab/portfolio/:id/synthesize", async (req, res) => {
  if (!validId(req.params.id))
    return res.status(400).json({ message: "ID invalide." });
  try {
    const {
      replacePortfolioProfile,
      initialPortfolioProgress,
    } = require("../../services/design-lab/portfolio-analysis.service");
    const site = await GustoPortfolioSite.findOneAndUpdate(
      {
        _id: req.params.id,
        "pages.0": { $exists: true },
        $or: [
          { analyzing: false },
          { analysisStartedAt: { $lt: new Date(Date.now() - 20 * 60 * 1000) } },
        ],
      },
      { $set: {
        analyzing: true,
        analysisStartedAt: new Date(),
        lastError: "",
        progress: { ...initialPortfolioProgress(), currentStage: "synthesizing", progress: 85,
          message: "Synthèse du profil visuel global…" },
      } },
      { new: true },
    );
    if (!site)
      return res.status(409).json({ message: "Site sans pages analysées ou analyse déjà en cours." });
    res.status(202).json({ site });
    replacePortfolioProfile(site).catch((error) =>
      console.error("Portfolio profile state update failed:", error),
    );
  } catch (error) {
    fail(res, error);
  }
});

module.exports = router;
