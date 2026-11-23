import { useCallback, useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import axios from "axios";
import { Settings2, X } from "lucide-react";
import { getAdminAuthConfig } from "../admin/_shared/utils/admin-auth.utils";
import { Comparison, compatibleDate } from "../admin/restaurants/hr-configuration.admin.component";
import { getAuthConfig } from "../time-clock/time-clock.utils";
import useDialogBackdrop from "../_shared/use-dialog-backdrop";
import { hrRuleHelp } from "./hr-rule-help.mjs";
import { hrSteps, questionsFor } from "./hr-questionnaire.mjs";
import planning from "../../../../public/locales/fr/planning.json";

const field = "min-h-10 w-full min-w-0 rounded-lg border border-darkBlue/20 bg-white px-3 py-1.5 text-sm";
const button = "min-h-10 rounded-lg border border-darkBlue/15 bg-white px-3 py-2 text-sm font-semibold hover:bg-darkBlue/5 disabled:opacity-50";
const primary = "min-h-10 rounded-lg bg-blue px-3 py-2 text-sm font-semibold text-white hover:bg-blue/90 disabled:opacity-50";
const closeButton = "grid size-10 shrink-0 place-items-center rounded-lg border border-darkBlue/15 bg-white hover:bg-darkBlue/5 disabled:opacity-50";
const labels = { confirmed: "Confirmé", to_confirm: "À confirmer", not_applicable: "Non concerné", unconfigured: "Non configuré" };
const absences = { ...planning.absenceTypes, reported: "Absence de pointage validée", unspecified: "Motif non précisé" };
delete absences.weekly_rest;
const payers = { employer: "Employeur", thirdParty: "Autre organisme (tiers)", unpaid: "Non indemnisée" };
const days = ["Lundi", "Mardi", "Mercredi", "Jeudi", "Vendredi", "Samedi", "Dimanche"];
const emptyCriterion = { start: null, end: null, minimum: null, maximum: null };
const confirmedAnswer = (value) => ({ status: "confirmed", value });
const pendingAnswer = { status: "to_confirm" };
const questionnaireCopy = {
  admin: {
    title: "Configurer les paramètres RH du restaurant",
    intro: "Renseignez les informations transmises par le restaurant. Vous pouvez passer une question et y revenir plus tard.",
    schedule: "Les paramètres du restaurant prennent effet aux dates indiquées après confirmation.",
    unknown: "À confirmer avec le restaurant",
    summary: "Configuration RH de l’établissement",
    confirm: "Je confirme les règles et les dates d’effet pour cet établissement.",
    restore: "Rétablir les paramètres du restaurant qui précédaient la configuration du",
  },
  owner: {
    title: "Configurer vos paramètres RH",
    intro: "Répondez aux questions pour configurer votre restaurant. Vous pouvez passer une question et y revenir plus tard.",
    schedule: "Vos paramètres prennent effet aux dates indiquées après votre confirmation.",
    unknown: "Je ne sais pas encore",
    summary: "Votre configuration RH",
    confirm: "Je confirme les règles et les dates d’effet pour mon restaurant.",
    restore: "Rétablir vos paramètres qui précédaient la configuration du",
  },
};

function Choices({ options, value, onChange, label }) {
  const selected = options.findIndex((item) => Object.is(item.value, value));
  return <select aria-label={label} className={field} value={selected < 0 ? "" : selected} onChange={(event) => {
    if (event.target.value !== "") onChange(options[Number(event.target.value)].value);
  }}>
    <option value="">Choisir une réponse</option>
    {options.map(({ label: name }, index) => <option key={name} value={index}>{name}</option>)}
  </select>;
}

function QuestionInput({ question, answer, onValue }) {
  const { label, input } = question;
  const value = answer?.value;
  if (Array.isArray(input)) return <Choices options={input} value={value} onChange={onValue} label={label} />;
  if (input === "weekdays" || input === "absenceList") {
    const week = input === "weekdays";
    const options = week ? days.map((day, index) => [index + 1, day]) : Object.entries(absences)
      .filter(([key]) => !["unspecified", "reported"].includes(key) && (question.key !== "assimilated" || key !== "sick_leave"));
    const selected = value || [];
    return <div className="grid gap-2">
      <div className="flex flex-wrap gap-x-4 gap-y-2">{options.map(([key, name]) => <label key={key} className="flex items-center gap-1.5">
        <input type="checkbox" checked={selected.includes(key)} onChange={(event) => {
          const next = event.target.checked ? [...selected, key] : selected.filter((item) => item !== key);
          if (week && !next.length) onValue(undefined);
          else onValue(next);
        }} />{name}
      </label>)}</div>
      <button type="button" className={button} onClick={() => onValue(week ? null : [])}>
        {week ? "Retenir les premiers jours correspondant à la durée choisie" : "Aucune absence à sélectionner"}
      </button>
      {answer?.status === "confirmed" && value === null && <span>Répartition standard retenue.</span>}
    </div>;
  }
  if (input === "absenceRules") {
    const configured = value || {};
    const missing = Object.entries(absences).filter(([key]) => !Object.hasOwn(configured, key));
    function change(kind, part, updated) {
      onValue({ ...configured, [kind]: { ...configured[kind], [part]: updated } });
    }
    return <div className="grid gap-2">
      {Object.entries(configured).map(([kind, row]) => <div key={kind} className="grid min-w-0 gap-2 rounded-lg border border-darkBlue/10 p-3 midTablet:grid-cols-3">
        <strong>{absences[kind]}</strong>
        <label>Qui indemnise ?
          <select className={field} aria-label={`Qui indemnise ? · ${absences[kind]}`} value={row.payer ?? ""}
            onChange={(event) => change(kind, "payer", event.target.value || null)}>
            <option value="">À confirmer</option>
            {Object.entries(payers).map(([key, name]) => <option key={key} value={key}>{name}</option>)}
          </select>
        </label>
        <label>Repas maintenus par jour
          <input className={field} type="number" min="0" max="10" step="1" value={row.meal ?? ""}
            onChange={(event) => {
              if (event.target.validity.valid) change(kind, "meal", event.target.value === "" ? null : Number(event.target.value));
            }} />
        </label>
        <button type="button" className="justify-self-start text-blue underline" onClick={() =>
          onValue(Object.fromEntries(Object.entries(configured).filter(([type]) => type !== kind)))}>Retirer ce motif du brouillon</button>
      </div>)}
      {missing.length > 0 && <Choices label="Ajouter un motif d’absence" options={missing.map(([key, name]) => ({ value: key, label: name }))}
        onChange={(kind) => onValue({ ...configured, [kind]: { payer: null, meal: null } })} />}
      {!Object.keys(configured).length && <button type="button" className={button} onClick={() => onValue({})}>Confirmer une liste vide</button>}
    </div>;
  }
  if (input === "criteria") {
    const criteria = value || [];
    return <div className="grid gap-2">
      {criteria.map((item, index) => <fieldset key={index} className="grid gap-2 rounded-lg border border-darkBlue/10 p-2 mobile:grid-cols-2">
        {Object.entries({ start: "Début", end: "Fin", minimum: "Durée minimale (min)", maximum: "Durée maximale (min)" }).map(([key, name]) =>
          <label key={key}>{name}<input className={field} type={["start", "end"].includes(key) ? "time" : "number"} min="0" max="1500"
            value={item[key] ?? ""} onChange={(event) => {
              if (!event.target.validity.valid) return;
              const text = event.target.value;
              const next = text === "" ? null : event.target.type === "number" ? Number(text) : text;
              onValue(criteria.map((row, rowIndex) => rowIndex === index ? { ...row, [key]: next } : row));
            }} /></label>)}
        <button type="button" className="justify-self-start text-blue underline" onClick={() =>
          onValue(criteria.filter((_, row) => row !== index))}>Retirer ce critère</button>
      </fieldset>)}
      {criteria.length < 5 && <button type="button" className={button} onClick={() => onValue([...criteria, emptyCriterion])}>Ajouter un critère</button>}
    </div>;
  }
  const optional = ["optionalRate", "mealAmount"].includes(input);
  const numeric = optional || input === "number";
  return <div className="flex flex-wrap items-center gap-2">
    <input className={`${field} max-w-52`} aria-label={label} type={numeric ? "number" : input}
      min={numeric ? 0 : undefined} step={numeric ? "any" : undefined} value={value ?? ""} onChange={(event) => {
        if (!event.target.validity.valid) return;
        const next = event.target.value;
        onValue(next === "" ? undefined : numeric ? Number(next) : next);
      }} />
    {optional && <button type="button" className={button} onClick={() => onValue(null)}>{input === "mealAmount" ? "Sans valeur unitaire" : "Sans taux"}</button>}
    {answer?.status === "confirmed" && value === null && <span>Valeur volontairement laissée vide.</span>}
  </div>;
}

function FamilyStep({ step, family, onMode, onAnswer, active, admin, copy }) {
  const [kind, title, ownerQuestion, adminQuestion] = hrSteps[step];
  const help = hrRuleHelp[kind];
  const answers = family?.answers || {};
  const decision = family?.mode;
  return <section className="grid min-w-0 gap-4" aria-label={title}>
    <div><h3 className="text-lg font-semibold">{title}</h3><p className="mt-1 text-sm text-darkBlue/75">{help.intro}</p></div>
    <fieldset className="min-w-0 rounded-xl border border-darkBlue/10 p-3">
      <legend className="px-1 font-semibold">{admin ? adminQuestion : ownerQuestion}</legend>
      <div className="flex flex-wrap gap-2">
        {[["on", "Oui"], ["off", "Non concerné"], ["unknown", copy.unknown]].map(([value, label]) => <button key={value}
          type="button" className={`${button} ${decision === value ? "border-blue text-blue" : ""}`} aria-pressed={decision === value}
          onClick={() => onMode(value)}>{label}</button>)}
        <button type="button" className={button} onClick={() => onMode("unknown")}>Passer</button>
      </div>
    </fieldset>
    {decision === "off" && <p className="text-sm text-darkBlue/75">
      {admin ? "Cette règle sera désactivée pour le restaurant à la date indiquée après confirmation."
        : "Cette règle sera désactivée pour votre restaurant à la date indiquée après confirmation."}
    </p>}
    {decision === "on" && questionsFor(kind, answers).map((item) => {
      const answer = answers[item.key];
      const fixedStart = kind === "hoursRules" && item.key === "start" && active?.start;
      return <fieldset key={item.key} className="grid min-w-0 gap-2 rounded-xl border border-darkBlue/10 p-3 text-sm">
        <legend className="max-w-full px-1 font-semibold">{item.label}</legend>
        {help[item.key] && <details className="text-xs text-darkBlue/75">
          <summary className="w-fit cursor-pointer text-blue" aria-label={`Aide · ${item.label}`}>Aide</summary>
          <p className="mt-1">{help[item.key]}</p>
        </details>}
        {fixedStart && <p>Le suivi a déjà commencé le {fixedStart}. Conserver cette date préserve le cumul.</p>}
        <QuestionInput question={item} answer={answer} onValue={(value) => onAnswer(item.key, value === undefined ? undefined : confirmedAnswer(value))} />
        {fixedStart && <button type="button" className={button} onClick={() => onAnswer(item.key, confirmedAnswer(fixedStart))}>Conserver la date existante</button>}
        <div className="flex flex-wrap items-center gap-3 text-xs">
          <button type="button" className="text-blue underline" onClick={() => onAnswer(item.key, pendingAnswer)}>{copy.unknown}</button>
          <button type="button" className="text-blue underline" onClick={() => onAnswer(item.key, pendingAnswer)}>Passer la question</button>
          {answer?.status === "to_confirm" && <span className="text-darkBlue/70">À confirmer</span>}
        </div>
      </fieldset>;
    })}
  </section>;
}

export default function HrQuestionnaire({ restaurantId, admin = false, disabled, className, onApplied }) {
  const copy = admin ? questionnaireCopy.admin : questionnaireCopy.owner;
  const dialog = useRef(null);
  const opener = useRef(null);
  const titleId = useId();
  const working = useRef(null);
  const revision = useRef(0);
  const queue = useRef(Promise.resolve(true));
  const [overview, setOverview] = useState(null);
  const [draft, setDraft] = useState(null);
  const [pending, setPending] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [conflict, setConflict] = useState(false);
  const [preview, setPreview] = useState(null);
  const [confirmed, setConfirmed] = useState(false);
  const [result, setResult] = useState("");
  const [history, setHistory] = useState([]);
  const [restore, setRestore] = useState(null);
  const base = `${process.env.NEXT_PUBLIC_API_URL}${admin ? "/admin" : ""}/restaurants/${restaurantId}/hr-configuration`;
  const auth = admin ? getAdminAuthConfig : getAuthConfig;
  const failureMessage = (failure) => failure.response?.data?.message || "Impossible de terminer l’opération. Réessayez.";

  const load = useCallback(async (signal) => {
    const { data } = await axios.get(`${base}/draft`, auth({ signal }));
    if (signal?.aborted) return;
    revision.current = data.revision;
    working.current = { step: data.step, families: data.families, effects: data.effects };
    queue.current = Promise.resolve(true);
    setOverview(data);
    setDraft(working.current);
    setConflict(false);
    setError("");
  }, [base, auth]);

  useEffect(() => {
    if (admin) return undefined;
    const controller = new AbortController();
    axios.get(`${base}/draft`, auth({ signal: controller.signal })).then(({ data }) => {
      if (!controller.signal.aborted && !dialog.current?.open) setOverview(data);
    }).catch(() => {});
    return () => controller.abort();
  }, [admin, base, auth]);

  function save(next) {
    setPending((value) => value + 1);
    queue.current = queue.current.then(async (continueSaving) => {
      if (!continueSaving) return false;
      try {
        const { data } = await axios.put(`${base}/draft`, { draft: { ...next, revision: revision.current } }, auth());
        revision.current = data.revision;
        setOverview(data);
        return true;
      } catch (failure) {
        setConflict(failure.response?.status === 409);
        setError(failureMessage(failure));
        return false;
      }
    }).finally(() => setPending((value) => value - 1));
    return queue.current;
  }

  function update(next) {
    working.current = next;
    setDraft(next);
    setPreview(null);
    setConfirmed(false);
    return save(next);
  }

  async function perform(action) {
    setBusy(true);
    setError("");
    try { await action(); }
    catch (failure) { setError(failureMessage(failure)); }
    finally { setBusy(false); }
  }

  async function refreshHistory() {
    const { data } = await axios.get(admin ? base : `${base}/history`, auth());
    setHistory(data.batches);
  }

  function open() {
    setPreview(null);
    setResult("");
    setRestore(null);
    dialog.current.showModal();
    return perform(async () => { await load(); await refreshHistory(); });
  }

  async function close() {
    if (busy || !await queue.current) return;
    dialog.current?.close();
    opener.current?.focus();
  }

  const backdrop = useDialogBackdrop(close);
  const step = draft?.step || 0;
  const kind = hrSteps[step]?.[0];
  const family = draft?.families[kind] || { mode: null, answers: {} };
  const edit = (next) => update({ ...working.current, families: { ...working.current.families, [kind]: next } });
  const go = (stepIndex) => update({ ...working.current, step: stepIndex });

  function answer(key, value) {
    const answers = { ...(working.current.families[kind]?.answers || {}) };
    if (value === undefined) delete answers[key];
    else answers[key] = value;
    if (key === "categories") delete answers.reviewCategories;
    edit({ mode: "on", answers });
  }

  async function previewAnswers(effects) {
    if (!await queue.current) return;
    const { data } = await axios.post(`${base}/draft/preview`, { revision: revision.current, effects }, auth());
    setPreview(data);
    setConfirmed(false);
  }

  function compare() {
    const effective = Object.fromEntries(hrSteps.map(([key]) => {
      const saved = working.current.effects[key];
      return [key, saved && saved >= overview.minimumDate ? saved : compatibleDate(key, overview.minimumDate)];
    }));
    return perform(() => previewAnswers(effective));
  }

  function changeDate(key, date) {
    if (date < overview.minimumDate) return;
    const effects = { ...preview.effects, [key]: date };
    update({ ...working.current, effects });
    return perform(() => previewAnswers(effects));
  }

  function apply() {
    return perform(async () => {
      const { data } = await axios.post(`${base}/draft/apply`, {
        revision: revision.current, token: preview.token, effects: preview.effects, confirmed,
      }, auth());
      setResult(`Paramètres programmés pour ${data.batch.kinds.length} famille(s). Consultez leurs dates dans l’historique.`);
      setPreview(null);
      setConfirmed(false);
      await load();
      await refreshHistory();
      onApplied?.();
    });
  }

  function restoreScheduled() {
    return perform(async () => {
      await axios.post(`${base}/${restore.id}/restore`, { confirmed: true }, auth());
      setRestore(null);
      setPreview(null);
      setResult("Le lot a été restauré.");
      await load();
      await refreshHistory();
      onApplied?.();
    });
  }

  const canCompare = Object.values(overview?.statuses || {}).some(({ status }) => ["confirmed", "not_applicable"].includes(status));
  const trigger = <button ref={opener} type="button" className={className || button} disabled={disabled} onClick={open}>
    {admin && <Settings2 size={16} className="shrink-0" aria-hidden="true" />} {admin ? "Configurer avec Gusto" : "Configurer mon restaurant"}
  </button>;

  return <>
    {admin ? trigger : <aside aria-label="Configuration RH" className="flex flex-wrap items-center gap-2">
      {overview?.needsSetup && <span className="text-sm text-darkBlue/75">Votre configuration RH n’est pas encore terminée.</span>}{trigger}
    </aside>}
    {typeof document !== "undefined" && createPortal(<dialog ref={dialog} aria-labelledby={titleId} {...backdrop}
      className="m-auto max-h-[88dvh] w-[calc(100%-1.25rem)] max-w-3xl rounded-2xl bg-white p-0 text-darkBlue shadow-xl backdrop:bg-darkBlue/40">
      <header className="sticky top-0 z-10 flex items-start justify-between gap-3 border-b border-darkBlue/10 bg-white p-4">
        <div className="min-w-0"><h2 id={titleId} className="text-lg font-semibold">{copy.title}</h2>
          {overview && <p className="text-sm">{admin ? "Brouillon de l’établissement" : "Votre brouillon"} · {overview.target.name}</p>}
        </div>
        <button type="button" className={closeButton} aria-label="Enregistrer et fermer" disabled={busy} onClick={close}><X size={18} aria-hidden="true" /></button>
      </header>
      <div className="grid min-w-0 gap-4 p-4 mobile:p-5">
        {busy && !draft && <p role="status">Chargement du brouillon…</p>}
        {error && <div role="alert" className="rounded-lg bg-red/10 p-3 text-sm text-red">
          <p>{error}</p>
          {conflict ? <button type="button" className={button} disabled={pending > 0 || busy} onClick={() =>
            perform(() => load())}>Recharger la version enregistrée</button> :
            <button type="button" className={button} disabled={pending > 0 || busy} onClick={() => {
              if (!working.current) return perform(() => load());
              queue.current = Promise.resolve(true);
              setError("");
              return save(working.current);
            }}>Réessayer l’enregistrement</button>}
        </div>}
        {result && <p role="status" className="rounded-lg bg-darkBlue/5 p-3 text-sm">{result}</p>}
        {draft && <>
          <nav aria-label="Étapes de configuration RH" className="flex flex-wrap gap-1.5">
            {hrSteps.map(([key, title], index) => <button key={key} type="button" className={button} disabled={busy}
              aria-current={step === index ? "step" : undefined} onClick={() => go(index)}>{title}</button>)}
            <button type="button" className={button} disabled={busy} aria-current={step === hrSteps.length ? "step" : undefined}
              onClick={() => go(hrSteps.length)}>Récapitulatif</button>
          </nav>
          {step < hrSteps.length ? <>
            <p className="text-sm text-darkBlue/75">{copy.intro}</p>
            <FamilyStep step={step} family={family} active={overview?.active[kind]} admin={admin} copy={copy}
              onMode={(mode) => edit({ mode, answers: family.answers })} onAnswer={answer} />
          </> : <section className="grid gap-2" aria-label={copy.summary}>
            <h3 className="text-lg font-semibold">{copy.summary}</h3>
            <p className="text-sm text-darkBlue/75">{copy.schedule}</p>
            {hrSteps.map(([key, title], index) => {
              const status = overview.statuses[key];
              return <button key={key} type="button" onClick={() => go(index)} disabled={busy}
                className="grid gap-1 rounded-lg border border-darkBlue/10 p-3 text-left hover:bg-darkBlue/5 mobile:grid-cols-2">
                <strong>{title}</strong>
                <span className="text-sm">{labels[status.status]}
                  {status.status === "to_confirm" && (status.invalid ? " · Vérifier les valeurs" : ` · ${status.missing} réponse(s) à confirmer`)}
                  {overview.active[key] && " · Réglage en vigueur"}
                  {overview.planned[key] && ` · Prévu le ${overview.planned[key].date}`}
                </span>
              </button>;
            })}
            <button type="button" className={primary} disabled={busy || pending > 0 || conflict || !canCompare} onClick={compare}>
              Vérifier et appliquer les paramètres confirmés
            </button>
          </section>}
          {preview && <Comparison preview={preview} minimum={overview.minimumDate} busy={busy} onDate={changeDate} />}
          {preview?.token && <div className="grid gap-2 rounded-xl bg-darkBlue/5 p-3">
            <label className="flex items-start gap-2 text-sm"><input type="checkbox" checked={confirmed} disabled={busy}
              onChange={(event) => setConfirmed(event.target.checked)} /> {copy.confirm}</label>
            <button type="button" className={primary} disabled={!confirmed || busy || pending > 0} onClick={apply}>Appliquer les paramètres confirmés</button>
          </div>}
          {step === hrSteps.length && history.length > 0 && <details className="rounded-xl border border-darkBlue/10 p-3">
            <summary className="cursor-pointer font-semibold">Historique de configuration</summary>
            <ul className="mt-2 grid gap-2">{history.map((batch) => <li key={batch.id} className="flex flex-wrap items-center justify-between gap-2 text-sm">
              <span>{batch.effect} · {batch.kinds.map((key) => hrSteps.find(([kind]) => key === kind)?.[1]).join(", ")}{batch.restoredAt && " · Restauré"}</span>
              {batch.canRestore && <button type="button" className={button} disabled={busy} onClick={() => setRestore(batch)}>Restaurer</button>}
            </li>)}</ul>
          </details>}
          {restore && <div className="grid gap-2 rounded-lg bg-darkBlue/5 p-3 text-sm">
            <p>{copy.restore} {restore.effect} ?</p>
            <div className="flex flex-wrap gap-2">
              <button type="button" className={button} onClick={() => setRestore(null)}>Annuler</button>
              <button type="button" className={primary} disabled={busy} onClick={restoreScheduled}>Confirmer la restauration</button>
            </div>
          </div>}
          <footer className="flex flex-wrap items-center gap-2 border-t border-darkBlue/10 pt-3">
            {step > 0 && <button type="button" className={button} disabled={busy} onClick={() => go(step - 1)}>Précédent</button>}
            {step < hrSteps.length && <button type="button" className={primary} disabled={busy} onClick={() => go(step + 1)}>
              {step === hrSteps.length - 1 ? "Voir le récapitulatif" : "Étape suivante"}
            </button>}
            <button type="button" className={button} disabled={busy} onClick={close}>Enregistrer et quitter</button>
            <span role="status" className="text-xs text-darkBlue/70">{pending ? "Sauvegarde en cours…" : !error && "Brouillon enregistré"}</span>
          </footer>
        </>}
      </div>
    </dialog>, document.body)}
  </>;
}
