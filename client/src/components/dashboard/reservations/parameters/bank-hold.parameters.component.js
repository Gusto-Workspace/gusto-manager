import { CreditCard, Save, Check, Loader2, Info } from "lucide-react";

export default function BankHoldParametersComponent({
  register,
  watch,
  errors,
  saveUI,
  onSave,
  stripeReady = false,
}) {
  const enabled = Boolean(watch("bank_hold_enabled"));
  const canToggle = stripeReady || enabled;

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
  const toggleDisabled = "opacity-50 cursor-not-allowed";
  const toggleDot =
    "absolute top-1/2 -translate-y-1/2 h-6 w-6 rounded-full bg-white shadow-sm transition";
  const toggleDotOn = "translate-x-7";
  const toggleDotOff = "translate-x-1";

  const inputBase =
    "h-11 w-full rounded-2xl border border-darkBlue/10 bg-white/80 px-4 text-base outline-none transition placeholder:text-darkBlue/35 focus:border-blue/60 focus:ring-2 focus:ring-blue/20 disabled:opacity-50";

  const saveBtnBase =
    "inline-flex items-center gap-2 rounded-xl px-3 h-10 text-sm font-semibold transition";
  const saveBtnPrimary =
    "bg-darkBlue text-white hover:opacity-90 active:scale-[0.98]";
  const saveBtnDone =
    "bg-white text-darkBlue border border-darkBlue opacity-60";

  return (
    <div className={card}>
      <div className={cardInner}>
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <p className={sectionTitle}>
              <CreditCard className="size-4 shrink-0 opacity-60" />
              Empreinte bancaire
            </p>
            <p className={hint}>
              Demander une carte bancaire pour sécuriser les réservations.
            </p>
          </div>

          {(saveUI?.dirty || saveUI?.saving || saveUI?.saved) && (
            <button
              type="button"
              onClick={onSave}
              disabled={saveUI?.saving || saveUI?.saved}
              className={[
                saveBtnBase,
                saveUI?.saved ? saveBtnDone : saveBtnPrimary,
                saveUI?.saving ? "opacity-60 cursor-not-allowed" : "",
              ].join(" ")}
            >
              {saveUI?.saving ? (
                <>
                  <Loader2 className="size-4 animate-spin" />
                  Enregistrement…
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
          )}
        </div>

        <div className={divider} />

        <div className="grid grid-cols-1 midTablet:grid-cols-2 gap-3">
          <div className="rounded-2xl border border-darkBlue/10 bg-white/60 p-3 h-fit">
            <div className="flex items-center justify-between gap-3">
              <p className="font-semibold text-darkBlue">
                Activer l’empreinte bancaire
              </p>

              <label className={toggleWrap}>
                <span
                  className={[
                    toggleBase,
                    enabled ? toggleOn : toggleOff,
                    !canToggle ? toggleDisabled : "",
                  ].join(" ")}
                >
                  <input
                    type="checkbox"
                    className="sr-only"
                    id="bank_hold_enabled"
                    disabled={!canToggle}
                    {...register("bank_hold_enabled")}
                  />
                  <span
                    className={[
                      toggleDot,
                      enabled ? toggleDotOn : toggleDotOff,
                    ].join(" ")}
                  />
                </span>
              </label>
            </div>

            {!stripeReady ? (
              <div className="mt-3 rounded-2xl border border-blue/15 bg-blue/5 px-3 py-3 text-sm text-darkBlue/70">
                <div className="flex items-start gap-2">
                  <Info className="mt-0.5 size-4 shrink-0 text-blue" />
                  <p>
                    Pour activer l’empreinte bancaire, veuillez contacter le
                    service client afin de configurer l'option.
                  </p>
                </div>
              </div>
            ) : null}
          </div>

          <div className="rounded-2xl border border-darkBlue/10 bg-white/60 p-3">
            <p className="font-semibold text-darkBlue">
              Montant par personne (€)
            </p>
            <p className="text-xs text-darkBlue/50 mt-1">
              Exemple : 10 € par personne pour une table de 4 = 40 €.
            </p>

            <div className="mt-3">
              <input
                type="number"
                min="0"
                step="0.01"
                disabled={!enabled || !stripeReady}
                onWheel={(e) => e.currentTarget.blur()}
                className={inputBase}
                {...register("bank_hold_amount_per_person", {
                  required: enabled,
                  min: 0,
                  valueAsNumber: true,
                })}
              />

              {errors?.bank_hold_amount_per_person && (
                <p className="mt-2 text-xs text-red">
                  Veuillez saisir un montant valide.
                </p>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
