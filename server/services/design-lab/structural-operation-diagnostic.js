// Bounded, allow-listed error metadata. Never serialize requests, keys or raw model output.
function safeText(value, limit=1600) {
  return String(value || '').replace(/Bearer\s+\S+/gi,'Bearer [redacted]')
    .replace(/\bsk-[\w-]+/g,'[redacted]')
    .replace(/([a-z][a-z0-9+.-]*:\/\/)[^\s/]+:[^\s/@]+@/gi,'$1[redacted]@')
    .replace(/(https?:\/\/[^\s?#]+)[?#][^\s]*/g,'$1[redacted-query]')
    .slice(0,limit);
}
function normalizedCode(error, phase) {
  if(error.code)return safeText(error.code,120);
  if(error.status===504 || error.name==='TimeoutError' || /timeout|timed out/i.test(error.message||''))
    return phase.startsWith('vision')?'OPENAI_TIMEOUT':'STRUCTURAL_TIMEOUT';
  return 'STRUCTURAL_'+phase.replace(/[^a-z0-9]+/gi,'_').toUpperCase()+'_FAILED';
}
function failureDiagnostic(error,{referenceId,generationId,phase,startedAt,attempt,visionState='not_started'}={}) {
  const chain=[],seen=new Set();let current=error;
  while(current && chain.length<5 && !seen.has(current)) {
    seen.add(current);chain.push({name:safeText(current.name,80),code:safeText(current.code,120)||null,
      message:safeText(current.message),...(current.status?{status:current.status}:{})});current=current.cause;
  }
  phase=error.structuralPhase||phase||'operation';
  const checkpoint={attemptId:attempt?String(attempt._id):null,status:attempt?.status||null,
    capturesAvailable:Boolean(attempt?.captureSnapshot?.captures?.length),rawResponseAvailable:Boolean(attempt?.rawResponse),
    parsedResultAvailable:Boolean(attempt?.parsedResult)};
  const state=checkpoint.rawResponseAvailable||checkpoint.parsedResultAvailable?'response_checkpointed':visionState;
  return {version:1,occurredAt:new Date().toISOString(),referenceId:String(referenceId||''),generationId,
    phase,code:normalizedCode(error,phase),message:safeText(error.message),causes:chain,
    elapsedMs:Date.now()-startedAt,remainingMs:error.captureTiming?.remainingMs??error.remainingMs??null,
    timeoutMs:error.timeoutMs??null,requestId:safeText(error.requestId,160)||null,httpStatus:error.httpStatus??null,
    responseId:safeText(error.responseId||attempt?.visionTransport?.responseId,256)||null,
    clientRequestId:safeText(error.clientRequestId||attempt?.visionTransport?.clientRequestId,160)||null,
    captureTiming:error.captureTiming||null,status:'failed',checkpoint,visionState:state,
    recovery:checkpoint.rawResponseAvailable||checkpoint.parsedResultAvailable?'reprocess_without_vision':
      attempt?.visionTransport?.responseId?'resume_existing_response':
      ['dispatching','response_headers','uncertain'].includes(state)?'manual_confirmation_required':'manual_retry'};
}
function operationMessage(diagnostic) {
  if(diagnostic.recovery==='reprocess_without_vision')return 'Traitement interrompu. Une réponse conservée peut être retraitée sans nouvel appel Vision.';
  if(diagnostic.recovery==='resume_existing_response')return 'Suivi OpenAI interrompu. La réponse identifiée peut être récupérée sans créer un nouvel appel payant, tant qu’elle est conservée par le fournisseur.';
  if(diagnostic.recovery==='manual_confirmation_required')return 'Appel Vision interrompu sans réponse conservée. Son traitement côté OpenAI est incertain ; aucune relance automatique. Vérifiez les tentatives avant de confirmer un nouvel appel payant.';
  return `Échec pendant ${['capture_upload','capture_persistence'].includes(diagnostic.phase)?'la sauvegarde des captures':diagnostic.phase.startsWith('capture')?'la capture':'le traitement structurel'} (${diagnostic.code}). Réessayez manuellement après vérification.`;
}
function unresolvedVisionAttempt(attempt) {
  return !attempt.rawResponse && !attempt.parsedResult && !attempt.visionUncertaintyResolution &&
    (attempt.visionTransport?.mode==='background'&&Boolean(attempt.visionTransport.creationCommittedAt)&&!['not_started','rejected'].includes(attempt.visionTransport.state) ||
      ['dispatching','response_headers','uncertain'].includes(attempt.visionTransport?.state) ||
      attempt.operationDiagnostic?.recovery==='manual_confirmation_required');
}
function uncertainPreviousCall(reference, attempts = []) {
  return attempts.some(unresolvedVisionAttempt) || reference?.visionConfirmationRequired === true ||
    reference?.operationDiagnostic?.recovery==='manual_confirmation_required' ||
    /Délai OpenAI dépassé/i.test(reference?.lastError||'');
}
module.exports={safeText,failureDiagnostic,operationMessage,uncertainPreviousCall,unresolvedVisionAttempt};
