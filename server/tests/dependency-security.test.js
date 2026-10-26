const assert = require("node:assert/strict");
const test = require("node:test");
const { once } = require("node:events");
const http = require("node:http");
const { gzipSync } = require("node:zlib");
const express = require("express");
const axios = require("axios");
const sharp = require("sharp");

async function serve(t, handler) {
  const server = http.createServer(handler);
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  t.after(() => new Promise((resolve) => server.close(resolve)));
  return `http://127.0.0.1:${server.address().port}`;
}

test("JSON gzip errors are handled without breaking subsequent API requests", async (t) => {
  const app = express();
  app.use(express.json({ limit: "1kb" }));
  app.post("/json", (req, res) => res.json(req.body));
  app.use((error, req, res, next) => res.sendStatus(error.status || 500));
  const baseURL = await serve(t, app);
  const client = axios.create({
    baseURL,
    proxy: false,
    validateStatus: () => true,
  });
  const options = {
    headers: { "Content-Type": "application/json", "Content-Encoding": "gzip" },
  };
  const valid = gzipSync(Buffer.from('{"ok":true}'));
  assert.equal((await client.post("/json", valid, options)).status, 200);
  const invalid = await client.post(
    "/json",
    Buffer.concat([valid, Buffer.from("trailing invalid gzip bytes")]),
    options,
  );
  assert.equal(invalid.status, 400);
  const oversized = gzipSync(
    Buffer.from(JSON.stringify({ data: "x".repeat(2048) })),
  );
  assert.equal((await client.post("/json", oversized, options)).status, 413);
  assert.deepEqual((await client.post("/json", { ok: true })).data, {
    ok: true,
  });
});

test("gift-card image conversion still embeds PNG, JPEG, WebP and SVG in PDFs", async (t) => {
  const {
    generateGiftCardPdfBuffer,
  } = require("../services/gift-card-mailer.service");
  const svg = Buffer.from(
    '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16"><rect width="16" height="16" fill="red"/></svg>',
  );
  const fixtures = {
    png: await sharp(svg).png().toBuffer(),
    jpeg: await sharp(svg).jpeg().toBuffer(),
    webp: await sharp(svg).webp().toBuffer(),
    svg,
  };
  const baseURL = await serve(t, (req, res) =>
    res.end(fixtures[req.url.slice(1)]),
  );
  for (const format of Object.keys(fixtures)) {
    await t.test(format, async () => {
      const buffer = await generateGiftCardPdfBuffer({
        restaurant: { name: "Dependency test" },
        purchase: {
          value: 25,
          visualSnapshot: { imageUrl: `${baseURL}/${format}` },
        },
        allowImageFallback: false,
      });
      assert.equal(buffer.subarray(0, 4).toString(), "%PDF");
      assert.match(buffer.toString("latin1"), /\/Subtype\s*\/Image/);
    });
  }
});

test("Brevo SDK serializes transactional email against a local HTTP double", async (t) => {
  const sdk = require("sib-api-v3-sdk");
  let received;
  const baseURL = await serve(t, async (req, res) => {
    const chunks = [];
    for await (const chunk of req) chunks.push(chunk);
    received = {
      path: req.url,
      body: JSON.parse(Buffer.concat(chunks)),
      key: req.headers["api-key"],
    };
    res.writeHead(201, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ messageId: "local-test-only" }));
  });
  const client = new sdk.ApiClient();
  client.basePath = `${baseURL}/v3`;
  client.authentications["api-key"].apiKey = "local-test-only";
  const response = await new sdk.TransactionalEmailsApi(
    client,
  ).sendTransacEmail({
    sender: { email: "sender@example.invalid" },
    to: [{ email: "recipient@example.invalid" }],
    subject: "Local test",
    htmlContent: "<p>Local test</p>",
  });
  assert.equal(response.messageId, "local-test-only");
  assert.equal(received.path, "/v3/smtp/email");
  assert.equal(received.key, "local-test-only");
  assert.equal(received.body.htmlContent, "<p>Local test</p>");
});

test("Mongoose sanitizes operators inside $nor without a database connection", () => {
  const mongoose = require("mongoose");
  const filter = { $nor: [{ email: { $ne: null } }] };
  mongoose.sanitizeFilter(filter);
  assert.deepEqual(filter, { $nor: [{ email: { $eq: { $ne: null } } }] });
});

test("JWT HMAC verification accepts valid tokens and rejects a changed payload", () => {
  const jwt = require("jsonwebtoken");
  const secret = "dependency-test-secret";
  const token = jwt.sign({ role: "employee" }, secret, { algorithm: "HS256" });
  assert.equal(
    jwt.verify(token, secret, { algorithms: ["HS256"] }).role,
    "employee",
  );
  const parts = token.split(".");
  parts[1] = Buffer.from(JSON.stringify({ role: "owner" })).toString(
    "base64url",
  );
  assert.throws(
    () => jwt.verify(parts.join("."), secret, { algorithms: ["HS256"] }),
    /invalid signature/,
  );
});

test("dish-card XLSX import preserves XML text and business fields", async () => {
  const { zipSync, strToU8 } = require("fflate");
  const {
    DISH_IMPORT_COLUMNS,
    parseDishCardWorkbook,
  } = require("../services/dish-card-import.service");
  const row = [
    "Plats",
    "",
    "",
    "Poisson &amp; légumes",
    "",
    "18.50",
    "true",
    "false",
    "false",
    "false",
    "true",
  ];
  const cells = (values, rowNumber) =>
    values
      .map(
        (value, i) =>
          `<c r="${String.fromCharCode(65 + i)}${rowNumber}" t="inlineStr"><is><t>${value}</t></is></c>`,
      )
      .join("");
  const workbook = zipSync({
    "xl/workbook.xml": strToU8(
      '<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="Carte" sheetId="1" r:id="rId1"/></sheets></workbook>',
    ),
    "xl/_rels/workbook.xml.rels": strToU8(
      '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Target="worksheets/sheet1.xml"/></Relationships>',
    ),
    "xl/worksheets/sheet1.xml": strToU8(
      `<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData><row r="1">${cells(DISH_IMPORT_COLUMNS, 1)}</row><row r="2">${cells(row, 2)}</row></sheetData></worksheet>`,
    ),
  });
  const result = await parseDishCardWorkbook(Buffer.from(workbook));
  assert.equal(result.summary.dishCount, 1);
  assert.equal(result.categories[0].dishes[0].name, "Poisson & légumes");
  assert.equal(result.categories[0].dishes[0].price, 18.5);
  assert.equal(result.categories[0].dishes[0].glutenFree, true);
});

test("backup tar creation retains gzip and collection contents", async (t) => {
  const fs = require("node:fs/promises");
  const path = require("node:path");
  const os = require("node:os");
  const tar = require("tar");
  const cwd = await fs.mkdtemp(path.join(os.tmpdir(), "gusto-tar-test-"));
  t.after(() => fs.rm(cwd, { recursive: true, force: true }));
  await fs.writeFile(
    path.join(cwd, "restaurants.json"),
    '[{"name":"Local test"}]',
  );
  const file = path.join(cwd, "backup.tar.gz");
  await tar.c({ gzip: true, file, cwd }, ["restaurants.json"]);
  const entries = [];
  const chunks = [];
  await tar.t({
    file,
    onReadEntry(entry) {
      entries.push(entry.path);
      entry.on("data", (chunk) => chunks.push(chunk));
    },
  });
  assert.deepEqual(entries, ["restaurants.json"]);
  assert.equal(Buffer.concat(chunks).toString(), '[{"name":"Local test"}]');
});
