const { randomUUID } = require("crypto");
const sharp = require("sharp");
const cloudinary = require("cloudinary").v2;
const StructuralReference = require("../../models/structural-reference.model");
const StructuralAnalysisAttempt = require("../../models/structural-analysis-attempt.model");
const { parseWebsiteUrl } = require("./existing-website.service");
const {
  publicAddress,
  capturePortfolioSite,
  requirePortfolioCaptureEnabled,
} = require("./portfolio-capture.service");
const {
  validateStructuralAnalysis,
  VIEW_TYPES,
  viewTypesForStrategy,
  captureForType,
  buildStructuralVisionRequest,
} = require("./structural-reference.contract");
const folders = require("./cloudinary-folders");
const {
  capturesAreClean,
  sanitizeStructuralCapture,
} = require("./capture-sanitization.service");
const {
  captureStructuralPage,
  coverageIsComplete,
} = require("./structural-page-capture.service");

const OPERATION_TTL_MS = 15 * 60 * 1000;
const fail = (message, status = 400) =>
  Object.assign(new Error(message), { status });
function manualTags(value) {
  if (
    !Array.isArray(value) ||
    value.length > 40 ||
    value.some((tag) => typeof tag !== "string" || tag.length > 80)
  )
    throw fail("Tags manuels invalides.");
  return [...new Set(value.map((tag) => tag.trim()).filter(Boolean))];
}
async function sourceFields(body, resolve = publicAddress) {
  if (body.sourceType && body.sourceType !== "manual_url")
    throw fail("Seules les URLs manuelles sont disponibles.");
  let url;
  try {
    url = parseWebsiteUrl(body.sourceUrl);
  } catch {
    throw fail("URL publique invalide (HTTP/HTTPS uniquement).");
  }
  await resolve(url.hostname);
  const title =
    typeof body.title === "string" && body.title.trim()
      ? body.title.trim().slice(0, 160)
      : url.hostname;
  return {
    title,
    sourceType: "manual_url",
    sourceUrl: url.href,
    originalSiteUrl: url.href,
    domain: url.hostname,
    slug: `${url.hostname.replace(/[^a-z0-9]+/gi, "-")}-${randomUUID()}`,
    manualTags: manualTags(body.manualTags || []),
  };
}

// Every view is encoded directly from the original PNG, never from another lossy view.
async function prepareStructuralViews(
  buffer,
  viewport = { width: 1440, height: 900 },
  capturedViews,
  viewPositions = {},
  captureCoverage = {},
) {
  const { width, height } = await sharp(buffer, {
    limitInputPixels: 80000000,
  }).metadata();
  if (!width || !height) throw fail("Capture vide ou illisible.", 422);
  if (capturedViews) {
    const types = viewTypesForStrategy(captureCoverage.captureStrategy, captureCoverage);
    return Promise.all(
      types.map(async (type) => {
        const original = ["desktop_full", "visionOverview"].includes(type)
          ? buffer
          : capturedViews[type];
        if (!Buffer.isBuffer(original))
          throw fail("Vue structurelle manquante.", 422);
        const sourceSize = await sharp(original, {
          limitInputPixels: 80000000,
        }).metadata();
        const { data, info } = await sharp(original, {
          limitInputPixels: 80000000,
        })
          .resize({
            width: ["overview", "visionOverview"].includes(type) ? 720 : 2000,
            withoutEnlargement: true,
          })
          .webp({
            quality: ["overview", "visionOverview"].includes(type) ? 80 : 85,
          })
          .toBuffer({ resolveWithObject: true });
        return {
          type,
          viewport,
          sourceRect: {
            left: 0,
            top: viewPositions[type] || 0,
            width: sourceSize.width,
            height: captureCoverage.positions?.find((p) => p.role === type)?.visibleRangePx
              ? captureCoverage.positions.find((p) => p.role === type).visibleRangePx[1] - viewPositions[type]
              : sourceSize.height,
          },
          width: info.width,
          height: info.height,
          progressPercent:
            captureCoverage.positions?.find((item) => item.role === type)
              ?.progressPercent ?? undefined,
          buffer: data,
          ...(/^observation[1-5]$/.test(type) ? { detail:
            (() => { const scores = captureCoverage.observationSelection?.selected?.find((s) => s.role === type)?.scores;
              return !scores || scores.L >= 0.25 || scores.D >= 0.25 ? "high" : "low"; })() } : {}),
        };
      }),
    );
  }
  const cropHeight = Math.min(1800, Math.ceil(height / 3));
  const rect = (top = 0, crop = height) => ({
    left: 0,
    top,
    width,
    height: crop,
  });
  const specs = [
    ["desktop_full", rect(), 2000, 85],
    ["visionOverview", rect(), 720, 80],
    ["top", rect(0, cropHeight), 2000, 85],
    [
      "middle",
      rect(Math.floor((height - cropHeight) / 2), cropHeight),
      2000,
      85,
    ],
    ["bottom", rect(height - cropHeight, cropHeight), 2000, 85],
  ];
  return Promise.all(
    specs.map(async ([type, sourceRect, maxWidth, quality]) => {
      const { data, info } = await sharp(buffer, { limitInputPixels: 80000000 })
        .extract(sourceRect)
        .resize({ width: maxWidth, withoutEnlargement: true })
        .webp({ quality })
        .toBuffer({ resolveWithObject: true });
      return {
        type,
        viewport,
        sourceRect,
        width: info.width,
        height: info.height,
        buffer: data,
      };
    }),
  );
}

function unlocked(now = new Date()) {
  return {
    $or: [
      { status: { $nin: ["capturing", "analyzing"] } },
      {
        operationStartedAt: { $lt: new Date(now.getTime() - OPERATION_TTL_MS) },
      },
    ],
  };
}
function createStructuralService(dependencies = {}) {
  const Model = dependencies.Model || StructuralReference;
  const AttemptModel = dependencies.AttemptModel || StructuralAnalysisAttempt;
  const logger = dependencies.logger || console;
  const capture = dependencies.capture || capturePortfolioSite;
  const analyze =
    dependencies.analyze ||
    require("./openai.service").analyzeStructuralReference;
  const upload =
    dependencies.upload || require("./design-lab.service").uploadImage;
  const destroy =
    dependencies.destroy || ((id) => cloudinary.uploader.destroy(id));
  const captureGate =
    dependencies.captureGate || requirePortfolioCaptureEnabled;
  const cleanup = (ids) => Promise.allSettled(ids.map((id) => destroy(id)));
  async function run(id, { reprocessAttemptId } = {}) {
    const token = randomUUID();
    let attempt;
    let processingAttempt = false;
    const saveAttempt = async (fields) => {
      const updated = await AttemptModel.findOneAndUpdate(
        { _id: attempt._id, referenceId: id }, { $set: fields }, { new: true },
      ).lean();
      if (!updated) throw fail("Checkpoint de réponse introuvable.", 409);
      attempt = updated;
    };
    let reference = await Model.findOneAndUpdate(
      { _id: id, ...unlocked() },
      {
        $set: {
          status: "analyzing",
          operationToken: token,
          operationStartedAt: new Date(),
          lastError: "",
        },
      },
      { new: false },
    ).lean();
    if (!reference)
      throw fail("Référence introuvable ou analyse déjà en cours.", 409);
    const owned = { _id: id, operationToken: token };
    const save = async (fields) => {
      const result = await Model.findOneAndUpdate(
        owned,
        { $set: fields },
        { new: true },
      ).lean();
      if (!result)
        throw fail("Cette opération a été interrompue ou remplacée.", 409);
      reference = result;
      return result;
    };
    try {
      if (reference.sourceType !== "manual_url")
        throw fail("Seules les URLs manuelles sont disponibles.");
      if (reprocessAttemptId) {
        attempt = await AttemptModel.findOne({ _id: reprocessAttemptId, referenceId: id }).lean();
        const identity = (captures) => JSON.stringify((captures || [])
          .map(({ type, url, sourceRect: r, viewport: v }) => [type, url, r?.left, r?.top, r?.width, r?.height, v?.width, v?.height])
          .sort((a, b) => a[0].localeCompare(b[0])));
        if (!attempt?.rawResponse && !attempt?.parsedResult)
          throw fail("Aucune réponse conservée à retraiter.", 409);
        if (identity(reference.captures) !== identity(attempt.captureSnapshot.captures)
          || reference.captureCoverage?.totalHeight !== attempt.captureSnapshot.metadata.captureCoverage?.totalHeight
          || !capturesAreClean(reference) || !coverageIsComplete(reference))
          throw fail("Les captures ont changé ou ne sont plus valides : retraitement refusé sans appel OpenAI.", 409);
      }
      if (
        !reprocessAttemptId && (
          !capturesAreClean(reference) ||
          !coverageIsComplete(reference) ||
          // Read/reprocess old captures as-is, but a new sampled analysis must
          // pass through today's selector, including its normal fixed fallback.
          (reference.captureCoverage?.captureStrategy === "sampled" && reference.captureCoverage.version !== 3) ||
          reference.captureCoverage?.overviewKind === "distributed_viewports" ||
          !viewTypesForStrategy(reference.captureCoverage?.captureStrategy, reference.captureCoverage).every(
            (type) => captureForType(reference.captures || [], type),
          )
        )
      ) {
        captureGate();
        await save({
          status: "capturing",
          captureSanitization: null,
          captureCoverage: null,
        });
        const result = await capture(reference.sourceUrl, {
          singlePage: true,
          collectSpatialMetadata: true,
          beforeScreenshot: sanitizeStructuralCapture,
          capturePage: captureStructuralPage,
        });
        const page = result.pages?.[0];
        if (!page?.buffer) throw fail("Aucune capture exploitable.", 422);
        if (
          !capturesAreClean({ captureSanitization: page.captureSanitization })
        )
          throw fail("Capture non validée : analyse non lancée.", 422);
        if (!coverageIsComplete(page))
          throw Object.assign(
            fail("Capture incomplète — analyse non lancée.", 422),
            {
              code: "incomplete_page_capture",
              captureCoverage: page.captureCoverage || {
                version: 1,
                complete: false,
                reachedEnd: false,
                distinctViews: false,
              },
            },
          );
        if (page.captureCoverage.captureStrategy === "sampled" && page.captureCoverage.version !== 3)
          throw fail("Sélection sampled obsolète : observations du pipeline actuel requises avant analyse.", 422);
        const views = await prepareStructuralViews(
          page.buffer,
          page.localMetadata?.viewport,
          page.viewBuffers,
          page.viewPositions,
          page.captureCoverage,
        );
        const uploaded = [];
        try {
          for (const { buffer, ...view } of views) {
            const image = await upload(buffer, folders.structural(id), {
              format: "webp",
            });
            uploaded.push({ ...view, ...image });
          }
          const oldIds = (reference.captures || []).map(
            (image) => image.publicId,
          );
          await save({
            captures: uploaded,
            localMetadata: page.localMetadata || {},
            originalSiteUrl: page.url,
            status: "analyzing",
            captureSanitization: page.captureSanitization,
            captureCoverage: page.captureCoverage,
          });
          await cleanup(oldIds);
        } catch (error) {
          await cleanup(uploaded.map((image) => image.publicId));
          throw error;
        }
      }
      if (!capturesAreClean(reference) || !coverageIsComplete(reference))
        throw fail("Capture non validée : analyse non lancée.", 422);
      const metadata = { ...reference.localMetadata, captureCoverage: reference.captureCoverage };
      if (!attempt) {
        const { manifest } = buildStructuralVisionRequest(reference.captures, metadata);
        attempt = await AttemptModel.create({
          referenceId: id, generationId: token, status: "running",
          captureSnapshot: { captures: reference.captures, metadata, visionInput: manifest },
        });
      }
      processingAttempt = true;
      const result = reprocessAttemptId
        ? attempt.rawResponse
          ? require("./openai.service").parseStructuredResponse(attempt.rawResponse, "structural_reference_analysis")
          : attempt.parsedResult
        : await analyze(reference.captures, metadata, {
          visionInput: attempt.captureSnapshot.visionInput,
          onResponse: async (rawResponse) => saveAttempt({ rawResponse, status: "received", receivedAt: new Date() }),
        });
      await saveAttempt({ parsedResult: result });
      const analysis = validateStructuralAnalysis(result, attempt.captureSnapshot.metadata,
        attempt.captureSnapshot.captures, attempt.captureSnapshot.visionInput);
      await saveAttempt({ status: "validated", validationError: null });
      await save({
        analysis,
        analyzedAt: new Date(),
        status: "analyzed",
        lastError: "",
        operationToken: "",
        operationStartedAt: null,
      });
      await saveAttempt({ status: "applied", appliedAt: new Date() });
    } catch (error) {
      if (attempt && processingAttempt) {
        const validationFailed = ["invalid_structural_analysis", "incomplete_structural_analysis", "STRUCTURED_OUTPUT_PARSE_FAILED"].includes(error.code);
        const validationError = { message: error.message, code: error.code || null, ...error.validation };
        // A checkpoint-storage incident must not prevent unlocking the reference.
        await saveAttempt({ status: validationFailed ? "validation_failed" : "failed", validationError }).catch(() =>
          logger.warn?.("structural:checkpoint_status_failed", { generationId: attempt.generationId, referenceId: String(id) }),
        );
        if (validationFailed) logger.warn?.("structural:validation_failed", {
          generationId: attempt.generationId, referenceId: String(id), ...validationError,
        });
      }
      // Keep successfully persisted views and any previous valid analysis; a manual retry replaces only analysis.
      const message =
        error.name === "TimeoutError" ||
        /timed? ?out|timeout/i.test(error.message)
          ? "Délai de capture ou d’analyse dépassé. Réessayez manuellement."
          : error.status
            ? error.message.slice(0, 500)
            : "Échec de l’analyse structurelle. Réessayez manuellement.";
      const saved = await Model.findOneAndUpdate(
        owned,
        {
          $set: {
            status: [
              "blocked_by_overlay",
              "blocked_by_popup",
              "incomplete_page_capture",
            ].includes(error.code)
              ? error.code
              : "error",
            ...(error.captureSanitization
              ? { captureSanitization: error.captureSanitization }
              : {}),
            ...(error.captureCoverage
              ? { captureCoverage: error.captureCoverage }
              : {}),
            lastError: message,
            operationToken: "",
            operationStartedAt: null,
          },
        },
        { new: true },
      ).lean();
      if (!saved) throw error;
      reference = saved;
    }
    delete reference.operationToken;
    return reference;
  }
  async function listAttempts(id) {
    return AttemptModel.find({ referenceId: id }).select("-rawResponse -parsedResult -captureSnapshot").sort({ createdAt: -1 }).lean();
  }
  async function getAttempt(id, attemptId) {
    const attempt = await AttemptModel.findOne({ _id: attemptId, referenceId: id }).lean();
    if (!attempt) throw fail("Tentative introuvable.", 404);
    return attempt;
  }
  async function patch(id, body) {
    const fields = {};
    if (body.title !== undefined) {
      if (
        typeof body.title !== "string" ||
        !body.title.trim() ||
        body.title.length > 160
      )
        throw fail("Titre invalide.");
      fields.title = body.title.trim();
    }
    if (body.manualTags !== undefined)
      fields.manualTags = manualTags(body.manualTags);
    if (body.active !== undefined) {
      if (typeof body.active !== "boolean") throw fail("Activation invalide.");
      fields.active = body.active;
    }
    const reference = await Model.findOneAndUpdate(
      { _id: id, ...unlocked() },
      { $set: fields },
      { new: true, runValidators: true },
    ).lean();
    if (!reference)
      throw fail("Référence introuvable ou analyse en cours.", 409);
    delete reference.operationToken;
    return reference;
  }
  async function remove(id) {
    const reference = await Model.findOneAndDelete({
      _id: id,
      ...unlocked(),
    }).lean();
    if (!reference)
      throw fail("Référence introuvable ou analyse en cours.", 409);
    await cleanup((reference.captures || []).map((image) => image.publicId));
  }
  return { run, patch, remove, listAttempts, getAttempt, reprocess: (id, attemptId) => run(id, { reprocessAttemptId: attemptId }) };
}
module.exports = {
  createStructuralService,
  prepareStructuralViews,
  sourceFields,
  manualTags,
  OPERATION_TTL_MS,
  VIEW_TYPES,
};
