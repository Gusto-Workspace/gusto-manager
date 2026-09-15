import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";

import {
  getReservationServiceBucket,
  minutesFromReservationServiceTime,
} from "@/_assets/utils/reservation-service-time";
import { getReservationStatusLabel } from "./reservation-status.utils";

const PRINT_MODE_LABELS = {
  day: "journée",
  lunch: "midi",
  dinner: "soir",
};

const STANDALONE_PRINT_STYLES = `
  @page { size: A4 portrait; margin: 14mm; }
  html, body { margin: 0; background: #fff; color: #000; }
  body { font-family: Arial, sans-serif; }
  .reservations-print-sheet { display: block; width: 100%; box-sizing: border-box; }
  .reservations-print-sheet > div { margin-bottom: 24px; border-bottom: 1px solid #000; padding-bottom: 16px; }
  .reservations-print-sheet h1 { margin: 0; font-size: 24px; line-height: 32px; font-weight: 700; }
  .reservations-print-sheet p { margin: 4px 0 0; font-size: 14px; line-height: 20px; }
  .reservations-print-sheet table { width: 100%; border-collapse: collapse; table-layout: fixed; text-align: left; font-size: 12px; }
  .reservations-print-sheet thead { display: table-header-group; }
  .reservations-print-sheet tr { break-inside: avoid; page-break-inside: avoid; }
  .reservations-print-sheet th,
  .reservations-print-sheet td { border: 1px solid rgba(0, 0, 0, 0.3); padding: 8px; overflow-wrap: anywhere; }
  .reservations-print-sheet :is(th, td):nth-child(1) { width: 11%; }
  .reservations-print-sheet :is(th, td):nth-child(2) { width: 22%; }
  .reservations-print-sheet :is(th, td):nth-child(3) { width: 12%; }
  .reservations-print-sheet :is(th, td):nth-child(4) { width: 14%; }
  .reservations-print-sheet :is(th, td):nth-child(5) { width: 16%; }
  .reservations-print-sheet :is(th, td):nth-child(6) { width: 25%; }
`;

export function getReservationsPrintTitle(selectedDay, mode) {
  if (!selectedDay) return "Gusto Manager";

  const dateLabel = new Intl.DateTimeFormat("fr-FR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(selectedDay);

  return `réservations ${dateLabel} - ${PRINT_MODE_LABELS[mode] || PRINT_MODE_LABELS.day}`;
}

function shareStandaloneReservationsPrintDocument() {
  const printSheet = document.querySelector(
    "body > .reservations-print-sheet",
  );
  if (
    !printSheet ||
    typeof File !== "function" ||
    typeof navigator.share !== "function"
  ) {
    return false;
  }

  const title = document.title || "Réservations";
  const safeTitle = title.replace(/[\\/:*?"<>|]+/g, "-");
  const file = new File(
    [
      `<!doctype html><html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${title}</title><style>${STANDALONE_PRINT_STYLES}</style></head><body>${printSheet.outerHTML}</body></html>`,
    ],
    `${safeTitle}.html`,
    { type: "text/html" },
  );

  try {
    if (navigator.canShare && !navigator.canShare({ files: [file] })) {
      return false;
    }

    navigator.share({ files: [file], title }).catch(() => {});
    return true;
  } catch {
    return false;
  }
}

export function openReservationsPrintDialog() {
  const isStandalone =
    window.matchMedia?.("(display-mode: standalone)").matches ||
    window.navigator.standalone === true;
  const isIOS =
    /iPad|iPhone|iPod/.test(window.navigator.userAgent) ||
    (window.navigator.platform === "MacIntel" &&
      window.navigator.maxTouchPoints > 1);

  if (isStandalone && isIOS && shareStandaloneReservationsPrintDocument()) {
    return;
  }

  try {
    if (document.execCommand("print")) return;
  } catch {}

  window.print();
}

function getTableLabel(reservation, tablesCatalog = []) {
  const explicitName = String(reservation?.table?.name || "").trim();
  if (explicitName) return explicitName;

  const tableIds = Array.isArray(reservation?.table?.tableIds)
    ? reservation.table.tableIds
    : [];
  const catalogById = new Map(
    (Array.isArray(tablesCatalog) ? tablesCatalog : []).map((table) => [
      String(table?._id || ""),
      String(table?.name || "").trim(),
    ]),
  );
  const names = tableIds
    .map((id) => catalogById.get(String(id || "")))
    .filter(Boolean);

  return names.length ? Array.from(new Set(names)).join(" + ") : "";
}

export default function ReservationsPrintSheet({
  selectedDay,
  reservations = [],
  mode = "day",
  tablesCatalog = [],
}) {
  const [portalTarget, setPortalTarget] = useState(null);

  useEffect(() => {
    setPortalTarget(document.body);
  }, []);

  const printableReservations = useMemo(() => {
    const source = Array.isArray(reservations) ? reservations : [];
    const filtered =
      mode === "day"
        ? source
        : source.filter(
            (reservation) =>
              getReservationServiceBucket(reservation?.reservationTime) ===
              mode,
          );

    return filtered.slice().sort((left, right) => {
      const leftMinutes = minutesFromReservationServiceTime(
        left?.reservationTime,
      );
      const rightMinutes = minutesFromReservationServiceTime(
        right?.reservationTime,
      );
      return (leftMinutes ?? Number.MAX_SAFE_INTEGER) -
        (rightMinutes ?? Number.MAX_SAFE_INTEGER);
    });
  }, [mode, reservations]);

  if (!selectedDay || !portalTarget) return null;

  return createPortal(
    <>
      <div className="reservations-print-sheet hidden bg-white text-black">
        <div className="mb-6 border-b border-black pb-4">
          <h1 className="text-2xl font-bold">Liste des réservations</h1>
          <p className="mt-1 text-sm">
            {new Intl.DateTimeFormat("fr-FR", {
              weekday: "long",
              day: "2-digit",
              month: "long",
              year: "numeric",
            }).format(selectedDay)}
            {mode === "lunch"
              ? " — Service du midi"
              : mode === "dinner"
                ? " — Service du soir"
                : " — Journée complète"}
          </p>
        </div>

        <table className="w-full border-collapse text-left text-xs">
          <thead>
            <tr>
              {["Heure", "Client", "Couverts", "Table", "Statut", "Commentaire"].map(
                (label) => (
                  <th key={label} className="border border-black/30 px-2 py-2">
                    {label}
                  </th>
                ),
              )}
            </tr>
          </thead>
          <tbody>
            {printableReservations.length ? (
              printableReservations.map((reservation) => (
                <tr key={reservation._id} className="break-inside-avoid">
                  <td className="border border-black/30 px-2 py-2">
                    {String(reservation?.reservationTime || "--:--").slice(0, 5)}
                  </td>
                  <td className="border border-black/30 px-2 py-2">
                    {`${reservation?.customerFirstName || ""} ${
                      reservation?.customerLastName || ""
                    }`.trim() || "—"}
                  </td>
                  <td className="border border-black/30 px-2 py-2">
                    {reservation?.numberOfGuests || 0}
                  </td>
                  <td className="border border-black/30 px-2 py-2">
                    {getTableLabel(reservation, tablesCatalog) || "—"}
                  </td>
                  <td className="border border-black/30 px-2 py-2">
                    {getReservationStatusLabel(reservation?.status)}
                  </td>
                  <td className="border border-black/30 px-2 py-2">
                    {String(reservation?.commentary || "").trim() || "—"}
                  </td>
                </tr>
              ))
            ) : (
              <tr>
                <td
                  colSpan={6}
                  className="border border-black/30 px-2 py-5 text-center"
                >
                  Aucune réservation.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <style jsx global>{`
        @page {
          size: A4 portrait;
          margin: 14mm;
        }

        @media print {
          body > * {
            display: none !important;
          }

          body > .reservations-print-sheet {
            display: block !important;
            width: 100%;
            box-sizing: border-box;
          }

          .reservations-print-sheet table {
            width: 100%;
            table-layout: fixed;
          }

          .reservations-print-sheet thead {
            display: table-header-group;
          }

          .reservations-print-sheet tr {
            break-inside: avoid;
            page-break-inside: avoid;
          }

          .reservations-print-sheet th,
          .reservations-print-sheet td {
            overflow-wrap: anywhere;
          }

          .reservations-print-sheet :is(th, td):nth-child(1) {
            width: 11%;
          }

          .reservations-print-sheet :is(th, td):nth-child(2) {
            width: 22%;
          }

          .reservations-print-sheet :is(th, td):nth-child(3) {
            width: 12%;
          }

          .reservations-print-sheet :is(th, td):nth-child(4) {
            width: 14%;
          }

          .reservations-print-sheet :is(th, td):nth-child(5) {
            width: 16%;
          }

          .reservations-print-sheet :is(th, td):nth-child(6) {
            width: 25%;
          }
        }
      `}</style>
    </>,
    portalTarget,
  );
}
