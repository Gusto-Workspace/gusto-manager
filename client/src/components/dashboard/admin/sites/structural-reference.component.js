import { useEffect, useRef, useState } from "react";
import {phaseLabel,needsVisionConfirmation,responseIsRecoverable,responseCanBeRetrieved} from './structural-operation-display';
import {
  api,
  button,
  input,
  message,
  panel,
  secondaryButton,
} from "./design-lab.shared";

export const structuralStatus = {
  pending: "À analyser",
  capturing: "Capture et chargement en cours…",
  analyzing: "Analyse structurelle en cours…",
  analyzed: "Analysée",
  error: "Erreur · réessayer manuellement",
  blocked_by_overlay: "Overlay bloquant détecté — analyse non lancée",
  blocked_by_popup: "Popup non neutralisée — analyse non lancée",
  incomplete_page_capture: "Capture incomplète — analyse non lancée",
};
export function CaptureSanitizationStatus({ reference }) {
  const trace = reference.captureSanitization;
  const blocked =
    [
      "blocked_by_overlay",
      "blocked_by_popup",
      "incomplete_page_capture",
    ].includes(reference.status) || trace?.blockingOverlayDetected;
  if (blocked)
    return (
      <div role="status" className="rounded-xl bg-red/10 p-3 text-sm text-red">
        <p>
          ⚠{" "}
          {structuralStatus[reference.status] ||
            "Overlay bloquant détecté — analyse non lancée"}
        </p>
        {reference.captureCoverage?.reason && (
          <p className="mt-1 text-xs">{reference.captureCoverage.reason}</p>
        )}
        {trace?.blockingOverlays?.slice(0, 3).map((overlay, i) => (
          <p className="mt-1 text-xs" key={i}>
            {overlay.tag}
            {overlay.id ? ` #${overlay.id}` : ""}
            {overlay.className ? ` · ${overlay.className}` : ""} ·{" "}
            {Math.round(overlay.areaRatio * 100)} % du viewport ({overlay.frame}
            )
          </p>
        ))}
        {reference.analysis && (
          <p className="mt-2 text-xs">
            L’analyse affichée ci-dessous est la précédente, conservée sans
            modification.
          </p>
        )}
      </div>
    );
  if (
    trace?.version === 3 &&
    trace.qualityPassed &&
    trace.sanitizedAt &&
    [2, 3].includes(reference.captureCoverage?.version) &&
    reference.captureCoverage?.complete
  )
    return (
      <div role="status" className="text-xs text-darkBlue/65">
        {trace.consentAction !== "none" && (
          <p>
            ✓ Consentement cookies supprimé
            {trace.consentAction === "clicked"
              ? " par clic"
              : " via nettoyage ciblé"}
            {trace.consentLabel ? ` · ${trace.consentLabel}` : ""}
          </p>
        )}
        <p>✓ Couches périphériques nettoyées</p>
        <p>
          {reference.captureCoverage.captureStrategy === "sampled"
            ? "Capture échantillonnée — états visuels observés"
            : "Capture continue"}
        </p>
        <p>✓ Cookies et popups nettoyés</p>
        <p>
          ✓ Page complète parcourue · {reference.captureCoverage.totalHeight} px
        </p>
        <p>{reference.captureCoverage.mediaEvidence?.complete
          ? 'Médias visibles admissibles inspectés ; hors petits médias, pseudo-éléments et contenu des intégrations tierces.'
          : 'Complétude des médias non certifiée sur ces captures historiques.'}</p>
        {reference.captureCoverage.observationSelection && (
          <p>
            {reference.captureCoverage.observationSelection.mode === "adaptive"
              ? "Sélection adaptative"
              : "Sélection fixe — mesures insuffisantes"}
            {" · "}{reference.captureCoverage.positions.length} observations locales
          </p>
        )}
      </div>
    );
  if (reference.captures?.length)
    return (
      <p role="status" className="text-xs text-darkBlue/55">
        Captures non vérifiées — une nouvelle capture sera effectuée avant la
        prochaine analyse.
      </p>
    );
  return null;
}
export const profileLabels = {
  compositionModel: "Composition",
  gridStrategy: "Grille",
  widthStrategy: "Largeurs",
  alignmentSystem: "Alignements",
  whitespaceStrategy: "Respiration",
  densityStrategy: "Densité",
  asymmetryLevel: "Asymétrie",
  viewportUsage: "Occupation du viewport",
  layering: "Superpositions",
  overflowBehavior: "Débordements",
  imageBehavior: "Traitement des images",
  typographyPlacement: "Placement typographique",
  sectionTransitionLogic: "Transitions",
  rhythmLogic: "Rythme global",
};
const momentLabels = {
  role: "Rôle spatial",
  layoutExplanation: "Composition",
  density: "Densité",
  surfaceBehavior: "Surfaces",
  imageRole: "Rôle des images",
  textRole: "Rôle du texte",
  alignment: "Alignement",
  proportionLogic: "Proportions",
  overlap: "Superposition",
  viewportRelationship: "Rapport au viewport",
  transitionIn: "Transition entrante",
  transitionOut: "Transition sortante",
};
function Principles({ title, items }) {
  return (
    <section className={panel}>
      <h2 className="mb-3 text-lg font-semibold">{title}</h2>
      {items?.length ? (
        <ul className="list-disc space-y-2 pl-5 text-sm leading-relaxed">
          {items.map((item, i) => (
            <li key={i}><Principle value={item} /></li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-darkBlue/50">Aucun élément relevé.</p>
      )}
    </section>
  );
}
function Principle({value}) {
  if(typeof value==='string')return value;
  return <><strong>{value.mechanism}</strong> · {value.effect}<p className="text-darkBlue/65">Conditions : {value.conditions}</p></>;
}
export function StructuralAnalysis({ analysis }) {
  if (!analysis)
    return (
      <div className={panel}>
        L’analyse structurelle apparaîtra ici après traitement.
      </div>
    );
  return (
    <div className="space-y-5">
      <section className={panel}>
        <h2 className="mb-3 text-lg font-semibold">Vue d’ensemble</h2>
        <p className="text-sm leading-relaxed">{analysis.overview}</p>
      </section>
      <section className={panel}>
        <h2 className="mb-4 text-lg font-semibold">Profil de composition</h2>
        <dl className="grid gap-4 md:grid-cols-2">
          {Object.entries(profileLabels).map(([key, label]) => (
            <div key={key}>
              <dt className="text-sm font-semibold text-blue">{label}</dt>
              <dd className="mt-1 text-sm leading-relaxed">
                {analysis.layoutProfile?.[key]}
              </dd>
            </div>
          ))}
        </dl>
      </section>
      <section className={panel}>
        <h2 className="mb-3 text-lg font-semibold">Progression verticale</h2>
        <ol className="space-y-3">
          {analysis.rhythmSequence.map((phase, i) => (
            <li className="rounded-xl bg-blue/10 px-3 py-2 text-sm" key={i}>
              {typeof phase === "string" ? (
                `${i + 1}. ${phase}`
              ) : (
                <>
                  <p className="font-semibold">
                    {phase.order}. {phase.climate} · {phase.startPercent}–
                    {phase.endPercent} % de la page
                  </p>
                  <dl className="mt-2 grid gap-2 md:grid-cols-2">
                    {Object.entries({
                      densityChange: "Changement de densité",
                      textImageOrganization: "Rapport texte/image",
                      whitespace: "Respiration",
                      composition: "Composition",
                      transitionIn: "Transition entrante",
                      transitionOut: "Transition sortante",
                    }).map(([key, label]) => (
                      <div key={key}>
                        <dt className="font-medium">{label}</dt>
                        <dd>{phase[key]}</dd>
                      </div>
                    ))}
                  </dl>
                </>
              )}
            </li>
          ))}
        </ol>
        {analysis.sparseMomentsJustification && (
          <p className="mt-3 text-sm">
            Justification du nombre réduit de phases :{" "}
            {analysis.sparseMomentsJustification}
          </p>
        )}
      </section>
      <section className="space-y-3">
        <h2 className="text-lg font-semibold">Moments structurels</h2>
        {analysis.structuralMoments.map((moment) => (
          <article className={panel} key={moment.order}>
            <h3 className="mb-4 font-semibold">
              {moment.order}. {moment.role}{" "}
              <span className="ml-2 text-sm font-normal text-blue">
                {moment.layoutMode}
              </span>
            </h3>
            {moment.evidence && (
              <div className="mb-3 text-sm text-darkBlue/65">
                <p>
                  Preuves : {moment.evidence.sourceViews?.join(" / ")} ·{" "}
                  {moment.evidence.startPercent}–{moment.evidence.endPercent} %
                </p>
                <p>{moment.evidence.observation}</p>
              </div>
            )}
            <dl className="grid gap-3 md:grid-cols-2">
              {Object.entries(momentLabels).filter(([key])=>moment[key]).map(([key, label]) => (
                <div key={key}>
                  <dt className="text-xs font-semibold text-darkBlue/55">
                    {label}
                  </dt>
                  <dd className="text-sm leading-relaxed">{moment[key]}</dd>
                </div>
              ))}
            </dl>
            {moment.geometry&&<dl className="mt-3 grid gap-2 text-sm md:grid-cols-2">
              {Object.entries({imagePlacement:'Placement des images',textPlacement:'Placement du texte',dominantMass:'Masse dominante',massRelationship:'Rapport des masses',primaryAxis:'Axe principal',imageTextRelationship:'Relation texte/image',gridRegularity:'Régularité',overlap:'Superposition',whitespaceTopology:'Organisation du vide'}).map(([key,label])=><div key={key}><dt className="text-darkBlue/55">{label}</dt><dd>{moment.geometry[key]}</dd></div>)}
            </dl>}
            {moment.evidence?.level&&<p className="mt-2 text-xs text-darkBlue/65">Niveau : {moment.evidence.level} · Portée : {moment.evidence.scope}</p>}
            <h4 className="mt-4 text-sm font-semibold">
              Principes transférables
            </h4>
            <ul className="mt-2 list-disc space-y-1 pl-5 text-sm">
              {moment.transferablePrinciples.map((value, i) => (
                <li key={i}><Principle value={value} /></li>
              ))}
            </ul>
          </article>
        ))}
      </section>
      {analysis.globalRelations?.length>0&&<section className={panel}>
        <h2 className="mb-3 text-lg font-semibold">Relations entre moments</h2>
        <ul className="space-y-3 text-sm">{analysis.globalRelations.map((r,i)=><li key={i}>
          <strong>Moments {r.moments.join(' → ')} : {r.mechanism}</strong><p>{r.effect}</p>
          <p className="text-xs text-darkBlue/65">{r.level} · {r.sourceViews.join(' / ')}</p>
        </li>)}</ul>
      </section>}
      <div className="grid gap-4 md:grid-cols-2">
        <Principles
          title="Gestes structurels caractéristiques"
          items={analysis.signatureStructuralMoves}
        />
        <Principles
          title="Principes transférables"
          items={analysis.transferablePrinciples}
        />
        <Principles title="À ne pas copier" items={analysis.avoidCopying} />
        <Principles title="Adapté à" items={analysis.suitableFor} />
        <Principles title="À éviter lorsque" items={analysis.avoidWhen} />
      </div>
    </div>
  );
}
export function StructuralControls({ reference, onChange, onDelete }) {
  const lock = useRef(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [attempts,setAttempts]=useState([]);
  const [attemptError,setAttemptError]=useState('');
  useEffect(()=>{
    let active=true;
    api('get',`/structural-references/${reference._id}/analysis-attempts`).then(result=>{
      if(active){setAttempts(result.attempts||[]);setAttemptError('');}
    }).catch(()=>{if(active)setAttemptError('Les tentatives conservées ne sont pas disponibles. Actualisez avant de relancer.');});
    return()=>{active=false;};
  },[reference._id,reference.updatedAt,reference.status]);
  const running = ["capturing", "analyzing"].includes(reference.status);
  // A crashed process can be retried explicitly after the server's operation lease expires.
  const stale =
    reference.operationStartedAt &&
    Date.now() - new Date(reference.operationStartedAt).getTime() >
      15 * 60 * 1000;
  async function act(method, suffix, data) {
    if (lock.current) return;
    if(suffix==='/analyze'&&needsVisionConfirmation(reference)) {
      if(!window.confirm('Le précédent appel peut avoir été traité par OpenAI sans réponse conservée. Ce clic lancera un nouvel appel payant. Confirmez-vous cette relance ?'))return;
      data={...data,confirmUncertainVision:true};
    }
    lock.current = true;
    setBusy(true);
    setError("");
    try {
      const result = await api(
        method,
        `/structural-references/${reference._id}${suffix}`,
        data,
        { timeout: 600000 },
      );
      if (method === "delete") onDelete();
      else onChange(result.reference);
    } catch (err) {
      setError(message(err));
      // Read-only reconciliation of UI state; never repeat the mutation.
      try{const current=await api('get',`/structural-references/${reference._id}`);onChange(current.reference);}
      catch{/* The displayed error remains; no automatic paid retry. */}
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }
  return (
    <div className="space-y-3">
      <p className="text-sm" role="status">
        {busy ? "Traitement en cours…" : structuralStatus[reference.status]}
        {stale && running
          ? " · opération interrompue, reprise manuelle possible"
          : ""}
      </p>
      {(error || reference.lastError) && (
        <p role="alert" className="text-sm text-red">
          {error || reference.lastError}
        </p>
      )}
      {reference.operationDiagnostic && <div className="space-y-1 text-xs text-darkBlue/70" role="status">
        <p>{phaseLabel(reference.operationDiagnostic.phase)} · {reference.operationDiagnostic.code}
          {Number.isFinite(reference.operationDiagnostic.elapsedMs)?` · ${(reference.operationDiagnostic.elapsedMs/1000).toFixed(1)} s`:''}</p>
        <p>Génération : {reference.operationDiagnostic.generationId}</p>
        {reference.operationDiagnostic.recovery==='manual_confirmation_required'&&<p>Traitement OpenAI incertain. Aucune réponse exploitable conservée ; aucune relance automatique.</p>}
        {reference.operationDiagnostic.recovery==='resume_existing_response'&&<p>La réponse existante peut être récupérée sans créer une nouvelle analyse payante.</p>}
        {reference.analysis&&<p>L’analyse précédente est conservée.</p>}
      </div>}
      {attemptError&&<p role="alert" className="text-xs text-red">{attemptError}</p>}
      {needsVisionConfirmation(reference)&&!reference.operationDiagnostic&&<p className="text-xs text-darkBlue/70">Le précédent appel OpenAI peut avoir été traité sans réponse conservée. Un nouvel appel exige votre confirmation ; aucune relance automatique.</p>}
      {attempts.slice(0,5).map(attempt=><div key={attempt._id} className="space-y-1 text-xs">
        <p>{responseIsRecoverable(attempt)?'Réponse conservée':'Aucune réponse exploitable conservée'} · génération {attempt.generationId} · {attempt.status}</p>
        {attempt.operationDiagnostic&&<p>{phaseLabel(attempt.operationDiagnostic.phase)} · {attempt.operationDiagnostic.code}</p>}
        {responseIsRecoverable(attempt)&&<button className={secondaryButton} disabled={busy||(running&&!stale)} onClick={()=>act('post',`/analysis-attempts/${attempt._id}/reprocess`)}>Retraiter la réponse conservée (sans Vision)</button>}
        {responseCanBeRetrieved(attempt)&&<button className={secondaryButton} disabled={busy||(running&&!stale)} onClick={()=>act('post',`/analysis-attempts/${attempt._id}/resume`)}>Récupérer la réponse existante (sans nouvelle analyse)</button>}
      </div>)}
      <div className="flex flex-wrap gap-2">
        <button
          className={button}
          disabled={busy || (running && !stale)}
          onClick={() => act("post", "/analyze")}
        >
          {reference.analysis ? "Réanalyser" : "Analyser / réessayer"}
        </button>
        <button
          className={secondaryButton}
          disabled={busy || (running && !stale)}
          onClick={() => act("patch", "", { active: !reference.active })}
        >
          {reference.active ? "Désactiver" : "Activer"}
        </button>
        <button
          className={secondaryButton}
          disabled={busy || (running && !stale)}
          onClick={() => {
            if (
              window.confirm(
                "Supprimer cette référence structurelle et ses captures ?",
              )
            )
              act("delete", "");
          }}
        >
          Supprimer
        </button>
      </div>
    </div>
  );
}
export function StructuralEdit({ reference, onChange }) {
  const [title, setTitle] = useState(reference.title);
  const [tags, setTags] = useState(reference.manualTags.join(", "));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const lock = useRef(false);
  async function save(event) {
    event.preventDefault();
    if (lock.current) return;
    lock.current = true;
    setBusy(true);
    try {
      const result = await api(
        "patch",
        `/structural-references/${reference._id}`,
        {
          title,
          manualTags: tags
            .split(",")
            .map((t) => t.trim())
            .filter(Boolean),
        },
      );
      onChange(result.reference);
      setError("");
    } catch (err) {
      setError(message(err));
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }
  return (
    <form className={`${panel} space-y-3`} onSubmit={save}>
      <label className="block text-sm">
        Titre
        <input
          className={`${input} mt-1`}
          required
          maxLength={160}
          value={title}
          onChange={(e) => setTitle(e.target.value)}
        />
      </label>
      <label className="block text-sm">
        Tags manuels
        <input
          className={`${input} mt-1`}
          value={tags}
          placeholder="editorial, airy, architecture"
          onChange={(e) => setTags(e.target.value)}
        />
      </label>
      <p className="text-xs text-darkBlue/55">
        Séparés par des virgules. Conservés à chaque réanalyse.
      </p>
      {error && (
        <p role="alert" className="text-sm text-red">
          {error}
        </p>
      )}
      <button
        className={secondaryButton}
        disabled={busy || ["capturing", "analyzing"].includes(reference.status)}
      >
        Enregistrer
      </button>
    </form>
  );
}
