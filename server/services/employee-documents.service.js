const { randomUUID } = require("crypto");
const path = require("path");

const EMPLOYEE_DOCUMENT_MAX_FILE_SIZE = 10 * 1024 * 1024;
const EMPLOYEE_DOCUMENT_MAX_FILES = 10;
const EMPLOYEE_DOCUMENT_MAX_TITLE_LENGTH = 30;
const EMPLOYEE_DOCUMENT_DOWNLOAD_URL_TTL_SECONDS = 60;

const DOCUMENT_FORMATS = [
  {
    extensions: [".pdf"],
    mimeTypes: ["application/pdf"],
    contentType: "application/pdf",
    matches(buffer) {
      return buffer.subarray(0, 5).toString("ascii") === "%PDF-";
    },
  },
  {
    extensions: [".jpg", ".jpeg"],
    mimeTypes: ["image/jpeg"],
    contentType: "image/jpeg",
    matches(buffer) {
      return (
        buffer.length >= 3 &&
        buffer[0] === 0xff &&
        buffer[1] === 0xd8 &&
        buffer[2] === 0xff
      );
    },
  },
  {
    extensions: [".png"],
    mimeTypes: ["image/png"],
    contentType: "image/png",
    matches(buffer) {
      const signature = Buffer.from([
        0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
      ]);
      return (
        buffer.length >= signature.length &&
        buffer.subarray(0, 8).equals(signature)
      );
    },
  },
  {
    extensions: [".webp"],
    mimeTypes: ["image/webp"],
    contentType: "image/webp",
    matches(buffer) {
      return (
        buffer.length >= 12 &&
        buffer.subarray(0, 4).toString("ascii") === "RIFF" &&
        buffer.subarray(8, 12).toString("ascii") === "WEBP"
      );
    },
  },
  {
    extensions: [".gif"],
    mimeTypes: ["image/gif"],
    contentType: "image/gif",
    matches(buffer) {
      const signature = buffer.subarray(0, 6).toString("ascii");
      return signature === "GIF87a" || signature === "GIF89a";
    },
  },
];

class EmployeeDocumentValidationError extends Error {
  constructor(message) {
    super(message);
    this.name = "EmployeeDocumentValidationError";
    this.status = 400;
  }
}

function toPlainDocument(document) {
  if (!document) return {};
  if (typeof document.toObject === "function") {
    return document.toObject({ transform: false });
  }
  return { ...document };
}

function normalizeOriginalFilename(value) {
  const raw = String(value || "");
  const filename = raw.replace(/\\/g, "/").split("/").pop().trim();

  if (!filename || Buffer.byteLength(filename, "utf8") > 255) {
    throw new EmployeeDocumentValidationError("Invalid document filename");
  }

  if (
    [...filename].some((character) => {
      const codePoint = character.codePointAt(0);
      return codePoint <= 0x1f || codePoint === 0x7f;
    })
  ) {
    throw new EmployeeDocumentValidationError("Invalid document filename");
  }

  return filename;
}

function findDocumentFormatByExtension(filename) {
  const extension = path.extname(filename).toLowerCase();
  const format = DOCUMENT_FORMATS.find((candidate) =>
    candidate.extensions.includes(extension),
  );

  return format ? { extension, format } : null;
}

function validateEmployeeDocumentFile(file) {
  if (
    !file?.buffer ||
    !Buffer.isBuffer(file.buffer) ||
    file.buffer.length === 0
  ) {
    throw new EmployeeDocumentValidationError("Document file is empty");
  }

  const actualSize = file.buffer.length;
  const declaredSize = Number(file.size || actualSize);
  if (
    actualSize > EMPLOYEE_DOCUMENT_MAX_FILE_SIZE ||
    declaredSize > EMPLOYEE_DOCUMENT_MAX_FILE_SIZE
  ) {
    throw new EmployeeDocumentValidationError("Document file is too large");
  }

  const filename = normalizeOriginalFilename(file.originalname);
  const resolvedFormat = findDocumentFormatByExtension(filename);
  if (!resolvedFormat) {
    throw new EmployeeDocumentValidationError("Document format is not allowed");
  }

  const declaredMimeType = String(file.mimetype || "")
    .split(";")[0]
    .trim()
    .toLowerCase();

  if (!resolvedFormat.format.mimeTypes.includes(declaredMimeType)) {
    throw new EmployeeDocumentValidationError(
      "Document MIME type does not match its extension",
    );
  }

  if (!resolvedFormat.format.matches(file.buffer)) {
    throw new EmployeeDocumentValidationError(
      "Document content does not match its declared format",
    );
  }

  return {
    file,
    filename,
    extension: resolvedFormat.extension,
    format: resolvedFormat.extension.slice(1),
    mimeType: resolvedFormat.format.contentType,
    size: actualSize,
  };
}

function normalizeDocumentTitles(value, expectedCount) {
  const titles =
    value === undefined ? [] : Array.isArray(value) ? value : [value];

  if (titles.length !== expectedCount) {
    throw new EmployeeDocumentValidationError(
      "A title is required for each document",
    );
  }

  return titles.map((value) => {
    const title = String(value || "").trim();
    if (!title || title.length > EMPLOYEE_DOCUMENT_MAX_TITLE_LENGTH) {
      throw new EmployeeDocumentValidationError(
        `Document titles must contain between 1 and ${EMPLOYEE_DOCUMENT_MAX_TITLE_LENGTH} characters`,
      );
    }
    return title;
  });
}

function validateEmployeeDocumentUpload(files, titleInput) {
  const inputFiles = Array.isArray(files) ? files : [];
  if (!inputFiles.length) {
    throw new EmployeeDocumentValidationError(
      "At least one document is required",
    );
  }
  if (inputFiles.length > EMPLOYEE_DOCUMENT_MAX_FILES) {
    throw new EmployeeDocumentValidationError("Too many documents");
  }

  const titles = normalizeDocumentTitles(titleInput, inputFiles.length);
  return inputFiles.map((file, index) => ({
    ...validateEmployeeDocumentFile(file),
    title: titles[index],
  }));
}

function createEmployeeDocumentPublicId(extension) {
  return `${randomUUID()}${extension}`;
}

function getDocumentDeliveryType(document) {
  if (document?.delivery_type !== "authenticated") {
    throw new Error("Private document storage metadata is incomplete");
  }
  return "authenticated";
}

function getDocumentResourceType(document) {
  return document?.resource_type || "raw";
}

function getDocumentFormat(document) {
  const plain = toPlainDocument(document);
  const storedFormat = String(plain.format || "")
    .trim()
    .toLowerCase();
  if (storedFormat) return storedFormat;

  const filename = String(plain.filename || plain.public_id || "");
  return path.extname(filename).slice(1).toLowerCase();
}

function buildEmployeeDocumentDownloadUrl(document, cloudinaryClient) {
  const plain = toPlainDocument(document);
  const format = getDocumentFormat(plain);
  if (!format || !plain.public_id) {
    throw new Error("Private document storage metadata is incomplete");
  }
  getDocumentDeliveryType(plain);

  return cloudinaryClient.utils.private_download_url(plain.public_id, format, {
    resource_type: getDocumentResourceType(plain),
    type: "authenticated",
    expires_at:
      Math.floor(Date.now() / 1000) +
      EMPLOYEE_DOCUMENT_DOWNLOAD_URL_TTL_SECONDS,
    attachment: false,
  });
}

function serializeEmployeeDocument(document) {
  const plain = toPlainDocument(document);
  return {
    public_id: plain.public_id,
    filename: plain.filename,
    title: plain.title,
    ...(plain.mimeType ? { mimeType: plain.mimeType } : {}),
    ...(Number.isFinite(Number(plain.size)) && Number(plain.size) >= 0
      ? { size: Number(plain.size) }
      : {}),
    ...(plain.uploadedAt ? { uploadedAt: plain.uploadedAt } : {}),
  };
}

function serializeEmployeeDocuments(documents) {
  return (Array.isArray(documents) ? documents : [])
    .filter(Boolean)
    .map(serializeEmployeeDocument);
}

function getDocumentContentType(document) {
  const plain = toPlainDocument(document);
  const storedMimeType = String(plain.mimeType || "").toLowerCase();
  const filename = String(plain.filename || plain.public_id || "");
  const resolvedFormat = findDocumentFormatByExtension(filename);

  if (
    resolvedFormat &&
    (!storedMimeType ||
      resolvedFormat.format.mimeTypes.includes(storedMimeType))
  ) {
    return resolvedFormat.format.contentType;
  }

  return "application/octet-stream";
}

function getDocumentContentDisposition(filename) {
  const safeFilename =
    normalizeOriginalFilename(filename || "document")
      .normalize("NFKD")
      .replace(/[^\x20-\x7e]/g, "")
      .replace(/["\\;]/g, "_")
      .trim() || "document";
  const encodedFilename = encodeURIComponent(
    normalizeOriginalFilename(filename || "document"),
  ).replace(
    /[!'()*]/g,
    (character) => `%${character.charCodeAt(0).toString(16).toUpperCase()}`,
  );

  return `attachment; filename="${safeFilename}"; filename*=UTF-8''${encodedFilename}`;
}

function setPrivateDocumentResponseHeaders(response) {
  response.setHeader("Cache-Control", "private, no-store, max-age=0");
  response.setHeader("Pragma", "no-cache");
  response.setHeader("Expires", "0");
  response.setHeader("X-Content-Type-Options", "nosniff");
}

module.exports = {
  DOCUMENT_FORMATS,
  EMPLOYEE_DOCUMENT_DOWNLOAD_URL_TTL_SECONDS,
  EMPLOYEE_DOCUMENT_MAX_FILES,
  EMPLOYEE_DOCUMENT_MAX_FILE_SIZE,
  EmployeeDocumentValidationError,
  buildEmployeeDocumentDownloadUrl,
  createEmployeeDocumentPublicId,
  getDocumentContentDisposition,
  getDocumentContentType,
  getDocumentDeliveryType,
  getDocumentResourceType,
  serializeEmployeeDocument,
  serializeEmployeeDocuments,
  setPrivateDocumentResponseHeaders,
  validateEmployeeDocumentFile,
  validateEmployeeDocumentUpload,
};
