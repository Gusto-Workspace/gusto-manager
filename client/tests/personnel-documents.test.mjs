import assert from "node:assert/strict";
import { test } from "node:test";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { runInNewContext } from "node:vm";
import {
  buildEmployeeDocumentsForm, categories, filterEmployeeDocuments, getEmployeeDocumentsPage,
} from "../src/components/dashboard/_shared/employee-documents.utils.mjs";

const documents = [
  { title: "Attestation Sécu", category: "social_security", visibility: "employee", uploadedAt: "2026-11-17" },
  { title: "Contrat CDI", filename: "nouvelle-équipe.pdf", category: "contract", visibility: "internal", uploadedAt: "2026-11-18" },
  { title: "Bulletin historique", filename: "bulletin.pdf" },
];

test("the HR folders match the reference labels and preserve unclassified records", () => {
  assert.deepEqual(Object.values(categories), [
    "Non classé", "Contrats", "Sécu soc. & Mutuelle", "Justificatifs", "Fiches de paie", "Feuilles d’heures", "Autre",
  ]);
  assert.deepEqual(filterEmployeeDocuments(documents, { category: "uncategorized" }), [documents[2]]);
  assert.deepEqual(filterEmployeeDocuments(documents), [documents[1], documents[0], documents[2]]);
});

test("search combines accent-insensitive names with folder and visibility filters", () => {
  assert.deepEqual(filterEmployeeDocuments(documents, { search: " EQUIPE ", category: "contract", visibility: "internal" }), [documents[1]]);
  assert.deepEqual(filterEmployeeDocuments(documents, { search: "secu", visibility: "employee" }), [documents[0]]);
  assert.deepEqual(filterEmployeeDocuments(documents, { search: "secu", category: "contract" }), []);
});

test("each folder and search get 30 results from the whole document list", () => {
  const roster = Array.from({ length: 65 }, (_, index) => ({
    title: index < 32 ? `Contrat ${index}` : `Bulletin ${index}`,
    category: index < 32 ? "contract" : "payroll",
    uploadedAt: new Date(Date.UTC(2026, 0, index + 1)).toISOString(),
  }));
  const all = getEmployeeDocumentsPage(roster);
  assert.equal(all.visibleDocuments.length, 30);
  assert.equal(all.total, 65);
  assert.ok(all.visibleDocuments.every(({ category }) => category === "payroll"));
  assert.equal(getEmployeeDocumentsPage(roster, {}, 60).visibleDocuments.length, 60);
  assert.equal(getEmployeeDocumentsPage(roster, {}, 90).visibleDocuments.length, 65);

  const contracts = getEmployeeDocumentsPage(roster, { category: "contract" });
  assert.equal(contracts.visibleDocuments.length, 30);
  assert.equal(contracts.total, 32);
  assert.deepEqual(contracts.visibleDocuments[0], roster[31]);
  assert.equal(getEmployeeDocumentsPage(roster, { category: "contract" }, 60).visibleDocuments.length, 32);
  assert.deepEqual(getEmployeeDocumentsPage(roster, { search: "Contrat 0" }).visibleDocuments, [roster[0]]);
});

test("multipart upload preserves file ordering with one metadata entry per file", () => {
  const first = new File(["%PDF-1.7\n%%EOF"], "contrat.pdf", { type: "application/pdf" });
  const second = new File(["%PDF-1.7\n%%EOF"], "note.pdf", { type: "application/pdf" });
  const form = buildEmployeeDocumentsForm([
    { file: first, title: " Contrat ", category: "contract", visibility: "employee" },
    { file: second, title: "Note" },
  ]);
  assert.deepEqual(form.getAll("documents").map(({ name }) => name), ["contrat.pdf", "note.pdf"]);
  assert.deepEqual(JSON.parse(form.get("metadata")), [
    { title: "Contrat", category: "contract", visibility: "employee" },
    { title: "Note", category: "uncategorized", visibility: "internal" },
  ]);
});

const appOrigin = "https://manager.example.test";
const apiOrigin = "https://api.example.test";
const apiRequests = [
  `${appOrigin}/api/contact-form-email`,
  `${apiOrigin}/api/restaurants/one/employees/a/documents?scope=personal`,
  `${apiOrigin}/api/restaurants/one/reservations`,
  `${apiOrigin}/api/restaurants/one/callsense/calls`,
  `${apiOrigin}/api/restaurants/one/gift-card-orders`,
  `${apiOrigin}/api/restaurants/one/take-away/orders`,
  `${apiOrigin}/api/time-clock/device`,
  `${apiOrigin}/api/admin/documents`,
  `${apiOrigin}/api/restaurants/one/menus`,
  `${apiOrigin}/api/future-module/report.csv`,
  `${apiOrigin}/api/future-module/avatar.png`,
  `${apiOrigin}/api?status`,
  "http://localhost:8012/api",
];

const assetRoutes = new Map([
  [`${appOrigin}/_next/static/chunks/page.js`, "static-js-assets"],
  [`${appOrigin}/locales/fr/planning.json`, "static-data-assets"],
  [`${appOrigin}/apiary/page`, "others"],
  [`${apiOrigin}/file?returnTo=/api/employees/me`, "cross-origin"],
]);

test("the production worker bypasses caching for all API routes before any default strategy", () => {
  const entry = new URL("../next.config.js", import.meta.url);
  const requireFromConfig = createRequire(entry);
  let routes;
  runInNewContext(readFileSync(entry, "utf8"), {
    module: { exports: {} },
    process: { env: { NODE_ENV: "production" } },
    require(name) {
      if (name === "next-pwa") return (config) => { routes = config.runtimeCaching; return (next) => next; };
      return requireFromConfig(name);
    },
  });
  const matchers = routes.map(({ urlPattern }) => {
    if (typeof urlPattern !== "function") return (href) => urlPattern.test(href);
    const matchUrl = runInNewContext(`(${urlPattern.toString()})`, { self: { origin: appOrigin } });
    return (href) => matchUrl({ url: new URL(href) });
  });
  const match = (href) => routes[matchers.findIndex((matches) => matches(href))];
  assert.ok(!routes.some(({ options }) => options?.cacheName === "apis"));
  for (const url of apiRequests) {
    assert.equal(match(url)?.handler, "NetworkOnly", url);
    assert.equal(match(url)?.options?.fetchOptions?.cache, "no-store", url);
  }
  for (const [url, cacheName] of assetRoutes) assert.equal(match(url)?.options?.cacheName, cacheName, url);
});

test("activation purges old API responses from every cache and preserves unrelated entries", async () => {
  const cacheNames = ["apis", "cross-origin", "others", "static-data-assets", "static-image-assets", "workbox-precache"];
  const gustoApiRequests = apiRequests.filter((url) => [appOrigin, apiOrigin].includes(new URL(url).origin));
  const requests = [...apiRequests, ...assetRoutes.keys(), "https://third-party.example.test/api/resources"].map((url) => ({ url }));
  const deleted = [];
  let activate;
  const worker = new URL("../worker/index.js", import.meta.url);
  runInNewContext(readFileSync(worker, "utf8"), {
    URL,
    process: { env: { NEXT_PUBLIC_API_URL: `${apiOrigin}/api` } },
    self: { location: { origin: appOrigin }, addEventListener: (event, handler) => { if (event === "activate") activate = handler; } },
    caches: {
      keys: async () => cacheNames,
      open: async (name) => ({
        keys: async () => requests,
        delete: async ({ url }) => deleted.push([name, url]),
      }),
    },
  });
  let cleanup;
  activate({ waitUntil: (promise) => { cleanup = promise; } });
  await cleanup;
  assert.equal(deleted.length, cacheNames.length * gustoApiRequests.length);
  for (const name of cacheNames) {
    assert.deepEqual(deleted.filter(([cache]) => cache === name).map(([, url]) => url), gustoApiRequests);
  }
});
