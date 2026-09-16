import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { jsPDF } from "jspdf";

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

const PRINT_MARGIN_MM = 14;
const PRINT_COLUMN_RATIOS = [0.11, 0.22, 0.12, 0.14, 0.16, 0.25];

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
  const printSheet = document.querySelector("body > .reservations-print-sheet");
  if (
    !printSheet ||
    typeof File !== "function" ||
    typeof navigator.share !== "function"
  ) {
    return false;
  }

  const title = document.title || "Réservations";
  const safeTitle = title.replace(/[\\/:*?"<>|]+/g, "-");
  const pdf = new jsPDF({
    orientation: "portrait",
    unit: "mm",
    format: "a4",
    compress: true,
    putOnlyUsedFonts: true,
  });
  const pageWidth = pdf.internal.pageSize.getWidth();
  const pageHeight = pdf.internal.pageSize.getHeight();
  const contentWidth = pageWidth - PRINT_MARGIN_MM * 2;
  const columnWidths = PRINT_COLUMN_RATIOS.map((ratio) => contentWidth * ratio);
  const bottomLimit = pageHeight - PRINT_MARGIN_MM;
  const cellPadding = 2;
  const lineHeight = 3.4;
  const headerHeight = 8;
  const heading = printSheet.querySelector("h1")?.textContent || title;
  const subtitle = printSheet.querySelector("p")?.textContent || "";
  const headerCells = Array.from(
    printSheet.querySelectorAll("thead th"),
    (cell) => cell.textContent?.trim() || "",
  );
  const rows = Array.from(printSheet.querySelectorAll("tbody tr"), (row) =>
    Array.from(
      row.querySelectorAll("td"),
      (cell) => cell.textContent?.trim() || "",
    ),
  );
  let cursorY = PRINT_MARGIN_MM;

  const drawHeader = () => {
    let cursorX = PRINT_MARGIN_MM;
    pdf.setFont("helvetica", "bold");
    pdf.setFontSize(8);
    pdf.setDrawColor(120, 120, 120);
    pdf.setLineWidth(0.2);

    headerCells.forEach((value, index) => {
      const width = columnWidths[index];
      pdf.setFillColor(242, 242, 242);
      pdf.rect(cursorX, cursorY, width, headerHeight, "FD");
      pdf.text(value, cursorX + cellPadding, cursorY + 5.1);
      cursorX += width;
    });

    cursorY += headerHeight;
  };

  pdf.setProperties({ title });
  pdf.setTextColor(0, 0, 0);
  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(18);
  pdf.text(heading, PRINT_MARGIN_MM, cursorY + 6);
  pdf.setFont("helvetica", "normal");
  pdf.setFontSize(10);
  pdf.text(subtitle, PRINT_MARGIN_MM, cursorY + 12);
  pdf.setDrawColor(0, 0, 0);
  pdf.line(
    PRINT_MARGIN_MM,
    cursorY + 16,
    pageWidth - PRINT_MARGIN_MM,
    cursorY + 16,
  );
  cursorY += 20;
  drawHeader();

  rows.forEach((cells) => {
    pdf.setFont("helvetica", "normal");
    pdf.setFontSize(8);
    const linesByCell = cells.map((value, index) =>
      pdf.splitTextToSize(value, columnWidths[index] - cellPadding * 2),
    );
    const rowHeight = Math.max(
      8,
      Math.max(...linesByCell.map((lines) => lines.length)) * lineHeight +
        cellPadding * 2,
    );

    if (cursorY + rowHeight > bottomLimit) {
      pdf.addPage("a4", "portrait");
      cursorY = PRINT_MARGIN_MM;
      drawHeader();
    }

    let cursorX = PRINT_MARGIN_MM;
    pdf.setDrawColor(120, 120, 120);
    pdf.setLineWidth(0.2);
    linesByCell.forEach((lines, index) => {
      const width = columnWidths[index];
      pdf.rect(cursorX, cursorY, width, rowHeight);
      pdf.text(lines, cursorX + cellPadding, cursorY + 4.5, {
        lineHeightFactor: 1.2,
      });
      cursorX += width;
    });
    cursorY += rowHeight;
  });

  const file = new File([pdf.output("arraybuffer")], `${safeTitle}.pdf`, {
    type: "application/pdf",
  });

  try {
    if (navigator.canShare && !navigator.canShare({ files: [file] })) {
      return false;
    }

    navigator
      .share({ files: [file] })
      .catch(() => {})
      .finally(() => window.dispatchEvent(new Event("afterprint")));
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
      return (
        (leftMinutes ?? Number.MAX_SAFE_INTEGER) -
        (rightMinutes ?? Number.MAX_SAFE_INTEGER)
      );
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
              {[
                "Heure",
                "Client",
                "Couverts",
                "Table",
                "Statut",
                "Commentaire",
              ].map((label) => (
                <th key={label} className="border border-black/30 px-2 py-2">
                  {label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {printableReservations.length ? (
              printableReservations.map((reservation) => (
                <tr key={reservation._id} className="break-inside-avoid">
                  <td className="border border-black/30 px-2 py-2">
                    {String(reservation?.reservationTime || "--:--").slice(
                      0,
                      5,
                    )}
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
