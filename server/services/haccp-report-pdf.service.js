const PDFDocument = require("pdfkit");

/* ---------- style & utilitaires ---------- */

const COLORS = {
  DARK_BLUE: "#131E36",
  ACCENT: "#FF914D",
  LIGHT_BG: "#F4F1EA",
  TEXT_MAIN: "#222222",
  TEXT_MUTED: "#666666",
  BORDER_LIGHT: "#DDDDDD",
};

const REPORT_TZ = "Europe/Paris";

function fmtDate(d) {
  if (!d) return "-";
  const date = new Date(d);
  if (Number.isNaN(date.getTime())) return "-";
  return date.toLocaleString("fr-FR", {
    timeZone: REPORT_TZ,
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  });
}

function fmtShortDate(d) {
  if (!d) return "-";
  const date = new Date(d);
  if (Number.isNaN(date.getTime())) return "-";
  return date.toLocaleDateString("fr-FR", {
    timeZone: REPORT_TZ,
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

function isObjectIdLike(value) {
  return typeof value === "string" && /^[0-9a-f]{24}$/i.test(value.trim());
}

function safeLabel(...candidates) {
  for (const c of candidates) {
    if (!c) continue;
    if (typeof c !== "string") continue;
    if (isObjectIdLike(c)) continue;
    const trimmed = c.trim();
    if (trimmed) return trimmed;
  }
  return null;
}

function countArray(arr) {
  return Array.isArray(arr) ? arr.length : 0;
}

/* ---------- mappings de traduction ---------- */

// Pour postheatTemperature.probeType
const PROBE_TYPE_LABELS = {
  core: "Sonde cœur produit",
  surface: "Sonde surface",
  ambient: "Air / ambiance",
  oil: "Huile de friture",
  other: "Autre",
};

// Pour postheatTemperature.phase
const POSTHEAT_PHASE_LABELS = {
  postheat: "Sortie de chauffe",
  reheat: "Remise en température",
  "hot-holding": "Maintien en chaud",
};

// Pour serviceTemperature.servingMode
const SERVING_MODE_LABELS = {
  pass: "Pass",
  "buffet-hot": "Buffet chaud",
  "buffet-cold": "Buffet froid",
  table: "Service à table",
  delivery: "Livraison",
  takeaway: "Vente à emporter",
  "room-service": "Room service",
  catering: "Traiteur / catering",
  other: "Autre",
};

// Pour nonConformity.type
const NC_TYPE_LABELS = {
  temperature: "Température",
  hygiene: "Hygiène",
  reception: "Réception",
  microbiology: "Microbiologie",
  other: "Autre",
};

// Pour nonConformity.severity
const NC_SEVERITY_LABELS = {
  low: "Faible",
  medium: "Moyenne",
  high: "Élevée",
};

/* ---------- footer global ---------- */

const FOOTER_TEXT = "Généré par Gusto Manager - Rapport de maîtrise sanitaire";

function drawFooter(doc, pageNumber, totalPages) {
  const savedX = doc.x;
  const savedY = doc.y;

  doc.save();

  const footerY = doc.page.height - doc.page.margins.bottom - 10;
  const footerWidth =
    doc.page.width - doc.page.margins.left - doc.page.margins.right;

  // Texte centré
  doc
    .font("Helvetica")
    .fontSize(8)
    .fillColor(COLORS.TEXT_MUTED)
    .text(FOOTER_TEXT, doc.page.margins.left, footerY, {
      width: footerWidth,
      align: "center",
    });

  // Pagination en bas à droite : Page X / Y
  doc
    .font("Helvetica")
    .fontSize(8)
    .fillColor(COLORS.TEXT_MUTED)
    .text(
      `Page ${pageNumber} / ${totalPages}`,
      doc.page.margins.left,
      footerY,
      {
        width: footerWidth,
        align: "right",
      }
    );

  doc.restore();

  doc.x = savedX;
  doc.y = savedY;
}

/* ---------- helpers de layout ---------- */

function ensureSectionSpace(doc, minHeight = 100) {
  const bottom = doc.page.height - doc.page.margins.bottom - 10;
  if (doc.y + minHeight > bottom) {
    doc.addPage();
  }
}

// Pour les sous-titres (T° mise en chauffe, etc.)
function ensureSubsectionSpace(doc, minHeight = 80) {
  const bottom = doc.page.height - doc.page.margins.bottom - 20;
  if (doc.y + minHeight > bottom) {
    doc.addPage();
  }
}

function drawSectionHeader(doc, title, opts = {}) {
  const { align = "left" } = opts;

  ensureSectionSpace(doc, 100);

  doc.moveDown(0.6);

  doc
    .fontSize(13)
    .fillColor(COLORS.DARK_BLUE)
    .font("Helvetica-Bold")
    .text(title, doc.page.margins.left, doc.y, { align });

  doc.moveDown(0.2);
  doc.fontSize(10).fillColor(COLORS.TEXT_MAIN).font("Helvetica");
}

/* ---------- helper tableau générique ---------- */

function drawSimpleTable(doc, headers, rows, opts = {}) {
  if (!rows || !rows.length) return;

  const startX = doc.page.margins.left;
  let y = doc.y;

  const availableWidth =
    doc.page.width - doc.page.margins.left - doc.page.margins.right;

  const colCount = headers.length;
  const colWidths =
    opts.columnWidths && opts.columnWidths.length === colCount
      ? opts.columnWidths
      : Array(colCount).fill(availableWidth / colCount);

  const headerHeight = opts.headerHeight || 20;
  const rowHeight = opts.rowHeight || 18;
  const bottom = doc.page.height - doc.page.margins.bottom - 20;

  function renderHeader() {
    let x = startX;
    headers.forEach((h, i) => {
      const w = colWidths[i];
      doc
        .rect(x, y, w, headerHeight)
        .fillAndStroke(COLORS.LIGHT_BG, COLORS.BORDER_LIGHT);
      doc
        .font("Helvetica-Bold")
        .fontSize(9)
        .fillColor(COLORS.DARK_BLUE)
        .text(String(h), x + 4, y + 4, {
          width: w - 8,
          height: headerHeight - 8,
          ellipsis: true,
        });
      x += w;
    });
    y += headerHeight;
  }

  if (y + headerHeight + rowHeight > bottom) {
    doc.addPage();
    y = doc.page.margins.top;
  }

  renderHeader();

  rows.forEach((row) => {
    if (y + rowHeight > bottom) {
      doc.addPage();
      y = doc.page.margins.top;
      renderHeader();
    }

    let x = startX;
    row.forEach((cell, i) => {
      const w = colWidths[i];
      const text = cell == null ? "" : String(cell);
      doc.strokeColor(COLORS.BORDER_LIGHT).rect(x, y, w, rowHeight).stroke();
      doc
        .font("Helvetica")
        .fontSize(8.5)
        .fillColor(COLORS.TEXT_MAIN)
        .text(text, x + 4, y + 4, {
          width: w - 8,
          height: rowHeight - 8,
          ellipsis: true,
        });
      x += w;
    });

    y += rowHeight;
  });

  doc.y = y + 8;
}

/* ---------- résumé ---------- */

function drawSummaryBox(doc, payload) {
  const d = payload.data || {};
  const temps = d.temperatures || {};
  const totalTemps =
    countArray(temps.fridges) +
    countArray(temps.generic) +
    countArray(temps.preheat) +
    countArray(temps.postheat) +
    countArray(temps.service);

  const lines = [
    `Relevés de températures : ${totalTemps}`,
    `Réceptions / livraisons : ${countArray(d.receptions)}`,
    `Lots & traçabilité : ${countArray(d.inventoryLots)}`,
    `Batches recettes : ${countArray(d.recipeBatches)}`,
    `Changements d'huile de friture : ${countArray(d.oilChanges)}`,
    `Nettoyages réalisés : ${countArray(d.cleaningTasks)}`,
    `Lutte nuisibles : ${countArray(d.pestControls)}`,
    `Analyses microbiologiques : ${countArray(d.microbiology)}`,
    `Non-conformités : ${countArray(d.nonConformities)}`,
    `Certificats fournisseurs : ${countArray(d.supplierCerts)}`,
    `Rappels / retours marchandise : ${countArray(d.recalls)}`,
    `Calibrations : ${countArray(d.calibrations)}`,
    `Formations du personnel : ${countArray(d.trainingSessions)}`,
    `Maintenance équipements : ${countArray(d.maintenanceOps)}`,
    `Entrées de déchets : ${countArray(d.wasteEntries)}`,
    `Mesures d'hygiène : ${countArray(d.healthMeasures)}`,
    `Incidents allergènes : ${countArray(d.allergenIncidents)}`,
  ];

  doc
    .fontSize(11)
    .font("Helvetica-Bold")
    .fillColor(COLORS.DARK_BLUE)
    .text("Résumé des enregistrements", { align: "left" });

  doc.moveDown(0.2);

  doc.fontSize(9.5).font("Helvetica").fillColor(COLORS.TEXT_MAIN);

  lines.forEach((l) => {
    doc.text(`• ${l}`);
  });

  doc.moveDown(0.8);
}

/* =====================================================================
 *  SECTIONS DÉTAILLÉES
 * ===================================================================*/

/* --- Températures --- */

function addTemperaturesSection(doc, temps) {
  if (!temps) return;

  const {
    fridges = [],
    generic = [],
    preheat = [],
    postheat = [],
    service = [],
  } = temps;

  if (
    !fridges.length &&
    !generic.length &&
    !preheat.length &&
    !postheat.length &&
    !service.length
  ) {
    return;
  }

  drawSectionHeader(doc, "Relevés de températures");

  // Enceintes frigorifiques
  if (fridges.length) {
    ensureSubsectionSpace(doc, 80);
    doc
      .font("Helvetica-Bold")
      .fillColor(COLORS.TEXT_MAIN)
      .text("Enceintes frigorifiques", doc.page.margins.left, doc.y, {
        align: "left",
      });
    doc.moveDown(0.2);

    const rows = fridges.map((t) => {
      const fridgeName =
        safeLabel(t.fridge?.name, t.fridge?.fridgeCode, t.fridge?.location) ||
        "Enceinte frigorifique";

      const tempValue =
        t.value != null
          ? `${t.value} ${t.unit || t.fridge?.unit || "°C"}`
          : "—";

      const doorStateLabel = (() => {
        const state = t.doorState;
        if (!state) return "";
        if (state === "open") return "Porte ouverte";
        if (state === "closed") return "Porte fermée";
        if (state === "unknown") return "État porte inconnu";
        return state;
      })();

      const recordedBy =
        safeLabel(
          t.recordedBy?.firstName &&
            `${t.recordedBy.firstName} ${t.recordedBy.lastName || ""}`,
          t.recordedBy?.firstName,
          t.recordedBy?.lastName
        ) || "";

      return [
        fmtDate(t.createdAt),
        fridgeName,
        tempValue,
        doorStateLabel,
        recordedBy,
        t.note || "",
      ];
    });

    drawSimpleTable(
      doc,
      ["Date", "Enceinte", "T° mesurée", "Porte", "Enregistré par", "Note"],
      rows
    );

    doc.moveDown(0.6);
  }

  // T° mise en chauffe
  if (preheat.length) {
    ensureSubsectionSpace(doc, 80);
    doc
      .font("Helvetica-Bold")
      .fillColor(COLORS.TEXT_MAIN)
      .text("T° mise en chauffe", doc.page.margins.left, doc.y, {
        align: "left",
      });
    doc.moveDown(0.2);

    const rows = preheat.map((t) => {
      const deviceName =
        safeLabel(
          t.device?.name,
          t.device?.equipmentCode,
          t.device?.location
        ) || "Équipement";

      const tempValue =
        t.value != null
          ? `${t.value} ${t.unit || t.device?.unit || "°C"}`
          : "—";

      const recordedBy =
        safeLabel(
          t.recordedBy?.firstName &&
            `${t.recordedBy.firstName} ${t.recordedBy.lastName || ""}`,
          t.recordedBy?.firstName,
          t.recordedBy?.lastName
        ) || "";

      const phaseLabel =
        t.phase === "hot-holding" ? "Maintien en chaud" : "Mise en chauffe";

      return [
        fmtDate(t.createdAt),
        deviceName,
        tempValue,
        phaseLabel,
        recordedBy,
        t.note || "",
      ];
    });

    drawSimpleTable(
      doc,
      ["Date", "Équipement", "T° mesurée", "Phase", "Enregistré par", "Note"],
      rows
    );

    doc.moveDown(0.6);
  }

  // T° sortie de chauffe
  if (postheat.length) {
    ensureSubsectionSpace(doc, 80);
    doc
      .font("Helvetica-Bold")
      .fillColor(COLORS.TEXT_MAIN)
      .text("T° sortie de chauffe", doc.page.margins.left, doc.y, {
        align: "left",
      });
    doc.moveDown(0.2);

    const rows = postheat.map((t) => {
      const equipmentName =
        safeLabel(t.equipmentName, t.location) || "Équipement";

      const tempValue = t.value != null ? `${t.value} ${t.unit || "°C"}` : "—";

      const recordedBy =
        safeLabel(
          t.recordedBy?.firstName &&
            `${t.recordedBy.firstName} ${t.recordedBy.lastName || ""}`,
          t.recordedBy?.firstName,
          t.recordedBy?.lastName
        ) || "";

      const probeLabel = t.probeType
        ? PROBE_TYPE_LABELS[t.probeType] || t.probeType
        : "";
      const phaseLabel = t.phase
        ? POSTHEAT_PHASE_LABELS[t.phase] || t.phase
        : "";

      return [
        fmtDate(t.createdAt),
        equipmentName,
        tempValue,
        probeLabel,
        phaseLabel,
        recordedBy,
      ];
    });

    drawSimpleTable(
      doc,
      ["Date", "Équipement", "T°", "Type de mesure", "Phase", "Enregistré par"],
      rows
    );

    doc.moveDown(0.6);
  }

  // T° service
  if (service.length) {
    ensureSubsectionSpace(doc, 80);
    doc
      .font("Helvetica-Bold")
      .fillColor(COLORS.TEXT_MAIN)
      .text("T° service", doc.page.margins.left, doc.y, {
        align: "left",
      });
    doc.moveDown(0.2);

    const rows = service.map((t) => {
      const area = safeLabel(t.serviceArea) || "Service";
      const dishName = safeLabel(t.dishName) || "";

      const tempValue = t.value != null ? `${t.value} ${t.unit || "°C"}` : "—";

      const serviceTypeLabel = (() => {
        if (t.serviceType === "hot") return "Service chaud";
        if (t.serviceType === "cold") return "Service froid";
        return "";
      })();

      const servingModeLabel = t.servingMode
        ? SERVING_MODE_LABELS[t.servingMode] || t.servingMode
        : "";

      const recordedBy =
        safeLabel(
          t.recordedBy?.firstName &&
            `${t.recordedBy.firstName} ${t.recordedBy.lastName || ""}`,
          t.recordedBy?.firstName,
          t.recordedBy?.lastName
        ) || "";

      return [
        fmtDate(t.createdAt),
        area,
        dishName,
        tempValue,
        serviceTypeLabel,
        servingModeLabel,
        recordedBy,
      ];
    });

    drawSimpleTable(
      doc,
      ["Date", "Zone / service", "Plat", "T°", "Type service", "Mode", "Par"],
      rows
    );

    doc.moveDown(0.6);
  }

  // Relevés génériques
  if (generic.length) {
    ensureSubsectionSpace(doc, 80);
    doc
      .font("Helvetica-Bold")
      .fillColor(COLORS.TEXT_MAIN)
      .text("Relevés T° génériques", doc.page.margins.left, doc.y, {
        align: "left",
      });
    doc.moveDown(0.2);

    const rows = generic.map((t) => {
      const location = safeLabel(t.location) || "Emplacement";

      const tempValue = t.value != null ? `${t.value} ${t.unit || "°C"}` : "—";

      const recordedBy =
        safeLabel(
          t.recordedBy?.firstName &&
            `${t.recordedBy.firstName} ${t.recordedBy.lastName || ""}`,
          t.recordedBy?.firstName,
          t.recordedBy?.lastName
        ) || "";

      return [
        fmtDate(t.createdAt),
        location,
        tempValue,
        recordedBy,
        t.note || "",
      ];
    });

    drawSimpleTable(
      doc,
      ["Date", "Emplacement", "T°", "Enregistré par", "Note"],
      rows
    );

    doc.moveDown(0.6);
  }
}

/* --- Réceptions --- */

function addReceptionsSection(doc, receptions) {
  if (!Array.isArray(receptions) || !receptions.length) return;

  drawSectionHeader(doc, "Réceptions & livraisons");

  const rows = [];

  receptions.forEach((r) => {
    const dt = fmtDate(r.receivedAt || r.createdAt);
    const supplier = safeLabel(r.supplier) || "Fournisseur";
    const lines = Array.isArray(r.lines) ? r.lines : [];

    const recordedBy =
      safeLabel(
        r.recordedBy?.firstName &&
          `${r.recordedBy.firstName} ${r.recordedBy.lastName || ""}`,
        r.recordedBy?.firstName,
        r.recordedBy?.lastName
      ) || "";

    lines.forEach((line) => {
      const productName =
        safeLabel(line.productName, line.supplierProductId) || "Produit";
      const lotNumber = safeLabel(line.lotNumber) || "—";
      const dlc = line.dlc || line.ddm;
      const dlcStr = dlc ? fmtShortDate(dlc) : "-";
      const qty =
        line.qty != null ? `${line.qty} ${line.unit || ""}`.trim() : "";
      const temp = line.tempOnArrival != null ? `${line.tempOnArrival} °C` : "";

      const packaging =
        line.packagingCondition === "non-compliant"
          ? "Non conforme"
          : line.packagingCondition === "compliant"
            ? "Conforme"
            : "";

      const allergens =
        Array.isArray(line.allergens) && line.allergens.length
          ? line.allergens.join(", ")
          : "";

      rows.push([
        dt,
        supplier,
        productName,
        lotNumber,
        dlcStr,
        qty,
        temp,
        packaging,
        allergens,
        recordedBy,
      ]);
    });
  });

  if (!rows.length) {
    doc
      .font("Helvetica")
      .fontSize(9)
      .fillColor(COLORS.TEXT_MUTED)
      .text("Aucune ligne de produit dans la période sélectionnée.", {
        align: "left",
      });
    doc.moveDown(0.8);
    return;
  }

  drawSimpleTable(
    doc,
    [
      "Date",
      "Fournisseur",
      "Produit",
      "Lot",
      "DLC/DDM",
      "Qté",
      "T° arrivée",
      "Emballage",
      "Allergènes",
      "Enregistré par",
    ],
    rows
  );

  doc.moveDown(0.8);
}

/* --- Lots & traçabilité --- */

function addInventoryLotsSection(doc, lots) {
  if (!Array.isArray(lots) || !lots.length) return;

  drawSectionHeader(doc, "Lots & traçabilité");

  const rows = lots.map((lot) => {
    const product = safeLabel(lot.productName, lot.supplier) || "Produit";
    const lotNum = safeLabel(lot.lotNumber) || "—";

    const dlc = lot.dlc || lot.ddm || lot.internalUseBy;
    const dlcStr = dlc ? fmtShortDate(dlc) : "-";

    const qty =
      lot.qtyRemaining != null
        ? `${lot.qtyRemaining}/${lot.qtyReceived} ${lot.unit || ""}`.trim()
        : lot.qtyReceived != null
          ? `${lot.qtyReceived} ${lot.unit || ""}`.trim()
          : "";

    const storage = safeLabel(lot.storageArea) || "";
    const status =
      lot.status && lot.status !== "in_stock" ? lot.status : "en stock";

    const openedAt = lot.openedAt ? fmtShortDate(lot.openedAt) : "";

    return [product, lotNum, dlcStr, openedAt, qty, storage, status];
  });

  drawSimpleTable(
    doc,
    [
      "Produit",
      "Lot",
      "DLC/DDM / limite",
      "Ouvert le",
      "Quantité (restante/ reçue)",
      "Zone / stockage",
      "Statut",
    ],
    rows
  );

  doc.moveDown(0.8);
}

/* --- Batches recettes --- */

function addRecipeBatchesSection(doc, batches) {
  if (!Array.isArray(batches) || !batches.length) return;

  drawSectionHeader(doc, "Batches recettes");

  const rows = batches.map((b) => {
    const date = fmtDate(b.preparedAt || b.createdAt);
    const batchId = safeLabel(b.batchId, b.recipeId) || "Batch";
    const dish = safeLabel(b.recipeName, b.dishName, b.label) || "Préparation";
    const ingCount = Array.isArray(b.ingredients) ? b.ingredients.length : "";
    const usedBy = b.usedByServiceDate ? fmtShortDate(b.usedByServiceDate) : "";
    const notes = b.notes || "";

    return [date, batchId, dish, ingCount, usedBy, notes];
  });

  drawSimpleTable(
    doc,
    [
      "Date",
      "Batch",
      "Plat / recette",
      "Nb ingrédients",
      "À utiliser avant",
      "Notes",
    ],
    rows
  );

  doc.moveDown(0.8);
}

/* --- Huile de friture --- */

function addOilChangesSection(doc, oilChanges) {
  if (!Array.isArray(oilChanges) || !oilChanges.length) return;

  drawSectionHeader(doc, "Huile de friture");

  const rows = oilChanges.map((o) => {
    const date = fmtDate(o.performedAt || o.createdAt);
    const fryer = safeLabel(o.fryerName, o.fryerId) || "Friteuse";
    const tpm = o.tpmPercent != null ? `${o.tpmPercent}%` : "";
    const color = safeLabel(o.colorIndex) || "";
    const odor = safeLabel(o.odorCheck) || "";
    const brand = safeLabel(o.oilBrand) || "";
    const recordedBy =
      safeLabel(
        o.recordedBy?.firstName &&
          `${o.recordedBy.firstName} ${o.recordedBy.lastName || ""}`,
        o.recordedBy?.firstName,
        o.recordedBy?.lastName
      ) || "";
    const notes = o.qualityNotes || o.notes || "";

    return [date, fryer, tpm, color, odor, brand, recordedBy, notes];
  });

  drawSimpleTable(
    doc,
    [
      "Date",
      "Friteuse",
      "TPM",
      "Couleur",
      "Odeur",
      "Huile",
      "Enregistré par",
      "Note",
    ],
    rows
  );

  doc.moveDown(0.8);
}

/* --- Nettoyage des locaux --- */

function addCleaningTasksSection(doc, tasks, period) {
  if (!Array.isArray(tasks) || !tasks.length) return;
  const from = period?.from ? new Date(period.from) : null;
  const to = period?.to ? new Date(period.to) : null;

  drawSectionHeader(doc, "Nettoyage des locaux (actions réalisées)");

  const rows = [];

  const frequencyMap = {
    daily: "Quotidienne",
    weekly: "Hebdomadaire",
    monthly: "Mensuelle",
    on_demand: "Ponctuelle",
  };

  tasks.forEach((task) => {
    const zone = safeLabel(task.zone) || "Zone";
    const desc = safeLabel(task.description) || "Tâche de nettoyage";
    const freqLabel = frequencyMap[task.frequency] || task.frequency || "";

    const history = Array.isArray(task.history) ? task.history : [];

    const filteredHistory = history.filter((h) => {
      if (!h.doneAt) return false;
      const t = new Date(h.doneAt);
      if (Number.isNaN(t.getTime())) return false;
      if (from && t < from) return false;
      if (to && t > to) return false;
      return true;
    });

    filteredHistory
      .sort((a, b) => new Date(a.doneAt) - new Date(b.doneAt))
      .forEach((h) => {
        const doneAtStr = fmtDate(h.doneAt);
        const doneBy =
          safeLabel(
            h.doneBy?.firstName &&
              `${h.doneBy.firstName} ${h.doneBy.lastName || ""}`,
            h.doneBy?.firstName,
            h.doneBy?.lastName
          ) || "";

        const proofCount =
          Array.isArray(h.proofUrls) && h.proofUrls.length
            ? `${h.proofUrls.length} preuve(s)`
            : "";

        const verifiedLabel =
          h.verified && h.verifiedAt ? fmtShortDate(h.verifiedAt) : "";

        rows.push([
          doneAtStr,
          zone,
          desc,
          freqLabel,
          doneBy,
          proofCount,
          verifiedLabel,
          h.note || "",
        ]);
      });
  });

  if (!rows.length) {
    doc
      .font("Helvetica")
      .fontSize(9)
      .fillColor(COLORS.TEXT_MUTED)
      .text("Aucune exécution dans la période sélectionnée.", {
        align: "left",
      });
    doc.moveDown(0.8);
    return;
  }

  drawSimpleTable(
    doc,
    [
      "Date",
      "Zone",
      "Tâche",
      "Fréquence",
      "Effectué par",
      "Preuves",
      "Vérifié le",
      "Note",
    ],
    rows
  );

  doc.moveDown(0.8);
}

/* --- Lutte nuisibles --- */

function addPestControlSection(doc, pestControls) {
  if (!Array.isArray(pestControls) || !pestControls.length) return;

  drawSectionHeader(doc, "Lutte nuisibles");

  const rows = pestControls.map((p) => {
    const date = fmtDate(p.lastVisitAt || p.createdAt);
    const provider = safeLabel(p.provider) || "Prestataire lutte nuisibles";
    const activity = safeLabel(p.activityLevel) || "";
    const status = safeLabel(p.complianceStatus) || "";
    const notes = p.notes || "";

    return [date, provider, activity, status, notes];
  });

  drawSimpleTable(
    doc,
    ["Date", "Prestataire", "Activité", "Statut", "Notes"],
    rows
  );

  doc.moveDown(0.8);
}

/* --- Analyses microbiologiques --- */

function addMicrobiologySection(doc, microbiology) {
  if (!Array.isArray(microbiology) || !microbiology.length) return;

  drawSectionHeader(doc, "Analyses microbiologiques");

  const rows = microbiology.map((m) => {
    const date = fmtDate(m.sampledAt || m.createdAt);
    const sampleType = safeLabel(m.sampleType) || "Échantillon";
    const location = safeLabel(m.location) || "";
    const product = safeLabel(m.productName, m.lotNumber) || "";
    const param = safeLabel(m.parameter) || "Paramètre";
    const result = safeLabel(m.result) || "Non renseigné";
    const passedLabel =
      typeof m.passed === "boolean"
        ? m.passed
          ? "Conforme"
          : "Non conforme"
        : "";
    const lab = safeLabel(m.labName) || "";
    const notes = m.notes || "";

    return [
      date,
      sampleType,
      location,
      product,
      param,
      result,
      passedLabel,
      lab,
      notes,
    ];
  });

  drawSimpleTable(
    doc,
    [
      "Date",
      "Type échantillon",
      "Emplacement",
      "Produit / lot",
      "Paramètre",
      "Résultat",
      "Conclusion",
      "Labo",
      "Notes",
    ],
    rows
  );

  doc.moveDown(0.8);
}

/* --- Non-conformités --- */

function addNonConformitiesSection(doc, ncList) {
  if (!Array.isArray(ncList) || !ncList.length) return;

  drawSectionHeader(doc, "Non-conformités");

  const statusMap = {
    open: "ouverte",
    in_progress: "en cours",
    closed: "fermée",
  };

  const rows = ncList.map((nc) => {
    const date = fmtDate(nc.reportedAt || nc.createdAt);

    const typeLabel = nc.type ? NC_TYPE_LABELS[nc.type] || nc.type : "NC";

    const severityLabel = nc.severity
      ? NC_SEVERITY_LABELS[nc.severity] || nc.severity
      : "Moyenne";

    const status = statusMap[nc.status] || nc.status || "ouverte";
    const ref = safeLabel(nc.referenceId) || "";
    const desc = nc.description || "";

    return [date, typeLabel, severityLabel, status, ref, desc];
  });

  drawSimpleTable(
    doc,
    ["Date", "Type", "Sévérité", "Statut", "Réf", "Description"],
    rows
  );

  doc.moveDown(0.8);
}

/* --- Certificats fournisseurs --- */

function addSupplierCertsSection(doc, certs) {
  if (!Array.isArray(certs) || !certs.length) return;

  drawSectionHeader(doc, "Certificats fournisseurs");

  const rows = certs.map((s) => {
    const supplier = safeLabel(s.supplierName) || "Fournisseur";
    const type = safeLabel(s.type) || "Certificat";
    const num = safeLabel(s.certificateNumber) || "";
    const uploaded = s.uploadedAt ? fmtShortDate(s.uploadedAt) : "";
    const validFrom = s.validFrom ? fmtShortDate(s.validFrom) : "";
    const validTo = s.validUntil ? fmtShortDate(s.validUntil) : "";
    const notes = s.notes || "";

    return [supplier, type, num, uploaded, validFrom, validTo, notes];
  });

  drawSimpleTable(
    doc,
    [
      "Fournisseur",
      "Type",
      "N° certificat",
      "Ajouté le",
      "Valable du",
      "Valable au",
      "Notes",
    ],
    rows
  );

  doc.moveDown(0.8);
}

/* --- Rappels / retours marchandise --- */

function addRecallsSection(doc, recalls) {
  if (!Array.isArray(recalls) || !recalls.length) return;

  drawSectionHeader(doc, "Rappels / retours marchandise");

  const rows = recalls.map((r) => {
    const date = fmtDate(r.initiatedAt || r.createdAt);
    const item = r.item || {};
    const prod = safeLabel(item.productName) || "Produit";
    const lot = safeLabel(item.lotNumber) || "";
    const qty =
      item.quantity != null ? `${item.quantity} ${item.unit || ""}`.trim() : "";
    const supplier = safeLabel(item.supplierName) || "";
    const actions = r.actionsTaken || "";

    return [date, prod, lot, qty, supplier, actions];
  });

  drawSimpleTable(
    doc,
    ["Date", "Produit", "Lot", "Qté concernée", "Fournisseur", "Actions"],
    rows
  );

  doc.moveDown(0.8);
}

/* --- Formations du personnel --- */

function addTrainingSection(doc, trainingSessions) {
  if (!Array.isArray(trainingSessions) || !trainingSessions.length) return;

  drawSectionHeader(doc, "Formations du personnel");

  const rows = trainingSessions.map((t) => {
    const date = fmtDate(t.date || t.createdAt);
    const title = safeLabel(t.title) || "Formation";
    const topic = safeLabel(t.topic) || "";
    const provider = safeLabel(t.provider) || "";
    const location = safeLabel(t.location) || "";
    const validUntil = t.validUntil ? fmtShortDate(t.validUntil) : "";
    const attendees = Array.isArray(t.attendees) ? t.attendees.length : 0;
    const notes = t.notes || "";

    return [
      date,
      title,
      topic,
      provider,
      location,
      validUntil,
      attendees || "",
      notes,
    ];
  });

  drawSimpleTable(
    doc,
    [
      "Date",
      "Intitulé",
      "Thème",
      "Organisme",
      "Lieu",
      "Valable jusqu'au",
      "Nb participants",
      "Notes",
    ],
    rows
  );

  doc.moveDown(0.8);
}

/* --- Calibrations instruments --- */

function addCalibrationsSection(doc, calibrations) {
  if (!Array.isArray(calibrations) || !calibrations.length) return;

  drawSectionHeader(doc, "Calibrations instruments");

  const rows = calibrations.map((c) => {
    const date = fmtDate(c.calibratedAt || c.createdAt);
    const dev = safeLabel(c.deviceIdentifier) || "Appareil";
    const devType = safeLabel(c.deviceType) || "";
    const method = safeLabel(c.method) || "";
    const provider = safeLabel(c.provider) || "";
    const nextDue = c.nextCalibrationDue
      ? fmtShortDate(c.nextCalibrationDue)
      : "";
    const notes = c.notes || "";

    return [date, dev, devType, method, provider, nextDue, notes];
  });

  drawSimpleTable(
    doc,
    [
      "Date",
      "Appareil",
      "Type",
      "Méthode",
      "Prestataire",
      "Prochaine échéance",
      "Notes",
    ],
    rows
  );

  doc.moveDown(0.8);
}

/* --- Mesures d'hygiène --- */

function addHealthMeasuresSection(doc, measures) {
  if (!Array.isArray(measures) || !measures.length) return;

  drawSectionHeader(doc, "Mesures d'hygiène");

  const typeMap = {
    covid_check: "Contrôle protocole COVID",
    hygiene_check: "Contrôle hygiène",
    other: "Mesure d'hygiène",
  };

  const rows = measures.map((h) => {
    const date = fmtDate(h.performedAt || h.createdAt);
    const type = typeMap[h.type] || h.type || "Mesure d'hygiène";
    const notes = h.notes || "";

    return [date, type, notes];
  });

  drawSimpleTable(doc, ["Date", "Type", "Notes"], rows);

  doc.moveDown(0.8);
}

/* --- Gestion des déchets --- */

function addWasteEntriesSection(doc, wasteEntries) {
  if (!Array.isArray(wasteEntries) || !wasteEntries.length) return;

  drawSectionHeader(doc, "Gestion des déchets");

  const typeMap = {
    organic: "Biodéchets",
    packaging: "Emballages",
    cooking_oil: "Huiles de cuisson",
    glass: "Verre",
    paper: "Papier/carton",
    hazardous: "Déchets dangereux",
    other: "Autres",
  };

  const dispMap = {
    compost: "Compost",
    recycle: "Recyclage",
    landfill: "Mise en décharge",
    incineration: "Incinération",
    contractor_pickup: "Enlèvement prestataire",
    other: "Autre",
  };

  const rows = wasteEntries.map((w) => {
    const date = fmtDate(w.date || w.createdAt);
    const type = typeMap[w.wasteType] || w.wasteType || "Déchet";
    const qty = w.weightKg != null ? `${w.weightKg} ${w.unit || "kg"}` : "";
    const disp = dispMap[w.disposalMethod] || w.disposalMethod || "";
    const contractor = safeLabel(w.contractor) || "";
    const manifest = safeLabel(w.manifestNumber) || "";
    const notes = w.notes || "";

    return [date, type, qty, disp, contractor, manifest, notes];
  });

  drawSimpleTable(
    doc,
    [
      "Date",
      "Type",
      "Quantité",
      "Traitement",
      "Prestataire",
      "Bordereau",
      "Notes",
    ],
    rows
  );

  doc.moveDown(0.8);
}

/* --- Incidents allergènes --- */

function addAllergenIncidentsSection(doc, incidents) {
  if (!Array.isArray(incidents) || !incidents.length) return;

  drawSectionHeader(doc, "Incidents allergènes");

  const sourceMap = {
    supplier: "Fournisseur",
    customer: "Client",
    internal: "Interne",
    lab: "Laboratoire",
    other: "Autre",
  };

  const rows = incidents.map((a) => {
    const date = fmtDate(a.detectedAt || a.createdAt);
    const item = safeLabel(a.itemName) || "Produit / ingrédient";
    const source = sourceMap[a.source || "internal"] || a.source || "";
    const severity = a.severity || "medium";
    const status = a.closed ? "Clos" : "Ouvert";
    const allergens = Array.isArray(a.allergens) ? a.allergens.join(", ") : "";
    const action = a.immediateAction || "";
    const desc = a.description || "";

    return [date, item, source, severity, status, allergens, action, desc];
  });

  drawSimpleTable(
    doc,
    [
      "Date",
      "Produit / ingrédient",
      "Source",
      "Sévérité",
      "Statut",
      "Allergènes",
      "Action immédiate",
      "Description",
    ],
    rows
  );

  doc.moveDown(0.8);
}

/* --- Maintenance (tableau dédié) --- */

function addMaintenanceSection(doc, maintenanceOps) {
  if (!Array.isArray(maintenanceOps) || !maintenanceOps.length) return;

  drawSectionHeader(doc, "Maintenance équipements");

  const typeMap = {
    filter_change: "changement filtre",
    inspection: "inspection",
    repair: "réparation",
    other: "autre",
  };

  const rows = maintenanceOps.map((m) => {
    const equip =
      safeLabel(m.equipment, m.equipmentCode, m.location) || "Équipement";
    const typeLabel = typeMap[m.type] || m.type || "";
    const provider = safeLabel(m.provider) || "";
    const nextDue = m.nextDue ? fmtShortDate(m.nextDue) : "";
    const lastDate = m.lastDoneAt ? fmtDate(m.lastDoneAt) : "";

    let lastBy = "";
    if (m.lastDoneBy) {
      lastBy =
        safeLabel(
          m.lastDoneBy.firstName &&
            `${m.lastDoneBy.firstName} ${m.lastDoneBy.lastName || ""}`,
          m.lastDoneBy.firstName,
          m.lastDoneBy.lastName
        ) || "";
    }

    const notes = m.notes || "";

    return [equip, typeLabel, provider, nextDue, lastDate, lastBy, notes];
  });

  drawSimpleTable(
    doc,
    [
      "Équipement",
      "Type",
      "Prestataire",
      "Prochaine échéance",
      "Dernière intervention",
      "Intervenant",
      "Notes",
    ],
    rows
  );

  doc.moveDown(0.8);
}

/* =====================================================================
 *  GÉNÉRATION PDF PRINCIPALE
 * ===================================================================*/

async function buildHaccpReportPdf(payload) {
  return new Promise((resolve, reject) => {
    try {
      const doc = new PDFDocument({
        margin: 12,
        layout: "landscape",
        bufferPages: true,
      });

      const buffers = [];
      doc.on("data", (b) => buffers.push(b));
      doc.on("end", () => resolve(Buffer.concat(buffers)));
      doc.on("error", reject);

      const { restaurantName, period = {}, data = {} } = payload;
      const fromLabel = fmtShortDate(period.from);
      const toLabel = fmtShortDate(period.to);
      const generatedAt = fmtDate(new Date());

      /* ---------- PAGE 1 : PAGE DE GARDE AVEC TITRE SEUL ---------- */

      const title = "Rapport HACCP";

      doc.font("Helvetica-Bold").fontSize(28).fillColor(COLORS.DARK_BLUE);

      const textWidth = doc.widthOfString(title);
      const textHeight = doc.currentLineHeight();

      const x = (doc.page.width - textWidth) / 2;
      const y = (doc.page.height - textHeight) / 2;

      const paddingX = 24;
      const paddingY = 14;

      // Cadre autour du titre
      doc
        .lineWidth(1.2)
        .strokeColor(COLORS.DARK_BLUE)
        .rect(
          x - paddingX / 2,
          y - paddingY / 2,
          textWidth + paddingX,
          textHeight + paddingY
        )
        .stroke();

      // Texte centré dans ce cadre
      doc.text(title, x, y);

      /* ---------- PAGE 2 : SYNTHÈSE & RÉSUMÉ ---------- */

      doc.addPage({
        layout: "landscape",
        margins: { top: 24, bottom: 24, left: 24, right: 24 },
      });

      // Texte d'intro
      doc
        .fontSize(11)
        .font("Helvetica")
        .fillColor(COLORS.TEXT_MAIN)
        .text(
          "Synthèse des enregistrements de votre plan de maîtrise sanitaire sur la période sélectionnée.",
          { align: "center" }
        );

      doc.moveDown(1);

      // Bloc "Informations rapport"
      doc
        .fontSize(11)
        .font("Helvetica-Bold")
        .fillColor(COLORS.DARK_BLUE)
        .text("Informations rapport", { align: "left" });

      doc.moveDown(0.2);
      doc.fontSize(10).font("Helvetica").fillColor(COLORS.TEXT_MAIN);

      if (restaurantName) {
        doc.text(`Établissement : ${restaurantName}`, { align: "left" });
      }
      if (fromLabel || toLabel) {
        doc.text(`Période : du ${fromLabel || "?"} au ${toLabel || "?"}`, {
          align: "left",
        });
      }
      doc.text(`Généré le : ${generatedAt}`, { align: "left" });

      doc.moveDown(0.8);

      // Résumé des enregistrements
      drawSummaryBox(doc, payload);

      // On démarre les sections détaillées sur une nouvelle page
      doc.addPage({
        layout: "landscape",
        margins: { top: 12, bottom: 12, left: 12, right: 12 },
      });

      /* ---------- SECTIONS DÉTAILLÉES ---------- */

      // 1) Températures
      addTemperaturesSection(doc, data.temperatures);

      // 2) Réceptions & traçabilité
      addReceptionsSection(doc, data.receptions);
      addInventoryLotsSection(doc, data.inventoryLots);
      addRecipeBatchesSection(doc, data.recipeBatches);

      // 3) Huile de friture
      addOilChangesSection(doc, data.oilChanges);

      // 4) Nettoyage & nuisibles & maintenance
      addCleaningTasksSection(doc, data.cleaningTasks, period);
      addPestControlSection(doc, data.pestControls);
      addMaintenanceSection(doc, data.maintenanceOps);

      // 5) Microbiologie / NC / certificats / rappels
      addMicrobiologySection(doc, data.microbiology);
      addNonConformitiesSection(doc, data.nonConformities);
      addSupplierCertsSection(doc, data.supplierCerts);
      addRecallsSection(doc, data.recalls);

      // 6) Formations / calibrations / hygiène / déchets / allergènes
      addTrainingSection(doc, data.trainingSessions);
      addCalibrationsSection(doc, data.calibrations);
      addHealthMeasuresSection(doc, data.healthMeasures);
      addWasteEntriesSection(doc, data.wasteEntries);
      addAllergenIncidentsSection(doc, data.allergenIncidents);

      /* ---------- FOOTERS AVEC PAGE X / Y SUR TOUTES LES PAGES ---------- */

      const range = doc.bufferedPageRange(); // { start, count }
      const totalPages = range.count;

      for (let i = range.start; i < range.start + range.count; i++) {
        doc.switchToPage(i);
        const currentPageNumber = i - range.start + 1;
        drawFooter(doc, currentPageNumber, totalPages);
      }

      doc.end();
    } catch (err) {
      reject(err);
    }
  });
}

module.exports = {
  buildHaccpReportPdf,
};
