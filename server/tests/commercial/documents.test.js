const { mongoUri, messages, stripeCalls, emailFixture, fileFixture, files } = require("./isolated-environment.cjs");
const { after, before, test } = require("node:test");
const assert = require("node:assert/strict");
const { createHash, randomUUID } = require("node:crypto");
const express = require("express");
const mongoose = require("mongoose");
const sharp = require("sharp");
const { DateTime } = require("luxon");
const Admin = require("../../models/admin.model");
const Account = require("../../models/commercial-account.model");
const Offer = require("../../models/commercial-offer.model");
const Document = require("../../models/document.model");
const Acquisition = require("../../models/commercial-acquisition.model");
const Establishment = require("../../models/commercial-establishment.model");
const { keysForEstablishment, syncRestaurantEstablishment } = require("../../services/commercial/establishments.service");
const Restaurant = require("../../models/restaurant.model");
const Owner = require("../../models/owner.model");
const { CommercialProspect: Prospect } = require("../../models/commercial-prospect.model");
const { signAdminToken } = require("../../middleware/authenticate-admin");
const { signCommercialToken } = require("../../middleware/authenticate-commercial");
const { isOfferAvailable } = require("../../services/commercial/offers.service");

const offerPath = "/admin/commerciaux/catalogue/offers";
const docsPath = "/commercial/documents";
const approvedFacts = { signedCopyHours: 2 };
let server;
let base;
let admin;
let a;
let b;
let prospect;
let tokens;
let standard;
let promo;
let quote;
let contract;
let appointmentId;

async function request(path, token, method = "GET", data, expectBytes = false) {
  const response = await fetch(`${base}${path}`, {
    method, headers: { ...(token && { Authorization: `Bearer ${token}` }), ...(data && { "Content-Type": "application/json" }) },
    ...(data && { body: JSON.stringify(data) }),
  });
  const body = expectBytes && response.ok ? Buffer.from(await response.arrayBuffer()) : await response.json().catch(() => null);
  return { status: response.status, headers: response.headers, body };
}

async function createDocument(type, offer, choices = { includedModule: "reservations" }) {
  return request(docsPath, tokens.a, "POST", { type, prospectId: String(prospect._id), offerId: offer._id, choices });
}

test("une fiche administrative ne peut pas ouvrir un document hors du titulaire ou du type choisi", async () => {
  const doc = await Document.create({ type: "QUOTE", docNumber: "FIXTURE-SCOPE", salesOwnerId: a._id, prospectId: prospect._id,
    party: { restaurantName: "Carte fictive", email: "scope@fixture.invalid" } });
  const path = `/admin/documents/${doc._id}`;
  assert.equal((await request(`${path}?salesOwnerId=${a._id}&commercialType=QUOTE`, tokens.admin)).status, 200);
  assert.equal((await request(`${path}?salesOwnerId=${a._id}&commercialType=CONTRACT`, tokens.admin)).status, 404);
  assert.equal((await request(`${path}?salesOwnerId=${b._id}&commercialType=QUOTE`, tokens.admin)).status, 404);
  assert.equal((await request(`${path}/pdf/preview?salesOwnerId=${b._id}&commercialType=QUOTE`, tokens.admin)).status, 404);
  assert.equal((await request(`${path}?salesOwnerId=${b._id}&commercialType=QUOTE`, tokens.admin, "DELETE")).status, 404);
  await Document.deleteOne({ _id: doc._id });
});

before(async () => {
  await mongoose.connect(mongoUri, { dbName: `gusto_commercial_docs_${new mongoose.Types.ObjectId()}`, serverSelectionTimeoutMS: 5000 });
  await Promise.all([Offer.init(), Document.init(), Prospect.init(), Acquisition.init(), Establishment.init()]);
  admin = await Admin.create({ email: "admin@fixture.invalid", role: "admin" });
  [a, b] = await Account.create([
    { email: "a@fixture.invalid", firstName: "Alice", lastName: "Recette", status: "ACTIVE" },
    { email: "b@fixture.invalid", firstName: "Benoît", lastName: "Recette", status: "ACTIVE" },
  ]);
  tokens = { admin: signAdminToken(admin), a: signCommercialToken(a), b: signCommercialToken(b) };
  prospect = await Prospect.create({
    restaurantName: "Le Verger de Recette", contactName: "Responsable fictif", address: "3 rue du Verger", postalCode: "75001",
    city: "Paris", email: "contact@restaurant-fixture.invalid", salesOwnerId: a._id, createdBy: String(a._id),
  });
  await Establishment.create({ kind: "ESTABLISHMENT", prospectId: prospect._id, ...keysForEstablishment(prospect) });
  const app = express();
  app.use(express.json({ limit: "750kb" }));
  app.use("/api", require("../../routes/commercial-documents.routes"));
  app.use("/api", require("../../routes/commercial-prospects.routes"));
  app.use("/api", require("../../routes/commercial-pilotage.routes"));
  app.use("/api", require("../../routes/admin/documents.routes"));
  server = await new Promise((resolve) => {
    const listener = app.listen(0, "127.0.0.1", () => resolve(listener));
  });
  base = `http://127.0.0.1:${server.address().port}/api`;
});

after(async () => {
  if (server) await new Promise((resolve) => server.close(resolve));
  if (mongoose.connection.readyState === 1) await mongoose.connection.dropDatabase();
  await mongoose.disconnect();
});

test("les offres nécessitent des conditions complètes et une publication explicite", async () => {
  const draft = await request(offerPath, tokens.admin, "POST", { kind: "STANDARD" });
  assert.equal(draft.status, 201);
  standard = draft.body.offer;
  assert.equal((await request("/commercial/offers", tokens.a)).body.offers.length, 0);
  assert.equal((await request(`${offerPath}/${standard._id}/status`, tokens.admin, "POST", { action: "publish", approved: true })).status, 400);
  assert.equal((await request(`${offerPath}/${standard._id}`, tokens.admin, "PATCH", approvedFacts)).status, 200);
  assert.equal((await request(`${offerPath}/${standard._id}/status`, tokens.admin, "POST", { action: "publish", approved: true })).status, 200);
  assert.equal((await request(`${offerPath}/${standard._id}`, tokens.admin, "PATCH", { monthlyCents: 10000 })).status, 409);
  assert.equal((await request("/commercial/offers", tokens.a)).body.offers.length, 1);
});

test("le brouillon administratif réutilise les prix publiés et le titulaire de la fiche", async () => {
  const path = "/admin/commerciaux/documents";
  assert.equal((await request(`${path}/offers`, tokens.admin)).body.offers.length, 1);
  const body = { type: "QUOTE", prospectId: String(prospect._id), offerId: standard._id, choices: { includedModule: "reservations" } };
  assert.equal((await request(`${path}?salesOwnerId=${a._id}`, tokens.a, "POST", body)).status, 403);
  assert.equal((await request(`${path}?salesOwnerId=${b._id}`, tokens.admin, "POST", body)).status, 404);
  const created = await request(`${path}?salesOwnerId=${a._id}`, tokens.admin, "POST", body);
  assert.equal(created.status, 201);
  assert.equal(created.body.document.status, "DRAFT");
  const stored = await Document.findById(created.body.document._id).lean();
  assert.equal(String(stored.salesOwnerId), String(a._id));
  assert.equal(stored.createdBy, String(admin._id));
  assert.equal(stored.offerConditions.monthlyCents, standard.monthlyCents);
  assert.equal((await request(`/commercial/prospects/${prospect._id}`, tokens.a)).body.prospect.effectiveStage, "TO_CONTACT");
});

test("le serveur fige les prix, protège l’attribution et garde des numéros uniques", async () => {
  const choices = { includedModule: "reservations", extraModules: ["employees"], sms: true, tabletQuantity: 2, terminalQuantity: 1 };
  const wrong = await request(docsPath, tokens.a, "POST", {
    type: "QUOTE", prospectId: String(prospect._id), offerId: standard._id, choices, setupCents: 1,
  });
  assert.equal(wrong.status, 400);
  assert.equal((await createDocument("QUOTE", standard, { includedModule: "haccp" })).status, 400);
  const [left, right] = await Promise.all([createDocument("QUOTE", standard, choices), createDocument("QUOTE", standard)]);
  assert.equal(left.status, 201);
  assert.equal(right.status, 201);
  quote = left.body.document;
  assert.equal(quote.offerConditions.monthlyCents, 18590);
  assert.equal(quote.offerConditions.setupCents, 25000);
  assert.equal(quote.offerConditions.engagementMonths, 24);
  assert.notEqual(quote.docNumber, right.body.document.docNumber);
  assert.equal((await request(`${docsPath}/${quote._id}`, tokens.b)).status, 404);
  assert.equal((await request(`${docsPath}/${quote._id}/pdf/preview`, tokens.b)).status, 404);
  assert.equal((await request(`${docsPath}/${quote._id}`, tokens.a, "PATCH", { discountAmount: 100 })).status, 400);
  const pdf = await request(`${docsPath}/${quote._id}/pdf/preview`, tokens.a, "GET", null, true);
  assert.equal(pdf.status, 200);
  assert.equal(pdf.body.subarray(0, 5).toString(), "%PDF-");
});

test("la promotion est bornée et ajoute Cartes cadeaux pendant 24 mois", async (t) => {
  t.mock.timers.enable({ apis: ["Date"], now: new Date("2026-11-27T10:00:00Z") });
  const fest = await Prospect.create({ restaurantName: "Fêtes fictives", email: "fetes@fixture.invalid",
    address: "26 rue des Fêtes", city: "Paris", postalCode: "75003", salesOwnerId: a._id, createdBy: String(a._id) });
  await Establishment.create({ kind: "ESTABLISHMENT", prospectId: fest._id, ...keysForEstablishment(fest) });
  const create = (choices = { includedModule: "reservations" }) => request(docsPath, tokens.a, "POST", {
    type: "CONTRACT", prospectId: String(fest._id), offerId: promo._id, choices,
  });
  const startsAt = new Date(Date.now() - 60000).toISOString();
  const endsAt = "2027-01-01T00:00:00+01:00";
  const { body } = await request(offerPath, tokens.admin, "POST", {
    kind: "FETES_2026", ...approvedFacts, startsAt, endsAt, promoEligibility: "SIGNED_IN_WINDOW",
    giftSelectedFirst: "SELECT_ANOTHER_INCLUDED_MODULE",
  });
  promo = body.offer;
  const publish = (offer) => request(`${offerPath}/${offer._id}/status`, tokens.admin, "POST", { action: "publish", approved: true });
  for (const fields of [{ endsAt: "2027-01-01T00:00:01+01:00" }, { promoEligibility: "SENT_IN_WINDOW" }]) {
    const { body: { offer } } = await request(offerPath, tokens.admin, "POST", { ...promo, ...fields });
    assert.equal((await publish(offer)).status, 400);
  }
  const published = await request(`${offerPath}/${promo._id}/status`, tokens.admin, "POST", { action: "publish", approved: true });
  assert.equal(published.status, 200);
  const fixture = await Offer.findById(promo._id).lean();
  assert.ok(isOfferAvailable(fixture, new Date(startsAt)));
  assert.equal(isOfferAvailable(fixture, new Date(endsAt)), false);
  const deadline = new Date("2027-01-01T00:00:00+01:00");
  assert.ok(isOfferAvailable({ ...fixture, endsAt: deadline }, new Date(+deadline - 1)));
  assert.equal(isOfferAvailable({ ...fixture, endsAt: deadline }, deadline), false);
  const alreadyClient = await Prospect.create({ restaurantName: "Client fictif avant campagne", email: "client-fetes@fixture.invalid",
    address: "35 rue des Fêtes", city: "Paris", postalCode: "75003", salesOwnerId: b._id, createdBy: String(b._id) });
  const restaurant = await Restaurant.create({ name: alreadyClient.restaurantName, phone: "0101010101", email: alreadyClient.email,
    address: { line1: alreadyClient.address, city: alreadyClient.city, zipCode: alreadyClient.postalCode, country: "France" },
    owner_id: new mongoose.Types.ObjectId() });
  await Establishment.create({ kind: "ESTABLISHMENT", prospectId: alreadyClient._id,
    ...keysForEstablishment(alreadyClient), restaurants: [restaurant._id] });
  assert.equal((await request(docsPath, tokens.b, "POST", { type: "CONTRACT", prospectId: alreadyClient._id, offerId: promo._id,
    choices: { includedModule: "reservations" } })).status, 409);
  assert.equal((await create({ includedModule: "gift_cards" })).status, 400);
  const future = await create();
  assert.equal(future.status, 201);
  assert.equal(future.body.document.offerConditions.giftMonths, 24);
  const pdf = await request(`${docsPath}/${future.body.document._id}/pdf/preview`, tokens.a, "GET", null, true);
  assert.equal(pdf.status, 200);
  assert.equal((await request(`${docsPath}/${future.body.document._id}/send-for-signature`, tokens.a, "POST")).status, 200);
  const link = messages.at(-1).htmlContent.match(/\/signature\/([a-f0-9]{64})/)[1];
  await Offer.updateOne({ _id: promo._id }, { $set: { endsAt: new Date(0) } });
  assert.equal((await create()).status, 409);
  const signature = await sharp({ create: { width: 80, height: 20, channels: 4, background: "#123456" } }).png().toBuffer();
  const expired = await request(`/public/contract-signatures/${link}/sign`, null, "POST", {
    accepted: true, signerName: "Signataire fictif", placeOfSignature: "Paris", signatureDataUrl: `data:image/png;base64,${signature.toString("base64")}`,
  });
  assert.equal(expired.status, 409);
  assert.match(expired.body.message, /nouveau contrat/);
  assert.equal((await request(`/public/contract-signatures/${link}`)).body.state, "EXPIRED");
  assert.equal((await Document.findById(future.body.document._id)).status, "SENT");
});

test("une conversion répétée ne crée qu’un contrat et un devis n’est envoyé qu’une fois", async () => {
  const day = DateTime.now().setZone("Europe/Paris").toISODate();
  for (const [type, title] of [["APPOINTMENT", "Rendez-vous de recette"], ["DEMO", "Démonstration de recette"]]) {
    const agenda = await request("/commercial/calendar", tokens.a, "POST", {
      type, title, startsAt: day, allDay: true, prospectId: String(prospect._id),
    });
    assert.equal(agenda.status, 201);
    assert.equal((await request(`/commercial/calendar/${agenda.body.event._id}`, tokens.a, "PATCH", { action: "complete" })).status, 200);
    assert.equal((await request(`/commercial/calendar/${agenda.body.event._id}`, tokens.a, "PATCH", { action: "complete" })).status, 409);
  }
  const dashboard = (await request(`/commercial/dashboard?from=${day}&to=${day}`, tokens.a)).body;
  assert.equal(dashboard.demos, 1);
  assert.equal(dashboard.completedAppointments, 1);
  const proposed = { type: "CONTRACT", sourceQuoteId: quote._id };
  const results = await Promise.all([request(docsPath, tokens.a, "POST", proposed), request(docsPath, tokens.a, "POST", proposed)]);
  assert.deepEqual(results.map((response) => response.status).sort(), [200, 201]);
  assert.equal(results[0].body.document._id, results[1].body.document._id);
  contract = results[0].body.document;
  assert.deepEqual(contract.offerConditions, quote.offerConditions);
  const initial = messages.length;
  const requests = await Promise.all([1, 2].map(() => request(`${docsPath}/${quote._id}/send`, tokens.a, "POST")));
  assert.deepEqual(requests.map((response) => response.status).sort(), [200, 409]);
  assert.equal(messages.length, initial + 1);
  const sent = await Document.findById(quote._id).lean();
  assert.equal(sent.pdf.delivery_type, "authenticated");
  assert.equal(sent.pdf.url, "");
  assert.ok(sent.firstSentAt);
  assert.ok((await Prospect.findById(prospect._id)).milestones.quoteSentAt);
  assert.equal((await request(`/commercial/prospects/${prospect._id}`, tokens.a)).body.prospect.effectiveStage, "QUOTE_SENT");
});

test("le renvoi vendeur contrôle le périmètre, la concurrence et l’intégrité du PDF original", async () => {
  const path = `${docsPath}/${quote._id}`;
  const before = await Document.findById(quote._id).lean();
  const original = await request(`${path}/pdf/preview`, tokens.a, "GET", null, true);
  const sentCount = messages.length;
  assert.equal((await request(`${path}/resend`, tokens.b, "POST")).status, 404);
  const retries = await Promise.all([1, 2].map(() => request(`${path}/resend`, tokens.a, "POST")));
  assert.deepEqual(retries.map(({ status }) => status).sort(), [200, 409]);
  assert.equal(messages.length, sentCount + 1);
  emailFixture.fail = true;
  try {
    assert.equal((await request(`${path}/resend`, tokens.a, "POST")).status, 502);
    assert.equal((await request(`${path}/resend`, tokens.a, "POST")).status, 409);
  } finally {
    emailFixture.fail = false;
  }
  const uncertain = await Document.findById(quote._id).lean();
  assert.equal(uncertain.status, "SENT");
  assert.equal(uncertain.commercialDelivery.state, "UNCERTAIN");
  assert.equal((await request(`/admin/documents/${quote._id}/resolve-delivery`, tokens.admin, "POST", { action: "reopen" })).status, 200);
  const after = await Document.findById(quote._id).lean();
  assert.equal(after.status, "SENT");
  assert.equal(+after.firstSentAt, +before.firstSentAt);
  assert.equal(after.pdf.sha256, before.pdf.sha256);
  assert.ok(after.deliveryHistory.some((entry) => entry.operation === "RESEND_PDF" && entry.state === "UNCERTAIN"));
  assert.deepEqual((await request(`${path}/pdf/preview`, tokens.a, "GET", null, true)).body, original.body);
});

test("le contrat authentifié partage le moteur de signature et garde l’original à empreinte vérifiable", async () => {
  const existingRestaurants = await Restaurant.countDocuments();
  const now = DateTime.now().setZone("Europe/Paris");
  const calendar = "/commercial/calendar";
  const followUp = { title: "Relance de recette", type: "FOLLOW_UP", allDay: true,
    startsAt: now.minus({ days: 1 }).toISODate(), prospectId: String(prospect._id) };
  assert.equal((await request(`/commercial/prospects/${prospect._id}`, tokens.a, "PATCH", { nextFollowUpAt: followUp.startsAt })).status, 200);
  assert.equal((await request(calendar, tokens.a, "POST", followUp)).status, 201);
  const history = await request(calendar, tokens.a, "POST", { ...followUp, title: "Relance déjà effectuée" });
  assert.equal((await request(`${calendar}/${history.body.event._id}`, tokens.a, "PATCH", { action: "complete" })).status, 200);
  const appointment = await request(calendar, tokens.a, "POST", { ...followUp, title: "Suivi du client", type: "APPOINTMENT", startsAt: now.plus({ days: 1 }).toISODate() });
  assert.equal(appointment.status, 201);
  appointmentId = appointment.body.event._id;
  assert.equal((await request("/commercial/dashboard", tokens.a)).body.nextActions.overdue.length, 2);
  const sent = await request(`${docsPath}/${contract._id}/send-for-signature`, tokens.a, "POST");
  assert.equal(sent.status, 200);
  assert.equal((await request(`/commercial/prospects/${prospect._id}`, tokens.a)).body.prospect.effectiveStage, "CONTRACT_SENT");
  assert.equal(sent.body.signatureUrl, undefined);
  const token = messages.at(-1).htmlContent.match(/\/signature\/([a-f0-9]{64})/)[1];
  const publicPath = `/public/contract-signatures/${token}`;
  assert.equal((await request(publicPath)).body.state, "PENDING");
  const presented = await request(`${publicPath}/pdf`, null, "GET", null, true);
  assert.equal(presented.status, 200);
  const signature = await sharp({ create: { width: 80, height: 20, channels: 4, background: "#123456" } }).png().toBuffer();
  const body = {
    accepted: true, signerName: "Signataire fictif", placeOfSignature: "Paris", signatureDataUrl: `data:image/png;base64,${signature.toString("base64")}`,
  };
  const storedDraft = await Document.findById(contract._id).select("signatureRequest.previewPdf").lean();
  const storageId = storedDraft.signatureRequest.previewPdf.public_id;
  const fixturePdf = files.get(storageId);
  assert.ok(fixturePdf);
  files.delete(storageId);
  try {
    const unavailable = await request(`${publicPath}/sign`, null, "POST", body);
    assert.equal(unavailable.status, 500);
    assert.equal(unavailable.body.message, "Impossible de valider la signature.");
    assert.equal((await request(publicPath)).body.state, "PENDING");
  } finally {
    files.set(storageId, fixturePdf);
  }
  const beforeFailure = Acquisition.create;
  Acquisition.create = async () => { throw new Error("Transaction de recette interrompue"); };
  try {
    assert.equal((await request(`${publicPath}/sign`, null, "POST", body)).status, 500);
    assert.equal((await request(publicPath)).body.state, "PENDING");
    assert.equal(await Acquisition.countDocuments(), 0);
    assert.equal((await Prospect.findById(prospect._id)).milestones.contractSignedAt, undefined);
  } finally {
    Acquisition.create = beforeFailure;
  }
  const attempts = await Promise.all([1, 2].map(() => request(`${publicPath}/sign`, null, "POST", body)));
  assert.equal(attempts.filter(({ status }) => status === 200).length, 1);
  assert.equal((await request(`${publicPath}/sign`, null, "POST", body)).status, 409);
  assert.equal(await Acquisition.countDocuments({ contractId: contract._id }), 1);
  const final = await request(`${docsPath}/${contract._id}/pdf/preview`, tokens.a, "GET", null, true);
  assert.equal(final.status, 200);
  const document = await Document.findById(contract._id);
  assert.equal(document.pdf.sha256, createHash("sha256").update(final.body).digest("hex"));
  assert.equal(document.signatureRequest.previewPdf.delivery_type, "authenticated");
  assert.equal(document.contractSnapshot.contractTermsVersion, 3);
  assert.equal((await request(`${publicPath}/pdf`, null, "GET", null, true)).status, 200);
  await Document.updateOne({ _id: document._id }, { $set: { "signatureRequest.signedCopyExpiresAt": new Date(0) } });
  assert.equal((await request(`${publicPath}/pdf`)).status, 410);
  assert.equal((await request(`/admin/documents/${contract._id}/pdf/preview`, tokens.admin, "GET", null, true)).status, 200);
  assert.ok((await Prospect.findById(prospect._id)).milestones.contractSignedAt);
  assert.equal((await request(`/commercial/prospects/${prospect._id}`, tokens.a)).body.prospect.effectiveStage, "ACQUIRED");
  assert.equal(await Restaurant.countDocuments(), existingRestaurants);
  assert.equal(await Owner.countDocuments(), 0);
  assert.equal(stripeCalls.length, 0);
  assert.ok([...files.values()].every((file) => file.type === "authenticated"));
});

test("une facture de mise en service issue du devis débloque la commission uniquement après encaissement", async () => {
  const pilotage = "/admin/commerciaux/pilotage";
  const path = `/commercial/prospects/${prospect._id}`;
  const now = DateTime.now().setZone("Europe/Paris");
  const day = now.toISODate();
  assert.equal((await request(path, tokens.a, "PATCH", { stage: "ACQUIRED" })).status, 400);
  const calendar = "/commercial/calendar";
  const followUp = { title: "Relance de recette", type: "FOLLOW_UP", allDay: true,
    startsAt: now.minus({ days: 1 }).toISODate(), prospectId: String(prospect._id) };
  const actions = `${pilotage}/actions`;
  const sellerCommissions = (await request("/commercial/commissions", tokens.a)).body.commissions;
  assert.equal(sellerCommissions[0].commission.status, "WAITING_CUSTOMER_PAYMENT");
  assert.equal(sellerCommissions[0].invoice, undefined);
  const commission = `${pilotage}/commissions/${sellerCommissions[0]._id}/status`;
  assert.equal((await request(`${actions}/restaurants`, tokens.admin)).body.total, 1);
  assert.equal((await request(`${actions}/payments`, tokens.admin)).body.total, 0);
  const conversion = { type: "INVOICE", sourceQuoteId: quote._id };
  assert.equal((await request(docsPath, tokens.b, "POST", conversion)).status, 404);
  assert.equal((await request(docsPath, tokens.a, "POST", { ...conversion, setupCents: 1 })).status, 400);
  const creations = await Promise.all([1, 2].map(() => request(docsPath, tokens.a, "POST", conversion)));
  assert.deepEqual(creations.map(({ status }) => status).sort(), [200, 201]);
  const invoice = creations[0].body.document;
  assert.equal(invoice._id, creations[1].body.document._id);
  assert.match(invoice.docNumber, /^WD-F-/);
  assert.equal(invoice.offerConditions.setupCents, 25000);
  assert.equal(invoice.sourceQuoteId, quote._id);
  assert.equal((await Document.findById(contract._id)).type, "CONTRACT");
  const invoicePath = `${docsPath}/${invoice._id}`;
  assert.equal((await request(invoicePath, tokens.b)).status, 404);
  assert.equal((await request(`${invoicePath}/pdf/preview`, tokens.b, "GET", null, true)).status, 404);
  assert.equal((await request(invoicePath, tokens.a, "PATCH", { iban: "fiction" })).status, 400);
  assert.equal((await request(invoicePath, tokens.a, "PATCH", { offerId: new mongoose.Types.ObjectId() })).status, 400);
  const preview = await request(`${invoicePath}/pdf/preview`, tokens.a, "GET", null, true);
  assert.equal(preview.status, 200);
  assert.equal((await request(`${invoicePath}/send`, tokens.a, "POST")).status, 200);
  const frozen = await request(`${invoicePath}/pdf/preview`, tokens.a, "GET", null, true);
  assert.equal(frozen.status, 200);
  assert.equal((await request(invoicePath, tokens.a, "PATCH", {})).status, 409);
  assert.equal((await request(`/admin/documents/${invoice._id}`, tokens.admin, "DELETE")).status, 409);
  assert.equal((await request(`${actions}/invoices`, tokens.admin)).body.rows[0].invoice.amountCents, 25000);
  assert.equal((await request(`${actions}/payments`, tokens.admin)).body.total, 0);
  const settlement = `/admin/commerciaux/documents/${invoice._id}/settlement`;
  const pay = { action: "record", paidOn: day, reference: "INTERNE", requestId: randomUUID() };
  assert.equal((await request(settlement, tokens.a, "POST", pay)).status, 403);
  assert.equal((await request(settlement, tokens.admin, "POST", pay)).status, 200);
  assert.equal((await request(`${actions}/invoices`, tokens.admin)).body.total, 0);
  assert.equal((await request(`${actions}/payments`, tokens.admin)).body.total, 1);
  const sellerInvoice = (await request(invoicePath, tokens.a)).body.document.setupInvoice;
  assert.ok(sellerInvoice.paidAt);
  assert.deepEqual(Object.keys(sellerInvoice), ["paidAt"]);
  const issued = await request(`${invoicePath}/pdf/preview`, tokens.a, "GET", null, true);
  assert.deepEqual(issued.body, frozen.body);
  const acquired = (await request(path, tokens.a)).body.prospect;
  assert.equal(acquired.effectiveStage, "ACQUIRED");
  assert.equal(acquired.nextFollowUpAt, null);
  assert.deepEqual((await request("/commercial/dashboard", tokens.a)).body.nextActions.overdue, []);
  const tasks = (await request(`${calendar}?prospectId=${prospect._id}&upcoming=true`, tokens.a)).body.events;
  assert.deepEqual(tasks.map(({ _id }) => _id), [appointmentId]);
  assert.equal((await request(calendar, tokens.a, "POST", followUp)).status, 409);
  assert.equal((await request(`${calendar}/${appointmentId}`, tokens.a, "PATCH", { type: "FOLLOW_UP" })).status, 409);
  assert.equal((await request(path, tokens.a, "PATCH", { nextFollowUpAt: day })).status, 409);
  assert.equal((await request(path, tokens.a, "PATCH", { stage: "LOST" })).status, 409);
  assert.equal((await request(commission, tokens.a, "POST", { action: "pay", paidOn: day })).status, 403);
  assert.equal((await request(commission, tokens.admin, "POST", { action: "pay", paidOn: day })).status, 200);
  assert.equal((await request(`${actions}/payments`, tokens.admin)).body.total, 0);
  assert.equal((await request(`${actions}/restaurants`, tokens.admin)).body.total, 1);
  const restaurant = new Restaurant({
    name: prospect.restaurantName, email: prospect.email, phone: "0101010101",
    address: { line1: prospect.address, city: prospect.city, zipCode: prospect.postalCode, country: "France" },
    owner_id: new mongoose.Types.ObjectId(),
  });
  await Document.db.transaction(async (session) => {
    await syncRestaurantEstablishment(restaurant, session);
    await restaurant.save({ session });
  });
  assert.equal((await request(`${actions}/restaurants`, tokens.admin)).body.total, 1);
  assert.equal((await request("/commercial/commissions", tokens.a)).body.commissions[0].commission.status, "PAID");
  assert.equal((await request("/commercial/commissions", tokens.b)).body.total, 0);
  const entries = (await request(`${path}/interactions?timeline=true`, tokens.a)).body.interactions;
  assert.deepEqual(entries.filter(({ type }) => type === "FOLLOW_UP").map(({ state }) => state).sort(), ["CANCELLED", "CANCELLED", "COMPLETED"]);
  for (const type of ["APPOINTMENT", "DEMO", "QUOTE_SENT", "CONTRACT_SENT", "CONTRACT_SIGNED", "ACQUIRED", "INVOICE_CREATED", "INVOICE_SENT", "INVOICE_PAID"]) {
    assert.equal(entries.filter((entry) => entry.type === type).length, 1);
  }
  assert.equal(stripeCalls.length, 0);
});

test("un résultat email ambigu bloque le renvoi automatique et exige une décision admin", async () => {
  const result = await createDocument("QUOTE", standard);
  const path = `${docsPath}/${result.body.document._id}/send`;
  try {
    emailFixture.fail = true;
    assert.equal((await request(path, tokens.a, "POST")).status, 502);
  } finally {
    emailFixture.fail = false;
  }
  assert.equal((await request(path, tokens.a, "POST")).status, 409);
  const resolution = `/admin/documents/${result.body.document._id}/resolve-delivery`;
  assert.equal((await request(resolution, tokens.a, "POST", { action: "reopen" })).status, 403);
  assert.equal((await request(resolution, tokens.admin, "POST", { action: "reopen" })).status, 200);
  assert.equal((await request(path, tokens.a, "POST")).status, 200);
});

test("la décision de livraison reste acquise après un accusé tardif du premier envoi ou d’un renvoi", async () => {
  const { body: { document } } = await createDocument("QUOTE", standard);
  const path = `${docsPath}/${document._id}`;
  const resolvePath = `/admin/documents/${document._id}/resolve-delivery`;
  for (const [operation, decision] of [["send", "reopen"], ["resend", "delivered"]]) {
    const entered = Promise.withResolvers();
    const release = Promise.withResolvers();
    emailFixture.beforeSend = () => { entered.resolve(); return release.promise; };
    const sending = request(`${path}/${operation}`, tokens.a, "POST");
    try {
      await entered.promise;
      await Document.updateOne({ _id: document._id }, { $set: { "commercialDelivery.updatedAt": new Date(Date.now() - 660000) } });
      const pending = await Document.findById(document._id).lean();
      assert.equal(pending.commercialDelivery.state, "HANDOFF");
      assert.equal((await request(resolvePath, tokens.admin, "POST", { action: decision })).status, 200);
      release.resolve();
      assert.equal((await sending).status, 409);
      const settled = await Document.findById(document._id).lean();
      if (operation === "send") {
        assert.equal(settled.status, "DRAFT");
        assert.equal(settled.deliveryHistory.at(-1).pdf.sha256, pending.pdf.sha256);
        assert.ok(files.has(pending.pdf.public_id));
      } else {
        assert.equal(settled.commercialDelivery.state, "SENT");
        assert.equal(settled.deliveryHistory.at(-1).state, "CONFIRMED");
        assert.deepEqual(settled.firstSentAt, pending.firstSentAt);
        assert.equal(settled.pdf.sha256, pending.pdf.sha256);
      }
    } finally {
      release.resolve();
      emailFixture.beforeSend = null;
      await sending;
    }
    if (operation === "send") assert.equal((await request(`${path}/send`, tokens.a, "POST")).status, 200);
  }
});

test("la facture utilise le contrat de l’acquisition si les signatures se terminent dans l’ordre inverse", async () => {
  const other = await Prospect.create({ restaurantName: "Les signatures croisées", email: "croise@fixture.invalid",
    address: "39 rue de Recette", postalCode: "75013", city: "Paris", salesOwnerId: a._id, createdBy: String(a._id) });
  await Establishment.create({ kind: "ESTABLISHMENT", prospectId: other._id, ...keysForEstablishment(other) });
  const generated = [];
  for (let index = 0; index < 2; index += 1) {
    const { body: { document } } = await request(docsPath, tokens.a, "POST", {
      type: "CONTRACT", prospectId: String(other._id), offerId: standard._id, choices: { includedModule: "reservations" },
    });
    assert.equal((await request(`${docsPath}/${document._id}/send-for-signature`, tokens.a, "POST")).status, 200);
    generated.push({ id: document._id, link: messages.at(-1).htmlContent.match(/\/signature\/([a-f0-9]{64})/)[1] });
  }
  const signature = await sharp({ create: { width: 80, height: 20, channels: 4, background: "#123456" } }).png().toBuffer();
  const sign = ({ link }) => request(`/public/contract-signatures/${link}/sign`, null, "POST", {
    accepted: true, signerName: "Signataire fictif", placeOfSignature: "Paris", signatureDataUrl: `data:image/png;base64,${signature.toString("base64")}`,
  });
  const entered = Promise.withResolvers();
  const release = Promise.withResolvers();
  fileFixture.beforeUpload = (id) => {
    if (!id.includes(generated[0].id) || !id.includes("signed")) return;
    entered.resolve();
    return release.promise;
  };
  const first = sign(generated[0]);
  try {
    await entered.promise;
    assert.equal((await sign(generated[1])).status, 200);
  } finally {
    release.resolve();
    fileFixture.beforeUpload = null;
  }
  assert.equal((await first).status, 200);
  const [early, reference] = await Promise.all(generated.map(({ id }) => Document.findById(id).lean()));
  assert.ok(early.signature.signedAt < reference.signature.signedAt);
  const sale = await Acquisition.findOne({ prospectId: other._id }).lean();
  assert.equal(String(sale.contractId), generated[1].id);
  assert.equal((await request(docsPath, tokens.a, "POST", { type: "INVOICE", sourceContractId: generated[0].id })).status, 409);
  const { body: { document: invoice } } = await request(docsPath, tokens.a, "POST", { type: "INVOICE", prospectId: String(other._id) });
  assert.equal(invoice.sourceContractId, generated[1].id);
  assert.equal(invoice.offerConditions.taxLabel, "TVA non applicable, art. 293 B du CGI.");
  assert.equal((await request(`${docsPath}/${invoice._id}/send`, tokens.a, "POST")).status, 200);
  const paid = await request(`/admin/commerciaux/documents/${invoice._id}/settlement`, tokens.admin, "POST", {
    action: "record", requestId: randomUUID(), paidOn: DateTime.now().setZone("Europe/Paris").toISODate(),
  });
  assert.equal(paid.status, 200);
  assert.equal((await Acquisition.findById(sale._id)).commission.status, "TO_PAY");
  await Acquisition.deleteOne({ _id: sale._id });
});

test("une réattribution transfère les documents et préserve leur créateur historique", async () => {
  const original = await Document.findById(contract._id).lean();
  const result = await request(`/admin/commerciaux/crm/prospects/${prospect._id}/reassign`, tokens.admin, "POST", {
    salesOwnerId: String(b._id), reason: "Transfert de recette",
  });
  assert.equal(result.status, 204);
  assert.equal((await request(`${docsPath}/${contract._id}`, tokens.a)).status, 404);
  assert.equal((await request(`${docsPath}/${contract._id}/pdf/preview`, tokens.a)).status, 404);
  assert.equal((await request(`${docsPath}/${contract._id}`, tokens.b)).status, 200);
  const historical = await Document.findById(contract._id).lean();
  assert.equal(historical.createdBy, String(a._id));
  for (const key of ["contractSnapshot", "signatureSnapshot", "contentHash", "pdf", "presentedPdf"]) {
    assert.deepEqual(historical[key], original[key]);
  }
  const signed = await request(`${docsPath}/${contract._id}/pdf/preview`, tokens.b, "GET", null, true);
  assert.equal(signed.status, 200);
  assert.equal(createHash("sha256").update(signed.body).digest("hex"), original.pdf.sha256);
});

test("plusieurs contrats, une révocation et une expiration préservent le statut et la chronologie du dossier", async () => {
  const item = await Prospect.create({
    restaurantName: "Restaurant fictif des échéances", email: "echeances@fixture.invalid",
    salesOwnerId: a._id, createdBy: String(a._id),
  });
  const path = `/commercial/prospects/${item._id}`;
  async function sendContract() {
    const { body } = await request(docsPath, tokens.a, "POST", {
      type: "CONTRACT", prospectId: String(item._id), offerId: standard._id, choices: { includedModule: "reservations" },
    });
    assert.equal((await request(`${docsPath}/${body.document._id}/send-for-signature`, tokens.a, "POST")).status, 200);
    const token = messages.at(-1).htmlContent.match(/\/signature\/([a-f0-9]{64})/)[1];
    return { ...body.document, publicPath: `/public/contract-signatures/${token}` };
  }
  const first = await sendContract();
  assert.equal((await request(`/admin/documents/${first._id}/signature-request/revoke`, tokens.admin, "POST")).status, 200);
  assert.equal((await request(first.publicPath)).body.state, "REVOKED");
  assert.equal((await request(path, tokens.a)).body.prospect.effectiveStage, "CONTRACT_SENT");
  const second = await sendContract();
  const pendingQuery = `type=CONTRACT&signature=pending&prospectId=${item._id}`;
  const pending = await request(`${docsPath}?${pendingQuery}`, tokens.a);
  assert.deepEqual(pending.body.documents.map(({ _id, signatureStatus }) => [_id, signatureStatus]), [[second._id, "PENDING"]]);
  assert.equal(pending.body.documents[0].signatureRequest, undefined);
  assert.equal((await request(`${docsPath}?${pendingQuery}`, tokens.b)).body.total, 0);
  assert.equal((await request(`/admin/commerciaux/pilotage/documents?${pendingQuery}&salesOwnerId=${b._id}`, tokens.admin)).body.total, 0);
  assert.equal((await request(`/commercial/dashboard`, tokens.a)).body.pendingContracts, 1);
  await Document.updateOne({ _id: second._id }, { $set: { "signatureRequest.expiresAt": new Date(Date.now() - 1000) } });
  assert.equal((await request(`${docsPath}?${pendingQuery}`, tokens.a)).body.total, 0);
  assert.equal((await request(`${docsPath}/${second._id}`, tokens.a)).body.document.signatureStatus, "EXPIRED");
  assert.equal((await request(`/commercial/dashboard`, tokens.a)).body.pendingContracts, 0);
  const readTimeline = async () => (await request(`${path}/interactions?timeline=true`, tokens.a)).body.interactions;
  assert.equal((await readTimeline()).filter(({ type }) => type === "LINK_EXPIRED").length, 1);
  assert.equal((await request(second.publicPath)).body.state, "EXPIRED");
  const timeline = await readTimeline();
  for (const [type, count] of [["CONTRACT_SENT", 2], ["LINK_REVOKED", 1], ["LINK_EXPIRED", 1], ["CONTRACT_SIGNED", 0]]) {
    assert.equal(timeline.filter((entry) => entry.type === type).length, count);
  }
  const refused = await sendContract();
  assert.equal((await request(path, tokens.a, "PATCH", { stage: "LOST" })).body.prospect.effectiveStage, "LOST");
  assert.equal((await request(refused.publicPath)).body.state, "REVOKED");
  assert.equal((await request(`${docsPath}/${refused._id}/signature-request/resend`, tokens.a, "POST")).status, 409);
  assert.equal((await request(`${path}/status`, tokens.a, "POST", { action: "archive", reason: "Motif confidentiel de recette" })).status, 204);
  const afterArchive = await readTimeline();
  assert.equal(afterArchive.filter(({ type }) => type === "LINK_REVOKED").length, 2);
  assert.equal(afterArchive.find(({ type }) => type === "ARCHIVED").message, "");
  assert.equal(stripeCalls.length, 0);
});

test("sans devis, la facture exige un contrat signé et un règlement corrigé conserve la commission versée", async () => {
  const prospect = await Prospect.create({
    restaurantName: "Facture directe fictive", city: "Paris", email: "facture@fixture.invalid",
    salesOwnerId: b._id, createdBy: String(b._id),
  });
  await Establishment.create({ kind: "ESTABLISHMENT", prospectId: prospect._id, ...keysForEstablishment(prospect) });
  assert.equal((await request(`/admin/commerciaux/crm/prospects/${prospect._id}/reassign`, tokens.admin, "POST", {
    salesOwnerId: String(a._id), reason: "Reprise fictive avant signature",
  })).status, 204);
  const requestFields = { prospectId: prospect._id, offerId: standard._id };
  assert.equal((await request(docsPath, tokens.a, "POST", { ...requestFields, type: "INVOICE" })).status, 409);
  assert.equal(await Acquisition.countDocuments({ prospectId: prospect._id }), 0);
  const createContract = () => request(docsPath, tokens.a, "POST", {
    ...requestFields, type: "CONTRACT", choices: { includedModule: "reservations" },
  });
  const signature = await sharp({ create: { width: 80, height: 20, channels: 4, background: "#123456" } }).png().toBuffer();
  const signedBody = {
    accepted: true, signerName: "Signataire fictif", placeOfSignature: "Paris", signatureDataUrl: `data:image/png;base64,${signature.toString("base64")}`,
  };
  for (let index = 0; index < 2; index += 1) {
    const { body } = await createContract();
    assert.equal((await request(`${docsPath}/${body.document._id}/send-for-signature`, tokens.a, "POST")).status, 200);
    const token = messages.at(-1).htmlContent.match(/\/signature\/([a-f0-9]{64})/)[1];
    assert.equal((await request(`/public/contract-signatures/${token}/sign`, null, "POST", signedBody)).status, 200);
  }
  assert.equal(await Acquisition.countDocuments({ prospectId: prospect._id }), 1);
  const sale = await Acquisition.findOne({ prospectId: prospect._id });
  assert.equal(sale.commission.status, "WAITING_CUSTOMER_PAYMENT");
  const drafted = await request(docsPath, tokens.a, "POST", { ...requestFields, type: "INVOICE" });
  assert.equal(drafted.status, 201);
  const invoice = drafted.body.document;
  assert.equal(invoice.sourceQuoteId, undefined);
  assert.equal(invoice.sourceContractId, String(sale.contractId));
  assert.equal((await request(`${docsPath}/${invoice._id}/send`, tokens.a, "POST")).status, 200);
  const settlement = `/admin/commerciaux/documents/${invoice._id}/settlement`;
  const paidOn = DateTime.now().setZone("Europe/Paris").toISODate();
  const earlier = DateTime.fromISO(paidOn).minus({ days: 1 }).toISODate();
  assert.equal((await request(settlement, tokens.admin, "POST", { action: "record", paidOn: earlier, requestId: randomUUID() })).status, 409);
  const advance = { action: "record-advance", paidOn: earlier, requestId: randomUUID(), reason: "Virement fictif vérifié" };
  assert.equal((await request(settlement, tokens.a, "POST", advance)).status, 403);
  assert.equal((await request(settlement, tokens.admin, "POST", { ...advance, reason: "" })).status, 400);
  assert.equal((await request(settlement, tokens.admin, "POST", { ...advance, paidOn })).status, 409);
  assert.equal((await request(settlement, tokens.admin, "POST", advance)).body.document.setupInvoice.advanceReason, advance.reason);
  assert.equal((await request(settlement, tokens.admin, "POST", {
    action: "reverse", requestId: advance.requestId, reason: "Remplacement en recette",
  })).body.document.setupInvoice.paymentCorrections[0].advanceReason, advance.reason);
  const collected = await request(settlement, tokens.admin, "POST", { action: "record", paidOn, requestId: randomUUID() });
  assert.equal(collected.status, 200);
  const commissionPath = `/admin/commerciaux/pilotage/commissions/${sale._id}/status`;
  assert.equal(String(sale.beneficiaryId), String(a._id));
  assert.ok(sale.activity.some(({ action }) => action === "ASSIGNMENT_REVIEW"));
  assert.equal((await request(commissionPath, tokens.admin, "POST", { action: "pay", paidOn })).status, 409);
  assert.equal((await request(commissionPath, tokens.admin, "POST", {
    action: "reconcile", note: "Attribution arbitrée en recette", beneficiaryId: String(b._id),
  })).status, 200);
  const payout = await request(commissionPath, tokens.admin, "POST", { action: "pay", paidOn });
  assert.equal(payout.status, 200);
  assert.equal((await request(settlement, tokens.admin, "POST", { action: "cancel", reason: "Facture à corriger" })).status, 409);
  assert.equal((await request(settlement, tokens.admin, "POST", {
    action: "reverse", requestId: collected.body.document.setupInvoice.paymentRequestId, reason: "Encaissement rectifié",
  })).status, 200);
  assert.equal((await request(settlement, tokens.admin, "POST", { action: "cancel", reason: "Facture remplacée" })).status, 200);
  const paid = await Acquisition.findById(sale._id);
  assert.equal(paid.commission.status, "PAID");
  assert.ok(paid.commission.paidAt);
  assert.equal(paid.activity.filter(({ action }) => action === "CUSTOMER_PAYMENT_REVERSED").length, 2);
  assert.ok(paid.commission.reconciliationRequiredAt);
  assert.equal(paid.commission.reconciledAt, undefined);
  assert.equal((await request(`/admin/commerciaux/pilotage/commissions/${sale._id}/status`, tokens.admin, "POST", {
    action: "reconcile", note: "Arbitrage fictif documenté",
  })).status, 200);
  assert.ok((await Acquisition.findById(sale._id)).commission.reconciledAt);
  const replacement = await request(docsPath, tokens.a, "POST", { ...requestFields, type: "INVOICE" });
  assert.equal(replacement.status, 201);
  assert.notEqual(replacement.body.document._id, invoice._id);
  assert.equal(await Acquisition.countDocuments({ prospectId: prospect._id }), 1);
  assert.equal(stripeCalls.length, 0);
});

test("la conversion et le rapprochement concurrents préservent une seule facture et une seule commission", async () => {
  const restaurant = await Prospect.create({
    restaurantName: "Encaissement simultané fictif", address: "18 rue des Transactions", postalCode: "75001",
    city: "Paris", email: "encaissement@fixture.invalid",
    salesOwnerId: a._id, createdBy: String(a._id),
  });
  await Establishment.create({ kind: "ESTABLISHMENT", prospectId: restaurant._id, ...keysForEstablishment(restaurant) });
  const draft = { prospectId: restaurant._id, offerId: standard._id };
  const { body: { document: quote } } = await request(docsPath, tokens.a, "POST", {
    ...draft, type: "QUOTE", choices: { includedModule: "reservations" },
  });
  assert.equal((await request(docsPath, tokens.a, "POST", { type: "INVOICE", sourceQuoteId: quote._id })).status, 409);
  const { body: { document: agreement } } = await request(docsPath, tokens.a, "POST", { sourceQuoteId: quote._id, type: "CONTRACT" });
  assert.equal((await request(`${docsPath}/${agreement._id}/send-for-signature`, tokens.a, "POST")).status, 200);
  const token = messages.at(-1).htmlContent.match(/\/signature\/([a-f0-9]{64})/)[1];
  const signature = await sharp({ create: { width: 80, height: 20, channels: 4, background: "#123456" } }).png().toBuffer();
  const signed = await request(`/public/contract-signatures/${token}/sign`, null, "POST", {
      accepted: true, signerName: "Signataire fictif", placeOfSignature: "Paris",
      signatureDataUrl: `data:image/png;base64,${signature.toString("base64")}`,
    });
  assert.equal(signed.status, 200);
  const drafts = await Promise.all([quote._id, agreement._id].map((id, index) =>
    request(docsPath, tokens.a, "POST", { type: "INVOICE", [index === 0 ? "sourceQuoteId" : "sourceContractId"]: id })));
  assert.deepEqual(drafts.map(({ status }) => status).sort(), [200, 201]);
  const invoice = drafts[0].body.document;
  assert.equal(invoice._id, drafts[1].body.document._id);
  assert.equal((await request(`/admin/documents/${quote._id}`, tokens.admin, "DELETE")).status, 409);
  assert.equal((await request(`${docsPath}/${invoice._id}/send`, tokens.a, "POST")).status, 200);
  const payment = { action: "record", paidOn: DateTime.now().setZone("Europe/Paris").toISODate(), requestId: randomUUID() };
  const payments = await Promise.all([1, 2].map(() =>
    request(`/admin/commerciaux/documents/${invoice._id}/settlement`, tokens.admin, "POST", payment)));
  assert.deepEqual(payments.map(({ status }) => status), [200, 200]);
  const sales = await Acquisition.find({ prospectId: restaurant._id });
  assert.equal(sales.length, 1);
  assert.equal(sales[0].commission.status, "TO_PAY");
  assert.equal(String(sales[0].commission.paymentInvoiceId), invoice._id);
});
