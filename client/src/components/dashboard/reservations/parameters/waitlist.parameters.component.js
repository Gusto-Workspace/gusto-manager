import { Check, Clock, Loader2, Save, UsersRound } from "lucide-react";

export default function WaitlistParametersComponent({
  register,
  watch,
  setValue,
  saveUI,
  onSave,
  savePresentation = "full",
}) {
  const enabled = Boolean(watch("waitlist_enabled"));
  const autoPromoteEnabled = Boolean(watch("waitlist_auto_promote_enabled"));
  const autoCleanupEnabled = Boolean(watch("waitlist_auto_cleanup_enabled"));

  const card = "rounded-3xl border border-darkBlue/10 bg-white/70 shadow-sm";
  const cardInner = "px-2 py-4 mobile:p-4 midTablet:p-6";
  const sectionTitle =
    "text-base font-semibold text-darkBlue flex items-center gap-2";
  const hint = "text-sm text-darkBlue/60";
  const divider = "h-px bg-darkBlue/10 my-4";
  const toggleWrap = "inline-flex items-center gap-2 select-none";
  const toggleBase =
    "relative inline-flex h-8 w-14 items-center rounded-full border transition";
  const toggleOn = "bg-blue border-blue/40";
  const toggleOff = "bg-darkBlue/10 border-darkBlue/10";
  const toggleDot =
    "absolute top-1/2 -translate-y-1/2 h-6 w-6 rounded-full bg-white shadow-sm transition";
  const toggleDotOn = "translate-x-7";
  const toggleDotOff = "translate-x-1";
  const inputBase =
    "h-11 w-full rounded-2xl border border-darkBlue/10 bg-white/80 px-4 text-base outline-none transition placeholder:text-darkBlue/35 focus:border-blue/60 focus:ring-2 focus:ring-blue/20";
  const selectBase =
    "h-11 w-full rounded-2xl border border-darkBlue/10 bg-white/80 px-4 text-base outline-none transition focus:border-blue/60 focus:ring-2 focus:ring-blue/20";
  const saveBtnBase =
    "inline-flex items-center gap-2 rounded-xl px-3 h-10 text-sm font-semibold transition";
  const saveBtnPrimary =
    "bg-darkBlue text-white hover:opacity-90 active:scale-[0.98]";
  const saveBtnDone =
    "bg-white text-darkBlue border border-darkBlue opacity-60";
  const showSaveButton = saveUI?.dirty || saveUI?.saving || saveUI?.saved;

  const toggle = ({ name, checked, onChange }) => (
    <label className={toggleWrap}>
      <span className={[toggleBase, checked ? toggleOn : toggleOff].join(" ")}>
        <input
          type="checkbox"
          className="sr-only"
          id={name}
          {...register(name, onChange ? { onChange } : undefined)}
        />
        <span
          className={[toggleDot, checked ? toggleDotOn : toggleDotOff].join(
            " ",
          )}
        />
      </span>
    </label>
  );

  return (
    <div className={card}>
      <div className={cardInner}>
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <p className={sectionTitle}>
              <UsersRound className="size-4 shrink-0 opacity-60" />
              Liste d’attente
            </p>
            <p className={hint}>
              Inscriptions publiques sur les créneaux complets et propositions
              de places libérées.
            </p>
          </div>

          {showSaveButton ? (
            <button
              type="button"
              onClick={onSave}
              disabled={saveUI?.saving || saveUI?.saved}
              className={[
                savePresentation === "icon"
                  ? "inline-flex h-10 min-w-10 items-center justify-center rounded-xl transition"
                  : saveBtnBase,
                saveUI?.saved ? saveBtnDone : saveBtnPrimary,
                saveUI?.saving ? "opacity-60 cursor-not-allowed" : "",
              ].join(" ")}
              aria-label="Enregistrer"
              title="Enregistrer"
            >
              {savePresentation === "icon" ? (
                saveUI?.saving ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : saveUI?.saved ? (
                  <Check className="size-4" />
                ) : (
                  <Save className="size-4" />
                )
              ) : saveUI?.saving ? (
                <>
                  <Loader2 className="size-4 animate-spin" />
                  Enregistrement...
                </>
              ) : saveUI?.saved ? (
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

        <div className="grid grid-cols-1 gap-3 midTablet:grid-cols-2">
          <div className="rounded-2xl border border-darkBlue/10 bg-white/60 p-3">
            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0">
                <p className="font-semibold text-darkBlue">
                  Autoriser la liste d’attente
                </p>
              </div>
              {toggle({
                name: "waitlist_enabled",
                checked: enabled,
                onChange: (event) => {
                  const checked = event.target.checked;
                  setValue("waitlist_public_enabled", checked, {
                    shouldDirty: true,
                  });

                  if (!event.target.checked) {
                    setValue("waitlist_auto_promote_enabled", false, {
                      shouldDirty: true,
                    });
                  }
                },
              })}
            </div>
          </div>

          <div className="rounded-2xl border border-darkBlue/10 bg-white/60 p-3">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="font-semibold text-darkBlue">
                  Proposer automatiquement les places libérées
                </p>
                <p className="text-xs text-darkBlue/50">
                  Quand une place se libère, le premier client de la liste
                  d’attente reçoit automatiquement une proposition.
                </p>
              </div>
              {toggle({
                name: "waitlist_auto_promote_enabled",
                checked: autoPromoteEnabled,
                onChange: (event) => {
                  if (event.target.checked) {
                    setValue("waitlist_enabled", true, {
                      shouldDirty: true,
                    });
                    setValue("waitlist_public_enabled", true, {
                      shouldDirty: true,
                    });
                  }
                },
              })}
            </div>
          </div>

          <div className="rounded-2xl border border-darkBlue/10 bg-white/60 p-3">
            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0">
                <p className="font-semibold text-darkBlue">
                  Nettoyer les demandes expirées
                </p>
              </div>
              {toggle({
                name: "waitlist_auto_cleanup_enabled",
                checked: autoCleanupEnabled,
              })}
            </div>
          </div>
        </div>

        <div className={divider} />

        <div className="grid grid-cols-1 gap-3 midTablet:grid-cols-2">
          <label className="rounded-2xl border border-darkBlue/10 bg-white/60 p-3">
            <span className="flex items-center gap-2 text-sm font-semibold text-darkBlue">
              <Clock className="size-4 opacity-50" />
              Délai de réponse client
            </span>
            <input
              type="number"
              min="1"
              inputMode="numeric"
              className={[inputBase, "mt-2"].join(" ")}
              {...register("waitlist_public_offer_delay_minutes", {
                min: 1,
              })}
            />
            <span className="mt-1 block text-xs text-darkBlue/50">
              En minutes, par défaut 60.
            </span>
          </label>

          {autoCleanupEnabled ? (
            <label className="rounded-2xl border border-darkBlue/10 bg-white/60 p-3">
              <span className="flex items-center gap-2 text-sm font-semibold text-darkBlue">
                <Clock className="size-4 opacity-50" />
                Nettoyage après le créneau
              </span>
              <select
                className={[selectBase, "mt-2"].join(" ")}
                {...register("waitlist_auto_cleanup_delay_minutes")}
              >
                <option value={60}>1 heure après le créneau</option>
                <option value={120}>2 heures après le créneau</option>
                <option value={360}>6 heures après le créneau</option>
                <option value={720}>12 heures après le créneau</option>
                <option value={1440}>24 heures après le créneau</option>
                <option value={2880}>48 heures après le créneau</option>
                <option value={10080}>7 jours après le créneau</option>
              </select>
              <span className="mt-1 block text-xs text-darkBlue/50">
                Par défaut: 24 heures après date + heure du créneau.
              </span>
            </label>
          ) : null}
        </div>
      </div>
    </div>
  );
}
