import { button, input, secondaryButton } from "./design-lab.shared";

export default function StyleFrameRefinement({ feedback, onChange, onClose, onSubmit, busy }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <form role="dialog" aria-modal="true" aria-labelledby="style-frame-refinement-title" className="w-full max-w-xl space-y-4 rounded-2xl bg-white p-6" onSubmit={onSubmit}>
        <h2 id="style-frame-refinement-title" className="text-lg font-semibold">Affiner ce Style Frame</h2>
        <label className="block text-sm">
          Que veux-tu modifier ?
          <textarea className={`${input} mt-2 min-h-48`} value={feedback} onChange={(event) => onChange(event.target.value)} maxLength={1500} disabled={busy} autoFocus />
        </label>
        <p className="text-xs text-darkBlue/60">{feedback.length}/1500 — Ce feedback concerne uniquement cette tentative. La direction reste identique.</p>
        <div className="flex justify-end gap-3">
          <button type="button" className={secondaryButton} onClick={onClose} disabled={busy}>Annuler</button>
          <button type="submit" className={button} disabled={busy}>Affiner ce Style Frame</button>
        </div>
      </form>
    </div>
  );
}
