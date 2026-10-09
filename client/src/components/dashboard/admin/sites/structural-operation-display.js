const phases={capture_configuration:'Configuration de capture',capture_dns:'Résolution du site',capture_browser_launch:'Démarrage du navigateur',
  capture_browser_context:'Initialisation du navigateur',capture_navigation:'Navigation',capture_warmup:'Chargement initial',
  capture_main_paint:'Visibilité du contenu',capture_sanitation:'Nettoyage des couches',capture_observations:'Parcours et observations',
  capture_quality_validation:'Contrôles de capture',capture_image_preparation:'Préparation des images',capture_upload:'Enregistrement des images',
  capture_persistence:'Sauvegarde des captures',vision_contract_preparation:'Préparation Vision',attempt_checkpoint:'Checkpoint avant Vision',
  vision_request:'Appel Vision',vision_retrieval:'Suivi de la réponse existante',vision_response_body:'Réception Vision',response_checkpoint:'Conservation de la réponse',response_parsing:'Lecture de la réponse',
  analysis_validation:'Validation de l’analyse',analysis_persistence:'Sauvegarde de l’analyse',operation_recovery:'Récupération après interruption',failure_state_persistence:'Sauvegarde de l’état après échec'};
function phaseLabel(value){return phases[value]||'Traitement structurel';}
function needsVisionConfirmation(reference){return reference?.visionConfirmationRequired===true||reference?.operationDiagnostic?.recovery==='manual_confirmation_required'||/Délai OpenAI dépassé/i.test(reference?.lastError||'');}
function responseIsRecoverable(attempt){return Boolean(attempt.rawResponseAvailable||attempt.parsedResultAvailable);}
function responseCanBeRetrieved(attempt){return attempt?.visionTransport?.mode==='background'&&
  /^resp_[A-Za-z0-9_-]{1,240}$/.test(attempt?.visionTransport?.responseId||'')&&!responseIsRecoverable(attempt);}
module.exports={phaseLabel,needsVisionConfirmation,responseIsRecoverable,responseCanBeRetrieved};
