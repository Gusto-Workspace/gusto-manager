const assert = require("node:assert/strict");
const { randomUUID } = require("node:crypto");
const { test } = require("node:test");
const mongoose = require("mongoose");
const cloudinary = require("cloudinary").v2;
const Employee = require("../../models/employee.model");
const Restaurant = require("../../models/restaurant.model");
const PlanningAction = require("../../models/planning-action.model");
const PlanningShiftTemplate = require("../../models/planning-shift-template.model");
const EmployeeAssetDeletion = require("../../models/employee-asset-deletion.model");
const { PlanningDay, PlanningPublication } = require("../../models/planning-period.model");
const Notification = require("../../models/notification.model");
const Brevo = require("sib-api-v3-sdk");
require("../../models/menu.model");

const testUri = process.env.GUSTO_PLANNING_TEST_MONGO_URI;
const { ObjectId } = mongoose.Types;
const root = "/restaurants/:restaurantId/employees/planning";
const hours = (date, starts = "08:00", ends = "10:00") => ({
  start: new Date(`${date}T${starts}:00Z`), end: new Date(`${date}T${ends}:00Z`),
});

for (const [name, method] of [
  ["shared/notifications", "createAndBroadcastNotification"],
  ["gift-cards/gift-card-lifecycle", "refreshGiftCardLifecycle"],
]) {
  const filename = require.resolve(`../../services/${name}.service`);
  require.cache[filename] = { id: filename, filename, loaded: true, exports: { [method]: async () => null } };
}
const router = require("../../routes/employees.routes");
const notificationRouter = require("../../routes/notifications.routes");
const { applyPlanningAction } = require("../../services/employees/planning-actions.service");

test("templates prefill the shift editor and cannot write through grouped actions", async () => {
  assert.ok(router.stack.some(({ route }) => route?.path === `${root}/actions` && route.methods.post));
  assert.ok(router.stack.some(({ route }) => route?.path === `${root}/templates` && route.methods.post));
  await assert.rejects(
    applyPlanningAction(new ObjectId(), new Set(), { operation: "apply-template", requestId: randomUUID() }),
    { planningStatus: 400 },
  );
});

async function fixture() {
  const restaurant = new ObjectId();
  const other = new ObjectId();
  const owner = { role: "owner", id: new ObjectId() };
  const a = new ObjectId();
  const b = new ObjectId();
  const c = new ObjectId();
  const outsider = new ObjectId();
  const original = {
    _id: new ObjectId(), ...hours("2026-11-16"),
    title: "Service", seriesId: randomUUID(), position: "Bar", breakMinutes: 15,
    notes: "Préparer la salle", mealCount: 1, mealPeriods: ["lunch"], source: "manual",
  };
  const file = {
    _id: new ObjectId(), shiftId: original._id, slot: 0,
    public_id: `Gusto_Workspace/restaurants/${restaurant}/employees/${a}/planning/${original._id}/fixture.pdf`,
    filename: "fixture.pdf", format: "pdf", size: 1024, resource_type: "raw", delivery_type: "authenticated",
  };
  await Restaurant.collection.insertMany([
    { _id: restaurant, owner_id: owner.id, employees: [a, b, c], name: "A", options: { employees: true } },
    { _id: other, owner_id: owner.id, employees: [outsider, a], name: "B", options: { employees: true } },
  ]);
  await Employee.collection.insertMany([
    {
      _id: a, restaurants: [restaurant, other], accountType: "employee",
      restaurantProfiles: [
        { restaurant, shifts: [original], planningFiles: [file], options: { employees: true }, documents: [{ title: "Private" }] },
        { restaurant: other, shifts: [], privateField: true },
      ],
    },
    { _id: b, restaurants: [restaurant], restaurantProfiles: [{ restaurant, shifts: [] }] },
    { _id: c, restaurants: [restaurant] },
    { _id: outsider, restaurants: [other], restaurantProfiles: [{ restaurant: other, shifts: [] }] },
  ]);
  async function call(method, path, body, options = {}) {
    const handlers = router.stack.find((layer) => layer.route?.path === path && layer.route.methods[method]).route.stack;
    const result = { status: 200 };
    const req = {
      params: { restaurantId: String(options.restaurant || restaurant), ...options.params },
      user: options.user || owner, body, query: options.query || {},
    };
    const res = {
      status(status) { result.status = status; return this; },
      json(data) { result.data = data; return this; },
      end() { return this; },
      set(name, value) { (result.headers ??= {})[name] = value; return this; },
      setHeader() {},
    };
    let index = 0;
    if (path === "/employees/me") index = handlers.length - 1;
    const next = () => handlers[index++].handle(req, res, next);
    await next();
    return result;
  }
  const post = (body, options) => call("post", `${root}/actions`, { requestId: randomUUID(), ...body }, options);
  const source = { employeeId: String(a), shiftId: String(original._id), start: original.start.toISOString(), end: original.end.toISOString() };
  const entry = (target, date) => ({ ...source, targetEmployeeId: String(target), date });
  const profile = async (employeeId, context = restaurant) => (await Employee.collection.findOne({ _id: employeeId }))
    ?.restaurantProfiles?.find(({ restaurant: id }) => String(id) === String(context));
  return { restaurant, other, a, b, c, outsider, original, file, source, entry, call, post, profile };
}

test("planning interactions on an isolated MongoDB replica set", {
  skip: testUri ? false : "Set GUSTO_PLANNING_TEST_MONGO_URI to a loopback MongoDB replica set",
}, async (t) => {
  const uri = new URL(testUri);
  assert.equal(uri.protocol, "mongodb:");
  assert.equal(uri.hostname, "127.0.0.1");
  assert.equal(uri.username, "");
  assert.equal(uri.password, "");
  await mongoose.connect(testUri, { dbName: `gusto_planning7_${new ObjectId()}`, serverSelectionTimeoutMS: 8000 });
  t.after(async () => {
    try { await mongoose.connection.dropDatabase(); } finally { await mongoose.disconnect(); }
  });
  await PlanningAction.init();
  await PlanningShiftTemplate.init();
  await EmployeeAssetDeletion.init();
  await PlanningDay.init();
  await PlanningPublication.init();
  await Notification.init();
  t.mock.method(cloudinary.uploader, "destroy", async () => ({ result: "ok" }));

  await t.test("shift templates stay private to the active restaurant and use normal shift writes", async () => {
    const f = await fixture();
    const path = `${root}/templates`;
    const supervisor = { role: "employee", id: f.a, restaurantId: f.restaurant };
    const member = { role: "employee", id: f.b, restaurantId: f.restaurant };
    const draft = { name: "Fermeture", title: "Fin de service", position: "Bar", notes: "Fermer la terrasse",
      startTime: "18:00", endTime: "00:30", endDayOffset: 1, breakMinutes: 20 };
    assert.equal((await f.call("post", path, draft, { user: member })).status, 403);
    assert.equal((await f.call("get", path, null, { user: supervisor, restaurant: f.other })).status, 403);
    assert.equal((await f.call("post", path, { ...draft, endDayOffset: 0 }, { user: supervisor })).status, 400);
    assert.equal((await f.call("post", path, { ...draft, title: "Congés" }, { user: supervisor })).status, 400);
    const created = await f.call("post", path, { ...draft, employeeId: String(f.a), files: [f.file] }, { user: supervisor });
    assert.equal(created.status, 201);
    const template = created.data.template;
    assert.deepEqual(template, { ...draft, _id: template._id });
    assert.equal((await f.call("post", path, { ...draft, name: " FERMETURE " })).status, 409);
    assert.deepEqual((await f.call("get", path, null, { restaurant: f.other })).data.templates, []);
    assert.equal((await f.call("get", path, null, { user: member })).status, 403);
    const listed = await f.call("get", path, null, { user: supervisor });
    assert.deepEqual(listed.data.templates, [template]);
    assert.equal(listed.headers["Cache-Control"], "private, no-store");
    const params = { employeeId: String(f.b) };
    const shiftPath = "/restaurants/:restaurantId/employees/:employeeId/shifts";
    const shift = { title: template.title, position: template.position, breakMinutes: template.breakMinutes,
      start: "2026-11-18T17:00:00Z", end: "2026-11-18T23:30:00Z" };
    const range = { from: "2026-11-19", to: "2026-11-19" };
    assert.equal((await f.call("put", `${root}/lock`, { ...range, locked: true })).status, 200);
    assert.equal((await f.call("post", shiftPath, shift, { params, user: supervisor })).status, 423);
    assert.equal((await f.call("put", `${root}/lock`, { ...range, locked: false })).status, 200);
    assert.equal((await f.call("post", shiftPath, shift, { params, user: supervisor })).status, 201);
    const createdShift = (await f.profile(f.b)).shifts[0];
    assert.equal(createdShift.requiresPlanningPublication, true);
    assert.equal((await f.call("post", shiftPath, shift, { params, user: supervisor })).status, 409);
    const deletion = { params: { templateId: String(template._id) } };
    assert.equal((await f.call("delete", `${path}/:templateId`, null, { ...deletion, restaurant: f.other })).status, 404);
    assert.equal((await f.call("delete", `${path}/:templateId`, null, { ...deletion, user: member })).status, 403);
    assert.equal((await f.call("delete", `${path}/:templateId`, null, { ...deletion, user: supervisor })).status, 204);
    assert.deepEqual((await f.call("get", path, null)).data.templates, []);
    assert.equal((await f.profile(f.b)).shifts.length, 1);
  });

  await t.test("publication keeps legacy shifts visible and releases only selected employees and Paris dates", async (st) => {
    const f = await fixture();
    const email = st.mock.fn(async () => {
      assert.fail("publication without an email opt-in must not send");
    });
    st.mock.method(Brevo, "TransactionalEmailsApi", function MockBrevo() { return { sendTransacEmail: email }; });
    const base = "/restaurants/:restaurantId/employees/:employeeId/shifts";
    const params = { employeeId: String(f.b) };
    const user = { role: "employee", id: f.b, restaurantId: f.restaurant };
    const range = { from: "2026-11-16", to: "2026-11-22" };
    const personal = () => f.call("get", base, null, { user, params, query: { scope: "personal" } });
    const status = () => f.call("get", `${root}/publication`, null, { query: range });
    const publish = (employeeIds) => f.call("post", `${root}/publication`, {
      ...range, employeeIds: employeeIds.map(String), requestId: randomUUID(), notify: false, email: false,
    });
    const write = await f.call("post", base, {
      title: "Brouillon", start: "2026-11-16T14:00:00Z", end: "2026-11-16T16:00:00Z",
    }, { params });
    assert.equal(write.status, 201);
    assert.equal(write.data.shift.requiresPlanningPublication, true);
    assert.equal((await status()).data.status, "unpublished");
    assert.deepEqual((await personal()).data.shifts, []);
    assert.deepEqual((await f.call("get", base, null, { user, params })).data.shifts, []);
    const raw = await Employee.findById(f.b);
    assert.deepEqual(raw.toJSON().restaurantProfiles[0].shifts, []);
    const me = (await f.call("get", "/employees/me", null, { user })).data;
    assert.deepEqual(me.employee.shifts, []);
    assert.deepEqual(me.currentProfile.shifts, []);
    const colleague = me.restaurant.employees.find((item) => String(item._id) === String(f.a));
    assert.equal(colleague.restaurantProfiles, undefined);
    assert.equal(colleague.shifts, undefined);
    assert.equal((await f.call("get", base, null, { user, params: { employeeId: String(f.a) } })).status, 403);
    const manager = { role: "employee", id: f.a, restaurantId: f.restaurant };
    assert.equal((await f.call("get", base, null, { user: manager, params })).data.shifts.length, 1);
    assert.equal((await f.call("get", base, null, { user: manager, params: { employeeId: String(f.a) }, query: { scope: "personal" } })).data.shifts.length, 1);
    assert.equal((await publish([f.outsider])).status, 400);
    assert.equal((await publish([f.a])).status, 200);
    assert.equal((await status()).data.status, "partial");
    assert.deepEqual((await personal()).data.shifts, []);
    assert.equal((await publish([f.b, f.c])).status, 200);
    const released = (await status()).data;
    assert.equal(released.status, "published");
    assert.equal(released.history.length, 2);
    assert.ok(released.days.every((day) => !day.locked));
    assert.equal((await personal()).data.shifts[0].title, "Brouillon");
    const edited = await f.call("put", `${base}/:shiftId`, { title: "Service modifié" }, {
      params: { ...params, shiftId: String(write.data.shift._id) },
    });
    assert.equal(edited.status, 200);
    assert.equal((await personal()).data.shifts[0].title, "Service modifié");
    assert.equal((await f.call("get", `${root}/publication`, null, { restaurant: f.other, query: range })).data.status, "unpublished");
    assert.equal(email.mock.callCount(), 0);
    assert.equal(await Notification.countDocuments({ restaurantId: f.restaurant }), 0);
  });

  await t.test("emails and targeted notifications are optional, idempotent, and do not roll back publication", async (st) => {
    const f = await fixture();
    await Employee.collection.updateOne({ _id: f.a }, { $set: { email: "example-a@example.test", firstname: "Ari" } });
    await Employee.collection.updateOne({ _id: f.c }, { $set: { email: "example-c@example.test", firstname: "Lou" } });
    const mail = st.mock.fn(async ({ to }) => {
      if (to[0].email === "example-c@example.test") throw Error("provider failure");
    });
    st.mock.method(Brevo, "TransactionalEmailsApi", function MockBrevo() { return { sendTransacEmail: mail }; });
    const body = {
      from: "2026-11-16", to: "2026-11-16", employeeIds: [f.a, f.b, f.c].map(String),
      requestId: randomUUID(), email: true, notify: true,
    };
    const publish = (value) => f.call("post", `${root}/publication`, value);
    assert.deepEqual((await Promise.all([publish(body), publish(body)])).map(({ status }) => status), [200, 200]);
    const result = await publish(body);
    const statuses = new Map(result.data.publication.recipients.map(({ employeeId, emailStatus }) => [employeeId, emailStatus]));
    assert.equal(statuses.get(String(f.a)), "sent");
    assert.equal(statuses.get(String(f.b)), "skipped");
    assert.equal(statuses.get(String(f.c)), "failed");
    assert.equal(mail.mock.callCount(), 2);
    assert.ok(mail.mock.calls.every(({ arguments: [message] }) => message.htmlContent.includes("Votre planning")));
    assert.equal(await PlanningPublication.countDocuments({ restaurant: f.restaurant }), 1);
    assert.equal(await Notification.countDocuments({ restaurantId: f.restaurant, type: "planning_published" }), 3);
    assert.equal((await publish({ ...body, notify: false })).status, 409);
    assert.equal((await publish({ ...body, requestId: randomUUID(), employeeIds: [String(f.b)], email: false })).status, 200);
    assert.equal(await Notification.countDocuments({ restaurantId: f.restaurant, recipientEmployeeId: String(f.b) }), 2);
    assert.equal(mail.mock.callCount(), 2);
    const notificationPath = "/restaurants/:restaurantId/notifications";
    async function notificationCall(method, path, user, params = {}) {
      const route = notificationRouter.stack.find((layer) => layer.route?.path === path && layer.route.methods[method]);
      const result = { status: 200 };
      await route.route.stack.at(-1).handle({
        params: { restaurantId: String(f.restaurant), ...params }, user, query: { module: "my_planning" }, authorizedRestaurant: {},
      }, {
        status(status) { result.status = status; return this; },
        json(data) { result.data = data; return this; },
      });
      return result;
    }
    const users = [f.a, f.b].map((id) => ({ role: "employee", id }));
    const [ari, camille] = await Promise.all(users.map((user) => notificationCall("get", notificationPath, user)));
    assert.equal(ari.data.notifications.length, 1);
    assert.equal(camille.data.notifications.length, 2);
    assert.ok(camille.data.notifications.every((notification) => notification.recipientEmployeeId === String(f.b)));
    assert.equal((await notificationCall("post", `${notificationPath}/:notifId/read`, users[0], {
      notifId: camille.data.notifications[0]._id,
    })).status, 404);
    assert.equal((await notificationCall("get", notificationPath, { role: "owner" })).data.notifications.length, 0);
    const state = (await f.call("get", `${root}/publication`, null, { query: { from: body.from, to: body.to } })).data;
    assert.equal(state.status, "published");
    assert.equal(state.days[0].locked, false);
  });

  await t.test("a locked day blocks all affected writes, including overnight and grouped moves", async () => {
    const f = await fixture();
    const employee = "/restaurants/:restaurantId/employees/:employeeId/shifts";
    const params = { employeeId: String(f.a) };
    const specific = { params: { ...params, shiftId: String(f.original._id) } };
    const range = { from: "2026-11-16", to: "2026-11-17" };
    const lock = (locked, options) => f.call("put", `${root}/lock`, { ...range, locked }, options);
    assert.equal((await lock(true)).status, 200);
    assert.equal((await lock(false, { user: { role: "employee", id: f.b } })).status, 403);
    const create = { title: "Nuit", start: "2026-11-15T22:00:00.000Z", end: "2026-11-16T04:00:00.000Z" };
    assert.equal((await f.call("post", employee, create, { params })).status, 423);
    assert.equal((await f.call("put", `${employee}/:shiftId`, { title: "Changé" }, specific)).status, 423);
    assert.equal((await f.call("delete", `${employee}/:shiftId`, null, specific)).status, 423);
    assert.equal((await f.call("post", `${employee}/batch`, { requestId: randomUUID(), repeating: false, shifts: [create] }, { params })).status, 423);
    assert.equal((await f.post({ operation: "move", entries: [f.entry(f.b, "2026-11-18")] })).status, 423);
    assert.equal((await f.post({ operation: "delete", entries: [f.source] })).status, 423);
    assert.equal((await f.post({ operation: "copy", entries: [f.entry(f.b, "2026-11-17")] })).status, 423);
    assert.equal((await f.post({ operation: "copy", entries: [f.entry(f.b, "2026-11-18")] })).status, 200);
    assert.equal((await f.profile(f.a)).shifts[0].title, "Service");
    assert.equal((await f.profile(f.a)).planningFiles.length, 1);
    assert.equal((await lock(false)).status, 200);
    assert.equal((await f.call("post", employee, create, { params })).status, 201);
  });

  await t.test("batch copies allocate independent shifts and reject duplicate submissions and identical shifts", async () => {
    const f = await fixture();
    const body = {
      requestId: randomUUID(), operation: "copy",
      entries: [f.entry(f.a, "2026-11-17"), f.entry(f.b, "2026-11-16"), f.entry(f.b, "2026-11-17")],
    };
    const responses = await Promise.all([f.post(body), f.post(body)]);
    assert.deepEqual(responses.map(({ status }) => status), [200, 200]);
    assert.equal(responses.filter(({ data }) => data?.replayed).length, 1);
    assert.equal((await f.profile(f.a)).shifts.length, 2);
    const copies = (await f.profile(f.b)).shifts;
    assert.equal(copies.length, 2);
    for (const copy of copies) {
      assert.notEqual(String(copy._id), String(f.original._id));
      assert.equal(copy.seriesId, undefined);
      assert.equal(copy.position, "Bar");
      assert.equal(copy.breakMinutes, 15);
      assert.equal(copy.notes, f.original.notes);
      assert.equal(copy.mealCount, 1);
    }
    assert.deepEqual((await f.profile(f.a)).planningFiles, [f.file]);
    assert.equal((await f.profile(f.b)).planningFiles, undefined);
    assert.equal((await f.post({ ...body, entries: [f.entry(f.c, "2026-11-16")] })).status, 409);
    const duplicate = await f.post({ operation: "copy", entries: [f.entry(f.b, "2026-11-16")] });
    assert.equal(duplicate.data.conflictType, "shift_overlap");
  });

  await t.test("moving a shift preserves its ID, series and file metadata even to a legacy employee", async () => {
    const f = await fixture();
    const moved = await f.post({ operation: "move", entries: [f.entry(f.c, "2026-11-19")] });
    assert.equal(moved.status, 200);
    assert.deepEqual((await f.profile(f.a)).shifts, []);
    assert.deepEqual((await f.profile(f.a)).planningFiles, []);
    assert.equal((await f.profile(f.a)).documents[0].title, "Private");
    assert.equal((await f.profile(f.a, f.other)).privateField, true);
    const destination = await f.profile(f.c);
    assert.deepEqual(destination.planningFiles, [f.file]);
    assert.equal(String(destination.shifts[0]._id), f.source.shiftId);
    assert.equal(destination.shifts[0].seriesId, f.original.seriesId);
    assert.equal(destination.shifts[0].start.toISOString(), "2026-11-19T08:00:00.000Z");
    assert.equal(await EmployeeAssetDeletion.countDocuments({ public_id: f.file.public_id }), 0);
    const route = "/restaurants/:restaurantId/employees/:employeeId/shifts/:shiftId/files";
    assert.equal((await f.call("get", route, null, { params: { employeeId: String(f.a), shiftId: f.source.shiftId } })).status, 404);
    const files = await f.call("get", route, null, { params: { employeeId: String(f.c), shiftId: f.source.shiftId } });
    assert.equal(files.status, 200);
    assert.deepEqual(files.data.files, [{ _id: f.file._id, filename: f.file.filename, size: f.file.size }]);
  });

  await t.test("copying a day to another employee keeps source overlaps while rejecting destination conflicts", async () => {
    const f = await fixture();
    const sourceDate = "2026-05-13";
    const destinationDate = "2026-05-16";
    const shifts = [["05:00", "11:30"], ["09:30", "21:00"], ["12:00", "21:59"], ["13:00", "15:30"]]
      .map(([start, end]) => ({ _id: new ObjectId(), ...hours(sourceDate, start, end) }));
    await Employee.collection.updateOne({ _id: f.a }, {
      $push: { "restaurantProfiles.0.shifts": { $each: shifts } },
    });
    const entries = shifts.map((shift) => ({
      employeeId: String(f.a), shiftId: String(shift._id), targetEmployeeId: String(f.b), date: destinationDate,
    }));
    const response = await f.post({ operation: "copy", entries });
    assert.equal(response.status, 200);
    const copied = (await f.profile(f.b)).shifts;
    assert.equal(copied.length, 4);
    assert.deepEqual(copied.map(({ start, end }) => [start, end]), [
      ["05:00", "11:30"], ["09:30", "21:00"], ["12:00", "21:59"], ["13:00", "15:30"],
    ].map(([start, end]) => Object.values(hours(destinationDate, start, end))));

    const duplicate = await f.post({ operation: "copy", entries });
    assert.equal(duplicate.data.conflictType, "shift_overlap");
    assert.equal((await f.profile(f.b)).shifts.length, 4);

    const repeated = { ...entries[0], date: "2026-05-17" };
    assert.equal((await f.post({ operation: "copy", entries: [repeated, repeated] })).status, 409);
    assert.equal((await f.profile(f.b)).shifts.length, 4);
  });

  await t.test("a leave conflict on one destination rolls back the whole selection, and foreign rows are refused", async () => {
    const f = await fixture();
    await Employee.collection.updateOne({ _id: f.b }, {
      $push: { "restaurantProfiles.0.shifts": { _id: new ObjectId(), ...hours("2026-11-18", "07:00", "12:00"), isLeave: true } },
    });
    const response = await f.post({ operation: "copy", entries: [f.entry(f.a, "2026-11-17"), f.entry(f.b, "2026-11-18")] });
    assert.equal(response.status, 409);
    assert.equal(response.data.conflictType, "leave_overlap");
    assert.equal(response.data.employeeId, String(f.b));
    assert.equal((await f.profile(f.a)).shifts.length, 1);
    assert.equal((await f.post({ operation: "move", entries: [f.entry(f.outsider, "2026-11-19")] })).status, 404);
    assert.equal((await f.post({ operation: "delete", entries: [f.source] }, { user: { id: f.b, role: "employee" } })).status, 403);
  });

  await t.test("an overnight copy keeps Paris wall-clock hours across a clock change", async () => {
    const f = await fixture();
    await Employee.collection.updateOne({ _id: f.a }, {
      $set: {
        "restaurantProfiles.0.shifts.0.start": new Date("2026-03-28T21:00:00Z"),
        "restaurantProfiles.0.shifts.0.end": new Date("2026-03-29T04:00:00Z"),
      },
    });
    const copied = await f.post({ operation: "copy", entries: [{
      employeeId: String(f.a), shiftId: f.source.shiftId, targetEmployeeId: String(f.b), date: "2026-03-29",
    }] });
    assert.equal(copied.status, 200);
    const [night] = (await f.profile(f.b)).shifts;
    assert.equal(night.start.toISOString(), "2026-03-29T20:00:00.000Z");
    assert.equal(night.end.toISOString(), "2026-03-30T04:00:00.000Z");
    assert.equal(night.breakMinutes, 15);
  });

  await t.test("copying absences preserves manual fields and copies only the selected day of an approved leave", async () => {
    const f = await fixture();
    const manual = {
      _id: new ObjectId(), ...hours("2026-11-17", "07:00", "11:00"),
      isLeave: true, absenceType: "weekly_rest", absenceDuration: "custom",
    };
    const approved = {
      _id: new ObjectId(), start: new Date("2026-11-17T23:00:00Z"), end: new Date("2026-11-20T22:59:00Z"),
      isLeave: true, leaveRequestId: new ObjectId(), source: "leave_request",
    };
    await Employee.collection.updateOne({ _id: f.a }, {
      $push: { "restaurantProfiles.0.shifts": { $each: [manual, approved] } },
    });
    const entry = (shift, sourceDate, date) => ({
      employeeId: String(f.a), shiftId: String(shift._id), targetEmployeeId: String(f.b), sourceDate, date,
    });
    const response = await f.post({ operation: "copy", entries: [
      entry(manual, "2026-11-17", "2026-11-18"),
      entry(approved, "2026-11-19", "2026-03-29"),
    ] });
    assert.equal(response.status, 200);
    const [first, second] = (await f.profile(f.b)).shifts;
    assert.equal(first.start.toISOString(), "2026-11-18T07:00:00.000Z");
    assert.equal(first.end.toISOString(), "2026-11-18T11:00:00.000Z");
    assert.equal(first.absenceType, "weekly_rest");
    assert.equal(first.absenceDuration, "custom");
    assert.equal(second.start.toISOString(), "2026-03-28T23:00:00.000Z");
    assert.equal(second.end.toISOString(), "2026-03-29T21:59:59.999Z");
    for (const [original, copy] of [[manual, first], [approved, second]]) {
      assert.notEqual(String(copy._id), String(original._id));
      assert.equal(copy.isLeave, true);
      assert.equal(copy.source, "manual");
      assert.equal(copy.leaveRequestId, null);
    }
    assert.equal((await f.post({ operation: "copy", entries: [entry(approved, "2026-11-21", "2026-12-01")] })).status, 409);
    const sources = [manual, approved].map((shift) => ({ employeeId: String(f.a), shiftId: String(shift._id) }));
    assert.equal((await f.post({ operation: "delete", entries: sources })).status, 409);
    assert.equal((await f.profile(f.a)).shifts.length, 3);
    assert.equal((await f.post({ operation: "delete", entries: [sources[0]] })).status, 200);
    assert.deepEqual((await f.profile(f.a)).shifts.map(({ _id }) => _id), [f.original._id, approved._id]);
  });

  await t.test("batch deletion keeps Cloudinary cleanup records when storage does not confirm deletion", async (st) => {
    const f = await fixture();
    st.mock.method(cloudinary.uploader, "destroy", async () => ({ result: "failed" }));
    const deleted = await f.post({ operation: "delete", entries: [f.source] });
    assert.equal(deleted.status, 200);
    assert.equal(deleted.data.assetCleanupPending, true);
    assert.deepEqual((await f.profile(f.a)).shifts, []);
    assert.ok(await EmployeeAssetDeletion.exists({ public_id: f.file.public_id, delivery_type: "authenticated" }));
  });
});
