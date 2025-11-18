// app/(components)/health/PestControlForm.jsx
"use client";
import { useEffect, useRef, useState } from "react";
import { useForm, useFieldArray } from "react-hook-form";
import axios from "axios";
import {
  FileText,
  Link as LinkIcon,
  PlusCircle,
  Trash2,
  Loader2,
  ChevronDown,
  CalendarClock,
  RefreshCcw,
  UserRound,
  Phone,
  Mail,
  Hash,
  Package as PackageIcon,
  Bug,
  Activity,
  ShieldCheck,
  MapPin,
  AlertTriangle,
  ListChecks,
  Wrench,
} from "lucide-react";

/* ---------- Utils ---------- */
function toDateValue(value) {
  if (!value) return "";
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? "" : d.toISOString().slice(0, 10);
}
function toDatetimeLocal(value) {
  if (!value) return "";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "";
  const off = d.getTimezoneOffset() * 60000;
  return new Date(d.getTime() - off).toISOString().slice(0, 16);
}
const fmtDateTime = (d) => {
  try {
    if (!d) return "";
    const date = new Date(d);
    return new Intl.DateTimeFormat("fr-FR", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    }).format(date);
  } catch {
    return d || "";
  }
};

/* ---------- Labels FR ---------- */
const SEVERITY_LABELS = {
  none: "Nulle",
  low: "Faible",
  medium: "Moyenne",
  high: "Forte",
};

function buildDefaults(rec) {
  return {
    provider: rec?.provider ?? "",
    providerId: rec?.providerId ? String(rec.providerId) : "",
    providerContactName: rec?.providerContactName ?? "",
    providerPhone: rec?.providerPhone ?? "",
    providerEmail: rec?.providerEmail ?? "",

    contractStart: toDateValue(rec?.contractStart),
    contractEnd: toDateValue(rec?.contractEnd),
    visitFrequency: rec?.visitFrequency ?? "monthly",

    baitStationsCount:
      rec?.baitStationsCount !== undefined && rec?.baitStationsCount !== null
        ? String(rec.baitStationsCount)
        : "",
    trapsCount:
      rec?.trapsCount !== undefined && rec?.trapsCount !== null
        ? String(rec.trapsCount)
        : "",

    lastVisitAt: toDatetimeLocal(rec?.lastVisitAt),
    nextPlannedVisit: toDatetimeLocal(rec?.nextPlannedVisit),

    activityLevel: rec?.activityLevel ?? "none",
    complianceStatus: rec?.complianceStatus ?? "pending",

    reportUrlsText: Array.isArray(rec?.reportUrls)
      ? rec.reportUrls.join("\n")
      : "",
    notes: rec?.notes ?? "",

    actions:
      Array.isArray(rec?.actions) && rec.actions.length
        ? rec.actions.map((a) => ({
            date: toDatetimeLocal(a?.date),
            action: a?.action ?? "",
            technician: a?.technician ?? "",
            zone: a?.zone ?? "",
            severity: a?.severity ?? "none",
            findings: a?.findings ?? "",
            baitRefilled:
              a?.baitRefilled !== undefined && a?.baitRefilled !== null
                ? String(a.baitRefilled)
                : "",
            proofUrlsText: Array.isArray(a?.proofUrls)
              ? a.proofUrls.join("\n")
              : "",
            notes: a?.notes ?? "",
          }))
        : [
            {
              date: "",
              action: "",
              technician: "",
              zone: "",
              severity: "none",
              findings: "",
              baitRefilled: "",
              proofUrlsText: "",
              notes: "",
            },
          ],
  };
}

/* ---------- Helpers lignes ---------- */
const isLineEmpty = (row) => {
  const sevEmpty = !row?.severity || row.severity === "none";
  const proofEmpty = !(
    typeof row?.proofUrlsText === "string" &&
    row.proofUrlsText.trim().length > 0
  );
  const notesEmpty = !(
    typeof row?.notes === "string" && row.notes.trim().length > 0
  );
  const baitEmpty = row?.baitRefilled === "" || row?.baitRefilled == null;

  return (
    !row?.date &&
    !row?.action?.trim() &&
    !row?.technician?.trim() &&
    !row?.zone?.trim() &&
    sevEmpty &&
    !row?.findings?.trim() &&
    baitEmpty &&
    proofEmpty &&
    notesEmpty
  );
};
const missingDate = (row) => !row?.date;
const missingAction = (row) => !row?.action?.trim();
const missingZone = (row) => !row?.zone?.trim();
const isLineValidatedByFields = (row) =>
  !!row?.date && !!row?.action?.trim() && !!row?.zone?.trim();

/* ---------- Styles (alignés) ---------- */
const fieldWrap =
  "group relative rounded-xl bg-white/50   py-2 h-[80px] transition-shadow";
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

export default function PestControlForm({
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
    setFocus,
    watch,
    formState: { errors, isSubmitting },
  } = useForm({ defaultValues: buildDefaults(initial) });

  const { fields, append, remove } = useFieldArray({
    control,
    name: "actions",
  });
  const actions = watch("actions");

  /* -------- Pliage + états de validation -------- */
  const [openById, setOpenById] = useState({});
  const contentRefs = useRef({});
  const openNewLineRef = useRef(false);

  const [showReqErrById, setShowReqErrById] = useState({});
  const [validatedById, setValidatedById] = useState({});

  useEffect(() => {
    reset(buildDefaults(initial));
    setShowReqErrById({});
    setValidatedById({});
  }, [initial, reset]);

  useEffect(() => {
    setOpenById((prev) => {
      const next = { ...prev };
      fields.forEach((f, idx) => {
        if (next[f.id] == null) {
          const l = (actions && actions[idx]) || {};
          next[f.id] = isLineEmpty(l); // lignes vides => ouvertes
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
          const row = (actions && actions[idx]) || {};
          next[f.id] = isEdit && isLineValidatedByFields(row) ? true : false;
        }
      });
      for (const k of Object.keys(next)) {
        if (!fields.find((f) => f.id === k)) delete next[k];
      }
      return next;
    });
  }, [fields, actions, isEdit]);

  // 1ʳᵉ ligne ouverte si tout vide (et focus)
  useEffect(() => {
    if (!fields.length) return;
    const allEmpty =
      fields.length > 0 &&
      fields.every((f, i) => isLineEmpty((actions && actions[i]) || {}));
    if (allEmpty) {
      setOpenById((s) => ({ ...s, [fields[0].id]: true }));
      setTimeout(() => setFocus(`provider`), 0);
    }
  }, [fields, actions, setFocus]);

  // Ouvre la nouvelle ligne juste après append
  useEffect(() => {
    if (!openNewLineRef.current) return;
    const last = fields[fields.length - 1];
    if (last) {
      setOpenById((s) => ({ ...s, [last.id]: true }));
      setTimeout(() => setFocus(`actions.${fields.length - 1}.date`), 0);
    }
    openNewLineRef.current = false;
  }, [fields, setFocus]);

  const toggleOpen = (id) => setOpenById((s) => ({ ...s, [id]: !s[id] }));

  const validateLine = (id, idx) => {
    const row = (actions && actions[idx]) || {};
    const needDate = missingDate(row);
    const needAction = missingAction(row);
    const needZone = missingZone(row);

    if (needDate || needAction || needZone) {
      setShowReqErrById((s) => ({ ...s, [id]: true }));
      setValidatedById((s) => ({ ...s, [id]: false }));
      setOpenById((s) => ({ ...s, [id]: true }));

      const firstMissing =
        (needDate && `actions.${idx}.date`) ||
        (needAction && `actions.${idx}.action`) ||
        (needZone && `actions.${idx}.zone`) ||
        null;
      if (firstMissing) setFocus(firstMissing);
      return;
    }
    setShowReqErrById((s) => ({ ...s, [id]: false }));
    setValidatedById((s) => ({ ...s, [id]: true }));
    setOpenById((s) => ({ ...s, [id]: false }));
  };

  /* -------- Submit -------- */
  const onSubmit = async (data) => {
    const token = localStorage.getItem("token");
    if (!token) return;

    const reportUrls =
      typeof data.reportUrlsText === "string" &&
      data.reportUrlsText.trim().length
        ? data.reportUrlsText
            .split(/[\n,;]+/g)
            .map((s) => s.trim())
            .filter(Boolean)
        : [];

    const payloadActions = [];
    (Array.isArray(data.actions) ? data.actions : []).forEach((a, idx) => {
      const fid = fields[idx]?.id;
      if (!fid || !validatedById[fid]) return;

      payloadActions.push({
        date: a.date ? new Date(a.date) : undefined,
        action: a.action || undefined,
        technician: a.technician || undefined,
        zone: a.zone || undefined,
        severity: a.severity || "none",
        findings: a.findings || undefined,
        baitRefilled:
          a.baitRefilled !== "" && a.baitRefilled != null
            ? Number(a.baitRefilled)
            : undefined,
        proofUrls:
          typeof a.proofUrlsText === "string" && a.proofUrlsText.trim().length
            ? a.proofUrlsText
                .split(/[\n,;]+/g)
                .map((s) => s.trim())
                .filter(Boolean)
            : [],
        notes: a.notes || undefined,
      });
    });

    const payload = {
      provider: data.provider || undefined,
      providerId: data.providerId || undefined,
      providerContactName: data.providerContactName || undefined,
      providerPhone: data.providerPhone || undefined,
      providerEmail: data.providerEmail || undefined,

      contractStart: data.contractStart
        ? new Date(data.contractStart)
        : undefined,
      contractEnd: data.contractEnd ? new Date(data.contractEnd) : undefined,
      visitFrequency: data.visitFrequency || "monthly",

      baitStationsCount:
        data.baitStationsCount !== "" && data.baitStationsCount != null
          ? Number(data.baitStationsCount)
          : undefined,
      trapsCount:
        data.trapsCount !== "" && data.trapsCount != null
          ? Number(data.trapsCount)
          : undefined,

      lastVisitAt: data.lastVisitAt ? new Date(data.lastVisitAt) : undefined,
      nextPlannedVisit: data.nextPlannedVisit
        ? new Date(data.nextPlannedVisit)
        : undefined,

      activityLevel: data.activityLevel || "none",
      complianceStatus: data.complianceStatus || "pending",

      reportUrls,
      notes: data.notes || undefined,

      actions: payloadActions,
    };

    const url = initial?._id
      ? `${process.env.NEXT_PUBLIC_API_URL}/restaurants/${restaurantId}/pest-controls/${initial._id}`
      : `${process.env.NEXT_PUBLIC_API_URL}/restaurants/${restaurantId}/pest-controls`;
    const method = initial?._id ? "put" : "post";

    const { data: saved } = await axios[method](url, payload, {
      headers: { Authorization: `Bearer ${token}` },
    });

    window.dispatchEvent(
      new CustomEvent("pest-control:upsert", { detail: { doc: saved } })
    );

    reset(buildDefaults(null));
    setShowReqErrById({});
    setValidatedById({});
    onSuccess?.(saved);
  };

  // Bouton Enregistrer désactivé tant qu’aucune ligne validée explicitement
  const hasValidatedLine =
    Array.isArray(fields) && fields.some((f) => validatedById[f.id]);
  const submitDisabled = isSubmitting || !hasValidatedLine;

  // Désactiver "Ajouter une action" si la dernière ligne n'a PAS été validée explicitement
  const lastField = fields.length ? fields[fields.length - 1] : null;
  const addDisabled = lastField ? !validatedById[lastField.id] : false;

  return (
    <form
      onSubmit={handleSubmit(onSubmit)}
      className="relative flex flex-col gap-2"
    >
      {/* Ligne 1 : Prestataire / Fréquence */}
      <div className="grid grid-cols-1 gap-2 midTablet:grid-cols-2">
        <div className={`${fieldWrap} px-3`}>
          <label className={labelCls}>
            <UserRound className="size-4" /> Prestataire *
          </label>
          <input
            type="text"
            {...register("provider", { required: true })}
            className={`${inputCls} ${errors.provider ? "border-red focus:ring-red/20" : ""}`}
            placeholder="Nom du prestataire"
            autoComplete="off"
            spellCheck={false}
          />
        </div>

        <div className={`${fieldWrap} px-3`}>
          <label className={labelCls}>
            <RefreshCcw className="size-4" /> Fréquence
          </label>
          <select {...register("visitFrequency")} className={selectCls}>
            <option value="monthly">Mensuelle</option>
            <option value="bimonthly">Bimestrielle</option>
            <option value="quarterly">Trimestrielle</option>
            <option value="semester">Semestrielle</option>
            <option value="yearly">Annuelle</option>
            <option value="on_demand">À la demande</option>
          </select>
        </div>
      </div>

      {/* Ligne 2 : Début & Fin contrat */}
      <div className="grid grid-cols-1 gap-2 midTablet:grid-cols-2">
        <div className={`${fieldWrap} px-3`}>
          <label className={labelCls}>
            <CalendarClock className="size-4" /> Début contrat
          </label>
          <input
            type="date"
            {...register("contractStart")}
            className={selectCls}
          />
        </div>

        <div className={`${fieldWrap} px-3`}>
          <label className={labelCls}>
            <CalendarClock className="size-4" /> Fin contrat
          </label>
          <input
            type="date"
            {...register("contractEnd")}
            className={selectCls}
          />
        </div>
      </div>

      {/* Ligne 3 : contacts & ID prestataire */}
      <div className="grid grid-cols-1 gap-2 midTablet:grid-cols-4">
        <div className={`${fieldWrap} px-3`}>
          <label className={labelCls}>
            <UserRound className="size-4" /> Contact
          </label>
          <input
            type="text"
            {...register("providerContactName")}
            className={inputCls}
            autoComplete="off"
            spellCheck={false}
          />
        </div>
        <div className={`${fieldWrap} px-3`}>
          <label className={labelCls}>
            <Phone className="size-4" /> Téléphone
          </label>
          <input
            type="text"
            {...register("providerPhone")}
            className={inputCls}
            autoComplete="off"
            spellCheck={false}
          />
        </div>
        <div className={`${fieldWrap} px-3`}>
          <label className={labelCls}>
            <Mail className="size-4" /> Email
          </label>
          <input
            type="email"
            {...register("providerEmail")}
            className={inputCls}
            autoComplete="off"
            spellCheck={false}
          />
        </div>
        <div className={`${fieldWrap} px-3`}>
          <label className={labelCls}>
            <Hash className="size-4" /> ID Prestataire
          </label>
          <input
            type="text"
            {...register("providerId")}
            className={inputCls}
            autoComplete="off"
            spellCheck={false}
          />
        </div>
      </div>

      {/* Ligne 4 : parc & statut */}
      <div className="grid grid-cols-1 gap-2 midTablet:grid-cols-4">
        <div className={`${fieldWrap} px-3`}>
          <label className={labelCls}>
            <PackageIcon className="size-4" /> Postes appâts
          </label>
          <input
            type="number"
            {...register("baitStationsCount")}
            className={inputCls}
          />
        </div>
        <div className={`${fieldWrap} px-3`}>
          <label className={labelCls}>
            <Bug className="size-4" /> Pièges
          </label>
          <input
            type="number"
            {...register("trapsCount")}
            className={inputCls}
            onWheel={(e) => e.currentTarget.blur()}
          />
        </div>
        <div className={`${fieldWrap} px-3`}>
          <label className={labelCls}>
            <Activity className="size-4" /> Niveau activité
          </label>
          <select {...register("activityLevel")} className={selectCls}>
            <option value="none">Nulle</option>
            <option value="low">Faible</option>
            <option value="medium">Moyenne</option>
            <option value="high">Forte</option>
          </select>
        </div>
        <div className={`${fieldWrap} px-3`}>
          <label className={labelCls}>
            <ShieldCheck className="size-4" /> Conformité
          </label>
          <select {...register("complianceStatus")} className={selectCls}>
            <option value="pending">En attente</option>
            <option value="compliant">Conforme</option>
            <option value="non_compliant">Non conforme</option>
          </select>
        </div>
      </div>

      {/* Dates visites */}
      <div className="grid grid-cols-1 gap-2 midTablet:grid-cols-2">
        <div className={`${fieldWrap} px-3`}>
          <label className={labelCls}>
            <CalendarClock className="size-4" /> Dernière visite
          </label>
          <input
            type="datetime-local"
            {...register("lastVisitAt")}
            className={selectCls}
          />
        </div>
        <div className={`${fieldWrap} px-3`}>
          <label className={labelCls}>
            <CalendarClock className="size-4" /> Prochaine prévue
          </label>
          <input
            type="datetime-local"
            {...register("nextPlannedVisit")}
            className={selectCls}
          />
        </div>
      </div>

      {/* Rapports / Notes */}
      <div className="grid grid-cols-1 gap-2 midTablet:grid-cols-2">
        <div className={`${fieldWrap} px-3 h-auto`}>
          <label className={labelCls}>
            <LinkIcon className="size-4" /> Rapports (URLs, 1 par ligne)
          </label>
          <textarea
            rows={4}
            {...register("reportUrlsText")}
            className="w-full resize-none rounded-lg border border-darkBlue/20 bg-white p-[10px] pr-16 text-[15px] outline-none transition placeholder:text-darkBlue/40 min-h-[96px]"
            placeholder={
              "https://…/rapport-janvier.pdf\nhttps://…/rapport-mars.pdf"
            }
          />
        </div>
        <div className={`${fieldWrap} px-3 h-auto`}>
          <label className={labelCls}>
            <FileText className="size-4" /> Notes
          </label>
          <textarea
            rows={4}
            {...register("notes")}
            className="w-full resize-none rounded-lg border border-darkBlue/20 bg-white p-[10px] pr-16 text-[15px] outline-none transition min-h-[96px]"
          />
        </div>
      </div>

      {/* Journal d’intervention */}
      <div className="rounded-2xl bg-white/50 p-3 pb-0">
        <div className="mb-3 flex items-center justify_between gap-2 justify-between">
          <h3 className="text-sm font-semibold text-darkBlue flex items-center gap-2">
            <ListChecks className="size-4" /> Journal d’intervention
          </h3>

          <button
            type="button"
            disabled={addDisabled}
            aria-disabled={addDisabled}
            onClick={() => {
              if (addDisabled) return;
              openNewLineRef.current = true;
              append({
                date: "",
                action: "",
                technician: "",
                zone: "",
                severity: "none",
                findings: "",
                baitRefilled: "",
                proofUrlsText: "",
                notes: "",
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
            const row = (actions && actions[idx]) || {};

            const needDate = missingDate(row);
            const needAction = missingAction(row);
            const needZone = missingZone(row);

            const showErr = !!showReqErrById[id];
            const hasDateErr = showErr && needDate;
            const hasActionErr = showErr && needAction;
            const hasZoneErr = showErr && needZone;

            const severityLabel =
              row?.severity && row.severity !== "none"
                ? SEVERITY_LABELS[row.severity] ?? row.severity
                : null;

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
                      className={`size-4 shrink-0 transition-transform ${isOpen ? "rotate-180" : ""}`}
                    />
                    <div className="flex flex-col">
                      <span className="text-sm font-medium text-darkBlue">
                        {row?.action?.trim() || "Nouvelle action"}
                      </span>
                      {!isOpen && (
                        <span className="text-[11px] text-darkBlue/60">
                          {row?.date ? fmtDateTime(row.date) : "Aucune date"}
                          {row?.zone ? ` • ${row.zone}` : ""}
                          {severityLabel
                            ? ` • Gravité: ${severityLabel}`
                            : ""}
                          {row?.baitRefilled
                            ? ` • Appâts: ${row.baitRefilled}`
                            : ""}
                        </span>
                      )}
                    </div>
                  </button>

                  {/* Résumé compact quand replié */}
                  <div className="flex flex_wrap items-center justify-end gap-1 flex-wrap">
                    {!!row?.date && (
                      <span className={chip}>{fmtDateTime(row.date)}</span>
                    )}
                    {!!row?.zone && <span className={chip}>{row.zone}</span>}
                    {severityLabel && (
                      <span className={chip}>Gravité {severityLabel}</span>
                    )}
                    {!!row?.baitRefilled && (
                      <span className={chip}>Appâts {row.baitRefilled}</span>
                    )}
                  </div>
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
                    {/* Ligne 1 */}
                    <div className="grid grid-cols-1 gap-2 midTablet:grid-cols-3">
                      <div className={fieldWrap}>
                        <label className={labelCls}>
                          <CalendarClock className="size-4" /> Date *
                        </label>
                        <input
                          type="datetime-local"
                          {...register(`actions.${idx}.date`, {
                            onChange: () =>
                              setValidatedById((s) =>
                                s[id] ? { ...s, [id]: false } : s
                              ),
                          })}
                          className={`${inputCls} ${hasDateErr ? "border-red focus:ring-red/20" : ""}`}
                          aria-invalid={hasDateErr ? "true" : "false"}
                        />
                      </div>

                      <div className={`midTablet:col-span-2 ${fieldWrap}`}>
                        <label className={labelCls}>
                          <Wrench className="size-4" /> Action *
                        </label>
                        <input
                          type="text"
                          placeholder="Inspection / Pose / Relevé…"
                          autoComplete="off"
                          spellCheck={false}
                          {...register(`actions.${idx}.action`, {
                            onChange: () =>
                              setValidatedById((s) =>
                                s[id] ? { ...s, [id]: false } : s
                              ),
                          })}
                          className={`${inputCls} ${hasActionErr ? "border-red focus:ring-red/20" : ""}`}
                          aria-invalid={hasActionErr ? "true" : "false"}
                        />
                      </div>
                    </div>

                    {/* Ligne 2 */}
                    <div className="grid grid-cols-1 gap-2 midTablet:grid-cols-4">
                      <div className={`${fieldWrap} midTablet:col-span-2`}>
                        <label className={labelCls}>
                          <MapPin className="size-4" /> Zone *
                        </label>
                        <input
                          type="text"
                          autoComplete="off"
                          spellCheck={false}
                          {...register(`actions.${idx}.zone`, {
                            onChange: () =>
                              setValidatedById((s) =>
                                s[id] ? { ...s, [id]: false } : s
                              ),
                          })}
                          className={`${inputCls} ${hasZoneErr ? "border-red focus:ring-red/20" : ""}`}
                          aria-invalid={hasZoneErr ? "true" : "false"}
                        />
                      </div>

                      <div className={fieldWrap}>
                        <label className={labelCls}>
                          <UserRound className="size-4" /> Technicien
                        </label>
                        <input
                          type="text"
                          autoComplete="off"
                          spellCheck={false}
                          {...register(`actions.${idx}.technician`)}
                          className={inputCls}
                        />
                      </div>

                      <div className={fieldWrap}>
                        <label className={labelCls}>
                          <AlertTriangle className="size-4" /> Gravité
                        </label>
                        <select
                          {...register(`actions.${idx}.severity`, {
                            onChange: () =>
                              setValidatedById((s) =>
                                s[id] ? { ...s, [id]: false } : s
                              ),
                          })}
                          className={selectCls}
                        >
                          <option value="none">Nulle</option>
                          <option value="low">Faible</option>
                          <option value="medium">Moyenne</option>
                          <option value="high">Forte</option>
                        </select>
                      </div>
                    </div>

                    {/* Ligne 3 */}
                    <div className="grid grid-cols-1 gap-2 midTablet:grid-cols-4">
                      <div className={fieldWrap}>
                        <label className={labelCls}>
                          <PackageIcon className="size-4" /> Appâts rechargés
                        </label>
                        <input
                          type="number"
                          onWheel={(e) => e.currentTarget.blur()}
                          {...register(`actions.${idx}.baitRefilled`, {
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

                      <div className={`midTablet:col-span-3 ${fieldWrap}`}>
                        <label className={labelCls}>
                          <ListChecks className="size-4" /> Constats
                        </label>
                        <input
                          type="text"
                          autoComplete="off"
                          spellCheck={false}
                          {...register(`actions.${idx}.findings`)}
                          className={inputCls}
                        />
                      </div>
                    </div>

                    {/* Ligne 4 */}
                    <div className="grid grid-cols-1 gap-2 midTablet:grid-cols-2">
                      <div className={`${fieldWrap} h-auto`}>
                        <label className={labelCls}>
                          <LinkIcon className="size-4" /> Preuves (URLs, 1 par
                          ligne)
                        </label>
                        <textarea
                          rows={3}
                          {...register(`actions.${idx}.proofUrlsText`)}
                          className="w-full resize-none rounded-lg border border-darkBlue/20 bg-white p-[10px] pr-16 text-[15px] outline-none transition"
                        />
                      </div>

                      <div className={`${fieldWrap} h-auto`}>
                        <label className={labelCls}>
                          <FileText className="size-4" /> Notes
                        </label>
                        <textarea
                          rows={3}
                          {...register(`actions.${idx}.notes`)}
                          className="w-full resize-none rounded-lg border border-darkBlue/20 bg-white p-[10px] pr-16 text-[15px] outline-none transition"
                        />
                      </div>
                    </div>

                    {/* Actions ligne */}
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
            submitDisabled
              ? "Validez au moins une ligne (Date*, Action*, Zone*)"
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
