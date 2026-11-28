const { mongoUri } = require("./isolated-environment.cjs");
const { after, before, test } = require("node:test");
const assert = require("node:assert/strict");
const express = require("express");
const mongoose = require("mongoose");
const { DateTime } = require("luxon");
const Admin = require("../../models/admin.model");
const Account = require("../../models/commercial-account.model");
const Restaurant = require("../../models/restaurant.model");
const Establishment = require("../../models/commercial-establishment.model");
const { CommercialProspect, CommercialInteraction } = require("../../models/commercial-prospect.model");
const { signAdminToken } = require("../../middleware/authenticate-admin");
const { signCommercialToken } = require("../../middleware/authenticate-commercial");
const { conflictMessage, saveRestaurantWithEstablishment } = require("../../services/commercial/establishments.service");
const { resetLoginLimiterForTests } = require("../../middleware/limit-login");

let server;
let base;
let admin;
let superAdmin;
let alice;
let benoit;
let tokens;

const profile = (restaurantName, address = "1 rue du Marché", overrides = {}) => ({
  restaurantName, address, postalCode: "75001", city: "Paris",
  phone: "", email: "", ...overrides,
});
const restaurantFields = (name, line1) => ({
  name, phone: "0101010101", email: "fixture@restaurant.invalid",
  address: { line1, city: "Paris", zipCode: "75001", country: "France" },
  owner_id: new mongoose.Types.ObjectId(),
});

async function request(path, token, method = "GET", data) {
  const response = await fetch(`${base}${path}`, {
    method,
    headers: { Authorization: `Bearer ${token}`, ...(data && { "Content-Type": "application/json" }) },
    ...(data && { body: JSON.stringify(data) }),
  });
  return { status: response.status, body: await response.json().catch(() => null) };
}

before(async () => {
  await mongoose.connect(mongoUri, { dbName: `gusto_commercial_crm_${new mongoose.Types.ObjectId()}`, serverSelectionTimeoutMS: 5000 });
  await Promise.all([Establishment.init(), CommercialProspect.init(), CommercialInteraction.init(), Restaurant.init(), Account.init()]);
  [admin, superAdmin] = await Admin.create([
    { email: "admin@fixture.invalid", role: "admin" }, { email: "super@fixture.invalid", role: "super-admin" },
  ]);
  [alice, benoit] = await Account.create([
    { firstName: "Alice", lastName: "Recette", email: "a@fixture.invalid", status: "ACTIVE" },
    { firstName: "Benoît", lastName: "Recette", email: "b@fixture.invalid", status: "ACTIVE" },
  ]);
  tokens = { admin: signAdminToken(admin), superAdmin: signAdminToken(superAdmin), a: signCommercialToken(alice), b: signCommercialToken(benoit) };
  await Restaurant.create(restaurantFields("Client initial", "10 rue Basilic"));
  const app = express();
  app.use(express.json());
  app.use("/api", require("../../routes/commercial-accounts.routes"));
  app.use("/api", require("../../routes/commercial-prospects.routes"));
  app.use("/api", require("../../routes/commercial-pilotage.routes"));
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

test("l’initialisation est réservée au super-admin et couvre les restaurants actuels et futurs", async () => {
  const path = "/admin/commerciaux/crm/registry/initialize";
  assert.equal((await request("/commercial/prospects", tokens.a, "POST", profile("Premier"))).status, 503);
  assert.equal((await request(path, tokens.admin, "POST")).status, 403);
  assert.equal((await request(path, tokens.superAdmin, "POST")).status, 200);
  assert.equal((await request(path, tokens.superAdmin, "POST")).status, 200);
  const existing = profile("Client initial", "10 rue Basilic");
  assert.deepEqual(await request("/commercial/prospects", tokens.a, "POST", existing), { status: 409, body: { message: conflictMessage } });
  await saveRestaurantWithEstablishment(new Restaurant(restaurantFields("Nouveau client", "12 rue Menthe")));
  assert.deepEqual(await request("/commercial/prospects", tokens.a, "POST", profile("Nouveau client", "12 rue Menthe")), { status: 409, body: { message: conflictMessage } });
});

test("portefeuilles et historique isolés, édition et relance sur le bon dossier", async () => {
  resetLoginLimiterForTests();
  const a = await request("/commercial/prospects", tokens.a, "POST", profile("Le Jardin A", "8 rue Myrtille", {
    salesOwnerId: String(benoit._id), modules: ["reservations"], stage: "CONTACTED",
  }));
  assert.equal(a.status, 201);
  assert.equal(a.body.prospect.salesOwnerId, undefined);
  const b = await request("/commercial/prospects", tokens.b, "POST", profile("La Terrasse B", "9 rue Myrtille"));
  assert.equal(b.status, 201);
  const item = `/commercial/prospects/${a.body.prospect._id}`;
  assert.equal((await request(item, tokens.b)).status, 404);
  assert.equal((await request(item, tokens.b, "PATCH", { notes: "Fixture" })).status, 404);
  assert.equal((await request(`${item}/interactions`, tokens.b)).status, 404);
  assert.equal((await request("/commercial/prospects?q=Jardin", tokens.b)).body.total, 0);
  assert.equal((await request("/commercial/prospects?page=1", tokens.a)).body.total, 1);
  const followUp = "2027-02-10T09:00:00.000Z";
  assert.equal((await request(item, tokens.a, "PATCH", { notes: "Porteur du projet rencontré.", nextFollowUpAt: followUp })).body.prospect.nextFollowUpAt, followUp);
  assert.equal((await request(`${item}/interactions`, tokens.a, "POST", { type: "CALL", message: "Premier échange" })).status, 201);
  const history = await request(`${item}/interactions`, tokens.a);
  assert.equal(history.body.total, 1);
  assert.equal(history.body.interactions[0].actorId, undefined);
  assert.equal(history.body.interactions[0].message, "Premier échange");
  assert.equal((await request(item, tokens.a)).body.prospect.lastContactAt !== null, true);
});

test("les actions d’un CRM individuel d’administration restent dans le portefeuille demandé", async () => {
  const path = "/admin/commerciaux/crm/prospects";
  const aliceScope = `salesOwnerId=${alice._id}`;
  const benoitScope = `salesOwnerId=${benoit._id}`;
  const record = profile("Prospect depuis la fiche", "45 rue Vanille", { salesOwnerId: String(alice._id) });
  assert.equal((await request(`${path}?${benoitScope}`, tokens.admin, "POST", record)).status, 400);
  const created = await request(`${path}?${aliceScope}`, tokens.admin, "POST", record);
  assert.equal(created.status, 201);
  const id = created.body.prospect._id;
  assert.equal((await request(`${path}/${id}?${benoitScope}`, tokens.admin)).status, 404);
  assert.equal((await request(`${path}/${id}?${benoitScope}`, tokens.admin, "PATCH", { notes: "Hors fiche" })).status, 404);
  assert.equal((await request(`${path}/${id}/interactions?${benoitScope}`, tokens.admin)).status, 404);
  assert.equal((await request(`${path}/${id}?${aliceScope}`, tokens.admin, "PATCH", { notes: "Note de la fiche Alice" })).status, 200);
  const reassignment = { salesOwnerId: String(benoit._id), reason: "Transfert fictif" };
  assert.equal((await request(`${path}/${id}/reassign?${aliceScope}`, tokens.admin, "POST", reassignment)).status, 204);
  assert.equal((await request(`${path}/${id}?${aliceScope}`, tokens.admin)).status, 404);
  assert.equal((await request(`${path}/${id}?${benoitScope}`, tokens.admin)).body.prospect.notes, "Note de la fiche Alice");
});

test("une identité certaine ne peut être créée deux fois en concurrence", async () => {
  resetLoginLimiterForTests();
  const data = profile("Établissement concurrent", "1 quai du Canal", { siret: "11111111100012" });
  const [left, right] = await Promise.all([
    request("/commercial/prospects", tokens.a, "POST", data),
    request("/commercial/prospects", tokens.b, "POST", data),
  ]);
  assert.deepEqual([left.status, right.status].sort(), [201, 409]);
  assert.deepEqual((left.status === 409 ? left : right).body, { message: conflictMessage });
  assert.equal(await CommercialProspect.countDocuments({ siret: data.siret }), 1);
});

test("les coordonnées communes entre deux adresses ne sont pas un doublon et l’ambiguïté reste administrative", async () => {
  resetLoginLimiterForTests();
  const shared = { phone: "01 23 45 67 89", website: "exemple-restaurant.invalid" };
  assert.equal((await request("/commercial/prospects", tokens.a, "POST", profile("Salle Nord", "30 rue Nord", shared))).status, 201);
  assert.equal((await request("/commercial/prospects", tokens.b, "POST", profile("Salle Sud", "31 rue Sud", shared))).status, 201);
  const ambiguous = profile("Salle sans adresse", "", { ...shared, siret: "11111111100044" });
  assert.deepEqual(await request("/commercial/prospects", tokens.b, "POST", ambiguous), { status: 409, body: { message: conflictMessage } });
  const conflicts = await request("/admin/commerciaux/crm/conflicts", tokens.admin);
  const conflict = conflicts.body.conflicts.find((item) => item.proposed.restaurantName === ambiguous.restaurantName);
  assert.equal(conflict.conflictKind, "AMBIGUOUS");
  const decision = { decision: "DISTINCT", reason: "Établissement distinct vérifié", salesOwnerId: String(benoit._id) };
  assert.equal((await request(`/admin/commerciaux/crm/conflicts/${conflict._id}/resolve`, tokens.admin, "POST", decision)).status, 204);
  assert.equal((await request("/commercial/prospects?q=Salle+sans", tokens.b)).body.total, 1);
});

test("opposition persistante et réattribution privée avec historique visible au nouveau titulaire", async () => {
  resetLoginLimiterForTests();
  const loaded = await request("/commercial/prospects?q=Jardin", tokens.a);
  assert.equal(loaded.body.total, 1);
  const id = loaded.body.prospects[0]._id;
  const path = `/commercial/prospects/${id}`;
  assert.equal((await request(`${path}/status`, tokens.a, "POST", { action: "oppose", reason: "Demande reçue" })).status, 204);
  assert.equal((await request(`${path}/status`, tokens.a, "POST", { action: "archive" })).status, 204);
  assert.equal((await request(`/admin/commerciaux/crm/prospects/${id}/reassign`, tokens.admin, "POST", {
    salesOwnerId: String(benoit._id), reason: "Réattribution de recette",
  })).status, 204);
  assert.equal((await request(path, tokens.a)).status, 404);
  assert.ok((await request(path, tokens.b)).body.prospect.opposedAt);
  assert.equal((await request(`${path}/interactions`, tokens.b)).body.total, 1);
  assert.equal((await request(`${path}/interactions`, tokens.b, "POST", { type: "CALL" })).status, 409);
  assert.deepEqual(await request("/commercial/prospects", tokens.a, "POST", profile("Le Jardin A", "8 rue Myrtille")), { status: 409, body: { message: conflictMessage } });
});

test("le pipeline partage les statuts effectifs, les filtres et le périmètre administratif", async () => {
  const records = await CommercialProspect.create([
    { restaurantName: "Pipeline ancien rendez-vous", salesOwnerId: alice._id, stage: "APPOINTMENT", createdBy: String(alice._id) },
    { restaurantName: "Pipeline devis transmis", salesOwnerId: alice._id, stage: "NEGOTIATION", milestones: { quoteSentAt: new Date() }, createdBy: String(alice._id) },
    { restaurantName: "Pipeline démonstration", salesOwnerId: benoit._id, stage: "DEMO", createdBy: String(benoit._id) },
    { restaurantName: "Pipeline dossier fermé", salesOwnerId: alice._id, stage: "LOST", milestones: { contractSentAt: new Date() }, createdBy: String(alice._id) },
  ]);
  const adminPath = "/admin/commerciaux/crm/prospects";
  const global = await request(`${adminPath}?q=Pipeline&view=pipeline`, tokens.admin);
  const counts = Object.fromEntries(global.body.columns.map((column) => [column.stage, column.total]));
  assert.deepEqual(Object.fromEntries(Object.entries(counts).filter(([, total]) => total)), { INTERESTED: 1, NEGOTIATION: 1, QUOTE_SENT: 1, LOST: 1 });
  assert.equal(global.body.columns.find((column) => column.stage === "NEGOTIATION").prospects[0].salesOwnerName, "Benoît Recette");
  const individual = await request(`${adminPath}?q=Pipeline&stage=QUOTE_SENT&salesOwnerId=${alice._id}`, tokens.admin);
  assert.equal(individual.body.total, 1);
  const ownerOnly = await request(`/commercial/prospects?q=Pipeline&view=pipeline&salesOwnerId=${benoit._id}`, tokens.a);
  assert.equal(ownerOnly.body.columns.find((column) => column.stage === "NEGOTIATION").total, 0);
  assert.equal(ownerOnly.body.columns.find((column) => column.stage === "INTERESTED").prospects[0].salesOwnerName, undefined);
  const path = `/commercial/prospects/${records[0]._id}`;
  for (const stage of ["APPOINTMENT", "DEMO", "QUOTE_SENT", "CONTRACT_SENT", "CONTRACT_SIGNED", "ACQUIRED", "OPPOSED"]) {
    assert.equal((await request(path, tokens.a, "PATCH", { stage })).status, 400);
  }
  assert.equal((await CommercialProspect.findById(records[0]._id)).stage, "APPOINTMENT");
  assert.equal((await request(path, tokens.a, "PATCH", { stage: "NEGOTIATION" })).body.prospect.effectiveStage, "NEGOTIATION");
  const history = (await request(`${path}/interactions?timeline=true`, tokens.a)).body.interactions;
  assert.equal(history[0].type, "STAGE_CHANGED");
  assert.equal(history[0].previousStage, "INTERESTED");
  assert.equal(history[0].nextStage, "NEGOTIATION");
});

test("les relances existantes et les nouveaux événements partagent le calendrier, la fiche et les agrégations", async () => {
  const now = DateTime.now().setZone("Europe/Paris");
  const day = now.toISODate();
  const yesterday = now.minus({ days: 1 }).toISODate();
  const tomorrow = now.plus({ days: 1 }).toISODate();
  const week = `from=${yesterday}&to=${now.plus({ days: 7 }).toISODate()}`;
  const [record, another] = await CommercialProspect.create([
    { restaurantName: "Agenda Alice", salesOwnerId: alice._id, createdBy: String(alice._id), nextFollowUpAt: now.minus({ days: 1 }).startOf("day").toJSDate() },
    { restaurantName: "Agenda Benoît", salesOwnerId: benoit._id, createdBy: String(benoit._id) },
  ]);
  const calendar = "/commercial/calendar";
  const adminCalendar = "/admin/commerciaux/crm/calendar";
  const adminDashboard = "/admin/commerciaux/pilotage/dashboard";
  const prospectPath = `/commercial/prospects/${record._id}`;
  const legacy = (await request(`${calendar}?${week}&type=FOLLOW_UP`, tokens.a)).body.events
    .find(({ prospectId }) => prospectId === String(record._id));
  assert.match(legacy._id, /^legacy:/);
  assert.equal(legacy.allDay, true);
  assert.equal((await request(`${adminDashboard}?salesOwnerId=${alice._id}`, tokens.admin)).body.nextActions.overdue.find(({ eventId }) => eventId === legacy._id).prospectId, String(record._id));
  const followUp = { title: "Rappel de recette", type: "FOLLOW_UP", allDay: true, startsAt: tomorrow, prospectId: String(record._id) };
  assert.equal((await request(calendar, tokens.b, "POST", followUp)).status, 404);
  assert.equal((await request(calendar, tokens.a, "POST", { ...followUp, salesOwnerId: String(benoit._id) })).status, 400);
  assert.equal((await request(`${adminCalendar}?salesOwnerId=${benoit._id}`, tokens.admin, "POST", followUp)).status, 404);
  const migrated = await request(`${calendar}/${legacy._id}`, tokens.a, "PATCH", followUp);
  assert.equal(migrated.status, 200);
  assert.equal((await CommercialProspect.findById(record._id)).nextFollowUpAt, null);
  const migratedId = migrated.body.event._id;
  assert.equal((await request(`${calendar}/${legacy._id}`, tokens.a, "PATCH", { action: "cancel" })).status, 404);
  assert.equal((await request(`${calendar}/${migratedId}`, tokens.b, "PATCH", { action: "cancel" })).status, 404);
  const second = await request(calendar, tokens.a, "POST", { ...followUp, title: "Autre relance", startsAt: day });
  assert.equal(second.status, 201);
  assert.equal((await request(`${calendar}/${migratedId}`, tokens.a, "PATCH", { prospectId: String(another._id) })).status, 404);
  assert.equal((await request(prospectPath, tokens.a)).body.prospect.nextFollowUpAt, now.startOf("day").toJSDate().toISOString());
  await Promise.all([1, 2].map(() => request(`${calendar}/${second.body.event._id}`, tokens.a, "PATCH", { action: "complete" })))
    .then((retries) => assert.deepEqual(retries.map(({ status }) => status).sort(), [200, 409]));
  assert.equal((await request(prospectPath, tokens.a)).body.prospect.nextFollowUpAt, now.plus({ days: 1 }).startOf("day").toJSDate().toISOString());
  assert.equal((await request(`${calendar}/${migratedId}`, tokens.a, "PATCH", { action: "cancel" })).status, 200);
  assert.equal((await request(`${calendar}?prospectId=${record._id}&upcoming=true`, tokens.a)).body.events.length, 0);
  const timeline = (await request(`${prospectPath}/interactions?timeline=true`, tokens.a)).body.interactions;
  assert.deepEqual(timeline.map(({ state }) => state).sort(), ["CANCELLED", "COMPLETED"]);

  const appointment = { title: "Rendez-vous de travail", type: "APPOINTMENT", allDay: true, startsAt: tomorrow };
  const standAlone = await request(`${adminCalendar}?salesOwnerId=${benoit._id}`, tokens.admin, "POST", appointment);
  assert.equal(standAlone.status, 201);
  assert.equal((await request(`${calendar}?${week}&type=APPOINTMENT`, tokens.a)).body.events.some(({ _id }) => _id === standAlone.body.event._id), false);
  const adminRows = (await request(`${adminCalendar}?${week}&salesOwnerId=${benoit._id}`, tokens.admin)).body.events;
  assert.deepEqual(adminRows.map(({ salesOwnerName }) => salesOwnerName), ["Benoît Recette"]);
  assert.equal((await request(`${calendar}/${standAlone.body.event._id}`, tokens.b, "PATCH", { action: "complete" })).status, 400);
  assert.equal((await request(`${calendar}?${week}&prospectId=${record._id}`, tokens.b)).status, 404);
  await Account.updateOne({ _id: benoit._id }, { $set: { status: "DISABLED" }, $inc: { sessionVersion: 1 } });
  assert.equal((await request(`${calendar}?${week}`, tokens.b)).status, 401);
});

test("les journées du calendrier suivent le changement d’heure parisien", async () => {
  const day = "2027-03-28";
  const start = "2027-03-27T23:00:00.000Z";
  const created = await request("/commercial/calendar", tokens.a, "POST", { title: "Relance sans heure", type: "FOLLOW_UP", allDay: true, startsAt: day });
  assert.equal(created.body.event.startsAt, start);
  const { body } = await request(`/commercial/calendar?from=${day}&to=2027-03-29`, tokens.a);
  assert.equal(body.events.some((event) => event._id === created.body.event._id), true);
  assert.equal((await request("/commercial/calendar?from=2027-03-29&to=2027-03-29", tokens.a)).status, 400);
  assert.equal((await request("/commercial/calendar", tokens.a, "POST", { title: "Date impossible", type: "FOLLOW_UP", allDay: true, startsAt: "2027-02-29" })).status, 400);
});

test("les anciennes relances ouvertes d’un client déjà acquis n’alimentent plus le CRM", async () => {
  const today = DateTime.now().setZone("Europe/Paris").startOf("day");
  const start = today.minus({ days: 1 });
  const record = await CommercialProspect.create({
    restaurantName: "Client acquis avant la mise à jour", salesOwnerId: alice._id, createdBy: String(alice._id),
    milestones: { acquiredAt: today.toJSDate() }, nextFollowUpAt: start.toJSDate(),
  });
  const [scheduled, completed] = await CommercialInteraction.create([
    { prospectId: record._id, salesOwnerId: alice._id, actorId: String(alice._id), type: "FOLLOW_UP",
      state: "SCHEDULED", startsAt: start.toJSDate(), title: "Ancienne relance ouverte" },
    { prospectId: record._id, salesOwnerId: alice._id, actorId: String(alice._id), type: "FOLLOW_UP",
      state: "COMPLETED", startsAt: start.toJSDate(), occurredAt: start.toJSDate(), title: "Ancienne relance réalisée" },
  ]);
  const base = `/commercial/prospects/${record._id}`;
  assert.equal((await request(base, tokens.a)).body.prospect.nextFollowUpAt, null);
  assert.deepEqual((await request(`/commercial/calendar?upcoming=true&prospectId=${record._id}`, tokens.a)).body.events, []);
  const range = `from=${start.toISODate()}&to=${today.plus({ days: 1 }).toISODate()}&prospectId=${record._id}`;
  for (const [calendar, token] of [["/commercial/calendar", tokens.a], ["/admin/commerciaux/crm/calendar", tokens.admin]]) {
    assert.deepEqual((await request(`${calendar}?${range}`, token)).body.events.map(({ _id }) => _id), [String(completed._id)]);
  }
  const dashboard = (await request("/commercial/dashboard", tokens.a)).body;
  assert.ok(dashboard.nextActions.overdue.every(({ prospectId }) => prospectId !== String(record._id)));
  assert.equal((await CommercialInteraction.findById(scheduled._id)).state, "SCHEDULED");
  assert.ok((await CommercialProspect.findById(record._id)).nextFollowUpAt);
});
