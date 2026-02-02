const PDFDocument = require("pdfkit");
const fs = require("fs");
const path = require("path");

function fmtDate(d) {
  if (!d) return "-";
  const dt = new Date(d);
  if (Number.isNaN(dt.getTime())) return "-";
  return dt.toLocaleDateString("fr-FR");
}

function safeText(v) {
  return (v || "").toString().trim();
}

function toNumber(v, fallback = 0) {
  const n = Number(v);
  return Number.isNaN(n) ? fallback : n;
}

function euro(n) {
  return `${Number(n || 0)
    .toFixed(2)
    .replace(".", ",")} €`;
}

function isOfferedLine(x) {
  const unit = Number(x?.unitPrice ?? 0);
  return Boolean(x?.offered) || unit <= 0;
}

function isOfferedModule(x) {
  const pm = Number(x?.priceMonthly ?? 0);
  return Boolean(x?.offered) || pm <= 0;
}

function isActiveLine(l) {
  return l?.active !== false;
}

function sitePaymentText(paymentSplit) {
  const n = Number(paymentSplit || 1);
  if (n === 1)
    return "Le paiement s’effectuera par virement bancaire en une (1) fois.";
  if (n === 2)
    return "Le paiement s’effectuera par virement bancaire en deux (2) fois sans frais.";
  if (n === 3)
    return "Le paiement s’effectuera par virement bancaire en trois (3) fois sans frais.";
  return "Le paiement s’effectuera par virement bancaire.";
}

function computeSiteTotal(lines) {
  const arr = Array.isArray(lines) ? lines : [];
  return arr.reduce((acc, l) => {
    const qty = toNumber(l.qty, 1);
    const unit = toNumber(l.unitPrice, 0);
    const offered = isOfferedLine(l);
    return acc + (offered ? 0 : qty * unit);
  }, 0);
}

function computeMonthlyAmount(documentData) {
  const subPrice = toNumber(documentData?.subscription?.priceMonthly, 0);
  const mods = Array.isArray(documentData?.modules) ? documentData.modules : [];

  const modsSum = mods.reduce((acc, m) => {
    if (!safeText(m?.name)) return acc;
    if (isOfferedModule(m)) return acc;
    return acc + toNumber(m?.priceMonthly, 0);
  }, 0);

  return subPrice + modsSum;
}

function absIfExists(p) {
  if (!p) return null;
  const abs = path.isAbsolute(p) ? p : path.join(process.cwd(), p);
  return fs.existsSync(abs) ? abs : null;
}

async function renderContractPdf(documentData, emitter, signatureImageBuffer) {
  const MARGIN = 50;

  // Bandeau bas de page
  const BAND_HEIGHT = 30;
  const BAND_COLOR = "#2E373E";

  const doc = new PDFDocument({
    size: "A4",
    margins: {
      top: MARGIN,
      left: MARGIN,
      right: MARGIN,
      bottom: MARGIN + BAND_HEIGHT + 10,
    },
  });

  const chunks = [];
  doc.on("data", (c) => chunks.push(c));

  const PAGE_W = doc.page.width;
  const PAGE_RIGHT = PAGE_W - MARGIN;
  const CONTENT_W = PAGE_RIGHT - MARGIN;

  function drawBottomBand() {
    doc.save();
    doc.rect(0, doc.page.height - BAND_HEIGHT, doc.page.width, BAND_HEIGHT);
    doc.fill(BAND_COLOR);
    doc.restore();
  }

  drawBottomBand();
  doc.on("pageAdded", () => {
    drawBottomBand();
    doc.x = MARGIN;
    doc.y = MARGIN;
  });

  function ensureSpace(minHeight) {
    const bottomLimit = doc.page.height - doc.page.margins.bottom;
    if (doc.y + minHeight > bottomLimit) {
      doc.addPage();
    }
  }

  function h1Centered(text) {
    ensureSpace(50);
    doc.x = MARGIN;
    doc
      .fontSize(20)
      .fillColor("#111")
      .text(text, MARGIN, doc.y, { width: CONTENT_W, align: "center" });
    doc.moveDown(0.8);
  }

  function sectionTitle(text) {
    ensureSpace(70);
    doc.x = MARGIN;
    doc.fontSize(12).fillColor("#111").text(text, MARGIN, doc.y, {
      width: CONTENT_W,
      underline: true,
      align: "left",
    });
    doc.moveDown(0.6);
  }

  function paragraph(text, opts = {}) {
    ensureSpace(40);
    doc.x = MARGIN;
    doc
      .fontSize(opts.size || 10)
      .fillColor(opts.color || "#111")
      .text(text, MARGIN, doc.y, {
        width: CONTENT_W,
        align: "left",
        lineGap: opts.lineGap ?? 2,
      });
    doc.moveDown(opts.after ?? 0.4);
  }

  function bullet(text, options = {}) {
    const bulletGap = options.gap ?? 14;
    const bulletX = MARGIN;
    const textX = MARGIN + bulletGap;

    ensureSpace(22);

    const y = doc.y + 6;
    doc.save();
    doc.fillColor("#111");
    doc.circle(bulletX + 2, y, 1.6).fill();
    doc.restore();

    doc.fillColor("#111").fontSize(options.size || 10);
    doc.text(text, textX, doc.y, {
      width: CONTENT_W - bulletGap,
      align: "left",
      lineGap: options.lineGap ?? 2,
    });

    doc.moveDown(options.after ?? 0.2);
    doc.x = MARGIN;
  }

  function smallHr() {
    ensureSpace(20);
    doc
      .moveTo(MARGIN, doc.y)
      .lineTo(PAGE_RIGHT, doc.y)
      .strokeColor("#e6e6e6")
      .stroke();
    doc.moveDown(0.8);
  }

  // ✅ Helper table unique (site ou prestations)
  function renderLinesTable(lines) {
    ensureSpace(120);

    const tableTop = doc.y;

    const W_QTY = 40;
    const W_PU = 70;
    const W_TOTAL = 80;
    const GAP = 12;

    const colTotalX = PAGE_RIGHT - W_TOTAL;
    const colUnitX = colTotalX - GAP - W_PU;
    const colQtyX = colUnitX - GAP - W_QTY;

    const colLabelX = MARGIN;
    const W_LABEL = colQtyX - GAP - colLabelX;

    doc.fontSize(10).fillColor("#111");
    doc.text("Description", colLabelX, tableTop, {
      width: W_LABEL,
      align: "left",
    });
    doc.text("Qté", colQtyX, tableTop, { width: W_QTY, align: "right" });
    doc.text("PU", colUnitX, tableTop, { width: W_PU, align: "right" });
    doc.text("Total", colTotalX, tableTop, { width: W_TOTAL, align: "right" });

    doc
      .moveTo(MARGIN, tableTop + 14)
      .lineTo(PAGE_RIGHT, tableTop + 14)
      .strokeColor("#ddd")
      .stroke();

    let y = tableTop + 22;

    for (const l of lines) {
      ensureSpace(30);

      const qty = toNumber(l.qty, 1);
      const unit = isOfferedLine(l) ? 0 : toNumber(l.unitPrice, 0);
      const total = isOfferedLine(l) ? 0 : qty * unit;

      doc.fillColor("#111").fontSize(10);
      doc.text(l.label || "-", colLabelX, y, { width: W_LABEL, align: "left" });
      doc.text(String(qty), colQtyX, y, { width: W_QTY, align: "right" });
      doc.text(isOfferedLine(l) ? "Offert" : euro(unit), colUnitX, y, {
        width: W_PU,
        align: "right",
      });
      doc.text(euro(total), colTotalX, y, { width: W_TOTAL, align: "right" });

      y += 18;
      doc.y = y;
    }

    doc.moveDown(0.2); // ✅ moins d’air, évite le look “vide”
  }

  /* ---------------- Header (logo + meta) ---------------- */
  const HEADER_TOP_Y = MARGIN;
  const LOGO_HEIGHT = 70;

  let leftBlockBottomY = HEADER_TOP_Y;

  const logoAbs = absIfExists(emitter?.logoPath);
  if (logoAbs) {
    doc.image(logoAbs, MARGIN, HEADER_TOP_Y, { height: LOGO_HEIGHT });
    leftBlockBottomY = HEADER_TOP_Y + LOGO_HEIGHT + 8;
  } else {
    doc
      .fontSize(18)
      .fillColor("#111")
      .text(emitter?.title || "WebDev", MARGIN, HEADER_TOP_Y);
    leftBlockBottomY = HEADER_TOP_Y + 24;
  }

  doc
    .fontSize(10)
    .fillColor("#444")
    .text(emitter?.address || "", MARGIN, leftBlockBottomY, {
      width: 240,
      align: "left",
    });
  if (emitter?.email)
    doc.text(emitter.email, MARGIN, doc.y, { width: 240, align: "left" });
  doc.fillColor("#111");

  const leftAfterHeaderY = doc.y;

  const docNumber = safeText(documentData?.docNumber);
  const issueDate = documentData?.issueDate
    ? fmtDate(documentData.issueDate)
    : fmtDate(new Date());

  doc
    .fontSize(12)
    .fillColor("#111")
    .text(`CONTRAT ${docNumber || ""}`.trim(), MARGIN, HEADER_TOP_Y, {
      width: CONTENT_W,
      align: "right",
    });

  doc
    .fontSize(10)
    .fillColor("#444")
    .text(`Date : ${issueDate}`, MARGIN, HEADER_TOP_Y + 18, {
      width: CONTENT_W,
      align: "right",
    });

  const rightMetaBottomY = HEADER_TOP_Y + 40;
  doc.y = Math.max(leftAfterHeaderY, rightMetaBottomY) + 18;

  /* ---------------- Title ---------------- */
  h1Centered("Contrat de Service");
  smallHr();

  /* ---------------- Parties ---------------- */
  ensureSpace(120);

  doc
    .fontSize(10)
    .fillColor("#111")
    .text("Entre :", MARGIN, doc.y, { width: CONTENT_W, align: "left" });

  paragraph(
    `${emitter?.title || "WebDev"}, Entreprise Individuelle, ci-après désigné « le Prestataire »,`,
    { size: 10, after: 0.1 },
  );

  paragraph(`ayant son siège au ${emitter?.address || "-"},`, {
    size: 10,
    after: 0.1,
  });

  paragraph(`et joignable à l’adresse email ${emitter?.email || "-"}.`, {
    size: 10,
    after: 0.6,
  });

  doc
    .fontSize(10)
    .fillColor("#111")
    .text("Et :", MARGIN, doc.y, { width: CONTENT_W, align: "left" });
  doc.moveDown(0.2);

  paragraph(
    `${documentData?.party?.restaurantName || "-"}, ci-après désigné « le Client »,`,
    { size: 10, after: 0.1 },
  );

  if (safeText(documentData?.party?.address)) {
    paragraph(`ayant son siège social à ${documentData.party.address},`, {
      size: 10,
      after: 0.1,
    });
  }

  if (safeText(documentData?.party?.ownerName)) {
    paragraph(`représenté par ${documentData.party.ownerName},`, {
      size: 10,
      after: 0.2,
    });
  }

  if (safeText(documentData?.party?.email)) {
    paragraph(`Email : ${documentData.party.email}`, { size: 10, after: 0.1 });
  }

  if (safeText(documentData?.party?.phone)) {
    paragraph(`Téléphone : ${documentData.party.phone}`, {
      size: 10,
      after: 0.6,
    });
  }

  paragraph("Il a été convenu ce qui suit :", { size: 10, after: 0.6 });

  // ✅ Lignes filtrées
  const allLines = Array.isArray(documentData?.lines) ? documentData.lines : [];
  const websiteLines = allLines.filter(
    (l) => isActiveLine(l) && l?.kind === "WEBSITE",
  );
  const classicLines = allLines.filter(
    (l) => isActiveLine(l) && (l?.kind === "NORMAL" || !l?.kind),
  );

  const hasWebsite = websiteLines.length > 0;
  const hasPrestations = classicLines.length > 0;

  /* ---------------- 1. Objet ---------------- */
  sectionTitle("1. Objet du Contrat");
  paragraph("Le présent contrat a pour objet :", { size: 10, after: 0.2 });

  // ✅ Site vitrine seulement si activé
  if (hasWebsite) {
    bullet("la création d’un site vitrine pour le Client,");
  }

  // ✅ Prestations seulement si présentes
  if (hasPrestations) {
    bullet(
      hasWebsite
        ? "la réalisation de prestations complémentaires définies au présent contrat,"
        : "la réalisation de prestations définies au présent contrat,",
    );
  }

  bullet(
    "la fourniture d’un accès à un dashboard numérique de gestion de restaurant,",
  );
  bullet("ainsi que l’accès aux modules sélectionnés par le Client.", {
    after: 0.6,
  });

  /* ---------------- 2. Site vitrine (conditionnel) ---------------- */
  if (hasWebsite) {
    sectionTitle("2. Création du Site Vitrine");
    paragraph(
      "Le Prestataire s’engage à réaliser et livrer un site vitrine pour le Client, conformément aux spécifications convenues.",
      { size: 10, after: 0.6 },
    );

    renderLinesTable(websiteLines);

    const siteTotal = computeSiteTotal(websiteLines);
    const siteIsOffered = siteTotal <= 0;

    ensureSpace(60);
    doc
      .strokeColor("#ddd")
      .moveTo(350, doc.y + 6)
      .lineTo(PAGE_RIGHT, doc.y + 6)
      .stroke();

    doc.moveDown(1);

    const totalsY = doc.y;
    doc
      .fontSize(10)
      .fillColor("#444")
      .text("Total site vitrine", 350, totalsY, { width: 120, align: "left" });
    doc
      .fillColor("#111")
      .text(euro(siteTotal), 470, totalsY, { width: 75, align: "right" });
    doc.y = totalsY + 18;

    doc.moveDown(0.4);

    paragraph("Modalités de paiement :", { size: 10, after: 0.2 });
    if (!siteIsOffered) {
      bullet(sitePaymentText(documentData?.website?.paymentSplit), {
        after: 0.1,
      });
      bullet(
        "Les informations de virement seront transmises au Client après signature du présent contrat.",
        { after: 0.5 },
      );
    } else {
      bullet("Le site vitrine est offert.", { after: 0.5 });
    }

    paragraph("Délais de livraison :", { size: 10, after: 0.2 });
    bullet(
      "Le site sera livré sous 14 jours ouvrés à compter de la signature du contrat et de la réception du paiement.",
      { after: 0.5 },
    );

    paragraph("Retours visuels :", { size: 10, after: 0.2 });
    bullet(
      "Le Client dispose de trois (3) retours pour des retouches mineures du visuel.",
      { after: 0.1 },
    );
    bullet(
      "Une fois la maquette validée, aucune modification de structure ne pourra être effectuée.",
      { after: 0.6 },
    );
  }

  /* ---------------- 2 / 2.1 Prestations (selon site) ---------------- */
  if (hasPrestations) {
    const title = hasWebsite
      ? "2.1 Prestations complémentaires"
      : "2. Prestations";
    sectionTitle(title);

    paragraph(
      hasWebsite
        ? "Les prestations complémentaires suivantes ont été convenues :"
        : "Les prestations suivantes ont été convenues :",
      { size: 10, after: 0.35 },
    );

    renderLinesTable(classicLines);
  }

  /* ---------------- 3. Abonnement ---------------- */
  // ✅ IMPORTANT: réduit pour éviter le grand blanc
  ensureSpace(120);
  doc.moveDown(1.2);

  sectionTitle("3. Abonnement au Dashboard et aux Modules");

  paragraph("Le Prestataire met en place un abonnement mensuel incluant :", {
    size: 10,
    after: 0.2,
  });

  // ✅ Hébergement du site vitrine seulement si site activé
  if (hasWebsite) bullet("L’hébergement du site vitrine");
  bullet("La maintenance fonctionnelle (hors retouches visuelles)");
  bullet("L’accès au dashboard de gestion");
  bullet("L’accès aux modules sélectionnés par le Client", { after: 0.6 });

  /* ---------------- 3.1 Modules ---------------- */
  sectionTitle("3.1 Modules sélectionnés");
  paragraph("Les modules suivants ont été choisis par le Client :", {
    size: 10,
    after: 0.2,
  });

  ensureSpace(140);

  const modTop = doc.y;
  const colM = MARGIN;
  const colP = 420;

  doc
    .fillColor("#111")
    .fontSize(10)
    .text("Module", colM, modTop, { width: 340, align: "left" });
  doc.text("Tarif mensuel", colP, modTop, { width: 120, align: "right" });

  doc
    .moveTo(MARGIN, modTop + 14)
    .lineTo(PAGE_RIGHT, modTop + 14)
    .strokeColor("#ddd")
    .stroke();

  let my = modTop + 22;

  const modules = Array.isArray(documentData?.modules)
    ? documentData.modules
    : [];

  for (const m of modules.filter((x) => safeText(x?.name))) {
    ensureSpace(30);

    const price = isOfferedModule(m)
      ? "Offert"
      : `${euro(toNumber(m.priceMonthly, 0))} / mois`;

    doc
      .fillColor("#111")
      .fontSize(10)
      .text(m.name || "-", colM, my, { width: 340, align: "left" });
    doc.text(price, colP, my, { width: 120, align: "right" });

    my += 18;
    doc.y = my;
  }

  doc.moveDown(0.3);

  doc.fontSize(9).fillColor("#444");
  doc.text(
    "(La liste est définie lors de la signature et peut être modifiée ultérieurement.)",
    MARGIN,
    doc.y,
    { width: CONTENT_W, align: "left" },
  );
  doc.moveDown(1.8);

  /* ---------------- 3.2 Évolution ---------------- */
  sectionTitle("3.2 Évolution des modules");
  paragraph("Le Client peut demander à tout moment :", {
    size: 10,
    after: 0.2,
  });
  bullet("l’ajout de nouveaux modules,");
  bullet("la suppression de modules existants.", { after: 0.4 });

  paragraph("Toute modification fera l’objet :", { size: 10, after: 0.2 });
  bullet("d’une mise à jour des conditions tarifaires,");
  bullet("d’une confirmation écrite (email ou document).", { after: 0.8 });

  /* ---------------- 3.3 Conditions financières ---------------- */
  sectionTitle("3.3 Conditions financières");

  const subName = safeText(documentData?.subscription?.name) || "-";
  const subPrice = toNumber(documentData?.subscription?.priceMonthly, 0);
  const engagementMonths = toNumber(documentData?.engagementMonths, 0) || "-";
  const monthlyTotal = computeMonthlyAmount(documentData);

  bullet(
    `Prix de l’abonnement mensuel : ${euro(subPrice)} / mois (exonéré de TVA)`,
  );
  bullet(
    `Durée d’engagement : ${engagementMonths} mois à compter de la date de souscription`,
  );
  bullet(
    `Montant mensuel total (abonnement + modules) : ${euro(monthlyTotal)} / mois`,
    { after: 0.6 },
  );

  paragraph("Modalités de paiement", { size: 10, after: 0.2 });
  bullet("Le paiement est effectué par prélèvement SEPA mensuel automatique");
  bullet(
    "En cas de changement de moyen de paiement, le Client s’engage à en informer le Prestataire avant le prochain prélèvement",
    { after: 0.8 },
  );

  /* ---------------- 4 / 5 / 6 / 7 ---------------- */
  sectionTitle("4. Conditions d’Utilisation");
  paragraph(
    "Le Client s’engage à utiliser le dashboard uniquement pour la gestion de son restaurant. Toute reproduction, modification ou diffusion non autorisée des outils du Prestataire est strictement interdite.",
    { size: 10, after: 0.8 },
  );

  sectionTitle("5. Durée et Résiliation");
  paragraph(
    `Le présent contrat est conclu pour une durée ferme de ${engagementMonths} mois. Aucune résiliation anticipée n’est possible durant cette période. À l’issue de l’engagement, le Client peut résilier à tout moment par écrit. La résiliation prendra effet à la fin du mois en cours. En cas de résiliation anticipée non autorisée, le Prestataire se réserve le droit de facturer les mensualités restantes.`,
    { size: 10, after: 0.8 },
  );

  sectionTitle("6. Responsabilités");
  paragraph(
    "Le Prestataire met en œuvre les moyens nécessaires au bon fonctionnement des services. Il ne peut être tenu responsable des défaillances techniques indépendantes de sa volonté ni des dommages indirects.",
    { size: 10, after: 0.8 },
  );

  sectionTitle("7. Confidentialité et Protection des Données");
  paragraph(
    "Les parties s’engagent à respecter la confidentialité des données échangées. Le Prestataire garantit la protection des données conformément au RGPD.",
    { size: 10, after: 1.0 },
  );

  /* ---------------- Signatures ---------------- */
  ensureSpace(220);

  const place = safeText(documentData?.placeOfSignature) || "Paris";
  const when = documentData?.issueDate
    ? fmtDate(documentData.issueDate)
    : fmtDate(new Date());

  doc
    .fontSize(10)
    .fillColor("#111")
    .text(`Fait à ${place}, le ${when}`, MARGIN, doc.y, {
      width: CONTENT_W,
      align: "left",
    });
  doc.moveDown(1);

  const baseY = doc.y;

  doc
    .fontSize(10)
    .fillColor("#111")
    .text("Le Prestataire", MARGIN, baseY, { width: 200, align: "left" });
  doc.text("Le Client", 320, baseY, { width: 200, align: "left" });

  const boxY = baseY + 18;
  const boxW = 220;
  const boxH = 90;

  doc.strokeColor("#cfd5dd").rect(MARGIN, boxY, boxW, boxH).stroke();
  doc.strokeColor("#cfd5dd").rect(320, boxY, boxW, boxH).stroke();

  const providerSigAbs = absIfExists(emitter?.signaturePath);
  if (providerSigAbs) {
    try {
      doc.image(providerSigAbs, MARGIN + 10, boxY + 10, {
        fit: [boxW - 20, boxH - 20],
        align: "center",
        valign: "center",
      });
    } catch {}
  } else {
    doc
      .fontSize(9)
      .fillColor("#666")
      .text("Signature", MARGIN + 12, boxY + 35, {
        width: boxW - 24,
        align: "left",
      });
  }

  if (signatureImageBuffer) {
    try {
      doc.image(signatureImageBuffer, 320 + 10, boxY + 10, {
        fit: [boxW - 20, boxH - 20],
        align: "center",
        valign: "center",
      });
    } catch {}
  } else {
    doc
      .fontSize(9)
      .fillColor("#666")
      .text("Signature à compléter", 320 + 12, boxY + 35, {
        width: boxW - 24,
        align: "left",
      });
  }

  doc.y = boxY + boxH + 18;

  doc
    .fontSize(9)
    .fillColor("#444")
    .text("TVA non applicable, art. 293 B du CGI.", MARGIN, doc.y, {
      width: CONTENT_W,
      align: "left",
    });

  doc.end();
  await new Promise((resolve) => doc.on("end", resolve));
  return Buffer.concat(chunks);
}

module.exports = { renderContractPdf };
