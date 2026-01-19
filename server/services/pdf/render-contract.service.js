const PDFDocument = require("pdfkit");

function fmtDate(d) {
  if (!d) return "-";
  const dt = new Date(d);
  return dt.toLocaleDateString("fr-FR");
}

async function renderContractPdf(documentData, emitter, signatureImageBuffer) {
  const doc = new PDFDocument({ size: "A4", margin: 50 });
  const chunks = [];
  doc.on("data", (c) => chunks.push(c));

  doc.fontSize(16).text("Contrat de Service", { align: "center" });
  doc.moveDown(1);

  doc
    .fontSize(10)
    .fillColor("#111")
    .text(`Entre : ${emitter.title || "WebDev"}, EI`, { continued: false });
  doc.fillColor("#444").text(emitter.address || "");
  if (emitter.email) doc.text(emitter.email);
  doc.fillColor("#111").moveDown(0.5);

  doc.text(
    `Et : ${documentData.party.restaurantName}, ci-après désigné "le Client",`,
  );
  if (documentData.party.address)
    doc.text(`ayant son siège social à ${documentData.party.address},`);
  if (documentData.party.ownerName)
    doc.text(`représenté par ${documentData.party.ownerName},`);
  doc.moveDown(1);

  // Sections
  doc.fontSize(11).text("1. Objet du Contrat", { underline: true });
  doc
    .fontSize(10)
    .text(
      "Le présent contrat a pour objet la création d’un site vitrine ainsi que la fourniture d’un service de gestion via un dashboard numérique et l’accès aux modules sélectionnés.",
    );
  doc.moveDown(0.7);

  doc.fontSize(11).text("2. Création du Site Vitrine", { underline: true });
  doc
    .fontSize(10)
    .text(
      `Prix : ${
        documentData.website?.offered
          ? "Offert"
          : documentData.website?.priceLabel || "-"
      } (exonéré de TVA).`,
    );
  doc.text(
    "Modalités de paiement : virement bancaire (infos transmises après signature).",
  );
  doc.text(
    "Délais de livraison : 14 jours ouvrés à compter de la signature du contrat et de la réception du paiement (si applicable).",
  );
  doc.text(
    "Retours visuels : 3 retours pour retouches mineures ; aucune modification de structure après validation maquette.",
  );
  doc.moveDown(0.7);

  doc
    .fontSize(11)
    .text("3. Abonnement au Dashboard et Modules", { underline: true });
  doc
    .fontSize(10)
    .text(
      `Abonnement : ${documentData.subscriptionLabel || "-"} (exonéré de TVA).`,
    );
  doc.text(
    `Durée d’engagement : ${
      documentData.engagementMonths || "-"
    } mois à compter de la date de souscription.`,
  );
  doc.moveDown(0.5);

  // Modules table
  doc.fontSize(10).text("Modules sélectionnés :", { underline: true });
  doc.moveDown(0.3);

  const startY = doc.y;
  const colM = 50;
  const colP = 420;

  doc.fillColor("#111").text("Module", colM, startY);
  doc.text("Tarif", colP, startY, { width: 120, align: "right" });
  doc
    .moveTo(50, startY + 14)
    .lineTo(545, startY + 14)
    .strokeColor("#ddd")
    .stroke();

  let y = startY + 22;
  const modules = documentData.modules || [];
  for (const m of modules) {
    doc.fillColor("#111").text(m.name || "-", colM, y, { width: 340 });
    doc.text(m.offered ? "Offert" : m.priceLabel || "-", colP, y, {
      width: 120,
      align: "right",
    });
    y += 18;
  }

  doc.moveDown(1);
  doc
    .fillColor("#444")
    .fontSize(9)
    .text(
      "Le Client peut demander l’ajout ou la suppression de modules à tout moment. Toute modification fera l’objet d’une confirmation écrite et d’une mise à jour tarifaire.",
    );

  // Signature block
  doc.moveDown(2);
  doc
    .fillColor("#111")
    .fontSize(10)
    .text(`Fait le ${fmtDate(new Date())}`);
  doc.moveDown(1);

  // ✅ figer la ligne de base pour éviter que "Le Client" ne bouge
  const baseY = doc.y;
  doc.fillColor("#111").fontSize(10).text("Le Prestataire", 50, baseY);
  doc.text("Le Client", 320, baseY);

  // ✅ zone signature propre (cadre + placement stable)
  const sigY = baseY + 20;

  doc.strokeColor("#ddd").rect(320, sigY, 200, 70).stroke();

  if (signatureImageBuffer) {
    try {
      doc.image(signatureImageBuffer, 325, sigY + 5, { width: 190 });
    } catch (e) {
      // ignore image errors; keep doc valid
    }
  } else {
    doc
      .fontSize(9)
      .fillColor("#666")
      .text("Signature à compléter", 330, sigY + 28, { width: 180 });
  }

  doc.end();
  await new Promise((resolve) => doc.on("end", resolve));
  return Buffer.concat(chunks);
}

module.exports = { renderContractPdf };
