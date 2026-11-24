import { useEffect, useId, useRef, useState } from "react";
import axios from "axios";
import { getAuthConfig } from "../time-clock/time-clock.utils";

const card = "grid gap-3 rounded-xl border border-darkBlue/10 bg-white p-4 midTablet:p-5";
const button = "min-h-10 rounded-lg border border-darkBlue/15 px-3 text-sm font-semibold hover:bg-lightGrey disabled:opacity-60";

export default function EmployeePin({ restaurantId, employeeId, canReveal }) {
  const url = `${process.env.NEXT_PUBLIC_API_URL}/restaurants/${restaurantId}/time-clock/employees/${employeeId}/pin`;
  const titleId = useId();
  const panel = useRef(null);
  const [configured, setConfigured] = useState(null);
  const [pin, setPin] = useState(null);
  const [confirming, setConfirming] = useState(false);
  const [pending, setPending] = useState(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  useEffect(() => {
    const controller = new AbortController();
    panel.current = controller;
    axios.get(url, getAuthConfig({ signal: controller.signal }))
      .then(({ data }) => { if (!controller.signal.aborted) setConfigured(data.configured); })
      .catch(() => { if (!controller.signal.aborted) setError("Impossible de vérifier l’état du PIN."); });
    return () => controller.abort();
  }, [url]);

  async function togglePin() {
    if (pin !== null) {
      setPin(null);
      return;
    }
    const signal = panel.current.signal;
    setPending("reveal");
    setError("");
    try {
      const { data } = await axios.get(`${url}/reveal`, getAuthConfig({ signal }));
      if (signal.aborted) return;
      if (!data.configured) setConfigured(false);
      else if (typeof data.pin === "string" && /^\d{4}$/.test(data.pin)) setPin(data.pin);
      else setError("Impossible d’afficher le PIN.");
    } catch {
      if (!signal.aborted) setError("Impossible d’afficher le PIN.");
    } finally {
      if (!signal.aborted) setPending(null);
    }
  }

  async function regenerate() {
    const signal = panel.current.signal;
    setPending("reset");
    setPin(null);
    setError("");
    setNotice("");
    try {
      const { data } = await axios.post(`${url}/regenerate`, {}, getAuthConfig({ signal }));
      if (signal.aborted) return;
      setConfirming(false);
      setConfigured(data.configured);
      setNotice("Le salarié peut consulter son nouveau code dans ses paramètres Gusto.");
    } catch (failure) {
      if (!signal.aborted) {
        setError(failure.response?.status === 429
          ? "Attendez avant de générer un nouveau code."
          : "Impossible de générer un nouveau PIN.");
      }
    } finally {
      if (!signal.aborted) setPending(null);
    }
  }

  return (
    <section aria-labelledby={titleId} className={card}>
      <div className="flex flex-wrap items-center gap-2">
        <h2 id={titleId} className="font-semibold">PIN Pointeuse</h2>
        {configured !== null && <span className={`rounded-md px-2 py-1 text-xs font-semibold ${configured ? "bg-green/15 text-[#146144]" : "bg-orange/15 text-[#85491d]"}`}>
          {configured ? "Configuré" : "Non configuré"}
        </span>}
      </div>
      {configured === null && !error && <p role="status" className="text-sm text-darkBlue/65">Vérification du PIN…</p>}
      {configured === false && <p className="text-sm text-darkBlue/65">Aucun PIN n’est configuré pour ce restaurant.</p>}
      {error && <p role="alert" className="text-sm text-red">{error}</p>}
      {notice && <p role="status" className="text-sm text-[#146144]">{notice}</p>}
      {configured !== null && !confirming && (
        <div className="flex flex-wrap items-center gap-2.5">
          {configured && canReveal && (
            <>
              <input type="text" aria-label={pin === null ? "Code PIN masqué" : "Code PIN actuel"}
                value={pin ?? "••••"} readOnly autoComplete="off" spellCheck={false}
                className="h-10 w-24 rounded-lg border border-darkBlue/15 bg-lightGrey px-3 text-center font-mono text-sm font-semibold tracking-widest" />
              <button type="button" disabled={Boolean(pending)} onClick={togglePin} className={button}>
                {pending === "reveal" ? "Affichage…" : pin === null ? "Afficher le PIN" : "Masquer le PIN"}
              </button>
            </>
          )}
          <button type="button" disabled={Boolean(pending)} onClick={() => {
            setPin(null);
            setError("");
            setNotice("");
            setConfirming(true);
          }} className={button}>
            {configured ? "Réinitialiser le PIN" : "Générer un PIN"}
          </button>
        </div>
      )}
      {confirming ? (
        <div className="grid gap-3 rounded-lg bg-lightGrey p-3">
          <p className="text-sm">{configured
            ? "Le code précédent sera remplacé. Le salarié retrouvera le nouveau code dans ses paramètres."
            : "Un code sera généré pour ce salarié. Il pourra le consulter dans ses paramètres."}</p>
          <div className="flex flex-wrap gap-2">
            <button type="button" disabled={Boolean(pending)} onClick={regenerate} className="min-h-10 rounded-lg bg-blue px-3 text-sm font-semibold text-white disabled:opacity-60">
              {pending === "reset" ? "Génération…" : configured ? "Confirmer la réinitialisation" : "Confirmer la génération"}
            </button>
            <button type="button" disabled={Boolean(pending)} onClick={() => setConfirming(false)} className={button}>Annuler</button>
          </div>
        </div>
      ) : null}
    </section>
  );
}
