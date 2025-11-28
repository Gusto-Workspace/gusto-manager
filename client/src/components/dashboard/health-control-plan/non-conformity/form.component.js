"use client";
import {
  useContext,
  useEffect,
  useMemo,
  useState,
  useRef,
  useCallback,
} from "react";
import { useForm, useFieldArray } from "react-hook-form";
import axios from "axios";
import { GlobalContext } from "@/contexts/global.context";
import {
  PlusCircle,
  Trash2,
  ChevronDown,
  FileText,
  Link as LinkIcon,
  Camera,
  Upload,
  Download,
  XCircle,
  Loader2,
} from "lucide-react";

/* ---------- Utils ---------- */
function toDatetimeLocal(value) {
  if (!value) return "";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "";
  const offset = d.getTimezoneOffset() * 60000;
  return new Date(d.getTime() - offset).toISOString().slice(0, 16);
}
const nowLocal = () => toDatetimeLocal(new Date());
const normalize = (s) =>
  (s || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .toLowerCase()
    .trim();

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

function buildDefaults(rec) {
  return {
    type: rec?.type ?? "other",
    referenceId: rec?.referenceId ?? "",
    description: rec?.description ?? "",
    severity: rec?.severity ?? "medium",
    reportedAt: toDatetimeLocal(rec?.reportedAt ?? new Date()),
    status: rec?.status ?? "open",
    // Champ conservé pour compat, mais plus utilisé pour les URLs directes
    attachmentsText: "",
    correctiveActions:
      Array.isArray(rec?.correctiveActions) && rec.correctiveActions.length
        ? rec.correctiveActions.map((c) => ({
            action: c?.action ?? "",
            done: !!c?.done,
            doneAt: toDatetimeLocal(c?.doneAt),
            doneBy: c?.doneBy ? String(c.doneBy) : "",
            doneByDisplay: "",
            note: c?.note ?? "",
          }))
        : [
            {
              action: "",
              done: false,
              doneAt: "",
              doneBy: "",
              doneByDisplay: "",
              note: "",
            },
          ],
  };
}

/* Helpers lignes */
const isLineEmpty = (row) =>
  !row?.action && !row?.done && !row?.doneAt && !row?.doneByDisplay && !row?.note;
const isLineValidByAction = (row) => !!row?.action?.trim();

export default function NonConformityForm({
  restaurantId,
  initial = null,
  onSuccess,
  onCancel,
}) {
  const isEdit = !!initial?._id;

  const {
    register,
    control,
    handleSubmit,
    reset,
    watch,
    setValue,
    getValues,
    setError,
    clearErrors,
    setFocus,
    formState: { errors, isSubmitting },
  } = useForm({ defaultValues: buildDefaults(initial) });

  const { fields, append, remove } = useFieldArray({
    control,
    name: "correctiveActions",
  });

  /* ---------- Styles (alignés) ---------- */
  const fieldWrap =
    "group relative rounded-xl bg-white/50 py-2 min-h-[80px] transition-shadow";
  const labelCls =
    "flex items-center gap-2 text-xs font-medium text-darkBlue/60 mb-1";
  const inputCls =
    "h-11 w-full rounded-lg border border-darkBlue/20 bg-white px-3 text-[15px] outline-none transition placeholder:text-darkBlue/40";
  const selectCls =
    "h-11 w-full appearance-none rounded-lg border border-darkBlue/20 bg-white px-3 text-[15px] outline-none transition";
  const btnBase =
    "inline-flex items-center justify-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition active:scale-[0.98]";
  const chip =
    "rounded-md bg-darkBlue/10 px-2 py-0.5 text-[11px] text-darkBlue/70";

  /* ---------- Employés (autocomplete) ---------- */
  const { restaurantContext } = useContext(GlobalContext);
  const allEmployees = useMemo(() => {
    const list = restaurantContext.restaurantData?.employees || [];
    return list.map((e) => {
      const full = `${e.firstname ?? ""} ${e.lastname ?? ""}`.trim();
      return { _id: String(e._id), full, nfull: normalize(full) };
    });
  }, [restaurantContext.restaurantData?.employees]);
  const exactMap = useMemo(
    () => new Map(allEmployees.map((e) => [e.nfull, e])),
    [allEmployees]
  );
  const findExactByFull = useCallback(
    (txt) => (txt ? exactMap.get(normalize(txt)) || null : null),
    [exactMap]
  );
  const searchEmp = useCallback(
    (q, limit) => {
      const n = normalize(q);
      if (!n) return allEmployees.slice(0, limit);
      const out = [];
      for (let i = 0; i < allEmployees.length && out.length < limit; i++) {
        if (allEmployees[i].nfull.includes(n)) out.push(allEmployees[i]);
      }
      return out;
    },
    [allEmployees]
  );

  /* ---------- Dropdown "Effectué par" ---------- */
  const [actionDropdownOpen, setActionDropdownOpen] = useState({});
  const setActionOpen = (idx, open) =>
    setActionDropdownOpen((m) => ({ ...m, [idx]: open }));
  const actionOptionsFor = (idx) =>
    searchEmp(watch(`correctiveActions.${idx}.doneByDisplay`) || "", 8);
  const pickActionEmployee = (idx, emp) => {
    setValue(`correctiveActions.${idx}.doneBy`, emp?._id || "", {
      shouldDirty: true,
      shouldValidate: true,
    });
    setValue(`correctiveActions.${idx}.doneByDisplay`, emp?.full || "", {
      shouldDirty: true,
    });
    clearErrors([
      `correctiveActions.${idx}.doneBy`,
      `correctiveActions.${idx}.doneByDisplay`,
    ]);
    setActionOpen(idx, false);
  };
  const clearActionEmployee = (idx) => {
    setValue(`correctiveActions.${idx}.doneBy`, "", {
      shouldDirty: true,
      shouldValidate: true,
    });
    setValue(`correctiveActions.${idx}.doneByDisplay`, "", { shouldDirty: true });
    setActionOpen(idx, false);
    clearErrors([
      `correctiveActions.${idx}.doneBy`,
      `correctiveActions.${idx}.doneByDisplay`,
    ]);
  };
  const onActionKeyDown = (idx, e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      const opts = actionOptionsFor(idx);
      if (opts.length > 0) pickActionEmployee(idx, opts[0]);
    } else if (e.key === "Escape") {
      setActionOpen(idx, false);
    }
  };
  const verifyActionAtIdx = useCallback(
    (idx) => {
      const txt = (
        getValues(`correctiveActions.${idx}.doneByDisplay`) || ""
      ).trim();
      const id = getValues(`correctiveActions.${idx}.doneBy`) || "";
      if (!txt) return true;
      if (id) return true;
      const exact = findExactByFull(txt);
      if (exact) {
        setValue(`correctiveActions.${idx}.doneBy`, exact._id, {
          shouldDirty: true,
          shouldValidate: true,
        });
        setValue(`correctiveActions.${idx}.doneByDisplay`, exact.full, {
          shouldDirty: true,
        });
        clearErrors([
          `correctiveActions.${idx}.doneByDisplay`,
          `correctiveActions.${idx}.doneBy`,
        ]);
        return true;
      }
      setError(`correctiveActions.${idx}.doneByDisplay`, {
        type: "manual",
        message: "Veuillez sélectionner un nom dans la liste",
      });
      return false;
    },
    [getValues, findExactByFull, setValue, clearErrors, setError]
  );
  const onActionBlur = (idx) => {
    setTimeout(() => setActionOpen(idx, false), 120);
    verifyActionAtIdx(idx);
  };
  const actionInvalid = (idx) => {
    const txt = (watch(`correctiveActions.${idx}.doneByDisplay`) || "").trim();
    const id = watch(`correctiveActions.${idx}.doneBy`) || "";
    return !!txt && !id;
  };

  /* ---------- Auto dates sur "Fait" (garde-fou) ---------- */
  const caWatch = watch("correctiveActions") || [];
  useEffect(() => {
    caWatch.forEach((row, idx) => {
      const path = `correctiveActions.${idx}.doneAt`;
      const val = getValues(path);
      if (row?.done && !val)
        setValue(path, nowLocal(), { shouldDirty: true });
      if (!row?.done && val)
        setValue(path, "", { shouldDirty: true });
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [caWatch]);

  /* ---------- Pièces jointes (Cloudinary, même UI que WasteEntries) ---------- */
  const [existingAttachments, setExistingAttachments] = useState(
    Array.isArray(initial?.attachments) ? initial.attachments : []
  );
  const [removedAttachmentIds, setRemovedAttachmentIds] = useState([]);
  const [newFiles, setNewFiles] = useState([]);

  const fileInputRef = useRef(null);
  const cameraInputRef = useRef(null);

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
    return `${process.env.NEXT_PUBLIC_API_URL}/haccp/non-conformities/${restaurantId}/documents/${encodedPublicId}/download`;
  };

  /* ---------- Reset + pré-remplissages ---------- */
  const token = useMemo(
    () =>
      typeof window !== "undefined" ? localStorage.getItem("token") : null,
    []
  );

  useEffect(() => {
    reset(buildDefaults(initial));
    (initial?.correctiveActions || []).forEach((r, idx) => {
      const id = r?.doneBy ? String(r.doneBy) : "";
      const disp = allEmployees.find((e) => e._id === id)?.full || "";
      setValue(`correctiveActions.${idx}.doneBy`, id, { shouldDirty: false });
      setValue(`correctiveActions.${idx}.doneByDisplay`, disp, {
        shouldDirty: false,
      });
    });

    // Reset états de lignes
    setOpenById({});
    setShowReqErrById({});
    setValidatedById({});

    // Reset pièces jointes
    setExistingAttachments(
      Array.isArray(initial?.attachments) ? initial.attachments : []
    );
    setRemovedAttachmentIds([]);
    setNewFiles([]);

    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initial, allEmployees.length]);

  /* ---------- Pliage + validation explicite des lignes ---------- */
  const [openById, setOpenById] = useState({});
  const [showReqErrById, setShowReqErrById] = useState({});
  const [validatedById, setValidatedById] = useState({});
  const openNewLineRef = useRef(false);

  // Aligne les maps avec les champs existants
  useEffect(() => {
    setOpenById((prev) => {
      const next = { ...prev };
      fields.forEach((f, idx) => {
        if (next[f.id] == null) {
          const row = (caWatch && caWatch[idx]) || {};
          next[f.id] = isLineEmpty(row); // lignes vides => ouvertes
        }
      });
      for (const k of Object.keys(next)) {
        if (!fields.find((f) => f.id === k)) delete next[k];
      }
      return next;
    });

    setShowReqErrById((prev) => {
      const next = { ...prev };
      fields.forEach((f) => {
        if (next[f.id] == null) next[f.id] = false;
      });
      for (const k of Object.keys(next)) {
        if (!fields.find((f) => f.id === k)) delete next[k];
      }
      return next;
    });

    // En EDIT : lignes existantes => validées si "action" présente
    setValidatedById((prev) => {
      const next = { ...prev };
      fields.forEach((f, idx) => {
        if (next[f.id] == null) {
          const row = (caWatch && caWatch[idx]) || {};
          next[f.id] = isEdit && isLineValidByAction(row) ? true : false;
        }
      });
      for (const k of Object.keys(next)) {
        if (!fields.find((f) => f.id === k)) delete next[k];
      }
      return next;
    });
  }, [fields, caWatch, isEdit]);

  // 1ère ligne ouverte si tout vide
  useEffect(() => {
    if (!fields.length) return;
    const allEmpty =
      fields.length > 0 &&
      fields.every((f, i) => isLineEmpty((caWatch && caWatch[i]) || {}));
    if (allEmpty) {
      setOpenById((s) => ({ ...s, [fields[0].id]: true }));
    }
  }, [fields, caWatch]);

  // Ouvre la nouvelle ligne juste après append
  useEffect(() => {
    if (!openNewLineRef.current) return;
    const last = fields[fields.length - 1];
    if (last) {
      setOpenById((s) => ({ ...s, [last.id]: true }));
      setTimeout(
        () => setFocus(`correctiveActions.${fields.length - 1}.action`),
        0
      );
    }
    openNewLineRef.current = false;
  }, [fields, setFocus]);

  const toggleOpen = (id) => setOpenById((s) => ({ ...s, [id]: !s[id] }));

  // Valider une ligne : exige "Action" non vide
  const validateLine = (id, idx) => {
    const value = (caWatch?.[idx]?.action || "").trim();
    if (!value) {
      setShowReqErrById((s) => ({ ...s, [id]: true }));
      setValidatedById((s) => ({ ...s, [id]: false }));
      setOpenById((s) => ({ ...s, [id]: true }));
      setError(`correctiveActions.${idx}.action`, { type: "manual" });
      setFocus(`correctiveActions.${idx}.action`);
      return;
    }
    setShowReqErrById((s) => ({ ...s, [id]: false }));
    setValidatedById((s) => ({ ...s, [id]: true }));
    setOpenById((s) => ({ ...s, [id]: false }));
    clearErrors(`correctiveActions.${idx}.action`);
  };

  /* ---------- Submit ---------- */
  const onSubmit = async (data) => {
    if (!token) return;

    // Vérifier "effectué par" seulement sur lignes validées
    for (let i = 0; i < (data.correctiveActions || []).length; i++) {
      const fid = fields[i]?.id;
      if (!fid || !validatedById[fid]) continue;
      if (!verifyActionAtIdx(i)) return;
    }

    const rows = Array.isArray(data.correctiveActions)
      ? data.correctiveActions
      : [];

    // Garder uniquement les lignes validées explicitement
    const correctiveActions = rows
      .map((c) => ({
        action: c.action || undefined,
        done: !!c.done,
        doneAt: c.done
          ? c.doneAt
            ? new Date(c.doneAt)
            : new Date()
          : undefined,
        doneBy: c.doneBy || undefined,
        note: c.note || undefined,
      }))
      .filter((_, i) => {
        const fid = fields[i]?.id;
        return fid && validatedById[fid];
      })
      .filter((x) => x.action);

    if (!correctiveActions.length) return;

    // Construction FormData (Cloudinary + champs classiques)
    const formData = new FormData();

    formData.append("type", data.type || "other");
    if (data.referenceId) formData.append("referenceId", data.referenceId);
    if (data.description) formData.append("description", data.description);
    formData.append("severity", data.severity || "medium");
    formData.append(
      "reportedAt",
      data.reportedAt ? data.reportedAt : new Date().toISOString()
    );
    formData.append("status", data.status || "open");

    // correctiveActions envoyées en JSON
    formData.append("correctiveActions", JSON.stringify(correctiveActions));

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
      ? `${process.env.NEXT_PUBLIC_API_URL}/restaurants/${restaurantId}/non-conformities/${initial._id}`
      : `${process.env.NEXT_PUBLIC_API_URL}/restaurants/${restaurantId}/non-conformities`;
    const method = initial?._id ? "put" : "post";

    const { data: saved } = await axios[method](url, formData, {
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "multipart/form-data",
      },
    });

    window.dispatchEvent(
      new CustomEvent("non-conformity:upsert", { detail: { doc: saved } })
    );
    reset(buildDefaults(null));
    setOpenById({});
    setShowReqErrById({});
    setValidatedById({});
    setExistingAttachments([]);
    setRemovedAttachmentIds([]);
    setNewFiles([]);
    onSuccess?.(saved);
  };

  /* ---------- Boutons désactivés ---------- */
  const hasValidatedLine =
    Array.isArray(fields) && fields.some((f) => validatedById[f.id]);
  const submitDisabled = isSubmitting || !hasValidatedLine;
  const lastField = fields.length ? fields[fields.length - 1] : null;
  const addDisabled = lastField ? !validatedById[lastField.id] : false;

  /* ---------- Render ---------- */
  return (
    <form
      onSubmit={handleSubmit(onSubmit)}
      className="relative flex flex-col gap-5"
    >
      {/* Ligne 1 : type / statut / sévérité / date */}
      <div className="grid grid-cols-1 gap-2 midTablet:grid-cols-2 ultraWild:grid-cols-4">
        <div className={`${fieldWrap} px-3`}>
          <label className={labelCls}>Type *</label>
          <select
            {...register("type", { required: "Requis" })}
            className={`${selectCls} ${
              errors.type ? "border-red focus:ring-red/20" : ""
            }`}
          >
            <option value="temperature">Température</option>
            <option value="hygiene">Hygiène</option>
            <option value="reception">Réception</option>
            <option value="microbiology">Microbiologie</option>
            <option value="other">Autre</option>
          </select>
          {errors.type && (
            <p className="text-xs text-red mt-1">{errors.type.message}</p>
          )}
        </div>

        <div className={`${fieldWrap} px-3`}>
          <label className={labelCls}>Statut *</label>
          <select
            {...register("status", { required: "Requis" })}
            className={`${selectCls} ${
              errors.status ? "border-red focus:ring-red/20" : ""
            }`}
          >
            <option value="open">Ouverte</option>
            <option value="in_progress">En cours</option>
            <option value="closed">Fermée</option>
          </select>
          {errors.status && (
            <p className="text-xs text-red mt-1">{errors.status.message}</p>
          )}
        </div>

        <div className={`${fieldWrap} px-3`}>
          <label className={labelCls}>Gravité *</label>
          <select
            {...register("severity", { required: "Requis" })}
            className={`${selectCls} ${
              errors.severity ? "border-red focus:ring-red/20" : ""
            }`}
          >
            <option value="low">Faible</option>
            <option value="medium">Moyenne</option>
            <option value="high">Élevée</option>
          </select>
          {errors.severity && (
            <p className="text-xs text-red mt-1">{errors.severity.message}</p>
          )}
        </div>

        <div className={`${fieldWrap} px-3`}>
          <label className={labelCls}>Déclarée le *</label>
          <input
            type="datetime-local"
            {...register("reportedAt", { required: "Requis" })}
            className={`${selectCls} ${
              errors.reportedAt ? "border-red focus:ring-red/20" : ""
            }`}
          />
          {errors.reportedAt && (
            <p className="text-xs text-red mt-1">
              {errors.reportedAt.message}
            </p>
          )}
        </div>
      </div>

      {/* Ligne 2 : ref / description */}
      <div className="grid grid-cols-1 gap-2 midTablet:grid-cols-3">
        <div className={`${fieldWrap} px-3`}>
          <label className={labelCls}>Référence</label>
          <input
            type="text"
            {...register("referenceId")}
            className={inputCls}
            placeholder="Ex: BON-RECEP-0425"
            autoComplete="off"
            spellCheck={false}
            autoCorrect="off"
          />
        </div>
        <div className={`${fieldWrap} px-3 midTablet:col-span-2`}>
          <label className={labelCls}>Description</label>
          <input
            type="text"
            {...register("description")}
            className={inputCls}
            placeholder="Détail de la non-conformité"
            autoComplete="off"
            spellCheck={false}
            autoCorrect="off"
          />
        </div>
      </div>

      {/* Ligne 3 : pièces (UI Cloudinary comme WasteEntriesForm) */}
      <div className="grid grid-cols-1 gap-2">
        <div className={`${fieldWrap.replace("min-h-[80px]", "min-h-0")} px-3`}>
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

          <div className="space-y-2 max-h-[135px] overflow-y-scroll">
            {/* Nouveaux fichiers */}
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
                        {/* Badge mimetype */}
                        <span
                          className={`flex h-6 w-8 items-center justify-center rounded-md text-[10px] font-semibold ${
                            isMarked
                              ? "bg-red/10 text-red"
                              : "bg-darkBlue/5 text-darkBlue/70"
                          }`}
                        >
                          {label}
                        </span>

                        {/* Nom + download */}
                        <a
                          href={
                            isMarked
                              ? undefined
                              : downloadUrlForAttachment(att)
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

                        {/* Bouton marquer / annuler suppression */}
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

            {/* Petit hint si rien */}
            {existingAttachments.length === 0 && newFiles.length === 0 && (
              <p className="text-[11px] text-darkBlue/40">
                Ajoutez une photo ou un document PDF pour justifier cette
                non-conformité.
              </p>
            )}
          </div>
        </div>
      </div>

      {/* Actions correctives */}
      <div className="rounded-2xl bg-white/50 p-3 pb-0">
        <div className="mb-3 flex items-center justify-between">
          <h3 className="text-sm font-semibold text-darkBlue flex items-center gap-2">
            <FileText className="size-4" /> Actions correctives
          </h3>

          <button
            type="button"
            disabled={addDisabled}
            aria-disabled={addDisabled}
            onClick={() => {
              if (addDisabled) return;
              openNewLineRef.current = true;
              append({
                action: "",
                done: false,
                doneAt: "",
                doneBy: "",
                doneByDisplay: "",
                note: "",
              });
            }}
            className={`${btnBase} border border-violet/20 bg-white text-violet hover:bg-violet/5 disabled:opacity-60 disabled:cursor-not-allowed`}
            title={
              addDisabled
                ? "Validez la ligne précédente pour ajouter une action"
                : undefined
            }
          >
            <PlusCircle className="size-4" /> Ajouter une action
          </button>
        </div>

        <div className="space-y-3 mb-3">
          {fields.map((f, idx) => {
            const id = f.id;
            const isOpen = !!openById[id];
            const row = (caWatch && caWatch[idx]) || {};
            const hasReqErr = !!showReqErrById[id] && !row?.action?.trim();

            const summary = (
              <div className="flex flex-wrap items-center justify-end gap-1">
                {!!row?.done && <span className={chip}>Fait</span>}
                {!!row?.doneAt && (
                  <span className={chip}>
                    {new Date(row.doneAt).toLocaleString("fr-FR", {
                      day: "2-digit",
                      month: "2-digit",
                      year: "2-digit",
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </span>
                )}
                {!!row?.doneByDisplay && (
                  <span className={chip}>{row.doneByDisplay}</span>
                )}
              </div>
            );

            return (
              <div key={id} className="rounded-xl border border-darkBlue/10 bg-white">
                {/* Header ligne */}
                <div className="flex items-center justify-between gap-3 px-3 py-2">
                  <button
                    type="button"
                    onClick={() => toggleOpen(id)}
                    className="flex items-center gap-2 text-left"
                    title={isOpen ? "Replier" : "Déplier"}
                  >
                    <ChevronDown
                      className={`size-4 shrink-0 transition-transform ${
                        isOpen ? "rotate-180" : ""
                      }`}
                    />
                    <div className="flex flex-col">
                      <span className="text-sm font-medium text-darkBlue">
                        {row?.action?.trim() || "Nouvelle action corrective"}
                      </span>
                      {!isOpen && (
                        <span className="text-[11px] text-darkBlue/60">
                          Cliquez pour voir/modifier le détail
                        </span>
                      )}
                    </div>
                  </button>

                  {!isOpen && summary}
                </div>

                {/* Contenu collapsible - 100% CSS (grid 0fr/1fr) */}
                <div
                  className={`grid transition-[grid-template-rows] duration-300 ease-in-out ${
                    isOpen ? "grid-rows-[1fr]" : "grid-rows-[0fr]"
                  }`}
                >
                  <div className="overflow-hidden">
                    <div className="p-3 border-t border-darkBlue/10">
                      {/* Ligne A : Action + Fait (switch) + Fait le */}
                      <div className="grid grid-cols-1 gap-2 midTablet:grid-cols-3">
                        <div className={fieldWrap}>
                          <label className={labelCls}>Action *</label>
                          <input
                            type="text"
                            placeholder="Ex: Corriger l’étiquetage, Former le personnel…"
                            autoComplete="off"
                            spellCheck={false}
                            autoCorrect="off"
                            {...register(`correctiveActions.${idx}.action`, {
                              onChange: (e) => {
                                setValidatedById((s) =>
                                  s[id] ? { ...s, [id]: false } : s
                                );
                                if (e.target.value.trim()) {
                                  clearErrors(
                                    `correctiveActions.${idx}.action`
                                  );
                                }
                              },
                            })}
                            className={`${inputCls} ${
                              hasReqErr ? "border-red focus:ring-red/20" : ""
                            }`}
                            aria-invalid={hasReqErr ? "true" : "false"}
                          />
                        </div>

                        {/* SWITCH "Fait" */}
                        <div className={fieldWrap}>
                          <label className={labelCls}>Fait</label>
                          <label
                            role="switch"
                            aria-checked={!!row?.done}
                            className="group inline-flex justify-between h-11 w-full items-center gap-3 rounded-lg border border-darkBlue/20 bg-white px-3 py-2 cursor-pointer select-none"
                            title="Basculer Fait / Non fait"
                          >
                            <span className="text-sm text-darkBlue/70">
                              {row?.done ? "Oui" : "Non"}
                            </span>

                            <input
                              type="checkbox"
                              className="sr-only peer"
                              {...register(`correctiveActions.${idx}.done`, {
                                onChange: (e) => {
                                  const checked = e.target.checked;
                                  // logique immédiate : set/unset la date exécution
                                  setValue(
                                    `correctiveActions.${idx}.done`,
                                    checked,
                                    { shouldDirty: true }
                                  );
                                  setValue(
                                    `correctiveActions.${idx}.doneAt`,
                                    checked ? nowLocal() : "",
                                    { shouldDirty: true, shouldValidate: true }
                                  );
                                  setValidatedById((s) =>
                                    s[id] ? { ...s, [id]: false } : s
                                  );
                                },
                              })}
                            />

                            <span
                              className="
                                relative inline-flex h-6 w-11 items-center rounded-full
                                bg-darkBlue/20 transition-colors
                                peer-checked:bg-darkBlue/80 group-aria-checked:bg-darkBlue/80
                              "
                            >
                              <span
                                className="
                                  absolute left-1 top-1/2 -translate-y-1/2
                                  size-4 rounded-full bg-white shadow
                                  transition-transform will-change-transform translate-x-0
                                  peer-checked:translate-x-5 group-aria-checked:translate-x-5
                                "
                              />
                            </span>
                          </label>
                        </div>

                        <div className={fieldWrap}>
                          <label className={labelCls}>Fait le</label>
                          <input
                            type="datetime-local"
                            disabled={!row?.done}
                            {...register(`correctiveActions.${idx}.doneAt`, {
                              onChange: () =>
                                setValidatedById((s) =>
                                  s[id] ? { ...s, [id]: false } : s
                                ),
                            })}
                            className={`${selectCls} ${
                              !row?.done ? "opacity-60 cursor-not-allowed" : ""
                            }`}
                          />
                        </div>
                      </div>

                      {/* Ligne B : Effectué par + Note */}
                      <div className="grid grid-cols-1 gap-2 midTablet:grid-cols-2">
                        <div className={fieldWrap}>
                          <label className={labelCls}>
                            Effectué par{" "}
                            {(actionInvalid(idx) ||
                              errors?.correctiveActions?.[idx]?.doneByDisplay) && (
                              <span className="text-xs hidden mobile:block text-red italic">
                                &nbsp;— Veuillez sélectionner un nom dans la
                                liste —
                              </span>
                            )}
                          </label>
                          <div className="relative">
                            <input
                              type="text"
                              {...register(
                                `correctiveActions.${idx}.doneByDisplay`
                              )}
                              autoComplete="off"
                              spellCheck={false}
                              autoCorrect="off"
                              onFocus={() => setActionOpen(idx, true)}
                              onBlur={() => onActionBlur(idx)}
                              onChange={(e) => {
                                setValue(
                                  `correctiveActions.${idx}.doneByDisplay`,
                                  e.target.value,
                                  { shouldDirty: true }
                                );
                                setActionOpen(idx, true);
                                setValue(
                                  `correctiveActions.${idx}.doneBy`,
                                  "",
                                  {
                                    shouldDirty: true,
                                    shouldValidate: true,
                                  }
                                );
                                setValidatedById((s) =>
                                  s[id] ? { ...s, [id]: false } : s
                                );
                              }}
                              onKeyDown={(e) => onActionKeyDown(idx, e)}
                              className={`${inputCls} pr-8 ${
                                actionInvalid(idx) ||
                                errors?.correctiveActions?.[idx]?.doneByDisplay
                                  ? "border-red focus:ring-red/20"
                                  : ""
                              }`}
                              placeholder="Rechercher un employé…"
                            />
                            {(watch(
                              `correctiveActions.${idx}.doneByDisplay`
                            ) || "") && (
                              <button
                                type="button"
                                onMouseDown={(e) => e.preventDefault()}
                                onClick={() => clearActionEmployee(idx)}
                                className="absolute right-2 top-1/2 -translate-y-1/2 w-6 h-6 bg-black/30 text-white rounded-full flex items-center justify-center"
                                title="Effacer"
                              >
                                &times;
                              </button>
                            )}
                            {actionDropdownOpen[idx] &&
                              (
                                watch(
                                  `correctiveActions.${idx}.doneByDisplay`
                                ) || ""
                              ).trim() !== "" && (
                                <ul
                                  className="absolute z-10 left-0 right-0 bottom-[115%] mt-1 bg-white border border-darkBlue/20 rounded shadow max-h-56 overflow-auto"
                                  onMouseDown={(e) => e.preventDefault()}
                                >
                                  {actionOptionsFor(idx).length === 0 && (
                                    <li className="px-3 py-2 text-sm text-darkBlue/50 italic">
                                      Aucun résultat
                                    </li>
                                  )}
                                  {actionOptionsFor(idx).map((emp) => (
                                    <li
                                      key={emp._id}
                                      onClick={() =>
                                        pickActionEmployee(idx, emp)
                                      }
                                      className={`px-3 py-[8px] cursor-pointer text-darkBlue/70 text-sm border-b border-b-darkBlue/10 last:border-none hover:bg-lightGrey ${
                                        (watch(
                                          `correctiveActions.${idx}.doneBy`
                                        ) || "") === emp._id
                                          ? "bg-darkBlue/10"
                                          : ""
                                      }`}
                                    >
                                      {emp.full}
                                    </li>
                                  ))}
                                </ul>
                              )}
                          </div>
                          <input
                            type="hidden"
                            {...register(`correctiveActions.${idx}.doneBy`)}
                          />
                        </div>

                        <div className={fieldWrap}>
                          <label className={labelCls}>Note</label>
                          <input
                            type="text"
                            {...register(`correctiveActions.${idx}.note`, {
                              onChange: () =>
                                setValidatedById((s) =>
                                  s[id] ? { ...s, [id]: false } : s
                                ),
                            })}
                            className={inputCls}
                          />
                        </div>
                      </div>

                      {/* Actions de ligne */}
                      <div className="flex flex-col-reverse mobile:flex-row justify-between pt-2 gap-2">
                        <button
                          type="button"
                          onClick={() => {
                            setShowReqErrById((s) => {
                              const n = { ...s };
                              delete n[id];
                              return n;
                            });
                            setValidatedById((s) => {
                              const n = { ...s };
                              delete n[id];
                              return n;
                            });
                            remove(idx);
                          }}
                          className={`${btnBase} h-11 border border-red bg-white text-red hover:border-red/80`}
                        >
                          <Trash2 className="size-4" /> Supprimer la ligne
                        </button>

                        {isOpen && (
                          <button
                            type="button"
                            onClick={() => validateLine(id, idx)}
                            className={`${btnBase} h-11 border border-blue bg-blue text-white hover:border-darkBlue/30`}
                            title="Valider la ligne"
                          >
                            Valider la ligne
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
                {/* /Contenu collapsible */}
              </div>
            );
          })}
        </div>
      </div>

      {/* Actions form (même UI que WasteEntriesForm) */}
      <div className="flex flex-col items-center gap-2 mt-3 mobile:flex-row">
        <button
          type="submit"
          disabled={submitDisabled}
          aria-disabled={submitDisabled}
          className="text-nowrap inline-flex items-center justify-center gap-2 h-[38px] rounded-lg bg-blue px-4 py-2 text-sm font-medium text-white shadow disabled:opacity-60"
          title={
            submitDisabled
              ? "Validez au moins une ligne (Action*)"
              : undefined
          }
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
              setOpenById({});
              setShowReqErrById({});
              setValidatedById({});
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
