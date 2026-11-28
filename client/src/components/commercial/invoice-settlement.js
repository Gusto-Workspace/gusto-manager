import { useRef, useState } from "react";
import { adminCommercialApi } from "./commercial-api";
import { commercialSecondary } from "./commercial-ui";

const money = new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR" });
const day = new Intl.DateTimeFormat("fr-FR", { timeZone: "Europe/Paris" });
const fieldDate = new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Paris" });

export default function InvoiceSettlement({ invoice, onSaved, inQueue = false }) {
  const [action, setAction] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const request = useRef(null);
  const { id, owner, amountCents, paidAt, paymentReference, paymentRequestId, advanceReason, paymentCorrections = [], cancelledAt } = invoice;
  const recording = action === "record" || action === "record-advance";
  const today = fieldDate.format(new Date());

  function open(next) {
    setAction(next);
    setError("");
    request.current = null;
  }

  async function save(event) {
    event.preventDefault();
    const fields = Object.fromEntries(new FormData(event.currentTarget));
    const body = { action, ...fields };
    if (recording) {
      const key = JSON.stringify(body);
      if (request.current?.key !== key) request.current = { key, id: crypto.randomUUID() };
      body.requestId = request.current.id;
    }
    if (action === "reverse") body.requestId = paymentRequestId;
    setBusy(true);
    setError("");
    try {
      const scope = owner ? `?salesOwnerId=${encodeURIComponent(owner)}` : "";
      const { document } = await adminCommercialApi(`/documents/${id}/settlement${scope}`, { method: "POST", body });
      setAction("");
      onSaved(document);
    } catch (failure) {
      setError(failure.message);
    } finally {
      setBusy(false);
    }
  }

  return <div className={inQueue ? "contents" : "grid gap-2 text-sm"}>
    {!inQueue && paidAt && <div className="flex flex-wrap items-center justify-between gap-2">
      <p className="break-words">Réglée le {day.format(new Date(paidAt))}{paymentReference && ` · ${paymentReference}`}
        {advanceReason && <span className="block">Virement anticipé · {advanceReason}</span>}
      </p>
      {!cancelledAt && !action && <button type="button" onClick={() => open("reverse")} className="text-blue hover:underline">Corriger cet encaissement</button>}
    </div>}
    {!inQueue && paymentCorrections.length > 0 && <details>
      <summary className="cursor-pointer font-semibold">Historique des corrections</summary>
      <ul className="mt-1 divide-y divide-darkBlue/10">
        {paymentCorrections.map((entry) => <li key={entry.requestId} className="break-words py-2">
          Règlement du {day.format(new Date(entry.paidAt))}{entry.reference && ` · ${entry.reference}`}
          {entry.advanceReason && <span className="block">Virement anticipé · {entry.advanceReason}</span>}
          <span className="block text-darkBlue/70">Corrigé le {day.format(new Date(entry.correctedAt))} · {entry.reason}</span>
        </li>)}
      </ul>
    </details>}
    {!cancelledAt && !paidAt && <div className={inQueue ? "commercial-queue-action" : "flex flex-wrap gap-2"}>
      {inQueue && <strong className="whitespace-nowrap text-sm tabular-nums">{money.format(amountCents / 100)}</strong>}
      <button type="button" disabled={busy} aria-expanded={action === "record"} onClick={() => action === "record" ? setAction("") : open("record")}
        className={inQueue ? "commercial-queue-button" : commercialSecondary}>Marquer comme payée</button>
      {!inQueue && !action && <button type="button" onClick={() => open("record-advance")} className={commercialSecondary}>Rapprocher un virement anticipé</button>}
      {!inQueue && !action && <button type="button" onClick={() => open("cancel")} className="px-2 py-2 text-red hover:underline">Annuler la facture</button>}
    </div>}
    {action && <form onSubmit={save} className="col-span-full grid gap-2 rounded-xl bg-lightGrey p-3 text-sm">
      {recording ? <>
        <p>Enregistrer le règlement intégral de <strong>{money.format(amountCents / 100)}</strong>.</p>
        <div className="grid gap-2 mobile:grid-cols-2">
          <label className="grid min-w-0 gap-1">Date du règlement<input type="date" name="paidOn" defaultValue={today} max={today} required className="input-commercial" /></label>
          <label className="grid min-w-0 gap-1">Référence (facultative)<input name="reference" maxLength={180} className="input-commercial" /></label>
        </div>
        {action === "record-advance" && <label className="grid gap-1">Motif du rapprochement<input name="reason" required maxLength={500} className="input-commercial" /></label>}
      </> : <>
        <p>{action === "reverse" ? "Annuler cet encaissement et conserver sa trace." : "Annuler la facture en conservant le document émis."}</p>
        <label className="grid gap-1">Motif<input name="reason" required maxLength={500} className="input-commercial" /></label>
      </>}
      <div className="flex flex-wrap gap-2">
        <button type="submit" disabled={busy} className="button-commercial">
          {recording ? "Confirmer le règlement" : "Confirmer"}
        </button>
        <button type="button" disabled={busy} onClick={() => setAction("")} className={commercialSecondary}>Fermer</button>
      </div>
      {error && <p role="alert" className="text-red">{error}</p>}
    </form>}
  </div>;
}
