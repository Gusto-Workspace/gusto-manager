import { useMemo, useState } from "react";
import axios from "axios";
import { Loader2, X } from "lucide-react";

const SENDER_ID_PATTERN = /^[A-Za-z0-9 ._-]{3,11}$/;

export default function EditSenderIdAdminComponent({
  sender,
  onClose,
  onSaved,
}) {
  const configured = Boolean(String(sender?.value || "").trim());
  const [value, setValue] = useState(sender?.value || "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const normalizedValue = value.trim();
  const valid = useMemo(
    () => SENDER_ID_PATTERN.test(normalizedValue),
    [normalizedValue],
  );

  async function save(event) {
    event.preventDefault();
    setError("");
    if (!valid) {
      setError("Le Sender ID doit contenir 3 à 11 caractères autorisés.");
      return;
    }

    setSaving(true);
    try {
      const token = localStorage.getItem("admin-token");
      const { data } = await axios.put(
        `${process.env.NEXT_PUBLIC_API_URL}/admin/restaurants/${sender.restaurantId}/sms-sender`,
        { value: normalizedValue },
        { headers: { Authorization: `Bearer ${token}` } },
      );
      await onSaved(data);
    } catch (requestError) {
      setError(
        requestError?.response?.data?.message ||
          "Impossible d’enregistrer le Sender ID.",
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-[220] flex items-end justify-center tablet:items-center"
      role="dialog"
      aria-modal="true"
      aria-labelledby="edit-sender-id-title"
    >
      <button
        type="button"
        aria-label="Fermer"
        className="absolute inset-0 bg-darkBlue/35"
        disabled={saving}
        onClick={onClose}
      />
      <form
        onSubmit={save}
        className="relative w-full rounded-t-3xl border border-darkBlue/10 bg-white shadow-[0_25px_80px_rgba(19,30,54,0.25)] tablet:max-w-lg tablet:rounded-3xl"
      >
        <div className="flex items-start justify-between gap-4 border-b border-darkBlue/10 px-5 py-4">
          <div>
            <h2 id="edit-sender-id-title" className="font-semibold text-darkBlue">
              {configured ? "Modifier le Sender ID" : "Configurer le Sender ID"}
            </h2>
            <p className="mt-1 text-xs text-darkBlue/55">
              {sender.restaurantName}
            </p>
          </div>
          <button
            type="button"
            aria-label="Fermer"
            disabled={saving}
            onClick={onClose}
            className="rounded-lg p-2 text-darkBlue/60 transition hover:bg-darkBlue/5 disabled:opacity-50"
          >
            <X className="size-5" />
          </button>
        </div>

        <div className="grid gap-4 p-5">
          <label className="grid gap-1 text-sm">
            <span className="font-medium text-darkBlue">Sender ID</span>
            <input
              type="text"
              value={value}
              maxLength={11}
              autoFocus
              onChange={(event) => {
                setValue(event.target.value);
                setError("");
              }}
              className="rounded-xl border border-darkBlue/15 px-3 py-2.5 uppercase"
              placeholder="SAVEURS"
            />
            <span className="text-xs text-darkBlue/55">
              Le Sender ID doit correspondre à un expéditeur configuré chez le
              fournisseur SMS.
            </span>
          </label>

          {error ? (
            <p className="rounded-xl border border-red/20 bg-red/10 px-3 py-2 text-sm text-red">
              {error}
            </p>
          ) : null}
        </div>

        <div className="flex gap-2 border-t border-darkBlue/10 px-5 py-4">
          <button
            type="button"
            disabled={saving}
            onClick={onClose}
            className="flex-1 rounded-xl border border-darkBlue/15 px-4 py-2.5 text-sm font-semibold disabled:opacity-50"
          >
            Annuler
          </button>
          <button
            type="submit"
            disabled={saving || !valid}
            className="inline-flex flex-1 items-center justify-center gap-2 rounded-xl bg-darkBlue px-4 py-2.5 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50"
          >
            {saving ? <Loader2 className="size-4 animate-spin" /> : null}
            Enregistrer
          </button>
        </div>
      </form>
    </div>
  );
}
