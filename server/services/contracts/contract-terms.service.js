const DEFAULT_EARLY_TERMINATION = Object.freeze({
  enabled: false,
  minimumCommitmentMonths: 12,
  noticeMonths: 3,
});

// Version 1 corresponds to historical snapshots, which did not carry an
// explicit contractual template version. Never infer a newer version from an
// absent field: sent and signed legacy contracts must keep their original PDF.
const CURRENT_CONTRACT_TERMS_VERSION = 2;
const WEBSITE_OWNERSHIP_TERMS_VERSION = 2;

const MAX_CONTRACT_TERM_MONTHS = 120;

function hasWebsiteOwnershipTerms(documentData = {}) {
  return (
    Number(documentData.contractTermsVersion) >= WEBSITE_OWNERSHIP_TERMS_VERSION
  );
}

function frenchInteger(value) {
  const number = Number(value);
  const units = [
    "zéro",
    "un",
    "deux",
    "trois",
    "quatre",
    "cinq",
    "six",
    "sept",
    "huit",
    "neuf",
    "dix",
    "onze",
    "douze",
    "treize",
    "quatorze",
    "quinze",
    "seize",
  ];
  if (!Number.isInteger(number) || number < 0 || number > 120) {
    return String(value);
  }
  if (number <= 16) return units[number];
  if (number < 20) return `dix-${units[number - 10]}`;
  if (number < 70) {
    const tens = {
      20: "vingt",
      30: "trente",
      40: "quarante",
      50: "cinquante",
      60: "soixante",
    };
    const base = Math.floor(number / 10) * 10;
    const remainder = number % 10;
    if (!remainder) return tens[base];
    return `${tens[base]}${remainder === 1 ? " et " : "-"}${units[remainder]}`;
  }
  if (number < 80) {
    const remainder = number - 60;
    return `soixante${remainder === 11 ? " et " : "-"}${frenchInteger(remainder)}`;
  }
  if (number < 100) {
    const remainder = number - 80;
    if (!remainder) return "quatre-vingts";
    return `quatre-vingt-${frenchInteger(remainder)}`;
  }
  if (number === 100) return "cent";
  return `cent ${frenchInteger(number - 100)}`;
}

function formatMonthsWithNumber(value) {
  const number = Number(value);
  return `${frenchInteger(number)} (${number}) mois`;
}

function buildContractDurationCopy(documentData = {}) {
  const engagementMonths =
    positiveIntegerOrDefault(documentData.engagementMonths, 24) || 24;
  const hasExplicitEarlyTermination = Object.prototype.hasOwnProperty.call(
    documentData,
    "earlyTermination",
  );
  const earlyTermination = normalizeEarlyTermination(
    documentData.earlyTermination,
  );
  const earliestTerminationMonths =
    earlyTermination.minimumCommitmentMonths + earlyTermination.noticeMonths;

  if (!hasExplicitEarlyTermination) {
    return {
      legacy: true,
      engagementMonths,
      earlyTermination,
      earliestTerminationMonths: null,
      financialDurationText: `Durée d’engagement : ${engagementMonths} mois à compter du premier prélèvement effectif de l’abonnement`,
      durationParagraphs: [
        `Le présent contrat est conclu pour une durée ferme de ${engagementMonths} mois à compter du premier prélèvement effectif de l’abonnement. Aucune résiliation anticipée n’est possible durant cette période. À l’issue de l’engagement, le Client peut résilier à tout moment par écrit. La résiliation prendra effet à la fin du mois en cours. En cas de résiliation anticipée non autorisée, le Prestataire se réserve le droit de facturer les mensualités restantes.`,
      ],
    };
  }

  if (!earlyTermination.enabled) {
    return {
      legacy: false,
      engagementMonths,
      earlyTermination,
      earliestTerminationMonths: null,
      financialDurationText: `Durée d’engagement : ${engagementMonths} mois à compter du premier prélèvement effectif de l’abonnement`,
      durationParagraphs: [
        `Le présent contrat est conclu pour une durée ferme de ${formatMonthsWithNumber(engagementMonths)} à compter du premier prélèvement effectif de l’abonnement.`,
      ],
    };
  }

  return {
    legacy: false,
    engagementMonths,
    earlyTermination,
    earliestTerminationMonths,
    financialDurationText: `Durée contractuelle : ${engagementMonths} mois à compter du premier prélèvement effectif de l’abonnement, sous réserve de la faculté de résiliation anticipée prévue à l’article relatif à la durée et à la résiliation`,
    durationParagraphs: [
      `Le présent contrat est conclu pour une durée contractuelle de ${formatMonthsWithNumber(engagementMonths)} à compter du premier prélèvement effectif de l’abonnement.`,
      "Faculté de résiliation anticipée",
      `Après une période minimale de ${formatMonthsWithNumber(earlyTermination.minimumCommitmentMonths)} révolus à compter du premier prélèvement effectif de l’abonnement, le Client peut demander la résiliation anticipée du présent contrat.`,
      `Cette demande devra être adressée au Prestataire par écrit, notamment par email, et sera soumise à un préavis de ${formatMonthsWithNumber(earlyTermination.noticeMonths)}. Le préavis commencera à courir à compter de la réception de la demande de résiliation par le Prestataire.`,
      `La demande de résiliation anticipée ne pourra être adressée qu’une fois écoulée la période minimale de ${formatMonthsWithNumber(earlyTermination.minimumCommitmentMonths)} d’abonnement. En conséquence, lorsque cette faculté est utilisée dès qu’elle devient disponible, la résiliation pourra prendre effet au plus tôt après ${formatMonthsWithNumber(earliestTerminationMonths)} d’abonnement.`,
      "Les mensualités correspondant à la période de préavis resteront dues. Aucune mensualité postérieure à la date effective de résiliation ne sera due, sous réserve du règlement des sommes éventuellement déjà exigibles.",
    ],
  };
}

function positiveIntegerOrDefault(value, fallback) {
  const parsed = Number(value);
  return Number.isInteger(parsed) &&
    parsed > 0 &&
    parsed <= MAX_CONTRACT_TERM_MONTHS
    ? parsed
    : fallback;
}

// Safe read fallback for drafts and immutable legacy snapshots. A missing or
// malformed value must never grant an early-termination right implicitly.
function normalizeEarlyTermination(value) {
  const minimumCommitmentMonths = positiveIntegerOrDefault(
    value?.minimumCommitmentMonths,
    DEFAULT_EARLY_TERMINATION.minimumCommitmentMonths,
  );
  const noticeMonths = positiveIntegerOrDefault(
    value?.noticeMonths,
    DEFAULT_EARLY_TERMINATION.noticeMonths,
  );
  const requestedEnabled = value?.enabled === true;

  return {
    enabled:
      requestedEnabled &&
      Number.isInteger(Number(value?.minimumCommitmentMonths)) &&
      Number(value.minimumCommitmentMonths) > 0 &&
      Number(value.minimumCommitmentMonths) <= MAX_CONTRACT_TERM_MONTHS &&
      Number.isInteger(Number(value?.noticeMonths)) &&
      Number(value.noticeMonths) > 0 &&
      Number(value.noticeMonths) <= MAX_CONTRACT_TERM_MONTHS,
    minimumCommitmentMonths,
    noticeMonths,
  };
}

function earlyTerminationFromContractState(contractData) {
  const source = contractData?.contractSnapshot || contractData || {};
  return normalizeEarlyTermination(source.earlyTermination);
}

function invalidTerms(message) {
  const error = new Error(message);
  error.statusCode = 400;
  return error;
}

function validateEarlyTermination(value, engagementMonths) {
  if (value?.enabled !== undefined && typeof value.enabled !== "boolean") {
    throw invalidTerms(
      "L'option de résiliation anticipée doit être activée ou désactivée explicitement.",
    );
  }

  const normalized = normalizeEarlyTermination(value);
  if (value?.enabled !== true) return normalized;

  const minimumCommitmentMonths = Number(value?.minimumCommitmentMonths);
  const noticeMonths = Number(value?.noticeMonths);
  if (
    !Number.isInteger(minimumCommitmentMonths) ||
    minimumCommitmentMonths <= 0 ||
    minimumCommitmentMonths > MAX_CONTRACT_TERM_MONTHS ||
    !Number.isInteger(noticeMonths) ||
    noticeMonths <= 0 ||
    noticeMonths > MAX_CONTRACT_TERM_MONTHS
  ) {
    throw invalidTerms(
      `La période minimale et le préavis doivent être des entiers compris entre 1 et ${MAX_CONTRACT_TERM_MONTHS} mois.`,
    );
  }

  const engagement = Number(engagementMonths);
  if (
    !Number.isInteger(engagement) ||
    engagement <= 0 ||
    engagement > MAX_CONTRACT_TERM_MONTHS
  ) {
    throw invalidTerms(
      `La durée d'engagement doit être un entier compris entre 1 et ${MAX_CONTRACT_TERM_MONTHS} mois.`,
    );
  }

  if (normalized.minimumCommitmentMonths >= engagement) {
    throw invalidTerms(
      "La période minimale doit être inférieure à la durée totale d'engagement.",
    );
  }

  if (
    normalized.minimumCommitmentMonths + normalized.noticeMonths >=
    engagement
  ) {
    throw invalidTerms(
      "La période minimale additionnée au préavis doit permettre une fin de contrat avant le terme de l'engagement.",
    );
  }

  return normalized;
}

module.exports = {
  CURRENT_CONTRACT_TERMS_VERSION,
  DEFAULT_EARLY_TERMINATION,
  MAX_CONTRACT_TERM_MONTHS,
  WEBSITE_OWNERSHIP_TERMS_VERSION,
  buildContractDurationCopy,
  earlyTerminationFromContractState,
  formatMonthsWithNumber,
  frenchInteger,
  hasWebsiteOwnershipTerms,
  normalizeEarlyTermination,
  validateEarlyTermination,
};
