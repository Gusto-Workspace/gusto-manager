const PDFDocument = require("pdfkit");
const fs = require("fs");
const path = require("path");

function text(value) {
  return value == null ? "" : String(value).trim();
}

function number(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function money(value, currency = "EUR") {
  const normalizedCurrency = text(currency).toUpperCase() || "EUR";
  try {
    return new Intl.NumberFormat("fr-FR", {
      style: "currency",
      currency: normalizedCurrency,
    }).format(number(value));
  } catch {
    return `${number(value).toFixed(2).replace(".", ",")} ${normalizedCurrency}`;
  }
}

function recurrence(item = {}) {
  const count = Math.max(1, number(item.intervalCount, 1));
  const interval = text(item.interval) || "month";
  const labels = {
    day: count === 1 ? "jour" : `${count} jours`,
    week: count === 1 ? "semaine" : `${count} semaines`,
    month: count === 1 ? "mois" : `${count} mois`,
    year: count === 1 ? "an" : `${count} ans`,
  };
  return labels[interval] || (count === 1 ? interval : `${count} ${interval}`);
}

function dateFr(value) {
  const parsed = value ? new Date(value) : null;
  if (!parsed || Number.isNaN(parsed.getTime())) return "-";
  return parsed.toLocaleDateString("fr-FR");
}

function absolutePathIfExists(value) {
  if (!value) return null;
  const absolute = path.isAbsolute(value)
    ? value
    : path.join(process.cwd(), value);
  return fs.existsSync(absolute) ? absolute : null;
}

function itemAmount(item = {}) {
  const quantity = Math.max(1, number(item.quantity, 1));
  return number(item.unitAmount) * quantity;
}

async function renderAmendmentPdf(documentData, emitter, signatureImageBuffer) {
  const margin = 48;
  const bandHeight = 30;
  const pdf = new PDFDocument({
    size: "A4",
    margins: { top: margin, right: margin, bottom: 90, left: margin },
  });
  const chunks = [];
  pdf.on("data", (chunk) => chunks.push(chunk));

  const contentWidth = pdf.page.width - margin * 2;
  const pageRight = pdf.page.width - margin;

  function drawBand() {
    pdf.save();
    pdf
      .rect(0, pdf.page.height - bandHeight, pdf.page.width, bandHeight)
      .fill("#2E373E");
    pdf.restore();
  }

  function ensureSpace(height) {
    if (pdf.y + height > pdf.page.height - pdf.page.margins.bottom) {
      pdf.addPage();
    }
  }

  function paragraph(value, options = {}) {
    ensureSpace(options.height || 42);
    pdf
      .fontSize(options.size || 10)
      .fillColor(options.color || "#111")
      .text(value, margin, pdf.y, {
        width: contentWidth,
        lineGap: 2,
        align: options.align || "left",
      });
    pdf.moveDown(options.after ?? 0.45);
  }

  function heading(value) {
    ensureSpace(50);
    pdf.fontSize(12).fillColor("#111").text(value, margin, pdf.y, {
      width: contentWidth,
      underline: true,
    });
    pdf.moveDown(0.65);
  }

  drawBand();
  pdf.on("pageAdded", () => {
    drawBand();
    pdf.x = margin;
    pdf.y = margin;
  });

  const logo = absolutePathIfExists(emitter?.logoPath);
  if (logo) {
    pdf.image(logo, margin, margin, { height: 64 });
  } else {
    pdf
      .fontSize(18)
      .fillColor("#111")
      .text(emitter?.title || "Gusto Manager");
  }

  pdf
    .fontSize(12)
    .fillColor("#111")
    .text(`AVENANT ${text(documentData.docNumber)}`, margin, margin, {
      width: contentWidth,
      align: "right",
    });
  pdf
    .fontSize(10)
    .fillColor("#555")
    .text(
      `Date : ${dateFr(documentData.issueDate || new Date())}`,
      margin,
      margin + 18,
      {
        width: contentWidth,
        align: "right",
      },
    );
  pdf.y = margin + 92;

  pdf
    .fontSize(20)
    .fillColor("#111")
    .text("Avenant au contrat de service", margin, pdf.y, {
      width: contentWidth,
      align: "center",
    });
  pdf.moveDown(1);

  const party = documentData.party || {};
  const amendment = documentData.amendment || {};
  paragraph(
    `Entre ${emitter?.title || "Gusto Manager"}, le Prestataire, et ${party.restaurantName || "le Client"}${party.ownerName ? `, représenté par ${party.ownerName}` : ""}.`,
  );
  paragraph(
    `Le présent avenant actualise les prestations souscrites au titre du contrat ${amendment.baseContractNumber || "initial"}, signé le ${dateFr(amendment.baseContractSignedAt)}.`,
    { after: 0.8 },
  );

  heading("1. Nouvelle situation contractuelle");
  const items = Array.isArray(documentData?.commercialSnapshot?.items)
    ? documentData.commercialSnapshot.items
    : [];
  if (!items.length) {
    paragraph(
      "Le récapitulatif commercial est détaillé dans les éléments convenus ci-dessus.",
    );
  } else {
    const tableX = margin;
    const labelWidth = 260;
    const quantityX = tableX + labelWidth + 10;
    const unitX = quantityX + 55;
    const totalX = unitX + 90;

    ensureSpace(50);
    const headerY = pdf.y;
    pdf.fontSize(9).fillColor("#333");
    pdf.text("Prestation", tableX, headerY, { width: labelWidth });
    pdf.text("Qté", quantityX, headerY, { width: 40, align: "right" });
    pdf.text("Tarif", unitX, headerY, { width: 78, align: "right" });
    pdf.text("Total", totalX, headerY, { width: 78, align: "right" });
    pdf
      .moveTo(margin, headerY + 14)
      .lineTo(pageRight, headerY + 14)
      .strokeColor("#ddd")
      .stroke();
    pdf.y = headerY + 22;

    items.forEach((item) => {
      pdf.fontSize(9.5).fillColor("#111");
      const itemLabel = item.label || item.code || "-";
      const offered = number(item.unitAmount) <= 0;
      const unitLabel = offered
        ? "Offert"
        : `${money(item.unitAmount, item.currency)} / ${recurrence(item)}`;
      const totalLabel = offered ? "0,00 €" : money(itemAmount(item), item.currency);
      const rowHeight =
        Math.max(
          pdf.heightOfString(itemLabel, { width: labelWidth }),
          pdf.heightOfString(unitLabel, { width: 78 }),
          pdf.heightOfString(totalLabel, { width: 78 }),
        ) + 6;
      ensureSpace(rowHeight);
      const rowY = pdf.y;
      pdf.text(item.label || item.code || "-", tableX, rowY, {
        width: labelWidth,
      });
      pdf.text(String(item.quantity || 1), quantityX, rowY, {
        width: 40,
        align: "right",
      });
      pdf.text(unitLabel, unitX, rowY, {
        width: 78,
        align: "right",
      });
      pdf.text(totalLabel, totalX, rowY, {
        width: 78,
        align: "right",
      });
      pdf.y = rowY + rowHeight;
    });

    const recurrenceKeys = new Set(
      items.map(
        (item) =>
          `${text(item.currency).toUpperCase()}|${text(item.interval)}|${number(item.intervalCount, 1)}`,
      ),
    );
    if (recurrenceKeys.size === 1) {
      const total = items.reduce((sum, item) => sum + itemAmount(item), 0);
      pdf.moveDown(0.5);
      paragraph(
        `Total : ${money(total, items[0]?.currency)} / ${recurrence(items[0])}`,
        { align: "right", after: 0.8 },
      );
    }
  }

  heading("2. Prise d’effet et maintien du contrat");
  paragraph(
    "Les évolutions décrites dans le présent avenant prennent effet selon les modalités commerciales convenues entre les parties. Toutes les clauses du contrat initial non modifiées par cet avenant restent pleinement applicables.",
    { after: 1 },
  );

  if (text(documentData.comments)) {
    heading("3. Conditions particulières");
    paragraph(text(documentData.comments), { after: 1 });
  }

  ensureSpace(190);
  const place = text(documentData.placeOfSignature);
  paragraph(
    place
      ? `Fait à ${place}, le ${dateFr(documentData.signatureDate || documentData.issueDate || new Date())}`
      : `Lieu renseigné lors de la signature, le ${dateFr(documentData.signatureDate || documentData.issueDate || new Date())}`,
    {
      after: 0.6,
    },
  );

  const baseY = pdf.y;
  const boxWidth = 220;
  const boxHeight = 86;
  pdf.fontSize(10).fillColor("#111").text("Le Prestataire", margin, baseY);
  pdf.text("Le Client", 320, baseY);
  pdf
    .strokeColor("#cfd5dd")
    .rect(margin, baseY + 18, boxWidth, boxHeight)
    .stroke();
  pdf
    .strokeColor("#cfd5dd")
    .rect(320, baseY + 18, boxWidth, boxHeight)
    .stroke();

  const providerSignature = absolutePathIfExists(emitter?.signaturePath);
  if (providerSignature) {
    pdf.image(providerSignature, margin + 10, baseY + 28, {
      fit: [boxWidth - 20, boxHeight - 20],
      align: "center",
      valign: "center",
    });
  }

  if (signatureImageBuffer) {
    pdf.image(signatureImageBuffer, 330, baseY + 28, {
      fit: [boxWidth - 20, boxHeight - 20],
      align: "center",
      valign: "center",
    });
  } else {
    pdf
      .fontSize(9)
      .fillColor("#666")
      .text(
        "Signature du client",
        332,
        baseY + 47,
        {
          width: boxWidth - 24,
          align: "center",
        },
      );
  }

  pdf.end();
  await new Promise((resolve) => pdf.on("end", resolve));
  return Buffer.concat(chunks);
}

module.exports = { renderAmendmentPdf };
