const test = require("node:test");
const assert = require("node:assert/strict");
const crypto = require("crypto");
const http = require("http");
const express = require("express");

process.env.STRIPE_API_SECRET_KEY ||= "sk_test_smsmode_webhook";

const smsmodeWebhookRoutes = require("../routes/smsmode-webhook.routes");
const { createSmsmodeWebhookRouter, signatureIsValid } = smsmodeWebhookRoutes;

function sign(body, secret) {
  return crypto.createHmac("sha256", secret).update(body).digest("hex");
}

function startServer(app) {
  return new Promise((resolve) => {
    const server = app.listen(0, "127.0.0.1", () => resolve(server));
  });
}

function request(server, { path, body, signature }) {
  return new Promise((resolve, reject) => {
    const payload = Buffer.isBuffer(body) ? body : Buffer.from(body || "");
    const headers = {
      "Content-Type": "application/json",
      "Content-Length": payload.length,
    };
    if (signature !== undefined) headers["X-Smsmode-256"] = signature;

    const req = http.request(
      {
        host: "127.0.0.1",
        port: server.address().port,
        method: "POST",
        path,
        headers,
      },
      (res) => {
        const chunks = [];
        res.on("data", (chunk) => chunks.push(chunk));
        res.on("end", () => {
          const responseBody = Buffer.concat(chunks).toString("utf8");
          resolve({
            status: res.statusCode,
            body: responseBody ? JSON.parse(responseBody) : null,
          });
        });
      },
    );
    req.on("error", reject);
    req.end(payload);
  });
}

test("sécurise le body brut et la signature du webhook smsmode", async (t) => {
  const previousSecret = process.env.SMSMODE_WEBHOOK_SECRET;
  const secret = "smsmode_webhook_test_secret";
  process.env.SMSMODE_WEBHOOK_SECRET = secret;

  const app = express();
  app.use("/api", smsmodeWebhookRoutes);
  app.use(express.json());
  app.post("/api/json-test", (req, res) =>
    res.json({ value: req.body?.value, isBuffer: Buffer.isBuffer(req.body) }),
  );
  const server = await startServer(app);

  const parsedFirstApp = express();
  parsedFirstApp.use(express.json());
  parsedFirstApp.use("/api", smsmodeWebhookRoutes);
  const parsedFirstServer = await startServer(parsedFirstApp);

  t.after(() => {
    server.close();
    parsedFirstServer.close();
    if (previousSecret === undefined) delete process.env.SMSMODE_WEBHOOK_SECRET;
    else process.env.SMSMODE_WEBHOOK_SECRET = previousSecret;
  });

  const rawBody = Buffer.from('{ "status": "DELIVERED" }\n');
  const valid = await request(server, {
    path: "/api/smsmode/dlr",
    body: rawBody,
    signature: sign(rawBody, secret),
  });
  assert.equal(valid.status, 200);
  assert.deepEqual(valid.body, { received: true });

  const invalid = await request(server, {
    path: "/api/smsmode/dlr",
    body: rawBody,
    signature: "0".repeat(64),
  });
  assert.equal(invalid.status, 401);

  const missing = await request(server, {
    path: "/api/smsmode/dlr",
    body: rawBody,
  });
  assert.equal(missing.status, 401);

  assert.equal(signatureIsValid(rawBody, "signature-trop-courte"), false);
  assert.equal(signatureIsValid({ status: "DELIVERED" }, sign(rawBody, secret)), false);
  const parsedFirst = await request(parsedFirstServer, {
    path: "/api/smsmode/dlr",
    body: rawBody,
    signature: sign(rawBody, secret),
  });
  assert.equal(parsedFirst.status, 401);

  const invalidJson = Buffer.from("{invalid-json");
  const malformed = await request(server, {
    path: "/api/smsmode/dlr",
    body: invalidJson,
    signature: sign(invalidJson, secret),
  });
  assert.equal(malformed.status, 400);

  const normalJson = await request(server, {
    path: "/api/json-test",
    body: JSON.stringify({ value: "ok" }),
  });
  assert.equal(normalJson.status, 200);
  assert.deepEqual(normalJson.body, { value: "ok", isBuffer: false });
});

test("traite les DLR delivered/failed dupliqués de façon idempotente", async (t) => {
  const previousSecret = process.env.SMSMODE_WEBHOOK_SECRET;
  const secret = "smsmode_dlr_idempotence_secret";
  process.env.SMSMODE_WEBHOOK_SECRET = secret;
  const jobs = {
    delivered: {
      _id: "delivered-job",
      providerMessageId: "delivered",
      status: "accepted",
      usageState: "consumed",
      stripeUsageState: "reported",
      deliveredAt: null,
      saveCount: 0,
      async save() { this.saveCount += 1; },
    },
    failed: {
      _id: "failed-job",
      providerMessageId: "failed",
      status: "accepted",
      usageState: "consumed",
      stripeUsageState: "reported",
      saveCount: 0,
      async save() { this.saveCount += 1; },
    },
  };
  const app = express();
  app.use("/api", createSmsmodeWebhookRouter({
    smsJobModel: {
      async findOne(query) {
        const messageId = query.$or.find((item) => item.providerMessageId)
          ?.providerMessageId;
        return jobs[messageId] || null;
      },
    },
  }));
  const server = await startServer(app);
  t.after(() => {
    server.close();
    if (previousSecret === undefined) delete process.env.SMSMODE_WEBHOOK_SECRET;
    else process.env.SMSMODE_WEBHOOK_SECRET = previousSecret;
  });

  for (const payload of [
    { messageId: "delivered", status: { value: "DELIVERED", deliveryDate: "2026-09-17T12:00:00.000Z" } },
    { messageId: "failed", status: { value: "UNDELIVERABLE", detail: "rejected" } },
  ]) {
    const body = Buffer.from(JSON.stringify(payload));
    for (let index = 0; index < 2; index += 1) {
      const response = await request(server, {
        path: "/api/smsmode/dlr",
        body,
        signature: sign(body, secret),
      });
      assert.equal(response.status, 200);
    }
  }
  await new Promise((resolve) => setImmediate(resolve));

  assert.equal(jobs.delivered.status, "delivered");
  assert.equal(jobs.delivered.saveCount, 1);
  assert.equal(jobs.delivered.usageState, "consumed");
  assert.equal(jobs.delivered.stripeUsageState, "reported");
  assert.equal(jobs.failed.status, "failed");
  assert.equal(jobs.failed.saveCount, 1);
  assert.equal(jobs.failed.usageState, "consumed");
  assert.equal(jobs.failed.stripeUsageState, "reported");
});
