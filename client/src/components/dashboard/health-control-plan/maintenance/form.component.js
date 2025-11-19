// app/(components)/maintenance/MaintenanceForm.jsx
"use client";
import { useEffect, useMemo, useState, useRef } from "react";
import { useForm } from "react-hook-form";

// AXIOS
import axios from "axios";

// ICONS
import {
  Wrench,
  Hash,
  CalendarClock,
  FileText,
  Building2,
  History,
  Loader2,
  X as XIcon,
  XCircle,
  Check as CheckIcon,
  Camera,
  Upload,
  Trash2,
  Download,
  Link as LinkIcon,
} from "lucide-react";

/* ---------- Utils ---------- */
function toDatetimeLocal(value) {
  const d = value ? new Date(value) : new Date();
  if (Number.isNaN(d.getTime())) return "";
  const off = d.getTimezoneOffset() * 60000;
  return new Date(d.getTime() - off).toISOString().slice(0, 16);
}
function toDateValue(value) {
  if (!value) return "";
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? "" : d.toISOString().slice(0, 10);
}

function fmtFRDate(d) {
  try {
    return new Intl.DateTimeFormat("fr-FR", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    }).format(new Date(d));
  } catch {
    return "—";
  }
}
function displayUserName(user) {
  if (!user) return "—";
  const f = (user.firstName || "").trim();
  const l = (user.lastName || "").trim();
  const name = `${f} ${l}`.trim();
  return name || "—";
}

// Corrige les noms de fichiers moisis
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

/* ---------- NextDue helpers ---------- */
const FREQ_TO_DAYS = {
  daily: 1,
  weekly: 7,
  monthly: 30,
  on_demand: null,
};

function computeNextDueFromBase(baseDate, frequency) {
  const days = FREQ_TO_DAYS[frequency] || null;
  if (!days || !baseDate) return null;

  const base = new Date(baseDate);
  if (Number.isNaN(base.getTime())) return null;

  base.setDate(base.getDate() + days);
  return base;
}

function computeNextDueValue(rec) {
  if (!rec) return null;

  if (rec.nextDue) return rec.nextDue;

  const freq = rec.frequency || "monthly";
  const base = rec.lastDoneAt || rec.performedAt || rec.createdAt;
  return computeNextDueFromBase(base, freq);
}

/* ---------- Defaults ---------- */
function buildDefaults(rec) {
  const baseExec =
    rec?.lastDoneAt || rec?.performedAt || rec?.createdAt || new Date();

  const autoNext = computeNextDueValue({
    ...rec,
    performedAt: baseExec,
  });

  return {
    equipment: rec?.equipment ?? "",
    equipmentId: rec?.equipmentId ?? "",
    type: rec?.type ?? "inspection",
    frequency: rec?.frequency ?? "monthly",
    performedAt: toDatetimeLocal(baseExec),
    nextDue: toDateValue(autoNext),
    provider: rec?.provider ?? "",
    notes: rec?.notes ?? "",
    history: Array.isArray(rec?.history) ? rec.history : [],
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
export default function MaintenanceForm({
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

  const isEdit = !!initial?._id;

  const token = useMemo(
    () =>
      typeof window !== "undefined" ? localStorage.getItem("token") : null,
    []
  );

  const [noteEditIdx, setNoteEditIdx] = useState(null);
  const [noteDraft, setNoteDraft] = useState("");
  const [savingNote, setSavingNote] = useState(false);
  const [confirmIdx, setConfirmIdx] = useState(null);
  const [deletingIdx, setDeletingIdx] = useState(null);

  // Pièces jointes Cloudinary pour le PLAN de maintenance
  const [existingAttachments, setExistingAttachments] = useState(
    Array.isArray(initial?.attachments) ? initial.attachments : []
  );
  const [removedAttachmentIds, setRemovedAttachmentIds] = useState([]);
  const [newFiles, setNewFiles] = useState([]);

  const fileInputRef = useRef(null);
  const cameraInputRef = useRef(null);

  useEffect(() => {
    reset(buildDefaults(initial));
    setNoteEditIdx(null);
    setNoteDraft("");
    setConfirmIdx(null);
    setDeletingIdx(null);

    setExistingAttachments(
      Array.isArray(initial?.attachments) ? initial.attachments : []
    );
    setRemovedAttachmentIds([]);
    setNewFiles([]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initial]);

  const history = watch("history") || [];

  const historyWithIdxDesc = [...(history || [])]
    .map((h, idx) => ({ ...h, __idx: idx }))
    .reverse();

  const freqWatch = watch("frequency");
  const performedAtWatch = watch("performedAt");

  /* ---------- Auto-calcul de prochaine échéance ---------- */
  useEffect(() => {
    let baseDate;
    if (isEdit) {
      baseDate =
        initial?.lastDoneAt ||
        initial?.performedAt ||
        initial?.createdAt ||
        null;
    } else {
      baseDate = performedAtWatch || new Date();
    }

    const next = computeNextDueFromBase(baseDate, freqWatch);
    const nextStr = toDateValue(next);

    setValue("nextDue", nextStr, { shouldDirty: true });
  }, [freqWatch, performedAtWatch, isEdit, initial, setValue]);

  /* ---------- Helpers pièces jointes ---------- */
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
    return `${process.env.NEXT_PUBLIC_API_URL}/haccp/maintenance/${restaurantId}/documents/${encodedPublicId}/download`;
  };

  /* ---------- Actions helpers ---------- */
  const setNow = () =>
    setValue("performedAt", toDatetimeLocal(new Date()), {
      shouldDirty: true,
      shouldTouch: true,
    });

  const notesVal = watch("notes");

  /* ---------- Submit ---------- */
  const onSubmit = async (data) => {
    if (!token) return;

    const formData = new FormData();

    formData.append("equipment", data.equipment);
    if (data.equipmentId) formData.append("equipmentId", data.equipmentId);

    formData.append("type", data.type || "inspection");
    formData.append("frequency", data.frequency || "monthly");

    if (data.nextDue) {
      formData.append("nextDue", data.nextDue);
    } else {
      formData.append("nextDue", "");
    }

    if (data.provider) formData.append("provider", data.provider);
    if (data.notes) formData.append("notes", data.notes);

    if (!isEdit) {
      formData.append(
        "performedAt",
        data.performedAt ? data.performedAt : new Date().toISOString()
      );
    }

    // Pièces déjà existantes qu'on garde
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

    const url = isEdit
      ? `${process.env.NEXT_PUBLIC_API_URL}/restaurants/${restaurantId}/maintenance/${initial._id}`
      : `${process.env.NEXT_PUBLIC_API_URL}/restaurants/${restaurantId}/maintenance`;
    const method = isEdit ? "put" : "post";

    const { data: saved } = await axios[method](url, formData, {
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "multipart/form-data",
      },
    });

    window.dispatchEvent(
      new CustomEvent("maintenance:upsert", { detail: { doc: saved } })
    );

    reset(buildDefaults(null));
    setExistingAttachments([]);
    setRemovedAttachmentIds([]);
    setNewFiles([]);
    onSuccess?.(saved);
  };

  /* ---------- Note / historique ---------- */
  async function saveNoteForHistoryIndex(idx) {
    if (!initial?._id || !token) return;
    try {
      setSavingNote(true);
      const url = `${process.env.NEXT_PUBLIC_API_URL}/restaurants/${restaurantId}/maintenance/${initial._id}/history/${idx}/note`;
      const { data: saved } = await axios.put(
        url,
        { note: noteDraft },
        { headers: { Authorization: `Bearer ${token}` } }
      );

      setValue("history", saved?.history || [], { shouldDirty: false });
      window.dispatchEvent(
        new CustomEvent("maintenance:upsert", { detail: { doc: saved } })
      );

      setNoteEditIdx(null);
      setNoteDraft("");
      setConfirmIdx(null);
    } catch (e) {
      console.error("save note error:", e);
      alert("Impossible d'enregistrer la note.");
    } finally {
      setSavingNote(false);
    }
  }

  async function deleteHistoryAtIndex(idx) {
    if (!initial?._id || !token) return;
    try {
      setDeletingIdx(idx);
      const url = `${process.env.NEXT_PUBLIC_API_URL}/restaurants/${restaurantId}/maintenance/${initial._id}/history/${idx}`;
      const { data: saved } = await axios.delete(url, {
        headers: { Authorization: `Bearer ${token}` },
      });

      setValue("history", saved?.history || [], { shouldDirty: false });
      window.dispatchEvent(
        new CustomEvent("maintenance:upsert", { detail: { doc: saved } })
      );

      if (noteEditIdx === idx) {
        setNoteEditIdx(null);
        setNoteDraft("");
      }
      setConfirmIdx(null);
    } catch (e) {
      console.error("delete history error:", e);
      alert("Suppression impossible pour le moment.");
    } finally {
      setDeletingIdx(null);
    }
  }

  /* ---------- Render ---------- */
  return (
    <form
      onSubmit={handleSubmit(onSubmit)}
      className="relative flex flex-col gap-2"
    >
      {/* Ligne 1 : Équipement / ID interne */}
      <div className="grid grid-cols-1 gap-2 midTablet:grid-cols-2">
        <div className={fieldWrap}>
          <label className={labelCls}>
            <Wrench className="size-4" /> Équipement *
          </label>
          <input
            type="text"
            {...register("equipment", { required: "Requis" })}
            className={`${inputCls} ${
              errors.equipment ? "border-red focus:ring-red/20" : ""
            }`}
            placeholder='ex: "Friteuse 1"'
            autoComplete="off"
            spellCheck={false}
            autoCorrect="off"
          />
          {errors.equipment && (
            <p className="text-xs text-red mt-1">{errors.equipment.message}</p>
          )}
        </div>

        <div className={fieldWrap}>
          <label className={labelCls}>
            <Hash className="size-4" /> ID interne
          </label>
          <input
            type="text"
            {...register("equipmentId")}
            className={inputCls}
            placeholder="ex: EQ-001"
            autoComplete="off"
            spellCheck={false}
            autoCorrect="off"
          />
        </div>
      </div>

      {/* Ligne 2 : Type / Exécution / Fréquence / Prochaine échéance */}
      <div className="grid grid-cols-1 gap-2 midTablet:grid-cols-2">
        <div className={fieldWrap}>
          <label className={labelCls}>
            <Building2 className="size-4" /> Type
          </label>
          <select {...register("type")} className={selectCls}>
            <option value="filter_change">Changement filtre</option>
            <option value="inspection">Inspection</option>
            <option value="repair">Réparation</option>
            <option value="other">Autre</option>
          </select>
        </div>

        <div className={fieldWrap}>
          <label className={labelCls}>
            <CalendarClock className="size-4" />{" "}
            {isEdit ? "Dernière exécution" : "Première exécution"}
          </label>
          <div className="relative flex items-center gap-2">
            <input
              type="datetime-local"
              {...register("performedAt")}
              className={selectCls}
              disabled={isEdit}
            />
          </div>
          {errors.performedAt && (
            <p className="mt-1 text-xs text-red">
              {errors.performedAt.message}
            </p>
          )}
        </div>

        <div className={fieldWrap}>
          <label className={labelCls}>Fréquence</label>
          <select {...register("frequency")} className={selectCls}>
            <option value="daily">Quotidienne</option>
            <option value="weekly">Hebdomadaire</option>
            <option value="monthly">Mensuelle</option>
            <option value="on_demand">À la demande</option>
          </select>
        </div>

        <div className={fieldWrap}>
          <label className={labelCls}>
            <CalendarClock className="size-4" /> Prochaine échéance
          </label>
          <input type="date" {...register("nextDue")} className={selectCls} />
        </div>
      </div>

      {/* Ligne 3 : Prestataire */}
      <div className="grid grid-cols-1">
        <div className={`${fieldWrap} h-fit`}>
          <label className={labelCls}>Prestataire</label>
          <input
            type="text"
            {...register("provider")}
            className={inputCls}
            placeholder="ex: Acme Services"
            autoComplete="off"
            spellCheck={false}
            autoCorrect="off"
          />
        </div>
      </div>

      {/* Ligne 4 : Notes / Pièces jointes (comme HealthMeasures) */}
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
              placeholder="Observations, références des pièces, etc."
            />
            <span className="pointer-events-none absolute bottom-2 right-3 select-none text-[11px] text-darkBlue/40">
              {(notesVal?.length ?? 0).toString()}
            </span>
          </div>
        </div>

        {/* Pièces jointes (copié-collé du pattern HealthMeasures) */}
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

          {/* Liste des pièces (scrollable) */}
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
                Ajoutez un contrat PDF, un rapport d’intervention ou des photos
                de l’équipement pour documenter ce plan de maintenance.
              </p>
            )}
          </div>
        </div>
      </div>

      {/* Historique d’exécution */}
      {isEdit && (
        <div className={fieldWrap.replace("h-[80px]", "h-auto")}>
          <label className={labelCls}>
            <History className="size-4" /> Historique d’exécution
          </label>

          <div className="pt-2 pb-0 max-h-[400px] overflow-y-auto">
            {historyWithIdxDesc.length === 0 ? (
              <div className="rounded-lg border border-darkBlue/10 p-3 text-sm text-darkBlue/60 italic">
                Aucun historique pour le moment.
              </div>
            ) : (
              <ol className="relative ml-2 border-l border-darkBlue/15">
                {historyWithIdxDesc.map((h) => {
                  const idx = h.__idx;
                  const isEditingNote = noteEditIdx === idx;
                  const isConfirming = confirmIdx === idx;
                  const proofCount = Array.isArray(h?.proofUrls)
                    ? h.proofUrls.length
                    : 0;

                  return (
                    <li
                      key={`${idx}-${h?.doneAt || "na"}`}
                      className="mb-4 last:mb-0 pl-4"
                    >
                      <span className="absolute -left-[9px] mt-1 inline-flex h-4 w-4 items-center justify-center rounded-full bg-blue/90 ring-4 ring-white">
                        <span className="h-1.5 w-1.5 rounded-full bg-white" />
                      </span>

                      <div className="rounded-xl border border-darkBlue/10 bg-white shadow-sm">
                        <div className="flex flex-col gap-3 p-3 mobile:flex-row mobile:items-center mobile:justify-between">
                          <div className="leading-tight">
                            <div className="text-[13px] text-darkBlue/60">
                              Fait le
                            </div>
                            <div className="text-sm font-medium">
                              {fmtFRDate(h?.doneAt)}
                            </div>
                            <div className="mt-1 text-xs text-darkBlue/70">
                              par {displayUserName(h?.doneBy)}
                            </div>
                          </div>

                          <div className="flex flex-wrap items-center gap-2">
                            {proofCount > 0 && (
                              <span className="rounded-full bg-darkBlue/5 px-2 py-[2px] text-xs text-darkBlue/80">
                                {proofCount} preuve
                                {proofCount > 1 ? "s" : ""}
                              </span>
                            )}

                            {h?.verified && (
                              <span className="rounded-full bg-green px-2 py-[2px] text-xs font-medium text-white">
                                Vérifié
                              </span>
                            )}

                            {!isConfirming ? (
                              <button
                                type="button"
                                onClick={() => {
                                  setConfirmIdx(idx);
                                }}
                                className="inline-flex items-center justify-center rounded-md p-1 text-red hover:bg-red/10"
                                title="Supprimer cette exécution"
                                aria-label="Supprimer cette exécution"
                                disabled={deletingIdx === idx}
                              >
                                <XCircle className="size-4" />
                              </button>
                            ) : (
                              <button
                                type="button"
                                onClick={() => deleteHistoryAtIndex(idx)}
                                className="inline-flex items-center justify-center rounded-md border border-red bg-white px-2 py-[2px] text-xs font-medium text-red hover:bg-red/10 disabled:opacity-60"
                                title="Confirmer la suppression"
                                disabled={deletingIdx === idx}
                              >
                                {deletingIdx === idx ? (
                                  <>
                                    <Loader2 className="mr-1 size-3.5 animate-spin" />
                                    Suppression…
                                  </>
                                ) : (
                                  "Confirmer"
                                )}
                              </button>
                            )}
                          </div>
                        </div>

                        <div className="border-t border-darkBlue/10 p-3">
                          {!isEditingNote ? (
                            <div className="flex items-start gap-3">
                              <div className="flex-1 text-sm text-darkBlue/90">
                                <span className="mr-1 font-medium">Note :</span>
                                {h?.note ? (
                                  <span>{h.note}</span>
                                ) : (
                                  <span className="italic text-darkBlue/60">
                                    —
                                  </span>
                                )}
                              </div>
                              <button
                                type="button"
                                onClick={() => {
                                  setNoteEditIdx(idx);
                                  setNoteDraft(h?.note || "");
                                  setConfirmIdx(null);
                                }}
                                className="text-xs text-blue underline underline-offset-2"
                                title={
                                  h?.note
                                    ? "Éditer la note"
                                    : "Ajouter une note"
                                }
                              >
                                {h?.note
                                  ? "Éditer la note"
                                  : "Ajouter une note"}
                              </button>
                            </div>
                          ) : (
                            <div className="flex gap-2">
                              <textarea
                                rows={1}
                                value={noteDraft}
                                onChange={(e) => setNoteDraft(e.target.value)}
                                className="w-full resize-none rounded-md border border-darkBlue/20 p-2 text-[14px] outline-none"
                                placeholder="Saisir une note …"
                              />
                              <div className="flex items-center justify-end gap-2">
                                <button
                                  type="button"
                                  onClick={() => {
                                    setNoteEditIdx(null);
                                    setNoteDraft("");
                                  }}
                                  className={`${btnBase} border border-red bg-white text-red`}
                                  disabled={savingNote}
                                >
                                  <XIcon className="size-4" /> Annuler
                                </button>
                                <button
                                  type="button"
                                  onClick={() => saveNoteForHistoryIndex(idx)}
                                  className={`${btnBase} bg-blue text-white disabled:opacity-60`}
                                  disabled={savingNote}
                                >
                                  {savingNote ? (
                                    <div className="flex items-center gap-2">
                                      <Loader2 className="size-4 animate-spin" />
                                      <span>Enregistrement…</span>
                                    </div>
                                  ) : (
                                    <>
                                      <CheckIcon className="size-4" />
                                      Enregistrer
                                    </>
                                  )}
                                </button>
                              </div>
                            </div>
                          )}
                        </div>
                      </div>
                    </li>
                  );
                })}
              </ol>
            )}
          </div>
        </div>
      )}

      {/* Actions */}
      <div className="flex flex-col gap-2 mt-3 mobile:flex-row">
        <button
          type="submit"
          disabled={isSubmitting}
          aria-disabled={isSubmitting}
          className="text-nowrap inline-flex items-center justify-center gap-2 h-[38px] rounded-lg bg-blue px-4 py-2 text-sm font-medium text-white shadow disabled:opacity-60"
        >
          {isSubmitting ? (
            <div className="flex items-center gap-2">
              <Loader2 className="size-4 animate-spin" />
              <span>Enregistrement…</span>
            </div>
          ) : isEdit ? (
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

        {isEdit && (
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
