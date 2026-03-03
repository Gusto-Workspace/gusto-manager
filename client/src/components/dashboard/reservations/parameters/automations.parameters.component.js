import { Settings2 } from "lucide-react";

export default function AutomationsParametersComponent({
  register,
  setValue,
  auto_finish_reservations,
  deletion_duration,
  durationError,
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

  const chip =
    "inline-flex items-center gap-2 rounded-2xl border border-darkBlue/10 bg-white/70 px-3 py-2 text-xs text-darkBlue/60";

  return (
    <div className={card}>
      <div className={cardInner}>
        <p className={sectionTitle}>
          <Settings2 className="size-4 shrink-0 opacity-60" />
          Automatisations
        </p>

        <div className={divider} />

        <div className="grid grid-cols-1 midTablet:grid-cols-2 gap-3">
          {/* Auto finish */}
          <div className="rounded-2xl border border-darkBlue/10 bg-white/60 p-3">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="font-semibold text-darkBlue">
                  Passer automatiquement en “Terminée”
                </p>
                <p className="text-xs text-darkBlue/50">
                  Utilise la durée d’occupation (midi/soir) pour libérer la
                  table.
                </p>
              </div>

              <label className={toggleWrap}>
                <span
                  className={[
                    toggleBase,
                    auto_finish_reservations ? toggleOn : toggleOff,
                  ].join(" ")}
                >
                  <input
                    type="checkbox"
                    className="sr-only"
                    id="auto_finish_reservations"
                    {...register("auto_finish_reservations")}
                  />
                  <span
                    className={[
                      toggleDot,
                      auto_finish_reservations ? toggleDotOn : toggleDotOff,
                    ].join(" ")}
                  />
                </span>
              </label>
            </div>

            <div className="mt-3 text-xs text-darkBlue/55">
              {auto_finish_reservations
                ? "Activé : une réservation “En cours” passera en “Terminée” après la durée définie ci-dessous (midi/soir)."
                : "Désactivé : vous devez terminer la réservation manuellement."}
            </div>
          </div>

          {/* Deletion duration */}
          <div className="rounded-2xl border border-darkBlue/10 bg-white/60 p-3">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="font-semibold text-darkBlue">
                  Supprimer automatiquement
                </p>
                <p className="text-xs text-darkBlue/50">
                  Supprime une réservation “Terminée” après…
                </p>
              </div>

              <label className={toggleWrap}>
                <span
                  className={[
                    toggleBase,
                    deletion_duration ? toggleOn : toggleOff,
                  ].join(" ")}
                >
                  <input
                    type="checkbox"
                    className="sr-only"
                    id="deletion_duration"
                    {...register("deletion_duration", {
                      onChange: (e) => {
                        if (!e.target.checked) {
                          setValue("deletion_duration_minutes", 1440);
                        }
                      },
                    })}
                  />
                  <span
                    className={[
                      toggleDot,
                      deletion_duration ? toggleDotOn : toggleDotOff,
                    ].join(" ")}
                  />
                </span>
              </label>
            </div>

            <div className="mt-3">
              <select
                id="deletion_duration_minutes"
                {...register("deletion_duration_minutes", { required: true })}
                disabled={!deletion_duration}
                className={selectBase}
              >
                <option value="1">1 min</option>
                <option value="15">15 min</option>
                <option value="30">30 min</option>
                <option value="60">1 h</option>
                <option value="120">2 h</option>
                <option value="360">6 h</option>
                <option value="720">12 h</option>
                <option value="1440">24 h (défaut)</option>
                <option value={String(7 * 24 * 60)}>1 semaine</option>
                <option value={String(30 * 24 * 60)}>1 mois</option>
                <option value={String(6 * 30 * 24 * 60)}>6 mois</option>
                <option value={String(365 * 24 * 60)}>1 an</option>
              </select>
            </div>
          </div>
        </div>

        {/* Durée d’occupation */}
        <div className={divider} />

        <div className="rounded-2xl border border-darkBlue/10 bg-white/60 p-3">
          <p className="font-semibold text-darkBlue">
            Durée d’occupation d’une table
          </p>
          <p className="text-xs text-darkBlue/50">
            Utilisée pour clôturer automatiquement une réservation et (si
            activé) calculer les disponibilités. Ex : 90 min le midi, 120 min le
            soir.
          </p>

          <div className="mt-3 grid grid-cols-1 midTablet:grid-cols-2 gap-3">
            <div className="rounded-2xl border border-darkBlue/10 bg-white/70 p-3">
              <p className="text-sm font-semibold text-darkBlue">Midi</p>
              <div className="mt-2 flex items-center gap-2">
                <input
                  type="number"
                  id="table_occupancy_lunch_minutes"
                  inputMode="numeric"
                  {...register("table_occupancy_lunch_minutes", { min: 1 })}
                  placeholder="-"
                  className={[
                    inputBase,
                    "text-center",
                    durationError?.lunch ? "border-red" : "",
                  ].join(" ")}
                />
                <span className="text-sm text-darkBlue/60 whitespace-nowrap">
                  min
                </span>
              </div>
            </div>

            <div className="rounded-2xl border border-darkBlue/10 bg-white/70 p-3">
              <p className="text-sm font-semibold text-darkBlue">Soir</p>
              <div className="mt-2 flex items-center gap-2">
                <input
                  type="number"
                  id="table_occupancy_dinner_minutes"
                  inputMode="numeric"
                  {...register("table_occupancy_dinner_minutes", { min: 1 })}
                  placeholder="-"
                  className={[
                    inputBase,
                    "text-center",
                    durationError?.dinner ? "border-red" : "",
                  ].join(" ")}
                />
                <span className="text-sm text-darkBlue/60 whitespace-nowrap">
                  min
                </span>
              </div>
            </div>
          </div>

          {(durationError?.lunch || durationError?.dinner) && (
            <p className="mt-2 text-xs text-red">
              Veuillez renseigner les deux durées (midi et soir).
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
