import { useEffect, useId, useState } from "react";
import axios from "axios";
import { getAuthConfig } from "../time-clock/time-clock.utils";

export default function EmployeePin({ restaurantId, employeeId, canReveal = false }) {
  const url = `${process.env.NEXT_PUBLIC_API_URL}/restaurants/${restaurantId}/time-clock/employees/${employeeId}/pin`;
  const titleId = useId();
  const [details, setDetails] = useState(null);
  const [readVersion, setReadVersion] = useState(0);
  const [confirming, setConfirming] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const configured = details?.configured ?? null;

  useEffect(() => {
    const controller = new AbortController();
    axios.get(canReveal ? `${url}/reveal` : url, getAuthConfig({ signal: controller.signal }))
      .then(({ data }) => { if (!controller.signal.aborted) setDetails(data); })
      .catch(() => { if (!controller.signal.aborted) setError("Impossible de vérifier l’état du PIN."); });
    return () => controller.abort();
  }, [url, canReveal, readVersion]);

  async function regenerate() {
    setPending(true);
    setError("");
    setNotice("");
    try {
      const { data } = await axios.post(`${url}/regenerate`, {}, getAuthConfig());
      setConfirming(false);
      if (canReveal) {
        setDetails(null);
        setReadVersion((version) => version + 1);
      } else setDetails(data);
      setNotice("Le salarié peut consulter son nouveau code dans ses paramètres Gusto.");
    } catch (failure) {
      setError(failure.response?.data?.message || "Impossible de générer un nouveau PIN.");
    } finally {
      setPending(false);
    }
  }

  return (
    <section aria-labelledby={titleId} className="grid gap-3 rounded-xl border border-darkBlue/10 bg-white p-4 midTablet:p-5">
      <div className="flex flex-wrap items-center gap-2">
        <h2 id={titleId} className="font-semibold">Code PIN de la Pointeuse</h2>
        {configured !== null && <span className={`rounded-md px-2 py-1 text-xs font-semibold ${configured ? "bg-green/15 text-[#146144]" : "bg-orange/15 text-[#85491d]"}`}>
          {configured ? "Configuré" : "Non configuré"}
        </span>}
      </div>
      {configured === null && !error && <p role="status" className="text-sm text-darkBlue/65">Vérification du PIN…</p>}
      {configured === false && <p className="text-sm text-darkBlue/65">Le PIN est attribué automatiquement pour ce restaurant.</p>}
      {error && <p role="alert" className="text-sm text-red">{error}</p>}
      {notice && <p role="status" className="text-sm text-[#146144]">{notice}</p>}
      {confirming ? (
        <div className="grid gap-3 rounded-lg bg-lightGrey p-3">
          <p className="text-sm">Le code précédent sera remplacé. Le salarié retrouvera le nouveau code dans ses paramètres.</p>
          <div className="flex flex-wrap gap-2">
            <button type="button" disabled={pending} onClick={regenerate} className="min-h-10 rounded-lg bg-blue px-3 text-sm font-semibold text-white disabled:opacity-60">
              {pending ? "Réinitialisation…" : "Confirmer la réinitialisation"}
            </button>
            <button type="button" disabled={pending} onClick={() => setConfirming(false)} className="min-h-10 rounded-lg border border-darkBlue/15 bg-white px-3 text-sm font-semibold">Annuler</button>
          </div>
        </div>
      ) : null}
      {configured === true && (
        <div className="flex flex-wrap items-center gap-2.5">
          {canReveal && <input type="text" aria-label="Code PIN actuel" value={details.pin}
            readOnly autoComplete="off" spellCheck={false}
            className="h-10 w-24 rounded-lg border border-darkBlue/15 bg-lightGrey px-3 text-center font-mono text-sm font-semibold tracking-widest" />}
          {!confirming && <button type="button" onClick={() => setConfirming(true)} className="min-h-10 rounded-lg border border-darkBlue/15 px-3 text-sm font-semibold hover:bg-lightGrey">
            {canReveal ? "Réinitialiser le code PIN" : "Régénérer le PIN"}
          </button>}
        </div>
      )}
    </section>
  );
}
