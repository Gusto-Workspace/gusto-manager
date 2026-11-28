const { mongoUri, files, stripeCalls, fileFixture } = require("./isolated-environment.cjs");
const { before, after, test } = require("node:test");
const assert = require("node:assert/strict");
const { randomUUID } = require("node:crypto");
const express = require("express");
const mongoose = require("mongoose");
const { DateTime } = require("luxon");
const Admin = require("../../models/admin.model");
const Account = require("../../models/commercial-account.model");
const Acquisition = require("../../models/commercial-acquisition.model");
const Establishment = require("../../models/commercial-establishment.model");
const Restaurant = require("../../models/restaurant.model");
const { recordCommercialSignature } = require("../../services/commercial/sales.service");
const Document = require("../../models/document.model");
const { CommercialProspect: Prospect, CommercialInteraction: Interaction } = require("../../models/commercial-prospect.model");
const { signAdminToken } = require("../../middleware/authenticate-admin");
const { signCommercialToken } = require("../../middleware/authenticate-commercial");

const admin = "/admin/commerciaux/pilotage";
const today = DateTime.now().setZone("Europe/Paris").toISODate();
let server;
let base;
let tokens;
let alice;
let benoit;
let prospect;
let contract;
let acquisition;

async function request(path, token, method = "GET", body) {
  const multipart = body instanceof FormData;
  const response = await fetch(`${base}${path}`, {
    method, headers: { Authorization: `Bearer ${token}`, ...(body && !multipart && { "Content-Type": "application/json" }) },
    ...(body && { body: multipart ? body : JSON.stringify(body) }),
  });
  const contentType = response.headers.get("content-type") || "";
  return { status: response.status, body: contentType.includes("application/json") ? await response.json() : await response.text() };
}

before(async () => {
  await mongoose.connect(mongoUri, { dbName: `gusto_commercial_sales_${new mongoose.Types.ObjectId()}`, serverSelectionTimeoutMS: 5000 });
  await Acquisition.init();
  const account = await Admin.create({ role: "admin", email: "admin@fixture.invalid" });
  const superAdmin = await Admin.create({ role: "super-admin", email: "super-admin@fixture.invalid" });
  [alice, benoit] = await Account.create([
    { firstName: "Alice", lastName: "Recette", email: "a@fixture.invalid", status: "ACTIVE" },
    { firstName: "Benoît", lastName: "Recette", email: "b@fixture.invalid", status: "ACTIVE" },
  ]);
  tokens = { admin: signAdminToken(account), superAdmin: signAdminToken(superAdmin), alice: signCommercialToken(alice), benoit: signCommercialToken(benoit) };
  [prospect] = await Prospect.create([
    { restaurantName: "Le Verger", salesOwnerId: alice._id, createdBy: String(alice._id) },
    { restaurantName: "Le Jardin secret B", salesOwnerId: benoit._id, createdBy: String(benoit._id) },
  ]);
  await Establishment.create({ kind: "ESTABLISHMENT", prospectId: prospect._id });
  contract = await Document.create({
    type: "CONTRACT", docNumber: "TEST-C-1", status: "SIGNED", salesOwnerId: alice._id, prospectId: prospect._id,
    signature: { signedAt: new Date() }, party: { restaurantName: "Le Verger", email: "contact@fixture.invalid" },
    offerConditions: { setupCents: 25000 },
  });
  await Document.create({
    type: "QUOTE", docNumber: "TEST-D-1", status: "SENT", salesOwnerId: alice._id, prospectId: prospect._id,
    firstSentAt: new Date(), sentAt: new Date(), party: { restaurantName: "Le Verger", email: "contact@fixture.invalid" },
  });
  await Interaction.create({ actorId: String(alice._id), salesOwnerId: alice._id, prospectId: prospect._id, type: "DEMO", occurredAt: new Date() });
  const app = express();
  app.use(express.json());
  app.use("/api", require("../../routes/commercial-accounts.routes"));
  app.use("/api", require("../../routes/commercial-documents.routes"));
  app.use("/api", require("../../routes/commercial-pilotage.routes"));
  app.use("/api", require("../../routes/commercial-prospects.routes"));
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

test("la signature fige la commission une seule fois, même lorsqu’elle est traitée simultanément", async () => {
  assert.equal((await request("/commercial/commissions", tokens.alice)).body.total, 0);
  await Promise.all([contract, contract].map((document) =>
    mongoose.connection.transaction((session) => recordCommercialSignature(document, session))));
  assert.equal(await Acquisition.countDocuments(), 1);
  acquisition = await Acquisition.findOne();
  assert.equal(acquisition.commission.status, "WAITING_CUSTOMER_PAYMENT");
  assert.equal(acquisition.commission.amountCents, 40000);
  await Account.updateOne({ _id: alice._id }, { commissionCents: 55000 });
  assert.equal((await Acquisition.findById(acquisition._id)).commission.amountCents, 40000);
  assert.deepEqual((await Prospect.findById(prospect._id)).milestones.acquiredAt, contract.signature.signedAt);
});

test("le règlement intégral est unique, traçable et réversible avant le virement de la commission", async () => {
  const path = `${admin}/commissions/${acquisition._id}/status`;
  const invoice = await Document.create({
    type: "INVOICE", docNumber: "TEST-F-1", status: "SENT", salesOwnerId: alice._id, prospectId: prospect._id,
    party: contract.party, offerConditions: { setupCents: 25000 }, setupInvoice: { establishmentId: acquisition.establishmentId },
  });
  const settlement = `/admin/commerciaux/documents/${invoice._id}/settlement`;
  const payment = { action: "record", paidOn: today, reference: "Virement client", requestId: randomUUID() };
  assert.equal((await request(settlement, tokens.alice, "POST", payment)).status, 403);
  assert.equal((await request(`${settlement}?salesOwnerId=${benoit._id}`, tokens.admin, "POST", payment)).status, 404);
  assert.equal((await request(settlement, tokens.admin, "POST", { ...payment, amountCents: 10000 })).status, 400);
  assert.equal((await request(settlement, tokens.admin, "POST", { ...payment, paidOn: "2099-01-01" })).status, 400);
  assert.equal((await request(path, tokens.admin, "POST", { action: "pay", paidOn: today })).status, 409);
  assert.equal((await request(path, tokens.alice, "POST", { action: "pay", paidOn: today })).status, 403);
  const repetitions = await Promise.all([1, 2].map(() => request(settlement, tokens.admin, "POST", payment)));
  assert.ok(repetitions.every(({ status }) => status === 200));
  const { setupInvoice } = await Document.findById(invoice._id).lean();
  assert.equal(setupInvoice.paymentRequestId, payment.requestId);
  assert.equal(setupInvoice.paymentReference, payment.reference);
  assert.ok(setupInvoice.paidAt);
  assert.ok(setupInvoice.paidBy);
  assert.equal(setupInvoice.receivedCents, undefined);
  assert.equal(setupInvoice.receipts, undefined);
  assert.equal((await request(settlement, tokens.admin, "POST", { ...payment, requestId: randomUUID() })).status, 409);
  assert.equal((await Acquisition.findById(acquisition._id)).commission.status, "TO_PAY");
  const correction = { action: "reverse", requestId: payment.requestId, reason: "Encaissement en double" };
  assert.equal((await request(settlement, tokens.admin, "POST", { ...correction, requestId: randomUUID() })).status, 409);
  assert.equal((await request(settlement, tokens.admin, "POST", correction)).status, 200);
  const corrected = (await Document.findById(invoice._id).lean()).setupInvoice;
  assert.equal(corrected.paidAt, undefined);
  assert.equal(corrected.paymentRequestId, undefined);
  assert.deepEqual(corrected.paymentCorrections, [{
    requestId: payment.requestId, paidAt: setupInvoice.paidAt, paidBy: setupInvoice.paidBy, reference: payment.reference,
    correctedAt: corrected.paymentCorrections[0].correctedAt, correctedBy: setupInvoice.paidBy, reason: correction.reason,
  }]);
  assert.ok(corrected.paymentCorrections[0].correctedAt instanceof Date);
  assert.equal((await Acquisition.findById(acquisition._id)).commission.status, "WAITING_CUSTOMER_PAYMENT");
  assert.equal((await request(settlement, tokens.admin, "POST", payment)).status, 409);
  assert.equal((await request(settlement, tokens.admin, "POST", { ...payment, requestId: payment.requestId.toUpperCase() })).status, 409);
  const nextPayments = await Promise.all([1, 2].map(() =>
    request(settlement, tokens.admin, "POST", { action: "record", paidOn: today, requestId: randomUUID() })));
  assert.deepEqual(nextPayments.map(({ status }) => status).sort(), [200, 409]);
  assert.equal((await request(settlement, tokens.admin, "POST", correction)).status, 409);
  const paid = await Promise.all([1, 2].map(() => request(path, tokens.admin, "POST", { action: "pay", paidOn: today, reference: "REGL-RECETTE" })));
  assert.deepEqual(paid.map((result) => result.status).sort(), [200, 409]);
  assert.equal((await request(path, tokens.admin, "POST", { action: "contest", note: "Contestation fictive" })).status, 200);
  assert.equal((await request(path, tokens.admin, "POST", { action: "restore", note: "Accord de recette" })).status, 200);
  const row = await Acquisition.findById(acquisition._id);
  assert.equal(row.commission.status, "PAID");
  assert.ok(row.commission.paidBy);
  assert.equal(row.commission.paymentReference, "REGL-RECETTE");
  assert.ok(row.commission.paidAt);
  assert.equal(row.activity.filter((event) => event.action === "PAY").length, 1);
  assert.equal(stripeCalls.length, 0);
});

test("justificatif privé, montant et bénéficiaire historiques après réattribution", async () => {
  const path = `${admin}/commissions/${acquisition._id}/proof`;
  const invalid = new FormData();
  invalid.set("proof", new Blob(["format fictif invalide"], { type: "application/pdf" }), "preuve.pdf");
  assert.equal((await request(path, tokens.admin, "POST", invalid)).status, 400);
  const proof = new FormData();
  proof.set("proof", new Blob(["%PDF-fixture de recette"], { type: "application/pdf" }), "preuve.pdf");
  assert.equal((await request(path, tokens.alice, "POST", proof)).status, 403);
  assert.equal((await request(path, tokens.admin, "POST", proof)).status, 204);
  assert.equal((await request(path, tokens.admin)).status, 200);
  assert.equal((await request(path, tokens.alice)).status, 403);
  assert.equal([...files.values()].at(-1).type, "authenticated");
  await Account.updateOne({ _id: alice._id }, { $set: { commissionCents: 50000 } });
  await Prospect.updateOne({ _id: prospect._id }, { $set: { salesOwnerId: benoit._id } });
  const own = await request("/commercial/commissions", tokens.alice);
  assert.equal(own.body.total, 1);
  assert.equal(own.body.commissions[0].commission.amountCents, 40000);
  assert.equal(own.body.commissions[0].restaurantId, undefined);
  assert.equal(own.body.commissions[0].activity, undefined);
  assert.equal(own.body.commissions[0].commission.paymentReference, undefined);
  assert.equal((await request("/commercial/commissions", tokens.benoit)).body.total, 0);
  const aliceSummary = (await request(`/commercial/commissions?summary=true&status=TO_PAY&salesOwnerId=${benoit._id}`, tokens.alice)).body;
  assert.equal(aliceSummary.total, 0);
  assert.deepEqual(aliceSummary.summary, { PAID: { count: 1, amountCents: 40000 } });
  assert.deepEqual((await request(`${admin}/commissions?summary=true&salesOwnerId=${benoit._id}`, tokens.admin)).body.summary, {});
  assert.deepEqual((await request("/commercial/commissions?summary=true", tokens.benoit)).body.summary, {});
});

test("les indicateurs utilisent les dates et le périmètre de l’acteur avant agrégation", async () => {
  const global = (await request(`${admin}/dashboard?from=${today}&to=${today}`, tokens.admin)).body;
  assert.equal(global.commercials, 2);
  assert.equal(global.conversion.cohort, 2);
  assert.equal(global.demos, 1);
  assert.equal(global.quotesSent, 1);
  assert.equal(global.activity[0].contracts, 1);
  assert.equal(global.acquired, 1);
  assert.equal(global.paid.amountCents, 40000);
  assert.equal(global.conversion.rate, 0.5);
  assert.equal(global.totalProspects, 2);
  const a = (await request(`/commercial/dashboard?from=${today}&to=${today}`, tokens.alice)).body;
  assert.equal(a.commercials, undefined);
  assert.equal(a.conversion.cohort, 0);
  assert.equal(a.acquired, 1);
  assert.equal(a.paid.amountCents, 40000);
  assert.equal(a.recentProspects.length, 0);
  assert.equal(a.totalProspects, 0);
  const b = (await request(`/commercial/dashboard?from=${today}&to=${today}`, tokens.benoit)).body;
  assert.equal(b.demos, 0);
  assert.equal(b.acquired, 0);
  assert.equal(b.paid.amountCents, 0);
});

test("les fiches administratives regroupent uniquement les statuts et actions du commercial sélectionné", async () => {
  const inOneHour = new Date(Date.now() + 3_600_000);
  const futureFollowUp = new Date(Date.now() + 172_800_000);
  const aliceProspect = await Prospect.create({ restaurantName: "Relance Alice", stage: "CONTACTED", nextFollowUpAt: futureFollowUp,
    nextAppointmentAt: inOneHour, salesOwnerId: alice._id, createdBy: String(alice._id) });
  const aliceView = await request(`${admin}/dashboard?salesOwnerId=${alice._id}`, tokens.admin);
  assert.equal(aliceView.status, 200);
  assert.deepEqual(aliceView.body.prospectsByStage, { CONTACTED: 1 });
  assert.equal(aliceView.body.totalProspects, 1);
  assert.equal(aliceView.body.nextActions.appointments[0]._id, String(aliceProspect._id));
  assert.equal(aliceView.body.nextActions.followUps[0]._id, String(aliceProspect._id));
  assert.equal(aliceView.body.paid.amountCents, 40000);
  const benoitView = await request(`${admin}/dashboard?salesOwnerId=${benoit._id}`, tokens.admin);
  assert.deepEqual(benoitView.body.prospectsByStage, { TO_CONTACT: 1, ACQUIRED: 1 });
  assert.deepEqual(benoitView.body.nextActions, { appointments: [], followUps: [], overdue: [], dueToday: [], expiredContracts: [] });
  assert.doesNotMatch(JSON.stringify(benoitView.body), /Relance Alice/);
  assert.equal(benoitView.body.paid.amountCents, 0);
  const aliceDocs = await request(`${admin}/documents?salesOwnerId=${alice._id}&type=QUOTE`, tokens.admin);
  assert.deepEqual(aliceDocs.body.documents.map(({ docNumber }) => docNumber), ["TEST-D-1"]);
  const benoitDocs = await request(`${admin}/documents?salesOwnerId=${benoit._id}&type=QUOTE`, tokens.admin);
  assert.deepEqual(benoitDocs.body.documents, []);
  const globalList = await request("/admin/commerciaux?performance=month", tokens.admin);
  const listed = new Map(globalList.body.accounts.map((item) => [item._id, item.performance]));
  assert.deepEqual(listed.get(String(alice._id)), { prospects: 1, quotesSent: 1, acquired: 1 });
  assert.deepEqual(listed.get(String(benoit._id)), { prospects: 2, quotesSent: 0, acquired: 0 });
  assert.equal((await request("/admin/commerciaux?performance=month", tokens.alice)).status, 403);
});

test("une annulation préserve la trace du règlement et masque la création du restaurant", async () => {
  const sale = await Acquisition.findById(acquisition._id);
  assert.equal((await request(`${admin}/commissions/${sale._id}/status`, tokens.admin, "POST", {
    action: "cancel", note: "Annulation de contrôle",
  })).status, 200);
  const cancelled = await Acquisition.findById(sale._id);
  assert.equal(cancelled.commission.status, "CANCELLED");
  assert.deepEqual(cancelled.commission.paidAt, sale.commission.paidAt);
  assert.equal(cancelled.commission.paymentReference, "REGL-RECETTE");
  assert.equal((await request(`${admin}/actions/restaurants`, tokens.admin)).body.total, 0);
});

test("un restaurant déjà client ne génère pas de commission et la fin de création se confirme séparément", async () => {
  const olderRestaurant = await Restaurant.create({
    name: "Client historique fictif", email: "historique@fixture.invalid", phone: "0101010101",
    address: { line1: "1 rue de Test", city: "Paris", zipCode: "75001", country: "France" },
    owner_id: new mongoose.Types.ObjectId(),
  });
  const existing = await Prospect.create({ restaurantName: olderRestaurant.name, address: olderRestaurant.address.line1,
    postalCode: olderRestaurant.address.zipCode, city: olderRestaurant.address.city,
    salesOwnerId: alice._id, createdBy: String(alice._id) });
  await Establishment.create({ kind: "ESTABLISHMENT", prospectId: existing._id, restaurants: [olderRestaurant._id] });
  const renewal = { ...contract.toObject(), _id: new mongoose.Types.ObjectId(), prospectId: existing._id };
  await mongoose.connection.transaction((session) => recordCommercialSignature(renewal, session));
  assert.equal(await Acquisition.countDocuments({ prospectId: existing._id }), 0);
  assert.ok((await Prospect.findById(existing._id)).milestones.contractSignedAt);

  const fresh = await Prospect.create({ restaurantName: "Création à confirmer", address: "2 rue de Test", postalCode: "75001", city: "Paris", notes: "Note temporaire fictive",
    salesOwnerId: alice._id, createdBy: String(alice._id) });
  await Account.updateOne({ _id: alice._id }, { commissionCents: 55000 });
  await Establishment.create({ kind: "ESTABLISHMENT", prospectId: fresh._id });
  const signed = { ...contract.toObject(), _id: new mongoose.Types.ObjectId(), prospectId: fresh._id,
    offerConditions: { setupCents: 25000, selections: { includedModule: "reservations" } },
  };
  await mongoose.connection.transaction((session) => recordCommercialSignature(signed, session));
  const sale = await Acquisition.findOne({ prospectId: fresh._id });
  assert.equal(sale.commission.amountCents, 40000);
  assert.equal((await request(`${admin}/actions/restaurants`, tokens.admin)).body.total, 1);
  const complete = `${admin}/restaurants/${sale._id}/complete`;
  assert.equal((await request(complete, tokens.alice, "POST")).status, 403);
  assert.equal((await request(complete, tokens.admin, "POST")).status, 409);
  const integration = `/commercial/prospects/${fresh._id}/integration`;
  const review = `/admin/commerciaux/crm/prospects/${fresh._id}/integration`;
  const signedRecord = await Document.create({
    ...signed, _id: signed._id, docNumber: "TEST-C-INTEGRATION", status: "SIGNED",
  });
  assert.ok(signedRecord);
  assert.equal((await request(integration, tokens.benoit)).status, 404);
  const access = "Accès de test fictif 24";
  assert.equal((await request(`${integration}/access/skello/save`, tokens.alice, "POST", { access })).status, 404);
  assert.equal((await request(`${integration}/access/zenchef/save`, tokens.alice, "POST", { access })).status, 204);
  assert.equal((await request(`${integration}/access/zenchef/reveal`, tokens.benoit, "POST")).status, 404);
  const privateSale = await Acquisition.findById(sale._id).select("+migrationAccess").lean();
  assert.match(privateSale.migrationAccess.zenchef, /^v1\./);
  assert.doesNotMatch(JSON.stringify(privateSale), /Accès de test/);
  assert.equal((await request(`${review}/access/zenchef/reveal`, tokens.admin, "POST")).body.access, access);
  assert.doesNotMatch(JSON.stringify((await request(integration, tokens.alice)).body), /Accès de test|v1\./);
  assert.equal((await request(`${review}/access/zenchef/remove`, tokens.admin, "POST")).status, 204);
  assert.equal((await request(`${review}/access/zenchef/reveal`, tokens.admin, "POST")).status, 404);
  assert.equal((await request(`${integration}/access/zenchef/save`, tokens.alice, "POST", { access })).status, 204);
  assert.equal((await request(`${review}/review`, tokens.admin, "POST")).status, 409);
  for (const category of ["SITE", "RIB"]) {
    const file = new FormData();
    file.set("file", new Blob(["%PDF-fixture"], { type: "application/pdf" }), "recette.pdf");
    assert.equal((await request(`${integration}/files/${category}`, tokens.alice, "POST", file)).status, 204);
  }
  const { body: docket } = await request(integration, tokens.alice);
  assert.equal(docket.files.length, 2);
  assert.equal(docket.files[0].storage, undefined);
  assert.equal((await request(`${integration}/files/${docket.files[0]._id}`, tokens.benoit)).status, 404);
  assert.equal((await request(`${review}/files/${docket.files[0]._id}`, tokens.admin)).status, 200);
  assert.equal((await request(`${review}/review`, tokens.admin, "POST")).status, 204);
  const restaurant = await Restaurant.create({
    name: fresh.restaurantName, address: { line1: "99 rue de Test", city: "Paris", zipCode: "75001", country: "France" },
    email: "creation@fixture.invalid", phone: "0101010101",
    owner_id: new mongoose.Types.ObjectId(),
  });
  await Establishment.updateOne({ _id: sale.establishmentId }, { $addToSet: { restaurants: restaurant._id } });
  assert.equal((await request(complete, tokens.admin, "POST")).status, 409);
  const invoice = await Document.create({
    type: "INVOICE", docNumber: "TEST-PAID-INTEGRATION", status: "SENT", salesOwnerId: alice._id,
    party: { restaurantName: fresh.restaurantName, email: "integration@fixture.invalid" },
    prospectId: fresh._id, sourceContractId: sale.contractId, offerConditions: { setupCents: 25000 },
    setupInvoice: { establishmentId: sale.establishmentId, active: true },
  });
  assert.equal((await request(`/admin/commerciaux/documents/${invoice._id}/settlement`, tokens.admin, "POST", {
    action: "record", paidOn: today, requestId: randomUUID(),
  })).status, 200);
  assert.equal((await request(complete, tokens.admin, "POST")).status, 409);
  assert.equal((await request(`${admin}/actions/restaurants`, tokens.admin)).body.rows[0].restaurantId, null);
  await Restaurant.updateOne({ _id: restaurant._id }, { $set: { "address.line1": fresh.address } });
  assert.equal((await request(`${admin}/actions/restaurants`, tokens.admin)).body.rows[0].restaurantId, String(restaurant._id));
  const rib = docket.files.find(({ category }) => category === "RIB");
  const removePath = `${review}/files/${rib._id}`;
  const entered = Promise.withResolvers();
  const release = Promise.withResolvers();
  fileFixture.beforeDestroy = () => { entered.resolve(); return release.promise; };
  const removal = request(removePath, tokens.admin, "DELETE");
  try {
    await entered.promise;
    assert.equal((await request(complete, tokens.admin, "POST")).status, 409);
    assert.equal((await request(`${review}/review`, tokens.admin, "POST")).status, 409);
    assert.equal((await request(`${integration}/files/${rib._id}`, tokens.alice)).status, 404);
    release.resolve("denied");
    assert.equal((await removal).status, 502);
  } finally {
    release.resolve("denied");
    fileFixture.beforeDestroy = null;
    await removal;
  }
  assert.equal((await request(removePath, tokens.admin, "DELETE")).status, 204);
  const replacement = new FormData();
  replacement.set("file", new Blob([Buffer.from("%PDF-1.4\nTest")], { type: "application/pdf" }), "rib-fictif.pdf");
  assert.equal((await request(`${integration}/files/RIB`, tokens.alice, "POST", replacement)).status, 204);
  assert.equal((await request(`${review}/review`, tokens.admin, "POST")).status, 204);
  assert.equal((await request(complete, tokens.admin, "POST")).status, 204);
  assert.equal((await request(`${admin}/actions/restaurants`, tokens.admin)).body.total, 0);
  assert.equal(String((await Acquisition.findById(sale._id)).restaurantId), String(restaurant._id));
  assert.equal((await Prospect.findById(fresh._id)).archivedAt, undefined);
  assert.equal((await request(`${admin}/commissions/${sale._id}/status`, tokens.admin, "POST", { action: "pay", paidOn: today })).status, 200);
  const archived = await Prospect.findById(fresh._id).lean();
  assert.equal(DateTime.fromJSDate(archived.archivePurgeAt, { zone: "Europe/Paris" }).diff(DateTime.fromJSDate(archived.archivedAt, { zone: "Europe/Paris" }), "days").days, 30);
  const prospectPath = "/commercial/prospects";
  assert.ok(!(await request(prospectPath, tokens.alice)).body.prospects.some(({ _id }) => _id === String(fresh._id)));
  assert.ok((await request(`${prospectPath}?archived=true`, tokens.alice)).body.prospects.some(({ _id }) => _id === String(fresh._id)));
  assert.equal((await request(`${prospectPath}/${fresh._id}`, tokens.benoit)).status, 404);
  assert.equal((await request(`${prospectPath}/${fresh._id}/status`, tokens.alice, "POST", { action: "restore" })).status, 409);
  const beforePurge = (await request("/commercial/dashboard", tokens.alice)).body;
  const purge = `${review}/purge`;
  assert.equal((await request(purge, tokens.superAdmin)).status, 409);
  await Prospect.updateOne({ _id: fresh._id }, { archivePurgeAt: new Date(0) });
  assert.equal((await request(`${review}/access/zenchef/reveal`, tokens.admin, "POST")).status, 404);
  assert.equal((await request(purge, tokens.admin)).status, 403);
  const preview = await request(purge, tokens.superAdmin);
  assert.equal(preview.body.files, 2);
  assert.equal(preview.body.migrationAccess, 1);
  assert.equal((await request(purge, tokens.superAdmin, "POST", { confirmation: "PURGER" })).status, 409);
  process.env.COMMERCIAL_OPERATIONAL_PURGE_ENABLED = "1";
  try {
    assert.equal((await request(purge, tokens.superAdmin, "POST", { confirmation: "PURGER" })).status, 204);
  } finally {
    delete process.env.COMMERCIAL_OPERATIONAL_PURGE_ENABLED;
  }
  const purged = await Prospect.findById(fresh._id).lean();
  assert.ok(purged.operationsPurgedAt);
  assert.equal(purged.notes, undefined);
  const retained = await Acquisition.findById(sale._id).select("+integrationFiles +migrationAccess").lean();
  assert.equal(retained.integrationFiles.length, 0);
  assert.equal(retained.migrationAccess, undefined);
  assert.ok(retained.commission.paidAt);
  assert.ok(await Document.exists({ _id: invoice._id }));
  assert.ok(await Document.exists({ _id: sale.contractId, status: "SIGNED" }));
  const afterPurge = (await request("/commercial/dashboard", tokens.alice)).body;
  assert.deepEqual(afterPurge.paid, beforePurge.paid);
  assert.equal(afterPurge.acquired, beforePurge.acquired);
});

test("les quatre cartes distinguent le portefeuille actuel et les événements de la période", async () => {
  const seller = await Account.create({
    firstName: "Camille", lastName: "Indicateurs", email: "indicateurs@fixture.invalid", status: "ACTIVE",
  });
  const token = signCommercialToken(seller);
  const owner = { salesOwnerId: seller._id, createdBy: String(seller._id) };
  const now = DateTime.now().setZone("Europe/Paris");
  const earlier = now.minus({ days: 8 }).startOf("day");
  const future = now.plus({ days: 8 });
  const [active, archived, acquiredProspect, cancelledProspect] = await Prospect.create([
    { ...owner, restaurantName: "Prospect en cours", nextAppointmentAt: future.toJSDate() },
    { ...owner, restaurantName: "Prospect archivé", archivedAt: now.toJSDate() },
    { ...owner, restaurantName: "Restaurant acquis" },
    { ...owner, restaurantName: "Vente annulée" },
    { ...owner, restaurantName: "Prospect perdu", stage: "LOST" },
    { ...owner, restaurantName: "Prospect non intéressé", stage: "NOT_INTERESTED" },
    { ...owner, restaurantName: "Prospect opposé", opposedAt: now.toJSDate() },
  ]);

  const scheduled = { ...owner, actorId: owner.createdBy, prospectId: active._id, type: "APPOINTMENT", state: "SCHEDULED" };
  await Interaction.create([
    ...Array.from({ length: 6 }, (_, day) => ({ ...scheduled, startsAt: future.plus({ days: day + 1 }).toJSDate() })),
    { ...scheduled, startsAt: now.startOf("day").toJSDate(), allDay: true },
    { ...scheduled, startsAt: earlier.toJSDate() },
    { ...scheduled, startsAt: future.toJSDate(), state: "CANCELLED" },
    { ...scheduled, startsAt: future.toJSDate(), state: "COMPLETED", occurredAt: now.toJSDate() },
    { ...scheduled, startsAt: future.toJSDate(), prospectId: archived._id },
    { ...scheduled, startsAt: future.toJSDate(), type: "DEMO" },
    { ...scheduled, startsAt: future.toJSDate(), type: "FOLLOW_UP" },
  ]);

  const party = { restaurantName: active.restaurantName, email: "restaurant@fixture.invalid" };
  await Document.create([
    { ...owner, party, type: "QUOTE", docNumber: "STATS-D-1", status: "SENT", firstSentAt: earlier.toJSDate(), sentAt: now.toJSDate() },
    { ...owner, party, type: "QUOTE", docNumber: "STATS-D-2", status: "SENT", firstSentAt: now.toJSDate(), sentAt: now.toJSDate() },
    { ...owner, party, type: "QUOTE", docNumber: "STATS-D-3", status: "DRAFT", firstSentAt: now.toJSDate() },
  ]);

  await Establishment.create([acquiredProspect, cancelledProspect].map(({ _id }) => ({ kind: "ESTABLISHMENT", prospectId: _id })));
  for (const [index, signedProspect] of [acquiredProspect, acquiredProspect, cancelledProspect].entries()) {
    const signed = await Document.create({
      ...owner, type: "CONTRACT", status: "SIGNED", contractKind: "INITIAL", docNumber: `STATS-C-${index + 1}`,
      prospectId: signedProspect._id, party: { ...party, restaurantName: signedProspect.restaurantName },
      signature: { signedAt: now.toJSDate() }, offerConditions: { setupCents: 25000 },
    });
    await mongoose.connection.transaction((session) => recordCommercialSignature(signed, session));
  }
  const openSale = await Acquisition.findOne({ prospectId: acquiredProspect._id });
  const cancelled = await Acquisition.findOne({ prospectId: cancelledProspect._id });
  assert.equal(openSale.commission.status, "WAITING_CUSTOMER_PAYMENT");
  assert.equal((await request(`${admin}/commissions/${cancelled._id}/status`, tokens.admin, "POST", {
    action: "cancel", note: "Cas de recette",
  })).status, 200);

  const currentPeriod = `from=${now.toISODate()}&to=${now.toISODate()}`;
  const earlierPeriod = `from=${earlier.toISODate()}&to=${earlier.toISODate()}`;
  const [sellerView, adminView, pastView] = await Promise.all([
    request(`/commercial/dashboard?${currentPeriod}`, token),
    request(`${admin}/dashboard?salesOwnerId=${seller._id}&${currentPeriod}`, tokens.admin),
    request(`/commercial/dashboard?${earlierPeriod}`, token),
  ]);
  for (const { status, body } of [sellerView, adminView, pastView]) {
    assert.equal(status, 200);
    assert.equal(body.open, 1);
    assert.equal(body.appointments, 8);
    assert.equal(body.nextActions.appointments.length, 5);
    assert.equal(body.nextActions.followUps.length, 1);
    for (const key of ["prospects", "quotes", "contractsSigned", "followUps"]) assert.equal(Object.hasOwn(body, key), false);
  }
  assert.equal(sellerView.body.quotesSent, 1);
  assert.equal(pastView.body.quotesSent, 1);
  assert.equal(sellerView.body.acquired, 1);
  assert.equal(pastView.body.acquired, 0);
  assert.deepEqual(sellerView.body.activity, [{ period: now.toISODate(), quotes: 1, contracts: 3, sales: 1 }]);
  assert.deepEqual(adminView.body.activity, sellerView.body.activity);
});

test("la commission versée paraît au mois du versement même après contestation", async () => {
  const seller = await Account.create({ firstName: "Mois", lastName: "Recette", email: "mois@fixture.invalid", status: "ACTIVE" });
  const beneficiary = signCommercialToken(seller);
  await Acquisition.create({
    prospectId: new mongoose.Types.ObjectId(), contractId: new mongoose.Types.ObjectId(),
    establishmentId: new mongoose.Types.ObjectId(), beneficiaryId: seller._id,
    restaurantName: "Établissement fictif", contractNumber: "D-MOIS", signedAt: new Date("2025-01-31T12:00:00Z"),
    commission: { status: "CONTESTED", amountCents: 25000, paidAt: new Date("2025-02-01T12:00:00Z") },
  });
  const signature = "from=2025-01-01&to=2025-01-31";
  const payment = "from=2025-02-01&to=2025-02-28";
  const first = await request(`/commercial/commissions?summary=true&${signature}`, beneficiary);
  const second = await request(`/commercial/commissions?summary=true&status=PAID&${payment}`, beneficiary);
  const dashboard = await request(`/commercial/dashboard?${payment}`, beneficiary);
  assert.equal(first.body.total, 0);
  assert.equal(second.body.total, 1);
  assert.deepEqual(second.body.summary.PAID, { amountCents: 25000, count: 1 });
  assert.deepEqual(dashboard.body.paid, second.body.summary.PAID);
});
