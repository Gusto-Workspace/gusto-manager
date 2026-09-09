import { useMemo } from "react";

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

export function getReservationsPrintTitle(selectedDay, mode) {
  if (!selectedDay) return "Gusto Manager";

  const dateLabel = new Intl.DateTimeFormat("fr-FR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(selectedDay);

  return `réservations ${dateLabel} - ${PRINT_MODE_LABELS[mode] || PRINT_MODE_LABELS.day}`;
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

  if (!selectedDay) return null;

  return (
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
        @media print {
          body * {
            visibility: hidden !important;
          }

          .reservations-print-sheet,
          .reservations-print-sheet * {
            visibility: visible !important;
          }

          .reservations-print-sheet {
            display: block !important;
            position: absolute;
            inset: 0;
            width: 100%;
            box-sizing: border-box;
            padding: 16mm;
          }

          @page {
            size: A4 portrait;
            margin: 0;
          }
        }
      `}</style>
    </>
  );
}
