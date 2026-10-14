import { useEffect, useMemo, useState } from "react";
import axios from "axios";
import { Check, Info, Loader2, MessageSquareText, Save } from "lucide-react";
import SmsTemplateEditor from "../_shared/reservations/sms-template-editor.reservations.component";
import SmsPreviewModal from "../_shared/reservations/sms-preview-modal.reservations.component";
import SmsDestinationsModalReservationsComponent from "../_shared/reservations/sms-destinations-modal.reservations.component";
import useSmsModuleToggle from "../_shared/use-sms-module-toggle";
import SmsSubscriptionActionModal from "../_shared/sms-subscription-action-modal.component";
import {
  analyzeSingleSms,
  normalizeToGsm7,
  renderSmsPreview,
  smsTemplateToBackend,
  smsTemplateToDisplay,
  getSmsQuotaPresentation,
  formatSmsEuro,
} from "../_shared/reservations/sms-message.utils";

const VARIABLE_LABELS = {
  firstName: "Prénom",
  restaurantName: "Nom du restaurant",
  orderNumber: "Numéro de commande",
  date: "Date",
  time: "Heure",
  fulfillmentMode: "Retrait ou livraison",
  total: "Total",
  reason: "Motif",
  rejectedItems: "Articles et quantités refusés",
  refundAmount: "Montant du remboursement",
};

function SmsEventEditor({
  event,
  selection,
  onChange,
  restaurantName,
  sender,
  destination,
  disabled,
  onPreview,
}) {
  const variables = useMemo(
    () =>
      event.variables.map((key) => ({
        backend: `{${key}}`,
        display: `{${VARIABLE_LABELS[key] || key}}`,
      })),
    [event.variables],
  );
  const backendTemplate = smsTemplateToBackend(selection.template, variables);
  const supportedSender =
    sender.status === "approved" &&
    ["alpha", "registered_alpha"].includes(destination?.senderMode);
  const message = normalizeToGsm7(
    (supportedSender ? "" : `${restaurantName}: `) +
      renderSmsPreview(
        backendTemplate,
        {
          firstName: "Alexandre",
          restaurantName,
          orderNumber: "TA-1234",
          date: "31/12/2026",
          time: "20:30",
          fulfillmentMode:
            event.key === "out_for_delivery" ? "livraison" : "retrait",
          total: "25,00 EUR",
          reason: "Article indisponible",
          rejectedItems: "2 x Pizza, 1 x Dessert",
          refundAmount: "12,00 EUR",
        },
        variables,
      ),
  ).value;
  const analysis = analyzeSingleSms(message);
  const unknownVariables = [...backendTemplate.matchAll(/\{([^{}]+)\}/g)].some(
    (match) => !event.variables.includes(match[1]),
  );
  const invalid =
    !analysis.valid || !backendTemplate.trim() || unknownVariables;
  return (
    <div className="grid gap-3 rounded-2xl border border-darkBlue/10 p-4">
      <div className="flex items-center justify-between gap-3">
        <label className="flex min-w-0 items-center gap-3 text-sm font-semibold">
          <input
            type="checkbox"
            className="m-0 size-4 shrink-0"
            checked={selection.enabled}
            disabled={disabled}
            onChange={(e) => onChange({ enabled: e.target.checked })}
          />
          {event.label}
        </label>
        {selection.enabled ? (
          <button
            type="button"
            aria-label={`Aperçu du SMS : ${event.label}`}
            title="Aperçu du SMS"
            onClick={() => onPreview({ message, analysis })}
            className="inline-flex size-7 shrink-0 items-center justify-center rounded-full border border-darkBlue/15 text-darkBlue/65 transition hover:bg-darkBlue/5"
          >
            <Info className="size-4" />
          </button>
        ) : null}
      </div>
      {selection.enabled ? (
        <>
          <label id={`take-away-sms-${event.key}-label`} className="text-sm">
            Message
          </label>
          <SmsTemplateEditor
            id={`take-away-sms-${event.key}`}
            labelId={`take-away-sms-${event.key}-label`}
            variables={variables}
            value={smsTemplateToDisplay(selection.template, variables)}
            onChange={(value) =>
              onChange({ template: smsTemplateToBackend(value, variables) })
            }
            compact
            invalid={invalid}
            disabled={disabled}
          />
          <div className="text-xs text-darkBlue/60">
            <p>
              {destination
                ? `${analysis.segmentCount} segment(s) · ${analysis.segmentCount * destination.billingCredits} crédit(s) estimé(s)`
                : "Aucune destination configurée pour cette estimation."}
            </p>
          </div>
          {invalid ? (
            <p className="text-xs text-red">
              Vérifiez le message : texte requis, variables autorisées et
              caractères GSM-7.
            </p>
          ) : null}
          {event.key === "partial_rejection" ? (
            <p className="text-xs text-darkBlue/60">
              Un seul SMS récapitule chaque opération. Le montant concerne un
              remboursement prévu, pas un remboursement effectué ; il est non
              applicable pour un paiement sur place.
            </p>
          ) : null}
          {event.key === "refund_confirmed" ? (
            <p className="text-xs text-darkBlue/60">
              Ce message est déclenché uniquement après confirmation du
              remboursement par Stripe.
            </p>
          ) : null}
        </>
      ) : null}
    </div>
  );
}

export default function TakeAwaySmsNotifications({ restaurant }) {
  const restaurantId = restaurant?._id;
  const [data, setData] = useState(null);
  const [settings, setSettings] = useState(null);
  const [sharedSettings, setSharedSettings] = useState({
    internationalEnabled: false,
    billingPeriodSpendingLimit: null,
  });
  const [sharedDirtyKeys, setSharedDirtyKeys] = useState([]);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [saved, setSaved] = useState(false);
  const [preview, setPreview] = useState(null);
  const [showDestinations, setShowDestinations] = useState(false);
  const activation = useSmsModuleToggle({
    restaurantId, module: "take_away", enabled: settings?.enabled, modules: data?.modules, commercial: data?.commercial,
    onUpdated: (response) => {
      setData((current) => ({ ...current, commercial: response.commercial,
        subscribed: Boolean(response.commercial?.active), modules: response.modules }));
      setSettings((current) => ({ ...current, enabled: response.modules.take_away }));
    },
  });
  useEffect(() => {
    let active = true;
    setData(null);
    setSettings(null);
    setSharedDirtyKeys([]);
    setError("");
    setDirty(false);
    setSaved(false);
    const token = localStorage.getItem("token");
    axios
      .get(
        `${process.env.NEXT_PUBLIC_API_URL}/restaurants/${restaurantId}/take-away/sms-notifications`,
        { headers: { Authorization: `Bearer ${token}` } },
      )
      .then(({ data: response }) => {
        if (active) {
          setData(response);
          setSettings(response.settings);
          setSharedSettings({
            internationalEnabled: response.internationalEnabled === true,
            billingPeriodSpendingLimit:
              response.billingPeriodSpendingLimit ?? null,
          });
        }
      })
      .catch((failure) => {
        if (active)
          setError(
            failure.response?.data?.message ||
              "Impossible de charger les notifications SMS.",
          );
      });
    return () => {
      active = false;
    };
  }, [restaurantId, restaurant?.options?.sms_reminders]);

  function updateEvent(key, patch) {
    setDirty(true);
    setSaved(false);
    setSettings((current) => ({
      ...current,
      events: {
        ...current.events,
        [key]: { ...current.events[key], ...patch },
      },
    }));
  }
  async function save() {
    setSaving(true);
    setError("");
    setSaved(false);
    try {
      const token = localStorage.getItem("token");
      const { data: savedSettings } = await axios.put(
        `${process.env.NEXT_PUBLIC_API_URL}/restaurants/${restaurantId}/take-away/settings`,
        {
          settings: {
            smsNotifications: settings,
            ...(sharedDirtyKeys.length
              ? {
                  smsSharedSettings: Object.fromEntries(
                    sharedDirtyKeys.map((key) => [key, sharedSettings[key]]),
                  ),
                }
              : {}),
          },
        },
        { headers: { Authorization: `Bearer ${token}` } },
      );
      if (sharedDirtyKeys.length) {
        const refreshed = savedSettings.sharedSmsSettings;
        setSharedSettings({
          internationalEnabled: refreshed.internationalEnabled === true,
          billingPeriodSpendingLimit:
            refreshed.billingPeriodSpendingLimit ?? null,
        });
        setSharedDirtyKeys([]);
      }
      setDirty(false);
      setSaved(true);
    } catch (failure) {
      setError(
        failure.response?.data?.message ||
          "Impossible d’enregistrer les notifications SMS.",
      );
    } finally {
      setSaving(false);
    }
  }
  const destinations = (data?.destinations || [])
    .filter(
      (item) => item.country === "FR" || sharedSettings.internationalEnabled,
    )
    .map((item) => ({ ...item, enabled: true }));
  const hasInternationalDestination = (data?.destinations || []).some(
    (item) => item.country !== "FR",
  );
  const destination =
    destinations.find((item) => item.country === "FR") || destinations[0];
  const quota = getSmsQuotaPresentation(data?.usage);
  const card = "rounded-3xl border border-darkBlue/10 bg-white/70 shadow-sm";
  return (
    <section className={card}>
      <div className="p-4 midTablet:p-6">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <h2 className="flex items-center gap-2 text-base font-semibold text-darkBlue">
              <MessageSquareText className="size-4 shrink-0 opacity-60" />
              Notifications SMS
            </h2>
            <p className="text-sm text-darkBlue/60">
              Envoyer des notifications sur les étapes de commande à emporter.
            </p>
          </div>
          {data && settings && (dirty || saving || saved) ? (
            <button
              type="button"
              onClick={save}
              disabled={!data.subscribed || saving || saved || activation.loading}
              className={`inline-flex h-10 shrink-0 items-center gap-2 rounded-xl px-3 text-sm font-semibold transition ${saved ? "border border-darkBlue bg-white text-darkBlue opacity-60" : "bg-darkBlue text-white hover:opacity-90"} disabled:cursor-not-allowed disabled:opacity-60`}
              aria-label="Enregistrer"
              title="Enregistrer"
            >
              {saving ? (
                <Loader2 className="size-4 animate-spin" />
              ) : saved ? (
                <Check className="size-4" />
              ) : (
                <Save className="size-4" />
              )}
              {saving
                ? "Enregistrement…"
                : saved
                  ? "Enregistré"
                  : "Enregistrer"}
            </button>
          ) : null}
        </div>
        <div className="my-4 h-px bg-darkBlue/10" />
        {error || activation.error ? (
          <p role="alert" className="mb-4 text-sm font-semibold text-red">
            {error || activation.error}
          </p>
        ) : null}
        {!data || !settings ? (
          error ? null : (
            <Loader2 className="size-5 animate-spin text-darkBlue/60" />
          )
        ) : (
          <>
            <div className="grid gap-5">
              {!data.subscribed ? (
                <p className="text-sm text-darkBlue/60">
                  Contactez Gusto pour souscrire à l’option SMS.
                </p>
              ) : null}
              <div className="rounded-2xl border border-darkBlue/10 bg-white/60 p-3">
                <label className="flex items-center justify-between gap-3 text-sm">
                  <span className="min-w-0">
                    <span className="block font-semibold text-darkBlue">
                      Activer les notifications SMS
                    </span>
                    <span className="mt-1 block text-xs text-darkBlue/50">
                      Notifications propres aux commandes à emporter.
                    </span>
                  </span>
                  <span
                    className={`relative inline-flex h-8 w-14 shrink-0 items-center rounded-full border transition ${activation.enabled ? "border-blue/40 bg-blue" : "border-darkBlue/10 bg-darkBlue/10"}`}
                  >
                    <input
                      type="checkbox"
                      className="peer sr-only"
                      checked={activation.enabled}
                      aria-busy={activation.loading}
                      disabled={saving || activation.loading || (!data.subscribed && !data.commercial?.canSelfManage)}
                      onChange={(event) => { setError(""); activation.changeModule(event.target.checked); }}
                    />
                    <span
                      className={`absolute left-1 top-1/2 size-6 -translate-y-1/2 rounded-full bg-white shadow-sm transition ${activation.enabled ? "translate-x-6" : ""}`}
                    />
                  </span>
                </label>
                {activation.statusText ? <p role="status" className="mt-2 text-xs text-darkBlue/60">{activation.statusText}</p> : null}
              </div>
              {data.commercial?.status === "scheduled" ? (
                <div className="rounded-2xl border border-orange/20 bg-orange/5 px-3 py-3 text-sm text-darkBlue/70">
                  <p>Résiliation programmée au {new Intl.DateTimeFormat("fr-FR").format(new Date(data.commercial.effectiveAt))}. Le module reste actif jusque-là.</p>
                  <button type="button" disabled={activation.loading || !data.commercial.canSelfManage}
                    className="mt-2 font-semibold text-blue underline"
                    onClick={() => activation.cancelScheduledDeactivation(data.commercial)}>
                    Annuler la résiliation
                  </button>
                </div>
              ) : null}
              <p className="text-xs text-darkBlue/60">
                Les commandes manuelles sont exclues. L’attente de validation
                est notifiée après paiement confirmé ou pour un paiement sur
                place. Les SMS sont déclenchés immédiatement ; les variables
                peuvent augmenter le nombre de segments.
              </p>
              <div className="border-t border-darkBlue/10 pt-5">
                <div className="mb-4">
                  <p className="font-semibold text-darkBlue">Quotas</p>
                  <p className="text-sm text-darkBlue/60">
                    100 crédits inclus par période de facturation, puis 0,10 €
                    par crédit.
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
                          {quota.includedUsed} / {quota.included} crédit
                          {quota.included > 1 ? "s" : ""}
                        </p>
                      </div>
                      <p className="text-sm font-semibold text-darkBlue/60">
                        {quota.percentage} %
                      </p>
                    </div>
                    <div
                      className="mt-3 h-2 overflow-hidden rounded-full bg-darkBlue/10"
                      role="progressbar"
                      aria-label="Crédits inclus utilisés"
                      aria-valuemin={0}
                      aria-valuemax={quota.included}
                      aria-valuenow={Math.min(
                        quota.includedUsed,
                        quota.included,
                      )}
                    >
                      <div
                        className="h-full rounded-full bg-blue transition-[width]"
                        style={{ width: `${quota.percentage}%` }}
                      />
                    </div>
                    <p className="mt-2 text-xs text-darkBlue/55">
                      {quota.remaining} crédit
                      {quota.remaining > 1 ? "s" : ""} restant
                      {quota.remaining > 1 ? "s" : ""}
                    </p>
                  </div>
                  <div className="grid gap-3 desktop:grid-cols-2">
                    <div className="rounded-2xl border border-darkBlue/10 bg-white/60 p-4">
                      <p className="text-sm font-medium text-darkBlue/65">
                        Hors forfait
                      </p>
                      <p className="mt-2 text-lg font-semibold text-darkBlue">
                        {quota.overageCredits} crédit
                        {quota.overageCredits > 1 ? "s" : ""}
                      </p>
                      <p className="text-sm text-darkBlue/60">
                        {formatSmsEuro(quota.overageAmount)}
                      </p>
                    </div>
                    <label className="grid gap-2 rounded-2xl border border-darkBlue/10 bg-white/60 p-4 text-sm">
                      <span className="font-medium text-darkBlue/65">
                        Plafond de dépassement (€)
                      </span>
                      <input
                        type="number"
                        min="0"
                        max="10000"
                        step="0.1"
                        value={sharedSettings.billingPeriodSpendingLimit ?? ""}
                        placeholder="Sans plafond"
                        disabled={
                          !data.subscribed ||
                          !data.canEditSharedSettings ||
                          saving
                        }
                        onChange={(event) => {
                          const value =
                            event.target.value === ""
                              ? null
                              : Number(event.target.value);
                          setSaved(false);
                          setDirty(true);
                          setSharedSettings((current) => ({
                            ...current,
                            billingPeriodSpendingLimit: value,
                          }));
                          setSharedDirtyKeys((current) =>
                            current.includes("billingPeriodSpendingLimit")
                              ? current
                              : [...current, "billingPeriodSpendingLimit"],
                          );
                        }}
                        className="rounded-xl border border-darkBlue/15 bg-white px-3 py-2"
                      />
                    </label>
                  </div>
                </div>
              </div>
              <label
                className={`flex items-center gap-3 text-sm ${hasInternationalDestination ? "" : "text-darkBlue/45"}`}
              >
                <input
                  type="checkbox"
                  className="size-4 disabled:cursor-not-allowed"
                  checked={sharedSettings.internationalEnabled}
                  disabled={
                    !data.subscribed ||
                    !data.canEditSharedSettings ||
                    saving ||
                    !hasInternationalDestination
                  }
                  onChange={(event) => {
                    setSaved(false);
                    setDirty(true);
                    setSharedSettings((current) => ({
                      ...current,
                      internationalEnabled: event.target.checked,
                    }));
                    setSharedDirtyKeys((current) =>
                      current.includes("internationalEnabled")
                        ? current
                        : [...current, "internationalEnabled"],
                    );
                  }}
                />
                Autoriser les SMS vers les destinations internationales
                disponibles
                <button
                  type="button"
                  aria-label="Afficher les destinations SMS disponibles"
                  className="inline-flex size-7 shrink-0 items-center justify-center rounded-full border border-darkBlue/15 text-darkBlue/65"
                  onClick={() => setShowDestinations(true)}
                >
                  <Info className="size-4" />
                </button>
              </label>
              {!hasInternationalDestination ? (
                <p className="-mt-3 text-xs text-darkBlue/50">
                  Aucune destination internationale n’est actuellement
                  disponible.
                </p>
              ) : null}
              {settings.enabled ? (
                <>
                  {data.events
                    .filter(
                      (event) =>
                        (event.key !== "ready" ||
                          restaurant.takeAwaySettings?.pickupEnabled !==
                            false) &&
                        (event.key !== "out_for_delivery" ||
                          restaurant.takeAwaySettings?.deliveryEnabled ===
                            true),
                    )
                    .map((event) => (
                      <SmsEventEditor
                        key={event.key}
                        event={event}
                        selection={settings.events[event.key]}
                        onChange={(patch) => updateEvent(event.key, patch)}
                        restaurantName={restaurant.name || "Restaurant"}
                        sender={data.sender}
                        destination={destination}
                        disabled={!data.subscribed || saving || activation.loading}
                        onPreview={setPreview}
                      />
                    ))}
                </>
              ) : null}
            </div>
          </>
        )}
        {preview ? (
          <SmsPreviewModal {...preview} onClose={() => setPreview(null)} />
        ) : null}
        {showDestinations ? (
          <SmsDestinationsModalReservationsComponent
            destinations={destinations}
            restaurantName={restaurant.name || ""}
            onClose={() => setShowDestinations(false)}
          />
        ) : null}
        <SmsSubscriptionActionModal
          pending={activation.pending} loading={activation.confirming} preparing={activation.preparing} error={activation.error}
          onClose={activation.close} onConfirm={activation.confirm}
        />
      </div>
    </section>
  );
}
