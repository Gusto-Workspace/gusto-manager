const test=require('node:test'),assert=require('node:assert/strict');
const {phaseLabel,needsVisionConfirmation,responseIsRecoverable,responseCanBeRetrieved}=require('../src/components/dashboard/admin/sites/structural-operation-display');
test('timeout historique et appel incertain demandent confirmation ; réponse conservée propose uniquement le retraitement',()=>{
  assert.equal(needsVisionConfirmation({lastError:'Délai OpenAI dépassé. Réessayez.'}),true);
  assert.equal(needsVisionConfirmation({operationDiagnostic:{recovery:'manual_confirmation_required'}}),true);
  assert.equal(needsVisionConfirmation({operationDiagnostic:{recovery:'reprocess_without_vision'}}),false);
  assert.equal(needsVisionConfirmation({visionConfirmationRequired:true,operationDiagnostic:{recovery:'manual_retry'}}),true);
  assert.equal(responseIsRecoverable({rawResponseAvailable:true}),true);
  assert.equal(responseIsRecoverable({parsedResultAvailable:true}),true);
  assert.equal(responseIsRecoverable({status:'failed'}),false);
});
test('phase utilisateur précise sans exposer un libellé technique arbitraire',()=>{
  assert.equal(phaseLabel('capture_warmup'),'Chargement initial');
  assert.equal(phaseLabel('vision_response_body'),'Réception Vision');
  assert.equal(phaseLabel('vision_retrieval'),'Suivi de la réponse existante');
  assert.equal(phaseLabel('secret arbitrary value'),'Traitement structurel');
});
test('récupération uniquement avec un vrai identifiant background, sans inventer celui des timeouts historiques',()=>{
 assert.equal(responseCanBeRetrieved({visionTransport:{mode:'background',responseId:'resp_existing'}}),true);
 assert.equal(responseCanBeRetrieved({visionTransport:{mode:'background',clientRequestId:'uuid'}}),false);
 assert.equal(responseCanBeRetrieved({visionTransport:{mode:'background',responseId:'resp_/../../'}}),false);
 assert.equal(responseCanBeRetrieved({rawResponseAvailable:true,visionTransport:{mode:'background',responseId:'resp_existing'}}),false);
 assert.equal(responseCanBeRetrieved({visionTransport:{responseId:'resp_legacy'}}),false);
});
