"use client";
import { useEffect, useMemo, useState, useRef } from "react";
import { useForm } from "react-hook-form";

// AXIOS
import axios from "axios";

// ICONS
import {
  CalendarClock,
  FileText,
  Link as LinkIcon,
  ChevronDown,
  Loader2,
  Camera,
  Upload,
  Trash2,
  Download,
  XCircle,
} from "lucide-react";

/* ---------- Utils ---------- */
function toDatetimeLocal(value) {
  const d = value ? new Date(value) : new Date();
  if (Number.isNaN(d.getTime())) return "";
  const off = d.getTimezoneOffset() * 60000;
  return new Date(d.getTime() - off).toISOString().slice(0, 16);
}

// Essaye de corriger le mojibake type "dâeÌcran" -> "d’écran"
function normalizeFilename(name) {
  if (!name) return "";
  try {
    if (typeof TextDecoder === "undefined") return name;
    const bytes = Uint8Array.from([...name].map((ch) => ch.charCodeAt(0)));
    const decoded = new TextDecoder("utf-8", { fatal: false }).decode(bytes);
    return decoded;
  } catch {
    return name;
  }
}

function truncate(text, max = 26) {
  if (!text) return "";
  return text.length > max ? `${text.slice(0, max - 3)}…` : text;
}

function mimeBadgeLabel(mimeOrName) {
  if (!mimeOrName) return "FILE";
  const lower = String(mimeOrName).toLowerCase();

  if (lower.includes("pdf")) return "PDF";
  if (lower.startsWith("image/")) {
    const sub = lower.split("/")[1] || "img";
    if (sub === "jpeg") return "JPG";
    return sub.slice(0, 4).toUpperCase();
  }
  if (lower.includes("word")) return "DOC";
  if (lower.includes("excel") || lower.includes("sheet")) return "XLS";
  if (lower.includes("zip")) return "ZIP";
  return lower.split("/")[1]?.slice(0, 4).toUpperCase() || "FILE";
}

/* ---------- Defaults ---------- */
function buildDefaults(rec) {
  return {
    type: rec?.type ?? "hygiene_check",
    performedAt: toDatetimeLocal(rec?.performedAt ?? new Date()),
    notes: rec?.notes ?? "",
  };
}

/* ---------- Styles alignés ---------- */
const fieldWrap =
  "group relative rounded-xl bg-white/50 px-3 py-2 h-[80px] transition-shadow";
const labelCls =
  "flex items-center gap-2 text-xs font-medium text-darkBlue/60 mb-1";
const inputCls =
  "h-11 w-full rounded-lg border border-darkBlue/20 bg-white px-3 text-[15px] outline-none transition placeholder:text-darkBlue/40";
const selectCls =
  "h-11 w-full appearance-none rounded-lg border border-darkBlue/20 bg-white px-3 text-[15px] outline-none transition";
const textareaCls =
  "w-full resize-none rounded-lg border border-darkBlue/20 bg-white p-[10px] text-[15px] outline-none transition placeholder:text-darkBlue/40";
const btnBase =
  "inline-flex items-center justify-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition active:scale-[0.98]";

/* ---------- Component ---------- */
export default function HealthMeasuresForm({
  restaurantId,
  initial = null,
  onSuccess,
  onCancel,
}) {
  const {
    register,
    handleSubmit,
    reset,
    setValue,
    watch,
    formState: { errors, isSubmitting },
  } = useForm({ defaultValues: buildDefaults(initial) });

  const [existingAttachments, setExistingAttachments] = useState(
    Array.isArray(initial?.attachments) ? initial.attachments : []
  );
  const [removedAttachmentIds, setRemovedAttachmentIds] = useState([]);
  const [newFiles, setNewFiles] = useState([]);

  const fileInputRef = useRef(null);
  const cameraInputRef = useRef(null);

  const token = useMemo(
    () =>
      typeof window !== "undefined" ? localStorage.getItem("token") : null,
    []
  );

  useEffect(() => {
    reset(buildDefaults(initial));
    setExistingAttachments(
      Array.isArray(initial?.attachments) ? initial.attachments : []
    );
    setRemovedAttachmentIds([]);
    setNewFiles([]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initial]);

  const onSubmit = async (data) => {
    if (!token) return;

    const formData = new FormData();

    formData.append("type", data.type || "hygiene_check");
    formData.append("performedAt", data.performedAt || "");

    if (data.notes) formData.append("notes", data.notes);

    // Pièces déjà existantes qu'on garde (public_id non marqué pour suppression)
    existingAttachments.forEach((att) => {
      if (
        att.public_id &&
        !removedAttachmentIds.includes(String(att.public_id))
      ) {
        formData.append("keepAttachments", att.public_id);
      }
    });

    // Nouveaux fichiers à uploader
    newFiles.forEach((file) => {
      formData.append("attachments", file);
    });

    const url = initial?._id
      ? `${process.env.NEXT_PUBLIC_API_URL}/restaurants/${restaurantId}/health-measures/${initial._id}`
      : `${process.env.NEXT_PUBLIC_API_URL}/restaurants/${restaurantId}/health-measures`;
    const method = initial?._id ? "put" : "post";

    const { data: saved } = await axios[method](url, formData, {
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "multipart/form-data",
      },
    });

    // live upsert (événement déjà utilisé dans la liste)
    window.dispatchEvent(
      new CustomEvent("health-mesures:upsert", { detail: { doc: saved } })
    );

    reset(buildDefaults(null));
    setExistingAttachments([]);
    setRemovedAttachmentIds([]);
    setNewFiles([]);
    onSuccess?.(saved);
  };

  // Helpers
  const setNow = () =>
    setValue("performedAt", toDatetimeLocal(new Date()), {
      shouldDirty: true,
      shouldTouch: true,
    });

  const notesVal = watch("notes");

  const handleFilesSelected = (event) => {
    const files = Array.from(event.target.files || []);
    if (!files.length) return;
    setNewFiles((prev) => [...prev, ...files]);
    event.target.value = "";
  };

  const removeNewFile = (index) => {
    setNewFiles((prev) => prev.filter((_, i) => i !== index));
  };

  const toggleExistingAttachmentRemoval = (public_id) => {
    setRemovedAttachmentIds((prev) => {
      const id = String(public_id);
      return prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id];
    });
  };

  const downloadUrlForAttachment = (att) => {
    if (!att?.public_id) return att?.url || "#";
    const encodedPublicId = encodeURIComponent(att.public_id);
    return `${process.env.NEXT_PUBLIC_API_URL}/haccp/health-measures/${restaurantId}/documents/${encodedPublicId}/download`;
  };

  /* ---------- Render ---------- */
  return (
    <form
      onSubmit={handleSubmit(onSubmit)}
      className="relative flex flex-col gap-2"
    >
      {/* Ligne 1 : Type / Effectué le */}
      <div className="grid grid-cols-1 gap-2 midTablet:grid-cols-2">
        <div className={fieldWrap}>
          <label className={labelCls}>Type</label>
          <div className="relative">
            <select {...register("type")} className={selectCls}>
              <option value="hygiene_check">Contrôle hygiène</option>
              <option value="covid_check">Contrôle COVID</option>
              <option value="other">Autre</option>
            </select>
            <ChevronDown className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 size-4 text-darkBlue/40" />
          </div>
        </div>

        <div className={fieldWrap}>
          <label className={labelCls}>
            <CalendarClock className="size-4" /> Effectué le
          </label>
          <div className="relative flex items-center gap-2">
            <input
              type="datetime-local"
              {...register("performedAt")}
              className={selectCls}
            />
            <button
              type="button"
              onClick={setNow}
              className="ml-1 text-xs text-blue underline"
            >
              Maintenant
            </button>
          </div>
          {errors.performedAt && (
            <p className="mt-1 text-xs text-red">
              {errors.performedAt.message}
            </p>
          )}
        </div>
      </div>

      {/* Notes / Pièces JOINTES côte à côte */}
      <div className="grid grid-cols-1 gap-2 midTablet:grid-cols-2">
        {/* Notes */}
        <div className={fieldWrap.replace("h-[80px]", "h-auto")}>
          <label className={labelCls}>
            <FileText className="size-4" /> Notes
          </label>
          <div className="relative">
            <textarea
              rows={7}
              {...register("notes")}
              className={textareaCls}
              placeholder="Observations, rappels, non-conformités constatées…"
            />
            <span className="pointer-events-none absolute bottom-2 right-3 select-none text-[11px] text-darkBlue/40">
              {(notesVal?.length ?? 0).toString()}
            </span>
          </div>
        </div>

        {/* Pièces jointes */}
        <div className={fieldWrap.replace("h-[80px]", "h-auto")}>
          <label className={labelCls}>
            <LinkIcon className="size-4" /> Pièces jointes (PDF, photos)
          </label>

          {/* Boutons d'action */}
          <div className="flex flex-wrap gap-2 mb-3">
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className={`${btnBase} border border-darkBlue/15 bg-white text-darkBlue/80 hover:border-darkBlue/40 hover:bg-darkBlue/[0.03]`}
            >
              <Upload className="size-4" />
              Importer un fichier
            </button>
            <button
              type="button"
              onClick={() => cameraInputRef.current?.click()}
              className={`${btnBase} border border-blue/40 bg-blue/5 text-blue hover:border-blue/70 hover:bg-blue/10`}
            >
              <Camera className="size-4" />
              Prendre une photo
            </button>
          </div>

          {/* Inputs file cachés */}
          <input
            ref={fileInputRef}
            type="file"
            multiple
            accept="image/*,application/pdf"
            className="hidden"
            onChange={handleFilesSelected}
          />
          <input
            ref={cameraInputRef}
            type="file"
            accept="image/*"
            capture="environment"
            className="hidden"
            onChange={handleFilesSelected}
          />

          {/* Liste des pièces dans un bloc scrollable */}
          <div className="space-y-2 max-h-[135px] overflow-y-scroll">
            {/* Fichiers à ajouter */}
            {newFiles.length > 0 && (
              <div className="rounded-lg bg-blue/5 px-2 py-2">
                <p className="mb-1 text-[11px] uppercase tracking-wide text-blue/80">
                  Fichiers à ajouter
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {newFiles.map((file, idx) => {
                    const prettyName = normalizeFilename(file.name);
                    const label = mimeBadgeLabel(file.type || file.name);
                    return (
                      <div
                        key={`${file.name}-${idx}`}
                        className="inline-flex items-center gap-1 rounded-full bg-white px-2 py-1 text-[11px] text-blue-950 shadow-sm border border-blue/20"
                      >
                        <span className="flex h-6 w-8 items-center justify-center rounded-md bg-blue/5 text-[10px] font-semibold text-blue">
                          {label}
                        </span>
                        <span title={prettyName}>
                          {truncate(prettyName, 25)}
                        </span>
                        <button
                          type="button"
                          onClick={() => removeNewFile(idx)}
                          className="ml-1 inline-flex items-center justify-center rounded-full bg-red/10 p-[3px] text-red hover:bg-red/20"
                          title="Retirer"
                        >
                          <Trash2 className="size-3" />
                        </button>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Pièces existantes (Cloudinary) */}
            {existingAttachments.length > 0 && (
              <div className="rounded-lg bg-darkBlue/[0.03] px-2 py-2">
                <p className="mb-1 text-[11px] uppercase tracking-wide text-darkBlue/50">
                  Pièces déjà enregistrées
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {existingAttachments.map((att) => {
                    const prettyName = normalizeFilename(att.filename);
                    const label = mimeBadgeLabel(att.mimetype || att.filename);
                    const isMarked = removedAttachmentIds.includes(
                      String(att.public_id)
                    );

                    return (
                      <div
                        key={att.public_id}
                        className={`inline-flex items-center gap-1 rounded-full px-2 py-1 text-[11px] shadow-sm border ${
                          isMarked
                            ? "bg-red/5 border-red/40 text-red/70 opacity-70"
                            : "bg-white border-darkBlue/10 text-darkBlue/80"
                        }`}
                      >
                        <span
                          className={`flex h-6 w-8 items-center justify-center rounded-md text-[10px] font-semibold ${
                            isMarked
                              ? "bg-red/10 text-red"
                              : "bg-darkBlue/5 text-darkBlue/70"
                          }`}
                        >
                          {label}
                        </span>

                        <a
                          href={
                            isMarked ? undefined : downloadUrlForAttachment(att)
                          }
                          target={isMarked ? undefined : "_blank"}
                          rel={isMarked ? undefined : "noreferrer"}
                          className={`flex items-center gap-1 ${
                            isMarked
                              ? "cursor-not-allowed line-through text-red/70"
                              : "hover:underline"
                          }`}
                          title={
                            isMarked ? "Marquée pour suppression" : prettyName
                          }
                        >
                          <Download className="size-3" />
                          <span>{truncate(prettyName, 25)}</span>
                        </a>

                        <button
                          type="button"
                          onClick={() =>
                            toggleExistingAttachmentRemoval(att.public_id)
                          }
                          className={`ml-1 inline-flex items-center justify-center rounded-full p-[3px] ${
                            isMarked
                              ? "bg-red text-white hover:bg-red/80"
                              : "bg-red/10 text-red hover:bg-red/20"
                          }`}
                          title={
                            isMarked
                              ? "Annuler la suppression"
                              : "Marquer pour suppression"
                          }
                        >
                          <Trash2 className="size-3" />
                        </button>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Hint si aucun doc */}
            {existingAttachments.length === 0 && newFiles.length === 0 && (
              <p className="text-[11px] text-darkBlue/40">
                Ajoutez une attestation PDF, un rapport de contrôle ou des
                photos prises sur place pour justifier cette mesure.
              </p>
            )}
          </div>
        </div>
      </div>

      {/* Actions */}
      <div className="flex flex-col items-center gap-2 mt-3 mobile:flex-row">
        <button
          type="submit"
          disabled={isSubmitting}
          className="text-nowrap inline-flex items-center justify-center gap-2 h-[38px] rounded-lg bg-blue px-4 py-2 text-sm font-medium text-white shadow disabled:opacity-60"
        >
          {isSubmitting ? (
            <div className="flex items-center gap-2">
              <Loader2 className="size-4 animate-spin" />
              <span>Enregistrement…</span>
            </div>
          ) : initial?._id ? (
            <>
              <FileText className="size-4" />
              Mettre à jour
            </>
          ) : (
            <>
              <FileText className="size-4" />
              Enregistrer
            </>
          )}
        </button>

        {initial?._id && (
          <button
            type="button"
            onClick={() => {
              reset(buildDefaults(null));
              setExistingAttachments([]);
              setRemovedAttachmentIds([]);
              setNewFiles([]);
              onCancel?.();
            }}
            className="inline-flex h-[38px] items-center justify-center gap-2 rounded-lg border border-red bg-white px-4 py-2 text-sm font-medium text-red"
          >
            <XCircle className="size-4" />
            Annuler
          </button>
        )}
      </div>
    </form>
  );
}
