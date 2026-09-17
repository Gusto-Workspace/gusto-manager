import { useEffect, useMemo, useState } from "react";
import axios from "axios";
import { Info, Loader2, MessageSquareText } from "lucide-react";
import { analyzeSingleSms, renderSmsPreview } from "./sms-message.utils";
import SmsDestinationsModalReservationsComponent from "./sms-destinations-modal.reservations.component";

const DEFAULT_TEMPLATE = "Bonjour {firstName}, pour rappel, votre table chez {restaurantName} est réservée le {date} à {time} pour {guests} pers. A bientot !";

export default function SmsRemindersReservationsComponent({ restaurantData }) {
  const restaurantId = restaurantData?._id;
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState("");
  const [subscribed, setSubscribed] = useState(false);
  const [usage, setUsage] = useState({ includedCredits: 100 });
  const [destinations, setDestinations] = useState([]);
  const [showDestinations, setShowDestinations] = useState(false);
  const [settings, setSettings] = useState({ enabled: false, delayMinutes: 1440, deliveryMode: "sms_always", template: DEFAULT_TEMPLATE, internationalEnabled: false, billingPeriodSpendingLimit: null, sender: { value: "", status: "pending" } });

  useEffect(() => {
    if (!restaurantId) return;
    let active = true;
    setLoading(true);
    axios.get(`${process.env.NEXT_PUBLIC_API_URL}/restaurants/${restaurantId}/sms-reminders`)
      .then(({ data }) => {
        if (!active) return;
        const activeDestinations = (data.destinations || []).filter(
          (destination) => destination.enabled,
        );
        const hasInternationalDestination = activeDestinations.some(
          (destination) => destination.country !== "FR",
        );
        setSubscribed(Boolean(data.subscribed));
        setSettings((current) => ({
          ...current,
          ...(data.settings || {}),
          delayMinutes: [5, 10].includes(Number(data.settings?.delayMinutes))
            ? 1440
            : Number(data.settings?.delayMinutes || 1440),
          internationalEnabled:
            hasInternationalDestination &&
            Boolean(data.settings?.internationalEnabled),
          sender: { ...current.sender, ...(data.settings?.sender || {}) },
        }));
        setUsage(data.usage || { includedCredits: 100 });
        setDestinations(activeDestinations);
      })
      .catch((requestError) => active && setError(requestError?.response?.data?.message || "Impossible de charger les rappels SMS."))
      .finally(() => active && setLoading(false));
    return () => { active = false; };
  }, [restaurantId]);

  const preview = useMemo(() => renderSmsPreview(settings.template, { firstName: "Camille", date: "24/09/2026", time: "20:00", guests: "4", restaurantName: restaurantData?.name || "Le Restaurant" }), [settings.template, restaurantData?.name]);
  const analysis = useMemo(() => analyzeSingleSms(preview), [preview]);
  const hasInternationalDestination = destinations.some(
    (destination) => destination.country !== "FR",
  );

  function update(key, value) {
    setSaved(false);
    setSettings((current) => ({ ...current, [key]: value }));
  }

  async function save() {
    setSaving(true);
    setError("");
    setSaved(false);
    try {
      const { data } = await axios.put(`${process.env.NEXT_PUBLIC_API_URL}/restaurants/${restaurantId}/sms-reminders`, settings);
      setSettings((current) => ({ ...current, ...(data.settings || {}) }));
      setSaved(true);
    } catch (requestError) {
      setError(requestError?.response?.data?.message || "Impossible d'enregistrer les rappels SMS.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="rounded-2xl border border-darkBlue/10 bg-white p-4 shadow-sm md:p-6">
      <div className="mb-5 flex items-start gap-3">
        <MessageSquareText className="mt-0.5 size-5 text-darkBlue" />
        <div><h2 className="font-semibold text-darkBlue">Rappels SMS</h2><p className="text-sm text-darkBlue/60">100 crédits inclus par période de facturation, puis 0,10 € par crédit.</p></div>
      </div>
      {loading ? <Loader2 className="size-5 animate-spin text-darkBlue/60" /> : !subscribed ? (
        <p className="rounded-xl bg-slate-50 p-4 text-sm text-darkBlue/70">Le module Rappels SMS doit être ajouté à l’abonnement par l’administration Gusto.</p>
      ) : (
        <div className="grid gap-5">
          <label className="flex items-center justify-between gap-4 rounded-xl bg-slate-50 p-4 text-sm"><span><strong>Activer les rappels</strong><br /><span className="text-darkBlue/60">Uniquement pour les réservations confirmées.</span></span><input type="checkbox" checked={settings.enabled} onChange={(event) => update("enabled", event.target.checked)} className="size-5" /></label>
          <div className="grid gap-4 md:grid-cols-2">
            <label className="grid gap-1 text-sm">Délai avant la réservation<select value={settings.delayMinutes} onChange={(event) => update("delayMinutes", Number(event.target.value))} className="rounded-xl border border-darkBlue/15 px-3 py-2"><option value={120}>2 heures</option><option value={360}>6 heures</option><option value={720}>12 heures</option><option value={1440}>1 jour</option><option value={2880}>2 jours</option></select><span className="text-xs leading-relaxed text-darkBlue/55">Les rappels SMS sont envoyés entre 8h et 21h. Si l’heure prévue tombe en dehors de cette plage, elle est automatiquement ajustée dans la mesure du possible. Si aucun envoi ne peut être effectué avant l’heure de la réservation, le rappel n’est pas envoyé.</span></label>
            <label className="grid gap-1 text-sm">Mode d’envoi<select value={settings.deliveryMode} onChange={(event) => update("deliveryMode", event.target.value)} className="rounded-xl border border-darkBlue/15 px-3 py-2"><option value="sms_always">SMS systématique</option><option value="eco">Mode Économie (email prioritaire)</option></select></label>
          </div>
          <label className="grid gap-1 text-sm">Modèle de message<textarea rows={4} value={settings.template} onChange={(event) => update("template", event.target.value)} className="rounded-xl border border-darkBlue/15 px-3 py-2" /><span className="text-xs text-darkBlue/55">Variables : {"{firstName} {date} {time} {guests} {restaurantName}"}</span></label>
          <div className={`rounded-xl border p-4 text-sm ${analysis.valid ? "border-emerald-200 bg-emerald-50/50" : "border-red-200 bg-red-50"}`}><div className="mb-2 flex justify-between gap-3"><strong>Aperçu</strong><span>{analysis.units}/{analysis.maxUnits} unités · {analysis.encoding === "gsm7" ? "GSM-7" : "Unicode refusé"}</span></div><p>{preview}</p></div>
          <div className="grid gap-4 md:grid-cols-2">
            <label className="grid gap-1 text-sm">Sender ID<input value={settings.sender?.value || ""} maxLength={11} onChange={(event) => update("sender", { value: event.target.value, status: settings.sender?.status || "pending" })} className="rounded-xl border border-darkBlue/15 px-3 py-2" /><span className="text-xs text-darkBlue/55">Statut : {settings.sender?.status || "pending"}. Toute modification repasse en attente.</span></label>
            <label className="grid gap-1 text-sm">Plafond de dépassement par période (€)<input type="number" min="0" step="0.1" value={settings.billingPeriodSpendingLimit ?? ""} placeholder="Sans plafond" onChange={(event) => update("billingPeriodSpendingLimit", event.target.value === "" ? null : Number(event.target.value))} className="rounded-xl border border-darkBlue/15 px-3 py-2" /></label>
          </div>
          <div>
            <div className="flex items-center gap-2">
              <label className={`flex items-center gap-3 text-sm ${hasInternationalDestination ? "" : "text-darkBlue/45"}`}>
                <input
                  type="checkbox"
                  checked={settings.internationalEnabled}
                  disabled={!hasInternationalDestination}
                  onChange={(event) =>
                    update("internationalEnabled", event.target.checked)
                  }
                  className="size-4 disabled:cursor-not-allowed"
                />
                Autoriser les SMS vers les destinations internationales
                disponibles
              </label>
              <button
                type="button"
                aria-label="Afficher les destinations SMS disponibles"
                onClick={() => setShowDestinations(true)}
                className="inline-flex size-7 shrink-0 items-center justify-center rounded-full border border-darkBlue/15 text-darkBlue/65 transition hover:bg-darkBlue/5"
              >
                <Info className="size-4" />
              </button>
            </div>
            {!hasInternationalDestination ? (
              <p className="mt-2 text-xs text-darkBlue/50">
                Aucune destination internationale n’est actuellement
                disponible.
              </p>
            ) : null}
          </div>
          <div className="grid grid-cols-2 gap-3 text-sm md:grid-cols-4">
            <div className="rounded-xl bg-slate-50 p-3"><span className="block text-darkBlue/55">Inclus</span><strong>{usage.includedCredits || 100}</strong></div>
            <div className="rounded-xl bg-slate-50 p-3"><span className="block text-darkBlue/55">Consommés</span><strong>{Number(usage.consumedCredits || 0)}</strong></div>
            <div className="rounded-xl bg-slate-50 p-3"><span className="block text-darkBlue/55">Inclus utilisés</span><strong>{Number(usage.includedCreditsConsumed || 0)}</strong></div>
            <div className="rounded-xl bg-slate-50 p-3"><span className="block text-darkBlue/55">Supplément</span><strong>{Number(usage.overageCredits || 0)} · {Number(usage.overageAmount || 0).toFixed(2)} €</strong></div>
          </div>
          {error && <p className="text-sm text-red-600">{error}</p>}
          <div className="flex items-center gap-3"><button type="button" disabled={saving || !analysis.valid} onClick={save} className="rounded-xl bg-darkBlue px-4 py-2 text-sm font-medium text-white disabled:opacity-50">{saving ? "Enregistrement…" : "Enregistrer"}</button>{saved && <span className="text-sm text-emerald-700">Enregistré</span>}</div>
        </div>
      )}
      {showDestinations ? (
        <SmsDestinationsModalReservationsComponent
          destinations={destinations}
          restaurantName={restaurantData?.name || ""}
          sender={settings.sender}
          onClose={() => setShowDestinations(false)}
        />
      ) : null}
    </section>
  );
}
