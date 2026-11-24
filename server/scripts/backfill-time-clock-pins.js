const { parseArgs } = require("node:util");
const mongoose = require("mongoose");
const { MongoClient } = require("mongodb");
const { TimeClockPin } = require("../models/time-clock-device.model");
const { runPinBackfill } = require("../services/employees/time-clock-pin-backfill.service");

class BackfillConfigurationError extends Error {}

const deploymentReceipt = "time-clock-pin-backfill-v1";

function mongoTarget(uri) {
  if (!uri) return null;
  try {
    const { dbName, srvHost, hosts } = new MongoClient(uri).options;
    return JSON.stringify([dbName, srvHost?.toLowerCase(), (hosts || []).map((host) => String(host).toLowerCase()).sort()]);
  } catch {
    return null;
  }
}

function getConfiguration(args, env) {
  let options;
  try {
    ({ values: options } = parseArgs({
      args,
      options: {
        "dry-run": { type: "boolean" },
        apply: { type: "boolean" },
        deployment: { type: "boolean" },
        "confirm-db": { type: "string" },
      },
    }));
  } catch {
    throw new BackfillConfigurationError("invalid_arguments");
  }

  const uri = env.GUSTO_PIN_BACKFILL_MONGO_URI;
  const database = env.GUSTO_PIN_BACKFILL_DB;
  const uriDatabase = typeof uri === "string" && uri.match(/^mongodb(?:\+srv)?:\/\/[^/]+\/([^/?]+)(?:\?.*)?$/)?.[1];
  if (!database || !/^[a-zA-Z0-9_-]+$/.test(database) || uriDatabase !== database ||
      ["admin", "local", "config"].includes(database)) {
    throw new BackfillConfigurationError("explicit_database_required");
  }

  const deployment = options.deployment === true;
  const apply = options.apply === true;
  if (deployment) {
    const target = mongoTarget(uri);
    if (apply || options["dry-run"] || options["confirm-db"] !== undefined ||
        env.NODE_ENV !== "production" || env.RENDER_GIT_BRANCH !== "main" ||
        env.GUSTO_PIN_BACKFILL_DEPLOYMENT_CONFIRM_DB !== database ||
        !target || target !== mongoTarget(env.CONNECTION_STRING)) {
      throw new BackfillConfigurationError("deployment_not_authorized");
    }
  } else if (apply ? options["dry-run"] || options["confirm-db"] !== database : options["confirm-db"] !== undefined) {
    throw new BackfillConfigurationError("database_confirmation_required");
  }
  if (!(env.TIME_CLOCK_SECRET || env.JWT_SECRET)?.trim()) {
    throw new BackfillConfigurationError("time_clock_secret_required");
  }
  return { uri, database, apply: apply || deployment, deployment };
}

async function main() {
  try {
    const { uri, database, apply, deployment } = getConfiguration(process.argv.slice(2), process.env);
    await mongoose.connect(uri, { autoIndex: false, autoCreate: false, serverSelectionTimeoutMS: 5000 });
    if (mongoose.connection.db.databaseName !== database) {
      throw new BackfillConfigurationError("unexpected_database");
    }
    const receipts = mongoose.connection.db.collection("gustomigrationreceipts");
    if (deployment) {
      if (await receipts.findOne({ _id: deploymentReceipt })) {
        console.log(JSON.stringify({ database, mode: "deployment", status: "already_completed" }));
        return;
      }
      const preview = await runPinBackfill();
      if (!preview.indexesReady && preview.issues.every(({ code }) => code === "missing_unique_indexes")) {
        await TimeClockPin.createIndexes();
      }
    }
    const report = await runPinBackfill({ apply });
    if (apply && report.indexesReady && report.secretVerified) {
      const verification = await runPinBackfill();
      report.verification = { totals: verification.totals, issues: verification.issues };
    }
    const incomplete = report.totals.errors || report.verification?.totals.errors || report.verification?.totals.missing;
    if (deployment && !incomplete) {
      try {
        await receipts.updateOne(
          { _id: deploymentReceipt }, { $setOnInsert: { completedAt: new Date() } }, { upsert: true },
        );
      } catch (error) {
        if (error.code !== 11000 || !(await receipts.findOne({ _id: deploymentReceipt }))) throw error;
      }
    }
    console.log(JSON.stringify({ database, ...report }, null, 2));
    if (incomplete) process.exitCode = 1;
  } catch (error) {
    const code = error instanceof BackfillConfigurationError ? error.message : "backfill_failed";
    console.error(JSON.stringify({ code }));
    process.exitCode = 1;
  } finally {
    await mongoose.disconnect().catch(() => {
      console.error(JSON.stringify({ code: "disconnect_failed" }));
      process.exitCode = 1;
    });
  }
}

if (require.main === module) void main();

module.exports = { getConfiguration };
