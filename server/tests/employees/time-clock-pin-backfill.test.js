const assert = require("node:assert/strict");
const { execFile } = require("node:child_process");
const { test } = require("node:test");
const { promisify } = require("node:util");
const mongoose = require("mongoose");

const { TimeClockPin } = require("../../models/time-clock-device.model");
const Employee = require("../../models/employee.model");
const Restaurant = require("../../models/restaurant.model");
const { getConfiguration } = require("../../scripts/backfill-time-clock-pins");
const { runPinBackfill } = require("../../services/employees/time-clock-pin-backfill.service");
const { lookupPin, revealPin, sealPin } = require("../../services/employees/time-clock-device.service");
const { PIN_COUNT } = require("../../services/employees/time-clock-pin.service");

const testUri = process.env.GUSTO_CLOCK_TEST_MONGO_URI;
const testSecret = "pin-backfill-isolated-test-secret";
const { ObjectId } = mongoose.Types;
const exec = promisify(execFile);

test("the migration needs a dedicated explicit URI and a matching write confirmation", () => {
  const uri = "mongodb://127.0.0.1:27017/synthetic?replicaSet=local";
  const env = { GUSTO_PIN_BACKFILL_DB: "synthetic", GUSTO_PIN_BACKFILL_MONGO_URI: uri, TIME_CLOCK_SECRET: testSecret };
  assert.equal(getConfiguration([], env).apply, false);
  assert.equal(getConfiguration(["--dry-run"], env).apply, false);
  assert.equal(getConfiguration(["--apply", "--confirm-db", "synthetic"], env).apply, true);
  for (const args of [["--apply"], ["--apply", "--confirm-db", "other"], ["--dry-run", "--apply", "--confirm-db", "synthetic"]]) {
    assert.throws(() => getConfiguration(args, env), { message: "database_confirmation_required" });
  }
  assert.throws(() => getConfiguration([], { ...env, GUSTO_PIN_BACKFILL_DB: "other" }), { message: "explicit_database_required" });
  assert.throws(() => getConfiguration([], { ...env, TIME_CLOCK_SECRET: "" }), { message: "time_clock_secret_required" });
  assert.throws(() => getConfiguration([], { CONNECTION_STRING_TEST: uri }), { message: "explicit_database_required" });
  const release = {
    ...env, NODE_ENV: "production", RENDER_GIT_BRANCH: "main",
    CONNECTION_STRING: uri, GUSTO_PIN_BACKFILL_DEPLOYMENT_CONFIRM_DB: "synthetic",
  };
  assert.equal(getConfiguration(["--deployment"], release).apply, true);
  assert.throws(() => getConfiguration(["--deployment"], { ...release, RENDER_GIT_BRANCH: "develop" }), { message: "deployment_not_authorized" });
  assert.throws(() => getConfiguration(["--deployment"], { ...release, CONNECTION_STRING: uri.replace("27017", "27018") }), { message: "deployment_not_authorized" });
});

test("PIN backfill on an isolated loopback replica set", {
  skip: testUri ? false : "Set GUSTO_CLOCK_TEST_MONGO_URI to a dedicated loopback replica set",
}, async (t) => {
  const uri = new URL(testUri);
  assert.equal(uri.protocol, "mongodb:");
  assert.equal(uri.hostname, "127.0.0.1");
  assert.equal(uri.username, "");
  assert.equal(uri.password, "");
  uri.pathname = `/gusto_pin_backfill_${new ObjectId()}`;
  const database = uri.pathname.slice(1);
  const oldSecret = process.env.TIME_CLOCK_SECRET;
  process.env.TIME_CLOCK_SECRET = testSecret;
  await mongoose.connect(uri.href, { autoIndex: false, autoCreate: false, serverSelectionTimeoutMS: 5000 });
  t.after(async () => {
    if (oldSecret === undefined) delete process.env.TIME_CLOCK_SECRET;
    else process.env.TIME_CLOCK_SECRET = oldSecret;
    try { await mongoose.connection.dropDatabase(); }
    finally { await mongoose.disconnect(); }
  });

  async function fixture({ enabled = true } = {}) {
    const restaurant = new ObjectId();
    await Restaurant.collection.insertOne({ _id: restaurant, options: { employees: enabled }, employees: [] });
    return restaurant;
  }

  async function member(restaurants, extra = {}) {
    const employee = {
      _id: new ObjectId(), firstname: "Salarié", lastname: "Fictif",
      restaurants, restaurantProfiles: restaurants.map((restaurant) => ({
        _id: new ObjectId(), restaurant, options: { dashboard: true }, employment: { contractType: "CDI" },
      })),
      ...extra,
    };
    await Employee.collection.insertOne(employee);
    await Restaurant.collection.updateMany({ _id: { $in: restaurants } }, { $addToSet: { employees: employee._id } });
    return employee;
  }

  async function addCredential(restaurant, target, pin, profile = String(target.restaurantProfiles[0]._id)) {
    const employee = target._id;
    return TimeClockPin.create({ restaurant, employee, ...sealPin({ restaurant, employee, profile, pin, changedBy: "synthetic" }) });
  }

  const first = await fixture();
  const second = await fixture();
  const disabled = await fixture({ enabled: false });
  const multi = await member([first, second]);
  const legacy = await member([first], { restaurantProfiles: [] });
  const already = await member([first, second]);
  const accountant = await member([first], { accountType: "accountant" });
  const dormant = await member([disabled]);

  const withoutIndexes = await runPinBackfill();
  assert.equal(withoutIndexes.indexesReady, false);
  assert.equal(withoutIndexes.totals.planned, 5);
  assert.equal((await runPinBackfill({ apply: true })).totals.assigned, 0);
  assert.equal(await TimeClockPin.countDocuments(), 0);

  await TimeClockPin.createIndexes();
  const firstExisting = await addCredential(first, already, "0042");
  await addCredential(second, already, "0042", String(already.restaurantProfiles[1]._id));

  await t.test("preview reads the roster and preserves every existing document", async () => {
    const before = await Employee.collection.find({}).sort({ _id: 1 }).toArray();
    const credentials = await TimeClockPin.collection.find({}).sort({ _id: 1 }).toArray();
    const preview = await runPinBackfill();
    assert.equal(preview.totals.eligible, 5);
    assert.equal(preview.totals.configured, 2);
    assert.equal(preview.totals.planned, 3);
    assert.equal(preview.totals.ignored, 1);
    assert.equal(preview.totals.restaurantsDisabled, 1);
    assert.deepEqual(await Employee.collection.find({}).sort({ _id: 1 }).toArray(), before);
    assert.deepEqual(await TimeClockPin.collection.find({}).sort({ _id: 1 }).toArray(), credentials);
    assert.doesNotMatch(JSON.stringify(preview), /"0042"|sealedPin|lookup|revision/);
  });

  await t.test("partial write failure leaves a safe report and a concurrent rerun fills the gap once", async (st) => {
    const create = TimeClockPin.create.bind(TimeClockPin);
    const fault = st.mock.method(TimeClockPin, "create", async (rows, options) => {
      if (String(rows[0].employee) === String(legacy._id)) throw new Error("0099 sealedPin lookup");
      return create(rows, options);
    });
    const partial = await runPinBackfill({ apply: true });
    assert.equal(partial.totals.assigned, 2);
    assert.deepEqual(partial.issues.map(({ code }) => code), ["assignment_failed"]);
    assert.doesNotMatch(JSON.stringify(partial), /"0042"|0099|sealedPin|lookup|revision/);
    fault.mock.restore();

    const results = await Promise.all([runPinBackfill({ apply: true }), runPinBackfill({ apply: true })]);
    assert.equal(results.reduce((count, result) => count + result.totals.assigned, 0), 1);
    assert.ok(results.every((result) => result.totals.errors === 0));
    assert.equal((await runPinBackfill({ apply: true })).totals.assigned, 0);
    const rows = await TimeClockPin.find({}).lean();
    assert.equal(rows.length, 5);
    assert.equal(rows.filter(({ employee }) => employee.equals(multi._id)).length, 2);
    assert.ok(rows.every((row) => /^\d{4}$/.test(revealPin(row))));
    assert.equal(new Set(rows.map((row) => `${row.restaurant}:${revealPin(row)}`)).size, 5);
    assert.ok(rows.every(({ employee }) => !employee.equals(accountant._id) && !employee.equals(dormant._id)));
    const preserved = rows.find(({ _id }) => _id.equals(firstExisting._id));
    assert.equal(preserved.revision, firstExisting.revision);
    assert.equal(preserved.sealedPin, firstExisting.sealedPin);
  });

  await t.test("a lookup collision retries and a full namespace leaves the existing credentials untouched", async (st) => {
    const target = await member([first]);
    const create = TimeClockPin.create.bind(TimeClockPin);
    let collided = false;
    const injectedCollision = st.mock.method(TimeClockPin, "create", async (rows, options) => {
      if (!collided && rows[0].employee.equals(target._id)) {
        collided = true;
        throw Object.assign(new Error("synthetic duplicate"), { code: 11000, keyPattern: { restaurant: 1, lookup: 1 } });
      }
      return create(rows, options);
    });
    const assigned = await runPinBackfill({ apply: true });
    assert.equal(assigned.totals.assigned, 1);
    assert.equal(collided, true);
    injectedCollision.mock.restore();

    const extra = await member([first]);
    const originalExists = TimeClockPin.exists.bind(TimeClockPin);
    const originalDistinct = TimeClockPin.distinct.bind(TimeClockPin);
    const exhausted = Array.from({ length: PIN_COUNT }, (_, index) => lookupPin(first, String(index).padStart(4, "0")));
    const existsMock = st.mock.method(TimeClockPin, "exists", (query) =>
      query.lookup && String(query.restaurant) === String(first) ? { session: async () => true } : originalExists(query));
    const distinctMock = st.mock.method(TimeClockPin, "distinct", (field, query) =>
      field === "lookup" && String(query.restaurant) === String(first) ? { session: async () => exhausted } : originalDistinct(field, query));
    const full = await runPinBackfill({ apply: true });
    assert.equal(full.totals.assigned, 0);
    assert.equal(full.issues.find(({ code }) => code === "capacity_exhausted").employeeId, String(extra._id));
    assert.equal(await TimeClockPin.countDocuments(), 6);
    existsMock.mock.restore();
    distinctMock.mock.restore();
  });

  await t.test("the CLI defaults to read-only, rejects a mismatched secret and verifies a confirmed apply", async () => {
    const env = {
      ...process.env, GUSTO_PIN_BACKFILL_MONGO_URI: uri.href,
      GUSTO_PIN_BACKFILL_DB: database, TIME_CLOCK_SECRET: testSecret,
    };
    const program = require.resolve("../../scripts/backfill-time-clock-pins");
    const invoke = (args, environment = env) => exec(process.execPath, [program, ...args], { env: environment, timeout: 12000 });
    const preview = await invoke([]);
    assert.equal(JSON.parse(preview.stdout).totals.planned, 1);
    assert.equal(await TimeClockPin.countDocuments(), 6);
    await assert.rejects(invoke(["--apply", "--confirm-db", database], { ...env, TIME_CLOCK_SECRET: "wrong-synthetic-secret" }), (error) => {
      assert.deepEqual(JSON.parse(error.stdout).issues, [{ code: "secret_verification_failed" }]);
      return true;
    });
    assert.equal(await TimeClockPin.countDocuments(), 6);
    const applied = await invoke(["--apply", "--confirm-db", database]);
    const report = JSON.parse(applied.stdout);
    assert.equal(report.totals.assigned, 1);
    assert.equal(report.verification.totals.missing, 0);
    assert.equal(applied.stderr, "");
    assert.doesNotMatch(applied.stdout, /"0042"|sealedPin|lookup|revision|mongodb:/);

    const release = {
      ...env, NODE_ENV: "production", RENDER_GIT_BRANCH: "main", CONNECTION_STRING: uri.href,
      GUSTO_PIN_BACKFILL_DEPLOYMENT_CONFIRM_DB: database,
    };
    const deployEmployee = await member([second]);
    const deploy = await Promise.all([invoke(["--deployment"], release), invoke(["--deployment"], release)]);
    const results = deploy.map(({ stdout }) => JSON.parse(stdout));
    assert.equal(results.reduce((sum, result) => sum + (result.totals?.assigned ?? 0), 0), 1);
    const restored = await TimeClockPin.findOne({ restaurant: second, employee: deployEmployee._id }).lean();
    assert.ok(restored);
    const repeated = await invoke(["--deployment"], release);
    assert.equal(JSON.parse(repeated.stdout).status, "already_completed");
    assert.equal(await mongoose.connection.db.collection("gustomigrationreceipts").countDocuments(), 1);
    assert.deepEqual(await TimeClockPin.findById(restored._id).lean(), restored);
  });
});
