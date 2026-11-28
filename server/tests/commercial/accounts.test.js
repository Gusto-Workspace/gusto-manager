const { mongoUri, messages, stripeCalls } = require("./isolated-environment.cjs");
const { after, before, test } = require("node:test");
const assert = require("node:assert/strict");
const express = require("express");
const mongoose = require("mongoose");
const jwt = require("jsonwebtoken");
const bcrypt = require("bcryptjs");

const Admin = require("../../models/admin.model");
const CommercialAccount = require("../../models/commercial-account.model");
const Owner = require("../../models/owner.model");
const Employee = require("../../models/employee.model");
const Restaurant = require("../../models/restaurant.model");
const { restrictAccountantAccess } = require("../../middleware/restrict-accountant-access");
const { resetLoginLimiterForTests } = require("../../middleware/limit-login");
const { mountSseRoute } = require("../../services/shared/sse-bus.service");
const fixturePassword = "recette-commerciale-fictive";
const commercialSessionSeconds = 72 * 60 * 60;
const email = (label) => `${label}@gusto-recette.invalid`;
let server;
let base;
let superAdmin;
let admin;
let owner;
let restaurant;
let sellerA;
let sellerB;
let adminToken;
let superToken;
let sellerToken;
let employeeToken;
let accountantToken;
let ownerToken;

async function request(path, { method = "GET", token, body } = {}) {
  const response = await fetch(`${base}${path}`, {
    method,
    headers: {
      ...(token && { Authorization: `Bearer ${token}` }),
      ...(body && { "Content-Type": "application/json" }),
    },
    ...(body && { body: JSON.stringify(body) }),
  });
  return { status: response.status, headers: response.headers, body: await response.json().catch(() => null) };
}

async function login(path, identity, password = fixturePassword) {
  resetLoginLimiterForTests();
  return request(path, { method: "POST", body: { email: identity.email, password } });
}

before(async () => {
  await mongoose.connect(mongoUri, {
    dbName: `gusto_commercial_roles_${new mongoose.Types.ObjectId()}`,
    serverSelectionTimeoutMS: 5000,
  });
  const app = express();
  app.use(express.json());
  app.use("/api", require("../../routes/auth.routes"));
  app.use("/api", restrictAccountantAccess);
  mountSseRoute(app);
  for (const route of [
    "commercial-accounts", "admin/dashboard", "admin/owners", "admin/restaurants",
    "admin/subscriptions", "restaurants", "owners", "employees", "hours",
    "contact", "menus", "dishes", "drinks", "wines", "news",
  ]) app.use("/api", require(`../../routes/${route}.routes`));
  await CommercialAccount.init();
  server = await new Promise((resolve) => {
    const listener = app.listen(0, "127.0.0.1", () => resolve(listener));
  });
  base = `http://127.0.0.1:${server.address().port}/api`;
  superAdmin = await Admin.create({ email: email("proprietaire-plateforme"), role: "admin", password: fixturePassword });
  admin = await Admin.create({ email: email("ancien-seller"), role: "seller", password: fixturePassword });
  owner = await Owner.create({ email: email("restaurateur"), password: fixturePassword });
  const password = await bcrypt.hash(fixturePassword, 4);
  const [employee, accountant] = await Employee.collection.insertMany([
    { email: email("employe"), password, accountType: "employee", restaurants: [] },
    { email: email("comptable"), password, accountType: "accountant", restaurants: [] },
  ]).then(({ insertedIds }) => Object.values(insertedIds));
  restaurant = await Restaurant.create({
    name: "Restaurant fictif", email: email("restaurant"), phone: "0101010101",
    address: { line1: "1 rue fictive", zipCode: "75001", city: "Paris", country: "France" },
    owner_id: owner._id, employees: [employee, accountant], stripeCustomerId: "customer-fixture",
    options: { reservations: true, employees: true, health_control_plan: true, sms_reminders: true },
  });
  await Employee.collection.updateMany({ _id: { $in: [employee, accountant] } }, { $set: { restaurants: [restaurant._id] } });
  await Owner.updateOne({ _id: owner._id }, { $set: { restaurants: [restaurant._id] } });
});

after(async () => {
  if (server) await new Promise((resolve) => server.close(resolve));
  if (mongoose.connection.readyState === 1) await mongoose.connection.dropDatabase();
  await mongoose.disconnect();
});

test("la bascule fictive remplace les deux rôles et invalide les sessions précédentes", async () => {
  const legacyAdmin = jwt.sign({ id: String(superAdmin._id), role: "admin" }, process.env.JWT_SECRET);
  const legacySeller = jwt.sign({ id: String(admin._id), role: "seller" }, process.env.JWT_SECRET);
  assert.equal((await request("/admin/owners", { token: legacyAdmin })).status, 403);
  assert.equal((await request("/admin/owners", { token: legacySeller })).status, 403);
  assert.equal((await request("/commercial/me", { token: legacySeller })).status, 401);
  assert.equal((await login("/admin/login", admin)).status, 401);

  const oldRoleToken = (await login("/admin/login", superAdmin)).body.token;
  const pending = await request("/admin/commerciaux", { token: oldRoleToken, method: "POST", body: {
    firstName: "En attente", lastName: "Recette", email: email("en-attente"),
  } });
  assert.equal(pending.status, 201);
  assert.equal((await request(`/admin/commerciaux/${pending.body.account._id}/invite`, { token: oldRoleToken, method: "POST" })).status, 409);

  await Admin.updateOne({ _id: superAdmin._id, role: "admin" }, { $set: { role: "super-admin" }, $inc: { sessionVersion: 1 } });
  await Admin.updateOne({ _id: admin._id, role: "seller" }, { $set: { role: "admin" }, $inc: { sessionVersion: 1 } });
  assert.equal((await request("/admin/owners", { token: oldRoleToken })).status, 403);
  superToken = (await login("/admin/login", superAdmin)).body.token;
  adminToken = (await login("/admin/login", admin)).body.token;
  assert.equal(jwt.decode(superToken).role, "super-admin");
  assert.equal(Object.hasOwn(jwt.decode(superToken), "exp"), false);
  assert.equal(Object.hasOwn(jwt.decode(adminToken), "exp"), false);
  assert.equal((await request("/admin/owners", { token: superToken })).status, 200);
  assert.equal((await request("/admin/owners", { token: adminToken })).status, 200);
});

test("l’admin gère l’abonnement existant et les mutations d’identité sont réservées au super-admin", async () => {
  for (const [method, path] of [
    ["POST", "/admin/add-owner"], ["PUT", `/admin/owners/${owner._id}`], ["DELETE", `/admin/owners/${owner._id}`],
    ["POST", "/admin/add-restaurant"], ["PUT", `/admin/restaurants/${restaurant._id}`],
    ["DELETE", `/admin/restaurants/${restaurant._id}`], ["GET", `/admin/restaurants/${restaurant._id}/stripe-key`],
  ]) assert.equal((await request(path, { token: adminToken, method })).status, 403);
  assert.equal((await request(`/admin/restaurants/${restaurant._id}/stripe-key`, { token: superToken })).status, 200);
  assert.equal((await request("/admin/create-setup-intent", { token: adminToken, method: "POST",
    body: { restaurantId: String(restaurant._id) } })).status, 200);
  assert.equal((await request("/admin/update-subscription-payer-sepa", { token: adminToken, method: "POST" })).status, 403);
  assert.deepEqual(stripeCalls, ["setup.create"]);
});

test("une coupure MongoDB rend la validation admin indisponible sans révoquer le jeton", async (t) => {
  const { body: { token } } = await login("/admin/login", superAdmin);
  const lookup = t.mock.method(Admin, "findById", () => ({
    select: () => ({
      lean: async () => { throw new mongoose.mongo.MongoNetworkError("Connexion de recette interrompue"); },
    }),
  }));
  const unavailable = await request("/admin/commerciaux/session", { token });
  assert.equal(unavailable.status, 503);
  assert.equal(unavailable.headers.get("cache-control"), "private, no-store");
  assert.equal((await request("/admin/commerciaux/session", { token: "jeton-invalide" })).status, 403);
  assert.equal(lookup.mock.callCount(), 1);
  lookup.mock.restore();
  assert.equal((await request("/admin/commerciaux/session", { token })).status, 204);
});

test("deux invitations indépendantes et usage unique du lien d’activation", async () => {
  for (const name of ["Alice", "Benoît"]) {
    const created = await request("/admin/commerciaux", { token: adminToken, method: "POST", body: {
      firstName: name, lastName: "Recette", email: email(name === "Alice" ? "alice" : "benoit"), internalNotes: "Réservé à l’administration",
    } });
    assert.equal(created.status, 201);
    const account = created.body.account;
    assert.equal(account.commissionCents, 40000);
    const path = `/admin/commerciaux/${account._id}/invite`;
    assert.equal((await request(path, { token: adminToken, method: "POST" })).status, 204);
    let token = messages.at(-1).htmlContent.match(/#([a-f0-9]{64})/)[1];
    if (name === "Benoît") {
      await CommercialAccount.updateOne({ _id: account._id }, { $set: { "accessChallenge.expiresAt": new Date(0) } });
      assert.equal((await request("/commercial/auth/activate", { method: "POST", body: { token, password: fixturePassword } })).status, 400);
      resetLoginLimiterForTests();
      assert.equal((await request(path, { token: adminToken, method: "POST" })).status, 204);
      token = messages.at(-1).htmlContent.match(/#([a-f0-9]{64})/)[1];
      sellerB = account;
    } else {
      sellerA = account;
    }
    assert.equal((await request("/commercial/auth/activate", { method: "POST", body: { token, password: fixturePassword } })).status, 204);
    assert.equal((await request("/commercial/auth/activate", { method: "POST", body: { token, password: fixturePassword } })).status, 400);
    resetLoginLimiterForTests();
  }
  const logged = await login("/commercial/auth/login", sellerA);
  sellerToken = logged.body.token;
  assert.equal(logged.status, 200);
  assert.equal((await login("/commercial/auth/login", sellerB)).status, 200);
  assert.equal(logged.body.account.internalNotes, undefined);
  assert.equal(logged.body.account.sessionVersion, undefined);
  assert.equal(logged.body.account.password, undefined);
});

test("la session commerciale expire à 72 heures et exige une reconnexion", async (t) => {
  const { iat, exp, aud, iss, sub, role, sessionVersion } = jwt.decode(sellerToken);
  assert.equal(exp - iat, commercialSessionSeconds);

  const oldToken = jwt.sign({ role, sessionVersion, iat }, process.env.COMMERCIAL_JWT_SECRET, {
    algorithm: "HS256", audience: aud, issuer: iss, subject: sub,
  });
  t.mock.timers.enable({ apis: ["Date"], now: exp * 1000 - 1 });
  assert.equal((await request("/commercial/me", { token: oldToken })).status, 401);
  assert.equal((await request("/commercial/me", { token: sellerToken })).status, 200);

  t.mock.timers.setTime(exp * 1000);
  assert.equal((await request("/commercial/me", { token: sellerToken })).status, 401);
  const fresh = await login("/commercial/auth/login", sellerA);
  assert.equal(fresh.status, 200);
  const claims = jwt.decode(fresh.body.token);
  assert.equal(claims.iat, exp);
  assert.equal(claims.exp - claims.iat, commercialSessionSeconds);
  assert.equal((await request("/commercial/me", { token: fresh.body.token })).status, 200);
});

test("la déconnexion du commercial invalide ses autres jetons uniquement", async () => {
  const firstDevice = await login("/commercial/auth/login", sellerB);
  const secondDevice = await login("/commercial/auth/login", sellerB);
  assert.equal(firstDevice.status, 200);
  assert.equal(secondDevice.status, 200);
  assert.equal((await request("/commercial/auth/logout", { token: firstDevice.body.token, method: "POST" })).status, 204);
  assert.equal((await request("/commercial/me", { token: secondDevice.body.token })).status, 401);
  assert.equal((await request("/commercial/me", { token: sellerToken })).status, 200);
  assert.equal((await request("/admin/commerciaux/session", { token: adminToken })).status, 204);
});

test("les sessions commerciales restent dans leur périmètre et se révoquent immédiatement", async () => {
  const profile = await request("/commercial/me", { token: sellerToken });
  assert.equal(profile.status, 200);
  assert.equal(profile.body.account.email, sellerA.email);
  assert.equal((await request("/admin/dashboard", { token: sellerToken })).status, 403);
  assert.equal((await request("/commercial/me", { token: adminToken })).status, 401);
  assert.equal((await request("/commercial/me", { token: superToken })).status, 401);
  assert.equal((await request(`/owner/restaurants/${restaurant._id}`, { token: sellerToken })).status, 403);
  assert.equal((await request(`/events/${restaurant._id}`, { token: sellerToken })).status, 403);

  const changed = await request("/commercial/me", { token: sellerToken, method: "PATCH", body: { phone: "0101040404", status: "DISABLED", role: "super-admin" } });
  assert.equal(changed.status, 200);
  assert.equal(changed.body.account.phone, "0101040404");
  assert.equal(changed.body.account.role, undefined);
  assert.equal((await CommercialAccount.findById(sellerA._id)).status, "ACTIVE");
  assert.ok(jwt.decode(sellerToken).exp > Math.floor(Date.now() / 1000));
  assert.equal((await request(`/admin/commerciaux/${sellerA._id}/status`, { token: adminToken, method: "POST", body: { action: "disable" } })).status, 200);
  assert.equal((await request("/commercial/me", { token: sellerToken })).status, 401);
  assert.equal((await login("/commercial/auth/login", sellerA)).status, 401);
  assert.equal((await request(`/admin/commerciaux/${sellerA._id}/status`, { token: adminToken, method: "POST", body: { action: "activate" } })).status, 200);
  assert.equal((await request("/commercial/me", { token: sellerToken })).status, 401);
});

test("les parcours propriétaire, employé et comptable gardent leurs autorisations positives", async () => {
  ownerToken = (await login("/user/login", owner)).body.token;
  employeeToken = (await login("/user/login", { email: email("employe") })).body.token;
  accountantToken = (await login("/user/login", { email: email("comptable") })).body.token;
  for (const [token, role] of [[ownerToken, "owner"], [employeeToken, "employee"], [accountantToken, "accountant"]]) {
    const claims = jwt.decode(token);
    assert.equal(claims.role, role);
    if (role === "owner") assert.equal(claims.exp, undefined);
    else assert.equal(claims.exp - claims.iat, 7 * 24 * 60 * 60);
    const selected = await request("/user/select-restaurant", { method: "POST", body: { token, restaurantId: String(restaurant._id) } });
    assert.equal(selected.status, 200);
    const selectedClaims = jwt.decode(selected.body.token);
    if (role === "owner") assert.equal(selectedClaims.exp, undefined);
    else assert.equal(selectedClaims.exp - selectedClaims.iat, 7 * 24 * 60 * 60);
    assert.ok([401, 403].includes((await request("/commercial/me", { token })).status));
    assert.equal((await request("/admin/owners", { token })).status, 403);
  }
  const publicRestaurant = await request(`/restaurants/${restaurant._id}`);
  assert.equal(publicRestaurant.status, 200);
  assert.deepEqual(publicRestaurant.body.restaurant.options, { reservations: true, gift_card: false, take_away: false });
  const visits = `/restaurants/${restaurant._id}/visits/monthly`;
  assert.equal((await request(visits)).status, 403);
  assert.equal((await request(visits, { token: ownerToken })).status, 200);
  assert.equal((await request(visits, { token: sellerToken })).status, 403);
});

test("le reset admin révoque la session et le code n’est utilisable qu’une fois", async () => {
  resetLoginLimiterForTests();
  const beforeMessages = messages.length;
  const known = await request("/admin/send-reset-code", { method: "POST", body: { email: admin.email } });
  const other = await request("/admin/send-reset-code", { method: "POST", body: { email: email("absent") } });
  assert.deepEqual(known.body, other.body);
  assert.equal(messages.length, beforeMessages + 1);
  const code = messages.at(-1).htmlContent.match(/>(\d{6})</)[1];
  const reset = { method: "PUT", body: { email: admin.email, code, newPassword: "nouveau-secret-de-recette" } };
  assert.equal((await request("/admin/reset-password", reset)).status, 200);
  assert.equal((await request("/admin/owners", { token: adminToken })).status, 403);
  assert.equal((await request("/admin/reset-password", reset)).status, 400);
  const fresh = await login("/admin/login", admin, reset.body.newPassword);
  assert.equal(fresh.status, 200);
  assert.equal((await request("/admin/session/revoke", { token: fresh.body.token, method: "POST" })).status, 204);
  assert.equal((await request("/admin/owners", { token: fresh.body.token })).status, 403);
});

test("le support historique journalise la connexion, les refus et les actions sensibles", async (t) => {
  const supportPassword = "mot-de-passe-support-fictif";
  process.env.SUPER_ADMIN_PASSWORD_HASH = await bcrypt.hash(supportPassword, 4);
  t.after(() => { delete process.env.SUPER_ADMIN_PASSWORD_HASH; });
  const logs = [];
  t.mock.method(console, "info", (label, value) => { if (label === "[support-audit]") logs.push(value); });
  const response = await login("/user/login", owner, supportPassword);
  assert.equal(response.status, 200);
  const token = response.body.token;
  const claims = jwt.decode(token);
  assert.equal(claims.role, "owner");
  assert.equal(claims.authMethod, "super_admin");
  assert.equal((await request(`/owner/restaurants/${restaurant._id}`, { token })).status, 200);
  assert.equal((await request(`/owner/restaurants/${new mongoose.Types.ObjectId()}`, { token })).status, 404);
  assert.equal((await request(`/restaurants/${restaurant._id}/opening_hours`, { token, method: "PUT", body: { openingHours: [] } })).status, 200);
  for (const event of logs) assert.equal(event.superAdminSessionId, claims.superAdminSessionId);
  assert.deepEqual(logs.map(({ method, status }) => [method, status]), [["POST", 200], ["GET", 404], ["PUT", 200]]);
});
