const { randomUUID, createHash } = require("crypto");
const sharp = require("sharp");
const { performance } = require("node:perf_hooks");
const { createCaptureProfile } = require("./structural-capture-profile");
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
  ARTISTIC_CONTRACT_VERSION,
} = require("./structural-reference.contract");
const folders = require("./cloudinary-folders");
const {
  capturesAreClean,
  sanitizeStructuralCapture,
} = require("./capture-sanitization.service");
const {
  captureStructuralPage,
  coverageIsComplete,
  OBSERVATION_SEQUENCING,
} = require("./structural-page-capture.service");
const {visionInputsAreClean}=require("./structural-vision-cleanup.service");
const {inspectedMediaAreComplete}=require('./structural-media-evidence');
const {safeText,failureDiagnostic,operationMessage,uncertainPreviousCall,unresolvedVisionAttempt}=require('./structural-operation-diagnostic');

const OPERATION_TTL_MS = 15 * 60 * 1000;
const activeOperations = new Map();
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
  const productDiagnostics = dependencies.productDiagnostics || require("./structural-product-diagnostics").createProductDiagnostics({logger});
  const recoverOperations = require("./structural-operation-recovery.service").createStructuralOperationRecovery({
    Model, AttemptModel, ttlMs: OPERATION_TTL_MS, logger,
    isReferenceActive: id => [...activeOperations.values()].includes(String(id)),
  });
  const reconcileExpiredOperations = options => {
    if (dependencies.localCaptureOnly) return Promise.resolve({ recoveredReferences: [], interruptedAttempts: [] });
    return resumePendingVisionResponses(options).then(()=>recoverOperations(options));
  };
  const capture = dependencies.capture || capturePortfolioSite;
  const analyze = dependencies.analyze ||
    require("./openai.service").analyzeStructuralReference;
  const upload = dependencies.upload || require("./design-lab.service").uploadImage;
  const destroy = dependencies.destroy || ((id) => cloudinary.uploader.destroy(id));
  const captureGate =
    dependencies.captureGate || requirePortfolioCaptureEnabled;
  const cleanup = (ids) => Promise.allSettled(ids.map((id) => destroy(id)));
  // Product and dry-run share this entire pre-persistence path. Passive timings
  // never influence gates, selector decisions or deadlines; no benchmark input.
  async function captureAndPrepare(sourceUrl, onPhase = () => {}) {
    const profile = createCaptureProfile();
    const {createOriginalEvidenceArchive}=require('./structural-original-evidence');
    const evidenceId=randomUUID();
    const evidence=await createOriginalEvidenceArchive(require('node:path').join(
      dependencies.originalEvidenceRoot||require('node:path').resolve(__dirname,'../../diagnostics/structural-originals'),evidenceId),
      {sourceUrl,generationId:evidenceId});
    let phase='capture_configuration';
    const setPhase=value=>{phase=value;onPhase(value);};
    try {
    setPhase(phase);
    profile.phase("capture_browser");
    captureGate();
    const result = await profile.time("capture_browser", () => capture(sourceUrl, {
      singlePage: true, collectSpatialMetadata: true,
      beforeScreenshot: sanitizeStructuralCapture,
      capturePage: captureStructuralPage,
      onOriginalObservation:evidence.record,
      onStructuralPhase: setPhase,
    }));
    setPhase('capture_quality_validation');
    profile.phase("preparation");
    const page = result.pages?.[0];
    if (!page?.buffer) throw fail("Aucune capture exploitable.", 422);
    const originalEvidence=await evidence.finish(page);
    if (!capturesAreClean({ captureSanitization: page.captureSanitization }))
      throw fail("Capture non validée : analyse non lancée.", 422);
    if (!coverageIsComplete(page)) throw Object.assign(fail("Capture incomplète — analyse non lancée.", 422), {
      code: "incomplete_page_capture", captureCoverage: page.captureCoverage || {
        version: 1, complete: false, reachedEnd: false, distinctViews: false,
      },
    });
    if (page.captureCoverage.captureStrategy === "sampled" && page.captureCoverage.version !== 3)
      throw fail("Sélection sampled obsolète : observations du pipeline actuel requises avant analyse.", 422);
    if(!visionInputsAreClean(page.captureCoverage))throw Object.assign(fail("Images Vision non certifiées propres : analyse non lancée.",422),{code:"uncertified_vision_layer"});
    if(page.captureCoverage.paintEvidence?.complete!==true)throw Object.assign(fail('Peinture des captures non certifiée : analyse non lancée.',422),{code:'structural_empty_visual_capture'});
    if(!inspectedMediaAreComplete(page.captureCoverage))throw Object.assign(fail('Complétude des médias inspectés non certifiée : analyse non lancée.',422),{code:'structural_media_incomplete'});
    page.captureCoverage.originalEvidence=originalEvidence;
    setPhase('capture_image_preparation');
    const views = await profile.time("image_preparation", () => prepareStructuralViews(page.buffer, page.localMetadata?.viewport,
      page.viewBuffers, page.viewPositions, page.captureCoverage));
    return { page, views, pipelinePerformance: profile.snapshot() };
    } catch(error) {
      await evidence.fail(error);
      error.structuralPhase ||= phase;
      error.pipelinePerformance ||= profile.snapshot();
      throw error;
    }
  }
  async function execute(id, { reprocessAttemptId, resumeAttemptId, manualRetrieval=false, dryRun = false, sourceUrl, confirmUncertainVision = false } = {}) {
    if (dependencies.localCaptureOnly && !dryRun)
      throw fail("Service de capture locale : dry-run obligatoire, aucun accès distant autorisé.", 422);
    if (dryRun) {
      if (reprocessAttemptId) throw fail("Un dry-run exige une capture réelle neuve.");
      const { page, views, pipelinePerformance } = await captureAndPrepare(sourceUrl);
      const contractStarted = performance.now();
      const captures = views.map(({ buffer, ...view }) => ({ ...view,
        // Actual prepared image bytes, usable as a Vision input without upload.
        url: `data:image/webp;base64,${buffer.toString("base64")}`,
      }));
      const metadata = { ...page.localMetadata, captureCoverage: page.captureCoverage };
      const vision = buildStructuralVisionRequest(captures, metadata);
      pipelinePerformance.contractPreparationMs = performance.now() - contractStarted;
      return { dryRun: true, status: "ready_for_vision", stoppedBefore: "persistence_and_vision",
        sourceUrl: page.url || sourceUrl, captureCoverage: page.captureCoverage,
        captureSanitization: page.captureSanitization, resourceUsage: page.resourceUsage,
        capturePerformance: page.capturePerformance, pipelinePerformance,
        captureDiagnostics: page.captureDiagnostics,
        metadata, views, captures, vision };
    }
    try {if(!resumeAttemptId)await reconcileExpiredOperations({ referenceId: id });}
    catch(error){error.structuralPhase='operation_recovery';throw error;}
    let attempt=resumeAttemptId?await AttemptModel.findOne({_id:resumeAttemptId,referenceId:id}).lean():null;
    if(resumeAttemptId&&(!attempt||attempt.visionTransport?.mode!=='background'||!attempt.visionTransport.creationCommittedAt))
      throw fail('Aucune réponse background conservée à suivre ; aucun nouvel appel autorisé.',409);
    const token = resumeAttemptId?attempt.generationId:randomUUID();
    if(resumeAttemptId&&[...activeOperations.values()].includes(String(id)))return Model.findById(id).lean();
    const startedAt=Date.now();
    let phase='operation_acquire',visionState='not_started';
    let freshCapture = false;
    let processingAttempt = false;
    let analysisCommitted = false;
    let uncertainAttempts = [];
    let captureTrace = null;
    const saveAttempt = async (fields) => {
      const updated = await AttemptModel.findOneAndUpdate(
        { _id: attempt._id, referenceId: id, generationId: attempt.generationId,
          status: attempt.status, ...(attempt.updatedAt ? {updatedAt:attempt.updatedAt} : {}) },
        { $set: fields }, { new: true },
      ).lean();
      if (!updated) throw fail("Checkpoint de réponse introuvable.", 409);
      attempt = updated;
    };
    const resumeFilter=resumeAttemptId ? {_id:id,$or:[
      {status:'analyzing',operationToken:token},
      ...(manualRetrieval?[{status:'error',operationToken:'','operationDiagnostic.generationId':token}]:[]),
    ]} : {_id:id,...unlocked()};
    let reference = await Model.findOneAndUpdate(
      resumeFilter,
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
    activeOperations.set(token, String(id));
    const recordDiagnostic=event=>productDiagnostics?.(id,token,event);
    recordDiagnostic({startedAt:new Date().toISOString(),sourceUrl:reference.sourceUrl,status:"running",reprocessing:Boolean(reprocessAttemptId),resumingResponse:Boolean(resumeAttemptId)});
    const owned = { _id: id, operationToken: token };
    let inheritedUncertainty=uncertainPreviousCall(reference);
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
    // Transport lifecycle storage is separate from artistic validation. Whole
    // checkpoint CAS provides one creation and one tracking worker per attempt.
    const responseStore={
      load:async()=>{
        const current=await AttemptModel.findOne({_id:attempt._id,referenceId:id,generationId:attempt.generationId}).lean();
        if(!current)throw fail('Tentative de réponse introuvable.',409);
        attempt=current;return current.visionTransport||null;
      },
      compareAndSet:async(expected,next,visionRequest)=>{
        const current=await AttemptModel.findOne({_id:attempt._id,referenceId:id,generationId:attempt.generationId}).lean();
        if(!current||!['running','received','failed'].includes(current.status))return null;
        const updated=await AttemptModel.findOneAndUpdate({_id:current._id,referenceId:id,generationId:current.generationId,
          status:current.status,visionTransport:expected||null},{$set:{visionTransport:next,...(visionRequest?{visionRequest}:{})}},{new:true}).lean();
        if(!updated)return null;attempt=updated;return updated.visionTransport;
      },
      beforeRequest:async()=>{await save({operationStartedAt:new Date()});},
      archiveRawBody:async(rawResponseBody,providerHTTPMetadata)=>{
        const current=await AttemptModel.findOne({_id:attempt._id,referenceId:id,generationId:attempt.generationId}).lean();
        if(current?.rawResponse)return; // A stale queued body cannot erase a terminal body.
        if(!current)throw fail('Checkpoint brut introuvable.',409);
        attempt=current;
        await saveAttempt({rawResponseBody,providerHTTPMetadata});
      },
      readRawBody:async()=>{
        const current=await AttemptModel.findOne({_id:attempt._id,referenceId:id}).lean();return current?.rawResponseBody;
      },
      readRequest:async()=>{
        const current=await AttemptModel.findOne({_id:attempt._id,referenceId:id}).lean();return current?.visionRequest;
      },
      readTerminalResponse:async()=>{
        const current=await AttemptModel.findOne({_id:attempt._id,referenceId:id}).lean();
        let raw=current?.rawResponse;
        if(!raw&&current?.rawResponseBody)try{raw=JSON.parse(current.rawResponseBody);}catch{}
        return ['completed','failed','incomplete','cancelled'].includes(raw?.status)?raw:null;
      },
    };
    // Only a confirmed dispatch (or a received response) supersedes earlier
    // uncertainty. A failed local checkpoint before fetch cannot consume it.
    const resolveConfirmedUncertainty = async () => {
      if (!confirmUncertainVision) return;
      inheritedUncertainty=false;
      if(!uncertainAttempts.length)return;
      for (const previous of uncertainAttempts) await AttemptModel.findOneAndUpdate({
        _id:previous._id,referenceId:id,generationId:previous.generationId,
        visionUncertaintyResolution:previous.visionUncertaintyResolution ?? null,
      },{$set:{visionUncertaintyResolution:{confirmedByGenerationId:token,
        confirmedByAttemptId:String(attempt._id),confirmedAt:new Date()}}},{new:true}).lean();
      uncertainAttempts=[];
    };
    try {
      const history=await AttemptModel.find({referenceId:id}).select('generationId status rawResponse parsedResult visionTransport operationDiagnostic visionUncertaintyResolution observationTrace captureSnapshot').sort({createdAt:-1}).lean();
      uncertainAttempts=history.filter(unresolvedVisionAttempt);
      if(!reprocessAttemptId && !resumeAttemptId && !confirmUncertainVision && uncertainPreviousCall(reference,uncertainAttempts))
        throw Object.assign(fail('Le précédent appel Vision est incertain. Confirmez explicitement un nouvel appel payant ou inspectez les tentatives conservées.',409),{code:'STRUCTURAL_UNCERTAIN_VISION_CONFIRMATION_REQUIRED'});
      phase='source_validation';
      if (reference.sourceType !== "manual_url")
        throw fail("Seules les URLs manuelles sont disponibles.");
      if (reprocessAttemptId) {
        phase='reprocess_compatibility';
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
        !reprocessAttemptId && !resumeAttemptId && (
          !capturesAreClean(reference) ||
          !coverageIsComplete(reference) ||
          !visionInputsAreClean(reference.captureCoverage) ||
          reference.captureCoverage?.paintEvidence?.complete !== true ||
          !inspectedMediaAreComplete(reference.captureCoverage) ||
          // Read/reprocess old captures as-is, but a new sampled analysis must
          // pass through today's selector, including its normal fixed fallback.
          (reference.captureCoverage?.captureStrategy === "sampled" &&
            (reference.captureCoverage.version !== 3 || reference.captureCoverage.observationSelection?.sequencing !== OBSERVATION_SEQUENCING)) ||
          reference.captureCoverage?.overviewKind === "distributed_viewports" ||
          !viewTypesForStrategy(reference.captureCoverage?.captureStrategy, reference.captureCoverage).every(
            (type) => captureForType(reference.captures || [], type),
          )
        )
      ) {
        captureGate();
        await save({
          status: "capturing",
          ...(reference.analysis&&!reference.analysisCaptureSnapshot?{analysisCaptureSnapshot:{
            captures:reference.captures,metadata:reference.localMetadata,captureCoverage:reference.captureCoverage,
            captureSanitization:reference.captureSanitization,
          }}:{}),
        });
        const { page, views, pipelinePerformance } = await captureAndPrepare(reference.sourceUrl, value=>{phase=value;});
        freshCapture = true;
        captureTrace={...page.captureDiagnostics?.observationTrace,
          resourceAdmissions:page.captureDiagnostics?.resourceAdmissions ? {...page.captureDiagnostics.resourceAdmissions,
            events:page.captureDiagnostics.resourceAdmissions.events.slice(0,256),
            truncated:page.captureDiagnostics.resourceAdmissions.truncated||page.captureDiagnostics.resourceAdmissions.events.length>256}:null};
        recordDiagnostic({captureReused:false,capturePerformance:page.capturePerformance,pipelinePerformance,
          captureCoverage:page.captureCoverage,captureDiagnostics:page.captureDiagnostics,
          resourceUsage:page.resourceUsage,captureSanitization:page.captureSanitization});
        const uploaded = [];
        try {
          phase='capture_upload';
          for (const { buffer, ...view } of views) {
            const image = await upload(buffer, folders.structural(id), {
              format: "webp",
            });
            uploaded.push({ ...view, ...image });
          }
          const previousEvidence=reference.analysisCaptureSnapshot || (reference.analysis ? {
            captures:reference.captures,metadata:reference.localMetadata,captureCoverage:reference.captureCoverage,
            captureSanitization:reference.captureSanitization,
          }:null);
          const earlierAttempts=await AttemptModel.find({referenceId:id}).select('captureSnapshot').sort({createdAt:-1}).lean();
          const protectedIds=new Set([
            ...(previousEvidence?.captures||[]),...earlierAttempts.flatMap(a=>a.captureSnapshot?.captures||[]),
          ].map(c=>c.publicId));
          const oldIds=(reference.captures||[]).map(c=>c.publicId);
          phase='capture_persistence';
          await save({
            captures: uploaded,
            localMetadata: page.localMetadata || {},
            originalSiteUrl: page.url,
            status: "analyzing",
            captureSanitization: page.captureSanitization,
            captureCoverage: page.captureCoverage,
            analysisCaptureSnapshot:previousEvidence,
            retainedCaptureIds:[...new Set([...(reference.retainedCaptureIds||[]),...oldIds.filter(v=>protectedIds.has(v))])],
          });
          // Prior buffers may belong to a valid analysis or a durable response
          // checkpoint. Replacement never destroys their recovery evidence.
          await cleanup(oldIds.filter(v=>!protectedIds.has(v)));
        } catch (error) {
          await cleanup(uploaded.map((image) => image.publicId));
          throw error;
        }
      }
      if (!resumeAttemptId&&(!capturesAreClean(reference) || !coverageIsComplete(reference)))
        throw fail("Capture non validée : analyse non lancée.", 422);
      const metadata = resumeAttemptId?attempt.captureSnapshot.metadata:{ ...reference.localMetadata, captureCoverage: reference.captureCoverage };
      if (!attempt) {
        phase='vision_contract_preparation';
        const { manifest,analysisContract } = buildStructuralVisionRequest(reference.captures, metadata,undefined,
          {analysisVersion:dependencies.analysisContractVersion||ARTISTIC_CONTRACT_VERSION});
        if(!freshCapture) {
          const prior=history.find(a=>a.observationTrace&&JSON.stringify(a.captureSnapshot?.captures)===JSON.stringify(reference.captures));
          if(prior)captureTrace={...prior.observationTrace,captureTraceSourceGenerationId:prior.generationId};
        }
        recordDiagnostic({status:"prepared_for_vision",captureReused:!freshCapture,
          captures:reference.captures,visionInput:manifest,captureCoverage:reference.captureCoverage});
        phase='attempt_checkpoint';
        attempt = await AttemptModel.create({
          referenceId: id, generationId: token, status: "running",
          analysisContract,
          confirmedUncertainAttemptIds:confirmUncertainVision ? uncertainAttempts.map(a=>String(a._id)) : [],
          observationTrace:captureTrace?.version ? {...captureTrace,generationId:token,
            manifestHash:createHash('sha256').update(JSON.stringify(manifest)).digest('hex')} : null,
          captureSnapshot: { captures: reference.captures, metadata, visionInput: manifest },
        });
      }
      processingAttempt = true;
      phase=reprocessAttemptId?'response_parsing':'vision_request';
      const result = reprocessAttemptId
        ? attempt.rawResponse
          ? require("./openai.service").parseStructuredResponse(attempt.rawResponse, "structural_reference_analysis")
          : attempt.parsedResult
        : await analyze(resumeAttemptId?attempt.captureSnapshot.captures:reference.captures, metadata, {
          visionInput: attempt.captureSnapshot.visionInput,
          analysisContract:attempt.analysisContract||{version:1},
          responseStore,
          authorization:resumeAttemptId?undefined:{id:token,maximumCalls:1,capUSD:dependencies.visionBudgetUSD??.36},
          resumeOnly:Boolean(resumeAttemptId),manualRetrieval,
          onProgress: async (stage, value, details) => {
            if(stage==='request_started') {
              phase='vision_request';visionState='dispatching';
              await saveAttempt({visionTransport:{state:visionState,...value}});
            } else if(stage==='response_headers') {
              phase='vision_response_body';visionState='response_headers';
              await saveAttempt({visionTransport:{...attempt.visionTransport,state:visionState,...details}});
              await resolveConfirmedUncertainty();
            } else if(stage==='structured_parsing_started')phase='response_parsing';
            else if(stage==='structured_parsing_completed')phase='analysis_validation';
          },
          onResponse: async (rawResponse) => {
            phase='response_checkpoint';
            try { await saveAttempt({ rawResponse, status: "received", receivedAt: new Date() }); }
            catch (error) {
              // A recovery may have won the status CAS while a late response
              // arrived. Preserve its bytes without reviving a failed lease.
              const current=await AttemptModel.findOne({_id:attempt._id,referenceId:id}).lean();
              if(current?.status==='failed' && !current.rawResponse) {
                attempt=current;await saveAttempt({rawResponse,receivedAt:new Date()});
              }
              throw error;
            }
            visionState='response_checkpointed';
            await resolveConfirmedUncertainty();
          },
        });
      if(result.pendingVision) {
        // Return the acknowledgement to Express; startup/periodic reconciliation
        // follows this exact ID, without a browser connection or another POST.
        visionState='provider_pending';
        if(!resumeAttemptId&&attempt.visionTransport?.responseId) {
          await resolveConfirmedUncertainty();
          await save({visionConfirmationRequired:inheritedUncertainty||uncertainAttempts.length>0});
        }
        recordDiagnostic({status:'provider_pending',attemptId:String(attempt._id),responseId:attempt.visionTransport?.responseId,
          providerStatus:attempt.visionTransport?.providerStatus});
        delete reference.operationToken;
        return reference;
      }
      await saveAttempt({ parsedResult: result });
      phase='analysis_validation';
      const analysis = validateStructuralAnalysis(result, attempt.captureSnapshot.metadata,
        attempt.captureSnapshot.captures, attempt.captureSnapshot.visionInput,attempt.analysisContract?.version||1);
      await saveAttempt({ status: "validated", validationError: null });
      phase='analysis_persistence';
      await save({
        analysis,
        analyzedAt: new Date(),
        analysisApplication:{version:1,generationId:attempt.generationId,attemptId:String(attempt._id),operationToken:token,appliedAt:new Date()},
        visionConfirmationRequired:reprocessAttemptId||resumeAttemptId ? inheritedUncertainty||uncertainAttempts.some(a=>String(a._id)!==String(attempt._id)) : false,
        status: "analyzed",
        lastError: "",
        operationToken: "",
        operationStartedAt: null,
        operationDiagnostic:null,
        analysisCaptureSnapshot:{captures:reference.captures,metadata:reference.localMetadata,
          captureCoverage:reference.captureCoverage,captureSanitization:reference.captureSanitization},
      });
      analysisCommitted = true;
      await saveAttempt({ status: "applied", appliedAt: new Date(),
        ...(attempt.visionTransport?.mode==='background'?{visionTransport:{...attempt.visionTransport,trackingOwner:null,trackingLeaseUntil:null}}:{}) });
      recordDiagnostic({status:"applied",attemptId:String(attempt._id),analysis,finishedAt:new Date().toISOString()});
    } catch (error) {
      if(error.resumeExistingResponse&&attempt?.visionTransport?.responseId) {
        // GET transport interruption is recoverable. Do not turn it into a new
        // paid authorization or clear the existing provider/budget checkpoint.
        visionState='tracking_interrupted';
        const diagnostic=failureDiagnostic(error,{referenceId:id,generationId:token,phase:'vision_retrieval',startedAt,attempt,visionState});
        await saveAttempt({operationDiagnostic:diagnostic});
        await save({status:'analyzing',lastError:'Suivi OpenAI interrompu ; récupération de la même réponse en cours.',operationDiagnostic:diagnostic});
        delete reference.operationToken;return reference;
      }
      if(!analysisCommitted && phase==='analysis_persistence' && attempt) {
        const committed=await Model.findById(id).lean().catch(()=>null);
        const marker=committed?.analysisApplication;
        if(marker?.attemptId===String(attempt._id)&&marker.generationId===attempt.generationId&&marker.operationToken===token) {
          reference=committed;analysisCommitted=true;
        }
      }
      if(analysisCommitted) {
        // The immutable application marker is the authority. Leave the attempt
        // validated for idempotent recovery; never call an applied result failed.
        logger.warn?.('structural:application_finalization_pending',{referenceId:String(id),attemptId:String(attempt._id),code:error.code});
        recordDiagnostic({status:'finalization_pending',attemptId:String(attempt._id),finishedAt:new Date().toISOString()});
        delete reference.operationToken;
        return reference;
      }
      if(error.visionDispatched===true) await resolveConfirmedUncertainty().catch(()=>{});
      if(error.visionDispatched===false)visionState='not_started';
      if(error.code==='OPENAI_HTTP_ERROR'&&!error.providerOutcomeUnknown)visionState='rejected';
      else if(error.status===504&&phase.startsWith('vision')&&error.visionDispatched!==false)visionState='uncertain';
      if(error.code==='STRUCTURAL_UNCERTAIN_VISION_CONFIRMATION_REQUIRED')visionState='uncertain';
      if(error.providerOutcomeUnknown)visionState=attempt?.visionTransport?.responseId?'tracking_interrupted':'uncertain';
      const diagnostic=failureDiagnostic(error,{referenceId:id,generationId:token,phase,startedAt,attempt,visionState});
      if(error.mediaEvidence)diagnostic.mediaEvidence=error.mediaEvidence;
      diagnostic.checkpoint.capturesAvailable=Boolean(reference.captures?.length&&capturesAreClean(reference)&&coverageIsComplete(reference));
      logger.warn?.('structural:operation_failed',JSON.stringify(diagnostic));
      error.operationDiagnostic=diagnostic;
      recordDiagnostic({status:"failed",finishedAt:new Date().toISOString(),error:{code:diagnostic.code,message:diagnostic.message},
        operationDiagnostic:diagnostic,
        ...(error.capturePerformance?{capturePerformance:error.capturePerformance}:{}),
        ...(error.imageGateFailure?{imageGateFailure:error.imageGateFailure}:{}),
        ...(error.videoGateFailure?{videoGateFailure:error.videoGateFailure}:{}),
        ...(error.visionCleanliness?{visionCleanliness:error.visionCleanliness}:{}),
        ...(error.captureResourceDiagnostics?{captureResourceDiagnostics:error.captureResourceDiagnostics}:{}),
        ...(error.captureRuntime?{captureRuntime:error.captureRuntime}:{}),
        ...(error.captureCoverage?{captureCoverage:error.captureCoverage}:{})});
      if (!attempt && (error.animationIntegrity || error.captureTiming)) logger.warn?.("structural:capture_failed", JSON.stringify({
        occurredAt: new Date().toISOString(), generationId: token, referenceId: String(id),
        code: error.code || null, message: safeText(error.message), captureTiming: error.captureTiming,
        animationIntegrity: error.animationIntegrity,
        imageGateFailure: error.imageGateFailure,
        videoGateFailure: error.videoGateFailure,
        visionCleanliness: error.visionCleanliness,
        captureRuntime: error.captureRuntime,
      }));
      if (attempt && processingAttempt) {
        const validationFailed = ["invalid_structural_analysis", "incomplete_structural_analysis", "STRUCTURED_OUTPUT_PARSE_FAILED"].includes(error.code);
        const validationError = { message: safeText(error.message), code: diagnostic.code, ...error.validation };
        // A checkpoint-storage incident must not prevent unlocking the reference.
        await saveAttempt({ status: validationFailed ? "validation_failed" : phase==='analysis_persistence' ? 'validated' : "failed", validationError, operationDiagnostic:diagnostic }).catch(() =>
          logger.warn?.("structural:checkpoint_status_failed", { generationId: attempt.generationId, referenceId: String(id) }),
        );
        if (validationFailed) logger.warn?.("structural:validation_failed", {
          generationId: attempt.generationId, referenceId: String(id), ...validationError,
        });
      }
      // Keep successfully persisted views and any previous valid analysis; a manual retry replaces only analysis.
      const legacyMessage =
        error.name === "TimeoutError" ||
        /timed? ?out|timeout/i.test(error.message)
          ? "Délai de capture ou d’analyse dépassé. Réessayez manuellement."
          : error.status
            ? error.message.slice(0, 500)
            : "Échec de l’analyse structurelle. Réessayez manuellement.";
      const message=['manual_confirmation_required','resume_existing_response'].includes(diagnostic.recovery) ? operationMessage(diagnostic)
        : legacyMessage==='Échec de l’analyse structurelle. Réessayez manuellement.' ? operationMessage(diagnostic):legacyMessage;
      let saved;
      try { saved = await Model.findOneAndUpdate(
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
            ...(error.captureSanitization && !capturesAreClean(reference)
              ? { captureSanitization: error.captureSanitization }
              : {}),
            ...(error.captureCoverage && !coverageIsComplete(reference)
              ? { captureCoverage: error.captureCoverage }
              : {}),
            lastError: safeText(message,500),
            operationDiagnostic:diagnostic,
            visionConfirmationRequired:inheritedUncertainty || uncertainAttempts.length>0 || diagnostic.recovery==='manual_confirmation_required',
            operationToken: "",
            operationStartedAt: null,
          },
        },
        { new: true },
      ).lean(); } catch(stateError) {
        stateError.cause ||= error;
        stateError.operationDiagnostic=failureDiagnostic(stateError,{referenceId:id,generationId:token,
          phase:'failure_state_persistence',startedAt,attempt,visionState});
        logger.warn?.('structural:operation_failed',JSON.stringify(stateError.operationDiagnostic));
        throw stateError;
      }
      if (!saved) throw error;
      reference = saved;
    }
    finally { activeOperations.delete(token); }
    delete reference.operationToken;
    return reference;
  }
  async function run(id, options) {
    const startedAt=Date.now();
    try {return await execute(id,options);}
    catch(error) {
      if(!error.operationDiagnostic) {
        error.operationDiagnostic=failureDiagnostic(error,{referenceId:id,generationId:randomUUID(),
          phase:'operation_acquire',startedAt});
        logger.warn?.('structural:operation_failed',JSON.stringify(error.operationDiagnostic));
      }
      throw error;
    }
  }
  async function listAttempts(id) {
    const rows=await AttemptModel.find({ referenceId: id }).select('_id referenceId generationId status createdAt updatedAt receivedAt appliedAt interruption validationError operationDiagnostic visionTransport rawResponse rawResponseBody parsedResult captureSnapshot').sort({ createdAt: -1 }).lean();
    return rows.map(({rawResponse,rawResponseBody,visionRequest,parsedResult,captureSnapshot,...row})=>({...row,
      rawResponseAvailable:Boolean(rawResponse),parsedResultAvailable:Boolean(parsedResult),
      rawResponseBodyAvailable:Boolean(rawResponseBody),
      capturesAvailable:Boolean(captureSnapshot?.captures?.length)}));
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
    await cleanup([...new Set([...(reference.captures || []).map(image=>image.publicId),
      ...(reference.retainedCaptureIds||[]),...(reference.analysisCaptureSnapshot?.captures||[]).map(image=>image.publicId)])]);
  }
  async function resumePendingVisionResponses({referenceId}={}) {
    const rows=await AttemptModel.find({...(referenceId?{referenceId}:{}),status:{$in:['running','received']},
      'visionTransport.mode':'background'}).select('_id referenceId generationId visionTransport').lean();
    for(const row of rows) {
      if(row.visionTransport?.mode!=='background'||!row.visionTransport.creationCommittedAt||
        [...activeOperations.values()].includes(String(row.referenceId)))continue;
      const current=await Model.findById(row.referenceId).select('+operationToken').lean();
      if(current?.status!=='analyzing'||current.operationToken!==row.generationId)continue;
      try{await execute(row.referenceId,{resumeAttemptId:row._id});}
      catch(error){logger.warn?.('structural:response_resume_failed',{referenceId:String(row.referenceId),attemptId:String(row._id),code:error.code});}
    }
  }
  return { run, patch, remove, listAttempts, getAttempt, reconcileExpiredOperations,
    resume:(id,attemptId)=>run(id,{resumeAttemptId:attemptId,manualRetrieval:true}),
    resumePendingVisionResponses,
    reprocess: (id, attemptId) => run(id, { reprocessAttemptId: attemptId }) };
}
module.exports = {
  createStructuralService,
  prepareStructuralViews,
  sourceFields,
  manualTags,
  OPERATION_TTL_MS,
  VIEW_TYPES,
};
