const JOB_STATUS_LABELS = {
  scheduled: "Programmé",
  processing: "En cours",
  uncertain: "À vérifier",
  accepted: "Accepté",
  delivered: "Livré",
  failed: "Échec",
  cancelled: "Annulé",
  skipped: "Ignoré",
};

const BILLING_STATUS_LABELS = {
  not_required: "Non requise",
  pending: "En attente",
  reported: "Comptabilisée",
  uncertain: "À vérifier",
  failed: "Erreur",
};

const DIAGNOSTIC_LABELS = {
  invalid_reservation_datetime: "Date ou heure de réservation invalide",
  too_late: "Délai dépassé",
  eco_email: "E-mail prioritaire",
  reservation_not_confirmed: "Réservation non confirmée",
  feature_disabled: "Rappels SMS désactivés",
  reservation_rescheduled: "Réservation replanifiée",
  reservation_not_found: "Réservation introuvable",
  restaurant_not_found: "Restaurant introuvable",
  no_phone: "Numéro de téléphone absent ou invalide",
  international_disabled: "Envoi international désactivé",
  unsupported_destination: "Destination non prise en charge",
  subscription_inactive: "Abonnement SMS inactif",
  sender_not_approved: "Sender ID non approuvé",
  message_too_long: "Message trop long",
  budget_limit: "Plafond atteint",
  sending_disabled: "Envoi désactivé",
  stripe_usage_result_unknown: "Résultat de facturation à vérifier",
  stripe_usage_reporting: "Erreur de comptabilisation",
  provider_rejected: "Rejeté par l’opérateur",
  provider_result_unknown: "Résultat opérateur à vérifier",
  worker_crash_after_submission_started:
    "Traitement interrompu après soumission",
  provider_delivery_failed: "Échec de livraison",
  network_or_timeout: "Erreur réseau ou délai dépassé",
};

function humanizeTechnicalValue(value) {
  const normalized = String(value || "").trim();
  if (!normalized) return "—";
  if (/^\d+$/.test(normalized)) return `Code ${normalized}`;

  const readable = normalized
    .replace(/[_-]+/g, " ")
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .toLocaleLowerCase("fr-FR");
  return readable.charAt(0).toLocaleUpperCase("fr-FR") + readable.slice(1);
}

function labelFrom(mapping, value) {
  return mapping[value] || humanizeTechnicalValue(value);
}

export function formatSmsJobStatus(value) {
  return labelFrom(JOB_STATUS_LABELS, value);
}

export function formatSmsBillingStatus(value) {
  return labelFrom(BILLING_STATUS_LABELS, value);
}

export function formatSmsDiagnostic(value) {
  return labelFrom(DIAGNOSTIC_LABELS, value);
}
