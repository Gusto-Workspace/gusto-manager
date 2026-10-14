const PDFDocument = require("pdfkit");
const { DateTime } = require("luxon");
const {
  ZONE,
  MODULE_LABELS,
  summarize,
} = require("../transaction-financials.service");

const C = {
  blue: "#131E36",
  orange: "#E66430",
  muted: "#64748B",
  line: "#D9DEE8",
  surface: "#F5F7FA",
  red: "#B42318",
};
function money(cents, currency) {
  // PDFKit's built-in fonts support normal spaces, not narrow no-break spaces.
  return new Intl.NumberFormat("fr-FR", {
    style: "currency",
    currency: currency.toUpperCase(),
  })
    .format(cents === 0 ? 0 : cents / 100)
    .replace(/[\u202f\u00a0]/g, " ");
}
const clean = (value) =>
  String(value || "")
    .replace(/[\r\n\t]/g, " ")
    .replace(/[\u202f\u00a0]/g, " ");

async function renderTransactionsExport({
  restaurantName,
  period,
  modules,
  rows,
  generatedAt = new Date(),
}) {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({
      size: "A4",
      layout: "landscape",
      margin: 36,
      bufferPages: true,
      info: {
        Title: `Transactions - ${clean(restaurantName)}`,
        Author: "Gusto Manager",
      },
    });
    const chunks = [];
    doc.on("data", (chunk) => chunks.push(chunk));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);
    const width = doc.page.width - 72;
    const bottom = doc.page.height - 55;
    let y = 36;
    function text(value, x, top, w, size = 9, options = {}) {
      doc
        .font(options.bold ? "Helvetica-Bold" : "Helvetica")
        .fontSize(size)
        .fillColor(options.color || C.blue)
        .text(clean(value), x, top, { width: w, lineGap: 2, ...options });
    }
    function page() {
      doc.addPage();
      y = 36;
      text("Gusto Manager / Transactions", 36, y, width, 10, { bold: true });
      y += 17;
      text(restaurantName, 36, y, width, 9, { color: C.muted });
      y += 25;
    }
    function ensure(height) {
      if (y + height > bottom) page();
    }
    text("GUSTO MANAGER", 36, y, width, 11, { color: C.orange, bold: true });
    y += 26;
    const title = clean(restaurantName);
    doc.font("Helvetica-Bold").fontSize(22);
    const titleHeight = doc.heightOfString(title, { width });
    text(title, 36, y, width, 22, { bold: true });
    y += titleHeight + 15;
    text("Rapport des transactions", 36, y, width, 14, { bold: true });
    y += 26;
    text(
      `Période : ${DateTime.fromISO(period.from).toFormat("dd/MM/yyyy")} au ${DateTime.fromISO(period.to).toFormat("dd/MM/yyyy")} inclus - ${ZONE}`,
      36,
      y,
      width,
      10,
    );
    y += 18;
    text(
      `Modules : ${modules.map((module) => MODULE_LABELS[module]).join(" / ")}`,
      36,
      y,
      width,
      10,
    );
    y += 18;
    text(
      `Généré le ${DateTime.fromJSDate(generatedAt, { zone: ZONE }).toFormat("dd/MM/yyyy à HH:mm")} / ${rows.length} opération(s)`,
      36,
      y,
      width,
      9,
      { color: C.muted },
    );
    y += 31;

    const summary = summarize(rows);
    function summaryBlock(titleText, total) {
      ensure(79);
      doc.roundedRect(36, y, width, 66, 7).fill(C.surface);
      text(
        `${titleText} - ${total.currency.toUpperCase()}`,
        48,
        y + 9,
        width - 24,
        10,
        { bold: true },
      );
      const values = [
        ["Encaissements", total.receiptsCents],
        ["Remboursements", -total.refundsCents],
        ["Ajustements", total.adjustmentsCents],
        ["Frais Stripe", total.feesCents],
        ["Net", total.netCents],
      ];
      values.forEach(([label, amount], index) => {
        const x = 48 + index * ((width - 24) / 5);
        text(label, x, y + 29, (width - 24) / 5 - 8, 8, { color: C.muted });
        text(
          money(amount, total.currency),
          x,
          y + 43,
          (width - 24) / 5 - 8,
          11,
          { bold: true, color: amount < 0 ? C.red : C.blue },
        );
      });
      y += 79;
    }
    summary.byCurrency.forEach((total) =>
      summaryBlock("Synthèse générale", total),
    );
    if (modules.length > 1) {
      ensure(100);
      y += 8;
      doc
        .moveTo(36, y)
        .lineTo(36 + width, y)
        .strokeColor(C.line)
        .lineWidth(0.7)
        .stroke();
      y += 12;
      summary.byModule.forEach((total) =>
        summaryBlock(MODULE_LABELS[total.module], total),
      );
    }
    if (!rows.length) {
      ensure(45);
      text(
        "Aucune opération financière éligible sur cette période.",
        36,
        y,
        width,
        12,
      );
      y += 35;
    }

    const columns = [
      { label: "Date", width: 81 },
      { label: "Module", width: 93 },
      { label: "Opération", width: 115 },
      {
        label: "Références Stripe / achat",
        width: width - 81 - 93 - 115 - 231,
      },
      { label: "Brut", width: 77, right: true },
      { label: "Frais Stripe", width: 77, right: true },
      { label: "Net", width: 77, right: true },
    ];
    function tableHeader() {
      doc.rect(36, y, width, 25).fill(C.blue);
      let x = 36;
      for (const col of columns) {
        text(col.label, x + 6, y + 8, col.width - 12, 8, {
          color: "#FFFFFF",
          bold: true,
          align: col.right ? "right" : "left",
        });
        x += col.width;
      }
      y += 25;
    }
    if (rows.length) {
      ensure(65);
      tableHeader();
    }
    rows.forEach((row, index) => {
      const values = [
        DateTime.fromSeconds(row.date, { zone: ZONE }).toFormat(
          "dd/MM/yyyy\nHH:mm",
        ),
        MODULE_LABELS[row.module],
        row.label,
        [row.sourceId || row.id, row.id, row.reference]
          .filter((value, i, array) => value && array.indexOf(value) === i)
          .join("\n"),
        money(row.grossCents, row.currency),
        money(row.feeCents, row.currency),
        money(row.netCents, row.currency),
      ];
      // Explicit line breaks and dynamic height keep full references readable.
      doc.font("Helvetica").fontSize(8);
      const heights = values.map((value, i) =>
        doc.heightOfString(value, { width: columns[i].width - 12, lineGap: 2 }),
      );
      const height = Math.max(39, ...heights.map((h) => h + 16));
      if (y + height > bottom) {
        page();
        tableHeader();
      }
      if (index % 2 === 0) doc.rect(36, y, width, height).fill(C.surface);
      let x = 36;
      values.forEach((value, i) => {
        const col = columns[i];
        doc
          .font("Helvetica")
          .fontSize(8)
          .fillColor(
            i >= 4 && [row.grossCents, row.feeCents, row.netCents][i - 4] < 0
              ? C.red
              : C.blue,
          )
          .text(value, x + 6, y + 8, {
            width: col.width - 12,
            lineGap: 2,
            align: col.right ? "right" : "left",
          });
        x += col.width;
      });
      y += height;
      doc
        .moveTo(36, y)
        .lineTo(36 + width, y)
        .strokeColor(C.line)
        .lineWidth(0.4)
        .stroke();
    });
    // Reliability notes remain available to the calling service; the exported
    // report ends after the transactions table and financial summaries.
    const range = doc.bufferedPageRange();
    for (
      let index = range.start;
      index < range.start + range.count;
      index += 1
    ) {
      doc.switchToPage(index);
      // Footer stays above PDFKit's automatic bottom page break.
      text(
        `Gusto Manager - ${index + 1} / ${range.count}`,
        36,
        doc.page.height - 48,
        width,
        8,
        { align: "right", color: C.muted },
      );
    }
    doc.end();
  });
}

module.exports = { renderTransactionsExport };
