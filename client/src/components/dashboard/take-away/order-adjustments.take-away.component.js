import { useEffect, useRef, useState } from "react";
import { toMoney } from "./take-away.utils";

const STATES = {
  queued: "À rembourser",
  pending: "Remboursement en attente",
  uncertain: "Remboursement à vérifier",
  failed: "Remboursement échoué — reprise automatique",
  succeeded: "Remboursement confirmé",
  not_required: "Montant dû ajusté — aucun remboursement en ligne",
};
const lineId = (order, item, index) =>
  item.lineId || `${order._id}:line:${index}`;
const remaining = (item) =>
  Math.max(0, Number(item.quantity) - Number(item.refusedQuantity || 0));

export default function OrderAdjustmentsTakeAway({ order, onAction, busy }) {
  const [quantities, setQuantities] = useState({});
  const [reason, setReason] = useState("");
  const [review, setReview] = useState(null);
  const [attempted, setAttempted] = useState(false);
  const submitting = useRef(false);
  const storageKey = `takeaway-refusal:${order._id}`;

  useEffect(() => {
    setQuantities({});
    setReason("");
    setReview(null);
    setAttempted(false);
    try {
      const previous = JSON.parse(sessionStorage.getItem(storageKey) || "null");
      if (
        previous &&
        !(order.adjustments || []).some(
          (operation) => operation.requestKey === previous.requestKey,
        )
      ) {
        setReview(previous);
        setAttempted(true);
        setQuantities(
          Object.fromEntries(
            previous.lines.map((line) => [line.lineId, line.quantity]),
          ),
        );
        setReason(previous.reason);
      } else sessionStorage.removeItem(storageKey);
    } catch {
      /* Storage is optional; the server always deduplicates requests. */
    }
  }, [order._id, storageKey]);

  const lines = (order.items || [])
    .map((item, index) => ({
      lineId: lineId(order, item, index),
      quantity: Number(quantities[lineId(order, item, index)] || 0),
    }))
    .filter((line) => line.quantity > 0);
  const originalCents = Math.round(Number(order.total) * 100);
  const availableCents = order.remainingAmountCents ?? originalCents;
  const allSelected = (order.items || []).every(
    (item, index) =>
      Number(quantities[lineId(order, item, index)] || 0) === remaining(item),
  );
  const amountCents = allSelected
    ? availableCents
    : (order.items || []).reduce(
        (sum, item, index) =>
          sum +
          Number(quantities[lineId(order, item, index)] || 0) *
            Math.round(
              (Number(item.unitPrice) + Number(item.optionsTotal || 0)) * 100,
            ),
        0,
      );
  const editable =
    ["pending", "confirmed", "preparing"].includes(order.status) &&
    (order.paymentMethod !== "online" || order.paymentStatus === "paid");
  const withinDeadline =
    order.status !== "pending" ||
    !order.confirmationDeadlineAt ||
    new Date(order.confirmationDeadlineAt).getTime() > Date.now();

  function prepare() {
    if (!lines.length) return;
    setReview({
      lines,
      reason: reason.trim(),
      requestKey: `refusal:${crypto.randomUUID()}`,
    });
  }
  async function submit() {
    if (!review || busy || submitting.current) return;
    submitting.current = true;
    setAttempted(true);
    try {
      sessionStorage.setItem(storageKey, JSON.stringify(review));
    } catch {
      /* optional */
    }
    try {
      const succeeded = await onAction(order, review);
      if (succeeded !== false) {
        try {
          sessionStorage.removeItem(storageKey);
        } catch {
          /* optional */
        }
        setReview(null);
        setAttempted(false);
        setQuantities({});
        setReason("");
      }
    } finally {
      submitting.current = false;
    }
  }
  return (
    <section className="mt-4 rounded-2xl border border-darkBlue/10 bg-white/70 p-4 text-sm text-darkBlue">
      {order.confirmationDeadlineAt && order.status === "pending" ? (
        <p className="mb-3 font-semibold">
          À confirmer avant le{" "}
          {new Intl.DateTimeFormat("fr-FR", {
            dateStyle: "short",
            timeStyle: "short",
            timeZone: "Europe/Paris",
          }).format(new Date(order.confirmationDeadlineAt))}
        </p>
      ) : null}
      <p>Total initial : {toMoney(order.total)}</p>
      <p>
        Montant conservé{order.paymentMethod !== "online" ? " / à régler" : ""}{" "}
        : {toMoney(availableCents / 100)}
      </p>
      {order.paymentMethod === "online" ? (
        <p>
          Remboursé et confirmé :{" "}
          {toMoney((order.refundedAmountCents || 0) / 100)}
        </p>
      ) : null}
      {(order.adjustments || []).map((operation) => (
        <div
          key={operation.id}
          className="mt-3 border-t border-darkBlue/10 pt-3"
        >
          <p className="font-semibold">
            {operation.type === "termination"
              ? "Annulation / refus complet"
              : "Refus partiel"}{" "}
            · {toMoney(operation.amountCents / 100)}
          </p>
          <p>
            {new Intl.DateTimeFormat("fr-FR", {
              dateStyle: "short",
              timeStyle: "short",
              timeZone: "Europe/Paris",
            }).format(new Date(operation.createdAt))}
          </p>
          <p>
            {(operation.lines || [])
              .map((line) => `${line.quantity} × ${line.name}`)
              .join(", ")}
          </p>
          {operation.reason ? <p>Motif : {operation.reason}</p> : null}
          <p role="status" className="mt-1 font-semibold">
            {STATES[operation.state] || operation.state}
          </p>
        </div>
      ))}
      {editable || review ? (
        <div className="mt-4 border-t border-darkBlue/10 pt-4">
          <h3 className="font-semibold">Refuser des articles</h3>
          {(order.items || []).map((item, index) => {
            const id = lineId(order, item, index);
            return (
              <label
                key={id}
                className="mt-3 flex items-center justify-between gap-3"
              >
                <span>
                  {item.name} · {remaining(item)} conservé(s),{" "}
                  {item.refusedQuantity || 0} refusé(s)
                </span>
                <input
                  aria-label={`Quantité à refuser : ${item.name}`}
                  type="number"
                  min="0"
                  max={remaining(item)}
                  step="1"
                  disabled={Boolean(review) || busy || !withinDeadline}
                  value={quantities[id] || 0}
                  className="w-20 rounded-lg border border-darkBlue/15 bg-white px-2 py-2"
                  onChange={(event) =>
                    setQuantities((current) => ({
                      ...current,
                      [id]: Math.min(
                        remaining(item),
                        Math.max(
                          0,
                          Math.trunc(Number(event.target.value) || 0),
                        ),
                      ),
                    }))
                  }
                />
              </label>
            );
          })}
          <label className="mt-3 block">
            Motif facultatif
            <textarea
              maxLength={500}
              value={reason}
              disabled={Boolean(review) || busy}
              onChange={(event) => setReason(event.target.value)}
              className="mt-1 w-full rounded-lg border border-darkBlue/15 bg-white p-2"
            />
          </label>
          <p className="mt-2 font-semibold">
            {order.paymentMethod === "online"
              ? "Montant à rembourser"
              : "Réduction du montant dû"}{" "}
            : {toMoney(amountCents / 100)}
          </p>
          {review ? (
            <div className="mt-3 rounded-xl border border-red/20 bg-red/5 p-3">
              <p>
                {allSelected
                  ? "Tous les articles seront refusés et la commande annulée/refusée."
                  : order.status === "pending"
                    ? "Les articles conservés seront automatiquement confirmés."
                    : "Les articles conservés poursuivront leur traitement."}
              </p>
              {attempted ? (
                <p className="mt-2">
                  Cette décision est conservée. Réessayez pour récupérer son
                  résultat sans doubler le refus.
                </p>
              ) : null}
              <button
                type="button"
                disabled={busy}
                onClick={submit}
                className="mt-3 rounded-xl bg-red px-3 py-2 font-semibold text-white disabled:opacity-50"
              >
                {busy
                  ? "Traitement…"
                  : attempted
                    ? "Réessayer le même refus"
                    : "Confirmer explicitement le refus"}
              </button>
              {!attempted ? (
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => setReview(null)}
                  className="ml-3"
                >
                  Modifier
                </button>
              ) : null}
            </div>
          ) : (
            <button
              type="button"
              disabled={!lines.length || busy || !withinDeadline}
              onClick={prepare}
              className="mt-3 rounded-xl border border-red/20 bg-red/10 px-3 py-2 font-semibold text-red disabled:opacity-50"
            >
              Vérifier le refus
            </button>
          )}
          {!withinDeadline && !attempted ? (
            <p className="mt-2 text-red">
              Le délai de confirmation est expiré.
            </p>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}
