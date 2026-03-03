import { useMemo } from "react";
import { Wand2, CheckCircle2, Plus, Trash2 } from "lucide-react";

// ✅ AJOUT
import FloorPlanParametersComponent from "./floor-plan.parameters.component";

export default function SmartParametersComponent({
  register,
  manage_disponibilities,
  manualTablesNeedingAssignment,
  manualToFixLoading,
  manualToFixError,
  manualToFix,
  fetchManualTablesToFix,
  fields,
  tablesCount,
  tableErrors,
  handleAddTable,
  handleRemoveTable,
  fmtShortFR,
  statusLabel,

  // ✅ AJOUT
  restaurantId,
  tablesCatalog,
}) {
  const safeManualToFix = useMemo(() => {
    return Array.isArray(manualToFix) ? manualToFix : [];
  }, [manualToFix]);

  const safeCatalog = useMemo(() => {
    return Array.isArray(tablesCatalog) ? tablesCatalog : [];
  }, [tablesCatalog]);

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

  const chip =
    "inline-flex items-center gap-2 rounded-2xl border border-darkBlue/10 bg-white/70 px-3 py-2 text-xs text-darkBlue/60";

  return (
    <div className={card}>
      <div className={cardInner}>
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <p className={sectionTitle}>
              <Wand2 className="size-4 shrink-0 opacity-60" />
              Gestion intelligente
            </p>
            <p className={hint}>
              Calcule les disponibilités selon les tables et le nombre de
              personnes.
            </p>
          </div>

          <label className={toggleWrap}>
            <span
              className={[
                toggleBase,
                manage_disponibilities ? toggleOn : toggleOff,
              ].join(" ")}
            >
              <input
                type="checkbox"
                className="sr-only"
                id="manage_disponibilities"
                {...register("manage_disponibilities")}
              />
              <span
                className={[
                  toggleDot,
                  manage_disponibilities ? toggleDotOn : toggleDotOff,
                ].join(" ")}
              />
            </span>
          </label>
        </div>

        {manualTablesNeedingAssignment > 0 && (
          <div className="mt-4 rounded-2xl border border-orange/30 bg-orange/10 px-4 py-3 text-sm text-darkBlue/80">
            <p className="font-semibold text-darkBlue">
              Attention : tables saisies manuellement
            </p>
            <p className="mt-1 whitespace-pre-line text-darkBlue/70">
              Des tables avaient été saisies manuellement quand la gestion
              intelligente n’était pas activée.
              {"\n"}Pour éviter les conflits, veuillez assigner une table dans
              les réservations concernées.
            </p>
            <p className="mt-2 text-xs text-darkBlue/60">
              {manualTablesNeedingAssignment} réservation(s) concernée(s).
            </p>

            <button
              type="button"
              onClick={fetchManualTablesToFix}
              className="mt-3 inline-flex items-center justify-center rounded-xl bg-darkBlue text-white px-4 h-10 text-sm font-semibold hover:opacity-90 transition"
            >
              {manualToFixLoading
                ? "Chargement…"
                : "Voir les réservations à corriger"}
            </button>

            {manualToFixError && (
              <p className="mt-2 text-xs text-red">{manualToFixError}</p>
            )}

            {safeManualToFix.length > 0 && (
              <div className="mt-3 grid grid-cols-1 gap-2">
                {safeManualToFix.map((r) => (
                  <div
                    key={String(r._id)}
                    className="rounded-xl border border-darkBlue/10 bg-white/70 px-3 py-2"
                  >
                    <p className="text-sm font-semibold text-darkBlue">
                      {fmtShortFR(r.reservationDate)} •{" "}
                      {String(r.reservationTime || "").slice(0, 5)}
                      {" — "}
                      {r.customerName || "Client"}
                    </p>
                    <p className="text-xs text-darkBlue/60">
                      {r.numberOfGuests ? `${r.numberOfGuests} pers.` : ""}
                      {r.tableName ? ` • Table: ${r.tableName}` : ""}
                      {r.status ? ` • ${statusLabel(r.status)}` : ""}
                    </p>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {manage_disponibilities && (
          <>
            <div className={divider} />

            <div className="flex items-center justify-between gap-3 flex-wrap">
              <div className={chip}>
                <CheckCircle2 className="size-4 shrink-0 opacity-60" />
                <span>{tablesCount} table(s) configurée(s)</span>
              </div>

              <button
                type="button"
                onClick={handleAddTable}
                className="inline-flex items-center justify-center size-11 rounded-2xl bg-blue text-white shadow-sm hover:bg-blue/90 active:scale-[0.98] transition"
                aria-label="Ajouter une table"
                title="Ajouter une table"
              >
                <Plus className="size-4 shrink-0" />
              </button>
            </div>

            <div className="mt-3 grid grid-cols-1 midTablet:grid-cols-2 gap-3">
              {fields.map((field, index) => {
                const nameError = !!tableErrors?.[index]?.name;
                const seatsError = !!tableErrors?.[index]?.seats;

                return (
                  <div
                    key={field.id}
                    className="rounded-2xl border border-darkBlue/10 bg-white/60 p-3"
                  >
                    <div className="flex gap-2">
                      <input
                        type="text"
                        placeholder="Nom / n° table"
                        {...register(`tables.${index}.name`)}
                        className={[
                          inputBase,
                          nameError ? "border-red" : "",
                        ].join(" ")}
                      />

                      <input
                        type="number"
                        inputMode="numeric"
                        placeholder="Places"
                        {...register(`tables.${index}.seats`, { min: 1 })}
                        className={[
                          inputBase,
                          "text-center",
                          seatsError ? "border-red" : "",
                        ].join(" ")}
                      />

                      <button
                        type="button"
                        onClick={() => handleRemoveTable(index)}
                        className="min-w-[44px] flex items-center justify-center size-11 rounded-2xl bg-red text-white shadow-sm hover:opacity-75 active:scale-[0.98] transition"
                        aria-label="Supprimer"
                        title="Supprimer"
                      >
                        <Trash2 className="size-4 shrink-0" />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* ✅ AJOUT : CONFIG PLAN DE SALLE */}
            <div className={divider} />

            <FloorPlanParametersComponent
              restaurantId={restaurantId}
              tablesCatalog={safeCatalog}
            />
          </>
        )}
      </div>
    </div>
  );
}
