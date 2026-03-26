const PDFDocument = require("pdfkit");

const COLORS = {
  darkBlue: "#131E36",
  text: "#222222",
  muted: "#64748B",
  border: "#D9DEE8",
  surface: "#F8FAFC",
  accent: "#4583FF",
  warning: "#FF7664",
};

function formatDateKey(value) {
  if (!value) return "-";

  try {
    return new Intl.DateTimeFormat("fr-FR", {
      weekday: "short",
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
    }).format(new Date(`${value}T12:00:00`));
  } catch {
    return "-";
  }
}

function formatDateTime(value) {
  if (!value) return "-";

  try {
    return new Intl.DateTimeFormat("fr-FR", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    }).format(new Date(value));
  } catch {
    return "-";
  }
}

function formatMinutes(value) {
  const minutes = Math.max(0, Number(value || 0));
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return `${hours}h${String(rest).padStart(2, "0")}`;
}

function getEmployeeName(employee) {
  return (
    `${employee?.firstname || ""} ${employee?.lastname || ""}`.trim() ||
    "Salarié"
  );
}

function getAnomalyLabel(code) {
  switch (String(code || "").trim()) {
    case "missing_clock_out":
      return "Sortie manquante";
    case "open_break":
      return "Pause en cours";
    case "long_break":
      return "Pause longue";
    case "long_shift":
      return "Amplitude longue";
    case "invalid_times":
      return "Horaires incohérents";
    default:
      return String(code || "").trim() || "Anomalie";
  }
}

function formatAnomalies(list = []) {
  return (Array.isArray(list) ? list : [])
    .map(getAnomalyLabel)
    .filter(Boolean)
    .join(", ");
}

function safeText(value) {
  return String(value || "").trim();
}

function truncateToWidth(doc, text, maxWidth) {
  const source = safeText(text);
  if (!source) return "";
  if (!Number.isFinite(maxWidth) || maxWidth <= 0) return "";
  if (doc.widthOfString(source) <= maxWidth) return source;

  let truncated = source;
  while (
    truncated.length > 1 &&
    doc.widthOfString(`${truncated}…`) > maxWidth
  ) {
    truncated = truncated.slice(0, -1);
  }

  return truncated.length < source.length ? `${truncated}…` : truncated;
}

function drawArrowShape(doc, x, centerY, length = 12, color = COLORS.text) {
  const shaftLength = Math.max(6, length - 4);
  const arrowEndX = x + length;
  const shaftEndX = x + shaftLength;

  doc.save();
  doc.lineWidth(1);
  doc.strokeColor(color);
  doc.moveTo(x, centerY).lineTo(shaftEndX, centerY).stroke();
  doc
    .moveTo(shaftEndX, centerY - 3)
    .lineTo(arrowEndX, centerY)
    .lineTo(shaftEndX, centerY + 3)
    .stroke();
  doc.restore();
}

function drawArrowLine(
  doc,
  { prefix = "", left = "", right = "", suffix = "" },
  x,
  y,
  maxWidth,
  options = {},
) {
  const fontSize = options.fontSize || 9;
  const color = options.color || COLORS.text;
  const arrowWidth = options.arrowWidth || 12;
  const gap = options.gap || 4;
  const lineHeight = fontSize + 3;
  const arrowCenterY = options.getArrowCenterY
    ? options.getArrowCenterY(y, fontSize, lineHeight)
    : y + lineHeight * 0.55;
  const fixedLeftWidth = Number.isFinite(options.fixedLeftWidth)
    ? options.fixedLeftWidth
    : null;

  const leftText = safeText(left) || "-";
  const rightText = safeText(right) || "-";
  const suffixText = safeText(suffix) ? ` ${safeText(suffix)}` : "";
  const prefixText = safeText(prefix);

  doc.font("Helvetica").fontSize(fontSize).fillColor(color);

  const leftWidth = doc.widthOfString(leftText);
  const rightWidth = doc.widthOfString(rightText);
  const suffixWidth = doc.widthOfString(suffixText);
  const leftSlotWidth = Math.max(leftWidth, fixedLeftWidth || 0);
  const reservedWidth =
    leftSlotWidth + gap + arrowWidth + gap + rightWidth + suffixWidth;
  const availablePrefixWidth = Math.max(
    0,
    maxWidth - reservedWidth - (prefixText ? gap : 0),
  );
  const prefixRendered = truncateToWidth(doc, prefixText, availablePrefixWidth);
  const prefixWidth = doc.widthOfString(prefixRendered);

  let cursorX = x;

  if (prefixRendered) {
    doc.text(prefixRendered, cursorX, y, { lineBreak: false });
    cursorX += prefixWidth + gap;
  }

  doc.text(leftText, cursorX + leftSlotWidth - leftWidth, y, {
    lineBreak: false,
  });
  cursorX += leftSlotWidth + gap;

  drawArrowShape(doc, cursorX, arrowCenterY, arrowWidth, color);
  cursorX += arrowWidth + gap;

  doc.text(rightText, cursorX, y, { lineBreak: false });
  cursorX += rightWidth;

  if (suffixText) {
    doc.text(suffixText, cursorX, y, { lineBreak: false });
  }

  return lineHeight;
}

function getArrowCenterY(y, fontSize) {
  return y + fontSize * 0.48;
}

function getArrowLinesHeight(doc, lines, fontSize = 9, rowPadding = 5) {
  doc.font("Helvetica").fontSize(fontSize);
  const lineHeight = fontSize + 3;
  const count = Math.max(1, Array.isArray(lines) ? lines.length : 1);
  return count * lineHeight + rowPadding * 2;
}

function drawTable(doc, headers, rows, columnWidths) {
  const startX = doc.page.margins.left;
  const availableWidth =
    doc.page.width - doc.page.margins.left - doc.page.margins.right;
  const widths =
    Array.isArray(columnWidths) && columnWidths.length === headers.length
      ? columnWidths
      : Array(headers.length).fill(availableWidth / headers.length);
  const headerHeight = 22;
  const rowPadding = 5;
  const bottom = doc.page.height - doc.page.margins.bottom;
  let y = doc.y;

  function renderHeader() {
    let x = startX;

    headers.forEach((header, index) => {
      const width = widths[index];
      doc
        .rect(x, y, width, headerHeight)
        .fillAndStroke(COLORS.surface, COLORS.border);
      doc
        .fillColor(COLORS.darkBlue)
        .font("Helvetica-Bold")
        .fontSize(9)
        .text(header, x + 6, y + 6, {
          width: width - 12,
          ellipsis: true,
        });
      x += width;
    });

    y += headerHeight;
  }

  function getRowHeight(row) {
    return row.reduce((maxHeight, cell, index) => {
      if (cell && typeof cell === "object" && cell.type === "arrow_lines") {
        return Math.max(
          maxHeight,
          getArrowLinesHeight(doc, cell.lines, 9, rowPadding),
        );
      }

      const text = safeText(cell);
      const width = Math.max(20, widths[index] - 12);
      const height =
        doc.heightOfString(text || "-", {
          width,
          align: index === 0 ? "left" : "left",
        }) +
        rowPadding * 2;
      return Math.max(maxHeight, height);
    }, 28);
  }

  renderHeader();

  rows.forEach((row) => {
    const rowHeight = getRowHeight(row);

    if (y + rowHeight > bottom) {
      doc.addPage();
      y = doc.page.margins.top;
      renderHeader();
    }

    let x = startX;
    row.forEach((cell, index) => {
      const width = widths[index];
      doc.rect(x, y, width, rowHeight).stroke(COLORS.border);

      if (cell && typeof cell === "object" && cell.type === "arrow_lines") {
        const contentX = x + 6;
        const contentY = y + rowPadding;
        const lineHeight = 12;
        const fixedLeftWidth = (() => {
          doc.font("Helvetica").fontSize(9);
          return doc.widthOfString("00:00");
        })();

        (cell.lines || []).forEach((line, lineIndex) => {
          drawArrowLine(
            doc,
            line,
            contentX,
            contentY + lineIndex * lineHeight,
            width - 12,
            {
              fixedLeftWidth,
              fontSize: 9,
              getArrowCenterY,
            },
          );
        });
      } else {
        doc
          .fillColor(COLORS.text)
          .font("Helvetica")
          .fontSize(9)
          .text(safeText(cell) || "-", x + 6, y + rowPadding, {
            width: width - 12,
          });
      }
      x += width;
    });

    y += rowHeight;
  });

  doc.y = y + 10;
}

async function buildTimeClockExportPdf({
  restaurantName = "Restaurant",
  startDate,
  endDate,
  employees = [],
  generatedAt = new Date(),
}) {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({
      size: "A4",
      margin: 42,
    });

    const chunks = [];
    doc.on("data", (chunk) => chunks.push(chunk));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    const globalWorked = employees.reduce(
      (total, item) => total + Number(item?.range?.totalWorkedMinutes || 0),
      0,
    );
    const globalBreaks = employees.reduce(
      (total, item) => total + Number(item?.range?.totalBreakMinutes || 0),
      0,
    );
    const globalSessions = employees.reduce(
      (total, item) => total + Number(item?.range?.totalSessions || 0),
      0,
    );

    doc
      .font("Helvetica-Bold")
      .fontSize(21)
      .fillColor(COLORS.darkBlue)
      .text("Export des heures salariés");

    doc.moveDown(0.4);
    doc
      .font("Helvetica")
      .fontSize(10)
      .fillColor(COLORS.muted)
      .text(restaurantName);
    const periodLabel = "Période:";
    const periodLineY = doc.y;
    doc.text(periodLabel, doc.page.margins.left, periodLineY, {
      lineBreak: false,
    });
    const periodX = doc.page.margins.left + doc.widthOfString(periodLabel) + 6;
    drawArrowLine(
      doc,
      {
        left: formatDateKey(startDate),
        right: formatDateKey(endDate),
      },
      periodX,
      periodLineY,
      360,
      { fontSize: 10, arrowWidth: 14, getArrowCenterY },
    );
    doc.x = doc.page.margins.left;
    doc.y = periodLineY + 16;
    doc.text(
      `Généré le ${formatDateTime(generatedAt)}`,
      doc.page.margins.left,
      doc.y,
    );

    doc.moveDown(0.8);
    const summaryBoxY = doc.y;
    const summaryBoxX = doc.page.margins.left;
    const summaryBoxWidth = 250;
    const summaryBoxHeight = 100;
    doc
      .roundedRect(
        summaryBoxX,
        summaryBoxY,
        summaryBoxWidth,
        summaryBoxHeight,
        14,
      )
      .fillAndStroke(COLORS.surface, COLORS.border);
    doc
      .fillColor(COLORS.darkBlue)
      .font("Helvetica-Bold")
      .fontSize(11)
      .text("Synthèse", summaryBoxX + 14, summaryBoxY + 10);
    doc
      .font("Helvetica")
      .fontSize(10)
      .fillColor(COLORS.text)
      .text(`Salariés: ${employees.length}`, summaryBoxX + 14, summaryBoxY + 30)
      .text(
        `Heures nettes: ${formatMinutes(globalWorked)}`,
        summaryBoxX + 14,
        summaryBoxY + 46,
      )
      .text(
        `Pauses: ${formatMinutes(globalBreaks)}`,
        summaryBoxX + 14,
        summaryBoxY + 62,
      )
      .text(`Services: ${globalSessions}`, summaryBoxX + 14, summaryBoxY + 78);

    doc.x = doc.page.margins.left;
    doc.y = summaryBoxY + summaryBoxHeight + 18;

    if (!employees.length) {
      doc
        .font("Helvetica")
        .fontSize(11)
        .fillColor(COLORS.text)
        .text("Aucun salarié sélectionné pour cette période.");
      doc.end();
      return;
    }

    employees.forEach((employeeReport, index) => {
      if (index > 0) {
        doc.addPage();
      }

      const employee = employeeReport?.employee || {};
      const range = employeeReport?.range || {};
      const activeDays = (range.days || []).filter(
        (day) => day.sessionCount > 0 || (day.anomalies || []).length > 0,
      );

      doc.x = doc.page.margins.left;
      doc
        .font("Helvetica-Bold")
        .fontSize(16)
        .fillColor(COLORS.darkBlue)
        .text(getEmployeeName(employee), doc.page.margins.left, doc.y);

      doc.moveDown(0.2);
      doc
        .font("Helvetica")
        .fontSize(10)
        .fillColor(COLORS.muted)
        .text(
          employee?.post || "Poste non renseigné",
          doc.page.margins.left,
          doc.y,
        );

      doc.moveDown(0.6);
      doc
        .font("Helvetica")
        .fontSize(10)
        .fillColor(COLORS.text)
        .text(
          `Heures nettes: ${formatMinutes(range.totalWorkedMinutes)}`,
          doc.page.margins.left,
          doc.y,
        )
        .text(
          `Pauses: ${formatMinutes(range.totalBreakMinutes)}`,
          doc.page.margins.left,
        )
        .text(
          `Temps brut: ${formatMinutes(range.totalGrossMinutes)}`,
          doc.page.margins.left,
        )
        .text(`Services: ${range.totalSessions || 0}`, doc.page.margins.left);

      if ((range.anomalies || []).length) {
        doc.moveDown(0.4);
        doc
          .font("Helvetica-Bold")
          .fontSize(10)
          .fillColor(COLORS.warning)
          .text(
            `Anomalies: ${formatAnomalies(range.anomalies || [])}`,
            doc.page.margins.left,
            doc.y,
          );
      }

      doc.moveDown(0.8);

      if (!activeDays.length) {
        doc
          .font("Helvetica")
          .fontSize(10)
          .fillColor(COLORS.text)
          .text("Aucun pointage sur la période sélectionnée.");
        return;
      }

      const rows = activeDays.map((day) => {
        const serviceLines = (day.sessions || []).map((session) => {
          const startLabel = session?.dayTotals?.startAt
            ? formatDateTime(session.dayTotals.startAt).slice(11)
            : formatDateTime(session.clockInAt).slice(11);
          const endLabel = session?.dayTotals?.endAt
            ? formatDateTime(session.dayTotals.endAt).slice(11)
            : session.clockOutAt
              ? formatDateTime(session.clockOutAt).slice(11)
              : "en cours";

          return {
            left: startLabel,
            right: endLabel,
            suffix: `(${formatMinutes(session?.dayTotals?.workedMinutes || 0)})`,
          };
        });

        return [
          formatDateKey(day.date),
          serviceLines.length
            ? { type: "arrow_lines", lines: serviceLines }
            : "-",
          formatMinutes(day.totalWorkedMinutes),
          formatMinutes(day.totalBreakMinutes),
          formatMinutes(day.totalGrossMinutes),
          formatAnomalies(day.anomalies || []),
        ];
      });

      drawTable(
        doc,
        ["Jour", "Services", "Net", "Pauses", "Brut", "Anomalies"],
        rows,
        [88, 180, 58, 58, 58, 74],
      );
    });

    doc.end();
  });
}

module.exports = {
  buildTimeClockExportPdf,
};
