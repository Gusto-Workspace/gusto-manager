export const categories = {
  uncategorized: "Non classé",
  contract: "Contrats",
  social_security: "Sécu soc. & Mutuelle",
  supporting: "Justificatifs",
  payroll: "Fiches de paie",
  timesheet: "Feuilles d’heures",
  other: "Autre",
};

export const visibilities = {
  internal: "Interne",
  employee: "Visible par le salarié",
};

export const documentAccept = ".pdf,.jpg,.jpeg,.png,.webp,.gif";
export const documentLimit = 10;
export const documentSizeLimit = 10 * 1024 * 1024;
export const documentPageSize = 30;

export function documentCategory(document) {
  return Object.hasOwn(categories, document.category) ? document.category : "uncategorized";
}

function normalize(value) {
  return String(value ?? "").normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase().trim();
}

export function filterEmployeeDocuments(documents, { search = "", category = "", visibility = "" } = {}) {
  const query = normalize(search);
  return documents.filter((document) => {
    const documentVisibility = document.visibility === "employee" ? "employee" : "internal";

    return (!category || category === documentCategory(document)) &&
      (!visibility || visibility === documentVisibility) &&
      (!query || normalize(`${document.title ?? ""} ${document.filename ?? ""}`).includes(query));
  }).sort((first, second) => (Date.parse(second.uploadedAt) || 0) - (Date.parse(first.uploadedAt) || 0));
}

export function getEmployeeDocumentsPage(documents, filters, visibleLimit = documentPageSize) {
  const results = filterEmployeeDocuments(documents, filters);
  return { visibleDocuments: results.slice(0, visibleLimit), total: results.length };
}

export function documentMetadata(document) {
  return {
    title: document.title.trim(),
    category: document.category || "uncategorized",
    visibility: document.visibility || "internal",
  };
}

export function buildEmployeeDocumentsForm(documents) {
  const form = new FormData();
  for (const { file } of documents) form.append("documents", file);
  form.append("metadata", JSON.stringify(documents.map(documentMetadata)));
  return form;
}
