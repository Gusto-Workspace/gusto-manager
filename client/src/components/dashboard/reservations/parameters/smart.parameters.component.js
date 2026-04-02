import { useMemo, useState } from "react";
import { CircleHelp, Wand2, X } from "lucide-react";

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
  const [isInfoOpen, setIsInfoOpen] = useState(false);

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
  const infoButton =
    "mt-2 inline-flex items-center gap-2 text-sm font-semibold text-blue hover:text-blue/80 transition";

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
              Gestion intelligente des réservations
            </p>
            <p className={hint}>
              A activer si vous voulez que Gusto attribue les tables
              automatiquement, affiche le plan de salle en temps reel et fasse
              evoluer certains statuts sans action manuelle.
            </p>
            <button
              type="button"
              onClick={() => setIsInfoOpen(true)}
              className={infoButton}
            >
              <CircleHelp className="size-4 shrink-0" />
              Comprendre le fonctionnement
            </button>
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

      {isInfoOpen ? (
        <div
          className="fixed inset-0 z-[120] flex items-center justify-center bg-black/35 p-2 mobile:p-3"
          role="dialog"
          aria-modal="true"
          onClick={() => setIsInfoOpen(false)}
        >
          <div
            className="flex w-full max-w-[560px] max-h-[calc(100svh-1rem)] mobile:max-h-[calc(100svh-1.5rem)] flex-col overflow-hidden rounded-3xl border border-darkBlue/10 bg-white shadow-[0_24px_80px_rgba(19,30,54,0.18)]"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="flex shrink-0 items-start justify-between gap-4 border-b border-darkBlue/10 px-4 py-4 mobile:px-5">
              <div>
                <p className="text-lg font-semibold text-darkBlue">
                  Gestion intelligente des réservations
                </p>
                <p className="mt-1 text-sm text-darkBlue/60">
                  Quand cette option est active, Gusto gère automatiquement une
                  partie du service autour du plan de salle et des statuts de
                  réservation.
                </p>
              </div>

              <button
                type="button"
                onClick={() => setIsInfoOpen(false)}
                className="inline-flex size-10 shrink-0 items-center justify-center rounded-full border border-darkBlue/10 bg-white p-0 hover:bg-darkBlue/5 transition"
                aria-label="Fermer"
              >
                <X className="size-4 text-darkBlue/70" />
              </button>
            </div>

            <div className="min-h-0 flex-1 space-y-5 overflow-y-auto overscroll-contain px-4 py-4 text-sm text-darkBlue/80 mobile:px-5 mobile:py-5">
              <div className="space-y-2">
                <p className="font-semibold text-darkBlue">
                  Quand elle est activée
                </p>
                <ul className="list-disc space-y-2 pl-5">
                  <li>
                    chaque réservation peut être attribuée automatiquement à une
                    table compatible selon le nombre de couverts et les
                    disponibilités;
                  </li>
                  <li>
                    le plan de salle peut être consulté en temps réel ou par
                    créneau pour voir quelles tables sont libres, assignées,
                    occupées ou à libérer;
                  </li>
                  <li>
                    une réservation confirmée passe automatiquement en retard si
                    l&apos;heure est dépassée et que le client n&apos;a pas
                    encore été installé;
                  </li>
                  <li>
                    si l&apos;option de fin automatique est aussi activée, la
                    réservation passe ensuite en terminée à la fin du temps
                    d&apos;occupation prévu.
                  </li>
                </ul>
              </div>

              <div className="space-y-2">
                <p className="font-semibold text-darkBlue">
                  Quand elle est désactivée
                </p>
                <ul className="list-disc space-y-2 pl-5">
                  <li>
                    les réservations ne sont plus attribuées automatiquement aux
                    tables;
                  </li>
                  <li>
                    le plan de salle ne propose plus le mode temps réel ni les
                    créneaux automatiques;
                  </li>
                  <li>
                    une réservation confirmée ne passe plus automatiquement en
                    retard;
                  </li>
                  <li>
                    elle reste confirmée jusqu&apos;à une action manuelle, ou
                    passe en terminée seulement si l&apos;option de fin
                    automatique est activée.
                  </li>
                </ul>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
