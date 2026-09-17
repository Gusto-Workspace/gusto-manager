import { useEffect, useMemo, useState } from "react";
import axios from "axios";
import {
  AlertTriangle,
  Check,
  Info,
  Loader2,
  MessageSquareText,
  Save,
  X,
} from "lucide-react";
import { analyzeSingleSms, renderSmsPreview } from "./sms-message.utils";
import SmsDestinationsModalReservationsComponent from "./sms-destinations-modal.reservations.component";
import SmsPreviewModalReservationsComponent from "./sms-preview-modal.reservations.component";

const DEFAULT_TEMPLATE = "Bonjour {firstName}, pour rappel, votre table chez {restaurantName} est réservée le {date} à {time} pour {guests} pers. A bientot !";

export default function SmsRemindersReservationsComponent({
  restaurantData,
  savePresentation = "full",
}) {
  const restaurantId = restaurantData?._id;
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [error, setError] = useState("");
  const [subscribed, setSubscribed] = useState(false);
  const [usage, setUsage] = useState({ includedCredits: 100 });
  const [destinations, setDestinations] = useState([]);
  const [showDestinations, setShowDestinations] = useState(false);
  const [showPreview, setShowPreview] = useState(false);
  const [showScheduleInfo, setShowScheduleInfo] = useState(false);
  const [settings, setSettings] = useState({ enabled: false, delayMinutes: 1440, deliveryMode: "sms_always", template: DEFAULT_TEMPLATE, internationalEnabled: false, billingPeriodSpendingLimit: null });

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
        }));
        setUsage(data.usage || { includedCredits: 100 });
        setDestinations(activeDestinations);
        setDirty(false);
      })
      .catch((requestError) => active && setError(requestError?.response?.data?.message || "Impossible de charger les rappels SMS."))
      .finally(() => active && setLoading(false));
    return () => { active = false; };
  }, [restaurantId]);

  const preview = useMemo(() => renderSmsPreview(settings.template, { firstName: "Camille", date: "24/09/2026", time: "20:00", guests: "4", restaurantName: restaurantData?.name || "Le Restaurant" }), [settings.template, restaurantData?.name]);
  const analysis = useMemo(() => analyzeSingleSms(preview), [preview]);
  const messageExceedsLimit =
    analysis.encoding === "gsm7" && analysis.units > analysis.maxUnits;
  const hasInternationalDestination = destinations.some(
    (destination) => destination.country !== "FR",
  );
  const smsEnabled = subscribed && Boolean(settings.enabled);

  const card = "rounded-3xl border border-darkBlue/10 bg-white/70 shadow-sm";
  const cardInner = "px-2 py-4 mobile:p-4 midTablet:p-6";
  const sectionTitle =
    "text-base font-semibold text-darkBlue flex items-center gap-2";
  const hint = "text-sm text-darkBlue/60";
  const divider = "h-px bg-darkBlue/10 my-4";
  const toggleBase =
    "relative inline-flex h-8 w-14 shrink-0 items-center rounded-full border transition";
  const toggleDot =
    "absolute top-1/2 h-6 w-6 -translate-y-1/2 rounded-full bg-white shadow-sm transition";
  const saveBtnBase =
    "inline-flex h-10 items-center gap-2 rounded-xl px-3 text-sm font-semibold transition";
  const saveBtnPrimary =
    "bg-darkBlue text-white hover:opacity-90 active:scale-[0.98]";
  const saveBtnDone =
    "border border-darkBlue bg-white text-darkBlue opacity-60";
  const showSaveButton = dirty || saving || saved;

  function update(key, value) {
    setSaved(false);
    setDirty(true);
    setSettings((current) => ({ ...current, [key]: value }));
  }

  async function save() {
    setSaving(true);
    setError("");
    setSaved(false);
    try {
      const { data } = await axios.put(`${process.env.NEXT_PUBLIC_API_URL}/restaurants/${restaurantId}/sms-reminders`, settings);
      setSettings((current) => ({ ...current, ...(data.settings || {}) }));
      setDirty(false);
      setSaved(true);
    } catch (requestError) {
      setError(requestError?.response?.data?.message || "Impossible d'enregistrer les rappels SMS.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className={card}>
      <div className={cardInner}>
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <p className={sectionTitle}>
              <MessageSquareText className="size-4 shrink-0 opacity-60" />
              Rappels SMS
            </p>
            <p className={hint}>
              Envoyer un rappel avant les réservations confirmées.
            </p>
          </div>

          {showSaveButton ? (
            <button
              type="button"
              onClick={save}
              disabled={
                saving || saved || (smsEnabled && !analysis.valid)
              }
              className={[
                savePresentation === "icon"
                  ? "inline-flex h-10 min-w-10 items-center justify-center rounded-xl transition"
                  : saveBtnBase,
                saved ? saveBtnDone : saveBtnPrimary,
                saving ? "cursor-not-allowed opacity-60" : "",
              ].join(" ")}
              aria-label="Enregistrer"
              title="Enregistrer"
            >
              {savePresentation === "icon" ? (
                saving ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : saved ? (
                  <Check className="size-4" />
                ) : (
                  <Save className="size-4" />
                )
              ) : saving ? (
                <>
                  <Loader2 className="size-4 animate-spin" />
                  Enregistrement…
                </>
              ) : saved ? (
                <>
                  <Check className="size-4" />
                  Enregistré
                </>
              ) : (
                <>
                  <Save className="size-4" />
                  Enregistrer
                </>
              )}
            </button>
          ) : null}
        </div>

        <div className={divider} />

        {loading ? (
          <Loader2 className="size-5 animate-spin text-darkBlue/60" />
        ) : (
          <>
            <div className="rounded-2xl border border-darkBlue/10 bg-white/60 p-3">
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="font-semibold text-darkBlue">
                    Activer les rappels SMS
                  </p>
                  <p className="mt-1 text-xs text-darkBlue/50">
                    Uniquement pour les réservations confirmées.
                  </p>
                </div>

                <label className="inline-flex select-none items-center gap-2">
                  <span
                    className={[
                      toggleBase,
                      smsEnabled
                        ? "border-blue/40 bg-blue"
                        : "border-darkBlue/10 bg-darkBlue/10",
                      !subscribed ? "cursor-not-allowed opacity-50" : "",
                    ].join(" ")}
                  >
                    <input
                      type="checkbox"
                      className="sr-only"
                      id="sms_reminders_enabled"
                      checked={smsEnabled}
                      disabled={!subscribed}
                      onChange={(event) =>
                        update("enabled", event.target.checked)
                      }
                    />
                    <span
                      className={[
                        toggleDot,
                        smsEnabled ? "translate-x-7" : "translate-x-1",
                      ].join(" ")}
                    />
                  </span>
                </label>
              </div>

              {!subscribed ? (
                <div className="mt-3 rounded-2xl border border-blue/15 bg-blue/5 px-3 py-3 text-sm text-darkBlue/70">
                  <div className="flex items-start gap-2">
                    <Info className="mt-0.5 size-4 shrink-0 text-blue" />
                    <p>
                      Pour activer les rappels SMS, veuillez contacter le
                      service client afin de configurer l&apos;option.
                    </p>
                  </div>
                </div>
              ) : null}
            </div>

            {smsEnabled ? (
              <div className="mt-5 grid gap-5">
          <div className="grid grid-cols-1 gap-4 midTablet:grid-cols-2">
            <div className="grid gap-1 text-sm">
              <div className="inline-flex w-fit items-center gap-1.5">
                <label htmlFor="sms_reminder_delay">
                  Délai avant la réservation
                </label>
                <button
                  type="button"
                  aria-label="Afficher les horaires d’envoi des rappels SMS"
                  onClick={() => setShowScheduleInfo(true)}
                  className="inline-flex size-6 shrink-0 items-center justify-center rounded-full border border-darkBlue/15 text-darkBlue/65 transition hover:bg-darkBlue/5"
                >
                  <Info className="size-3.5" />
                </button>
              </div>
              <select id="sms_reminder_delay" value={settings.delayMinutes} onChange={(event) => update("delayMinutes", Number(event.target.value))} className="rounded-xl border border-darkBlue/15 px-3 py-2"><option value={120}>2 heures</option><option value={360}>6 heures</option><option value={720}>12 heures</option><option value={1440}>1 jour</option><option value={2880}>2 jours</option></select>
            </div>
            <label className="grid gap-1 text-sm">Mode d’envoi<select value={settings.deliveryMode} onChange={(event) => update("deliveryMode", event.target.value)} className="rounded-xl border border-darkBlue/15 px-3 py-2"><option value="sms_always">SMS systématique</option><option value="eco">Mode Économie (email prioritaire)</option></select></label>
          </div>
          <div className="grid gap-1 text-sm">
            <div className="inline-flex w-fit items-center gap-1.5">
              <label htmlFor="sms_reminder_template">Modèle de message</label>
              <button
                type="button"
                aria-label="Afficher l’aperçu du SMS"
                onClick={() => setShowPreview(true)}
                className="inline-flex size-6 shrink-0 items-center justify-center rounded-full border border-darkBlue/15 text-darkBlue/65 transition hover:bg-darkBlue/5"
              >
                <Info className="size-3.5" />
              </button>
            </div>
            <textarea
              id="sms_reminder_template"
              rows={4}
              value={settings.template}
              onChange={(event) => update("template", event.target.value)}
              className={`rounded-xl border px-3 py-2 ${
                messageExceedsLimit
                  ? "border-red-300 bg-red-50/40 focus:border-red-400 focus:outline-none focus:ring-2 focus:ring-red-100"
                  : "border-darkBlue/15"
              }`}
            />
            <span className="text-xs text-darkBlue/55">Variables : {"{firstName} {date} {time} {guests} {restaurantName}"}</span>
            {messageExceedsLimit ? (
              <span className="flex items-start gap-1.5 text-xs text-red-600">
                <AlertTriangle className="mt-0.5 size-3.5 shrink-0" />
                Le message dépasse la limite d&apos;un SMS : {analysis.units}/
                {analysis.maxUnits} unités.
              </span>
            ) : null}
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
          <div className="border-t border-darkBlue/10 pt-5">
            <div className="mb-4">
              <p className="font-semibold text-darkBlue">Quotas</p>
              <p className="text-sm text-darkBlue/60">
                100 crédits inclus par période de facturation, puis 0,10 € par
                crédit.
              </p>
            </div>
            <div className="grid gap-4">
              <label className="grid gap-1 text-sm">Plafond de dépassement par période (€)<input type="number" min="0" step="0.1" value={settings.billingPeriodSpendingLimit ?? ""} placeholder="Sans plafond" onChange={(event) => update("billingPeriodSpendingLimit", event.target.value === "" ? null : Number(event.target.value))} className="rounded-xl border border-darkBlue/15 px-3 py-2" /></label>
              <div className="grid grid-cols-2 gap-3 text-sm md:grid-cols-4">
                <div className="rounded-xl bg-slate-50 p-3"><span className="block text-darkBlue/55">Inclus</span><strong>{usage.includedCredits || 100}</strong></div>
                <div className="rounded-xl bg-slate-50 p-3"><span className="block text-darkBlue/55">Consommés</span><strong>{Number(usage.consumedCredits || 0)}</strong></div>
                <div className="rounded-xl bg-slate-50 p-3"><span className="block text-darkBlue/55">Inclus utilisés</span><strong>{Number(usage.includedCreditsConsumed || 0)}</strong></div>
                <div className="rounded-xl bg-slate-50 p-3"><span className="block text-darkBlue/55">Supplément</span><strong>{Number(usage.overageCredits || 0)} · {Number(usage.overageAmount || 0).toFixed(2)} €</strong></div>
              </div>
            </div>
          </div>
              </div>
            ) : null}
            {subscribed && error ? (
              <p className="mt-5 text-sm text-red-600">{error}</p>
            ) : !subscribed && error ? (
              <p className="mt-3 text-sm text-red-600">{error}</p>
            ) : null}
          </>
        )}
      </div>
      {showDestinations ? (
        <SmsDestinationsModalReservationsComponent
          destinations={destinations}
          restaurantName={restaurantData?.name || ""}
          onClose={() => setShowDestinations(false)}
        />
      ) : null}
      {showPreview ? (
        <SmsPreviewModalReservationsComponent
          analysis={analysis}
          message={preview}
          onClose={() => setShowPreview(false)}
        />
      ) : null}
      {showScheduleInfo ? (
        <div
          className="fixed inset-0 z-[220] flex items-end justify-center tablet:items-center"
          role="dialog"
          aria-modal="true"
          aria-labelledby="sms-schedule-info-title"
        >
          <button
            type="button"
            aria-label="Fermer"
            className="absolute inset-0 bg-darkBlue/35"
            onClick={() => setShowScheduleInfo(false)}
          />
          <div className="relative w-full rounded-t-3xl border border-darkBlue/10 bg-white p-5 shadow-[0_25px_80px_rgba(19,30,54,0.25)] tablet:max-w-lg tablet:rounded-3xl">
            <div className="flex items-start justify-between gap-4">
              <div className="flex items-start gap-3">
                <span className="inline-flex size-10 shrink-0 items-center justify-center rounded-2xl bg-darkBlue/5">
                  <Info className="size-5 text-darkBlue" />
                </span>
                <div>
                  <h2
                    id="sms-schedule-info-title"
                    className="font-semibold text-darkBlue"
                  >
                    Plage horaire d’envoi
                  </h2>
                  <p className="mt-2 text-sm leading-relaxed text-darkBlue/70">
                    Les rappels SMS sont envoyés entre 8h et 21h. Si l’heure
                    prévue tombe en dehors de cette plage, elle est
                    automatiquement ajustée dans la mesure du possible.
                  </p>
                </div>
              </div>
              <button
                type="button"
                aria-label="Fermer"
                onClick={() => setShowScheduleInfo(false)}
                className="inline-flex shrink-0 items-center justify-center rounded-full border border-darkBlue/10 bg-white p-2 transition hover:bg-darkBlue/5"
              >
                <X className="size-4 text-darkBlue/70" />
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </section>
  );
}
