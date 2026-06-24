const axios = require("axios");
const PDFDocument = require("pdfkit");
const sharp = require("sharp");
const SibApiV3Sdk = require("sib-api-v3-sdk");

function looksLikeEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(email || "").trim());
}

function escapeHtml(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function parseHexColor(hexColor) {
  const safeColor = /^#[0-9a-fA-F]{6}$/.test(hexColor || "")
    ? hexColor
    : "#000000";

  return safeColor;
}

function formatDateFR(dateInput) {
  const date = new Date(dateInput);
  if (Number.isNaN(date.getTime())) return "";

  return date.toLocaleDateString("fr-FR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

function formatAddress(restaurant) {
  const address = restaurant?.address || {};
  return [address.line1, address.zipCode, address.city]
    .filter(Boolean)
    .join(", ");
}

function getGiftCardTextZone(layout, width) {
  const zoneWidth = width * 0.62;
  if (layout === "left") return { x: 0, width: zoneWidth };
  if (layout === "center") return { x: (width - zoneWidth) / 2, width: zoneWidth };
  return { x: width - zoneWidth, width: zoneWidth };
}

async function fetchImageAsPngBuffer(imageUrl) {
  if (!imageUrl) return null;

  const response = await axios.get(imageUrl, {
    responseType: "arraybuffer",
    timeout: 12000,
  });

  return sharp(Buffer.from(response.data)).png().toBuffer();
}

function collectPdfBuffer(doc) {
  return new Promise((resolve, reject) => {
    const chunks = [];

    doc.on("data", (chunk) => chunks.push(chunk));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);
  });
}

function drawCenteredText(doc, text, { x, width, y, fontSize, font, color }) {
  doc.font(font).fontSize(fontSize).fillColor(color);
  const textWidth = doc.widthOfString(text);
  doc.text(text, x + (width - textWidth) / 2, y, {
    lineBreak: false,
  });
}

function wrapText(doc, text, { font, fontSize, maxWidth }) {
  const words = String(text || "").split(/\s+/).filter(Boolean);
  const lines = [];
  let currentLine = "";

  doc.font(font).fontSize(fontSize);

  words.forEach((word) => {
    const testLine = currentLine ? `${currentLine} ${word}` : word;
    if (doc.widthOfString(testLine) <= maxWidth) {
      currentLine = testLine;
    } else {
      if (currentLine) lines.push(currentLine);
      currentLine = word;
    }
  });

  if (currentLine) lines.push(currentLine);
  return lines;
}

async function generateGiftCardPdfBuffer({
  purchase,
  message,
  hidePrice,
  fallbackImageUrl,
}) {
  const width = 1200;
  const height = 675;
  const doc = new PDFDocument({ size: [width, height], margin: 0 });
  const done = collectPdfBuffer(doc);

  const visual = purchase?.visualSnapshot || {};
  const imageUrl = visual.imageUrl || fallbackImageUrl || "";
  const textColor = parseHexColor(visual.textColor);
  const textLayout = ["left", "center", "right"].includes(visual.textLayout)
    ? visual.textLayout
    : "right";
  const zone = getGiftCardTextZone(textLayout, width);
  const zonePadding = width * 0.025;
  const contentX = zone.x + zonePadding;
  const contentWidth = zone.width - zonePadding * 2;

  try {
    const imageBuffer = await fetchImageAsPngBuffer(imageUrl);
    if (imageBuffer) {
      doc.image(imageBuffer, 0, 0, { width, height });
    }
  } catch (error) {
    doc.rect(0, 0, width, height).fill("#f7f8fb");
    doc.rect(0, 0, width * 0.34, height).fill("#6d99b6");
  }

  const titleFontSize = 54;
  const amountFontSize = 34;
  const mainFontSize = 31;
  const metaFontSize = 24;
  const lineGap = 12;

  const lines = [
    { type: "text", text: "Carte Cadeau", fontSize: titleFontSize, font: "Helvetica" },
  ];

  if (!hidePrice && purchase?.value) {
    lines.push({
      type: "text",
      text: `${purchase.value} €`,
      fontSize: amountFontSize,
      font: "Helvetica",
    });
  }

  if (purchase?.description) {
    wrapText(doc, purchase.description, {
      font: "Helvetica",
      fontSize: mainFontSize,
      maxWidth: contentWidth * 0.88,
    }).forEach((line) =>
      lines.push({ type: "text", text: line, fontSize: mainFontSize, font: "Helvetica" }),
    );
  }

  const beneficiaryName = [
    purchase?.beneficiaryFirstName,
    purchase?.beneficiaryLastName,
  ]
    .filter(Boolean)
    .join(" ");
  if (beneficiaryName) {
    lines.push({
      type: "text",
      text: `Pour : ${beneficiaryName}`,
      fontSize: mainFontSize,
      font: "Helvetica-Oblique",
    });
  }

  if (message) {
    wrapText(doc, `"${message}"`, {
      font: "Helvetica",
      fontSize: mainFontSize,
      maxWidth: contentWidth * 0.88,
    }).forEach((line) =>
      lines.push({ type: "text", text: line, fontSize: mainFontSize, font: "Helvetica" }),
    );
  }

  if (purchase?.sender) {
    lines.push({
      type: "text",
      text: `De la part de : ${purchase.sender}`,
      fontSize: mainFontSize,
      font: "Helvetica-Oblique",
    });
  }

  lines.push({
    type: "spacer",
    height: height * 0.108,
  });
  lines.push({
    type: "text",
    text: `Code : ${purchase?.purchaseCode || ""}`,
    fontSize: metaFontSize,
    font: "Helvetica",
  });
  lines.push({
    type: "text",
    text: `Valable jusqu'au : ${formatDateFR(purchase?.validUntil)}`,
    fontSize: metaFontSize,
    font: "Helvetica",
  });

  const totalHeight = lines.reduce((sum, line) => {
    if (line.type === "spacer") return sum + line.height;
    return sum + line.fontSize + lineGap;
  }, 0);

  let currentY = (height - totalHeight) / 2;
  lines.forEach((line) => {
    if (line.type === "spacer") {
      currentY += line.height;
      return;
    }

    drawCenteredText(doc, line.text, {
      x: contentX,
      width: contentWidth,
      y: currentY,
      fontSize: line.fontSize,
      font: line.font,
      color: textColor,
    });
    currentY += line.fontSize + lineGap;
  });

  doc.end();
  return done;
}

function brevoClient() {
  const defaultClient = SibApiV3Sdk.ApiClient.instance;
  const apiKey = defaultClient.authentications["api-key"];
  apiKey.apiKey = process.env.BREVO_API_KEY;
  return new SibApiV3Sdk.TransactionalEmailsApi();
}

function buildGiftCardEmailHtml({ restaurant, purchase }) {
  const restaurantName = restaurant?.name || "le restaurant";
  const beneficiaryName = [
    purchase?.beneficiaryFirstName,
    purchase?.beneficiaryLastName,
  ]
    .filter(Boolean)
    .join(" ");
  const address = formatAddress(restaurant);
  const formattedValidUntil = formatDateFR(purchase?.validUntil);

  return `
    <html>
      <body style="margin:0;padding:24px;background:#f5f7fb;font-family:Arial,sans-serif;color:#1f2937;">
        <div style="max-width:640px;margin:0 auto;background:#ffffff;border-radius:18px;padding:28px;border:1px solid #e5e7eb;">
          <p>Bonjour,</p>
          <p>Nous confirmons la commande d'une carte cadeau pour <strong>${escapeHtml(beneficiaryName)}</strong>.</p>
          <p>Voici les détails de la commande :</p>
          <ul>
            <li><strong>Montant :</strong> ${escapeHtml(purchase?.value)} €</li>
            <li><strong>Code :</strong> ${escapeHtml(purchase?.purchaseCode)}</li>
            <li><strong>Date de validité :</strong> ${escapeHtml(formattedValidUntil)}</li>
          </ul>
          <p>La carte cadeau est jointe à cet email.</p>
          <p><strong>Comment utiliser la carte cadeau ?</strong></p>
          <ul>
            <li>Lors de votre réservation ou de votre venue, précisez que vous bénéficiez d'une carte cadeau.</li>
            <li>Lors du paiement, donnez le code suivant : <strong>${escapeHtml(purchase?.purchaseCode)}</strong></li>
          </ul>
          <p><em><strong>À partir du ${escapeHtml(formattedValidUntil)}, la carte cadeau ne pourra plus être utilisée.</strong></em></p>
          <hr style="border:none;border-top:1px solid #e5e7eb;margin:24px 0;">
          <p><strong>Informations pratiques :</strong></p>
          ${address ? `<p>Adresse : ${escapeHtml(address)}</p>` : ""}
          ${restaurant?.phone ? `<p>Téléphone : ${escapeHtml(restaurant.phone)}</p>` : ""}
          ${restaurant?.website ? `<p>Site internet : <a href="${escapeHtml(restaurant.website)}" target="_blank">${escapeHtml(restaurant.website)}</a></p>` : ""}
          <p>Merci pour votre commande et à bientôt,</p>
          <p><strong>${escapeHtml(restaurantName)}</strong></p>
        </div>
      </body>
    </html>
  `;
}

async function sendGiftCardPurchaseEmail({
  restaurant,
  purchase,
  message,
  hidePrice,
  fallbackImageUrl,
}) {
  if (!looksLikeEmail(purchase?.sendEmail)) {
    return { skipped: true, reason: "invalid_email" };
  }
  if (!process.env.BREVO_API_KEY) {
    return { skipped: true, reason: "missing_brevo_key" };
  }

  const pdfBuffer = await generateGiftCardPdfBuffer({
    purchase,
    message,
    hidePrice,
    fallbackImageUrl,
  });

  const restaurantName = restaurant?.name || "Gusto Manager";
  const apiInstance = brevoClient();
  const email = {
    sender: {
      email: "no-reply@gusto-manager.com",
      name: restaurantName,
    },
    to: [
      {
        email: String(purchase.sendEmail).trim(),
        name: String(purchase.sendEmail).trim(),
      },
    ],
    subject: `Confirmation de commande - Carte cadeau ${restaurantName}`,
    htmlContent: buildGiftCardEmailHtml({ restaurant, purchase }),
    attachment: [
      {
        name: "Carte_Cadeau.pdf",
        content: pdfBuffer.toString("base64"),
      },
    ],
  };

  return apiInstance.sendTransacEmail(email);
}

module.exports = {
  generateGiftCardPdfBuffer,
  sendGiftCardPurchaseEmail,
};
