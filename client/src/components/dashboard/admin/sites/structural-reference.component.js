import { useRef, useState } from "react";
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
        <p>✓ Capture propre</p>
        <p>
          {reference.captureCoverage.captureStrategy === "sampled"
            ? "Capture échantillonnée — animations liées au scroll détectées"
            : "Capture continue"}
        </p>
        <p>✓ Cookies et popups nettoyés</p>
        <p>
          ✓ Page complète parcourue · {reference.captureCoverage.totalHeight} px
        </p>
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
            <li key={i}>{item}</li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-darkBlue/50">Aucun élément relevé.</p>
      )}
    </section>
  );
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
              {Object.entries(momentLabels).map(([key, label]) => (
                <div key={key}>
                  <dt className="text-xs font-semibold text-darkBlue/55">
                    {label}
                  </dt>
                  <dd className="text-sm leading-relaxed">{moment[key]}</dd>
                </div>
              ))}
            </dl>
            <h4 className="mt-4 text-sm font-semibold">
              Principes transférables
            </h4>
            <ul className="mt-2 list-disc space-y-1 pl-5 text-sm">
              {moment.transferablePrinciples.map((value, i) => (
                <li key={i}>{value}</li>
              ))}
            </ul>
          </article>
        ))}
      </section>
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
  const running = ["capturing", "analyzing"].includes(reference.status);
  // A crashed process can be retried explicitly after the server's operation lease expires.
  const stale =
    reference.operationStartedAt &&
    Date.now() - new Date(reference.operationStartedAt).getTime() >
      15 * 60 * 1000;
  async function act(method, suffix, data) {
    if (lock.current) return;
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
