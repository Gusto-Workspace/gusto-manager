import { FileImage, FileText } from "lucide-react";

import { DeleteSvg, DownloadSvg } from "@/components/_shared/_svgs/_index";

function getDocumentType(document) {
  const mimeType = String(document?.mimeType || "").toLowerCase();
  const knownTypes = {
    "application/pdf": "PDF",
    "image/jpeg": "JPG",
    "image/png": "PNG",
    "image/webp": "WEBP",
    "image/gif": "GIF",
  };

  if (knownTypes[mimeType]) return knownTypes[mimeType];

  const extension = String(document?.filename || "")
    .split(".")
    .pop()
    ?.trim()
    .toUpperCase();

  return extension && /^[A-Z0-9]{1,10}$/.test(extension) ? extension : "";
}

function formatFileSize(value, locale) {
  const bytes = Number(value);
  if (!Number.isFinite(bytes) || bytes < 0) return "";

  const formatter = new Intl.NumberFormat(locale, {
    maximumFractionDigits: 1,
  });

  if (bytes < 1024)
    return `${formatter.format(bytes)} octet${bytes > 1 ? "s" : ""}`;
  if (bytes < 1024 * 1024) return `${formatter.format(bytes / 1024)} Ko`;
  return `${formatter.format(bytes / (1024 * 1024))} Mo`;
}

function formatUploadDate(value, locale, labels) {
  if (!value) return "";

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";

  const day = new Intl.DateTimeFormat(locale, {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(date);
  const time = new Intl.DateTimeFormat(locale, {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  })
    .format(date)
    .replace(":", "h");

  return `${labels.uploadedOn} ${day} ${labels.at} ${time}`;
}

function MetadataSeparator() {
  return <span className="text-darkBlue/25">•</span>;
}

export default function EmployeeDocumentRow({
  document,
  locale = "fr-FR",
  labels,
  showUploader = false,
  onDownload,
  onDelete,
  isDeleting = false,
}) {
  const type = getDocumentType(document);
  const size = formatFileSize(document?.size, locale);
  const uploadDate = formatUploadDate(document?.uploadedAt, locale, labels);
  const uploaderName = String(document?.uploadedBy?.name || "").trim();
  const IsImage = String(document?.mimeType || "").startsWith("image/");
  const DocumentIcon = IsImage ? FileImage : FileText;
  const title = String(document?.title || "").trim() || labels.document;
  const metadata = [
    uploadDate,
    showUploader && uploaderName ? `${labels.by} ${uploaderName}` : "",
    type,
    size,
  ].filter(Boolean);

  return (
    <li className="flex items-center gap-3 rounded-xl border border-darkBlue/10 bg-white/80 px-3 py-3 shadow-sm transition-colors hover:border-darkBlue/20 mobile:px-4">
      <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-blue/10 text-blue">
        <DocumentIcon className="size-5" aria-hidden="true" />
      </span>

      <div className="min-w-0 flex-1">
        <p className="break-words text-sm font-semibold leading-5 text-darkBlue mobile:text-base">
          {title}
        </p>
        {metadata.length > 0 && (
          <p className="mt-1 flex flex-wrap items-center gap-x-1.5 text-xs leading-5 text-darkBlue/55">
            {metadata.map((item, index) => (
              <span key={`${item}-${index}`} className="contents">
                {index > 0 && <MetadataSeparator />}
                <span>{item}</span>
              </span>
            ))}
          </p>
        )}
      </div>

      <div className="flex shrink-0 items-center justify-end gap-2">
        <button
          type="button"
          onClick={() => onDownload(document)}
          className="inline-flex size-10 items-center justify-center rounded-full bg-[#4ead7a] shadow-sm transition-colors hover:bg-[#43996c]"
          aria-label={`${labels.download} ${title}`}
          title={labels.download}
        >
          <DownloadSvg width={16} height={16} fillColor="white" />
        </button>

        {onDelete && (
          <button
            type="button"
            onClick={() => onDelete(document)}
            disabled={isDeleting}
            className="inline-flex size-10 items-center justify-center rounded-full bg-[#FF766422] transition-colors hover:bg-[#FF766438] disabled:opacity-40"
            aria-label={`${labels.delete} ${title}`}
            title={labels.delete}
          >
            <DeleteSvg width={16} height={16} fillColor="#c94f40" />
          </button>
        )}
      </div>
    </li>
  );
}
