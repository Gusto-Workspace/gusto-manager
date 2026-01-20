const PDFDocument = require("pdfkit");
const fs = require("fs");
const path = require("path");

function euro(n) {
  return `${Number(n || 0)
    .toFixed(2)
    .replace(".", ",")} €`;
}

function fmtDate(d) {
  if (!d) return "-";
  const dt = new Date(d);
  return dt.toLocaleDateString("fr-FR");
}

function safeText(v) {
  return (v || "").toString().trim();
}

function toNumber(v, fallback = 0) {
  const n = Number(v);
  return Number.isNaN(n) ? fallback : n;
}

function computeTotals(doc) {
  const lines = doc.lines || [];
  const computed = lines.map((l) => {
    const qty = toNumber(l.qty, 1);
    const unit = toNumber(l.unitPrice, 0);
    const offered = Boolean(l.offered);
    const total = offered ? 0 : qty * unit;
    return { ...l, qty, unitPrice: offered ? 0 : unit, offered, total };
  });

  const subtotal = computed.reduce((acc, l) => acc + (l.total || 0), 0);
  const discountAmount = toNumber(doc?.totals?.discountAmount, 0);
  const total = subtotal - discountAmount;

  return {
    lines: computed,
    totals: {
      subtotal,
      discountLabel: doc?.totals?.discountLabel || "",
      discountAmount,
      total,
    },
  };
}

function isOffered(module) {
  return Boolean(module?.offered);
}

function computeMonthlyAmount(documentData) {
  const subPrice = toNumber(documentData?.subscription?.priceMonthly, 0);

  const mods = Array.isArray(documentData?.modules) ? documentData.modules : [];
  const modsSum = mods.reduce((acc, m) => {
    if (!safeText(m?.name)) return acc;
    if (isOffered(m)) return acc;
    return acc + toNumber(m?.priceMonthly, 0);
  }, 0);

  return subPrice + modsSum;
}

function hasSubscriptionSection(documentData) {
  const subName = safeText(documentData?.subscription?.name);
  const subPrice = toNumber(documentData?.subscription?.priceMonthly, 0);

  const mods = Array.isArray(documentData?.modules) ? documentData.modules : [];
  const hasMods = mods.some((m) => safeText(m?.name));

  return Boolean(subName) || subPrice > 0 || hasMods;
}

async function renderInvoiceLikePdf(documentData, emitter) {
  const doc = new PDFDocument({ size: "A4", margin: 50 });
  const chunks = [];
  doc.on("data", (c) => chunks.push(c));

  const { lines, totals } = computeTotals(documentData);

  // Layout constants
  const LEFT_X = 50;
  const RIGHT_X = 50;
  const PAGE_RIGHT = 545;

  const HEADER_TOP_Y = 50;
  const LOGO_HEIGHT = 100; // ✅ demandé

  /* ---------------- Header LEFT (logo + coordonnées) ---------------- */
  let leftBlockBottomY = HEADER_TOP_Y;

  // Logo
  if (emitter?.logoPath) {
    const logoAbs = path.isAbsolute(emitter.logoPath)
      ? emitter.logoPath
      : path.join(process.cwd(), emitter.logoPath);

    if (fs.existsSync(logoAbs)) {
      // width auto via height, ratio conservé
      doc.image(logoAbs, LEFT_X, HEADER_TOP_Y, { height: LOGO_HEIGHT });

      leftBlockBottomY = HEADER_TOP_Y + LOGO_HEIGHT + 8; // ✅ texte dessous
    } else {
      // fallback texte si logo introuvable
      doc.fontSize(18).text(emitter.title || "WebDev", LEFT_X, HEADER_TOP_Y, {
        align: "left",
      });
      leftBlockBottomY = HEADER_TOP_Y + 26;
    }
  } else {
    doc.fontSize(18).text(emitter.title || "WebDev", LEFT_X, HEADER_TOP_Y, {
      align: "left",
    });
    leftBlockBottomY = HEADER_TOP_Y + 26;
  }

  // Coordonnées sous logo
  doc
    .fontSize(10)
    .fillColor("#444")
    .text(emitter.address || "", LEFT_X, leftBlockBottomY, { align: "left" });
  if (emitter.email) doc.text(emitter.email, LEFT_X);
  doc.fillColor("#000");

  const leftAfterHeaderY = doc.y; // y courant après coordonnées

  /* ---------------- Header RIGHT (meta) ---------------- */
  const docLabel =
    documentData.type === "QUOTE"
      ? "DEVIS"
      : documentData.type === "INVOICE"
        ? "FACTURE"
        : "DOCUMENT";

  // On écrit en position absolue pour ne pas casser le flow du doc
  doc
    .fontSize(12)
    .fillColor("#000")
    .text(`${docLabel} ${documentData.docNumber}`, RIGHT_X, HEADER_TOP_Y, {
      align: "right",
    });

  doc
    .fontSize(10)
    .fillColor("#444")
    .text(
      `Date : ${fmtDate(documentData.issueDate)}`,
      RIGHT_X,
      HEADER_TOP_Y + 18,
      {
        align: "right",
      },
    );

  if (documentData.dueDate) {
    doc.text(
      `Échéance : ${fmtDate(documentData.dueDate)}`,
      RIGHT_X,
      HEADER_TOP_Y + 33,
      { align: "right" },
    );
  }
  doc.fillColor("#000");

  /* ---------------- Start body under header ---------------- */
  // On part du plus bas entre (coordonnées gauche) et (bloc meta droite)
  const rightMetaBottomY = HEADER_TOP_Y + 48;
  let y = Math.max(leftAfterHeaderY, rightMetaBottomY) + 18;
  doc.y = y;

  /* ---------------- Client block (RIGHT, no title, spaced lines) ---------------- */
  // On place le bloc "client" à droite, en absolu, sans impacter doc.y
  const clientLines = [
    safeText(documentData?.party?.restaurantName),
    safeText(documentData?.party?.ownerName),
    safeText(documentData?.party?.address),
    safeText(documentData?.party?.email),
    safeText(documentData?.party?.phone),
  ].filter(Boolean);

  // Zone à droite : même colonne visuelle que les totaux (350 -> PAGE_RIGHT)
  const CLIENT_BLOCK_X = 395;
  const CLIENT_BLOCK_W = PAGE_RIGHT - CLIENT_BLOCK_X; // 195

  // Y de départ : juste sous le header
  const clientTopY = doc.y - 60;

  doc.fontSize(10).fillColor("#111");
  let cy = clientTopY;

  const CLIENT_LINE_GAP = 4.5; // ✅ léger espacement vertical entre lignes
  for (const line of clientLines) {
    doc.text(line, CLIENT_BLOCK_X, cy, {
      width: CLIENT_BLOCK_W,
      align: "left",
    });
    cy = doc.y + CLIENT_LINE_GAP;
  }

  // On démarre la table sous le plus bas entre le bloc client et le flow courant
  y = Math.max(doc.y, cy) + 18;
  doc.y = cy + 75;

  /* ---------------- Table header ---------------- */
  doc.moveDown(0.2);
  const tableTop = doc.y;

  const colLabel = 50;
  const colQty = 360;
  const colUnit = 410;
  const colTotal = 490;

  doc.fontSize(10).text("Description", colLabel, tableTop);
  doc.text("Qté", colQty, tableTop, { width: 40, align: "right" });
  doc.text("PU", colUnit, tableTop, { width: 60, align: "right" });
  doc.text("Total", colTotal, tableTop, { width: 60, align: "right" });

  doc
    .moveTo(50, tableTop + 14)
    .lineTo(PAGE_RIGHT, tableTop + 14)
    .strokeColor("#ddd")
    .stroke();

  /* ---------------- Lines ---------------- */
  y = tableTop + 22;
  doc.fontSize(10).fillColor("#111");

  for (const l of lines) {
    doc.text(l.label || "-", colLabel, y, { width: 290 });
    doc.text(String(l.qty), colQty, y, { width: 40, align: "right" });
    doc.text(l.offered ? "Offert" : euro(l.unitPrice), colUnit, y, {
      width: 60,
      align: "right",
    });
    doc.text(l.offered ? "Offert" : euro(l.total), colTotal, y, {
      width: 60,
      align: "right",
    });

    y += 18;
    if (y > 700) {
      doc.addPage();
      y = 60;
    }
  }

  /* ---------------- Abonnement + modules ---------------- */
  if (hasSubscriptionSection(documentData)) {
    y += 18;
    if (y > 700) {
      doc.addPage();
      y = 60;
    }

    doc.strokeColor("#eee").moveTo(50, y).lineTo(PAGE_RIGHT, y).stroke();
    y += 14;

    doc
      .fontSize(11)
      .fillColor("#111")
      .text("Abonnement & modules (récurrent)", 50, y);
    y += 18;

    const subName = safeText(documentData?.subscription?.name);
    const subPrice = toNumber(documentData?.subscription?.priceMonthly, 0);

    // ✅ espacement réduit entre "Abonnement :" et valeur
    if (subName || subPrice > 0) {
      doc.fontSize(10).fillColor("#111");

      const label = "Abonnement :";
      const labelX = 50;
      doc.text(label, labelX, y);

      // on calcule où commencer le nom (juste après le label)
      const labelW = doc.widthOfString(label);
      const valueX = labelX + labelW + 8; // ✅ petit gap

      doc.text(subName || "-", valueX, y, { width: 260 });

      doc.text(subPrice > 0 ? `${euro(subPrice)} / mois` : "-", 410, y, {
        width: 135,
        align: "right",
      });

      y += 16;
    }

    const mods = Array.isArray(documentData?.modules)
      ? documentData.modules
      : [];
    const filtered = mods.filter((m) => safeText(m?.name));

    if (filtered.length) {
      doc.fontSize(10).fillColor("#111").text("Modules :", 50, y);
      y += 14;

      for (const m of filtered) {
        const name = safeText(m.name);
        const price = isOffered(m)
          ? "Offert"
          : `${euro(toNumber(m.priceMonthly, 0))} / mois`;

        doc.text(`• ${name}`, 60, y, { width: 330 });
        doc.text(price, 410, y, { width: 135, align: "right" });

        y += 16;
        if (y > 700) {
          doc.addPage();
          y = 60;
        }
      }
    }
  }

  /* ---------------- Totals ---------------- */
  y += 18;
  if (y > 700) {
    doc.addPage();
    y = 60;
  }

  doc
    .strokeColor("#ddd")
    .moveTo(350, y + 10)
    .lineTo(PAGE_RIGHT, y + 10)
    .stroke();
  y += 20;

  doc.fontSize(10).fillColor("#444");
  doc.text("Sous-total", 350, y, { width: 120 });
  doc.fillColor("#111").text(euro(totals.subtotal), 470, y, {
    width: 75,
    align: "right",
  });
  y += 16;

  if (totals.discountAmount > 0) {
    doc.fillColor("#444").text(totals.discountLabel || "Remise", 350, y, {
      width: 120,
    });
    doc.fillColor("#111").text(`- ${euro(totals.discountAmount)}`, 470, y, {
      width: 75,
      align: "right",
    });
    y += 16;
  }

  const monthlyAmount = computeMonthlyAmount(documentData);
  if (monthlyAmount > 0) {
    doc.fillColor("#444").text("Montant mensuel", 350, y, { width: 120 });
    doc.fillColor("#111").text(euro(monthlyAmount), 470, y, {
      width: 75,
      align: "right",
    });
    y += 16;
  }

  doc.fontSize(11).fillColor("#111").text("Total", 350, y, { width: 120 });
  doc.text(euro(totals.total), 470, y, { width: 75, align: "right" });

  /* ---------------- Footer ---------------- */
  doc.y = y + 28;

  doc
    .fontSize(9)
    .fillColor("#444")
    .text("TVA non applicable, art. 293 B du CGI.", 50, doc.y);

  // ✅ IBAN/BIC uniquement sur FACTURE
  if (documentData.type === "INVOICE" && (emitter.iban || emitter.bic)) {
    doc.moveDown(1);
    doc.text(`IBAN : ${emitter.iban || "-"}`);
    doc.text(`BIC : ${emitter.bic || "-"}`);
  }

  // ---------------- Bande bleue bas de page ----------------
  const PAGE_HEIGHT = doc.page.height;
  const BAND_HEIGHT = 30; // hauteur de la bande

  doc
    .save()
    .rect(0, PAGE_HEIGHT - BAND_HEIGHT, doc.page.width, BAND_HEIGHT)
    .fill("rgb(46, 55, 62)")
    .restore();

  doc.end();
  await new Promise((resolve) => doc.on("end", resolve));
  return Buffer.concat(chunks);
}

module.exports = { renderInvoiceLikePdf };
