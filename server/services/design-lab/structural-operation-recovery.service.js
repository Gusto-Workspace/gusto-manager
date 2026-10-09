// Lease reconciliation only: never captures, uploads, parses or calls a model.
const BUSY = ["capturing", "analyzing"];
const PENDING = ["running", "received", "validated"];
const CODE = "STRUCTURAL_OPERATION_INTERRUPTED";
const {failureDiagnostic}=require('./structural-operation-diagnostic');
function createStructuralOperationRecovery({ Model, AttemptModel, ttlMs,
  isReferenceActive = () => false, now = () => new Date(), logger = console }) {
  const expired = (reference, cutoff) => BUSY.includes(reference.status) &&
    (!reference.operationStartedAt || new Date(reference.operationStartedAt) < cutoff);
  async function interruptAttempt(attempt, at, reason) {
    if (!attempt || !PENDING.includes(attempt.status)) return null;
    return AttemptModel.findOneAndUpdate({ _id: attempt._id, referenceId: attempt.referenceId,
      status: attempt.status, updatedAt: attempt.updatedAt ?? null }, { $set: {
      status: "failed", interruptedAt: at,
      interruption: { code: CODE, reason, previousStatus: attempt.status,
        rawResponsePreserved: Boolean(attempt.rawResponse), parsedResultPreserved: Boolean(attempt.parsedResult) },
      operationDiagnostic:failureDiagnostic(Object.assign(new Error(reason),{code:CODE}),{
        referenceId:attempt.referenceId,generationId:attempt.generationId,phase:'operation_recovery',
        startedAt:new Date(attempt.updatedAt||at).getTime(),attempt,
        visionState:attempt.visionTransport?.state||'uncertain',
      }),
    } }, { new: true }).lean();
  }
  async function reconcile({ referenceId } = {}) {
    const at = now(), cutoff = new Date(at.getTime() - ttlMs);
    const recovered = [], interrupted = [];
    const scope = referenceId ? { _id: referenceId } : {};
    const finalize = async (reference, attempt) => {
      const marker=reference.analysisApplication;
      if(!marker || marker.generationId!==attempt?.generationId || marker.attemptId!==String(attempt?._id) ||
        attempt.status!=='validated') return false;
      const changed=await AttemptModel.findOneAndUpdate({_id:attempt._id,referenceId:attempt.referenceId,
        generationId:attempt.generationId,status:'validated',updatedAt:attempt.updatedAt ?? null},{$set:{
          status:'applied',appliedAt:marker.appliedAt,validationError:null,
        }},{new:true}).lean();
      return Boolean(changed);
    };
    // Finalize committed results even before the TTL: a new generation must
    // not supersede the only durable application witness for its predecessor.
    const appliedReferences=await Model.find({...scope,status:'analyzed'}).lean();
    for(const reference of appliedReferences) {
      if(!reference.analysisApplication)continue;
      const attempt=await AttemptModel.findOne({_id:reference.analysisApplication.attemptId,referenceId:reference._id}).lean();
      if(attempt)await finalize(reference,attempt);
    }
    const references = await Model.find({ ...scope, status: { $in: BUSY }, $or: [
      { operationStartedAt: { $lt: cutoff } }, { operationStartedAt: null },
    ] }).select("+operationToken").lean();
    for (const reference of references) {
      if (!expired(reference, cutoff) || isReferenceActive(String(reference._id))) continue;
      const attempt = reference.operationToken ? await AttemptModel.findOne({ referenceId: reference._id,
        generationId: reference.operationToken }).lean() : null;
      const responseAvailable = Boolean(attempt?.rawResponse || attempt?.parsedResult);
      const diagnostic=failureDiagnostic(Object.assign(new Error('Expired operation lease'),{code:CODE}),{
        referenceId:reference._id,generationId:reference.operationToken,phase:'operation_recovery',
        startedAt:new Date(reference.operationStartedAt||at).getTime(),attempt,
        visionState:attempt?attempt.visionTransport?.state||'uncertain':'not_started',
      });
      const saved = await Model.findOneAndUpdate({ _id: reference._id, status: reference.status,
        operationToken: reference.operationToken || { $in: [null, ""] },
        operationStartedAt: reference.operationStartedAt ?? null }, { $set: {
        status: "error", operationToken: "", operationStartedAt: null,
        operationDiagnostic:diagnostic,
        visionConfirmationRequired:reference.visionConfirmationRequired || diagnostic.recovery==='manual_confirmation_required',
        lastError: responseAvailable
          ? "Analyse interrompue après expiration du traitement. Une réponse conservée peut être retraitée sans nouvel appel Vision."
          : attempt ? "Analyse interrompue sans réponse conservée. L’appel Vision est incertain ; confirmation manuelle requise avant tout nouvel appel."
          : "Analyse interrompue après expiration du traitement. Aucune réponse exploitable conservée ; relance manuelle nécessaire.",
      } }, { new: true }).lean();
      if (!saved) continue; // A renewed lease / another generation won the race.
      recovered.push(String(reference._id));
      logger.warn?.('structural:operation_interrupted',JSON.stringify(diagnostic));
      try {
        const changed = await interruptAttempt(attempt, at, "expired_reference_lease");
        if (changed) interrupted.push(String(changed._id));
      } catch (error) {
        // Reference is already coherent. The orphan scan below / next sweep
        // can retry this checkpoint write without restoring its stale lease.
        logger.warn?.("structural:interruption_checkpoint_failed", { referenceId: String(reference._id), code: error.code });
      }
    }
    // Covers a crash between unlocking the reference and updating its attempt.
    // A fresh/in-process operation (including reprocessing an older attempt)
    // is never inferred to be interrupted from a historical generation ID.
    const attempts = await AttemptModel.find({ ...(referenceId ? { referenceId } : {}),
      status: { $in: PENDING }, updatedAt: { $lt: cutoff } })
      .select("_id referenceId generationId status updatedAt rawResponse parsedResult visionTransport captureSnapshot").sort({ updatedAt: 1 }).lean();
    for (const attempt of attempts) {
      if (isReferenceActive(String(attempt.referenceId))) continue;
      const reference = await Model.findById(attempt.referenceId).select("+operationToken").lean();
      if (!reference || BUSY.includes(reference.status)) continue;
      if(await finalize(reference,attempt))continue;
      const changed = await interruptAttempt(attempt, at, "orphaned_attempt_without_active_lease");
      if (changed) interrupted.push(String(changed._id));
    }
    return { recoveredReferences: recovered, interruptedAttempts: [...new Set(interrupted)] };
  }
  return reconcile;
}
function startStructuralOperationRecovery(reconcile, { intervalMs = 60000, trackingIntervalMs = 5000,
  followResponses, logger = console } = {}) {
  let running = false;
  const sweep = async () => {
    if (running) return;
    running = true;
    try { await reconcile(); }
    catch (error) { logger.warn?.("structural:lease_recovery_failed", { code: error.code, name: error.name }); }
    finally { running = false; }
  };
  const timer = setInterval(sweep, intervalMs);
  timer.unref?.();
  let tracking=false;
  const trackingTimer=followResponses ? setInterval(async()=>{
    if(tracking)return;
    tracking=true;
    try{await followResponses();}
    catch(error){logger.warn?.('structural:response_tracking_failed',{code:error.code,name:error.name});}
    finally{tracking=false;}
  },trackingIntervalMs) : null;
  trackingTimer?.unref?.();
  const ready = sweep();
  return { ready, stop: () => {clearInterval(timer);if(trackingTimer)clearInterval(trackingTimer);} };
}
module.exports = { createStructuralOperationRecovery, startStructuralOperationRecovery, CODE };
