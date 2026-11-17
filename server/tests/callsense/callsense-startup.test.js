const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

function deferred() {
  let resolve, reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}

function startConnection(connection, load) {
  const app = fs.readFileSync(path.join(__dirname, "../../app.js"), "utf8");
  const fragment = app.split("// MONGOOSE")[1].split("// CORS")[0];
  const errors = [];
  const result = vm.runInNewContext(fragment, { mongoose: { connect: () => connection.promise }, process: { env: {} }, require: load, console: { log() {}, error: (...args) => errors.push(args) } });
  return { result, errors };
}

test("CallSense starts only after MongoDB has connected", async () => {
  const connection = deferred();
  const loaded = [];
  const { result } = startConnection(connection, (module) => loaded.push(module));
  await Promise.resolve();
  assert.equal(loaded.length, 0);
  connection.resolve();
  await result;
  assert.deepEqual(loaded, ["./services/callsense/cron/callsense-metering.service"]);
});

test("connection and CallSense initialization errors are reported", async () => {
  const failed = deferred();
  const first = startConnection(failed, () => assert.fail("must not start"));
  failed.reject(new Error("mongodb down"));
  await first.result;
  assert.match(first.errors[0][0], /MongoDB connection error/);
  const connected = deferred();
  const second = startConnection(connected, () => { throw new Error("initialization failed"); });
  connected.resolve();
  await second.result;
  assert.equal(second.errors[0][0], "[callsense-initialization]");
  assert.match(second.errors[0][1].message, /initialization failed/);
});

test("scheduled CallSense operations do not query while disconnected and log failures", async (t) => {
  const cronPath = require.resolve("node-cron");
  const workerPath = require.resolve("../../services/callsense/callsense-metering.service");
  const cronFile = require.resolve("../../services/callsense/cron/callsense-metering.service");
  const mongoose = require("mongoose");
  const oldCron = require.cache[cronPath];
  const oldWorker = require.cache[workerPath];
  const oldReady = mongoose.connection.readyState;
  const oldError = console.error;
  const jobs = [], errors = [];
  let runs = 0;
  require.cache[cronPath] = { id: cronPath, filename: cronPath, loaded: true, exports: { schedule: (_, fn) => jobs.push(fn) } };
  require.cache[workerPath] = { id: workerPath, filename: workerPath, loaded: true, exports: { runWorker: async () => { runs++; throw new Error("worker failure"); }, runReconciliation: async () => { runs++; throw new Error("reconciliation failure"); } } };
  console.error = (...args) => errors.push(args);
  t.after(() => { delete require.cache[cronFile]; if (oldCron) require.cache[cronPath] = oldCron; else delete require.cache[cronPath]; if (oldWorker) require.cache[workerPath] = oldWorker; else delete require.cache[workerPath]; mongoose.connection.readyState = oldReady; console.error = oldError; });
  delete require.cache[cronFile];
  require(cronFile);
  mongoose.connection.readyState = 0;
  jobs.forEach((job) => job());
  assert.equal(runs, 0);
  mongoose.connection.readyState = 1;
  jobs.forEach((job) => job());
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(runs, 2);
  assert.deepEqual(errors.map((item) => item[0]), ["[callsense-metering]", "[callsense-reconciliation]"]);
});
