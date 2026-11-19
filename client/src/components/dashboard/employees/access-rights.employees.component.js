import { useState } from "react";
import { useTranslation } from "next-i18next";

const modules = {
  dashboard: "dashboard",
  restaurant: "restaurant",
  menus: "menus",
  dishes: "dishes",
  drinks: "drinks",
  wines: "wines",
  news: "news",
  gift_card: "giftCards",
  reservations: "reservations",
  take_away: "takeAway",
  employees: "employees",
  customers: "customers",
  health_control_plan: "health",
};

export default function AccessRightsEmployeesComponent({ options = {}, onSave, hasEmail }) {
  const { t } = useTranslation(["employees", "common"]);
  const [changes, setChanges] = useState({});
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);
  const dirty = Object.keys(changes).length > 0;

  function toggle(key, checked) {
    setSaved(false);
    setChanges((previous) => {
      const next = { ...previous, [key]: checked };
      if (checked === Boolean(options[key])) delete next[key];
      return next;
    });
  }

  async function submit(event) {
    event.preventDefault();
    if (saving || !dirty) return;
    setSaving(true);
    setError("");
    try {
      await onSave({ options: changes });
      setChanges({});
      setSaved(true);
    } catch (failure) {
      setError(failure.response?.data?.message || "Impossible d’enregistrer les accès.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={submit} className="grid gap-4 overflow-hidden rounded-xl border border-darkBlue/10 bg-white p-4 midTablet:p-5">
      <header className="-mx-4 -mt-4 flex min-h-16 flex-wrap items-center justify-between gap-3 border-b border-darkBlue/10 px-4 py-3 midTablet:-mx-5 midTablet:-mt-5 midTablet:px-5">
        <h2 className="flex min-h-10 items-center text-lg font-semibold">Compte et accès</h2>
        {!hasEmail && <p className="text-sm text-darkBlue/70">Ce compte n’a pas d’e-mail de connexion.</p>}
      </header>
      <fieldset className="grid gap-x-6 gap-y-1 midTablet:grid-cols-2 [&>label:last-of-type]:border-b-0 midTablet:[&>label:nth-last-of-type(2):nth-of-type(odd)]:border-b-0" disabled={saving}>
        <legend className="mb-2 text-sm font-semibold">Modules autorisés pour ce restaurant</legend>
        {Object.entries(modules).map(([key, label]) => (
          <label key={key} className="flex min-h-10 cursor-pointer items-center justify-between gap-3 border-b border-darkBlue/10 px-2 text-sm hover:bg-lightGrey">
            {t(`common:nav.${label}`)}
            <input type="checkbox" checked={changes[key] ?? Boolean(options[key])} onChange={(event) => toggle(key, event.target.checked)}
              className="size-4 rounded border-darkBlue/30 text-blue focus:ring-blue" />
          </label>
        ))}
      </fieldset>
      {error && <p role="alert" className="text-sm text-red">{error}</p>}
      {saved && <p role="status" className="text-sm text-[#146144]">Accès enregistrés.</p>}
      {dirty && (
        <div className="flex flex-wrap justify-end gap-2">
          <button type="button" disabled={saving} onClick={() => { setChanges({}); setError(""); }} className="min-h-10 rounded-lg border border-darkBlue/15 px-3 text-sm font-semibold">{t("buttons.cancel")}</button>
          <button type="submit" disabled={saving} className="min-h-10 rounded-lg bg-blue px-3 text-sm font-semibold text-white disabled:opacity-60">{saving ? t("buttons.loading") : t("buttons.save")}</button>
        </div>
      )}
    </form>
  );
}
