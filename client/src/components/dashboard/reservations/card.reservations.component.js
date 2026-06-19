import {
  CommentarySvg,
  CommunitySvg,
  TableSvg,
  UserSvg,
} from "../../_shared/_svgs/_index";

// LUCIDE
import { Clock, ExternalLink } from "lucide-react";
import {
  getReservationStatusClassName,
  getReservationStatusLabel,
} from "@/components/_shared/reservations/reservation-status.utils";
import {
  CustomerTagPill,
  getPrimaryCustomerTag,
} from "@/components/_shared/customers/customer-tags-ui";

function formatTime(t) {
  const v = String(t || "");
  if (!v) return "--:--";
  return v.slice(0, 5).replace(":", "h");
}

function fullName(r) {
  const fn = String(r?.customerFirstName || "").trim();
  const ln = String(r?.customerLastName || "").trim();
  return `${fn} ${ln}`.trim() || "-";
}

function getReservationTableLabel(reservation, tablesCatalog = []) {
  const explicitName = String(reservation?.table?.name || "").trim();
  if (explicitName) return explicitName;

  const tableIds = Array.isArray(reservation?.table?.tableIds)
    ? reservation.table.tableIds
    : [];

  if (!tableIds.length) return null;

  const catalogById = new Map(
    (Array.isArray(tablesCatalog) ? tablesCatalog : []).map((table) => [
      String(table?._id || ""),
      String(table?.name || "").trim(),
    ]),
  );

  const names = Array.from(
    new Set(
      tableIds
        .map((id) => catalogById.get(String(id || "").trim()))
        .filter(Boolean),
    ),
  );

  return names.length ? names.join(" + ") : null;
}

export default function CardReservationComponent(props) {
  const r = props.reservation;
  const status = r.status;
  const responsiveInlineLayout = Boolean(props.responsiveInlineLayout);

  const badgeClass = getReservationStatusClassName(status);
  const badgeLabel = getReservationStatusLabel(status);

  const timeLabel = formatTime(r.reservationTime);
  const hasCommentary = Boolean((r.commentary || "").trim());
  const tableName = getReservationTableLabel(r, props.tablesCatalog);
  const primaryCustomerTag = getPrimaryCustomerTag(r?.customerSummary?.tags);

  const openDetails = () => props.onOpenDetails?.(r);

  const metaPill =
    "inline-flex items-center gap-1 rounded-full border border-darkBlue/10 bg-white/70 px-2.5 py-1 text-[11px] font-semibold text-darkBlue/80";

  return (
    <li className="w-full">
      <div className="relative w-full text-left rounded-2xl border border-darkBlue/10 bg-white/70 shadow-sm hover:shadow-md transition-shadow p-3">
        <div
          className={
            responsiveInlineLayout
              ? "flex min-w-0 flex-col gap-3 min-[1024px]:flex-row min-[1024px]:items-center min-[1024px]:gap-2"
              : "flex min-w-0 flex-col gap-3"
          }
        >
          <div
            className={
              responsiveInlineLayout
                ? "flex min-w-0 items-center gap-2 min-[1024px]:min-w-[128px] min-[1024px]:max-w-[210px] min-[1024px]:shrink-0"
                : "flex min-w-0 items-center gap-2"
            }
          >
            <UserSvg width={18} height={18} className="opacity-50 shrink-0" />
            <p className="truncate font-semibold text-darkBlue">
              {fullName(r) || "-"}
            </p>

            <span
              className={[
                "ml-auto shrink-0 rounded-full border px-2.5 py-1 text-[11px] font-semibold",
                badgeClass,
                responsiveInlineLayout ? "min-[1024px]:hidden" : "",
              ].join(" ")}
            >
              {badgeLabel}
            </span>
          </div>

          <div
            className={
              responsiveInlineLayout
                ? "hide-scrollbar flex min-w-0 items-center gap-1 overflow-x-auto pr-11 min-[1024px]:flex-1 min-[1024px]:justify-end min-[1024px]:pr-0"
                : "hide-scrollbar flex min-w-0 items-center gap-1 overflow-x-auto pr-11"
            }
          >
            <span className={metaPill}>
              <Clock width={15} height={15} className="opacity-50" />
              {timeLabel}
            </span>

            <span className={metaPill}>
              <CommunitySvg width={15} height={15} className="opacity-50" />
              {r.numberOfGuests || 0}
            </span>

            {tableName ? (
              <span className={`${metaPill} max-w-[170px]`}>
                <TableSvg width={15} height={15} className="opacity-50" />
                <span className="truncate">{tableName}</span>
              </span>
            ) : null}

            {primaryCustomerTag ? (
              <CustomerTagPill tagKey={primaryCustomerTag} compact />
            ) : null}

            {hasCommentary ? (
              <span className={metaPill}>
                <CommentarySvg width={15} height={15} className="opacity-50" />
              </span>
            ) : null}
          </div>

          {responsiveInlineLayout ? (
            <span
              className={`hidden shrink-0 rounded-full border px-2.5 py-1 text-[11px] font-semibold min-[1024px]:inline-flex ${badgeClass}`}
            >
              {badgeLabel}
            </span>
          ) : null}

          <button
            type="button"
            onClick={openDetails}
            className={
              responsiveInlineLayout
                ? "absolute right-3 bottom-3 inline-flex shrink-0 items-center gap-2 rounded-xl border border-darkBlue/10 bg-white p-2 text-xs font-semibold text-darkBlue transition hover:bg-darkBlue/5 min-[1024px]:static"
                : "absolute right-3 bottom-3 inline-flex shrink-0 items-center gap-2 rounded-xl border border-darkBlue/10 bg-white p-2 text-xs font-semibold text-darkBlue transition hover:bg-darkBlue/5"
            }
            aria-label="Détails"
            title="Détails"
          >
            <ExternalLink className="size-4 text-darkBlue/60" />
          </button>
        </div>
      </div>
    </li>
  );
}
