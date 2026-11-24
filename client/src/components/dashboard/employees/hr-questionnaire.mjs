export const hrSteps = [
  ["clockRules", "Pointeuse", "Souhaitez-vous appliquer vos propres règles de calcul aux heures pointées ?",
    "Le restaurant souhaite-t-il appliquer ses propres règles de calcul aux heures pointées ?"],
  ["overtime", "Heures majorées", "Souhaitez-vous calculer vos heures supplémentaires, complémentaires et majorées dans Gusto ?",
    "Le restaurant souhaite-t-il calculer ses heures supplémentaires, complémentaires et majorées dans Gusto ?"],
  ["hoursRules", "Compteur d’heures", "Suivez-vous les heures à récupérer ou à compenser dans votre restaurant ?",
    "Le restaurant suit-il les heures à récupérer ou à compenser ?"],
  ["leaveRules", "Congés payés", "Souhaitez-vous suivre les congés acquis et pris dans votre restaurant ?",
    "Le restaurant souhaite-t-il suivre les congés acquis et pris dans Gusto ?"],
  ["absenceRules", "Absences", "Souhaitez-vous préciser qui indemnise les absences et quels repas restent dus dans votre restaurant ?",
    "Le restaurant souhaite-t-il préciser qui indemnise les absences et quels repas restent dus ?"],
  ["rules", "Repas", "Votre restaurant prévoit-il des repas, des indemnités, des titres-restaurant ou une prime panier ?",
    "Le restaurant prévoit-il des repas, des indemnités, des titres-restaurant ou une prime panier ?"],
];

export function recordedRuleVersions(active, scheduled = []) {
  return [
    ...(active ? [{ ...active, label: active.date === "-" ? "En vigueur" : `En vigueur depuis le ${active.date}` }] : []),
    ...scheduled.map((version) => ({ ...version, label: `Programmé le ${version.date}` })),
  ];
}

export function prefillFamily(kind, saved, prefill) {
  if (!saved || !prefill) return saved || prefill;
  const mode = saved.mode ?? prefill.mode;
  if (mode !== "on" || prefill.mode !== "on") return { ...saved, mode };
  const inherited = { ...prefill.answers };
  const changed = (key) => Object.hasOwn(saved.answers, key) && saved.answers[key].value !== inherited[key]?.value;
  if (kind === "rules") {
    if (changed("mode")) {
      delete inherited.basis;
      delete inherited.amount;
    }
    if (!inherited.basis || changed("basis")) {
      delete inherited.quantity;
      delete inherited.criteria;
    }
  }
  if (kind === "absenceRules" && Object.hasOwn(saved.answers, "categories")) delete inherited.reviewCategories;
  return { mode, answers: { ...inherited, ...saved.answers } };
}

const option = (value, label) => ({ value, label });
const yesNo = [option(true, "Oui"), option(false, "Non")];
const source = [option("planned", "L’heure prévue au planning"), option("clocked", "L’heure pointée")];
const rate = "optionalRate";
const q = (key, label, input) => ({ key, label, input });

const questions = {
  clockRules: [
    q("earlyIn", "Si le salarié arrive en avance, quelle heure retenir ?", source),
    q("lateIn", "Si le salarié arrive en retard, quelle heure retenir ?", source),
    q("earlyOut", "Si le salarié part en avance, quelle heure retenir ?", source),
    q("lateOut", "Si le salarié part plus tard, quelle heure retenir ?", source),
    q("roundMinutes", "Quel arrondi appliquer aux heures pointées ?", [0, 5, 10, 15, 30]
      .map((value) => option(value, value === 0 ? "Aucun arrondi" : `${value} minutes`))),
    q("pause", "Quand faut-il déduire la pause prévue au planning ?", [
      option("plannedFallback", "Quand aucune pause n’a été pointée ou que sa durée est nulle"),
      option("clocked", "Jamais, déduire uniquement les pauses pointées"),
      option("plannedMinimum", "Toujours déduire au moins la pause prévue"),
    ]),
  ],
  overtime: [
    q("source", "Quelles heures utiliser pour le rapport ?", [option("planning", "Planning uniquement"),
      option("validated", "Pointages validés uniquement"), option("hybrid", "Planning remplacé par les pointages validés")]),
    q("ordinary", "À partir de combien d’heures par semaine commencent les heures supplémentaires d’un temps plein ?", "number"),
    q("firstEnd", "À combien d’heures par semaine se termine la première tranche ?", "number"),
    q("firstRate", "Quel taux appliquer à la première tranche ?", "number"),
    q("secondEnd", "À combien d’heures par semaine se termine la deuxième tranche ?", "number"),
    q("secondRate", "Quel taux appliquer à la deuxième tranche ?", "number"),
    q("lastRate", "Quel taux s’applique au-delà de la deuxième tranche ?", "number"),
    q("complementBand", "Quelle part du contrat couvre la première tranche du temps partiel ?", "number"),
    q("complementFirstRate", "Quel taux s’applique à cette première tranche du temps partiel ?", "number"),
    q("complementLastRate", "Quel taux s’applique au-delà de cette tranche du temps partiel ?", "number"),
    q("workdays", "Combien de jours de référence compte la semaine ?", [5, 6, 7].map((value) => option(value, `${value} jours`))),
    q("weekdays", "Quels jours servent de référence au calcul ?", "weekdays"),
    q("paidLeaveDays", "Sur combien de jours calculer les congés en heures ?", [option(null, "Réglage du planning"),
      option(5, "5 jours"), option(6, "6 jours")]),
    q("creditedAbsences", "Quelles absences compter dans le seuil hebdomadaire ?", "absenceList"),
    q("planningAttribution", "Comment répartir un service sur deux jours au planning ?", [option(null, "Au jour civil"), option("shiftStart", "Au jour de début")]),
    q("nightRate", "Quel est le taux de majoration des heures de nuit en % ?", rate),
    q("nightStart", "À quelle heure commence la plage de nuit ?", "time"),
    q("nightEnd", "À quelle heure se termine la plage de nuit ?", "time"),
    q("plannedNightGross", "Compter la plage de nuit avant de déduire une pause planifiée sans horaires ?", yesNo),
    q("sundayRate", "Quel taux appliquer aux heures du dimanche en % ?", rate),
    q("holidayRate", "Quel taux appliquer aux heures des jours fériés en % ?", rate),
    q("countHolidays", "Afficher les heures fériées lorsque le taux reste vide ?", yesNo),
    q("structuralMonthly", "Mensualiser les heures supplémentaires prévues au contrat ?", yesNo),
  ],
  hoursRules: [
    q("start", "Quel est le premier lundi de suivi du compteur ?", "date"),
    q("enhanced", "Les majorations doivent-elles augmenter le nombre d’heures créditées ?", yesNo),
  ],
  leaveRules: [
    q("startMonth", "À partir de quel mois Gusto calcule-t-il les nouveaux droits ?", "month"),
    q("referenceMonth", "Quel mois commence le cycle annuel ?", Array.from({ length: 12 }, (_, index) =>
      option(index + 1, new Intl.DateTimeFormat("fr-FR", { month: "long", timeZone: "UTC" }).format(new Date(Date.UTC(2026, index, 1)))))),
    q("unit", "Comment décompter les jours de congés payés ?", [option("businessDays", "Jours ouvrables"), option("workdays", "Jours ouvrés")]),
    q("weekdays", "Quels jours décompter ?", "weekdays"),
    q("excludeHolidays", "Exclure les jours fériés du calendrier Gusto ?", yesNo),
    q("preserveCarry", "Conserver les jours acquis avant l’année précédente ?", yesNo),
    q("assimilated", "Quelles absences comptent pour l’acquisition ?", "absenceList"),
  ],
  absenceRules: [
    q("categories", "Qui indemnise chaque type d’absence et combien de repas restent dus ?", "absenceRules"),
    q("reviewCategories", "Les règles renseignées par type d’absence sont-elles confirmées ?", [option(true, "Confirmer le tableau")]),
  ],
  rules: [
    q("mode", "Quel mode d’indemnisation retenir ?", [option("combined", "Avantages en nature et indemnités"), option("indemnities", "Indemnités seules"),
      option("tickets", "Titres-restaurant"), option("basket", "Prime panier")]),
    q("basis", "Comment calculer les repas dus ?", [option("days", "Par jour travaillé"), option("service", "Selon les plages de repas d’un service"),
      option("monthly", "Forfait mensuel"), option("criteria", "Selon des conditions d’horaire ou de durée")]),
    q("quantity", "Combien de repas sont dus selon cette base ?", "number"),
    q("criteria", "Quels horaires ou durées ouvrent droit aux repas ?", "criteria"),
    q("amount", "Quelle valeur en euros a été confirmée ?", "mealAmount"),
  ],
};

export function questionsFor(kind, answers) {
  const value = (key) => answers[key]?.value;
  const mode = value("mode");
  const basis = value("basis");
  return questions[kind].filter(({ key }) => {
    if (kind === "overtime") {
      if (key === "planningAttribution") return value("source") === "planning";
      if (["nightStart", "nightEnd", "plannedNightGross"].includes(key)) return Number.isFinite(value("nightRate"));
    }
    if (kind !== "rules" || key === "mode") return true;
    if (key === "basis") return mode && mode !== "basket";
    if (key === "quantity") return mode !== "basket" && ["days", "monthly"].includes(basis);
    if (key === "criteria") return mode !== "basket" && basis === "criteria";
    return Boolean(mode);
  }).map((question) => kind === "rules" && mode === "basket" && question.key === "amount"
    ? { ...question, input: "number" }
    : question);
}
