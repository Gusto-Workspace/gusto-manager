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
import {
  analyzeSingleSms,
  formatSmsEuro,
  getGsm7SmsSegmentCount,
  getSmsQuotaPresentation,
  normalizeToGsm7,
  renderSmsPreview,
  smsTemplateToBackend,
  smsTemplateToDisplay,
} from "./sms-message.utils";
import SmsDestinationsModalReservationsComponent from "./sms-destinations-modal.reservations.component";
import SmsPreviewModalReservationsComponent from "./sms-preview-modal.reservations.component";
import SmsTemplateEditorReservationsComponent from "./sms-template-editor.reservations.component";

const DEFAULT_TEMPLATE = "Bonjour {firstName}, pour rappel, votre table chez {restaurantName} est réservée le {date} à {time} pour {guests} pers.";

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
  const [settings, setSettings] = useState({ enabled: false, delayMinutes: 1440, deliveryMode: "sms_always", template: smsTemplateToDisplay(DEFAULT_TEMPLATE), internationalEnabled: false, billingPeriodSpendingLimit: null });

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
          template: smsTemplateToDisplay(
            data.settings?.template || current.template,
          ),
        }));
        setUsage(data.usage || { includedCredits: 100 });
        setDestinations(activeDestinations);
        setDirty(false);
      })
      .catch((requestError) => active && setError(requestError?.response?.data?.message || "Impossible de charger les rappels SMS."))
      .finally(() => active && setLoading(false));
    return () => { active = false; };
  }, [restaurantId]);

  const backendTemplate = useMemo(
    () => smsTemplateToBackend(settings.template),
    [settings.template],
  );
  const preview = useMemo(
    () =>
      normalizeToGsm7(
        renderSmsPreview(backendTemplate, {
          firstName: "Camille",
          date: "24/09/2026",
          time: "20:00",
          guests: "4",
          restaurantName: restaurantData?.name || "Le Restaurant",
        }),
      ).value,
    [backendTemplate, restaurantData?.name],
  );
  const analysis = useMemo(() => analyzeSingleSms(preview), [preview]);
  const messageIsNotGsm7 = analysis.encoding !== "gsm7";
  const smsSegmentCount = analysis.segmentCount || getGsm7SmsSegmentCount(analysis.units);
  const hasInternationalDestination = destinations.some(
    (destination) => destination.country !== "FR",
  );
  const smsEnabled = subscribed && Boolean(settings.enabled);
  const {
    included: includedCredits,
    includedUsed: includedCreditsUsed,
    remaining: includedCreditsRemaining,
    percentage: includedCreditsPercentage,
    overageCredits,
    overageAmount,
  } = getSmsQuotaPresentation(usage);

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
      const { data } = await axios.put(
        `${process.env.NEXT_PUBLIC_API_URL}/restaurants/${restaurantId}/sms-reminders`,
        { ...settings, template: smsTemplateToBackend(settings.template) },
      );
      setSettings((current) => ({
        ...current,
        ...(data.settings || {}),
        template: smsTemplateToDisplay(
          data.settings?.template || current.template,
        ),
      }));
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
              <label
                id="sms_reminder_template_label"
                htmlFor="sms_reminder_template"
              >
                Modèle de message
              </label>
              <button
                type="button"
                aria-label="Afficher l’aperçu du SMS"
                onClick={() => setShowPreview(true)}
                className="inline-flex size-6 shrink-0 items-center justify-center rounded-full border border-darkBlue/15 text-darkBlue/65 transition hover:bg-darkBlue/5"
              >
                <Info className="size-3.5" />
              </button>
            </div>
            <SmsTemplateEditorReservationsComponent
              value={settings.template}
              onChange={(value) => update("template", value)}
              invalid={messageIsNotGsm7}
              compact={savePresentation === "icon"}
            />
            {!messageIsNotGsm7 ? (
              <div
                className={`text-xs ${smsSegmentCount > 1 ? "text-red" : "text-darkBlue/60"}`}
              >
                <p>Coût estimé : {smsSegmentCount} SMS</p>
                {smsSegmentCount > 1 ? (
                  <p>
                    Le message reste utilisable, mais chaque envoi consommera{" "}
                    {smsSegmentCount} SMS.
                  </p>
                ) : null}
              </div>
            ) : null}
            {messageIsNotGsm7 ? (
              <span className="flex items-start gap-1.5 text-xs text-red">
                <AlertTriangle className="mt-0.5 size-3.5 shrink-0" />
                Un caractère n’est pas compatible avec le format SMS standard.
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
            <div className="grid gap-3">
              <div className="rounded-2xl border border-darkBlue/10 bg-white/60 p-4">
                <div className="flex flex-wrap items-end justify-between gap-2">
                  <div>
                    <p className="text-sm font-medium text-darkBlue/65">
                      Crédits inclus utilisés
                    </p>
                    <p className="mt-1 text-xl font-semibold text-darkBlue">
                      {includedCreditsUsed} / {includedCredits} crédit
                      {includedCredits > 1 ? "s" : ""}
                    </p>
                  </div>
                  <p className="text-sm font-semibold text-darkBlue/60">
                    {includedCreditsPercentage} %
                  </p>
                </div>
                <div
                  className="mt-3 h-2 overflow-hidden rounded-full bg-darkBlue/10"
                  role="progressbar"
                  aria-label="Crédits inclus utilisés"
                  aria-valuemin={0}
                  aria-valuemax={includedCredits}
                  aria-valuenow={Math.min(
                    includedCreditsUsed,
                    includedCredits,
                  )}
                >
                  <div
                    className="h-full rounded-full bg-blue transition-[width]"
                    style={{ width: `${includedCreditsPercentage}%` }}
                  />
                </div>
                <p className="mt-2 text-xs text-darkBlue/55">
                  {includedCreditsRemaining} crédit
                  {includedCreditsRemaining > 1 ? "s" : ""} restant
                  {includedCreditsRemaining > 1 ? "s" : ""}
                </p>
              </div>

              <div
                className={`grid gap-3 ${
                  savePresentation === "icon" ? "" : "desktop:grid-cols-2"
                }`}
              >
                <div className="rounded-2xl border border-darkBlue/10 bg-white/60 p-4">
                  <p className="text-sm font-medium text-darkBlue/65">
                    Hors forfait
                  </p>
                  <p className="mt-2 text-lg font-semibold text-darkBlue">
                    {overageCredits} crédit
                    {overageCredits > 1 ? "s" : ""}
                  </p>
                  <p className="text-sm text-darkBlue/60">
                    {formatSmsEuro(overageAmount)}
                  </p>
                </div>
                <label className="grid gap-2 rounded-2xl border border-darkBlue/10 bg-white/60 p-4 text-sm">
                  <span className="font-medium text-darkBlue/65">
                    Plafond de dépassement
                  </span>
                  <input
                    type="number"
                    min="0"
                    step="0.1"
                    value={settings.billingPeriodSpendingLimit ?? ""}
                    placeholder="Sans plafond"
                    onChange={(event) =>
                      update(
                        "billingPeriodSpendingLimit",
                        event.target.value === ""
                          ? null
                          : Number(event.target.value),
                      )
                    }
                    className="rounded-xl border border-darkBlue/15 bg-white px-3 py-2"
                  />
                </label>
              </div>
            </div>
          </div>
              </div>
            ) : null}
            {subscribed && error ? (
              <p className="mt-5 text-sm text-red">{error}</p>
            ) : !subscribed && error ? (
              <p className="mt-3 text-sm text-red">{error}</p>
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
