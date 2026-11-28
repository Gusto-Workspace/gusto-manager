const net = require("node:net");
const { createHash, randomBytes, randomUUID } = require("node:crypto");
const { appendFileSync, readFileSync, realpathSync, unlinkSync, writeFileSync } = require("node:fs");
const { join } = require("node:path");
const { Readable, Writable } = require("node:stream");

const uri = new URL(process.env.GUSTO_COMMERCIAL_TEST_MONGO_URI || "http://invalid.test");
if (process.env.NODE_ENV !== "test" || uri.protocol !== "mongodb:" ||
    uri.hostname !== "127.0.0.1" || Number(uri.port) < 20000 ||
    !/^\/gusto_commercial_[a-z0-9_]+$/.test(uri.pathname) ||
    uri.username || uri.password ||
    uri.searchParams.get("replicaSet") !== "gustoCommercialRecette" ||
    [...uri.searchParams.keys()].some((key) => key !== "replicaSet")) {
  throw new Error("A dedicated loopback MongoDB replica set is required.");
}

for (const name of Object.keys(process.env)) {
  if (/^(?:CONNECTION_STRING|MONGO|STRIPE|BREVO|CLOUDINARY|TWILIO|SMSMODE|AWS|VAPID|EMITTER_|SUPER_ADMIN_PASSWORD_HASH|COMMERCIAL_OPERATIONAL_PURGE_ENABLED)/.test(name)) {
    delete process.env[name];
  }
}
process.env.CONNECTION_STRING_TEST = uri.toString();
process.env.CONNECTION_STRING = process.env.CONNECTION_STRING_TEST;
process.env.JWT_SECRET = randomBytes(32).toString("hex");
process.env.COMMERCIAL_JWT_SECRET = randomBytes(32).toString("hex");
process.env.ENCRYPTION_SECRET = randomBytes(32).toString("hex");
process.env.STRIPE_API_SECRET_KEY = "fixture-stripe";
process.env.EMITTER_IBAN = "FR76 0000 0000 0000 0000 0000 000";
process.env.EMITTER_BIC = "RECETTE0XXX";
const appUrl = URL.parse(process.env.APP_URL || "");
if (!appUrl || appUrl.protocol !== "http:" || !["127.0.0.1", "localhost"].includes(appUrl.hostname) ||
    Number(appUrl.port) < 1024 || appUrl.username || appUrl.password) throw new Error("Invalid fixture APP_URL.");

require("dotenv").config = () => ({ parsed: {} });
const cron = require("node-cron");
cron.schedule = () => ({ start() {}, stop() {}, destroy() {} });
const push = require("web-push");
push.setVapidDetails = () => {};
push.sendNotification = async () => ({ statusCode: 201 });

const listen = net.Server.prototype.listen;
const connect = net.Socket.prototype.connect;
const allowedPorts = new Set([Number(uri.port)]);
net.Server.prototype.listen = function isolatedListen(port, host, callback) {
  if (typeof port === "string" && /^\d+$/.test(port)) port = Number(port);
  if (typeof port !== "number" || (typeof host === "string" && host !== "127.0.0.1")) {
    throw new Error("Test listeners must bind to IPv4 loopback.");
  }
  this.once("listening", () => {
    const { port } = this.address();
    allowedPorts.add(port);
    this.once("close", () => allowedPorts.delete(port));
  });
  return listen.call(this, port, "127.0.0.1", typeof host === "function" ? host : callback);
};
net.Socket.prototype.connect = function isolatedConnect(...args) {
  const [options] = Array.isArray(args[0]) ? args[0] : net._normalizeArgs(args);
  if (options.host !== "127.0.0.1" || !allowedPorts.has(Number(options.port))) {
    throw new Error("Outbound network denied in commercial tests.");
  }
  return connect.apply(this, args);
};

const emptyList = async () => ({ data: [], has_more: false });
const stripeCalls = [];
const stripe = {
  invoices: { list: emptyList },
  products: { list: emptyList },
  subscriptions: { list: emptyList },
  customers: {
    retrieve: async (id) => ({ id, metadata: {} }),
    create: async () => { stripeCalls.push("customer.create"); throw new Error("Unexpected fixture operation"); },
    update: async () => { stripeCalls.push("customer.update"); throw new Error("Unexpected fixture operation"); },
  },
  setupIntents: {
    create: async ({ customer }) => { stripeCalls.push("setup.create"); return { client_secret: `fixture-${customer}` }; },
  },
};
require.cache[require.resolve("stripe")] = { loaded: true, exports: () => stripe };

const messages = [];
const emailFixture = { fail: false, beforeSend: null };
const brevo = require("sib-api-v3-sdk");
brevo.TransactionalEmailsApi = class FixtureTransactionalEmailsApi {
  async sendTransacEmail(message) {
    if (emailFixture.beforeSend) await emailFixture.beforeSend(message);
    if (emailFixture.fail) throw new Error("Fixture delivery acknowledgement missing");
    const fixture = { to: message.to, subject: message.subject, htmlContent: message.htmlContent };
    messages.push(fixture);
    if (filesDir) appendFileSync(join(filesDir, "..", "outbox.ndjson"), JSON.stringify(fixture) + "\n", { mode: 0o600 });
    return { messageId: randomUUID() };
  }
};

const files = new Map();
const fileFixture = { beforeUpload: null, beforeDestroy: null };
const filesDir = process.env.GUSTO_COMMERCIAL_TEST_FILES_DIR;
if (filesDir && (uri.pathname !== "/gusto_commercial_user_review_v4" ||
    !/^\/private\/tmp\/gusto-commercial-user-review\.[a-zA-Z0-9]+\/assets$/.test(filesDir) || realpathSync(filesDir) !== filesDir)) {
  throw new Error("Use the dedicated directory for review assets.");
}
function filePath(id) {
  return join(filesDir, createHash("sha256").update(id).digest("hex"));
}
function fixtureFile(id) {
  if (files.has(id) || !filesDir) return files.get(id);
  try {
    const data = JSON.parse(readFileSync(filePath(id), "utf8"));
    return { type: data.type, buffer: Buffer.from(data.base64, "base64") };
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
    return undefined;
  }
}
const cloudinary = require("cloudinary").v2;
cloudinary.uploader.upload_stream = (options, callback) => {
  const chunks = [];
  return new Writable({
    write(chunk, _encoding, done) {
      chunks.push(Buffer.from(chunk));
      done();
    },
    final(done) {
      const id = `${options.folder}/${options.public_id}`;
      Promise.resolve(fileFixture.beforeUpload?.(id)).then(() => {
        const file = { buffer: Buffer.concat(chunks), type: options.type || "upload" };
        files.set(id, file);
        if (filesDir) writeFileSync(filePath(id), JSON.stringify({ type: file.type, base64: file.buffer.toString("base64") }), { mode: 0o600 });
        callback(null, { public_id: id, secure_url: `https://fixture-storage.invalid/${id}` });
        done();
      }).catch(done);
    },
  });
};
cloudinary.uploader.destroy = async (id) => {
  const result = await fileFixture.beforeDestroy?.(id);
  if (result) return { result };
  const present = Boolean(fixtureFile(id));
  files.delete(id);
  if (present && filesDir) unlinkSync(filePath(id));
  return { result: present ? "ok" : "not found" };
};
cloudinary.utils.private_download_url = (id, _format, options) => {
  if (options.type !== "authenticated" || fixtureFile(id)?.type !== "authenticated") {
    throw new Error("Private delivery is required for the fixture.");
  }
  return `fixture-file:${id}`;
};
const axios = require("axios");
const axiosGet = axios.get.bind(axios);
axios.get = async (url, config) => {
  if (!String(url).startsWith("fixture-file:")) return axiosGet(url, config);
  const file = fixtureFile(url.slice("fixture-file:".length));
  if (!file) throw new Error("Fixture file not found.");
  return { data: config?.responseType === "stream" ? Readable.from(file.buffer) : file.buffer };
};

module.exports = { mongoUri: uri.toString(), messages, stripeCalls, emailFixture, fileFixture, files };
