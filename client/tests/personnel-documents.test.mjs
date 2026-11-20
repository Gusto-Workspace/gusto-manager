import assert from "node:assert/strict";
import { test } from "node:test";
import { readFileSync } from "node:fs";
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

test("the service worker purges old HR document cache entries without removing planning data", async () => {
  const requests = [
    { url: "https://api.example.test/api/restaurants/one/employees/a/documents?scope=personal" },
    { url: "https://api.example.test/api/restaurants/one/employees/a/documents/private%2Ffile.pdf/download" },
    { url: "https://api.example.test/api/restaurants/one/employees/a/shifts" },
  ];
  const deleted = [];
  let activate;
  const worker = readFileSync(new URL("../worker/index.js", import.meta.url), "utf8");
  runInNewContext(worker, {
    URL,
    self: { addEventListener: (event, handler) => { if (event === "activate") activate = handler; } },
    caches: {
      has: async (name) => name === "cross-origin",
      open: async () => ({ keys: async () => requests, delete: async (request) => deleted.push(request) }),
    },
  });
  let cleanup;
  activate({ waitUntil: (promise) => { cleanup = promise; } });
  await cleanup;
  assert.deepEqual(deleted, requests.slice(0, 2));
});
