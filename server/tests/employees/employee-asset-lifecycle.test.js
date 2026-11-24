const assert = require("node:assert/strict");
const { randomUUID } = require("node:crypto");
const { once } = require("node:events");
const { Readable, Writable } = require("node:stream");
const { test } = require("node:test");
const mongoose = require("mongoose");
const cloudinary = require("cloudinary").v2;
const Brevo = require("sib-api-v3-sdk");
const axios = require("axios");

const testUri = process.env.GUSTO_HR_TEST_MONGO_URI;
const leaveNotifications = [];
const { ObjectId } = mongoose.Types;
const employeePath = "/restaurants/:restaurantId/employees/:employeeId";
const shiftPath = `${employeePath}/shifts/:shiftId`;
const filesPath = `${shiftPath}/files`;
const retention = { retentionUntil: "2099-12-31", retentionReason: "Justification RH fictive pour le test" };

process.env.STRIPE_API_SECRET_KEY ||= "sk_test_isolated_hr_lifecycle";
process.env.JWT_SECRET ||= "isolated-hr-lifecycle-fixture";
for (const [name, method] of [
  ["shared/notifications", "createAndBroadcastNotification"],
  ["gift-cards/gift-card-lifecycle", "refreshGiftCardLifecycle"],
]) {
  const filename = require.resolve(`../../services/${name}.service`);
  require.cache[filename] = {
    id: filename, filename, loaded: true,
    exports: { [method]: async (payload) => {
      if (method === "createAndBroadcastNotification") leaveNotifications.push(payload);
      return null;
    } },
  };
}

require("../../models/menu.model");
const Employee = require("../../models/employee.model");
const Restaurant = require("../../models/restaurant.model");
const EmployeeAssetDeletion = require("../../models/employee-asset-deletion.model");
const PersonnelInput = require("../../models/personnel-report-input.model");
const TimeClockSession = require("../../models/time-clock-session.model");
const { TimeClockPin } = require("../../models/time-clock-device.model");
const { PlanningDay } = require("../../models/planning-period.model");
const { retryEmployeeAssetDeletions } = require("../../services/employees/employee-asset-deletion.service");
const employees = require("../../routes/employees.routes");
const restaurants = require("../../routes/restaurants.routes");
const timeClock = require("../../routes/time-clock.routes");
const { sealPin } = require("../../services/employees/time-clock-device.service");
const { validateValues } = require("../../services/employees/personnel-report-pay.service");
const { isAccountSessionValid } = require("../../services/shared/account-session.service");

function call(router, method, path, user, params, body, request = {}) {
  const route = router.stack.find((layer) => layer.route?.path === path && layer.route.methods[method]).route;
  const req = Object.assign(request, { method: method.toUpperCase(), user, params, body, headers: request.headers || {} });
  const res = new Writable({ write(_chunk, _encoding, done) { done(); } });
  res.code = 200;
  res.status = (code) => { res.code = code; return res; };
  res.json = res.send = (result) => { res.body = result; return res.end(); };
  res.set = () => res;
  res.setHeader = () => {};
  const finished = once(res, "finish");
  const handlers = route.stack.filter(({ handle }) => handle.name !== "authenticateToken");
  let index = 0;
  const next = (error) => error ? res.status(error.status || 500).end() : handlers[index++].handle(req, res, next);
  return Promise.resolve(next()).then(() => finished).then(() => res);
}

function workbookSheets(buffer) {
  const sheets = [];
  for (let offset = 0; buffer.readUInt32LE(offset) === 0x04034b50;) {
    const size = buffer.readUInt32LE(offset + 18);
    const nameEnd = offset + 30 + buffer.readUInt16LE(offset + 26);
    const name = buffer.toString("utf8", offset + 30, nameEnd);
    const start = nameEnd + buffer.readUInt16LE(offset + 28);
    offset = start + size;
    if (name.startsWith("xl/worksheets/")) {
      const sheet = buffer.toString("utf8", start, offset);
      // Auto-width depends on the displayed name, and exporter timestamps are not payroll data.
      sheets.push(sheet.replace(/<cols>[\s\S]*?<\/cols>/g, "")
        .replace(/(Généré le<\/t><\/is><\/c><c[^>]*><is><t[^>]*>)[^<]+/g, "$1[date de génération]"));
    }
  }
  return sheets;
}

function uploadRequest() {
  const boundary = "GustoPersonnelLifecycle";
  const file = Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="files"; filename="test.pdf"\r\nContent-Type: application/pdf\r\n\r\n%PDF-1.7\n%%EOF\r\n--${boundary}--\r\n`);
  return Object.assign(Readable.from([file]), { headers: {
    "content-type": `multipart/form-data; boundary=${boundary}`,
    "content-length": String(file.length),
  } });
}

async function fixture(count = 1) {
  const employeeId = new ObjectId();
  const owner = { role: "owner", id: new ObjectId() };
  const restaurantIds = Array.from({ length: count }, () => new ObjectId());
  const profiles = restaurantIds.map((restaurant, index) => ({
    _id: new ObjectId(), restaurant,
    options: { employees: index === 0, futureScope: "keep" },
    snapshot: { firstname: "Ari", lastname: "Test", post: index === 0 ? "Cuisine" : "Bar", futureIdentity: "keep" },
    employment: { contractType: "CDI", payrollCode: `code-${index}`, futureContract: "keep" },
    shifts: [{ _id: new ObjectId(), title: "Service", start: new Date("2026-11-18T08:00:00Z"), end: new Date("2026-11-18T12:00:00Z") }],
    documents: [{
      public_id: `private-docs/${restaurant}/fixture.pdf`, filename: "fixture.pdf", title: "Contrat",
      resource_type: "raw", delivery_type: "authenticated",
    }],
    planningBatches: [{ key: randomUUID(), signature: "fixture" }],
    futurePrivateField: { fixture: true },
  }));
  await Restaurant.collection.insertMany(restaurantIds.map((_id, index) => ({
    _id, owner_id: owner.id, name: `Resto ${index}`, employees: [employeeId], menus: [],
    options: { employees: true },
  })));
  const email = `fixture-${employeeId}@example.test`;
  await Employee.collection.insertOne({
    _id: employeeId, firstname: "Ari", lastname: "Test", email, phone: "0600000000",
    sessionVersion: 7, restaurants: restaurantIds, restaurantProfiles: profiles, __v: 0,
  });
  const read = () => Employee.collection.findOne({ _id: employeeId });
  const request = (method, path, index = 0, body, extra = {}, stream) => call(employees, method, path, owner, {
    restaurantId: String(restaurantIds[index]), employeeId: String(employeeId),
    shiftId: String(profiles[index]?.shifts[0]._id),
    ...extra,
  }, body, stream);
  const add = (index = 0) => request("post", filesPath, index, undefined, {}, uploadRequest());
  const removeFile = (fileId, index = 0) => request("delete", `${filesPath}/:fileId`, index, undefined, { fileId: String(fileId) });
  return { employeeId, owner, email, restaurantIds, request, read, add, removeFile };
}

test("employee attachment lifecycle on a dedicated loopback MongoDB replica set", {
  skip: testUri ? false : "Set GUSTO_HR_TEST_MONGO_URI to a local MongoDB replica set",
}, async (t) => {
  const uri = new URL(testUri);
  assert.equal(uri.protocol, "mongodb:");
  assert.equal(uri.hostname, "127.0.0.1");
  assert.equal(uri.username, "");
  assert.equal(uri.password, "");
  const dbName = `gusto_hr61_${new ObjectId()}`;
  await mongoose.connect(testUri, { dbName, serverSelectionTimeoutMS: 5000 });
  t.after(async () => {
    try {
      await mongoose.connection.dropDatabase();
    } finally {
      await mongoose.disconnect();
    }
  });
  await EmployeeAssetDeletion.init();
  t.mock.method(cloudinary.uploader, "upload_stream", (options, callback) => new Writable({
    write(_chunk, _encoding, done) { done(); },
    final(done) {
      assert.equal(options.type, "authenticated");
      assert.equal(options.resource_type, "raw");
      callback(null, { public_id: `${options.folder}/${options.public_id}` });
      done();
    },
  }));

  await t.test("editing identity, post, contract and rights preserves private data in all restaurant profiles", async () => {
    const f = await fixture(2);
    assert.equal((await f.add()).code, 201);
    assert.equal((await f.add(1)).code, 201);
    const before = await f.read();
    const result = await f.request("patch", employeePath, 0, {
      firstname: "Camille", post: "Salle", contractType: "CDD", contractualValue: 28,
      contractualUnit: "week", options: { reservations: true },
    });
    assert.equal(result.code, 200);
    assert.equal(JSON.stringify(result.body).includes("planningFiles"), false);
    const updated = await f.read();
    const [first, second] = updated.restaurantProfiles;
    assert.equal(first.snapshot.post, "Salle");
    assert.equal(first.employment.contractType, "CDD");
    assert.equal(first.employment.contractualValue, 28);
    assert.equal(first.options.reservations, true);
    assert.equal(first.options.employees, true);
    assert.equal(second.snapshot.firstname, "Camille");
    assert.deepEqual(second.employment, before.restaurantProfiles[1].employment);
    assert.deepEqual(second.options, before.restaurantProfiles[1].options);
    for (const [index, profile] of updated.restaurantProfiles.entries()) {
      const original = before.restaurantProfiles[index];
      for (const field of ["planningFiles", "planningBatches", "documents", "futurePrivateField"]) {
        assert.deepEqual(profile[field], original[field]);
      }
      assert.equal(profile.snapshot.futureIdentity, "keep");
      assert.equal(profile.options.futureScope, "keep");
      assert.equal(profile.employment.futureContract, "keep");
    }
    assert.equal(updated.sessionVersion, 7);

    const self = await call(employees, "put", "/employees/update-data", {
      role: "employee", id: f.employeeId, sessionVersion: 7,
    }, {}, { phone: "0600000001" });
    assert.equal(self.code, 200);
    const [selfFirst, selfSecond] = (await f.read()).restaurantProfiles;
    assert.equal(selfFirst.snapshot.phone, "0600000001");
    assert.deepEqual(selfFirst.planningFiles, first.planningFiles);
    assert.deepEqual(selfSecond.planningFiles, second.planningFiles);
  });

  await t.test("both reattachment routes append a profile without replacing the existing ones", async () => {
    const f = await fixture();
    assert.equal((await f.add()).code, 201);
    const [original] = (await f.read()).restaurantProfiles;
    const attach = "/restaurants/:restaurantId/employees";
    for (const [router, path, body] of [
      [employees, attach, { firstName: "Ari", lastName: "Test", email: f.email, phone: "0600000000" }],
      [restaurants, `${attach}/import`, { employeeId: String(f.employeeId) }],
    ]) {
      const _id = new ObjectId();
      await Restaurant.collection.insertOne({ _id, owner_id: f.owner.id, name: "Rattachement", employees: [], menus: [], options: { employees: true } });
      assert.equal((await call(router, "post", path, f.owner, { restaurantId: String(_id) }, body)).code, 200);
      const employee = await f.read();
      assert.equal(employee.restaurantProfiles.some(({ restaurant }) => restaurant.equals(_id)), true);
      assert.deepEqual(employee.restaurantProfiles[0], original);
    }
  });

  await t.test("creation requires email and linking a workforce account provisions a separate PIN without a second invitation", async (st) => {
    const send = st.mock.fn(async () => ({}));
    st.mock.method(Brevo, "TransactionalEmailsApi", function MockBrevo() {
      return { sendTransacEmail: send };
    });
    const [first, second, foreign] = Array.from({ length: 3 }, () => new ObjectId());
    const owner = { role: "owner", id: new ObjectId() };
    const externalOwner = { role: "owner", id: new ObjectId() };
    await Restaurant.collection.insertMany([first, second, foreign].map((_id) => ({
      _id, owner_id: _id.equals(foreign) ? externalOwner.id : owner.id,
      name: "Restaurant fictif", employees: [], menus: [], options: { employees: true },
    })));
    const path = "/restaurants/:restaurantId/employees";
    const create = (restaurant, body, user = owner) => call(employees, "post", path, user,
      { restaurantId: String(restaurant) }, body);
    const form = { firstName: "Ari", lastName: "Fictif", phone: "0600000000", post: "Cuisine", contractType: "CDI" };
    for (const accountType of ["employee", "accountant"]) {
      assert.equal((await create(first, { ...form, accountType })).code, 400);
      assert.equal((await create(first, { ...form, accountType, email: "   " })).code, 400);
      assert.equal((await create(first, { ...form, accountType, email: "invalid" })).code, 400);
    }
    assert.equal(send.mock.callCount(), 0);
    const account = { ...form, email: `workforce-${first}@example.test` };
    const created = await create(first, account);
    assert.equal(created.code, 201);
    const employeeId = created.body.employeeId;
    const original = await Employee.collection.findOne({ _id: employeeId });
    const attachment = { ...account, existingEmployeeId: String(employeeId) };
    const linked = await create(second, { ...attachment, post: "Salle" });
    assert.equal(linked.code, 200);
    assert.deepEqual(linked.body.employeeId, employeeId);
    assert.equal((await create(second, attachment)).code, 409);
    assert.equal((await create(foreign, attachment, externalOwner)).code, 404);
    const linkedAccount = await Employee.collection.findOne({ _id: employeeId });
    assert.deepEqual(linkedAccount.restaurantProfiles[0], original.restaurantProfiles[0]);
    assert.equal(linkedAccount.restaurantProfiles[1].snapshot.post, "Salle");
    assert.equal(await TimeClockPin.countDocuments({ employee: employeeId }), 2);
    assert.equal(send.mock.callCount(), 1);
    const [invitation] = send.mock.calls[0].arguments;
    assert.equal(invitation.to[0].email, account.email);
    assert.match(invitation.htmlContent, /Mot de passe temporaire/);

    const accountant = { ...form, accountType: "accountant", email: `accountant-${first}@example.test` };
    assert.equal((await create(first, accountant)).code, 201);
    assert.equal(send.mock.callCount(), 2);
    const [accountantInvitation] = send.mock.calls[1].arguments;
    assert.equal(accountantInvitation.to[0].email, accountant.email);
    assert.match(accountantInvitation.htmlContent, /Mot de passe temporaire/);
  });

  await t.test("concurrent creation in one restaurant sends a single mocked invitation", async (st) => {
    const restaurantId = new ObjectId();
    const owner = { role: "owner", id: new ObjectId() };
    const sent = st.mock.fn(async () => ({}));
    st.mock.method(Brevo, "TransactionalEmailsApi", function MockBrevo() {
      return { sendTransacEmail: sent };
    });
    await Restaurant.collection.insertOne({
      _id: restaurantId, owner_id: owner.id, name: "Restaurant fictif",
      employees: [], menus: [], options: { employees: true },
    });
    const params = { restaurantId: String(restaurantId) };
    const path = "/restaurants/:restaurantId/employees";
    const form = { firstName: "Ari", lastName: "Fictif", phone: "0600000000", email: "invitation@example.test" };
    const create = (user) => call(employees, "post", path, user, params, form);
    assert.equal((await create({ role: "owner", id: new ObjectId() })).code, 403);
    const results = await Promise.all([create(owner), create(owner)]);
    assert.deepEqual(results.map(({ code }) => code).sort(), [201, 409]);
    assert.equal(await Employee.countDocuments({ email: form.email }), 1);
    assert.equal(sent.mock.callCount(), 1);
  });

  await t.test("legacy employees with a missing profile and shifts without attachments remain editable", async (st) => {
    const f = await fixture(2);
    assert.equal((await f.add(1)).code, 201);
    const [, otherProfile] = (await f.read()).restaurantProfiles;
    await Employee.collection.updateOne({ _id: f.employeeId }, {
      $pull: { restaurantProfiles: { restaurant: f.restaurantIds[0] } },
      $unset: { __v: "" },
    });
    assert.equal((await f.request("patch", employeePath, 0, { firstname: "Camille", post: "Salle" })).code, 200);
    const profiles = (await f.read()).restaurantProfiles;
    assert.deepEqual(profiles[0].planningFiles, otherProfile.planningFiles);
    assert.equal(profiles[1].snapshot.post, "Salle");

    const legacy = await fixture();
    const current = st.mock.method(cloudinary.uploader, "destroy", async () => ({ result: "ok" }));
    assert.deepEqual((await legacy.request("delete", shiftPath)).body.shifts, []);
    assert.equal(current.mock.callCount(), 0);
  });

  await t.test("HR document folders, confidentiality and deferred cleanup stay scoped to the profile", async (st) => {
    const f = await fixture(2);
    assert.equal((await f.add()).code, 201);
    const [original, otherProfile] = (await f.read()).restaurantProfiles;
    const base = `${employeePath}/documents`;
    const item = `${base}/:public_id(*)`;
    const download = `${item}/download`;
    const employee = { role: "employee", id: f.employeeId, restaurantId: f.restaurantIds[0] };
    const params = (index, public_id) => ({ restaurantId: String(f.restaurantIds[index]), employeeId: String(f.employeeId), public_id });
    const self = (index, path, public_id, scope = "personal") => call(employees, "get", path, employee, params(index, public_id), undefined, { query: { scope } });

    const storageUpload = st.mock.method(cloudinary.uploader, "upload_stream", (options, callback) => new Writable({
      write(_chunk, _encoding, done) { done(); },
      final(done) {
        assert.equal(options.type, "authenticated");
        assert.equal(options.resource_type, "raw");
        callback(null, { public_id: `${options.folder}/${options.public_id}`, resource_type: "raw" });
        done();
      },
    }));
    const requestDocument = (title, visibility) => {
      const boundary = "GustoPrivateDocuments";
      const metadata = JSON.stringify([{ title, category: "contract", visibility }]);
      const content = Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="metadata"\r\n\r\n${metadata}\r\n--${boundary}\r\nContent-Disposition: form-data; name="documents"; filename="specimen.pdf"\r\nContent-Type: application/pdf\r\n\r\n%PDF-1.7\n%%EOF\n\r\n--${boundary}--\r\n`);
      return Object.assign(Readable.from([content]), { headers: {
        "content-type": `multipart/form-data; boundary=${boundary}`,
        "content-length": String(content.length),
      } });
    };
    assert.equal(await f.request("get", base).then(({ body }) => body.documents[0].visibility), "internal");
    const results = await Promise.all([
      f.request("post", base, 0, undefined, {}, requestDocument("Contrat publié", "employee")),
      f.request("post", base, 0, undefined, {}, requestDocument("Note interne", "internal")),
    ]);
    assert.deepEqual(results.map(({ code }) => code), [200, 200]);
    const ownerDocuments = (await f.request("get", base)).body.documents;
    const published = ownerDocuments.find(({ title }) => title === "Contrat publié");
    const internal = ownerDocuments.find(({ title }) => title === "Note interne");
    assert.equal(published.category, "contract");
    assert.equal(ownerDocuments.length, 3);
    assert.deepEqual((await self(0, base)).body.documents.map(({ title }) => title), ["Contrat publié"]);
    assert.equal((await self(0, base, undefined, "manager")).body.documents.length, 3);
    assert.equal((await self(1, base)).code, 403);

    const providerUrl = st.mock.method(cloudinary.utils, "private_download_url", () => "https://storage.example.test/private");
    const transfer = st.mock.method(axios, "get", async () => ({ data: Readable.from([Buffer.from("%PDF-1.7")]) }));
    assert.equal((await self(0, download, internal.public_id)).code, 404);
    assert.equal((await self(0, download, "other-restaurant/unknown.pdf")).code, 404);
    assert.equal(transfer.mock.callCount(), 0);
    assert.equal((await self(0, download, published.public_id)).code, 200);
    assert.equal(providerUrl.mock.calls[0].arguments[2].type, "authenticated");
    assert.equal(transfer.mock.callCount(), 1);

    const metadata = { title: "Contrat modifié", category: "supporting", visibility: "internal", revision: published.revision };
    assert.equal((await f.request("patch", item, 0, { ...metadata, category: "invalid" }, { public_id: published.public_id })).code, 400);
    assert.equal((await f.request("patch", item, 0, metadata, { public_id: published.public_id })).code, 200);
    const obsolete = { ...metadata, visibility: "employee" };
    assert.equal((await f.request("patch", item, 0, obsolete, { public_id: published.public_id })).code, 409);
    assert.equal((await self(0, download, published.public_id)).code, 404);
    assert.deepEqual((await self(0, base)).body.documents, []);

    await Employee.collection.updateOne({ _id: f.employeeId }, { $set: { "restaurantProfiles.0.options.employees": false } });
    const deniedEdit = await call(employees, "patch", item, employee, params(0, published.public_id), metadata);
    assert.equal(deniedEdit.code, 403);
    const deniedDelete = await call(employees, "delete", item, employee, params(0, published.public_id));
    assert.equal(deniedDelete.code, 403);
    const updated = await f.read();
    const savedDocument = updated.restaurantProfiles[0].documents.find(({ public_id }) => public_id === published.public_id);
    assert.equal(savedDocument.updatedBy, String(f.owner.id));
    assert.equal(savedDocument.category, "supporting");
    assert.deepEqual(updated.restaurantProfiles[0].planningFiles, original.planningFiles);
    assert.deepEqual(updated.restaurantProfiles[0].shifts, original.shifts);
    assert.deepEqual(updated.restaurantProfiles[1], otherProfile);

    const queueFailure = st.mock.method(EmployeeAssetDeletion, "bulkWrite", async () => { throw new Error("Fictitious MongoDB failure"); });
    assert.equal((await f.request("delete", item, 0, undefined, { public_id: published.public_id })).code, 500);
    queueFailure.mock.restore();
    assert.equal((await f.request("get", base)).body.documents.some(({ public_id }) => public_id === published.public_id), true);
    const destroy = st.mock.method(cloudinary.uploader, "destroy", async () => ({ result: "unconfirmed" }));
    const removed = await f.request("delete", item, 0, undefined, { public_id: published.public_id });
    assert.equal(removed.code, 200);
    assert.equal(removed.body.assetCleanupPending, true);
    assert.equal(removed.body.documents.length, 2);
    assert.ok(await EmployeeAssetDeletion.exists({ public_id: published.public_id }));
    destroy.mock.mockImplementation(async () => ({ result: "ok" }));
    const queued = await EmployeeAssetDeletion.findOne({ public_id: published.public_id }).lean();
    await retryEmployeeAssetDeletions({ ids: [queued._id], now: new Date(Date.now() + 10 * 60_000) });
    assert.equal(await EmployeeAssetDeletion.exists({ public_id: published.public_id }), null);

    const persistFailure = st.mock.method(Employee, "findOneAndUpdate", () => ({
      lean: async () => { throw new Error("Fictitious persistence failure"); },
    }));
    assert.equal((await f.request("post", base, 0, undefined, {}, requestDocument("Échec", "internal"))).code, 500);
    persistFailure.mock.restore();
    assert.equal((await f.request("get", base)).body.documents.length, 2);
    assert.equal(destroy.mock.callCount(), 3);

    storageUpload.mock.mockImplementation((_options, callback) => new Writable({
      write(_chunk, _encoding, done) { done(); },
      final(done) { callback(new Error("Fictitious storage failure")); done(); },
    }));
    assert.equal((await f.request("post", base, 0, undefined, {}, requestDocument("Échec transfert", "internal"))).code, 500);
    assert.equal((await f.request("get", base)).body.documents.length, 2);

    const accountantId = new ObjectId();
    const accountant = { role: "accountant", id: accountantId, restaurantId: f.restaurantIds[0] };
    await Employee.collection.insertOne({ _id: accountantId, accountType: "accountant",
      restaurants: [f.restaurantIds[0]], restaurantProfiles: [{ restaurant: f.restaurantIds[0] }] });
    await Restaurant.updateOne({ _id: f.restaurantIds[0] }, { $addToSet: { employees: accountantId } });
    assert.deepEqual((await call(employees, "get", base, accountant, params(0))).body.documents, []);
    assert.equal((await call(employees, "post", base, accountant, params(0), undefined, requestDocument("Accès refusé", "employee"))).code, 403);
    assert.equal((await call(employees, "patch", item, accountant, params(0, internal.public_id), metadata)).code, 403);
    assert.equal((await call(employees, "delete", item, accountant, params(0, internal.public_id))).code, 403);
    assert.equal((await call(employees, "get", base, accountant, params(1))).code, 403);
  });

  await t.test("leave requests retain history, isolate restaurants, and require exact confirmation before replacing shifts", async () => {
    const f = await fixture(2);
    const leavePath = `${employeePath}/leave-requests`;
    const exact = `${leavePath}/:reqId`;
    const requestDate = { startDate: "2026-11-18", endDate: "2026-11-18", type: "morning", absenceType: "paid_leave", note: "Commentaire fictif" };
    const notifiedBefore = leaveNotifications.length;
    const created = await f.request("post", leavePath, 0, requestDate);
    assert.equal(created.code, 201);
    const reqId = String(created.body[0]._id);
    assert.equal((await f.request("post", leavePath, 0, requestDate)).code, 409);
    assert.equal((await f.request("get", leavePath, 1)).body.length, 0);
    assert.equal((await f.request("put", exact, 1, { status: "approved" }, { reqId })).code, 404);
    const edited = await f.request("put", exact, 0, { ...requestDate, note: "Motif actualisé fictif" }, { reqId });
    assert.equal(edited.code, 200);
    assert.equal(edited.body.leaveRequest.history[0].action, "edited");
    assert.equal(edited.body.leaveRequest.note, "Motif actualisé fictif");

    const params = { reqId };
    const preview = await f.request("get", `${exact}/conflicts`, 0, undefined, params);
    assert.equal(preview.code, 200);
    assert.equal(preview.body.conflictShifts.length, 1);
    const [conflict] = preview.body.conflictShifts;
    const decision = { status: "approved", resolveConflict: "delete_conflicting_shifts", decisionNote: "Décision fictive" };
    assert.equal((await f.request("put", exact, 0, { status: "approved" }, params)).code, 409);
    assert.equal((await f.request("put", exact, 0, { ...decision, confirmedConflicts: ["stale"] }, params)).code, 409);
    assert.equal((await f.read()).restaurantProfiles[0].shifts.length, 1);

    const confirmedConflicts = [`${conflict._id}:${+new Date(conflict.start)}:${+new Date(conflict.end)}`];
    const lockId = `${f.restaurantIds[0]}:2026-11-18`;
    await PlanningDay.collection.insertOne({ _id: lockId, restaurant: f.restaurantIds[0], date: "2026-11-18", lockedAt: new Date() });
    const locked = await f.request("get", `${exact}/conflicts`, 0, undefined, params);
    assert.equal(locked.body.locked.date, "2026-11-18");
    assert.equal((await f.request("put", exact, 0, { ...decision, confirmedConflicts }, params)).code, 423);
    assert.equal((await f.read()).restaurantProfiles[0].leaveRequests[0].status, "pending");
    await PlanningDay.deleteOne({ _id: lockId });

    const concurrent = await Promise.all([
      f.request("put", exact, 0, { ...decision, confirmedConflicts }, params),
      f.request("put", exact, 0, { ...decision, confirmedConflicts }, params),
    ]);
    assert.ok(concurrent.some(({ code }) => code === 200));
    assert.ok(concurrent.every(({ code }) => [200, 409].includes(code)));
    assert.equal((await f.request("put", exact, 0, { ...decision, confirmedConflicts }, params)).code, 200);
    const stored = (await f.read()).restaurantProfiles[0];
    assert.equal(stored.shifts.length, 1);
    assert.equal(stored.shifts[0].isLeave, true);
    assert.equal(stored.shifts[0].absenceDuration, "morning");
    assert.equal(stored.shifts[0].absenceType, "paid_leave");
    assert.equal(stored.shifts[0].requiresPlanningPublication, true);
    assert.deepEqual(stored.leaveRequests[0].history.map(({ to }) => to), ["pending", "approved"]);
    assert.deepEqual(leaveNotifications.slice(notifiedBefore).map(({ type }) => type), ["leave_request_created", "leave_request_decided"]);
    assert.equal(leaveNotifications.at(-1).recipientEmployeeId, String(f.employeeId));
    assert.equal((await f.request("put", exact, 0, { status: "canceled" }, params)).code, 200);
    assert.equal((await f.read()).restaurantProfiles[0].shifts.length, 0);
  });

  await t.test("a standard employee can create, read, edit and cancel their own pending requests only", async () => {
    const f = await fixture(2);
    const leavePath = `${employeePath}/leave-requests`;
    const restaurantId = String(f.restaurantIds[1]);
    const employeeId = String(f.employeeId);
    const employee = { role: "employee", id: f.employeeId, restaurantId };
    const endpoint = (method, path, extra, body) =>
      call(employees, method, path, employee, { restaurantId, employeeId, ...extra }, body);
    const form = { startDate: "2026-11-28", endDate: "2026-11-28", type: "afternoon" };
    const created = await endpoint("post", leavePath, {}, form);
    assert.equal(created.code, 201);
    const reqId = String(created.body[0]._id);
    assert.equal((await endpoint("get", leavePath, {})).body.length, 1);
    assert.equal((await endpoint("get", leavePath, { employeeId: String(new ObjectId()) })).code, 403);
    assert.equal((await endpoint("put", `${leavePath}/:reqId`, { reqId }, { status: "approved" })).code, 403);
    assert.equal((await endpoint("put", `${leavePath}/:reqId`, { reqId }, { ...form, note: "Fictif" })).code, 200);
    assert.equal((await endpoint("put", `${leavePath}/:reqId`, { reqId }, { status: "canceled" })).code, 200);
    assert.equal((await endpoint("get", leavePath, {})).body[0].status, "canceled");
    const pending = await endpoint("post", leavePath, {}, form);
    const refusedId = String(pending.body.at(-1)._id);
    assert.equal((await f.request("put", `${leavePath}/:reqId`, 1, { status: "rejected" }, { reqId: refusedId })).code, 200);
    assert.equal((await endpoint("get", leavePath, {})).body.at(-1).history.at(-1).to, "rejected");
  });

  await t.test("file deletion acknowledges Cloudinary success and already-absent files", async (st) => {
    const f = await fixture();
    const destroy = st.mock.method(cloudinary.uploader, "destroy", async (_id, options) => {
      assert.equal(options.resource_type, "raw");
      assert.equal(options.type, "authenticated");
      assert.equal(options.invalidate, true);
      return { result: "not found" };
    });
    const { body } = await f.add();
    assert.equal((await f.removeFile(body.files[0]._id)).code, 204);
    assert.equal((await f.read()).restaurantProfiles[0].planningFiles.length, 0);
    assert.equal(await EmployeeAssetDeletion.countDocuments(), 0);
    assert.equal(destroy.mock.callCount(), 1);
  });

  await t.test("unconfirmed deletions survive the request and are replayed once per attempt", async (st) => {
    const f = await fixture();
    const { body } = await f.add();
    const [file] = (await f.read()).restaurantProfiles[0].planningFiles;
    const destroy = st.mock.method(cloudinary.uploader, "destroy", async () => ({ result: "failed" }));
    const result = await f.removeFile(body.files[0]._id);
    assert.equal(result.code, 202);
    assert.deepEqual(result.body, { assetCleanupPending: true });
    const job = await EmployeeAssetDeletion.findOne({ public_id: file.public_id }).lean();
    assert.equal(job.delivery_type, "authenticated");
    assert.equal(job.attempts, 1);
    assert.equal((await f.read()).restaurantProfiles[0].planningFiles.length, 0);

    destroy.mock.mockImplementation(async () => { throw new Error("Unavailable"); });
    await retryEmployeeAssetDeletions({ now: new Date(+job.nextAttemptAt + 1) });
    const retried = await EmployeeAssetDeletion.findById(job._id).lean();
    assert.equal(retried.attempts, 2);
    const afterBackoff = new Date(+retried.nextAttemptAt + 1);
    destroy.mock.mockImplementation(async () => ({ result: "ok" }));
    await Promise.all([
      retryEmployeeAssetDeletions({ now: afterBackoff }),
      retryEmployeeAssetDeletions({ now: afterBackoff }),
    ]);
    assert.equal(destroy.mock.callCount(), 3);
    assert.equal(await EmployeeAssetDeletion.exists({ _id: job._id }), null);
  });

  await t.test("deleting a shift and a conflicting shift on leave approval preserve all pending file IDs", async (st) => {
    const f = await fixture();
    assert.equal((await f.add()).code, 201);
    assert.equal((await f.add()).code, 201);
    st.mock.method(cloudinary.uploader, "destroy", async () => ({ result: "unavailable" }));
    const [profile] = (await f.read()).restaurantProfiles;
    const ids = profile.planningFiles.map(({ public_id }) => public_id);
    const removed = await f.request("delete", shiftPath);
    assert.deepEqual(removed.body, { shifts: [], assetCleanupPending: true });
    assert.equal(await EmployeeAssetDeletion.countDocuments({ public_id: { $in: ids } }), 2);
    assert.equal((await f.read()).restaurantProfiles[0].documents.length, 1);

    const leave = await fixture();
    assert.equal((await leave.add()).code, 201);
    const leaveProfile = (await leave.read()).restaurantProfiles[0];
    const reqId = new ObjectId();
    await Employee.collection.updateOne({ _id: leave.employeeId }, {
      $push: { "restaurantProfiles.0.leaveRequests": {
        _id: reqId, start: leaveProfile.shifts[0].start, end: leaveProfile.shifts[0].end, status: "pending", type: "full",
      } },
    });
    const approved = await leave.request("put", `${employeePath}/leave-requests/:reqId`, 0,
      { status: "approved", resolveConflict: "delete_conflicting_shifts" }, { reqId: String(reqId) });
    assert.equal(approved.code, 200);
    assert.equal(approved.body.assetCleanupPending, true);
    assert.equal((await leave.read()).restaurantProfiles[0].shifts[0].isLeave, true);
    assert.ok(await EmployeeAssetDeletion.exists({ public_id: leaveProfile.planningFiles[0].public_id }));
  });

  await t.test("archiving keeps closed payroll, private assets and other memberships; reactivation keeps the same profile", async (st) => {
    const f = await fixture(2);
    assert.equal((await f.add()).code, 201);
    assert.equal((await f.add(1)).code, 201);
    const restaurant = f.restaurantIds[0];
    const date = "2021-11-21";
    const start = new Date(`${date}T08:00:00+01:00`);
    const end = new Date(`${date}T12:00:00+01:00`);
    const leave = new ObjectId();
    const optionalPiece = `private-docs/${restaurant}/optional.pdf`;
    await Employee.collection.updateOne({ _id: f.employeeId }, { $set: {
      secuNumber: "ID-FICTIF",
      profilePicture: { public_id: `fake-photo/${f.employeeId}`, url: "https://example.invalid/photo" },
      "restaurantProfiles.0.snapshot.dateOnPost": new Date("2021-10-01"),
      "restaurantProfiles.0.snapshot.email": f.email,
      "restaurantProfiles.0.employment.contractualUnit": "week",
      "restaurantProfiles.0.employment.contractualValue": 35,
      "restaurantProfiles.0.shifts.0.start": start,
      "restaurantProfiles.0.shifts.0.end": end,
      "restaurantProfiles.0.leaveRequests": [{
        _id: leave, start: new Date(`${date}T13:00:00+01:00`), end: new Date(`${date}T17:00:00+01:00`),
        type: "custom", absenceType: "paid_leave", status: "approved",
        history: [{ action: "decision", to: "approved", at: start }],
      }],
    }, $push: { "restaurantProfiles.0.documents": {
      public_id: optionalPiece, filename: "optionnel.pdf", title: "Pièce optionnelle", resource_type: "raw", delivery_type: "authenticated",
    } } });
    const [first, other] = (await f.read()).restaurantProfiles;
    const pin = await TimeClockPin.create({
      restaurant, employee: f.employeeId, ...sealPin({ restaurant, employee: f.employeeId, pin: "1234", profile: String(first._id), changedBy: String(f.owner.id) }),
    });
    const otherPin = await TimeClockPin.create({
      restaurant: f.restaurantIds[1], employee: f.employeeId, ...sealPin({ restaurant: f.restaurantIds[1], employee: f.employeeId,
        pin: "1234", profile: String(other._id), changedBy: String(f.owner.id) }),
    });
    const inputId = `${restaurant}:${first._id}:amendment:${date}`;
    await PersonnelInput.create({ _id: inputId, restaurant, employee: f.employeeId, profile: first._id, kind: "amendment",
      date, values: { weeklyHours: 37 }, revision: 1, updatedBy: String(f.owner.id) });
    const collective = { restaurant, revision: 1, updatedBy: String(f.owner.id) };
    await PersonnelInput.create([
      { ...collective, _id: `${restaurant}:test-overtime`, date: "2021-11-15", kind: "overtime",
        values: validateValues("overtime", { enabled: true, source: "hybrid", ordinary: 35, firstEnd: 39, secondEnd: 43,
          firstRate: 10, secondRate: 20, lastRate: 50, complementBand: 10, complementFirstRate: 10, complementLastRate: 25,
          workdays: 5, creditedAbsences: [], nightRate: null, sundayRate: 50, holidayRate: null }) },
      { ...collective, _id: `${restaurant}:test-meals`, date: "2021-11", kind: "rules",
        values: { mode: "combined", basis: "days", quantity: 1 } },
      { ...collective, _id: `${restaurant}:test-leave`, date, kind: "leave", employee: f.employeeId, profile: first._id,
        values: { previousBalance: 1, currentBalance: 2, leaveAvailable: 3 } },
    ]);
    await PlanningDay.create({ _id: `${restaurant}:${date}`, restaurant, date, lockedAt: new Date() });
    const session = await TimeClockSession.create({ employee: f.employeeId, restaurant, businessDate: date,
      status: "closed", clockInAt: start, clockOutAt: end,
      reviews: [{ type: "validated", actorRole: "owner", actorId: f.owner.id, at: end }] });
    const assets = st.mock.method(cloudinary.uploader, "destroy", async () => ({ result: "ok" }));
    const range = { from: date, to: date };
    const scopedOwner = { ...f.owner, restaurantId: String(restaurant) };
    const params = { restaurantId: String(restaurant), employeeId: String(f.employeeId) };
    const reportPath = "/restaurants/:restaurantId/employees/reports";
    const clockPath = "/restaurants/:restaurantId/time-clock";
    const planningPath = "/restaurants/:restaurantId/employees/planning";
    const archivePath = "/restaurants/:restaurantId/employees/archived";
    const erasePath = `${archivePath}/:employeeId/erasure`;
    assert.equal((await f.request("get", erasePath)).code, 409);
    assert.equal((await call(employees, "get", erasePath, { role: "employee", id: f.employeeId }, params)).code, 403);
    assert.equal((await call(employees, "get", erasePath, { role: "owner", id: new ObjectId() }, params)).code, 403);
    function readClock(method, path, body, query) {
      return call(timeClock, method, path, scopedOwner, params, body, { query });
    }
    const supportOwner = { ...scopedOwner, superAdmin: true, authMethod: "super_admin", superAdminSessionId: randomUUID() };
    async function historicalData(viewer = scopedOwner) {
      const report = await call(timeClock, "get", reportPath, viewer, params, null, { query: range });
      assert.equal(report.code, 200);
      const history = await call(timeClock, "get", `${clockPath}/register`, viewer, params, null, { query: { ...range, view: "history" } });
      assert.equal(history.body.history.length, 1);
      const sheets = [];
      for (const [router, path] of [
        [timeClock, `${reportPath}/export/excel`],
        [timeClock, `${clockPath}/export/excel`],
        [employees, `${planningPath}/export/excel`],
      ]) {
        const result = await call(router, "post", path, viewer, params, range);
        assert.equal(result.code, 200);
        sheets.push(workbookSheets(result.body));
      }
      for (const [router, path] of [[timeClock, clockPath], [employees, planningPath]]) {
        const result = await call(router, "post", `${path}/export/pdf`, viewer, params, range);
        assert.equal(result.code, 200);
        assert.equal(result.body.subarray(0, 4).toString(), "%PDF");
      }
      return { values: report.body.rows[0].values, sheets, history: history.body.history };
    }
    const before = await historicalData();
    assert.equal(before.values.paid, 240);
    assert.equal(before.values.planned, 240);
    assert.equal(before.values.weeklyHours, 37);
    assert.equal(before.values.absenceCount, 1);
    assert.equal(before.values.sunday50, 240);
    assert.equal(before.values.mealsDue, 1);
    assert.equal(before.values.leaveAvailable, 3);
    assert.equal(before.sheets[0].length, 5);

    assert.equal((await f.request("delete", employeePath)).code, 200);
    const employee = await f.read();
    assert.deepEqual(employee.restaurants, [f.restaurantIds[1]]);
    assert.deepEqual(employee.restaurantProfiles[1], other);
    assert.equal(employee.sessionVersion, 8);
    assert.equal(await isAccountSessionValid({ role: "employee", id: f.employeeId, sessionVersion: 7 }), false);
    assert.deepEqual(employee.restaurantProfiles[0].documents, first.documents);
    assert.deepEqual(employee.restaurantProfiles[0].planningFiles, first.planningFiles);
    assert.deepEqual(employee.restaurantProfiles[0].leaveRequests, first.leaveRequests);
    assert.ok(employee.restaurantProfiles[0].archivedAt instanceof Date);
    assert.deepEqual((await Restaurant.collection.findOne({ _id: f.restaurantIds[0] })).employees, []);
    assert.equal(await TimeClockPin.findById(pin._id), null);
    assert.ok(await TimeClockPin.exists({ _id: otherPin._id, revision: otherPin.revision }));
    assert.ok(await TimeClockSession.exists({ _id: session._id, status: "closed" }));
    assert.deepEqual(await historicalData(), before);
    const inputParams = { ...params, kind: "amendment", date };
    assert.deepEqual((await call(timeClock, "get", `${reportPath}/inputs/:employeeId/:kind/:date`,
      scopedOwner, inputParams)).body, { values: { weeklyHours: 37 }, revision: 1 });
    assert.equal((await call(timeClock, "put", `${reportPath}/inputs/:employeeId/:kind/:date`,
      scopedOwner, inputParams, { values: { weeklyHours: 39 }, revision: 1 })).code, 404);
    assert.equal((await f.request("get", `${employeePath}/leave-requests`)).body[0].history[0].to, "approved");
    assert.equal((await f.request("get", `${employeePath}/documents`)).body.documents[0].title, "Contrat");
    assert.equal((await f.request("get", archivePath)).body.employees[0].id, String(f.employeeId));
    assert.equal((await call(employees, "post", `${archivePath}/:employeeId/reactivate`, { role: "owner", id: new ObjectId() }, params)).code, 403);
    assert.equal((await f.request("post", `${archivePath}/:employeeId/reactivate`)).code, 200);
    const active = await f.read();
    assert.equal(String(active.restaurantProfiles[0]._id), String(first._id));
    assert.equal(active.restaurantProfiles[0].archivedAt, undefined);
    assert.deepEqual(active.restaurantProfiles[0].membershipHistory.map(({ action }) => action), ["archived", "reactivated"]);
    assert.notEqual(active.restaurantProfiles[0].options.employees, true);
    assert.ok(await TimeClockPin.exists({ restaurant, employee: f.employeeId, revision: { $ne: pin.revision } }));
    assert.deepEqual(await historicalData(), before);
    assert.equal((await f.request("post", `${archivePath}/:employeeId/reactivate`)).code, 409);
    assert.equal((await f.request("delete", employeePath)).code, 200);
    assert.equal(assets.mock.callCount(), 0);
    const { revision, shared, documents } = (await f.request("get", erasePath)).body;
    assert.equal(shared, true);
    assert.equal(documents.length, 2);
    const erase = { revision, confirmation: "SUPPRIMER", retentionReviewed: true, documentIds: [optionalPiece], ...retention };
    assert.deepEqual((await call(employees, "get", erasePath, supportOwner, params)).body, { revision, shared, documents });
    assert.equal((await call(employees, "post", erasePath, supportOwner, params, { ...erase, confirmation: "" })).code, 400);
    assert.equal((await f.request("post", erasePath, 0, { ...erase, confirmation: "" })).code, 400);
    assert.equal((await f.request("post", erasePath, 0, { ...erase, retentionReviewed: false })).code, 400);
    assert.equal((await f.request("post", erasePath, 0, { ...erase, retentionUntil: "2020-01-01" })).code, 400);
    assert.equal((await f.request("post", erasePath, 0, { ...erase, retentionReason: " " })).code, 400);
    assert.equal((await f.request("post", erasePath, 0, { ...erase, revision: revision - 1 })).code, 409);
    assert.equal((await f.request("post", erasePath, 0, { ...erase, documentIds: [other.documents[0].public_id] })).code, 409);
    const beforeFailure = await f.read();
    const writeSessions = st.mock.method(TimeClockSession, "updateMany", async () => {
      throw new Error("Fixture erasure write failure");
    });
    try {
      assert.equal((await f.request("post", erasePath, 0, erase)).code, 500);
    } finally {
      writeSessions.mock.restore();
    }
    assert.deepEqual(await f.read(), beforeFailure);
    assert.equal(await EmployeeAssetDeletion.exists({ public_id: optionalPiece }), null);
    assert.equal(assets.mock.callCount(), 0);
    assets.mock.mockImplementation(async () => ({ result: "unavailable" }));
    const eraseAsSupport = () => call(employees, "post", erasePath, supportOwner, params, erase);
    const [removed, replay] = await Promise.all([eraseAsSupport(), eraseAsSupport()]);
    assert.equal(removed.code, 200);
    assert.equal(replay.code, 200);
    assert.deepEqual(removed.body, replay.body);
    assert.equal(removed.body.accountErased, false);
    assert.equal(removed.body.removedDocuments, 1);
    assert.equal(removed.body.retainedDocuments, 1);
    assert.equal(removed.body.assetCleanupPending, true);
    assert.equal(assets.mock.callCount(), 1);
    const erased = await f.read();
    assert.equal(erased.restaurantProfiles[0].erasure.authMethod, "super_admin");
    assert.equal(erased.restaurantProfiles[0].erasure.superAdminSessionId, supportOwner.superAdminSessionId);
    const pseudonym = erased.restaurantProfiles[0].snapshot;
    assert.equal(pseudonym.firstname, "Ancien membre");
    assert.equal(pseudonym.email, undefined);
    assert.equal(erased.rhArchiveIdentities[String(restaurant)].firstname, "Ari");
    assert.equal(erased.rhArchiveIdentities[String(restaurant)].lastname, "Test");
    assert.equal((await Employee.findById(f.employeeId).select("restaurantProfiles").lean()).rhArchiveIdentities, undefined);
    assert.equal(erased.email, f.email);
    assert.deepEqual(erased.restaurantProfiles[1], other);
    assert.ok(await TimeClockPin.exists({ _id: otherPin._id, revision: otherPin.revision }));
    assert.equal((await f.request("post", `${archivePath}/:employeeId/reactivate`)).code, 409);
    const archive = (await f.request("get", archivePath)).body;
    assert.deepEqual(archive.employees, []);
    assert.equal(archive.historical[0].retainedDocuments, 1);
    assert.equal(archive.historical[0].firstname, "Ari");
    assert.equal(archive.historical[0].lastname, "Test");
    assert.deepEqual((await call(employees, "get", archivePath, supportOwner, params)).body, archive);
    assert.deepEqual((await f.request("get", `${employeePath}/documents`)).body.documents.map(({ title }) => title), ["Contrat"]);
    const after = await historicalData();
    assert.deepEqual(after.values, before.values);
    const withoutContact = before.sheets.map((workbook) => workbook.map((sheet) => sheet
      .replaceAll(f.email, "").replaceAll("0600000000", "")));
    assert.doesNotMatch(after.sheets.flat().join(""), /@example\.test|0600000000/);
    assert.deepEqual(after.sheets, withoutContact);
    assert.equal(after.history[0].employee.firstname, "Ari");
    assert.deepEqual(await historicalData(supportOwner), after);
    assert.equal(after.history[0].at.toISOString(), before.history[0].at.toISOString());
    assert.ok(await PlanningDay.exists({ restaurant, date, lockedAt: { $ne: null } }));
    const queued = await EmployeeAssetDeletion.findOne({ public_id: optionalPiece }).lean();
    assert.ok(queued);
    assert.equal(await EmployeeAssetDeletion.exists({ public_id: first.documents[0].public_id }), null);
    assets.mock.mockImplementation(async () => ({ result: "ok" }));
    await retryEmployeeAssetDeletions({ ids: [queued._id], now: new Date(+queued.nextAttemptAt + 1) });
    assert.equal((await f.request("get", erasePath)).body.result.assetCleanupPending, false);

    const changed = await f.request("patch", employeePath, 1, { email: "compte-partage-fictif@example.test" });
    assert.equal(changed.code, 200);
    assert.equal((await f.read()).restaurantProfiles[0].snapshot.email, undefined);
    assert.equal((await f.request("delete", employeePath, 1)).code, 200);
    const last = (await f.request("get", erasePath, 1)).body;
    assert.equal(last.shared, false);
    const lastErasure = await f.request("post", erasePath, 1, { ...erase, revision: last.revision, documentIds: [] });
    assert.equal(lastErasure.body.accountErased, true);
    const former = await f.read();
    assert.deepEqual(former.restaurants, []);
    assert.equal(former.email, undefined);
    assert.equal(former.secuNumber, undefined);
    assert.equal(former.profilePicture, undefined);
    assert.ok(former.restaurantProfiles.every(({ archivedAt, erasure }) => archivedAt instanceof Date && erasure.at instanceof Date));
    assert.deepEqual(await historicalData(), after);
    await Employee.collection.updateOne({ _id: f.employeeId }, { $set: { [`rhArchiveIdentities.${restaurant}.until`]: "2020-01-01" } });
    const expired = await readClock("get", reportPath, null, range);
    assert.equal(expired.body.rows[0].employee.firstname, "Ancien membre");
    assert.deepEqual(expired.body.rows[0].values, after.values);
  });

  await t.test("erasure fences a concurrent payroll correction and preserves a second archived dossier", async (st) => {
    const f = await fixture(2);
    const [restaurant, otherRestaurant] = f.restaurantIds;
    const employeeSnapshot = { firstname: "Ari", lastname: "Test", email: f.email };
    const date = "2026-11-18";
    const session = await TimeClockSession.create({ restaurant, employee: f.employeeId, businessDate: date,
      employeeSnapshot, status: "closed", clockInAt: new Date(`${date}T08:00:00Z`), clockOutAt: new Date(`${date}T12:00:00Z`) });
    await TimeClockSession.create({ restaurant: otherRestaurant, employee: f.employeeId, businessDate: date,
      employeeSnapshot, status: "closed", clockInAt: session.clockInAt, clockOutAt: session.clockOutAt });

    assert.equal((await f.request("delete", employeePath)).code, 200);
    assert.equal((await f.request("delete", employeePath, 1)).code, 200);
    const before = await f.read();
    const erasePath = "/restaurants/:restaurantId/employees/archived/:employeeId/erasure";
    const { revision, shared } = (await f.request("get", erasePath)).body;
    assert.equal(shared, true);
    const correctionStarted = Promise.withResolvers();
    const resumeCorrection = Promise.withResolvers();
    const originalFind = TimeClockSession.findOne;
    const find = st.mock.method(TimeClockSession, "findOne", async function (...args) {
      const stored = await originalFind.apply(this, args);
      correctionStarted.resolve();
      await resumeCorrection.promise;
      return stored;
    });
    const correction = call(timeClock, "put", "/restaurants/:restaurantId/time-clock/sessions/:sessionId/payroll",
      { ...f.owner, restaurantId: String(restaurant) }, { restaurantId: String(restaurant), sessionId: String(session._id) },
      { expectedRevision: session.__v, expectedUpdatedAt: session.updatedAt.toISOString(),
        clockOutAt: `${date}T12:30:00Z`, reason: "Correction fictive concurrente" });
    const erase = { revision, confirmation: "SUPPRIMER", retentionReviewed: true, documentIds: [], ...retention };
    try {
      assert.equal(await Promise.race([correctionStarted.promise.then(() => true), correction.then(() => false)]), true);
      find.mock.restore();
      const result = await f.request("post", erasePath, 0, erase);
      assert.equal(result.code, 200);
      assert.equal(result.body.accountErased, false);
    } finally {
      resumeCorrection.resolve();
    }
    assert.equal((await correction).code, 409);
    const updated = await TimeClockSession.findById(session._id).lean();
    assert.equal(updated.employeeSnapshot.firstname, "Ancien membre");
    assert.equal(updated.employeeSnapshot.email, undefined);
    assert.equal(updated.payroll, undefined);
    assert.deepEqual(updated.clockOutAt, session.clockOutAt);
    assert.deepEqual(updated.updatedAt, session.updatedAt);
    assert.deepEqual((await f.read()).restaurantProfiles[1], before.restaurantProfiles[1]);
    assert.equal((await TimeClockSession.findOne({ restaurant: otherRestaurant }).lean()).employeeSnapshot.email, f.email);

    const last = (await f.request("get", erasePath, 1)).body;
    assert.equal(last.shared, false);
    const result = await f.request("post", erasePath, 1, { ...erase, revision: last.revision });
    assert.equal(result.code, 200);
    assert.equal(result.body.accountErased, true);
    assert.equal((await f.read()).email, undefined);
  });

  await t.test("an archived dossier without activity erases contact and credentials while keeping a non-reactivatable reference", async () => {
    const f = await fixture();
    await Employee.collection.updateOne({ _id: f.employeeId }, { $set: {
      "restaurantProfiles.0.shifts": [], "restaurantProfiles.0.documents": [], password: "fixture-no-real-password",
      address: "Adresse fictive", emergencyContact: "Contact fictif",
    } });
    const path = "/restaurants/:restaurantId/employees/archived/:employeeId/erasure";
    assert.equal((await f.request("delete", employeePath)).code, 200);
    const { revision } = (await f.request("get", path)).body;
    const result = await f.request("post", path, 0, { revision, confirmation: "SUPPRIMER", retentionReviewed: true, documentIds: [], ...retention });
    assert.equal(result.code, 200);
    assert.equal(result.body.retainedDocuments, 0);
    const employee = await f.read();
    for (const field of ["email", "password", "address", "emergencyContact"]) assert.equal(employee[field], undefined);
    assert.equal(employee.restaurantProfiles[0].snapshot.firstname, "Ancien membre");
    assert.equal((await f.request("post", "/restaurants/:restaurantId/employees/archived/:employeeId/reactivate")).code, 409);
  });

  await t.test("a running service blocks archival and a failed PIN revocation rolls back the membership change", async (st) => {
    const f = await fixture();
    const restaurant = f.restaurantIds[0];
    const session = await TimeClockSession.create({ employee: f.employeeId, restaurant, businessDate: "2026-11-18",
      status: "open", clockInAt: new Date("2026-11-18T08:00:00Z") });
    assert.equal((await f.request("delete", employeePath)).code, 409);
    await session.deleteOne();
    st.mock.method(TimeClockPin, "deleteOne", async () => { throw new Error("Fixture PIN revocation failure"); });
    assert.equal((await f.request("delete", employeePath)).code, 500);
    assert.equal((await f.read()).restaurantProfiles[0].archivedAt, undefined);
    assert.deepEqual((await Restaurant.collection.findOne({ _id: restaurant })).employees, [f.employeeId]);
  });

  await t.test("a failed durable job write rolls back the shift and its attachment references", async (st) => {
    const f = await fixture();
    assert.equal((await f.add()).code, 201);
    const [profile] = (await f.read()).restaurantProfiles;
    st.mock.method(EmployeeAssetDeletion, "bulkWrite", async () => { throw new Error("Fixture queue write failure"); });
    const destroy = st.mock.method(cloudinary.uploader, "destroy", async () => ({ result: "ok" }));
    assert.equal((await f.request("delete", shiftPath)).code, 500);
    assert.deepEqual((await f.read()).restaurantProfiles[0], profile);
    assert.equal(destroy.mock.callCount(), 0);

  });

  await t.test("a Cloudinary upload that finishes after shift deletion is recorded for cleanup", async (st) => {
    const f = await fixture();
    const started = Promise.withResolvers();
    const release = Promise.withResolvers();
    st.mock.method(cloudinary.uploader, "destroy", async () => ({ result: "failed" }));
    st.mock.method(cloudinary.uploader, "upload_stream", (options, callback) => new Writable({
      write(_chunk, _encoding, done) { done(); },
      final(done) {
        const publicId = `${options.folder}/${options.public_id}`;
        started.resolve(publicId);
        release.promise.then(() => {
          callback(null, { public_id: publicId });
          done();
        });
      },
    }));
    const adding = f.add();
    const publicId = await started.promise;
    try {
      assert.deepEqual((await f.request("delete", shiftPath)).body.shifts, []);
    } finally {
      release.resolve();
    }
    assert.equal((await adding).code, 409);
    assert.ok(await EmployeeAssetDeletion.exists({ public_id: publicId }));
  });
});
