const crypto = require("crypto");

const SIGNATURE_REQUEST_TTL_MS = 24 * 60 * 60 * 1000;
const MAX_SIGNATURE_IMAGE_BYTES = 500 * 1024;

function normalizeString(value) {
  return typeof value === "string" ? value.trim() : "";
}

function plainValue(value) {
  if (value == null) return value;
  if (typeof value.toObject === "function") {
    return value.toObject({ depopulate: true, versionKey: false });
  }
  return JSON.parse(JSON.stringify(value));
}

function createSignatureToken() {
  return crypto.randomBytes(32).toString("hex");
}

function hashSignatureToken(token) {
  return crypto
    .createHash("sha256")
    .update(normalizeString(token))
    .digest("hex");
}

function buildContractContentSnapshot(documentData, commercialSnapshot) {
  const source = plainValue(documentData) || {};
  const issueDate = source.issueDate || new Date();

  return {
    type: "CONTRACT",
    docNumber: source.docNumber || "",
    contractKind: source.contractKind === "AMENDMENT" ? "AMENDMENT" : "INITIAL",
    versionNumber: Number(source.versionNumber || 1),
    issueDate: new Date(issueDate).toISOString(),
    party: plainValue(source.party) || {},
    lines: plainValue(source.lines) || [],
    website: plainValue(source.website) || {},
    subscription: plainValue(source.subscription) || {},
    engagementMonths: Number(source.engagementMonths || 0),
    modules: plainValue(source.modules) || [],
    timeClockTerminalRental: plainValue(source.timeClockTerminalRental) || {},
    comments: normalizeString(source.comments),
    amendment: plainValue(source.amendment) || null,
    commercialSnapshot: plainValue(commercialSnapshot) || null,
  };
}

function stableSerialize(value) {
  if (Array.isArray(value)) {
    return `[${value.map(stableSerialize).join(",")}]`;
  }
  if (value && typeof value === "object") {
    return `{${Object.keys(value)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${stableSerialize(value[key])}`)
      .join(",")}}`;
  }
  const serialized = JSON.stringify(value);
  return serialized === undefined ? "null" : serialized;
}

function hashContractContent(snapshot) {
  return crypto
    .createHash("sha256")
    .update(stableSerialize(snapshot))
    .digest("hex");
}

function hashSignatureImage(buffer) {
  return crypto.createHash("sha256").update(buffer).digest("hex");
}

function buildSignatureProofSnapshot({
  contractContentHash,
  presentedPdfHash,
  signerName,
  signerEmail,
  placeOfSignature,
  signedAt,
  acceptedAt,
  signatureImageHash,
  method,
}) {
  return {
    contractContentHash: normalizeString(contractContentHash),
    presentedPdfHash: normalizeString(presentedPdfHash),
    signerName: normalizeString(signerName),
    signerEmail: normalizeString(signerEmail).toLowerCase(),
    placeOfSignature: normalizeString(placeOfSignature),
    signedAt: new Date(signedAt).toISOString(),
    acceptedAt: new Date(acceptedAt || signedAt).toISOString(),
    signatureImageHash: normalizeString(signatureImageHash),
    method: method === "IN_PERSON" ? "IN_PERSON" : "REMOTE",
  };
}

function decodeSignatureDataUrl(dataUrl) {
  const match = /^data:image\/(png|jpeg);base64,([a-z0-9+/=]+)$/i.exec(
    normalizeString(dataUrl),
  );
  if (!match) {
    const error = new Error("Le format de la signature est invalide.");
    error.statusCode = 400;
    throw error;
  }

  const buffer = Buffer.from(match[2], "base64");
  if (!buffer.length || buffer.length > MAX_SIGNATURE_IMAGE_BYTES) {
    const error = new Error(
      "L'image de signature est vide ou trop volumineuse.",
    );
    error.statusCode = 400;
    throw error;
  }

  const isPng =
    buffer.length >= 8 &&
    buffer[0] === 0x89 &&
    buffer[1] === 0x50 &&
    buffer[2] === 0x4e &&
    buffer[3] === 0x47;
  const isJpeg =
    buffer.length >= 3 &&
    buffer[0] === 0xff &&
    buffer[1] === 0xd8 &&
    buffer[2] === 0xff;

  if (!isPng && !isJpeg) {
    const error = new Error(
      "Le fichier de signature n'est pas une image valide.",
    );
    error.statusCode = 400;
    throw error;
  }

  return buffer;
}

function signatureRequestExpiresAt(now = new Date()) {
  return new Date(now.getTime() + SIGNATURE_REQUEST_TTL_MS);
}

function getSignatureAppBaseUrl(req) {
  const configured =
    normalizeString(process.env.GUSTO_MANAGER_PUBLIC_URL) ||
    normalizeString(process.env.GUSTO_MANAGER_URL);
  if (configured) return configured.replace(/\/+$/, "");

  if (process.env.NODE_ENV !== "production") {
    const origin = normalizeString(req?.get?.("origin"));
    if (/^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/i.test(origin)) {
      return origin.replace(/\/+$/, "");
    }
    return "http://localhost:8002";
  }

  return "https://gusto-manager.com";
}

function buildSignatureUrl(req, token) {
  return `${getSignatureAppBaseUrl(req)}/signature/${encodeURIComponent(token)}`;
}

function getRequestState(documentData, now = new Date()) {
  const request = documentData?.signatureRequest || {};
  if (request.status === "REVOKED") return "REVOKED";
  if (documentData?.status === "SIGNED") return "SIGNED";
  if (
    request.expiresAt &&
    new Date(request.expiresAt).getTime() <= now.getTime()
  ) {
    return "EXPIRED";
  }
  return request.status || "PENDING";
}

function serializePublicContract(documentData, now = new Date()) {
  const snapshot = plainValue(documentData?.contractSnapshot) || null;
  const state = getRequestState(documentData, now);
  const canReadDocument = ["PENDING", "SIGNING", "SIGNED"].includes(state);

  return {
    state,
    document:
      snapshot && canReadDocument
        ? {
            docNumber: snapshot.docNumber,
            contractKind: snapshot.contractKind,
            versionNumber: snapshot.versionNumber,
            issueDate: snapshot.issueDate,
            party: {
              restaurantName: snapshot.party?.restaurantName || "",
              address: snapshot.party?.address || "",
              ownerName: snapshot.party?.ownerName || "",
            },
            lines: snapshot.lines || [],
            website: snapshot.website || {},
            subscription: snapshot.subscription || {},
            engagementMonths: snapshot.engagementMonths || 0,
            modules: snapshot.modules || [],
            timeClockTerminalRental: snapshot.timeClockTerminalRental || {},
            comments: snapshot.comments || "",
            amendment: snapshot.amendment
              ? {
                  baseContractNumber:
                    snapshot.amendment.baseContractNumber || "",
                  baseContractSignedAt:
                    snapshot.amendment.baseContractSignedAt || null,
                }
              : null,
          }
        : null,
    expiresAt: documentData?.signatureRequest?.expiresAt || null,
    signedAt: documentData?.signature?.signedAt || null,
    signerName: documentData?.signature?.signerName || "",
    emailStatus: documentData?.signature?.emailStatus || "NOT_SENT",
  };
}

module.exports = {
  SIGNATURE_REQUEST_TTL_MS,
  buildContractContentSnapshot,
  buildSignatureProofSnapshot,
  buildSignatureUrl,
  createSignatureToken,
  decodeSignatureDataUrl,
  getRequestState,
  hashContractContent,
  hashSignatureImage,
  hashSignatureToken,
  serializePublicContract,
  signatureRequestExpiresAt,
};
