"use client";
import {
  useContext,
  useEffect,
  useMemo,
  useState,
  useCallback,
  useRef,
} from "react";
import { useForm, useFieldArray } from "react-hook-form";
import axios from "axios";
import { GlobalContext } from "@/contexts/global.context";
import { PlusCircle, Trash2, ChevronDown, FileText } from "lucide-react";

/* ---------- Utils ---------- */
const toDTLocal = (v) => {
  if (!v) return "";
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return "";
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000)
    .toISOString()
    .slice(0, 16);
};
const nowLocal = () => toDTLocal(new Date());
const empId = (v) =>
  v ? String(typeof v === "object" ? v._id || v.id || "" : v) : "";
const empFull = (v) => {
  if (!v || typeof v !== "object") return "";
  const f = v.firstname || v.firstName || "";
  const l = v.lastname || v.lastName || "";
  return `${f} ${l}`.trim();
};
const parseList = (s) =>
  typeof s === "string" && s.trim()
    ? s
        .split(/[\n,;]+/g)
        .map((x) => x.trim())
        .filter(Boolean)
    : [];
const normalize = (s) =>
  (s || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .toLowerCase()
    .trim();

const buildDefaults = (rec) => ({
  source: rec?.source ?? "internal",
  itemName: rec?.itemName ?? "",
  itemId: rec?.itemId ? String(rec.itemId) : "",
  itemRefModel: rec?.itemRefModel ?? "",
  supplierId: rec?.supplierId ? String(rec.supplierId) : "",
  detectedAt: toDTLocal(rec?.detectedAt ?? new Date()),
  detectedBy: empId(rec?.detectedBy),
  detectedByDisplay: empFull(rec?.detectedBy),
  allergensText: Array.isArray(rec?.allergens) ? rec.allergens.join("\n") : "",
  severity: rec?.severity ?? "medium",
  description: rec?.description ?? "",
  immediateAction: rec?.immediateAction ?? "",
  attachmentsText: Array.isArray(rec?.attachments)
    ? rec.attachments.join("\n")
    : "",
  closed: !!rec?.closed,
  closedAt: toDTLocal(rec?.closedAt),
  correctiveActions:
    Array.isArray(rec?.correctiveActions) && rec.correctiveActions.length
      ? rec.correctiveActions.map((c) => ({
          action: c?.action ?? "",
          done: !!c?.done,
          doneAt: toDTLocal(c?.doneAt),
          doneBy: empId(c?.doneBy),
          doneByDisplay: empFull(c?.doneBy),
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
});

/* Helpers lignes */
const isLineEmpty = (row) =>
  !row?.action &&
  !row?.done &&
  !row?.doneAt &&
  !row?.doneByDisplay &&
  !row?.note;
const isLineValidByAction = (row) => !!row?.action?.trim();

export default function AllergenIncidentForm({
  restaurantId,
  initial = null,
  onSuccess,
  onCancel,
}) {
  const isEdit = !!initial?._id;

  const {
    register,
    handleSubmit,
    control,
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

  /* ---------- Styles (alignés avec tes autres composants) ---------- */
  const fieldWrap =
    "group relative rounded-xl bg-white/50 backdrop-blur-sm py-2 min-h-[80px] transition-shadow";
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

  /* ---------- Employees (pré-normalisés) ---------- */
  const { restaurantContext } = useContext(GlobalContext);
  const employees = useMemo(() => {
    const list = restaurantContext.restaurantData?.employees || [];
    return list.map((e) => {
      const full = `${e.firstname ?? ""} ${e.lastname ?? ""}`.trim();
      return {
        _id: String(e._id),
        firstname: e.firstname,
        lastname: e.lastname,
        full,
        nfull: normalize(full),
      };
    });
  }, [restaurantContext.restaurantData?.employees]);
  const exactMap = useMemo(
    () => new Map(employees.map((e) => [e.nfull, e])),
    [employees]
  );

  const findExact = useCallback(
    (txt) => (txt ? exactMap.get(normalize(txt)) || null : null),
    [exactMap]
  );
  const searchEmp = useCallback(
    (q, limit) => {
      const n = normalize(q);
      if (!n) return employees.slice(0, limit);
      const out = [];
      for (let i = 0; i < employees.length && out.length < limit; i++) {
        if (employees[i].nfull.includes(n)) out.push(employees[i]);
      }
      return out;
    },
    [employees]
  );

  /* ---------- Détecté par (auto-complétion) ---------- */
  const [detectedQuery, setDetectedQuery] = useState(
    buildDefaults(initial).detectedByDisplay || ""
  );
  const [showDetectedDropdown, setShowDetectedDropdown] = useState(false);
  const detectedBy = watch("detectedBy") || "";
  const detectedOptions = useMemo(
    () => searchEmp(detectedQuery, 10),
    [searchEmp, detectedQuery]
  );
  const detectedInvalid = detectedQuery.trim() !== "" && !detectedBy;

  useEffect(() => {
    if (detectedBy) {
      const found = employees.find((e) => e._id === String(detectedBy));
      if (found && found.full !== detectedQuery) setDetectedQuery(found.full);
    } else if (initial?.detectedBy) {
      const disp = empFull(initial.detectedBy);
      if (disp && disp !== detectedQuery) setDetectedQuery(disp);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [detectedBy, employees]);

  const pickDetected = (emp) => {
    setValue("detectedBy", emp?._id || "", {
      shouldDirty: true,
      shouldValidate: true,
    });
    setDetectedQuery(emp?.full || "");
    clearErrors("detectedBy");
    setShowDetectedDropdown(false);
  };
  const clearDetected = () => {
    setValue("detectedBy", "", { shouldDirty: true, shouldValidate: true });
    setDetectedQuery("");
    setShowDetectedDropdown(false);
    clearErrors("detectedBy");
  };
  const onDetectedKeyDown = (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      if (detectedOptions.length) pickDetected(detectedOptions[0]);
    } else if (e.key === "Escape") setShowDetectedDropdown(false);
  };
  const verifyDetected = useCallback(() => {
    const txt = detectedQuery.trim();
    const curId = getValues("detectedBy") || "";
    if (!txt) return true;
    if (curId) return true;
    const exact = findExact(txt);
    if (exact) {
      setValue("detectedBy", exact._id, {
        shouldDirty: true,
        shouldValidate: true,
      });
      setDetectedQuery(exact.full);
      clearErrors("detectedBy");
      return true;
    }
    setError("detectedBy", {
      type: "manual",
      message: "Veuillez sélectionner un nom dans la liste",
    });
    return false;
  }, [detectedQuery, getValues, findExact, setValue, clearErrors, setError]);

  const onDetectedBlur = () => {
    setTimeout(() => setShowDetectedDropdown(false), 120);
    verifyDetected();
  };

  /* ---------- Effectué par (par action) ---------- */
  const [actionDropdownOpen, setActionDropdownOpen] = useState({});
  const setActionOpen = (i, open) =>
    setActionDropdownOpen((m) => ({ ...m, [i]: open }));
  const actionOptionsFor = (i) =>
    searchEmp(watch(`correctiveActions.${i}.doneByDisplay`) || "", 8);
  const pickActionEmployee = (i, emp) => {
    setValue(`correctiveActions.${i}.doneBy`, emp?._id || "", {
      shouldDirty: true,
      shouldValidate: true,
    });
    setValue(`correctiveActions.${i}.doneByDisplay`, emp?.full || "", {
      shouldDirty: true,
    });
    clearErrors([
      `correctiveActions.${i}.doneBy`,
      `correctiveActions.${i}.doneByDisplay`,
    ]);
    setActionOpen(i, false);
  };
  const clearActionEmployee = (i) => {
    setValue(`correctiveActions.${i}.doneBy`, "", {
      shouldDirty: true,
      shouldValidate: true,
    });
    setValue(`correctiveActions.${i}.doneByDisplay`, "", { shouldDirty: true });
    clearErrors([
      `correctiveActions.${i}.doneBy`,
      `correctiveActions.${i}.doneByDisplay`,
    ]);
    setActionOpen(i, false);
  };
  const onActionKeyDown = (i, e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      const opts = actionOptionsFor(i);
      if (opts.length) pickActionEmployee(i, opts[0]);
    } else if (e.key === "Escape") setActionOpen(i, false);
  };
  const verifyActionAtIdx = useCallback(
    (i) => {
      const txt = (
        getValues(`correctiveActions.${i}.doneByDisplay`) || ""
      ).trim();
      const id = getValues(`correctiveActions.${i}.doneBy`) || "";
      if (!txt) return true;
      if (id) return true;
      const exact = findExact(txt);
      if (exact) {
        setValue(`correctiveActions.${i}.doneBy`, exact._id, {
          shouldDirty: true,
          shouldValidate: true,
        });
        setValue(`correctiveActions.${i}.doneByDisplay`, exact.full, {
          shouldDirty: true,
        });
        clearErrors([
          `correctiveActions.${i}.doneByDisplay`,
          `correctiveActions.${i}.doneBy`,
        ]);
        return true;
      }
      setError(`correctiveActions.${i}.doneByDisplay`, {
        type: "manual",
        message: "Veuillez sélectionner un nom dans la liste",
      });
      return false;
    },
    [getValues, findExact, setValue, clearErrors, setError]
  );
  const actionInvalid = (i) => {
    const txt = (watch(`correctiveActions.${i}.doneByDisplay`) || "").trim();
    const id = watch(`correctiveActions.${i}.doneBy`) || "";
    return !!txt && !id;
  };
  const onActionBlur = (i) => {
    setTimeout(() => setActionOpen(i, false), 120);
    verifyActionAtIdx(i);
  };

  /* ---------- Auto dates ---------- */
  const caWatch = watch("correctiveActions") || [];
  useEffect(() => {
    caWatch.forEach((row, i) => {
      const path = `correctiveActions.${i}.doneAt`;
      const val = getValues(path);
      if (row?.done && !val) setValue(path, nowLocal(), { shouldDirty: true });
      if (!row?.done && val) setValue(path, "", { shouldDirty: true });
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [caWatch]);

  const closed = watch("closed");
  const closedAt = watch("closedAt");
  useEffect(() => {
    if (closed && !closedAt)
      setValue("closedAt", nowLocal(), { shouldDirty: true });
    if (!closed && closedAt) setValue("closedAt", "", { shouldDirty: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [closed, closedAt]);

  /* ---------- Reset quand initial change ---------- */
  useEffect(() => {
    const def = buildDefaults(initial);
    reset(def);

    // "Détecté par" (label)
    if (def.detectedByDisplay) {
      setDetectedQuery(def.detectedByDisplay);
    } else if (def.detectedBy) {
      const found = employees.find((e) => e._id === def.detectedBy);
      setDetectedQuery(found?.full || "");
    } else {
      setDetectedQuery("");
    }

    // doneByDisplay pré-rempli si ids seuls
    (initial?.correctiveActions || []).forEach((r, i) => {
      const id = empId(r?.doneBy);
      const disp =
        empFull(r?.doneBy) || employees.find((e) => e._id === id)?.full || "";
      setValue(`correctiveActions.${i}.doneByDisplay`, disp, {
        shouldDirty: false,
      });
      setValue(`correctiveActions.${i}.doneBy`, id || "", {
        shouldDirty: false,
      });
    });

    // reset états lignes
    setOpenById({});
    setShowReqErrById({});
    setValidatedById({});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initial, employees]);

  /* ---------- Pliage + validation explicite des lignes ---------- */
  const [openById, setOpenById] = useState({});
  const [showReqErrById, setShowReqErrById] = useState({});
  const [validatedById, setValidatedById] = useState({});
  const contentRefs = useRef({});
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

    // En EDIT : lignes existantes considérées validées si "action" présente
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

  // 1ère ligne ouverte si tout est vide
  useEffect(() => {
    if (!fields.length) return;
    const allEmpty =
      fields.length > 0 &&
      fields.every((f, i) => isLineEmpty((caWatch && caWatch[i]) || {}));
    if (allEmpty) {
      setOpenById((s) => ({ ...s, [fields[0].id]: true }));
      // focus sur le formulaire principal, pas la ligne
      // setFocus("itemName"); // active si tu veux forcer le focus
    }
  }, [fields, caWatch /*, setFocus*/]);

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
    const token = localStorage.getItem("token");
    if (!token) return;

    // Valide uniquement ce qui a été validé explicitement
    if (!verifyDetected()) return;

    // Vérifier "effectué par" uniquement sur les lignes validées
    for (let i = 0; i < (data.correctiveActions || []).length; i++) {
      const fid = fields[i]?.id;
      if (!fid || !validatedById[fid]) continue;
      if (!verifyActionAtIdx(i)) return;
    }

    const rows = Array.isArray(data.correctiveActions)
      ? data.correctiveActions
      : [];

    // Garder uniquement les lignes validées explictement
    const actionsFiltered = rows
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

    if (!actionsFiltered.length) return;

    const payload = {
      source: data.source || "internal",
      itemName: data.itemName || undefined,
      itemId: data.itemId || undefined,
      itemRefModel: data.itemRefModel || undefined,
      supplierId: data.supplierId || undefined,
      detectedAt: data.detectedAt ? new Date(data.detectedAt) : new Date(),
      detectedBy: data.detectedBy || undefined,
      allergens: parseList(data.allergensText),
      severity: data.severity || "medium",
      description: data.description || undefined,
      immediateAction: data.immediateAction || undefined,
      attachments: parseList(data.attachmentsText),
      closed: !!data.closed,
      closedAt: data.closed
        ? data.closedAt
          ? new Date(data.closedAt)
          : new Date()
        : undefined,
      correctiveActions: actionsFiltered,
    };

    const base = process.env.NEXT_PUBLIC_API_URL;
    const url = initial?._id
      ? `${base}/restaurants/${restaurantId}/allergen-incidents/${initial._id}`
      : `${base}/restaurants/${restaurantId}/allergen-incidents`;
    const method = initial?._id ? "put" : "post";

    const { data: saved } = await axios[method](url, payload, {
      headers: { Authorization: `Bearer ${token}` },
    });

    window.dispatchEvent(
      new CustomEvent("allergen-incident:upsert", { detail: { doc: saved } })
    );

    reset(buildDefaults(null));
    setDetectedQuery("");
    setOpenById({});
    setShowReqErrById({});
    setValidatedById({});
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
      {/* Ligne 1 */}
      <div className="grid grid-cols-1 gap-2 midTablet:grid-cols-3">
        <div className={`${fieldWrap} px-3`}>
          <label className={labelCls}>Source</label>
          <select {...register("source")} className={selectCls}>
            <option value="internal">Interne</option>
            <option value="supplier">Fournisseur</option>
            <option value="customer">Client</option>
            <option value="lab">Laboratoire</option>
            <option value="other">Autre</option>
          </select>
        </div>

        <div className={`${fieldWrap} px-3 midTablet:col-span-2`}>
          <label className={labelCls}>
            <FileText className="size-4" /> Produit / Plat
          </label>
          <input
            type="text"
            autoComplete="off"
            spellCheck={false}
            autoCorrect="off"
            {...register("itemName")}
            className={inputCls}
            placeholder="Ex: Sauce bolognaise"
          />
        </div>
      </div>

      {/* Ligne 2 */}
      <div className="grid grid-cols-1 gap-2 midTablet:grid-cols-3">
        <div className={`${fieldWrap} px-3`}>
          <label className={labelCls}>Détecté le *</label>
          <input
            type="datetime-local"
            {...register("detectedAt", { required: "Requis" })}
            className={`${selectCls} ${errors.detectedAt ? "border-red focus:ring-red/20" : ""}`}
          />
          {errors.detectedAt && (
            <p className="text-xs text-red mt-1">{errors.detectedAt.message}</p>
          )}
        </div>

        {/* Détecté par */}
        <div className={`${fieldWrap} px-3`}>
          <label className={labelCls}>Détecté par</label>
          <div className="relative">
            <input
              type="text"
              value={detectedQuery}
              onChange={(e) => {
                setDetectedQuery(e.target.value);
                setShowDetectedDropdown(true);
                setValue("detectedBy", "", {
                  shouldDirty: true,
                  shouldValidate: true,
                });
              }}
              onFocus={() => setShowDetectedDropdown(true)}
              onBlur={onDetectedBlur}
              onKeyDown={onDetectedKeyDown}
              placeholder="Rechercher un employé…"
              className={`${inputCls} pr-8 ${
                detectedInvalid || errors.detectedBy
                  ? "border-red focus:ring-red/20"
                  : ""
              }`}
            />
            {detectedQuery && (
              <button
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={clearDetected}
                className="absolute right-2 top-1/2 -translate-y-1/2 w-6 h-6 bg-black/30 text-white rounded-full flex items-center justify-center"
                title="Effacer"
              >
                &times;
              </button>
            )}
            {showDetectedDropdown && detectedQuery.trim() !== "" && (
              <ul
                className="absolute z-10 left-0 right-0 mt-1 bg-white border rounded shadow max-h-56 overflow-auto"
                onMouseDown={(e) => e.preventDefault()}
              >
                {detectedOptions.length === 0 && (
                  <li className="px-3 py-2 text-sm opacity-70 italic">
                    Aucun résultat
                  </li>
                )}
                {detectedOptions.map((emp) => (
                  <li
                    key={emp._id}
                    onClick={() => pickDetected(emp)}
                    className={`px-3 py-[8px] cursor-pointer hover:bg-lightGrey ${
                      detectedBy === emp._id ? "bg-gray-100" : ""
                    }`}
                  >
                    {emp.full}
                  </li>
                ))}
              </ul>
            )}
          </div>
          <input type="hidden" {...register("detectedBy")} />
          {(detectedInvalid || errors.detectedBy) && (
            <p className="text-xs text-red mt-1">
              {errors.detectedBy?.message ||
                "Veuillez sélectionner un nom dans la liste"}
            </p>
          )}
        </div>

        <div className={`${fieldWrap} px-3`}>
          <label className={labelCls}>Gravité</label>
          <select {...register("severity")} className={selectCls}>
            <option value="low">Faible</option>
            <option value="medium">Moyenne</option>
            <option value="high">Élevée</option>
          </select>
        </div>
      </div>

      {/* Ligne 3 */}
      <div className="grid grid-cols-1 gap-2 midTablet:grid-cols-3">
        <div className={`${fieldWrap} px-3 midTablet:col-span-2`}>
          <label className={labelCls}>Action immédiate</label>
          <input
            type="text"
            autoComplete="off"
            spellCheck={false}
            autoCorrect="off"
            {...register("immediateAction")}
            className={inputCls}
            placeholder="Isolement lot, rappel, etc."
          />
        </div>
        <div className={`${fieldWrap} px-3`}>
          <label className={labelCls}>Pièces jointes (URLs)</label>
          <textarea
            rows={1}
            {...register("attachmentsText")}
            className="w-full resize-none rounded-lg border border-darkBlue/20 bg-white p-[10px] text-[15px] outline-none transition placeholder:text-darkBlue/40 min-h-[44px]"
            placeholder={"https://…/rapport-lab.pdf\nhttps://…/photo.jpg"}
          />
        </div>
      </div>

      {/* Allergènes + Description */}
      <div className="grid grid-cols-1 gap-2 midTablet:grid-cols-2">
        <div className={`${fieldWrap} px-3`}>
          <label className={labelCls}>Allergènes (1 par ligne)</label>
          <textarea
            rows={3}
            {...register("allergensText")}
            className="w-full resize-none rounded-lg border border-darkBlue/20 bg-white p-[10px] text-[15px] outline-none transition placeholder:text-darkBlue/40 min-h-[96px]"
            placeholder={"gluten\nlait\noeuf\narachides"}
          />
        </div>
        <div className={`${fieldWrap} px-3`}>
          <label className={labelCls}>Description</label>
          <textarea
            rows={3}
            {...register("description")}
            className="w-full resize-none rounded-lg border border-darkBlue/20 bg-white p-[10px] text-[15px] outline-none transition placeholder:text-darkBlue/40 min-h-[96px]"
          />
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

            // résumé quand replié
            const summaryChips = (
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
              <div
                key={id}
                className="rounded-xl border border-darkBlue/10 bg-white"
              >
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

                  {!isOpen && summaryChips}
                </div>

                {/* Contenu collapsible */}
                <div
                  ref={(el) => (contentRefs.current[id] = el)}
                  style={{
                    maxHeight: isOpen
                      ? contentRefs.current[id]?.scrollHeight || 9999
                      : 0,
                  }}
                  className="overflow-hidden transition-[max-height] duration-300 ease-in-out"
                >
                  <div className="p-3 border-t border-darkBlue/10">
                    {/* Ligne A : Action + Fait + Fait le */}
                    <div className="grid grid-cols-1 gap-2 midTablet:grid-cols-3">
                      <div className={fieldWrap}>
                        <label className={labelCls}>Action *</label>
                        <input
                          type="text"
                          placeholder="Ex: Mise à jour étiquetage vitrine"
                          autoComplete="off"
                          spellCheck={false}
                          {...register(`correctiveActions.${idx}.action`, {
                            onChange: (e) => {
                              // si on modifie un requis après validation => la ligne redevient non validée
                              setValidatedById((s) =>
                                s[id] ? { ...s, [id]: false } : s
                              );
                              if (e.target.value.trim()) {
                                clearErrors(`correctiveActions.${idx}.action`);
                              }
                            },
                          })}
                          className={`${inputCls} ${
                            hasReqErr ? "border-red focus:ring-red/20" : ""
                          }`}
                          aria-invalid={hasReqErr ? "true" : "false"}
                        />
                      </div>

                      <div className="flex items-center gap-2 px-3">
                        <input
                          id={`ca_done_${idx}`}
                          type="checkbox"
                          {...register(`correctiveActions.${idx}.done`, {
                            onChange: () => {
                              setValidatedById((s) =>
                                s[id] ? { ...s, [id]: false } : s
                              );
                            },
                          })}
                        />
                        <label
                          htmlFor={`ca_done_${idx}`}
                          className="text-sm font-medium"
                        >
                          Fait
                        </label>
                      </div>

                      <div className={fieldWrap}>
                        <label className={labelCls}>Fait le</label>
                        <input
                          type="datetime-local"
                          {...register(`correctiveActions.${idx}.doneAt`, {
                            onChange: () =>
                              setValidatedById((s) =>
                                s[id] ? { ...s, [id]: false } : s
                              ),
                          })}
                          className={selectCls}
                        />
                      </div>
                    </div>

                    {/* Ligne B : Effectué par + Note */}
                    <div className="grid grid-cols-1 gap-2 midTablet:grid-cols-2">
                      <div className={fieldWrap}>
                        <label className={labelCls}>
                          Effectué par{" "}
                          
                            {(actionInvalid(idx) ||
                              errors?.correctiveActions?.[idx]
                                ?.doneByDisplay) && (
                              <p className="text-xs text-red italic">
                                {errors?.correctiveActions?.[idx]?.doneByDisplay
                                  ?.message ||
                                  "- Veuillez sélectionner un nom dans la liste -"}
                              </p>
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
                              setValue(`correctiveActions.${idx}.doneBy`, "", {
                                shouldDirty: true,
                                shouldValidate: true,
                              });
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
                          {(watch(`correctiveActions.${idx}.doneByDisplay`) ||
                            "") && (
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
                              watch(`correctiveActions.${idx}.doneByDisplay`) ||
                              ""
                            ).trim() !== "" && (
                              <ul
                                className="absolute z-10 left-0 right-0 mt-1 bg-white border rounded shadow max-h-56 overflow-auto"
                                onMouseDown={(e) => e.preventDefault()}
                              >
                                {actionOptionsFor(idx).length === 0 && (
                                  <li className="px-3 py-2 text-sm opacity-70 italic">
                                    Aucun résultat
                                  </li>
                                )}
                                {actionOptionsFor(idx).map((emp) => (
                                  <li
                                    key={emp._id}
                                    onClick={() => pickActionEmployee(idx, emp)}
                                    className={`px-3 py-[8px] cursor-pointer hover:bg-lightGrey ${
                                      (watch(
                                        `correctiveActions.${idx}.doneBy`
                                      ) || "") === emp._id
                                        ? "bg-gray-100"
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
                    <div className="flex justify-between mt-2 gap-2">
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
                        className={`${btnBase} border border-red bg-white text-red hover:border-red/80`}
                      >
                        <Trash2 className="size-4" /> Supprimer la ligne
                      </button>

                      {isOpen && (
                        <button
                          type="button"
                          onClick={() => validateLine(id, idx)}
                          className={`${btnBase} border border-blue bg-blue text-white hover:border-darkBlue/30`}
                          title="Valider la ligne"
                        >
                          Valider la ligne
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Clôture */}
      <div className="grid grid-cols-1 gap-2 midTablet:grid-cols-3">
        <div className="flex items-center gap-2 px-1">
          <input id="closed" type="checkbox" {...register("closed")} />
          <label htmlFor="closed" className="text-sm font-medium">
            Clôturé
          </label>
        </div>
        <div className={`${fieldWrap} px-3 midTablet:col-span-2`}>
          <label className={labelCls}>Clôturé le</label>
          <input
            type="datetime-local"
            {...register("closedAt")}
            className={selectCls}
            disabled={!watch("closed")}
          />
        </div>
      </div>

      {/* Actions form */}
      <div className="flex flex-col gap-2 mobile:flex-row">
        <button
          type="submit"
          disabled={submitDisabled}
          aria-disabled={submitDisabled}
          className={`text-nowrap inline-flex items-center justify-center gap-2 rounded-lg px-4 py-2 text-sm font-medium text-white shadow disabled:opacity-60 ${
            submitDisabled ? "bg-darkBlue/40" : "bg-blue"
          }`}
          title={
            submitDisabled ? "Validez au moins une ligne (Action*)" : undefined
          }
        >
          {isSubmitting ? (
            <>
              <FileText className="size-4 animate-spin" />
              Enregistrement…
            </>
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
              setDetectedQuery("");
              setOpenById({});
              setShowReqErrById({});
              setValidatedById({});
              onCancel?.();
            }}
            className="inline-flex items-center justify-center gap-2 rounded-lg border border-red bg-white px-4 py-2 text-sm font-medium text-red"
          >
            Annuler
          </button>
        )}
      </div>
    </form>
  );
}
