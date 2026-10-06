import { button, panel, secondaryButton } from "./design-lab.shared";

export function homepageStageLabel(attempt) {
  if (!attempt) return "Homepage en cours…";
  const match = /^chapter_(\d+)$/.exec(attempt.stage || "");
  if (match) return `Homepage — Chapitre ${match[1]}/${attempt.chapters.length}`;
  return { assembly: "Homepage — Assemblage", upload: "Homepage — Sauvegarde de l’assemblage", persistence: "Homepage — Finalisation", prepare: "Homepage — Préparation" }[attempt.stage] || "Homepage en cours…";
}

export default function HomepageAttempt({ attempt, disabled, compatibleDirection, operationBlocked = false, operationStale = false, onResume, onRecover, onAbandon }) {
  const kept = attempt.chapters.filter((chapter) => chapter.status === "persisted").length;
  return (
    <section className={`${panel} space-y-3`}>
      <h2 className="font-semibold">Homepage — Direction {attempt.directionSlot} · v{attempt.directionVersion}</h2>
      <p className="text-sm">{homepageStageLabel(attempt)}</p>
      {operationBlocked && <p className="text-sm">Une opération est encore verrouillée. Après une interruption du serveur, les actions manuelles deviennent disponibles après 10 minutes sans progression.</p>}
      {operationStale && <p className="text-sm">Le verrou de l’opération a expiré. Vérifiez d’abord les résultats avec « Récupérer / finaliser » : cette action ne lance jamais OpenAI.</p>}
      <p className="text-sm">{kept}/{attempt.chapters.length} chapitres conservés. La reprise réutilise les chapitres sauvegardés.</p>
      <ul className="text-sm flex flex-wrap gap-3">
        {attempt.chapters.map((chapter) => <li key={chapter.index}>Chapitre {chapter.index + 1} : {({ pending: "en attente", generating: "résultat à vérifier", persisted: "conservé ✓", failed: "interrompu" })[chapter.status]}</li>)}
      </ul>
      {!compatibleDirection && <p className="text-sm">La version de direction n’est plus active. Abandonnez cette tentative avant d’en commencer une nouvelle.</p>}
      {attempt.needsUncertainConfirmation && <p className="text-sm">Un appel précédent peut avoir été traité sans réponse récupérée. {operationBlocked ? "Aucune relance automatique n’est effectuée. Attendez le déverrouillage avant de vérifier les résultats conservés." : "Vérifiez d’abord les résultats conservés avec « Récupérer / finaliser ». Reprendre peut nécessiter un nouvel appel payant, après votre confirmation explicite."}</p>}
      <div className="flex flex-wrap gap-3">
        {!attempt.canFinalize && <button className={button} disabled={disabled || !compatibleDirection} onClick={onResume}>Reprendre la génération</button>}
        <button className={secondaryButton} disabled={disabled || !compatibleDirection} onClick={onRecover}>Récupérer / finaliser (sans OpenAI)</button>
        <button className={secondaryButton} disabled={disabled} onClick={onAbandon}>Abandonner la tentative</button>
      </div>
    </section>
  );
}
