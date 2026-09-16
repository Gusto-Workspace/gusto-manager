const PDFDocument = require("pdfkit");
const fs = require("fs");
const path = require("path");
const { renderAmendmentPdf } = require("./render-amendment.service");
const {
  buildContractDurationCopy,
  formatMonthsWithNumber,
  hasWebsiteOwnershipTerms,
} = require("../contract-terms.service");

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

function money(value, currency = "EUR") {
  const normalizedCurrency = safeText(currency).toUpperCase() || "EUR";
  try {
    return new Intl.NumberFormat("fr-FR", {
      style: "currency",
      currency: normalizedCurrency,
    }).format(toNumber(value));
  } catch {
    return `${toNumber(value).toFixed(2).replace(".", ",")} ${normalizedCurrency}`;
  }
}

function recurrenceLabel(value = {}) {
  const count = Math.max(1, toNumber(value.intervalCount, 1));
  const interval = safeText(value.interval) || "month";
  const labels = {
    day: count === 1 ? "jour" : `${count} jours`,
    week: count === 1 ? "semaine" : `${count} semaines`,
    month: count === 1 ? "mois" : `${count} mois`,
    year: count === 1 ? "an" : `${count} ans`,
  };
  return labels[interval] || (count === 1 ? interval : `${count} ${interval}`);
}

function recurringPrice(value, amount) {
  return `${money(amount, value?.currency)} / ${recurrenceLabel(value)}`;
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

function recurringTotal(documentData) {
  const items = [];
  if (
    safeText(documentData?.subscription?.name) ||
    toNumber(documentData?.subscription?.priceMonthly) > 0
  ) {
    items.push({
      ...documentData.subscription,
      amount:
        toNumber(documentData.subscription.priceMonthly) *
        Math.max(1, toNumber(documentData.subscription.quantity, 1)),
    });
  }
  (Array.isArray(documentData?.modules) ? documentData.modules : []).forEach(
    (module) => {
      if (!safeText(module?.name) || isOfferedModule(module)) return;
      items.push({
        ...module,
        amount:
          toNumber(module.priceMonthly) *
          Math.max(1, toNumber(module.quantity, 1)),
      });
    },
  );
  if (documentData?.timeClockTerminalRental?.enabled) {
    const rental = documentData.timeClockTerminalRental;
    items.push({
      ...rental,
      amount:
        toNumber(rental.priceMonthly, 12) *
        Math.max(1, toNumber(rental.quantity, 1)),
    });
  }
  if (!items.length) return null;
  const keys = new Set(
    items.map(
      (item) =>
        `${safeText(item.currency).toUpperCase()}|${safeText(item.interval) || "month"}|${Math.max(1, toNumber(item.intervalCount, 1))}`,
    ),
  );
  if (keys.size !== 1) return null;
  return {
    ...items[0],
    amount: items.reduce((sum, item) => sum + item.amount, 0),
  };
}

function absIfExists(p) {
  if (!p) return null;
  const abs = path.isAbsolute(p) ? p : path.join(process.cwd(), p);
  return fs.existsSync(abs) ? abs : null;
}

async function renderContractPdf(documentData, emitter, signatureImageBuffer) {
  if (documentData?.contractKind === "AMENDMENT") {
    return renderAmendmentPdf(documentData, emitter, signatureImageBuffer);
  }

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
    ensureSpace(42);
    doc.x = MARGIN;
    doc
      .fontSize(18)
      .fillColor("#111")
      .text(text, MARGIN, doc.y, { width: CONTENT_W, align: "center" });
    doc.moveDown(0.55);
  }

  function sectionTitle(text, options = {}) {
    ensureSpace(Math.max(70, 30 + (options.minFollowingHeight || 0)));
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
    doc.moveDown(0.55);
  }

  function moduleRowDisplay(module) {
    const quantity = Math.max(1, toNumber(module.quantity, 1));
    const unitAmount = toNumber(module.priceMonthly, 0);
    return {
      label: `${module.name || "-"}${quantity > 1 ? ` × ${quantity}` : ""}`,
      price: isOfferedModule(module)
        ? "Offert"
        : `${recurringPrice(module, unitAmount)}${quantity > 1 ? ` × ${quantity} = ${recurringPrice(module, unitAmount * quantity)}` : ""}`,
    };
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
  doc.y = Math.max(leftAfterHeaderY, rightMetaBottomY) + 12;

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
    `${emitter?.title || "WebDev"}, ci-après désigné « le Prestataire »,`,
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

  // ✅ IMPORTANT : on ignore les lignes "Autre" vides (label vide/espaces)
  const classicLines = allLines.filter((l) => {
    const isClassicKind = l?.kind === "NORMAL" || !l?.kind;
    if (!isActiveLine(l) || !isClassicKind) return false;
    return Boolean(safeText(l?.label));
  });

  const hasWebsite = websiteLines.length > 0;
  const hasPrestations = classicLines.length > 0;

  // ✅ Modules filtrés (ignore les lignes vides)
  const rawModules = Array.isArray(documentData?.modules)
    ? documentData.modules
    : [];
  const modules = rawModules.filter((m) => safeText(m?.name));
  const hasModules = modules.length > 0;
  const hasTimeClockTerminalRental = Boolean(
    documentData?.timeClockTerminalRental?.enabled,
  );
  const timeClockTerminalRentalMonthly = hasTimeClockTerminalRental
    ? toNumber(documentData?.timeClockTerminalRental?.priceMonthly, 12)
    : 0;
  const timeClockTerminalRentalQuantity = hasTimeClockTerminalRental
    ? Math.max(1, toNumber(documentData?.timeClockTerminalRental?.quantity, 1))
    : 0;

  // ✅ Numérotation dynamique selon sections présentes
  const N_WEBSITE = hasWebsite ? 2 : null;
  const N_PRESTATIONS = hasPrestations ? (hasWebsite ? "2.1" : "2") : null;

  // Abonnement : si site OU prestations existent => reste en 3, sinon devient 2
  const N_SUB = hasWebsite || hasPrestations ? 3 : 2;

  // Les sections suivantes dépendent des blocs optionnels qui les précèdent.
  const N_MATERIAL = hasTimeClockTerminalRental ? N_SUB + 1 : null;
  const N_USE = N_SUB + (hasTimeClockTerminalRental ? 2 : 1);
  const hasWebsiteOwnershipClause =
    hasWebsite && hasWebsiteOwnershipTerms(documentData);
  const N_WEBSITE_OWNERSHIP = hasWebsiteOwnershipClause ? N_USE + 1 : null;
  const N_TERM = N_USE + (hasWebsiteOwnershipClause ? 2 : 1);
  const N_LIAB = N_USE + (hasWebsiteOwnershipClause ? 3 : 2);
  const N_PRIV = N_USE + (hasWebsiteOwnershipClause ? 4 : 3);

  // ✅ Sous-numérotation Abonnement (3.x / 2.x) dynamique selon présence modules
  let subIdx = 1;
  const N_SUB_MODS = hasModules ? `${N_SUB}.${subIdx++}` : null;
  const N_SUB_EVOL = `${N_SUB}.${subIdx++}`;
  const N_SUB_FIN = `${N_SUB}.${subIdx++}`;

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
  if (hasTimeClockTerminalRental) {
    bullet(
      "la mise à disposition d’un terminal de pointage loué au Client pour l’utilisation de la solution Gusto Manager,",
    );
  }
  bullet("ainsi que l’accès aux modules sélectionnés par le Client.");
  doc.moveDown(0.2);

  /* ---------------- 2. Site vitrine (conditionnel) ---------------- */
  if (hasWebsite) {
    sectionTitle(`${N_WEBSITE}. Création du Site Vitrine`);
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
      ? `${N_PRESTATIONS} Prestations complémentaires`
      : `${N_PRESTATIONS}. Prestations`;
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

  sectionTitle(`${N_SUB}. Abonnement au Dashboard et aux Modules`);

  paragraph("Le Prestataire met en place un abonnement incluant :", {
    size: 10,
    after: 0.2,
  });

  // ✅ Hébergement du site vitrine seulement si site activé
  if (hasWebsite) bullet("L’hébergement du site vitrine");
  bullet("La maintenance fonctionnelle (hors retouches visuelles)");
  bullet("L’accès au dashboard de gestion");
  bullet("L’accès aux modules sélectionnés par le Client", { after: 0.6 });

  /* ---------------- Modules sélectionnés (conditionnel) ---------------- */
  if (hasModules) {
    const modulesIntro =
      "Les modules suivants ont été choisis par le Client :";
    const firstModule = moduleRowDisplay(modules[0]);
    doc.fontSize(10);
    const firstModuleRowHeight =
      Math.max(
        doc.heightOfString(firstModule.label, { width: 340 }),
        doc.heightOfString(firstModule.price, { width: 120 }),
      ) + 6;
    const modulesIntroHeight = doc.heightOfString(modulesIntro, {
      width: CONTENT_W,
      lineGap: 2,
    });

    // Conserve le titre, son introduction, l'en-tête du tableau et sa
    // première ligne sur la même page. Si cet ensemble ne tient pas, il est
    // déplacé en bloc sur la page suivante.
    ensureSpace(52 + modulesIntroHeight + 22 + firstModuleRowHeight);

    sectionTitle(`${N_SUB_MODS}. Modules sélectionnés`);
    paragraph(modulesIntro, {
      size: 10,
      after: 0.2,
    });

    const modTop = doc.y;
    const colM = MARGIN;
    const colP = 420;

    doc
      .fillColor("#111")
      .fontSize(10)
      .text("Module", colM, modTop, { width: 340, align: "left" });
    doc.text("Tarif récurrent", colP, modTop, { width: 120, align: "right" });

    doc
      .moveTo(MARGIN, modTop + 14)
      .lineTo(PAGE_RIGHT, modTop + 14)
      .strokeColor("#ddd")
      .stroke();

    let my = modTop + 22;

    for (const m of modules) {
      const { label: moduleLabel, price } = moduleRowDisplay(m);
      doc.y = my;
      const rowHeight =
        Math.max(
          doc.heightOfString(moduleLabel, { width: 340 }),
          doc.heightOfString(price, { width: 120 }),
        ) + 6;
      ensureSpace(rowHeight);
      my = doc.y;

      doc
        .fillColor("#111")
        .fontSize(10)
        .text(moduleLabel, colM, my, { width: 340, align: "left" });
      doc.text(price, colP, my, { width: 120, align: "right" });

      my += rowHeight;
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
  }

  /* ---------------- Évolution ---------------- */
  sectionTitle(`${N_SUB_EVOL}. Évolution des modules`);
  paragraph("Le Client peut demander à tout moment :", {
    size: 10,
    after: 0.2,
  });
  bullet("l’ajout de nouveaux modules,");
  bullet("la suppression de modules existants.", { after: 0.4 });

  paragraph("Toute modification fera l’objet :", { size: 10, after: 0.2 });
  bullet("d’une mise à jour des conditions tarifaires,");
  bullet("d’une confirmation écrite (email ou document).", { after: 0.8 });

  /* ---------------- Conditions financières ---------------- */
  sectionTitle(`${N_SUB_FIN}. Conditions financières`);

  const subPrice = toNumber(documentData?.subscription?.priceMonthly, 0);
  const subscriptionQuantity = Math.max(
    1,
    toNumber(documentData?.subscription?.quantity, 1),
  );
  const contractDurationCopy = buildContractDurationCopy(documentData);
  const { engagementMonths } = contractDurationCopy;
  const compatibleRecurringTotal = recurringTotal(documentData);
  const recurringTotalLabel = hasTimeClockTerminalRental
    ? "Montant récurrent total (abonnement + modules + location de matériel)"
    : "Montant récurrent total (abonnement + modules)";

  bullet(
    `Prix de l’abonnement : ${recurringPrice(documentData?.subscription, subPrice)}${subscriptionQuantity > 1 ? ` × ${subscriptionQuantity}, soit ${recurringPrice(documentData?.subscription, subPrice * subscriptionQuantity)}` : ""}`,
  );
  bullet(contractDurationCopy.financialDurationText);
  if (compatibleRecurringTotal) {
    bullet(
      `${recurringTotalLabel} : ${recurringPrice(compatibleRecurringTotal, compatibleRecurringTotal.amount)}`,
      { after: 0.6 },
    );
  }

  paragraph("Modalités de paiement", { size: 10, after: 0.2 });
  bullet(
    "Le paiement est effectué par prélèvement SEPA automatique selon la périodicité indiquée",
  );
  bullet(
    "En cas de changement de moyen de paiement, le Client s’engage à en informer le Prestataire avant le prochain prélèvement",
    { after: 0.8 },
  );

  if (hasTimeClockTerminalRental) {
    sectionTitle(`${N_MATERIAL}. Location de matériel`);
    paragraph(
      `Le Prestataire met à disposition du Client ${timeClockTerminalRentalQuantity} ${timeClockTerminalRentalQuantity > 1 ? "terminaux" : "terminal"} de pointage de type tablette destiné${timeClockTerminalRentalQuantity > 1 ? "s" : ""} exclusivement à l’utilisation de la solution Gusto Manager.`,
      { size: 10, after: 0.35 },
    );
    bullet(
      `La location est facturée ${recurringPrice(documentData?.timeClockTerminalRental, timeClockTerminalRentalMonthly)} par terminal, soit ${recurringPrice(documentData?.timeClockTerminalRental, timeClockTerminalRentalMonthly * timeClockTerminalRentalQuantity)}, tant que le Client utilise la solution Gusto Manager.`,
      { after: 0.1 },
    );
    bullet(
      "Le matériel demeure la propriété exclusive du Prestataire pendant toute la durée du contrat.",
      { after: 0.1 },
    );
    bullet(
      "Le Client s’engage à conserver le matériel en bon état, à l’utiliser conformément à sa destination et à le protéger contre toute perte, vol, casse, détérioration ou utilisation anormale.",
      { after: 0.1 },
    );
    bullet(
      "En cas de résiliation ou de cessation d’utilisation de la solution Gusto Manager, le Client devra restituer le terminal, ses accessoires et son chargeur au Prestataire dans un délai maximal de sept (7) jours calendaires.",
      { after: 0.1 },
    );
    bullet(
      "En cas de non-restitution, de perte, de vol, de casse, de dommage matériel, d’oxydation ou de toute dégradation rendant le terminal impropre à son usage normal, le Client devra rembourser intégralement au Prestataire le prix d’achat TTC ou de remplacement du matériel équivalent, accessoires compris, sur simple demande.",
      { after: 0.8 },
    );
  }

  /* ---------------- 4 / 5 / 6 / 7 ---------------- */
  sectionTitle(`${N_USE}. Conditions d’Utilisation`);
  paragraph(
    "Le Client s’engage à utiliser le dashboard uniquement pour la gestion de son restaurant. Toute reproduction, modification ou diffusion non autorisée des outils du Prestataire est strictement interdite.",
    { size: 10, after: 0.8 },
  );

  if (hasWebsiteOwnershipClause) {
    const ownershipFirstParagraph =
      "Le Client demeure propriétaire du site vitrine spécifiquement réalisé pour son établissement ainsi que de son identité visuelle et des contenus propres à son activité intégrés dans celui-ci, notamment les textes, photographies, visuels et informations commerciales lui appartenant ou fournis par lui.";
    doc.fontSize(10);
    const ownershipFirstParagraphHeight = doc.heightOfString(
      ownershipFirstParagraph,
      { width: CONTENT_W, lineGap: 2 },
    );

    sectionTitle(
      `${N_WEBSITE_OWNERSHIP}. Propriété du site, des contenus et du nom de domaine`,
      { minFollowingHeight: ownershipFirstParagraphHeight + 8 },
    );
    paragraph(ownershipFirstParagraph, { size: 10, after: 0.35 });
    paragraph(
      "Le Client demeure également titulaire de son nom de domaine, y compris après la résiliation ou l’expiration du présent contrat. Lorsque le nom de domaine est administré techniquement par le Prestataire pour le compte du Client, les éléments nécessaires à son transfert ou à la reprise de sa gestion sont communiqués au Client, à sa demande, dans le cadre de la fin du contrat. Le Prestataire peut cesser d’en assurer l’administration une fois le transfert effectué.",
      { size: 10, after: 0.35 },
    );
    paragraph(
      "La fin du contrat Gusto Manager n’entraîne aucun transfert de propriété du site, de ses contenus ou du nom de domaine au bénéfice du Prestataire. Le Client peut conserver son site vitrine ou le faire transférer vers un autre hébergement. L’hébergement fourni par le Prestataire est toutefois un service exclusivement lié à l’abonnement Gusto Manager : il prend fin à la date effective de fin de l’abonnement, sans obligation pour le Prestataire de poursuivre gratuitement l’hébergement. La cessation de cet hébergement ne remet pas en cause la propriété du Client sur son site.",
      { size: 10, after: 0.35 },
    );
    paragraph(
      "Certains contenus ou fonctionnalités du site sont alimentés dynamiquement par les services Gusto Manager, notamment les cartes et menus, les actualités, les informations issues du dashboard, les réservations, les cartes cadeaux et les autres données synchronisées avec la plateforme.",
      { size: 10, after: 0.35 },
    );
    paragraph(
      "À compter de la date effective de fin de l’abonnement Gusto Manager, quelle qu’en soit la cause, ces données dynamiques cessent systématiquement d’être fournies par la plateforme et ne sont plus affichées sur le site. Les appels API et les services Gusto Manager associés peuvent être coupés. Aucune copie figée ni aucun maintien automatique de ces données dynamiques ne fait partie du site conservé par le Client.",
      { size: 10, after: 0.35 },
    );
    paragraph(
      "Même lorsque le site est conservé par le Client ou transféré vers un autre hébergement, les contenus et sections dépendant des données dynamiques provenant de Gusto Manager ne sont plus affichés après la fin de l’abonnement. Le site peut continuer d’exister sans ces données dynamiques, sous réserve que le Client assure son hébergement, sa maintenance et, le cas échéant, son adaptation technique auprès du prestataire de son choix.",
      { size: 10, after: 0.35 },
    );
    paragraph(
      "La présente clause ne confère au Client aucun droit de propriété sur la plateforme Gusto Manager, son dashboard, son back-office, ses API internes, le code source de la plateforme et de ses services, ses composants génériques ou mutualisés, ses bibliothèques, ses outils internes et de gestion, ses systèmes de génération, ses services partagés, ses technologies ni, plus généralement, sur les éléments logiciels et techniques appartenant au Prestataire ou à des tiers et réutilisés pour plusieurs clients.",
      { size: 10, after: 0.35 },
    );
    paragraph(
      "Le Client conserve en revanche les éléments spécifiques constituant son site vitrine et nécessaires à son fonctionnement indépendant des services Gusto Manager, y compris le code spécifique propre à ce site dans la mesure nécessaire à sa conservation, à son fonctionnement autonome ou à son transfert vers un autre hébergement. En cas de conservation ou de transfert du site, les éléments exclusivement liés à Gusto Manager, notamment les connexions aux API, les services dynamiques et les fonctionnalités dépendant de la plateforme, doivent être exclus, supprimés, désactivés ou rendus inopérants. Le site ainsi conservé ou transféré ne peut donner accès aux services Gusto Manager après la fin de l’abonnement.",
      { size: 10, after: 0.8 },
    );
  }

  sectionTitle(`${N_TERM}. Durée et Résiliation`);
  contractDurationCopy.durationParagraphs.forEach((value, index, values) => {
    paragraph(value, {
      size: 10,
      after:
        index === values.length - 1
          ? contractDurationCopy.legacy
            ? 0.8
            : 0.45
          : 0.25,
    });
  });

  if (!contractDurationCopy.legacy) {
    paragraph("Cessation définitive d’activité ou liquidation judiciaire", {
      size: 10,
      after: 0.2,
    });
    paragraph(
      "En cas de cessation définitive de l’activité du restaurant ou de liquidation judiciaire du Client, le Client pourra demander la résiliation anticipée du présent contrat sans avoir à attendre l’expiration de la période d’engagement. La demande devra être adressée par écrit au Prestataire et accompagnée d’un justificatif permettant d’établir la réalité de la cessation d’activité ou de la liquidation. Les sommes échues et dues jusqu’à la date effective de résiliation resteront exigibles.",
      { size: 10, after: 0.35 },
    );

    paragraph("Vente ou cession du restaurant", { size: 10, after: 0.2 });
    paragraph(
      "En cas de vente ou de cession du restaurant, le Client en informera le Prestataire par écrit. Le repreneur pourra poursuivre l’utilisation de Gusto Manager dans le cadre d’un transfert ou d’un nouveau contrat convenu avec le Prestataire. Si le repreneur ne souhaite pas poursuivre le service, le Client pourra demander la clôture du contrat sur présentation d’un justificatif de la vente ou de la cession. Les sommes échues et dues jusqu’à la date effective de clôture resteront exigibles.",
      { size: 10, after: 0.35 },
    );

    paragraph(
      `À l’issue de la durée contractuelle de ${formatMonthsWithNumber(engagementMonths)}, le Client peut résilier son abonnement à tout moment par écrit. La résiliation prendra effet à la fin du mois en cours. En cas de résiliation anticipée non autorisée, le Prestataire se réserve le droit de facturer les mensualités restant dues.`,
      { size: 10, after: 0.8 },
    );
  }

  sectionTitle(`${N_LIAB}. Responsabilités`);
  paragraph(
    "Le Prestataire met en œuvre les moyens nécessaires au bon fonctionnement des services. Il ne peut être tenu responsable des défaillances techniques indépendantes de sa volonté ni des dommages indirects.",
    { size: 10, after: 0.8 },
  );

  sectionTitle(`${N_PRIV}. Confidentialité et Protection des Données`);
  paragraph(
    "Les parties s’engagent à respecter la confidentialité des données échangées. Le Prestataire garantit la protection des données conformément au RGPD.",
    { size: 10, after: 1.0 },
  );

  if (safeText(documentData?.comments)) {
    sectionTitle("Conditions particulières");
    paragraph(safeText(documentData.comments), { size: 10, after: 1.0 });
  }

  /* ---------------- Signatures ---------------- */
  ensureSpace(220);

  const place = safeText(documentData?.placeOfSignature);
  const when = documentData?.signatureDate || documentData?.issueDate
    ? fmtDate(documentData.signatureDate || documentData.issueDate)
    : fmtDate(new Date());

  doc.fontSize(10).fillColor("#111").text(
    place
      ? `Fait à ${place}, le ${when}`
      : `Lieu renseigné lors de la signature, le ${when}`,
    MARGIN,
    doc.y,
    {
      width: CONTENT_W,
      align: "left",
    },
  );
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
    } catch (_error) {
      // Ignore unreadable provider signature assets and keep rendering the PDF.
    }
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
    } catch (_error) {
      // Ignore invalid signature buffers and fall back to the placeholder text.
    }
  } else {
    doc
      .fontSize(9)
      .fillColor("#666")
      .text(
        "Signature du client",
        320 + 12,
        boxY + 30,
        {
        width: boxW - 24,
          align: "center",
        },
      );
  }

  doc.y = boxY + boxH + 18;

  doc.end();
  await new Promise((resolve) => doc.on("end", resolve));
  return Buffer.concat(chunks);
}

module.exports = { renderContractPdf };
