// SVG
import {
  CheckSvg,
  DoubleCheckSvg,
  CommentarySvg,
  CommunitySvg,
  DeleteSvg,
  EditSvg,
  TableSvg,
  UserSvg,
  ActiveSvg,
} from "../../_shared/_svgs/_index";

// I18N
import { useTranslation } from "next-i18next";

// LUCIDE
import { Clock, ExternalLink } from "lucide-react";

function formatTime(t) {
  const v = String(t || "");
  if (!v) return "--:--";
  return v.slice(0, 5).replace(":", "h");
}

export default function CardReservationComponent(props) {
  const { t } = useTranslation("reservations");

  const r = props.reservation;
  const status = r.status;

  const statusStyles = {
    Pending: "bg-blue/10 text-blue border-blue/30",
    Confirmed: "bg-blue/15 text-blue border-blue/40",
    Active: "bg-green/10 text-green border-green/30",
    Late: "bg-[#FF914D22] text-[#B95E1C] border-[#FF914D66]",
    Finished: "bg-darkBlue/5 text-darkBlue/70 border-darkBlue/20",
  };

  const statusTranslations = {
    Pending: "En attente",
    Confirmed: "Confirmée",
    Active: "En cours",
    Late: "En retard",
    Finished: "Terminée",
  };

  const badgeClass =
    statusStyles[status] || "bg-darkBlue/5 text-darkBlue/70 border-darkBlue/20";
  const badgeLabel = statusTranslations[status] || status;

  const timeLabel = formatTime(r.reservationTime);
  const hasCommentary = Boolean((r.commentary || "").trim());
  const tableName = r.table?.name || null;

  const openDetails = () => props.onOpenDetails?.(r);

  const metaPill =
    "inline-flex items-center gap-1 rounded-full border border-darkBlue/10 bg-white/70 px-2.5 py-1 text-[11px] font-semibold text-darkBlue/80";

  return (
    <li className="w-full">
      {/* ====== MOBILE ====== */}
      <div className="midTablet:hidden w-full text-left rounded-2xl border border-darkBlue/10 bg-white/70 shadow-sm hover:shadow-md transition-shadow p-3">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <div className="flex justify-between">
              {/* Top row: heure + badge */}
              <div className="flex items-center gap-2">
               
                <div className="flex items-center gap-2 min-w-0">
                  <UserSvg
                    width={18}
                    height={18}
                    className="opacity-50 shrink-0"
                  />
                  <p className="font-semibold text-darkBlue truncate">
                    {r.customerName || "-"}
                  </p>
                </div>
                 <span className="shrink-0 text-sm font-semibold text-darkBlue">
                  {timeLabel}
                </span>
              </div>

              <span
                className={`shrink-0 px-2.5 py-1 rounded-full text-[11px] font-semibold border ${badgeClass}`}
              >
                {badgeLabel}
              </span>
            </div>
            {/* Meta pills */}
            <div className="mt-2 flex flex-wrap justify-between items-center gap-2">
              {/* Name */}

              <div className="flex gap-1">

                <span className={metaPill}>
                  <Clock width={15} height={15} className="opacity-50" />
                  {timeLabel}
                </span>

                <span className={metaPill}>
                  <CommunitySvg width={15} height={15} className="opacity-50" />
                  {r.numberOfGuests || 0}
                </span>

                {tableName ? (
                  <span className={metaPill}>
                    <TableSvg width={15} height={15} className="opacity-50" />
                    <span className="truncate max-w-[160px]">{tableName}</span>
                  </span>
                ) : null}

                {hasCommentary ? (
                  <span className={metaPill}>
                    <CommentarySvg
                      width={15}
                      height={15}
                      className="opacity-50"
                    />
                    <span>Note</span>
                  </span>
                ) : null}
              </div>

              {/* CTA */}
              <button
                type="button"
                onClick={openDetails}
                className="shrink-0 inline-flex items-center gap-2 rounded-xl border border-darkBlue/10 bg-white hover:bg-darkBlue/5 transition px-3 py-2 text-xs font-semibold text-darkBlue"
              >
                <ExternalLink className="size-4 text-darkBlue/60" />
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* ====== DESKTOP ====== */}

      <div className="hidden midTablet:block">
        <div className="group relative rounded-2xl border border-darkBlue/10 bg-white/70 shadow-sm hover:shadow-md transition-shadow p-4 overflow-hidden">
          {/* Badge */}
          <span
            className={`
              absolute top-3 right-3
              px-3 py-1 rounded-full text-[11px] font-semibold border ${badgeClass}
            `}
          >
            {badgeLabel}
          </span>

          {/* Details button */}
          <button
            type="button"
            onClick={openDetails}
            className="absolute top-3 left-3 inline-flex items-center gap-2 rounded-xl border border-darkBlue/10 bg-white/80 hover:bg-darkBlue/5 transition px-3 py-2 text-xs font-semibold text-darkBlue"
          >
            <ExternalLink className="size-4 text-darkBlue/60" />
            {t("buttons.details", "Détails")}
          </button>

          {/* Content */}
          <div className="pt-10 flex flex-col gap-3">
            {/* Top line: time + name */}
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-xs text-darkBlue/50">
                  {t("labels.time", "Heure")}
                </p>
                <p className="text-base font-semibold text-darkBlue">
                  {timeLabel}
                </p>
              </div>

              <div className="min-w-0 text-right">
                <p className="text-xs text-darkBlue/50">
                  {t("labels.customer", "Client")}
                </p>
                <p className="text-base font-semibold text-darkBlue truncate max-w-[220px]">
                  {r.customerName || "-"}
                </p>
              </div>
            </div>

            {/* Meta pills */}
            <div className="flex flex-wrap items-center gap-2">
              <span className={metaPill}>
                <CommunitySvg width={16} height={16} className="opacity-50" />
                {r.numberOfGuests || 0} {t("labels.people", "pers.")}
              </span>

              {tableName ? (
                <span className={metaPill}>
                  <TableSvg width={16} height={16} className="opacity-50" />
                  <span className="truncate max-w-[220px]">{tableName}</span>
                </span>
              ) : null}

              {hasCommentary && (
                <span className={metaPill}>
                  <CommentarySvg
                    width={16}
                    height={16}
                    className="opacity-50"
                  />
                  <span>{t("labels.note", "Note")}</span>
                </span>
              )}
            </div>
          </div>
        </div>
      </div>
    </li>
  );
}
