const { setTimeout: wait } = require("node:timers/promises");
const { randomUUID } = require("node:crypto");
const { DateTime } = require("luxon");
const sharp = require("sharp");
const { mongoUri, messages } = require("./isolated-environment.cjs");
const Admin = require("../../models/admin.model");
const Account = require("../../models/commercial-account.model");
const Acquisition = require("../../models/commercial-acquisition.model");
const { signAdminToken } = require("../../middleware/authenticate-admin");
const { signCommercialToken } = require("../../middleware/authenticate-commercial");

const root = "/admin/commerciaux";
const docs = "/commercial/documents";
const email = (name) => `${name}@gusto-recette.invalid`;

module.exports = async function seedUserReview() {
  if (new URL(mongoUri).pathname !== "/gusto_commercial_user_review_v4") throw new Error("Review data requires the user fixture database.");
  const apiUrl = new URL(process.env.NEXT_PUBLIC_API_URL);
  if (apiUrl.protocol !== "http:" || apiUrl.hostname !== "127.0.0.1" || apiUrl.port !== process.env.PORT ||
      apiUrl.username || apiUrl.password || !["/api", "/api/"].includes(apiUrl.pathname)) {
    throw new Error("Use the loopback NEXT_PUBLIC_API_URL for the fixture.");
  }
  const base = `${apiUrl.origin}/api`;
  const admin = signAdminToken(await Admin.findOne({ email: email("super-admin") }).select("+sessionVersion"));
  const [alice, benoit] = await Promise.all(["alice", "benoit"].map(name => Account.findOne({ email: email(name) }).select("+sessionVersion")));
  const sellers = [alice, benoit].map(account => ({ id: String(account._id), token: signCommercialToken(account) }));
  const today = DateTime.now().setZone("Europe/Paris");

  async function request(path, method = "GET", body, token = admin) {
    const multipart = body instanceof FormData;
    const response = await fetch(base + path, {
      method, headers: { ...(token && { Authorization: `Bearer ${token}` }), ...(body && !multipart && { "Content-Type": "application/json" }) },
      ...(body && { body: multipart ? body : JSON.stringify(body) }),
    });
    if (!response.ok) throw new Error(`Recette ${method} ${path.replace(/[a-f0-9]{24,}/g, "[ID]")} → ${response.status}`);
    const contentType = response.headers.get("content-type") || "";
    if (contentType.includes("application/pdf")) return response.blob();
    return contentType.includes("application/json") ? response.json() : null;
  }

  for (let retry = 0; retry < 20; retry += 1) {
    try { await request(`${root}/crm/registry`); break; }
    catch (error) { if (retry === 19) throw error; await wait(200); }
  }
  await request(`${root}/crm/registry/initialize`, "POST");
  const offerPath = `${root}/catalogue/offers`;
  const facts = { signedCopyHours: 24 };
  const { offer } = await request(offerPath, "POST", { kind: "STANDARD", title: "Gusto Manager · Recette", ...facts });
  await request(`${offerPath}/${offer._id}/status`, "POST", { action: "publish", approved: true });
  const deadline = DateTime.fromISO("2027-01-01T00:00:00+01:00");
  let promotion;
  if (today < deadline) {
    ({ offer: promotion } = await request(offerPath, "POST", { kind: "FETES_2026", title: "Offre fêtes · Recette", ...facts,
      startsAt: today.minus({ days: 1 }).toISO(), endsAt: deadline.toISO(), promoEligibility: "SIGNED_IN_WINDOW",
      giftSelectedFirst: "SELECT_ANOTHER_INCLUDED_MODULE" }));
    await request(`${offerPath}/${promotion._id}/status`, "POST", { action: "publish", approved: true });
  }
  await request(offerPath, "POST", { kind: "STANDARD", title: "Offre à préparer · Recette" });

  const signature = await sharp({ create: { width: 72, height: 20, channels: 4, background: "#203050" } }).png().toBuffer();
  const cases = [
    ["L’Ardoise fictive", "CONTACTED", "pending"], ["La Table fictive", "INTERESTED", "toPay"],
    ["L’Atelier fictif", "NEGOTIATION", "paid"], ["Le Verger fictif", "NEGOTIATION", "contested"],
    ["Le Comptoir fictif", "CONTACTED", "cancelled"], ["La Terrasse fictive", "INTERESTED", "sent"],
    ["La Brasserie fictive", "TO_CONTACT", "draft"], ["Le Café fictif", "INTERESTED", "prospect"],
  ];
  let guide;
  for (const [index, [restaurantName, stage, state]] of cases.entries()) {
    const seller = sellers[index % sellers.length];
    const contact = { restaurantName, contactName: "Camille Recette", address: `${index + 20} rue de la Recette`,
      postalCode: "75020", city: "Paris", email: email(`restaurant-${index}`) };
    const { prospect } = await request(`${root}/crm/prospects`, "POST", { ...contact, stage,
      salesOwnerId: seller.id, nextFollowUpAt: today.plus({ days: index === 6 ? -1 : index - 7 }).toISO(),
      ...(index >= 5 && { nextAppointmentAt: today.plus({ days: index - 4 }).toISO() }),
    });
    await request(`/commercial/prospects/${prospect._id}/interactions`, "POST", {
      type: index % 2 ? "DEMO" : "CALL", message: "Échange fictif sur les besoins de réservation et de gestion.",
    }, seller.token);
    if (state === "prospect") continue;
    const { document: quote } = await request(docs, "POST", { type: "QUOTE", prospectId: prospect._id,
      offerId: (state === "draft" && promotion ? promotion : offer)._id, choices: { includedModule: "reservations" } }, seller.token);
    const { document: contract } = await request(docs, "POST", { type: "CONTRACT", sourceQuoteId: quote._id }, seller.token);
    if (!guide) guide = await request(`${docs}/${quote._id}/pdf/preview`, "GET", undefined, seller.token);
    if (state === "draft") continue;
    await request(`${docs}/${quote._id}/send`, "POST", undefined, seller.token);
    await request(`${docs}/${contract._id}/send-for-signature`, "POST", undefined, seller.token);
    if (state === "sent") continue;
    const token = messages.at(-1)?.htmlContent.match(/\/signature\/([a-f0-9]{64})/)?.[1];
    if (!token) throw new Error("Lien fictif de signature introuvable.");
    await request(`/public/contract-signatures/${token}/sign`, "POST", {
      accepted: true, signerName: "Camille Recette", placeOfSignature: "Paris", signatureDataUrl: `data:image/png;base64,${signature.toString("base64")}`,
    }, null);
    const { document: invoice } = await request(docs, "POST", { type: "INVOICE", sourceContractId: contract._id }, seller.token);
    await request(`${docs}/${invoice._id}/send`, "POST", undefined, seller.token);
    const settlement = `${root}/documents/${invoice._id}/settlement`;
    if (["toPay", "paid"].includes(state)) {
      await request(settlement, "POST", {
        action: "record", paidOn: today.toISODate(), reference: "RECETTE-CLIENT",
        requestId: randomUUID(),
      });
    }
    if (state === "cancelled") {
      await request(settlement, "POST", { action: "cancel", reason: "Facture annulée en recette." });
    }
    const acquisition = await Acquisition.findOne({ contractId: contract._id });
    const commissionPath = `${root}/pilotage/commissions/${acquisition._id}/status`;
    if (state === "paid") await request(commissionPath, "POST", { action: "pay",
      paidOn: today.toISODate(), reference: "RECETTE-VIREMENT-FICTIF" });
    if (state === "contested" || state === "cancelled") {
      await request(commissionPath, "POST", { action: state === "contested" ? "contest" : "cancel", note: "Décision de démonstration." });
    }
  }

  const resources = `${root}/library/resources`;
  const { resource } = await request(resources, "POST", { kind: "FILE", title: "Exemple de devis fictif", category: "Supports de vente" });
  const file = new FormData();
  file.set("file", guide, "exemple-devis-recette.pdf");
  await request(`${resources}/${resource._id}/file`, "POST", file);
  await request(`${resources}/${resource._id}/status`, "POST", { action: "publish" });
  await request(resources, "POST", { kind: "LINK", title: "Ressource à préparer", category: "Supports de vente", link: "https://gusto-recette.invalid/guide" });
};
