import useDialogBackdrop from "../_shared/use-dialog-backdrop";
import { useEffect, useId, useRef, useState } from "react";
import axios from "axios";
import { X } from "lucide-react";
import { parisPlanningDateKey } from "./planning-grid.utils.mjs";
import { formatReportValue } from "./personnel-report.utils.mjs";
import frenchPlanning from "../../../../public/locales/fr/planning.json";

const control = "min-h-10 rounded-lg border border-darkBlue/20 bg-white px-3 text-sm";
const action = `${control} font-semibold hover:bg-lightGrey disabled:opacity-50`;
const modeOptions = { combined: "Avantages en nature et indemnités", indemnities: "Indemnités uniquement", tickets: "Titres-restaurant", basket: "Prime panier" };
const basisOptions = { service: "Plages de repas de Gusto", criteria: "Critères d’horaires et de durée", days: "Jours travaillés", monthly: "Nombre fixe par mois" };
const criterionFields = [
  ["start", "Début de plage", "time"], ["end", "Fin de plage", "time"],
  ["minimum", "Durée supérieure à (min)", "number"], ["maximum", "Durée inférieure à (min)", "number"],
];
const clockSources = { planned: "Horaire prévu", clocked: "Horaire pointé" };
const clockDefaults = { enabled: false, earlyIn: "clocked", lateIn: "clocked", earlyOut: "clocked",
  lateOut: "clocked", roundMinutes: 0, pause: "plannedFallback" };
const fieldsByKind = {
  clockRules: [["enabled", "Appliquer aux prochains services pointés", "checkbox"],
    ["earlyIn", "Arrivée en avance", clockSources], ["lateIn", "Arrivée en retard", clockSources],
    ["earlyOut", "Départ anticipé", clockSources], ["lateOut", "Départ tardif", clockSources],
    ["roundMinutes", "Arrondi des heures pointées", { 0: "Aucun", 5: "5 minutes", 10: "10 minutes", 15: "15 minutes", 30: "30 minutes" }],
    ["pause", "Pause déduite", { clocked: "Pause réellement pointée", plannedFallback: "Pause prévue si aucune pause pointée",
      plannedMinimum: "Au moins la pause prévue" }]],
  contract: [
    ["contractEnd", "Date de fin de contrat", "date"], ["archiveNote", "Note d’archivage", "text"],
    ["hourlyRate", "Taux horaire brut (€)", "number"], ["grossSalary", "Salaire mensuel brut (€)", "number"],
    ["monthlyContractHours", "Volume horaire mensuel (h)", "number"], ["transport", "Coût de transport mensuel (€)", "number"],
  ],
  variables: [
    ["bonus", "Primes (€)", "number"], ["bonusLabel", "Description des primes", "text"],
    ["advance", "Avances (€)", "number"], ["advanceLabel", "Description des avances", "text"],
  ],
  meals: [["taken", "Nombre de repas pris sur place", "number"]],
  amendment: [
    ["weeklyHours", "Nouveau volume hebdomadaire (h)", "number"], ["until", "Fin de l’avenant temporaire", "date"],
    ["label", "Type ou libellé de l’avenant", "text"],
  ],
  annual: [
    ["initialized", "Premier jour de suivi dans Gusto", "date"], ["target", "Objectif du cycle (h)", "number"],
    ["opening", "Heures déjà réalisées avant le suivi (h)", "number"], ["weeklyLimit", "Seuil haut hebdomadaire payé (h)", "number"],
    ["includeSunday", "Inclure le travail du dimanche", "checkbox"],
  ],
  hoursEntry: [
    ["operation", "Mouvement", { adjust: "Ajouter ou déduire des heures", reset: "Fixer le solde", paid: "Sortir des heures payées",
      recover: "Convertir en repos compensateur", consumeRecovery: "Déduire du repos compensateur" }],
    ["hours", "Nombre d’heures", "number"], ["title", "Motif du mouvement", "text"],
  ],
  hoursRules: [
    ["start", "Premier lundi de suivi du compteur", "date"], ["enhanced", "Appliquer les majorations au compteur", "checkbox"],
  ],
  absenceRules: [],
  leave: [
    ["previousAcquired", "N−1 · Congés acquis", "number"], ["previousUsed", "N−1 · Congés posés", "number"],
    ["previousBalance", "N−1 · Solde", "number"], ["currentAcquired", "N · Congés acquis", "number"],
    ["currentUsed", "N · Congés posés", "number"], ["currentBalance", "N · Solde", "number"],
    ["leaveAvailable", "Jours disponibles", "number"],
  ],
};
const titles = {
  contract: "Rémunération et contrat", variables: "Primes et avances", meals: "Repas pris sur place",
  clockRules: "Pointeuse", rules: "Repas", overtime: "Heures majorées", leaveRules: "Congés payés", leave: "Solde d’ouverture des congés",
  hoursRules: "Compteur d’heures", absenceRules: "Absences", amendment: "Avenant horaire",
  hoursEntry: "Mouvement du compteur", annual: "Annualisation",
};
const payrollHelp = {
  contract: "Renseignez le salaire mensuel brut, le taux horaire, le volume mensuel, le transport ainsi que la date de fin et la note d’archivage. Ces données alimentent le rapport RH. Le bulletin de paie se prépare séparément.",
  amendment: "Enregistrez un nouveau volume horaire hebdomadaire. Les calculs et les rapports utilisent ce volume à partir de la date d’effet, jusqu’à la date de fin si l’avenant est temporaire.",
  hoursEntry: "Ajustez le solde, enregistrez les heures déjà payées ou créditez et déduisez du repos compensateur. Les mouvements datés mettent à jour les soldes du rapport RH.",
  annual: "Suivez un objectif d’heures sur le cycle annuel et les heures restant à réaliser. Utilisez ce formulaire si le dispositif d’annualisation s’applique au salarié.",
  leave: "Reprenez les soldes de congés existants, par exemple lors du passage à Gusto. Le solde saisi à la date choisie sert de point de départ au suivi.",
};
const settingsTabs = ["rules", "overtime", "hoursRules", "absenceRules", "leaveRules", "clockRules"];
const fixedKinds = ["contract", "leaveRules", "hoursRules", "absenceRules"];
const payerOptions = { employer: "Employeur", thirdParty: "Tiers", unpaid: "Non indemnisée" };
const hourMovements = { adjust: "Ajustement", reset: "Solde fixé", paid: "Heures payées",
  recover: "Repos compensateur crédité", consumeRecovery: "Repos compensateur déduit" };
const absenceNames = { ...frenchPlanning.absenceTypes, unspecified: "Non précisée", reported: "Absence de pointage validée" };
const monthOptions = Object.fromEntries(Array.from({ length: 12 }, (_, index) => [index + 1,
  new Intl.DateTimeFormat("fr-FR", { month: "long", timeZone: "UTC" }).format(new Date(Date.UTC(2026, index, 1)))]));
const overtimeDefaults = {
  enabled: false, source: "hybrid", ordinary: 35, firstEnd: 39, secondEnd: 43, firstRate: 10, secondRate: 20, lastRate: 50,
  complementBand: 10, complementFirstRate: 10, complementLastRate: 25, workdays: 5,
  creditedAbsences: ["paid_leave", "apprenticeship"], nightStart: "22:00", nightEnd: "07:00", nightRate: null,
  sundayRate: null, holidayRate: null,
};
const leaveDefaults = {
  unit: "businessDays", referenceMonth: 6, excludeHolidays: true, preserveCarry: true,
  assimilated: ["paid_leave", "work_accident", "commuting_accident", "maternity_leave", "paternity_leave",
    "adoption_leave", "family_event", "training", "apprenticeship", "public_holiday", "compensatory_rest", "rtt"],
};
const overtimeFields = [
  ["source", "Source des heures", { hybrid: "Planning, remplacé par les pointages validés", validated: "Pointages validés uniquement", planning: "Planning uniquement" }],
  ["planningAttribution", "Rattachement des services de nuit", { shiftStart: "Au jour de début du service" }],
  ["workdays", "Jours de travail pris en compte par semaine", { 5: "5 jours", 6: "6 jours", 7: "7 jours" }],
  ["ordinary", "Seuil temps plein (h/semaine)", "number"], ["firstEnd", "Fin de la première tranche (h)", "number"],
  ["firstRate", "Majoration première tranche (%)", "number"], ["secondEnd", "Fin de la deuxième tranche (h)", "number"],
  ["secondRate", "Majoration deuxième tranche (%)", "number"], ["lastRate", "Majoration au-delà de la deuxième tranche (%)", "number"],
  ["complementBand", "Première tranche complémentaire (% du contrat)", "number"],
  ["complementFirstRate", "Majoration complémentaire de la première tranche (%)", "number"],
  ["complementLastRate", "Majoration au-delà de la tranche complémentaire (%)", "number"],
  ["nightStart", "Début de nuit", "time"], ["nightEnd", "Fin de nuit", "time"],
  ["nightRate", "Majoration de nuit (%)", "number"], ["sundayRate", "Majoration du dimanche (%)", "number"],
  ["holidayRate", "Majoration des jours fériés (%)", "number"],
  ["structuralMonthly", "Mensualiser les heures supplémentaires structurelles pour un mois complet", "checkbox"],
  ["plannedNightGross", "Compter le créneau de nuit avant déduction des pauses planifiées sans horaire", "checkbox"],
  ["countHolidays", "Afficher les heures fériées même sans taux renseigné", "checkbox"],
];
const leaveRuleFields = [
  ["startMonth", "Premier mois d’acquisition dans Gusto", "month"],
  ["referenceMonth", "Début de la période annuelle", monthOptions],
  ["unit", "Décompte des jours", { businessDays: "Jours ouvrables · 6 jours", workdays: "Jours ouvrés · 5 jours" }],
  ["excludeHolidays", "Exclure les jours fériés chômés du calendrier national", "checkbox"],
  ["preserveCarry", "Reporter les reliquats antérieurs à N−1", "checkbox"],
];
const optionalRates = ["nightRate", "sundayRate", "holidayRate"];
const weekLabels = ["Lundi", "Mardi", "Mercredi", "Jeudi", "Vendredi", "Samedi", "Dimanche"];

function weekMonday(value) {
  const day = new Date(`${value}T12:00:00Z`);
  if (!Number.isFinite(+day)) return "";
  day.setUTCDate(day.getUTCDate() - (day.getUTCDay() + 6) % 7);
  return day.toISOString().slice(0, 10);
}

export function personnelReportInputsUrl(restaurantId, employeeId) {
  const base = `${process.env.NEXT_PUBLIC_API_URL}/restaurants/${restaurantId}/employees/reports/inputs`;
  return employeeId ? `${base}/${employeeId}` : base;
}

function InputFields({ url, kind, meal, date, onSaved, nextMeal, onBusy, onDirty }) {
  const [draft, setDraft] = useState({});
  const initialDraft = useRef(null);
  useEffect(() => {
    onDirty(initialDraft.current !== null && JSON.stringify(initialDraft.current) !== JSON.stringify(draft));
  }, [draft, onDirty]);
  const [revision, setRevision] = useState(null);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [conflict, setConflict] = useState(false);
  const [saved, setSaved] = useState(false);
  useEffect(() => {
    const controller = new AbortController();
    axios.get(url, { signal: controller.signal }).then(({ data }) => {
      if (controller.signal.aborted) return;
      const defaults = kind === "clockRules" ? clockDefaults : kind === "overtime" ? overtimeDefaults : kind === "leaveRules" ? leaveDefaults :
        kind === "annual" ? { initialized: date, opening: 0, includeSunday: true } :
          kind === "hoursEntry" ? { operation: "adjust" } : {};
      initialDraft.current = { ...defaults, ...data.values };
      setDraft(initialDraft.current);
      setRevision(data.revision);
    }).catch((failure) => {
      if (!controller.signal.aborted) setError(failure.response?.data?.message || "Impossible de charger ces données.");
    });
    return () => controller.abort();
  }, [url, attempt, kind, date]);

  const fields = kind === "rules" ? [
    ["mode", "Prise en charge", modeOptions],
    ...(draft.mode && draft.mode !== "basket" ? [["basis", "Calcul des repas dus", basisOptions]] : []),
    ...(draft.mode && draft.mode !== "basket" && ["days", "monthly"].includes(draft.basis)
      ? [["quantity", draft.basis === "days" ? "Repas par jour travaillé" : "Repas par mois", "number"]] : []),
    ...(draft.mode === "basket" ? [["amount", "Montant mensuel (€)", "number"]] :
      draft.mode === "combined" ? [["amount", "Valeur d’un repas pris (€)", "number"]] : []),
  ] : kind === "overtime" ? [["enabled", "Activer le calcul hebdomadaire des majorations", "checkbox"],
    ["paidLeaveDays", "Base de valorisation des congés payés en heures", { 5: "5 jours", 6: "6 jours" }],
    ...(draft.enabled ? overtimeFields.filter(([key]) => key !== "planningAttribution" || draft.source === "planning") : [])]
    : kind === "leaveRules" ? leaveRuleFields : fieldsByKind[kind];
  const usesCriteria = kind === "rules" && draft.mode && draft.mode !== "basket" && draft.basis === "criteria";
  const criteria = draft.criteria || [{}];
  const absenceField = kind === "overtime" && draft.enabled ? "creditedAbsences" : kind === "leaveRules" ? "assimilated" : null;
  const requiredWeekdays = kind === "overtime" && draft.enabled ? Number(draft.workdays) : kind === "leaveRules" ? draft.unit === "businessDays" ? 6 : 5 : 0;
  const weekdays = draft.weekdays ?? Array.from({ length: requiredWeekdays || 0 }, (_, index) => index + 1);

  async function save(event) {
    event.preventDefault();
    if (saving || revision === null || conflict) return;
    if (requiredWeekdays && weekdays.length !== requiredWeekdays && (kind !== "leaveRules" || draft.startMonth)) {
      setError(`Sélectionne ${requiredWeekdays} jours dans la semaine.`);
      return;
    }
    const moveNext = event.nativeEvent.submitter?.value === "next";
    setSaving(true);
    onBusy(true);
    setError("");
    setSaved(false);
    try {
      const values = Object.fromEntries(fields.map(([key, , type]) => {
        const value = draft[key];
        const numeric = ["roundMinutes", "referenceMonth", "workdays", "paidLeaveDays"].includes(key) || type === "number";
        return [key, type === "checkbox" ? Boolean(value) : value === "" || value == null ? null : numeric ? Number(value) : value];
      }));
      if (absenceField) values[absenceField] = draft[absenceField] || [];
      if (requiredWeekdays) values.weekdays = weekdays;
      if (kind === "absenceRules") {
        values.categories = Object.fromEntries(Object.entries(draft.categories || {}).map(([key, row]) =>
          [key, { payer: row.payer || null, meal: Number(row.meal || 0) }]));
      }
      if (usesCriteria) {
        values.criteria = criteria.map((criterion) => Object.fromEntries(criterionFields.map(([key, , type]) => {
          const value = criterion[key];
          return [key, value === "" || value == null ? null : type === "number" ? Number(value) : value];
        })));
      }
      const { data } = await axios.put(url, { revision, values });
      setRevision(data.revision);
      initialDraft.current = draft;
      onDirty(false);
      setSaved(true);
      onSaved(moveNext ? nextMeal : undefined);
    } catch (failure) {
      setConflict(failure.response?.status === 409);
      setError(failure.response?.data?.message || "Impossible d’enregistrer ces données.");
    } finally {
      setSaving(false);
      onBusy(false);
    }
  }

  const disabled = revision === null || saving || conflict;
  return (
    <form onSubmit={save} className="grid gap-4">
      {revision === null && !error && <p role="status" className="text-sm">Chargement…</p>}
      {kind === "meals" && <p className="text-sm text-darkBlue/70">
        {meal?.due != null && meal.basis !== "monthly" && `Repas dus ce jour : ${meal.due}. `}
        Saisis 0 si aucun repas n’a été pris.
      </p>}
      {kind === "variables" && <p className="text-sm text-darkBlue/70">Saisis les avances avec un signe moins.</p>}
      {kind === "overtime" && draft.enabled && <p className="text-sm text-darkBlue/70">
        Les seuils affichés au départ suivent une semaine HCR sans modulation. Laisse les taux de nuit, dimanche et jours fériés vides s’ils ne s’appliquent pas.
      </p>}
      {kind === "leaveRules" && <p className="text-sm text-darkBlue/70">Les salariés déjà en poste démarrent à partir d’un solde d’ouverture saisi dans leur fiche.</p>}
      {kind === "leave" && <p className="text-sm text-darkBlue/70">Renseigne les soldes N et N−1 arrêtés à cette date. Saisis 0 lorsqu’un solde est nul.</p>}
      {kind === "hoursRules" && <p className="text-sm text-darkBlue/70">Le compteur cumule les écarts à partir de ce lundi. Saisis un solde d’ouverture avec l’action « Fixer le solde » au dimanche précédent.</p>}
      {kind === "annual" && <p className="text-sm text-darkBlue/70">Renseigne l’objectif applicable au salarié pour ce cycle de douze mois, avec sa reprise d’heures si le suivi commence en cours de cycle.</p>}
      {kind === "hoursEntry" && draft.entries?.length > 0 && <ul className="grid gap-1 rounded-lg bg-lightGrey p-3 text-sm">
        {draft.entries.map((entry, index) => <li key={`${entry.at || ""}:${index}`}>
          {hourMovements[entry.operation]} · {entry.hours} h{entry.title ? ` · ${entry.title}` : ""}
        </li>)}
      </ul>}
      {kind === "rules" && draft.basis === "service" && draft.mode !== "basket" &&
        <p className="text-sm text-darkBlue/70">Les plages de repas de Gusto s’appliquent aux services planifiés ou aux horaires rémunérés après validation.</p>}
      {kind === "rules" && (draft.basis === "monthly" || draft.mode === "basket") &&
        <p className="text-sm text-darkBlue/70">Le forfait s’affiche sur les mois complets couverts par le contrat.</p>}
      <div className="grid gap-3 midTablet:grid-cols-2">
        {fields.map(([key, label, type]) => (
          <label key={key} className={`text-sm font-medium ${type === "checkbox" ? "col-span-full flex items-center gap-2" : "grid gap-1"}`}>
            {label}
            {type === "checkbox" ? (
              <input type="checkbox" className="order-first size-4 shrink-0" disabled={disabled} checked={Boolean(draft[key])}
                onChange={(event) => setDraft((current) => ({ ...current, [key]: event.target.checked }))} />
            ) : typeof type === "object" ? (
              <select className={control} disabled={disabled} value={draft[key] ?? ""}
                required={!["mode", "paidLeaveDays", "planningAttribution"].includes(key)} onChange={(event) => setDraft((current) => ({ ...current,
                  ...(["workdays", "unit"].includes(key) && { weekdays: null }), [key]: event.target.value }))}>
                <option value="">{key === "mode" ? "Non configuré" : key === "paidLeaveDays" ? "Règle actuelle du planning"
                  : key === "planningAttribution" ? "À chaque jour civil travaillé" : "Sélectionner"}</option>
                {Object.entries(type).map(([value, option]) => <option key={value} value={value}>{option}</option>)}
              </select>
            ) : (
              <input className={control} type={type} disabled={disabled} value={draft[key] ?? ""}
                required={["quantity", "hours"].includes(key) || (key === "amount" && draft.mode === "basket") ||
                  (kind === "overtime" && type === "number" && !optionalRates.includes(key))}
                min={type === "number" && !["advance", "currentBalance", "leaveAvailable"].includes(key) &&
                  !(key === "hours" && ["adjust", "reset"].includes(draft.operation)) ? 0 : undefined}
                max={key === "advance" ? 0 : undefined}
                step={type === "number" ? ["quantity", "taken"].includes(key) ? 1 : "0.01" : undefined}
                maxLength={type === "text" ? 300 : undefined}
                onChange={(event) => setDraft((current) => ({ ...current, [key]: event.target.value }))} />
            )}
          </label>
        ))}
      </div>
      {kind === "absenceRules" && <div className="grid gap-2">
        {Object.entries(absenceNames).filter(([type]) => type !== "weekly_rest").map(([type, name]) => {
          const row = draft.categories?.[type] || {};
          function change(field, value) {
            setDraft((current) => ({ ...current, categories: { ...current.categories, [type]: { ...row, [field]: value } } }));
          }
          return <div key={type} className="grid items-center gap-2 border-b border-darkBlue/10 pb-2 midTablet:grid-cols-3">
            <span className="text-sm font-medium">{name}</span>
            <select className={control} aria-label={`Indemnisation · ${name}`} disabled={disabled}
              value={row.payer || ""} onChange={(event) => change("payer", event.target.value)}>
              <option value="">Non renseignée</option>
              {Object.entries(payerOptions).map(([key, label]) => <option key={key} value={key}>{label}</option>)}
            </select>
            <label className="grid gap-1 text-sm">Repas indemnisés
              <input type="number" className={control} min={0} max={10} step={1} disabled={disabled}
                aria-label={`Repas indemnisés · ${name}`} value={row.meal ?? 0} onChange={(event) => change("meal", event.target.value)} />
            </label>
          </div>;
        })}
      </div>}
      {requiredWeekdays > 0 && <fieldset className="flex flex-wrap gap-x-4 gap-y-2 rounded-lg border border-darkBlue/15 p-3">
        <legend className="px-1 text-sm font-semibold">{kind === "overtime" ? "Jours pouvant recevoir un crédit d’absence" : "Jours décomptés dans la semaine"}</legend>
        {weekLabels.map((label, index) => <label key={label} className="flex items-center gap-1.5 text-sm">
          <input type="checkbox" disabled={disabled} checked={weekdays.includes(index + 1)} onChange={(event) => {
            const checked = event.target.checked;
            setDraft((current) => ({ ...current, weekdays: checked ? [...weekdays, index + 1] : weekdays.filter((day) => day !== index + 1) }));
          }} />{label}
        </label>)}
      </fieldset>}
      {absenceField && <details className="rounded-lg border border-darkBlue/15 p-3">
        <summary className="cursor-pointer text-sm font-semibold">
          {kind === "overtime" ? "Absences comptées dans le seuil hebdomadaire" : "Absences ouvrant droit à l’acquisition"}
        </summary>
        <div className="mt-3 grid gap-2 midTablet:grid-cols-2">
          {Object.entries(frenchPlanning.absenceTypes).filter(([type]) => !["weekly_rest", "unspecified"].includes(type) &&
            (kind === "overtime" || type !== "sick_leave")).map(([type, label]) => <label key={type} className="flex items-center gap-2 text-sm">
            <input type="checkbox" disabled={disabled} checked={draft[absenceField]?.includes(type) ?? false} onChange={(event) => {
              const checked = event.target.checked;
              setDraft((current) => {
                const values = current[absenceField] || [];
                return { ...current, [absenceField]: checked ? [...values, type] : values.filter((item) => item !== type) };
              });
            }} />
            {label}
          </label>)}
        </div>
      </details>}
      {usesCriteria && <fieldset className="grid gap-3">
        <legend className="mb-2 text-sm font-semibold">Critères ouvrant droit à un repas</legend>
        {criteria.map((criterion, index) => (
          <div key={index} className="grid gap-2 rounded-lg border border-darkBlue/15 p-3 midTablet:grid-cols-2">
            {criterionFields.map(([key, label, type]) => <label key={key} className="grid gap-1 text-sm">
              {label}
              <input type={type} className={control} disabled={disabled} min={type === "number" ? 0 : undefined}
                max={type === "number" ? 1500 : undefined} value={criterion[key] ?? ""}
                onChange={(event) => {
                  const value = event.target.value;
                  setDraft((current) => ({ ...current, criteria: criteria.map((item, position) =>
                    position === index ? { ...item, [key]: value } : item) }));
                }} />
            </label>)}
            {criteria.length > 1 && <button type="button" className={action} disabled={disabled}
              onClick={() => setDraft((current) => ({ ...current, criteria: criteria.filter((_, position) => position !== index) }))}>
              Retirer ce critère
            </button>}
          </div>
        ))}
        {criteria.length < 5 && <button type="button" className={`${action} justify-self-start`} disabled={disabled}
          onClick={() => setDraft((current) => ({ ...current, criteria: [...criteria, {}] }))}>Ajouter un critère</button>}
      </fieldset>}
      {error && <p className="text-sm text-red" role="alert">{error}</p>}
      {saved && <p className="text-sm text-[#146144]" role="status">Paramètres enregistrés.</p>}
      <div className="flex flex-wrap justify-end gap-2">
        {(conflict || (revision === null && error)) && <button type="button" className={action}
          onClick={() => { setError(""); setRevision(null); setConflict(false); setAttempt((count) => count + 1); }}>Recharger</button>}
        {nextMeal && <button type="submit" value="next" className={action} disabled={disabled}>Enregistrer et passer au jour suivant</button>}
        <button type="submit" className="min-h-10 rounded-lg bg-blue px-3 text-sm font-semibold text-white disabled:opacity-50" disabled={disabled}>
          {saving ? "Enregistrement…" : "Enregistrer"}
        </button>
      </div>
    </form>
  );
}

export default function PersonnelReportInputDialog({ kind: initialKind, baseUrl, employeeName, initialDate, from, to, mealDays, onClose, onSaved }) {
  const ref = useRef(null);
  const titleId = useId();
  const helpId = useId();
  const backdrop = useDialogBackdrop(requestClose);
  const today = parisPlanningDateKey(new Date());
  const settings = initialKind === "settings";
  const [kind, setKind] = useState(settings ? "rules" : initialKind);
  const monthInput = kind === "rules" || kind === "variables";
  const fixed = fixedKinds.includes(kind);
  const [date, setDate] = useState(initialDate || (fixed ? "-" : monthInput ? today.slice(0, 7) : today));
  const [busy, setBusy] = useState(false);
  const [dirty, setDirty] = useState(false);
  function canLeave() {
    return !busy && (!dirty || window.confirm("Abandonner les modifications non enregistrées ?"));
  }
  function requestClose() {
    if (canLeave()) onClose();
  }
  useEffect(() => {
    const dialog = ref.current;
    dialog.showModal();
    return () => dialog.close();
  }, []);

  const editableDays = mealDays?.filter((entry) => entry.mode === "combined" && entry.date <= today) || [];
  const meal = editableDays.find((entry) => entry.date === date);
  const valid = fixed || (kind === "meals" ? Boolean(meal) :
    (monthInput ? /^\d{4}-\d{2}$/ : /^\d{4}-\d{2}-\d{2}$/).test(date)) &&
    (kind !== "overtime" || date === weekMonday(date));
  const nextMeal = editableDays.find((entry) => entry.date > date && entry.taken == null && (entry.due || entry.works))?.date;
  return (
    <dialog ref={ref} aria-labelledby={titleId} aria-describedby={payrollHelp[kind] ? helpId : undefined}
      {...backdrop}
      className="m-auto max-h-[85dvh] w-[calc(100%-2rem)] max-w-2xl rounded-2xl bg-white p-0 text-darkBlue shadow-xl backdrop:bg-darkBlue/45">
      <header className="flex items-start justify-between gap-3 border-b border-darkBlue/10 p-4 midTablet:p-5">
        <div>
          <h2 id={titleId} className="text-lg font-semibold">{settings ? "Paramètres du rapport RH" : titles[kind]}</h2>
          {employeeName && <p className="text-sm text-darkBlue/70">{employeeName}</p>}
          {payrollHelp[kind] && <p id={helpId} className="mt-2 max-w-prose text-sm leading-relaxed text-darkBlue/75">{payrollHelp[kind]}</p>}
        </div>
        <button type="button" className={action} disabled={busy} onClick={requestClose} aria-label="Fermer"><X size={16} /></button>
      </header>
      <div className="grid gap-4 p-4 midTablet:p-5">
        {settings && <nav aria-label="Paramètres du rapport RH" className="flex flex-wrap gap-2 border-b border-darkBlue/10 pb-3">
          {settingsTabs.map((item) => <button key={item} type="button" className={`${action} ${kind === item ? "border-blue text-blue" : ""}`}
            aria-pressed={kind === item} disabled={busy} onClick={() => {
              if (item === kind || !canLeave()) return;
              setDirty(false);
              setKind(item);
              setDate(fixedKinds.includes(item) ? "-" : item === "clockRules" ? today : item === "overtime" ? weekMonday(from || today) : (from || today).slice(0, 7));
            }}>{titles[item]}</button>)}
        </nav>}
        {kind === "meals" ? (
          <label className="grid gap-1 text-sm font-medium">Jour du repas
            <select className={control} disabled={busy} value={meal ? date : ""} onChange={(event) => { if (canLeave()) { setDirty(false); setDate(event.target.value); } }}>
              <option value="">Sélectionner un jour</option>
              {editableDays.map((entry) => <option key={entry.date} value={entry.date}>
                {formatReportValue(entry.date, "date")}{entry.taken != null ? " · Saisi" : entry.due ? ` · ${entry.due} dû(s)` : ""}
              </option>)}
            </select>
          </label>
        ) : !fixed && (
          <label className="grid gap-1 text-sm font-medium">{kind === "rules" ? "Applicable à partir du mois de" :
            kind === "overtime" ? "Applicable à partir du lundi" : kind === "clockRules" ? "Applicable aux services à partir du" : monthInput ? "Mois de paie" :
              kind === "amendment" ? "Date d’effet" : kind === "annual" ? "Début du cycle annuel" : kind === "hoursEntry" ? "Date du mouvement" : "Solde au"}
            <input className={control} disabled={busy} type={monthInput ? "month" : "date"} value={date}
              min={kind === "variables" ? from.slice(0, 7) : undefined} max={kind === "variables" ? to.slice(0, 7) : undefined}
              onChange={(event) => { if (canLeave()) { setDirty(false); setDate(event.target.value); } }} />
          </label>
        )}
        {kind === "overtime" && date && date !== weekMonday(date) && <p role="status" className="text-sm text-darkBlue/70">Choisis le lundi de la première semaine concernée.</p>}
        {valid && <InputFields key={`${kind}:${date}`} url={`${baseUrl}/${kind}/${date}`} kind={kind} date={date} meal={meal} nextMeal={nextMeal} onBusy={setBusy} onDirty={setDirty}
          onSaved={(nextDate) => {
            if (nextDate) setDate(nextDate);
            onSaved({ keepOpen: settings || Boolean(nextDate) });
          }} />}
      </div>
    </dialog>
  );
}
