const sharp = require("sharp");
const crypto = require("node:crypto");
const cloudinary = require("cloudinary").v2;
const GustoPortfolioSite = require("../../models/gusto-portfolio-site.model");
const openai = require("./openai.service");
const {
  capturePortfolioSite,
  requirePortfolioCaptureEnabled,
} = require("./portfolio-capture.service");
const { buildPortfolioEvidence, finalizePortfolioProfile } = require("./portfolio.service");
const { prepareUploadedRaster, uploadImage } = require("./design-lab.service");
const cloudinaryFolders = require("./cloudinary-folders");

function initialPortfolioProgress() {
  return {
    status: "running",
    currentStage: "preparing",
    currentPageIndex: 0,
    totalPages: 0,
    currentPageLabel: "",
    completedPages: 0,
    failedPages: 0,
    capturedPages: 0,
    progress: 0,
    message: "Préparation de la capture…",
  };
}

function nextPortfolioProgress(previous, event) {
  const state = { ...previous, ...event };
  const failed = state.currentStage !== "completed" &&
    (state.status === "failed" || state.currentStage === "failed");
  const total = Math.max(1, state.totalPages || 1);
  const settled = state.completedPages + state.failedPages;
  const stageProgress = {
    preparing: 0,
    discovering: 5,
    capturing_page: state.totalPages
      ? 10 + Math.floor((25 * state.capturedPages) / total)
      : 5,
    uploading_page: 35 + Math.floor((50 * settled) / total),
    analyzing_page: 35 + Math.floor((50 * settled) / total),
    synthesizing: 85,
    saving: 95,
    completed: 100,
    failed: Math.min(previous.progress, 99),
  }[state.currentStage];
  state.progress = failed
    ? Math.min(previous.progress, 99)
    : Math.max(previous.progress, stageProgress ?? previous.progress);
  if (state.currentStage === "completed") state.status = "completed";
  else if (failed) state.status = "failed";
  return state;
}

function failedPortfolioStep(progress) {
  const stages = {
    preparing: "préparation",
    discovering: "découverte des pages",
    capturing_page: "capture",
    uploading_page: "upload",
    analyzing_page: "analyse visuelle",
    synthesizing: "synthèse du profil visuel",
    saving: "enregistrement",
  };
  const step = stages[progress.currentStage] || "analyse";
  return progress.currentPageLabel
    ? `${step} de « ${progress.currentPageLabel} »`
    : step;
}

async function synthesizePortfolioPages(pages, synthesize = openai.synthesizePortfolioProfile) {
  if (!pages?.length) throw new Error("Aucune analyse de page Portfolio disponible.");
  const synthesized = await synthesize(pages, buildPortfolioEvidence(pages));
  return finalizePortfolioProfile(pages, synthesized);
}

async function analyzePortfolioSite(
  site,
  {
    capture = capturePortfolioSite,
    upload = uploadImage,
    analyze = openai.analyzePortfolioPage,
    synthesize = openai.synthesizePortfolioProfile,
    destroy = (id) => cloudinary.uploader.destroy(id),
    onProgress = async () => {},
  } = {},
) {
  requirePortfolioCaptureEnabled();
  const newImages = [];
  try {
    let capturedPages = 0;
    let failedCaptures = 0;
    await onProgress({ currentStage: "discovering", message: "Découverte des pages…" });
    const captured = await capture(site.url, {
      onPageStart: (page, index, total) => onProgress({
        currentStage: "capturing_page",
        currentPageIndex: index,
        totalPages: total,
        currentPageLabel: page.label || page.pageType,
        capturedPages,
        message: `Capture : ${page.label || page.pageType}`,
      }),
      onPage: (page, index, total) => {
        capturedPages += 1;
        return onProgress({
          currentStage: "capturing_page",
          currentPageIndex: index,
          totalPages: total,
          currentPageLabel: page.label || page.pageType,
          capturedPages,
          message: `Capture terminée : ${page.label || page.pageType}`,
        });
      },
      onDiscovered: (total) => onProgress({
        currentStage: "capturing_page",
        totalPages: total,
        capturedPages,
        message: `${total} pages à traiter`,
      }),
      onPageError: (page, index, total) => {
        capturedPages += 1;
        failedCaptures += 1;
        return onProgress({
          currentStage: "capturing_page",
          currentPageIndex: index,
          totalPages: total,
          currentPageLabel: page.label || page.pageType,
          capturedPages,
          failedPages: failedCaptures,
          message: `Capture impossible : ${page.label || page.pageType}`,
        });
      },
    });
    const pages = [];
    let failedPages = captured.failures?.length || 0;
    let completedPages = 0;
    const totalPages = captured.discovered || captured.pages.length + failedPages;
    const seenScreenshots = new Set();
    for (const [index, page] of captured.pages.entries()) {
      let screenshot;
      const currentPageIndex = page.captureIndex || index + 1;
      const currentPageLabel = page.label || page.pageType;
      try {
        await onProgress({
          currentStage: "uploading_page", currentPageIndex, totalPages,
          currentPageLabel, completedPages, failedPages,
          message: `Optimisation et upload : ${currentPageLabel}`,
        });
        const digest = crypto
          .createHash("sha256")
          .update(page.buffer)
          .digest("hex");
        if (seenScreenshots.has(digest)) {
          completedPages += 1;
          await onProgress({
            currentStage: "uploading_page", completedPages, failedPages,
            message: `Capture identique ignorée : ${currentPageLabel}`,
          });
          continue;
        }
        const webp = await prepareUploadedRaster(
          { buffer: page.buffer, mimetype: "image/png" },
          { reference: true },
        );
        const dimensions = await sharp(webp).metadata();
        const image = await upload(
          webp,
          cloudinaryFolders.portfolio(site._id),
          { format: "webp" },
        );
        newImages.push(image.publicId);
        screenshot = {
          ...image,
          width: dimensions.width,
          height: dimensions.height,
        };
        await onProgress({
          currentStage: "analyzing_page",
          message: `Analyse visuelle : ${currentPageLabel}`,
        });
        const result = await analyze(image.url, page.pageType);
        pages.push({
          url: page.url,
          pathname: page.pathname,
          label: page.label,
          pageType: page.pageType,
          screenshot,
          visualTags: result.visualTags || [],
          analysis: result.analysis,
          analyzedAt: new Date(),
        });
        seenScreenshots.add(digest);
        completedPages += 1;
        await onProgress({
          currentStage: "analyzing_page", completedPages, failedPages,
          message: `Page terminée : ${currentPageLabel}`,
        });
      } catch (error) {
        if (page.pageType === "home") throw error;
        failedPages += 1;
        if (screenshot?.publicId) {
          await Promise.allSettled([destroy(screenshot.publicId)]);
          newImages.splice(newImages.indexOf(screenshot.publicId), 1);
        }
        await onProgress({
          currentStage: screenshot ? "analyzing_page" : "uploading_page",
          completedPages, failedPages,
          message: `Échec de la page : ${currentPageLabel}`,
        });
      }
    }
    if (!pages.length || pages[0].pageType !== "home")
      throw new Error("La homepage Portfolio n'a pas pu être analysée.");
    await onProgress({
      currentStage: "synthesizing", completedPages, failedPages,
      currentPageIndex: 0, currentPageLabel: "",
      message: "Synthèse du profil visuel global…",
    });
    const visualProfile = await synthesizePortfolioPages(pages, synthesize);
    await onProgress({ currentStage: "saving", message: "Enregistrement du Portfolio…" });
    return {
      pages,
      visualProfile,
      captureStats: { discovered: captured.discovered, failed: failedPages },
      analyzedAt: new Date(),
      newImages,
      failures: captured.failures,
      discovered: captured.discovered,
    };
  } catch (error) {
    await Promise.allSettled(newImages.map(destroy));
    throw error;
  }
}

async function replacePortfolioAnalysis(
  site,
  {
    analyze = analyzePortfolioSite,
    model = GustoPortfolioSite,
    destroy = (id) => cloudinary.uploader.destroy(id),
  } = {},
) {
  const filter = {
    _id: site._id,
    analyzing: true,
    analysisStartedAt: site.analysisStartedAt,
  };
  const oldImages = site.pages.map((page) => page.screenshot.publicId);
  let progress = initialPortfolioProgress();
  const onProgress = async (event) => {
    progress = nextPortfolioProgress(progress, event);
    try {
      await model.updateOne(filter, { $set: { progress } });
    } catch (error) {
      console.error("Portfolio progress update failed:", error);
    }
  };
  let result;
  try {
    result = await analyze(site, { onProgress });
    const completedProgress = nextPortfolioProgress(progress, {
      currentStage: "completed", message: "Analyse terminée",
    });
    const update = await model.updateOne(filter, {
      $set: {
        pages: result.pages,
        visualProfile: result.visualProfile,
        captureStats: result.captureStats,
        analyzedAt: result.analyzedAt,
        analyzing: false,
        analysisStartedAt: null,
        lastError: "",
        progress: completedProgress,
      },
    });
    await Promise.allSettled(
      (update.modifiedCount ? oldImages : result.newImages).map(destroy),
    );
    if (update.modifiedCount) progress = completedProgress;
    return Boolean(update.modifiedCount);
  } catch (error) {
    if (result) await Promise.allSettled(result.newImages.map(destroy));
    progress = nextPortfolioProgress(progress, {
      status: "failed",
      message: `Échec pendant : ${failedPortfolioStep(progress)}`,
    });
    await model.updateOne(filter, {
      $set: {
        analyzing: false,
        analysisStartedAt: null,
        lastError: error.message,
        progress,
      },
    });
    return false;
  }
}

async function replacePortfolioProfile(
  site,
  { synthesize = openai.synthesizePortfolioProfile, model = GustoPortfolioSite } = {},
) {
  const filter = {
    _id: site._id,
    analyzing: true,
    analysisStartedAt: site.analysisStartedAt,
  };
  const progress = nextPortfolioProgress(initialPortfolioProgress(), {
    currentStage: "synthesizing",
    message: "Synthèse du profil visuel global…",
  });
  try {
    await model.updateOne(filter, { $set: { progress } });
    const visualProfile = await synthesizePortfolioPages(site.pages, synthesize);
    const completed = nextPortfolioProgress(progress, {
      currentStage: "completed",
      message: "Profil visuel actualisé",
    });
    const update = await model.updateOne(filter, { $set: {
      visualProfile,
      analyzing: false,
      analysisStartedAt: null,
      lastError: "",
      progress: completed,
    } });
    return Boolean(update.modifiedCount);
  } catch (error) {
    const failed = nextPortfolioProgress(progress, {
      status: "failed",
      message: "Échec de la synthèse du profil visuel",
    });
    await model.updateOne(filter, { $set: {
      analyzing: false,
      analysisStartedAt: null,
      lastError: error.message,
      progress: failed,
    } });
    return false;
  }
}

module.exports = {
  analyzePortfolioSite,
  replacePortfolioAnalysis,
  replacePortfolioProfile,
  synthesizePortfolioPages,
  initialPortfolioProgress,
  nextPortfolioProgress,
};
