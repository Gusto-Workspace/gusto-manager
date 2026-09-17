import { useMemo, useState } from "react";
import axios from "axios";
import { Loader2, X } from "lucide-react";

const SENDER_MODES = [
  "alpha",
  "registered_alpha",
  "numeric",
  "shortcode",
  "provider_default",
];

function toDateInputValue(value) {
  if (!value) return "";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "" : date.toISOString().slice(0, 10);
}

function buildInitialForm(policy) {
  return {
    enabled: Boolean(policy.enabled),
    senderMode: policy.senderMode || "",
    senderRegistrationRequired: Boolean(policy.senderRegistrationRequired),
    supportsDlr: Boolean(policy.supportsDlr),
    providerRateHt:
      policy.providerRateHt === null || policy.providerRateHt === undefined
        ? ""
        : String(policy.providerRateHt),
    billingCredits:
      policy.billingCredits === null || policy.billingCredits === undefined
        ? ""
        : String(policy.billingCredits),
    fallbackSender: policy.fallbackSender || "",
    lastReviewedAt: toDateInputValue(policy.lastReviewedAt),
  };
}

export default function EditDestinationPolicyAdminComponent({
  policy,
  onClose,
  onSaved,
}) {
  const [form, setForm] = useState(() => buildInitialForm(policy));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const isComplete = useMemo(() => {
    const providerRateHt = Number(form.providerRateHt);
    const billingCredits = Number(form.billingCredits);
    return (
      SENDER_MODES.includes(form.senderMode) &&
      form.providerRateHt !== "" &&
      Number.isFinite(providerRateHt) &&
      providerRateHt >= 0 &&
      form.billingCredits !== "" &&
      Number.isInteger(billingCredits) &&
      billingCredits >= 1 &&
      Boolean(form.lastReviewedAt)
    );
  }, [form]);

  function updateField(field, value) {
    setForm((current) => ({ ...current, [field]: value }));
    setError("");
  }

  async function save(event) {
    event.preventDefault();
    setError("");

    if (!isComplete) {
      setError(
        "La politique est incomplète. Renseignez le mode d’envoi, le tarif, les crédits et la date de revue.",
      );
      return;
    }

    if (
      policy.enabled &&
      !form.enabled &&
      !window.confirm(
        `Confirmer la désactivation de la destination ${policy.country} ?`,
      )
    ) {
      return;
    }

    setSaving(true);
    try {
      const token = localStorage.getItem("admin-token");
      await axios.put(
        `${process.env.NEXT_PUBLIC_API_URL}/admin/sms/destination-policies/${policy.country}`,
        {
          ...form,
          providerRateHt: Number(form.providerRateHt),
          billingCredits: Number(form.billingCredits),
        },
        { headers: { Authorization: `Bearer ${token}` } },
      );
      await onSaved();
    } catch (requestError) {
      setError(
        requestError?.response?.data?.message ||
          "Impossible d’enregistrer la politique de destination.",
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-[200] flex items-end justify-center tablet:items-center"
      role="dialog"
      aria-modal="true"
      aria-labelledby="destination-policy-title"
    >
      <button
        type="button"
        aria-label="Fermer"
        className="absolute inset-0 bg-black/35"
        onClick={saving ? undefined : onClose}
      />
      <form
        onSubmit={save}
        className="relative max-h-[92vh] w-full overflow-y-auto rounded-t-3xl bg-white shadow-xl tablet:max-w-2xl tablet:rounded-3xl"
      >
        <div className="flex items-center justify-between border-b border-darkBlue/10 px-5 py-4">
          <div>
            <h2 id="destination-policy-title" className="font-semibold">
              Modifier la destination {policy.country}
            </h2>
            <p className="text-xs text-darkBlue/55">Provider smsmode</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={saving}
            className="rounded-lg p-2 text-darkBlue/60 hover:bg-darkBlue/5 disabled:opacity-50"
            aria-label="Fermer"
          >
            <X className="size-5" />
          </button>
        </div>

        <div className="grid gap-4 p-5 tablet:grid-cols-2">
          <label className="grid gap-1 text-sm">
            <span className="font-medium">Active</span>
            <select
              value={form.enabled ? "yes" : "no"}
              onChange={(event) =>
                updateField("enabled", event.target.value === "yes")
              }
              className="rounded-xl border border-darkBlue/15 bg-white px-3 py-2.5"
            >
              <option value="yes">Oui</option>
              <option value="no">Non</option>
            </select>
          </label>

          <label className="grid gap-1 text-sm">
            <span className="font-medium">Mode d’envoi</span>
            <select
              value={form.senderMode}
              onChange={(event) =>
                updateField("senderMode", event.target.value)
              }
              className="rounded-xl border border-darkBlue/15 bg-white px-3 py-2.5"
              required
            >
              <option value="">Sélectionner</option>
              {SENDER_MODES.map((mode) => (
                <option key={mode} value={mode}>
                  {mode}
                </option>
              ))}
            </select>
          </label>

          <label className="grid gap-1 text-sm">
            <span className="font-medium">Tarif provider HT</span>
            <input
              type="number"
              min="0"
              step="0.0001"
              value={form.providerRateHt}
              onChange={(event) =>
                updateField("providerRateHt", event.target.value)
              }
              className="rounded-xl border border-darkBlue/15 px-3 py-2.5"
              required
            />
          </label>

          <label className="grid gap-1 text-sm">
            <span className="font-medium">Crédits facturés</span>
            <input
              type="number"
              min="1"
              step="1"
              value={form.billingCredits}
              onChange={(event) =>
                updateField("billingCredits", event.target.value)
              }
              className="rounded-xl border border-darkBlue/15 px-3 py-2.5"
              required
            />
          </label>

          <label className="grid gap-1 text-sm">
            <span className="font-medium">Sender de secours</span>
            <input
              type="text"
              value={form.fallbackSender}
              onChange={(event) =>
                updateField("fallbackSender", event.target.value)
              }
              className="rounded-xl border border-darkBlue/15 px-3 py-2.5"
            />
          </label>

          <label className="grid gap-1 text-sm">
            <span className="font-medium">Dernière revue</span>
            <input
              type="date"
              value={form.lastReviewedAt}
              onChange={(event) =>
                updateField("lastReviewedAt", event.target.value)
              }
              className="rounded-xl border border-darkBlue/15 px-3 py-2.5"
              required
            />
          </label>

          <label className="flex items-center gap-3 rounded-xl border border-darkBlue/10 p-3 text-sm">
            <input
              type="checkbox"
              checked={form.senderRegistrationRequired}
              onChange={(event) =>
                updateField(
                  "senderRegistrationRequired",
                  event.target.checked,
                )
              }
              className="size-4"
            />
            Enregistrement Sender requis
          </label>

          <label className="flex items-center gap-3 rounded-xl border border-darkBlue/10 p-3 text-sm">
            <input
              type="checkbox"
              checked={form.supportsDlr}
              onChange={(event) =>
                updateField("supportsDlr", event.target.checked)
              }
              className="size-4"
            />
            DLR supporté
          </label>

          {!isComplete ? (
            <p className="rounded-xl border border-orange-200 bg-orange-50 px-3 py-2 text-sm text-orange-800 tablet:col-span-2">
              Destination incomplète : elle ne peut pas être activée tant que
              les champs obligatoires ne sont pas valides.
            </p>
          ) : null}

          {error ? (
            <p className="rounded-xl border border-red/20 bg-red/10 px-3 py-2 text-sm text-red tablet:col-span-2">
              {error}
            </p>
          ) : null}
        </div>

        <div className="flex gap-2 border-t border-darkBlue/10 px-5 py-4">
          <button
            type="button"
            onClick={onClose}
            disabled={saving}
            className="flex-1 rounded-xl border border-darkBlue/15 px-4 py-2.5 text-sm font-semibold disabled:opacity-50"
          >
            Annuler
          </button>
          <button
            type="submit"
            disabled={saving || (form.enabled && !isComplete)}
            className="inline-flex flex-1 items-center justify-center gap-2 rounded-xl bg-darkBlue px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50"
          >
            {saving ? <Loader2 className="size-4 animate-spin" /> : null}
            Enregistrer
          </button>
        </div>
      </form>
    </div>
  );
}
