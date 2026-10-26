const test = require("node:test");
const assert = require("node:assert/strict");
const http = require("node:http");
const { once } = require("node:events");
const { createRequire } = require("node:module");
const vm = require("node:vm");

test("Axios preserves authenticated JSON, multipart uploads and session errors", async (t) => {
  const axios = require("axios");
  const requests = [];
  const server = http.createServer(async (req, res) => {
    const chunks = [];
    for await (const chunk of req) chunks.push(chunk);
    requests.push({
      headers: req.headers,
      body: Buffer.concat(chunks).toString(),
    });
    res.setHeader("Content-Type", "application/json");
    if (req.url === "/revoked") {
      res.writeHead(403).end(JSON.stringify({ message: "Session revoked" }));
    } else {
      res.end(JSON.stringify({ ok: true }));
    }
  });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  t.after(() => new Promise((resolve) => server.close(resolve)));
  const client = axios.create({
    baseURL: `http://127.0.0.1:${server.address().port}`,
    proxy: false,
    timeout: 5000,
  });
  client.interceptors.request.use((config) => {
    config.headers.Authorization = "Bearer local-test-token";
    return config;
  });
  const result = await client.post("/json", { restaurantId: "local-fixture" });
  assert.equal(result.data.ok, true);
  assert.equal(requests[0].headers.authorization, "Bearer local-test-token");
  assert.deepEqual(JSON.parse(requests[0].body), {
    restaurantId: "local-fixture",
  });

  const form = new FormData();
  form.append("title", "Actualité de test");
  form.append(
    "image",
    new Blob(["image-fixture"], { type: "image/png" }),
    "test.png",
  );
  await client.post("/upload", form);
  assert.match(
    requests[1].headers["content-type"],
    /^multipart\/form-data; boundary=/,
  );
  assert.match(requests[1].body, /name="title"/);
  assert.match(requests[1].body, /filename="test.png"/);
  assert.match(requests[1].body, /image-fixture/);
  await assert.rejects(client.get("/revoked"), (error) => {
    assert.equal(error.response.status, 403);
    assert.equal(error.response.data.message, "Session revoked");
    return true;
  });
});

test("PWA minification round-trips regular expressions and function options", async () => {
  const { rollup } = require("rollup");
  const { terser } = require("rollup-plugin-terser");
  const requireFromTerser = createRequire(
    require.resolve("rollup-plugin-terser"),
  );
  const serialize = requireFromTerser("serialize-javascript");
  const options = {
    pattern: /^cache-v\d+$/i,
    transform(value) {
      return value + 1;
    },
  };
  const restored = vm.runInNewContext(`(${serialize(options)})`);
  assert.equal(restored.pattern.test("CACHE-v2"), true);
  assert.equal(restored.transform(2), 3);
  assert.doesNotMatch(
    serialize({ text: "</script><img onerror=alert(1)>" }),
    /<\/script/i,
  );

  const bundle = await rollup({
    input: "virtual-worker",
    plugins: [
      {
        name: "local-worker-fixture",
        resolveId: (id) => (id === "virtual-worker" ? id : null),
        load: (id) =>
          id === "virtual-worker" ? "self.answer = (() => 40 + 2)();" : null,
      },
      terser({ numWorkers: 1, mangle: { reserved: ["self"] } }),
    ],
  });
  try {
    const { output } = await bundle.generate({ format: "iife" });
    const context = { self: {} };
    vm.runInNewContext(output[0].code, context);
    assert.equal(context.self.answer, 42);
  } finally {
    await bundle.close();
  }
});

test("The contact SDK retains its JSON email contract with patched transitives", async (t) => {
  const sdk = require("sib-api-v3-sdk");
  let received;
  const server = http.createServer(async (req, res) => {
    const chunks = [];
    for await (const chunk of req) chunks.push(chunk);
    received = {
      path: req.url,
      headers: req.headers,
      body: JSON.parse(Buffer.concat(chunks).toString()),
    };
    res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify({ messageId: "local-fixture-message" }));
  });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  t.after(() => new Promise((resolve) => server.close(resolve)));
  const client = new sdk.ApiClient();
  client.basePath = `http://127.0.0.1:${server.address().port}/v3`;
  client.authentications["api-key"].apiKey = "local-fixture-api-key";
  const api = new sdk.TransactionalEmailsApi(client);
  const email = new sdk.SendSmtpEmail();
  email.sender = { email: "no-reply@example.test", name: "Contact" };
  email.to = [{ email: "contact@example.test" }];
  email.replyTo = { email: "visitor@example.test" };
  email.subject = "Contact de validation";
  email.htmlContent = "<p>Message de validation</p>";
  const result = await api.sendTransacEmail(email);
  assert.equal(result.messageId, "local-fixture-message");
  assert.equal(received.path, "/v3/smtp/email");
  assert.equal(received.headers["api-key"], "local-fixture-api-key");
  assert.match(received.headers["content-type"], /^application\/json/);
  assert.equal(received.body.replyTo.email, "visitor@example.test");
  assert.equal(received.body.htmlContent, email.htmlContent);

  const sdkRequire = createRequire(require.resolve("sib-api-v3-sdk"));
  const superagentRequire = createRequire(sdkRequire.resolve("superagent"));
  const LegacyFormData = superagentRequire("form-data");
  const form = new LegacyFormData();
  form.append("message", "local-fixture");
  assert.match(
    form.getHeaders()["content-type"],
    /^multipart\/form-data; boundary=/,
  );
  assert.match(form.getBuffer().toString(), /local-fixture/);
});

test("PostCSS overrides retain Tailwind typography, variants and nested selectors", async () => {
  const postcss = require("postcss");
  const tailwind = require("tailwindcss");
  const typography = require("@tailwindcss/typography");
  const nested = require("postcss-nested");
  const nesting = require("postcss-nesting");
  const result = await postcss([
    nested(),
    tailwind({
      content: [
        { raw: '<article class="prose hover:text-red-500 md:flex"></article>' },
      ],
      corePlugins: { preflight: false },
      plugins: [typography],
    }),
  ]).process(
    "@tailwind components; @tailwind utilities; .editor { & > p { color: red; } }",
    { from: undefined },
  );
  assert.match(result.css, /\.prose/);
  assert.match(result.css, /\.hover\\:text-red-500:hover/);
  assert.match(result.css, /\.md\\:flex/);
  assert.match(result.css, /\.editor > p/);
  const standard = await postcss([nesting()]).process(
    ".editor { &:focus { color: blue; } }",
    { from: undefined },
  );
  assert.match(standard.css, /\.editor:focus/);
});

test("Server translations remain available in French and English", async () => {
  const {
    serverSideTranslations,
  } = require("next-i18next/serverSideTranslations");
  for (const locale of ["fr", "en"]) {
    const result = await serverSideTranslations(locale, [
      "common",
      "login",
      "news",
      "reservations",
    ]);
    for (const namespace of ["common", "login", "news", "reservations"]) {
      assert.ok(
        Object.keys(result._nextI18Next.initialI18nStore[locale][namespace])
          .length > 0,
      );
    }
  }
});

test("Reservation PDF text export remains usable with the updated jsPDF tree", () => {
  const { jsPDF } = require("jspdf");
  const pdf = new jsPDF({ compress: true, putOnlyUsedFonts: true });
  pdf.setFont("helvetica", "bold");
  pdf.text("Réservations - midi", 14, 20);
  pdf.setFont("helvetica", "normal");
  pdf.text(pdf.splitTextToSize("Client de test - 4 personnes", 80), 14, 30);
  pdf.rect(14, 35, 80, 8);
  pdf.addPage("a4", "portrait");
  assert.equal(pdf.getNumberOfPages(), 2);
  assert.match(
    Buffer.from(pdf.output("arraybuffer")).toString("latin1"),
    /^%PDF-/,
  );
});
