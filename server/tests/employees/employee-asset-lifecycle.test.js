const assert = require("node:assert/strict");
const { randomUUID } = require("node:crypto");
const { once } = require("node:events");
const { Readable, Writable } = require("node:stream");
const { test } = require("node:test");
const mongoose = require("mongoose");
const cloudinary = require("cloudinary").v2;

const testUri = process.env.GUSTO_HR_TEST_MONGO_URI;
const { ObjectId } = mongoose.Types;
const employeePath = "/restaurants/:restaurantId/employees/:employeeId";
const shiftPath = `${employeePath}/shifts/:shiftId`;
const filesPath = `${shiftPath}/files`;

process.env.STRIPE_API_SECRET_KEY ||= "sk_test_isolated_hr_lifecycle";
process.env.JWT_SECRET ||= "isolated-hr-lifecycle-fixture";
for (const [name, method] of [
  ["shared/notifications", "createAndBroadcastNotification"],
  ["gift-cards/gift-card-lifecycle", "refreshGiftCardLifecycle"],
]) {
  const filename = require.resolve(`../../services/${name}.service`);
  require.cache[filename] = {
    id: filename, filename, loaded: true, exports: { [method]: async () => null },
  };
}

require("../../models/menu.model");
const Employee = require("../../models/employee.model");
const Restaurant = require("../../models/restaurant.model");
const EmployeeAssetDeletion = require("../../models/employee-asset-deletion.model");
const { retryEmployeeAssetDeletions } = require("../../services/employees/employee-asset-deletion.service");
const employees = require("../../routes/employees.routes");
const restaurants = require("../../routes/restaurants.routes");

function call(router, method, path, user, params, body, request = {}) {
  const route = router.stack.find((layer) => layer.route?.path === path && layer.route.methods[method]).route;
  const req = Object.assign(request, { user, params, body, headers: request.headers || {} });
  const res = new Writable({ write(_chunk, _encoding, done) { done(); } });
  res.code = 200;
  res.status = (code) => { res.code = code; return res; };
  res.json = (result) => { res.body = result; return res.end(); };
  res.setHeader = () => {};
  const finished = once(res, "finish");
  const handlers = route.stack.filter(({ handle }) => handle.name !== "authenticateToken");
  let index = 0;
  const next = () => handlers[index++].handle(req, res, next);
  return Promise.resolve(next()).then(() => finished).then(() => res);
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
      contractualUnit: "week", options: { employees: true, reservations: true },
    });
    assert.equal(result.code, 200);
    assert.equal(JSON.stringify(result.body).includes("planningFiles"), false);
    const updated = await f.read();
    const [first, second] = updated.restaurantProfiles;
    assert.equal(first.snapshot.post, "Salle");
    assert.equal(first.employment.contractType, "CDD");
    assert.equal(first.employment.contractualValue, 28);
    assert.equal(first.options.reservations, true);
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
      await Restaurant.collection.insertOne({ _id, owner_id: f.owner.id, name: "Rattachement", employees: [], menus: [] });
      assert.equal((await call(router, "post", path, f.owner, { restaurantId: String(_id) }, body)).code, 200);
      const employee = await f.read();
      assert.equal(employee.restaurantProfiles.some(({ restaurant }) => restaurant.equals(_id)), true);
      assert.deepEqual(employee.restaurantProfiles[0], original);
    }
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

  await t.test("detaching and deleting an account queue scoped cleanup even after the employee record is gone", async (st) => {
    const f = await fixture(2);
    assert.equal((await f.add()).code, 201);
    assert.equal((await f.add(1)).code, 201);
    const [first, other] = (await f.read()).restaurantProfiles;
    const assets = st.mock.method(cloudinary.uploader, "destroy", async () => ({ result: "unavailable" }));
    assert.equal((await f.request("delete", employeePath)).body.assetCleanupPending, true);
    const employee = await f.read();
    assert.deepEqual(employee.restaurants, [f.restaurantIds[1]]);
    assert.deepEqual(employee.restaurantProfiles, [other]);
    assert.deepEqual((await Restaurant.collection.findOne({ _id: f.restaurantIds[0] })).employees, []);
    assert.ok(await EmployeeAssetDeletion.exists({ public_id: first.planningFiles[0].public_id }));
    assert.equal(await EmployeeAssetDeletion.exists({ public_id: other.planningFiles[0].public_id }), null);
    assert.equal((await f.request("delete", employeePath, 1)).body.assetCleanupPending, true);
    assert.equal(await f.read(), null);
    assert.ok(await EmployeeAssetDeletion.exists({ public_id: other.planningFiles[0].public_id }));
    assert.equal(assets.mock.callCount(), 4);
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

    assert.equal((await f.request("delete", employeePath)).code, 500);
    assert.deepEqual((await f.read()).restaurantProfiles[0], profile);
    assert.deepEqual((await Restaurant.collection.findOne({ _id: f.restaurantIds[0] })).employees, [f.employeeId]);
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
