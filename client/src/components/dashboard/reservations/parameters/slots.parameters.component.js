import { Clock, Save, Check, Loader2 } from "lucide-react";

export default function SlotsParametersComponent({
  register,
  watch,
  errors,
  auto_accept,
  saveUI,
  onSave,
  savePresentation = "full",
}) {
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

  return (
    <div className={card}>
      <div className={cardInner}>
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <p className={sectionTitle}>
              <Clock className="size-4 shrink-0 opacity-60" />
              Créneaux
            </p>
            <p className={hint}>Paramètres des créneaux et de la validation.</p>
          </div>

          {showSaveButton && (
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
          {/* Interval */}
          <div className="rounded-2xl border border-darkBlue/10 bg-white/60 p-3">
            <p className="font-semibold text-darkBlue">
              Intervalle entre les créneaux
            </p>
            <p className="text-xs text-darkBlue/50">
              Temps minimum entre deux créneaux.
            </p>

            <div className="mt-3">
              <select
                id="interval"
                {...register("interval", { required: true })}
                className={selectBase}
              >
                <option value="15">15 min</option>
                <option value="30">30 min</option>
                <option value="45">45 min</option>
                <option value="60">1 h</option>
              </select>

              {errors?.interval && (
                <p className="mt-2 text-xs text-red">
                  Veuillez choisir un intervalle.
                </p>
              )}
            </div>
          </div>

          {/* Auto accept */}
          <div className="rounded-2xl border border-darkBlue/10 bg-white/60 p-3 h-fit">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="font-semibold text-darkBlue">
                  Accepter automatiquement les demandes de réservations de votre
                  site internet
                </p>
                <p className="text-xs text-darkBlue/50 mt-1">
                  Les réservations du site passent directement en “Confirmée”.
                </p>
              </div>

              <label className={toggleWrap}>
                <span
                  className={[
                    toggleBase,
                    watch("auto_accept") ? toggleOn : toggleOff,
                  ].join(" ")}
                >
                  <input
                    type="checkbox"
                    className="sr-only"
                    id="auto_accept"
                    {...register("auto_accept")}
                  />
                  <span
                    className={[
                      toggleDot,
                      watch("auto_accept") ? toggleDotOn : toggleDotOff,
                    ].join(" ")}
                  />
                </span>
              </label>
            </div>
          </div>

          {/* Pending duration */}
          {!auto_accept && (
            <div className="rounded-2xl border border-darkBlue/10 bg-white/60 p-3">
              <div className="mt-4">
                <p className="font-semibold text-darkBlue mb-3">
                  Durée de maintien d’une réservation en attente (minutes)
                </p>

                <input
                  type="number"
                  min="1"
                  onWheel={(e) => e.currentTarget.blur()}
                  className={inputBase}
                  {...register("pending_duration_minutes", {
                    required: !auto_accept,
                    min: 1,
                    valueAsNumber: true,
                  })}
                />

                <p className="text-xs text-darkBlue/50 mt-2">
                  Lorsqu’une réservation est en attente de validation, elle
                  bloque la table pendant cette durée. Si la fermeture survient
                  avant la fin du délai, le temps restant est reporté au
                  prochain créneau d’ouverture.
                </p>

                {errors?.pending_duration_minutes && (
                  <p className="text-red text-sm mt-1">
                    Veuillez saisir une durée valide supérieure à 0.
                  </p>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
