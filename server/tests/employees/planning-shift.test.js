const assert = require("node:assert/strict");
const { randomUUID } = require("node:crypto");
const { once } = require("node:events");
const { Readable, Writable } = require("node:stream");
const test = require("node:test");
const axios = require("axios");
const cloudinary = require("cloudinary").v2;
const { Types, connection } = require("mongoose");
const EmployeeModel = require("../../models/employee.model");
const RestaurantModel = require("../../models/restaurant.model");
const sse = require("../../services/shared/sse-bus.service");
const { PlanningDay } = require("../../models/planning-period.model");

for (const [name, method] of [
  ["shared/notifications", "createAndBroadcastNotification"],
  ["gift-cards/gift-card-lifecycle", "refreshGiftCardLifecycle"],
]) {
  const filename = require.resolve(`../../services/${name}.service`);
  require.cache[filename] = { id: filename, filename, loaded: true, exports: { [method]: async () => null } };
}

const capturedExports = {};
for (const [service, method, format] of [
  ["pdf/render-planning-export", "buildPlanningExportPdf", "pdf"],
  ["excel/render-planning-export-workbook", "buildWorkbookBuffer", "excel"],
]) {
  const filename = require.resolve(`../../services/${service}.service`);
  const render = require(filename)[method];
  require.cache[filename].exports[method] = (payload) => {
    capturedExports[format] = payload;
    return render(payload);
  };
}

const router = require("../../routes/employees.routes");
const basePath = "/restaurants/:restaurantId/employees/:employeeId/shifts";
const filePath = `${basePath}/:shiftId/files`;
const work = (start, end, details = {}) => ({ start, end, title: "Service", ...details });
const first = work("2026-03-28T21:00:00.000Z", "2026-03-29T04:00:00.000Z", {
  breakMinutes: 30, position: "Cuisine", notes: "Préparer la fermeture",
});
const second = work("2026-03-29T20:00:00.000Z", "2026-03-30T04:00:00.000Z", {
  breakMinutes: 30, position: "Salle",
});

function route(method, path) {
  return router.stack.find((layer) => layer.route?.path === path && layer.route.methods[method])
    .route.stack.map(({ handle }) => handle);
}

function response() {
  const chunks = [];
  const res = new Writable({ write(chunk, _encoding, done) { chunks.push(chunk); done(); } });
  res.code = 200;
  res.headers = {};
  res.status = (code) => { res.code = code; return res; };
  res.json = res.send = (body) => { res.body = body; res.end(); return res; };
  res.setHeader = (name, value) => { res.headers[name.toLowerCase()] = value; };
  res.download = () => Buffer.concat(chunks);
  return res;
}

function fixture(t) {
  t.mock.method(connection, "transaction", (run) => run(null));
  t.mock.method(RestaurantModel.collection, "updateOne", async () => ({ modifiedCount: 1 }));
  t.mock.method(PlanningDay, "find", () => ({ select: () => ({ session: () => ({ lean: async () => [] }) }) }));
  const restaurantId = new Types.ObjectId();
  const otherRestaurant = new Types.ObjectId();
  const employeeId = new Types.ObjectId();
  const ownerId = new Types.ObjectId();
  const profile = { restaurant: restaurantId, shifts: [], planningBatches: [], planningFiles: [] };
  const employee = { _id: employeeId, restaurants: [restaurantId], restaurantProfiles: [profile] };
  const matchTenant = (query) => String(query.restaurants) === String(restaurantId) && String(query._id) === String(employeeId);
  t.mock.method(RestaurantModel, "findById", (id) => ({
    select: async () => ({ _id: id, owner_id: ownerId, employees: [employeeId], name: "Test" }),
  }));
  t.mock.method(EmployeeModel, "findById", () => {
    const result = Promise.resolve(employee);
    result.select = () => ({ lean: async () => ({ accountType: "employee" }) });
    return result;
  });
  t.mock.method(EmployeeModel, "exists", async (query) => matchTenant(query));
  t.mock.method(EmployeeModel, "findOne", (query) => ({ lean: async () => matchTenant(query) ? employee : null }));
  t.mock.method(EmployeeModel.collection, "findOne", async (query) => matchTenant(query) ? employee : null);
  t.mock.method(EmployeeModel, "find", () => ({ lean: async () => [employee] }));
  t.mock.method(EmployeeModel, "updateOne", async () => ({ modifiedCount: 0 }));
  function call(method, path, options = {}) {
    const handlers = route(method, path);
    const req = Object.assign(options.stream || {}, {
      params: { restaurantId, employeeId, ...options.params },
      user: options.user || { role: "owner", id: ownerId },
      body: options.body,
    });
    const res = response();
    const done = once(res, "finish");
    let index = 0;
    const next = () => handlers[index++](req, res, next);
    return Promise.resolve(next()).then(() => done).then(() => res);
  }
  return { restaurantId, otherRestaurant, employeeId, profile, employee, call };
}

test("the batch route atomically writes the series and its receipt, replays it, and rejects conflicts", async (t) => {
  const { call, profile, restaurantId } = fixture(t);
  const write = t.mock.method(EmployeeModel, "findOneAndUpdate", (filter, update, options) => ({
    lean: async () => {
      assert.equal(String(filter.restaurantProfiles.$elemMatch.restaurant), String(restaurantId));
      assert.equal(filter.restaurantProfiles.$elemMatch.shifts.$not.$elemMatch.$or.length, 2);
      assert.deepEqual(options.arrayFilters, [{ "profile.restaurant": restaurantId }]);
      const entries = update.$push["restaurantProfiles.$[profile].shifts"].$each;
      profile.shifts.push(...entries);
      profile.planningBatches.push(update.$push["restaurantProfiles.$[profile].planningBatches"]);
      return { restaurantProfiles: [profile] };
    },
  }));
  const body = { requestId: randomUUID(), repeating: true, shifts: [first, second] };
  const create = (payload, options) => call("post", `${basePath}/batch`, { body: payload, ...options });
  assert.equal((await create(body)).code, 201);
  assert.equal(profile.shifts[0].notes, first.notes);
  assert.equal(profile.shifts[0].breakMinutes, 30);
  assert.equal(profile.shifts[1].position, "Salle");
  assert.deepEqual(profile.shifts.map((shift) => shift.seriesId), [body.requestId, body.requestId]);
  assert.equal((await create(body)).body.replayed, true);
  assert.equal((await create({ ...body, shifts: [first, { ...second, title: "Autre" }] })).code, 409);
  const overlap = await create({ ...body, requestId: randomUUID() });
  assert.equal(overlap.body.conflictType, "shift_overlap");
  assert.equal(+overlap.body.attempted.start, +new Date(first.start));
  assert.equal((await create({ ...body, repeating: false, shifts: [first, first] })).body.conflictType, "batch_overlap");
  assert.equal((await create({ ...body, repeating: false })).code, 400);
  assert.equal((await create({ ...body, shifts: [first, { ...second, breakMinutes: 999 }] })).code, 400);
  assert.equal((await create(body, { user: { role: "employee", id: new Types.ObjectId() } })).code, 403);
  assert.equal(write.mock.callCount(), 1);
});

test("PDF and Excel receive Paris times and net totals, including legacy shifts", async (t) => {
  const { call, profile } = fixture(t);
  profile.shifts = [
    { ...first, start: new Date(first.start), end: new Date(first.end) },
    work("2026-03-28T08:00:00.000Z", "2026-03-28T10:00:00.000Z"),
  ];
  for (const format of ["pdf", "excel"]) {
    const result = await call("post", `/restaurants/:restaurantId/employees/planning/export/${format}`, {
      body: { from: "2026-03-28", to: "2026-03-28" },
    });
    assert.equal(result.code, 200);
    assert.equal(result.body.subarray(0, 2).toString(), format === "pdf" ? "%P" : "PK");
    const [day] = capturedExports[format].employees[0].days;
    assert.equal(day.date, "2026-03-28");
    assert.equal(day.totalMinutes, 510);
    assert.equal(day.shifts[1].startLabel, "22:00");
    assert.equal(day.shifts[1].endLabel, "06:00 (+1j)");
    assert.equal(day.shifts[1].durationMinutes, 390);
    assert.match(day.shifts[1].title, /Cuisine/);
  }
});

test("shift attachments are stored privately and scoped to the permitted restaurant, employee and shift", async (t) => {
  const { call, profile, otherRestaurant, employeeId } = fixture(t);
  const shiftId = new Types.ObjectId();
  profile.shifts = [{ ...first, _id: shiftId, title: "" }, { ...second, _id: new Types.ObjectId(), title: "" }];
  const params = { shiftId };
  const upload = t.mock.method(cloudinary.uploader, "upload_stream", (options, callback) => {
    assert.equal(options.type, "authenticated");
    assert.equal(options.resource_type, "raw");
    assert.match(options.folder, new RegExp(`/planning/${shiftId}$`));
    return new Writable({ write(_chunk, _encoding, done) { done(); }, final(done) {
      callback(null, { public_id: `${options.folder}/${options.public_id}` });
      done();
    } });
  });
  t.mock.method(EmployeeModel, "updateOne", async (_filter, update) => {
    if (update.$push) profile.planningFiles.push(...update.$push["restaurantProfiles.$[profile].planningFiles"].$each);
    else profile.planningFiles = [];
    return { modifiedCount: 1 };
  });
  function uploadBody(content) {
    const boundary = "GustoPlanningTest";
    const data = Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="files"; filename="planning.pdf"\r\nContent-Type: application/pdf\r\n\r\n${content}\r\n--${boundary}--\r\n`);
    return Object.assign(Readable.from([data]), { headers: {
      "content-type": `multipart/form-data; boundary=${boundary}`, "content-length": data.length,
    } });
  }
  assert.equal((await call("get", filePath, { params: { ...params, restaurantId: otherRestaurant } })).code, 404);
  assert.equal((await call("get", filePath, { params, user: { role: "employee", id: employeeId } })).code, 403);
  assert.equal((await call("post", filePath, { params, stream: uploadBody("wrong content") })).code, 400);
  assert.equal(upload.mock.callCount(), 0);
  const added = await call("post", filePath, { params, stream: uploadBody("%PDF-1.7\n%%EOF") });
  assert.equal(added.code, 201);
  const [file] = added.body.files;
  assert.equal(file.filename, "planning.pdf");
  assert.equal(file.public_id, undefined);
  assert.match(added.headers["cache-control"], /no-store/);
  const listed = await call("get", filePath, { params });
  assert.deepEqual(listed.body.files, [file]);
  const download = t.mock.method(axios, "get", async () => ({ data: Readable.from(["%PDF-1.7"]) }));
  t.mock.method(cloudinary.utils, "private_download_url", () => "https://storage.example.test/signed");
  const downloadPath = `${filePath}/:fileId/download`;
  assert.equal((await call("get", downloadPath, { params: { shiftId: profile.shifts[1]._id, fileId: String(file._id) } })).code, 404);
  const bytes = await call("get", downloadPath, { params: { ...params, fileId: String(file._id) } });
  assert.equal(bytes.download().toString(), "%PDF-1.7");
  assert.match(bytes.headers["content-disposition"], /attachment/);
  assert.equal(download.mock.callCount(), 1);
});

test("restaurant SSE keeps employee drafts private and targets personal notifications", () => {
  const restaurant = "scoped-restaurant";
  const messages = new Map();
  for (const [name, locals] of [
    ["manager", { gustoEventModules: { planning: true } }],
    ["employee", { gustoEmployeeId: "employee-a" }],
    ["colleague", { gustoEmployeeId: "employee-b" }],
  ]) {
    sse._addClient(restaurant, { locals, write: (line) => messages.set(name, JSON.parse(line.slice(6))) });
  }
  try {
    sse.broadcastToRestaurant(restaurant, {
      type: "leave_request_updated", employeeId: "employee-a",
      shifts: [{ _id: "shift", notes: "Privé" }, { _id: "draft", requiresPlanningPublication: true }],
    });
    assert.equal(messages.get("manager").shifts[0].notes, "Privé");
    assert.equal(messages.get("employee").shifts[0].notes, "Privé");
    assert.equal(messages.get("manager").shifts.length, 2);
    assert.equal(messages.get("employee").shifts.length, 1);
    assert.deepEqual(messages.get("colleague").shifts, []);
    messages.clear();
    sse.broadcastToRestaurant(restaurant, {
      type: "notification_created", recipientEmployeeId: "employee-a", notification: { title: "Planning disponible" },
    });
    assert.deepEqual([...messages.keys()], ["employee"]);
  } finally {
    sse._clientsPerRestaurant.delete(restaurant);
  }
});
