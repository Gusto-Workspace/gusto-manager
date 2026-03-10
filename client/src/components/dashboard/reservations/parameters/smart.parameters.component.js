import { useMemo } from "react";
import { Wand2 } from "lucide-react";

export default function SmartParametersComponent({
  register,
  manage_disponibilities,

  // manual tables warning
  manualTablesNeedingAssignment,
  manualToFixLoading,
  manualToFixError,
  manualToFix,
  fetchManualTablesToFix,

  // unassigned reservations warning
  unassignedReservationsNeedingAssignment,
  unassignedToFixLoading,
  unassignedToFixError,
  unassignedToFix,
  fetchUnassignedTablesToFix,

  fmtShortFR,
  statusLabel,
}) {
  const safeManualToFix = useMemo(() => {
    return Array.isArray(manualToFix) ? manualToFix : [];
  }, [manualToFix]);

  const safeUnassignedToFix = useMemo(() => {
    return Array.isArray(unassignedToFix) ? unassignedToFix : [];
  }, [unassignedToFix]);

  const card = "rounded-3xl border border-darkBlue/10 bg-white/70 shadow-sm";
  const cardInner = "px-2 py-4 mobile:p-4 midTablet:p-6";
  const sectionTitle =
    "text-base font-semibold text-darkBlue flex items-center gap-2";
  const hint = "text-sm text-darkBlue/60";

  const toggleWrap = "inline-flex items-center gap-2 select-none";
  const toggleBase =
    "relative inline-flex h-8 w-14 items-center rounded-full border transition";
  const toggleOn = "bg-blue border-blue/40";
  const toggleOff = "bg-darkBlue/10 border-darkBlue/10";
  const toggleDot =
    "absolute top-1/2 -translate-y-1/2 h-6 w-6 rounded-full bg-white shadow-sm transition";
  const toggleDotOn = "translate-x-7";
  const toggleDotOff = "translate-x-1";

  function WarningCard({
    title,
    description,
    count,
    buttonLabel,
    loading,
    error,
    items,
    onFetch,
    showTableName = true,
  }) {
    const n = Number(count || 0);
    if (!n) return null;

    return (
      <div className="mt-4 rounded-2xl border border-orange/30 bg-orange/10 px-4 py-3 text-sm text-darkBlue/80">
        <p className="font-semibold text-darkBlue">{title}</p>
        <p className="mt-1 whitespace-pre-line text-darkBlue/70">
          {description}
        </p>
        <p className="mt-2 text-xs text-darkBlue/60">
          {n} réservation(s) concernée(s).
        </p>

        <button
          type="button"
          onClick={onFetch}
          className="mt-3 inline-flex items-center justify-center rounded-xl bg-darkBlue text-white px-4 h-10 text-sm font-semibold hover:opacity-90 transition"
        >
          {loading ? "Chargement…" : buttonLabel}
        </button>

        {error ? <p className="mt-2 text-xs text-red">{error}</p> : null}

        {Array.isArray(items) && items.length > 0 ? (
          <div className="mt-3 grid grid-cols-1 gap-2">
            {items.map((r) => (
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
                  {showTableName && r.tableName
                    ? ` • Table: ${r.tableName}`
                    : ""}
                  {r.status ? ` • ${statusLabel(r.status)}` : ""}
                </p>
              </div>
            ))}
          </div>
        ) : null}
      </div>
    );
  }

  return (
    <div className={card}>
      <div className={cardInner}>
        <div className="flex items-center justify-between gap-4">
          <div className="min-w-0">
            <p className={sectionTitle}>
              <Wand2 className="size-4 shrink-0 opacity-60" />
              Gestion intelligente des tables
            </p>
            <p className={hint}>
              Calcule les disponibilités selon les tables et le nombre de
              personnes.
            </p>
          </div>

          <div className="flex items-center gap-3">
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
        </div>

        <WarningCard
          title="Attention : tables saisies manuellement"
          description={
            "Des tables avaient été saisies manuellement quand la gestion intelligente n’était pas activée.\nVeuillez assigner une table configurée dans les réservations concernées."
          }
          count={manualTablesNeedingAssignment}
          buttonLabel="Voir les réservations à corriger"
          loading={manualToFixLoading}
          error={manualToFixError}
          items={safeManualToFix}
          onFetch={fetchManualTablesToFix}
          showTableName={true}
        />

        <WarningCard
          title="Attention : réservations sans table"
          description={
            "Certaines réservations ont été créées sans table (gestion intelligente désactivée au moment de la création).\nVeuillez assigner une table à ces réservations."
          }
          count={unassignedReservationsNeedingAssignment}
          buttonLabel="Voir les réservations sans table"
          loading={unassignedToFixLoading}
          error={unassignedToFixError}
          items={safeUnassignedToFix}
          onFetch={fetchUnassignedTablesToFix}
          showTableName={false}
        />
      </div>
    </div>
  );
}
