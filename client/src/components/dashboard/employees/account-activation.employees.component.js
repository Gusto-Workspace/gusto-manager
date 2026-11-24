import { useState } from "react";
import axios from "axios";

export default function EmployeeAccountActivation({ entry, endpoint, canActivate, onEditPersonal, onDelivery }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const status = entry.loginStatus;
  const missingContact = !entry.email.trim() || !entry.phone.trim();
  const active = status?.active === true;
  const delivery = status?.delivery;
  const canSend = status && (!status.hasPassword || Boolean(delivery));

  async function sendCredentials() {
    if (!canActivate || busy || missingContact || !canSend) return;
    if (!window.confirm(`Envoyer les identifiants de ${entry.name} à ${entry.email} ?`)) return;
    setBusy(true);
    setError("");
    try {
      const { data } = await axios.post(endpoint, { confirmed: true, email: entry.email, resend: active });
      onDelivery(data.delivery);
    } catch (failure) {
      setError(failure.response?.data?.message || "Impossible d’envoyer les identifiants.");
    } finally {
      setBusy(false);
    }
  }

  return <section className="grid gap-3 rounded-xl border border-darkBlue/10 bg-white p-4">
    <h2 className="font-semibold">Connexion à Gusto</h2>
    <p className={`text-sm font-semibold ${active ? "text-[#146144]" : "text-[#85491d]"}`}>
      {status ? active ? "Compte actif" : "Compte non activé" : "Statut de connexion indisponible"}
    </p>
    {status && canActivate && <>
      {missingContact && (!active || canSend) && <div className="grid justify-items-start gap-2 text-sm">
        <p>Renseignez une adresse e-mail valide et le téléphone du salarié pour lui envoyer ses identifiants.</p>
        <button type="button" onClick={onEditPersonal} className="min-h-10 rounded-lg border border-darkBlue/15 px-3 font-semibold">
          Ouvrir les informations personnelles
        </button>
      </div>}
      {canSend && <>
        {delivery === "sent" && <p role="status" className="text-sm">Les identifiants ont été envoyés au salarié.</p>}
        {delivery === "failed" && <p role="alert" className="text-sm text-red">L’envoi a échoué. Le compte est actif et vous pouvez renvoyer les identifiants.</p>}
        {delivery === "sending" && <p role="status" className="text-sm">Envoi en cours. Réessayez dans un instant si nécessaire.</p>}
        <button type="button" onClick={sendCredentials} disabled={busy || missingContact}
          className="min-h-10 justify-self-start rounded-lg bg-blue px-3 text-sm font-semibold text-white disabled:opacity-50">
          {busy ? "Envoi en cours…" : active ? "Renvoyer les identifiants" : "Activer le compte employé"}
        </button>
      </>}
    </>}
    {error && <p role="alert" className="text-sm text-red">{error}</p>}
  </section>;
}
