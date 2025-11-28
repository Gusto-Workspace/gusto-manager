// app/(components)/health/training/TrainingForm.jsx
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
import {
  FileText,
  PlusCircle,
  Trash2,
  ChevronDown,
  User2,
  CalendarClock,
  Link as LinkIcon,
  Building2,
} from "lucide-react";
import { GlobalContext } from "@/contexts/global.context";

/* ---------- Utils ---------- */
function toDatetimeLocalDefaultNow(value) {
  const d = value ? new Date(value) : new Date();
  if (Number.isNaN(d.getTime())) return "";
  const off = d.getTimezoneOffset() * 60000;
  return new Date(d.getTime() - off).toISOString().slice(0, 16);
}
function toDatetimeLocalAllowEmpty(value) {
  if (!value) return "";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "";
  const off = d.getTimezoneOffset() * 60000;
  return new Date(d.getTime() - off).toISOString().slice(0, 16);
}
function toDateValue(value) {
  if (!value) return "";
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? "" : d.toISOString().slice(0, 10);
}
const normalize = (s) =>
  (s || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .toLowerCase()
    .trim();

/* ---------- Defaults ---------- */
function buildDefaults(rec) {
  return {
    title: rec?.title ?? "",
    topic: rec?.topic ?? "",
    provider: rec?.provider ?? "",
    date: toDatetimeLocalDefaultNow(rec?.date ?? new Date()),
    durationMinutes:
      typeof rec?.durationMinutes === "number"
        ? String(rec.durationMinutes)
        : "",
    location: rec?.location ?? "",
    materialsUrl: rec?.materialsUrl ?? "",
    validUntil: toDateValue(rec?.validUntil),
    notes: rec?.notes ?? "",
    attendees:
      Array.isArray(rec?.attendees) && rec.attendees.length
        ? rec.attendees.map((a) => ({
            employeeId: a?.employeeId ? String(a.employeeId) : "",
            employeeDisplay: "",
            status: a?.status ?? "attended",
            certificateUrl: a?.certificateUrl ?? "",
            signedAt: toDatetimeLocalAllowEmpty(a?.signedAt),
            notes: a?.notes ?? "",
          }))
        : [
            {
              employeeId: "",
              employeeDisplay: "",
              status: "attended",
              certificateUrl: "",
              signedAt: "",
              notes: "",
            },
          ],
  };
}

/* ---------- Styles (alignés) ---------- */
const fieldWrap =
  "group relative rounded-xl bg-white/50   py-2 min-h-[80px] transition-shadow";
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
const chip =
  "rounded-md bg-darkBlue/10 px-2 py-0.5 text-[11px] text-darkBlue/70";

/* Helpers lignes */
const isLineEmpty = (row) =>
  !(row?.employeeId || row?.employeeDisplay || row?.certificateUrl || row?.signedAt || row?.notes) &&
  (row?.status ?? "attended") === "attended";
const isLineValid = (row) => !!String(row?.employeeId || "").trim();

export default function TrainingForm({
  restaurantId,
  initial = null,
  onSuccess,
  onCancel,
}) {
  const isEdit = !!initial?._id;

  const {
    register,
    handleSubmit,
    reset,
    control,
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
    name: "attendees",
  });

  /* ---------- Employés via GlobalContext ---------- */
  const { restaurantContext } = useContext(GlobalContext);
  const rawEmployees = restaurantContext.restaurantData?.employees || [];

  const allEmployees = useMemo(() => {
    return rawEmployees.map((e) => {
      const full = `${e.firstname ?? e.firstName ?? ""} ${e.lastname ?? e.lastName ?? ""}`.trim();
      return { _id: String(e._id), full: full || e.email || e.phone || String(e._id), nfull: normalize(full) };
    });
  }, [rawEmployees]);

  const idToFull = useMemo(
    () => new Map(allEmployees.map((e) => [e._id, e.full])),
    [allEmployees]
  );

  const exactMap = useMemo(
    () => new Map(allEmployees.map((e) => [e.nfull, e])),
    [allEmployees]
  );

  const searchEmp = useCallback(
    (q, limit = 8) => {
      const n = normalize(q);
      if (!n) return [];
      const out = [];
      for (let i = 0; i < allEmployees.length && out.length < limit; i++) {
        if (allEmployees[i].nfull.includes(n)) out.push(allEmployees[i]);
      }
      return out;
    },
    [allEmployees]
  );

  const findExactByFull = useCallback(
    (txt) => (txt ? exactMap.get(normalize(txt)) || null : null),
    [exactMap]
  );

  /* ---------- Watchers ---------- */
  const attendeesWatch = watch("attendees") || [];
  const selectedIdsAll = attendeesWatch
    .map((r) => String(r?.employeeId || ""))
    .filter(Boolean);

  /* ---------- Dropdown de recherche (par ligne) ---------- */
  const [empDropdownOpen, setEmpDropdownOpen] = useState({});
  const setEmpOpen = (idx, open) =>
    setEmpDropdownOpen((m) => ({ ...m, [idx]: open }));

  const empOptionsFor = (idx) => {
    const q = watch(`attendees.${idx}.employeeDisplay`) || "";
    const currentId = String(watch(`attendees.${idx}.employeeId`) || "");
    const opts = searchEmp(q, 8).filter((e) => {
      if (currentId && e._id === currentId) return true;
      return !selectedIdsAll.includes(e._id);
    });
    return opts;
  };

  const pickEmployee = (idx, emp) => {
    setValue(`attendees.${idx}.employeeId`, emp?._id || "", {
      shouldDirty: true,
      shouldValidate: true,
    });
    setValue(`attendees.${idx}.employeeDisplay`, emp?.full || "", {
      shouldDirty: true,
    });
    clearErrors([
      `attendees.${idx}.employeeId`,
      `attendees.${idx}.employeeDisplay`,
    ]);
    setEmpOpen(idx, false);
  };

  const clearEmployee = (idx) => {
    setValue(`attendees.${idx}.employeeId`, "", {
      shouldDirty: true,
      shouldValidate: true,
    });
    setValue(`attendees.${idx}.employeeDisplay`, "", { shouldDirty: true });
    setEmpOpen(idx, false);
    clearErrors([
      `attendees.${idx}.employeeId`,
      `attendees.${idx}.employeeDisplay`,
    ]);
  };

  const onEmpKeyDown = (idx, e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      const opts = empOptionsFor(idx);
      if (opts.length > 0) pickEmployee(idx, opts[0]);
    } else if (e.key === "Escape") {
      setEmpOpen(idx, false);
    }
  };

  const verifyEmpAtIdx = useCallback(
    (idx) => {
      const txt = (getValues(`attendees.${idx}.employeeDisplay`) || "").trim();
      const id = getValues(`attendees.${idx}.employeeId`) || "";
      if (!txt) return true;
      if (id) return true;
      const exact = findExactByFull(txt);
      if (exact) {
        setValue(`attendees.${idx}.employeeId`, exact._id, {
          shouldDirty: true,
          shouldValidate: true,
        });
        setValue(`attendees.${idx}.employeeDisplay`, exact.full, {
          shouldDirty: true,
        });
        clearErrors([
          `attendees.${idx}.employeeDisplay`,
          `attendees.${idx}.employeeId`,
        ]);
        return true;
      }
      setError(`attendees.${idx}.employeeDisplay`, {
        type: "manual",
        message: "Veuillez sélectionner un nom dans la liste",
      });
      return false;
    },
    [getValues, findExactByFull, setValue, clearErrors, setError]
  );

  const onEmpBlur = (idx) => {
    setTimeout(() => setEmpOpen(idx, false), 120);
    verifyEmpAtIdx(idx);
  };

  const empInvalid = (idx) => {
    const txt = (watch(`attendees.${idx}.employeeDisplay`) || "").trim();
    const id = watch(`attendees.${idx}.employeeId`) || "";
    return !!txt && !id;
  };

  /* ---------- Pliage + validation explicite des lignes ---------- */
  const [openById, setOpenById] = useState({});
  const [showReqErrById, setShowReqErrById] = useState({});
  const [validatedById, setValidatedById] = useState({});
  const openNewLineRef = useRef(false);

  // [CRUCIAL] Reset + préremplissage quand on édite une ligne depuis la liste
  useEffect(() => {
    reset(buildDefaults(initial));

    // pré-remplir les displays depuis les IDs si on a déjà la map
    if (Array.isArray(initial?.attendees)) {
      initial.attendees.forEach((a, idx) => {
        const id = a?.employeeId ? String(a.employeeId) : "";
        const disp = id ? idToFull.get(id) || "" : "";
        setValue(`attendees.${idx}.employeeId`, id, { shouldDirty: false });
        setValue(`attendees.${idx}.employeeDisplay`, disp, {
          shouldDirty: false,
        });
      });
    }

    // reset des états de lignes
    setOpenById({});
    setShowReqErrById({});
    setValidatedById({});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initial, idToFull, allEmployees.length]);

  // Aligne les maps avec les champs existants
  useEffect(() => {
    setOpenById((prev) => {
      const next = { ...prev };
      fields.forEach((f, idx) => {
        if (next[f.id] == null) {
          const row = attendeesWatch[idx] || {};
          next[f.id] = isLineEmpty(row);
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

    setValidatedById((prev) => {
      const next = { ...prev };
      fields.forEach((f, idx) => {
        if (next[f.id] == null) {
          const row = attendeesWatch[idx] || {};
          next[f.id] = isEdit && isLineValid(row) ? true : false;
        }
      });
      for (const k of Object.keys(next)) {
        if (!fields.find((f) => f.id === k)) delete next[k];
      }
      return next;
    });
  }, [fields, attendeesWatch, isEdit]);

  // 1ère ligne ouverte si tout vide
  useEffect(() => {
    if (!fields.length) return;
    const allEmpty = fields.every((_, i) => isLineEmpty(attendeesWatch[i] || {}));
    if (allEmpty) {
      setOpenById((s) => ({ ...s, [fields[0].id]: true }));
    }
  }, [fields, attendeesWatch]);

  // Ouvre la nouvelle ligne juste après append
  useEffect(() => {
    if (!openNewLineRef.current) return;
    const last = fields[fields.length - 1];
    if (last) {
      setOpenById((s) => ({ ...s, [last.id]: true }));
      setTimeout(() => setFocus(`attendees.${fields.length - 1}.employeeDisplay`), 0);
    }
    openNewLineRef.current = false;
  }, [fields, setFocus]);

  // Pré-remplissage display depuis Id si les employés arrivent après
  useEffect(() => {
    (attendeesWatch || []).forEach((r, idx) => {
      const id = r?.employeeId ? String(r.employeeId) : "";
      const disp = id ? idToFull.get(id) || "" : "";
      if (disp && !r?.employeeDisplay) {
        setValue(`attendees.${idx}.employeeDisplay`, disp, { shouldDirty: false });
      }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [idToFull, allEmployees.length]);

  const toggleOpen = (id) =>
    setOpenById((s) => ({ ...s, [id]: !s[id] }));

  const validateLine = (id, idx) => {
    if (!verifyEmpAtIdx(idx)) {
      setShowReqErrById((s) => ({ ...s, [id]: true }));
      setValidatedById((s) => ({ ...s, [id]: false }));
      setOpenById((s) => ({ ...s, [id]: true }));
      setFocus(`attendees.${idx}.employeeDisplay`);
      return;
    }
    const row = attendeesWatch[idx] || {};
    if (!String(row?.employeeId || "").trim()) {
      setShowReqErrById((s) => ({ ...s, [id]: true }));
      setValidatedById((s) => ({ ...s, [id]: false }));
      setOpenById((s) => ({ ...s, [id]: true }));
      setError(`attendees.${idx}.employeeId`, { type: "manual" });
      setFocus(`attendees.${idx}.employeeDisplay`);
      return;
    }
    setShowReqErrById((s) => ({ ...s, [id]: false }));
    setValidatedById((s) => ({ ...s, [id]: true }));
    setOpenById((s) => ({ ...s, [id]: false }));
    clearErrors([`attendees.${idx}.employeeId`, `attendees.${idx}.employeeDisplay`]);
  };

  /* ---------- Soumission ---------- */
  const token = useMemo(
    () =>
      typeof window !== "undefined" ? localStorage.getItem("token") : null,
    []
  );

  const onSubmit = async (data) => {
    if (!token) return;

    for (let i = 0; i < (data.attendees || []).length; i++) {
      const fid = fields[i]?.id;
      if (!fid || !validatedById[fid]) continue;
      if (!verifyEmpAtIdx(i)) return;
    }

    const seen = new Set();
    for (let i = 0; i < (data.attendees || []).length; i++) {
      const id = String(data.attendees[i]?.employeeId || "");
      if (!id) continue;
      if (seen.has(id)) {
        setError(`attendees.${i}.employeeDisplay`, {
          type: "manual",
          message: "Employé déjà sélectionné pour cette formation",
        });
        return;
      }
      seen.add(id);
    }
    clearErrors();

    const rows = Array.isArray(data.attendees) ? data.attendees : [];
    const attendees = rows
      .map((a) => {
        const status = a.status || "attended";
        const isAbsent = status === "absent";
        return {
          employeeId: a.employeeId || undefined,
          status,
          certificateUrl: isAbsent ? undefined : a.certificateUrl || undefined,
          signedAt: isAbsent ? null : a.signedAt ? new Date(a.signedAt) : null,
          notes: a.notes || undefined,
        };
      })
      .filter((_, i) => {
        const fid = fields[i]?.id;
        return fid && validatedById[fid];
      })
      .filter((x) => x.employeeId);

    if (!attendees.length) return;

    const payload = {
      title: data.title,
      topic: data.topic || undefined,
      provider: data.provider || undefined,
      date: data.date ? new Date(data.date) : new Date(),
      durationMinutes:
        data.durationMinutes !== "" && data.durationMinutes != null
          ? Number(data.durationMinutes)
          : undefined,
      location: data.location || undefined,
      materialsUrl: data.materialsUrl || undefined,
      validUntil: data.validUntil ? new Date(data.validUntil) : null,
      notes: data.notes || undefined,
      attendees,
    };

    const url = isEdit
      ? `${process.env.NEXT_PUBLIC_API_URL}/restaurants/${restaurantId}/training-sessions/${initial._id}`
      : `${process.env.NEXT_PUBLIC_API_URL}/restaurants/${restaurantId}/training-sessions`;
    const method = isEdit ? "put" : "post";

    const { data: saved } = await axios[method](url, payload, {
      headers: { Authorization: `Bearer ${token}` },
    });

    window.dispatchEvent(
      new CustomEvent("training-sessions:upsert", { detail: { doc: saved } })
    );

    reset(buildDefaults(null));
    setOpenById({});
    setShowReqErrById({});
    setValidatedById({});
    onSuccess?.(saved);
  };

  /* ---------- Boutons ---------- */
  const hasValidatedLine =
    Array.isArray(fields) && fields.some((f) => validatedById[f.id]);
  const submitDisabled = isSubmitting || !hasValidatedLine;
  const lastField = fields.length ? fields[fields.length - 1] : null;
  const addDisabled =
    lastField ? !validatedById[lastField.id] : false ||
    (allEmployees.length > 0 && selectedIdsAll.length >= allEmployees.length);

  /* ---------- Render ---------- */
  return (
    <form onSubmit={handleSubmit(onSubmit)} className="relative flex flex-col gap-2">
      {/* Ligne 1 : Intitulé / Thème */}
      <div className="grid grid-cols-1 gap-2 midTablet:grid-cols-2">
        <div className={`${fieldWrap} px-3`}>
          <label className={labelCls}>
            <FileText className="size-4" /> Intitulé *
          </label>
          <input
            type="text"
            {...register("title", { required: true })}
            className={`${inputCls} ${errors.title ? "border-red focus:ring-red/20" : ""}`}
            placeholder='ex: "Formation Hygiène HACCP"'
            autoComplete="off"
            spellCheck={false}
          />
        </div>

        <div className={`${fieldWrap} px-3`}>
          <label className={labelCls}>
            <Building2 className="size-4" /> Thème
          </label>
          <input
            type="text"
            {...register("topic")}
            className={inputCls}
            placeholder='ex: "Allergènes"'
            autoComplete="off"
            spellCheck={false}
          />
        </div>
      </div>

      {/* Ligne 2 : Date / Durée / Fournisseur */}
      <div className="grid grid-cols-1 gap-2 midTablet:grid-cols-3">
        <div className={`${fieldWrap} px-3`}>
          <label className={labelCls}>
            <CalendarClock className="size-4" /> Date *
          </label>
          <input
            type="datetime-local"
            {...register("date", { required: true })}
            className={`${selectCls} ${errors.date ? "border-red focus:ring-red/20" : ""}`}
          />
        </div>

        <div className={`${fieldWrap} px-3`}>
          <label className={labelCls}>Durée (min)</label>
          <input
            type="number"
            step="1"
            onWheel={(e) => e.currentTarget.blur()}
            min="0"
            {...register("durationMinutes", {
              validate: (v) =>
                v === "" ||
                (Number.isFinite(Number(v)) && Number(v) >= 0) ||
                "Invalide",
            })}
            className={`${inputCls} ${errors.durationMinutes ? "border-red focus:ring-red/20" : ""}`}
          />
          {errors.durationMinutes?.message && (
            <p className="text-xs text-red mt-1">{errors.durationMinutes.message}</p>
          )}
        </div>

        <div className={`${fieldWrap} px-3`}>
          <label className={labelCls}>Fournisseur</label>
          <input
            type="text"
            {...register("provider")}
            className={inputCls}
            placeholder="ex: Acme Training"
            autoComplete="off"
            spellCheck={false}
          />
        </div>
      </div>

      {/* Ligne 3 : Lieu / Supports */}
      <div className="grid grid-cols-1 gap-2 midTablet:grid-cols-2">
        <div className={`${fieldWrap} px-3`}>
          <label className={labelCls}>Lieu</label>
          <input
            type="text"
            {...register("location")}
            className={inputCls}
            placeholder="Salle de réunion, visio…"
            autoComplete="off"
            spellCheck={false}
          />
        </div>

        <div className={`${fieldWrap} px-3`}>
          <label className={labelCls}>
            <LinkIcon className="size-4" /> Supports (URL)
          </label>
          <input
            type="url"
            {...register("materialsUrl")}
            className={inputCls}
            placeholder="https://…/supports.pdf"
            autoComplete="off"
            spellCheck={false}
          />
        </div>
      </div>

      {/* Ligne 4 : Validité */}
      <div className="grid grid-cols-1 gap-2 midTablet:grid-cols-3">
        <div className={`${fieldWrap} px-3`}>
          <label className={labelCls}>Validité jusqu’au</label>
          <input type="date" {...register("validUntil")} className={selectCls} />
        </div>
      </div>

      {/* Participants */}
      <div className="rounded-2xl bg-white/50 p-3 pb-0 mt-3">
        <div className="mb-3 flex items-center justify-between">
          <h3 className="text-sm font-semibold text-darkBlue flex items-center gap-2">
            <User2 className="size-4" /> Participants
          </h3>

          <button
            type="button"
            disabled={addDisabled}
            aria-disabled={addDisabled}
            onClick={() => {
              if (addDisabled) return;
              openNewLineRef.current = true;
              append({
                employeeId: "",
                employeeDisplay: "",
                status: "attended",
                certificateUrl: "",
                signedAt: "",
                notes: "",
              });
            }}
            className={`${btnBase} border border-violet/20 bg-white text-violet hover:bg-violet/5 disabled:opacity-60 disabled:cursor-not-allowed`}
            title={
              addDisabled
                ? "Validez la ligne précédente ou tous les employés sont déjà sélectionnés"
                : undefined
            }
          >
            <PlusCircle className="size-4" /> Ajouter un participant
          </button>
        </div>

        <div className="space-y-3 mb-3">
          {fields.map((f, idx) => {
            const id = f.id;
            const row = attendeesWatch[idx] || {};
            const isOpen = !!openById[id];
            const showReq =
              (!!showReqErrById[id] && !String(row?.employeeId || "").trim()) ||
              !!errors?.attendees?.[idx]?.employeeDisplay ||
              !!errors?.attendees?.[idx]?.employeeId;
            const isAbsent = (row?.status || "attended") === "absent";

            const summary = (
              <div className="flex flex-wrap items-center justify-end gap-1">
                {!!row?.employeeId && (
                  <span className={chip}>
                    {idToFull.get(String(row.employeeId)) || "Participant"}
                  </span>
                )}
                <span className={chip}>{isAbsent ? "Absent" : "Présent"}</span>
                {!!row?.signedAt && !isAbsent && (
                  <span className={chip}>
                    {new Date(row.signedAt).toLocaleString("fr-FR", {
                      day: "2-digit",
                      month: "2-digit",
                      year: "2-digit",
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </span>
                )}
                {!!row?.certificateUrl && !isAbsent && (
                  <span className={chip}>Certificat</span>
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
                      className={`size-4 shrink-0 transition-transform ${isOpen ? "rotate-180" : ""}`}
                    />
                    <div className="flex flex-col">
                      <span className="text-sm font-medium text-darkBlue">
                        {row?.employeeId
                          ? idToFull.get(String(row.employeeId)) || "Participant"
                          : "Nouveau participant"}
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

                {/* Contenu collapsible */}
                <div
                  className={`grid transition-[grid-template-rows] duration-300 ease-in-out ${
                    isOpen ? "grid-rows-[1fr]" : "grid-rows-[0fr]"
                  }`}
                >
                  <div className="overflow-hidden">
                    <div className="p-3 border-t border-darkBlue/10">
                      {/* Ligne A : Employé + Statut */}
                      <div className="grid grid-cols-1 gap-2 midTablet:grid-cols-2">
                        <div className={`${fieldWrap} ${empDropdownOpen[idx] ? "z-20" : ""}`}>
                          <label className={labelCls}>
                            Employé *
                            {(empInvalid(idx) || showReq) && (
                              <span className="text-xs hidden mobile:block text-red italic">
                                &nbsp;— Veuillez sélectionner un nom dans la liste —
                              </span>
                            )}
                          </label>
                          <div className="relative">
                            <input
                              type="text"
                              {...register(`attendees.${idx}.employeeDisplay`)}
                              autoComplete="off"
                              spellCheck={false}
                              autoCorrect="off"
                              onFocus={() => setEmpOpen(idx, true)}
                              onBlur={() => onEmpBlur(idx)}
                              onChange={(e) => {
                                setValue(
                                  `attendees.${idx}.employeeDisplay`,
                                  e.target.value,
                                  { shouldDirty: true }
                                );
                                setEmpOpen(idx, true);
                                setValue(`attendees.${idx}.employeeId`, "", {
                                  shouldDirty: true,
                                  shouldValidate: true,
                                });
                                setValidatedById((s) =>
                                  s[id] ? { ...s, [id]: false } : s
                                );
                              }}
                              onKeyDown={(e) => onEmpKeyDown(idx, e)}
                              className={`${inputCls} pr-8 ${
                                empInvalid(idx) || showReq
                                  ? "border-red focus:ring-red/20"
                                  : ""
                              }`}
                              placeholder="Rechercher un employé…"
                            />
                            {(watch(`attendees.${idx}.employeeDisplay`) || "") && (
                              <button
                                type="button"
                                onMouseDown={(e) => e.preventDefault()}
                                onClick={() => clearEmployee(idx)}
                                className="absolute right-2 top-1/2 -translate-y-1/2 w-6 h-6 bg-black/30 text-white rounded-full flex items-center justify-center"
                                title="Effacer"
                              >
                                &times;
                              </button>
                            )}

                            {empDropdownOpen[idx] &&
                              (watch(`attendees.${idx}.employeeDisplay`) || "")
                                .trim() !== "" && (
                                <ul
                                  className="absolute z-50 left-0 right-0 top-full mt-1 bg-white border border-darkBlue/20 rounded shadow max-h-56 overflow-auto"
                                  onMouseDown={(e) => e.preventDefault()}
                                >
                                  {empOptionsFor(idx).length === 0 && (
                                    <li className="px-3 py-2 text-sm text-darkBlue/50 italic">
                                      Aucun résultat
                                    </li>
                                  )}
                                  {empOptionsFor(idx).map((emp) => (
                                    <li
                                      key={emp._id}
                                      onClick={() => pickEmployee(idx, emp)}
                                      className={`px-3 py-[8px] cursor-pointer text-darkBlue/70 text-sm border-b border-b-darkBlue/10 last:border-none hover:bg-lightGrey ${
                                        (watch(`attendees.${idx}.employeeId`) ||
                                          "") === emp._id
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
                            {...register(`attendees.${idx}.employeeId`)}
                          />
                        </div>

                        <div className={fieldWrap}>
                          <label className={labelCls}>Statut</label>
                          <select
                            {...register(`attendees.${idx}.status`, {
                              onChange: (e) => {
                                const absent = e.target.value === "absent";
                                setValue(`attendees.${idx}.status`, e.target.value, {
                                  shouldDirty: true,
                                });
                                setValue(
                                  `attendees.${idx}.certificateUrl`,
                                  absent ? "" : getValues(`attendees.${idx}.certificateUrl`) || "",
                                  { shouldDirty: true }
                                );
                                setValue(
                                  `attendees.${idx}.signedAt`,
                                  absent ? "" : getValues(`attendees.${idx}.signedAt`) || "",
                                  { shouldDirty: true }
                                );
                                setValidatedById((s) =>
                                  s[id] ? { ...s, [id]: false } : s
                                );
                              },
                            })}
                            className={selectCls}
                          >
                            <option value="attended">Présent</option>
                            <option value="absent">Absent</option>
                          </select>
                        </div>
                      </div>

                      {/* Ligne B : Certificat + Signé le */}
                      <div className="grid grid-cols-1 gap-2 midTablet:grid-cols-2">
                        <div className={fieldWrap}>
                          <label className={labelCls}>
                            <LinkIcon className="size-4" /> Certificat (URL)
                          </label>
                          <input
                            type="url"
                            {...register(`attendees.${idx}.certificateUrl`, {
                              onChange: () =>
                                setValidatedById((s) =>
                                  s[id] ? { ...s, [id]: false } : s
                                ),
                            })}
                            disabled={isAbsent}
                            className={`${inputCls} ${
                              isAbsent ? "opacity-60 cursor-not-allowed" : ""
                            }`}
                            placeholder="https://…/certificat.pdf"
                            autoComplete="off"
                            spellCheck={false}
                          />
                        </div>

                        <div className={fieldWrap}>
                          <label className={labelCls}>
                            <CalendarClock className="size-4" /> Signé le
                          </label>
                          <input
                            type="datetime-local"
                            {...register(`attendees.${idx}.signedAt`, {
                              onChange: () =>
                                setValidatedById((s) =>
                                  s[id] ? { ...s, [id]: false } : s
                                ),
                            })}
                            disabled={isAbsent}
                            className={`${selectCls} ${
                              isAbsent ? "opacity-60 cursor-not-allowed" : ""
                            }`}
                          />
                        </div>
                      </div>

                      {/* Ligne C : Notes */}
                      <div className="grid grid-cols-1 gap-2 midTablet:grid-cols-3">
                        <div className={`${fieldWrap} midTablet:col-span-2`}>
                          <label className={labelCls}>Notes</label>
                          <input
                            type="text"
                            {...register(`attendees.${idx}.notes`, {
                              onChange: () =>
                                setValidatedById((s) =>
                                  s[id] ? { ...s, [id]: false } : s
                                ),
                            })}
                            className={inputCls}
                            autoComplete="off"
                            spellCheck={false}
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

      {/* Notes globales */}
      <div className="grid grid-cols-1">
        <div className={`${fieldWrap} px-3 h-auto`}>
          <label className={labelCls}>
            <FileText className="size-4" /> Notes (session)
          </label>
          <textarea
            rows={4}
            {...register("notes")}
            className={`${textareaCls} min-h-[96px]`}
            placeholder="Observations complémentaires…"
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
            submitDisabled ? "bg-darkBlue/40 border border-darkBlue/10" : "bg-blue border border-blue"
          }`}
          title={
            submitDisabled ? "Validez au moins une ligne (Employé*)" : undefined
          }
        >
          {isSubmitting ? (
            <>
              <FileText className="size-4 animate-spin" />
              Enregistrement…
            </>
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
