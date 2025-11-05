// components/dashboard/health-control-plan/cleaning-tasks/form.component.jsx
"use client";
import { useEffect, useMemo, useContext, useState } from "react";
import { useForm } from "react-hook-form";
import axios from "axios";
import { GlobalContext } from "@/contexts/global.context";
import { ChevronDown, FileText, Loader2 } from "lucide-react";

function toDatetimeLocalValue(value) {
  const base = value ? new Date(value) : new Date();
  if (Number.isNaN(base.getTime())) {
    const fallback = new Date();
    const offset = fallback.getTimezoneOffset() * 60000;
    return new Date(fallback.getTime() - offset).toISOString().slice(0, 16);
  }
  const offset = base.getTimezoneOffset() * 60000;
  return new Date(base.getTime() - offset).toISOString().slice(0, 16);
}
function toDatetimeLocalOrEmpty(value) {
  if (!value) return "";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "";
  const offset = d.getTimezoneOffset() * 60000;
  return new Date(d.getTime() - offset).toISOString().slice(0, 16);
}

function buildFormDefaults(record) {
  return {
    zone: record?.zone ?? "",
    zoneId: record?.zoneId ?? "",
    description: record?.description ?? "",
    frequency: record?.frequency ?? "daily",
    dueAt: toDatetimeLocalOrEmpty(record?.dueAt),
    assignedTo: record?.assignedTo ? String(record.assignedTo) : "",
    done: Boolean(record?.done ?? false),
    doneAt: toDatetimeLocalOrEmpty(record?.doneAt),
    proofUrlsText: Array.isArray(record?.proofUrls)
      ? record.proofUrls.join("\n")
      : "",
    productUsed: record?.productUsed ?? "",
    productFDSUrl: record?.productFDSUrl ?? "",
    protocolStepsText: Array.isArray(record?.protocolSteps)
      ? record.protocolSteps.join("\n")
      : "",
    dwellTimeMin:
      record?.dwellTimeMin !== undefined && record?.dwellTimeMin !== null
        ? String(record.dwellTimeMin)
        : "",
    riskLevel: record?.riskLevel ?? "low",
    verified: Boolean(record?.verified ?? false),
    verifiedAt: toDatetimeLocalOrEmpty(record?.verifiedAt),
  };
}

export default function CleaningTaskForm({
  restaurantId,
  initial = null,
  onSuccess,
  onCancel,
}) {
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
    watch,
    setValue,
  } = useForm({ defaultValues: buildFormDefaults(initial) });

  const { restaurantContext } = useContext(GlobalContext);
  const allEmployees = useMemo(
    () =>
      restaurantContext.restaurantData?.employees?.map((e) => ({
        _id: String(e._id),
        firstname: e.firstname,
        lastname: e.lastname,
        name: `${e.firstname ?? ""} ${e.lastname ?? ""}`.trim(),
      })) || [],
    [restaurantContext.restaurantData?.employees]
  );

  const normalize = (str) =>
    str
      ?.normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .trim() ?? "";

  const [empQuery, setEmpQuery] = useState("");
  const [isEmpOpen, setIsEmpOpen] = useState(false);
  const assignedToWatch = watch("assignedTo") || "";

  // Pré-affiche le nom en édition
  useEffect(() => {
    const sel = allEmployees.find((e) => e._id === String(assignedToWatch));
    setEmpQuery(sel ? `${sel.firstname} ${sel.lastname}`.trim() : "");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [assignedToWatch, allEmployees]);

  const employeeOptions = useMemo(() => {
    const q = normalize(empQuery);
    if (!q) return allEmployees.slice(0, 10);
    return allEmployees
      .filter((e) => normalize(`${e.firstname} ${e.lastname}`).includes(q))
      .slice(0, 10);
  }, [allEmployees, empQuery]);

  function pickEmployee(emp) {
    setValue("assignedTo", emp?._id || "", {
      shouldDirty: true,
      shouldValidate: true,
    });
    setEmpQuery(emp ? `${emp.firstname} ${emp.lastname}`.trim() : "");
    setIsEmpOpen(false);
  }
  function clearEmployee() {
    setValue("assignedTo", "", { shouldDirty: true, shouldValidate: true });
    setEmpQuery("");
    setIsEmpOpen(false);
  }

  useEffect(() => {
    reset(buildFormDefaults(initial));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initial]);

  const doneWatch = watch("done");
  useEffect(() => {
    if (doneWatch && !watch("doneAt"))
      setValue("doneAt", toDatetimeLocalValue());
    if (!doneWatch) {
      setValue("doneAt", "");
      setValue("verified", false);
      setValue("verifiedAt", "");
    }
  }, [doneWatch, setValue, watch]);

  const verifiedWatch = watch("verified");
  useEffect(() => {
    if (verifiedWatch && !watch("verifiedAt"))
      setValue("verifiedAt", toDatetimeLocalValue());
    if (!verifiedWatch) setValue("verifiedAt", "");
  }, [verifiedWatch, setValue, watch]);

  const onSubmit = async (data) => {
    const token = localStorage.getItem("token");
    if (!token) return;

    const proofUrls =
      typeof data.proofUrlsText === "string" && data.proofUrlsText.trim().length
        ? data.proofUrlsText
            .split(/[\n,;]+/g)
            .map((s) => s.trim())
            .filter(Boolean)
        : [];

    const protocolSteps =
      typeof data.protocolStepsText === "string" &&
      data.protocolStepsText.trim().length
        ? data.protocolStepsText
            .split(/\n+/g)
            .map((s) => s.trim())
            .filter(Boolean)
        : [];

    const payload = {
      zone: data.zone || undefined,
      zoneId: data.zoneId || undefined,
      description: data.description || undefined,
      frequency: data.frequency || "daily",
      dueAt: data.dueAt ? new Date(data.dueAt) : undefined,
      assignedTo: data.assignedTo,
      done: !!data.done,
      doneAt: data.done
        ? data.doneAt
          ? new Date(data.doneAt)
          : new Date()
        : undefined,
      proofUrls,
      productUsed: data.productUsed || undefined,
      productFDSUrl: data.productFDSUrl || undefined,
      protocolSteps,
      dwellTimeMin:
        data.dwellTimeMin !== "" && data.dwellTimeMin != null
          ? Number(data.dwellTimeMin)
          : undefined,
      riskLevel: data.riskLevel || "low",
      verified: !!data.verified,
      verifiedAt: data.verified
        ? data.verifiedAt
          ? new Date(data.verifiedAt)
          : new Date()
        : undefined,
    };

    const url = initial?._id
      ? `${process.env.NEXT_PUBLIC_API_URL}/restaurants/${restaurantId}/cleaning-tasks/${initial._id}`
      : `${process.env.NEXT_PUBLIC_API_URL}/restaurants/${restaurantId}/cleaning-tasks`;
    const method = initial?._id ? "put" : "post";

    const { data: saved } = await axios[method](url, payload, {
      headers: { Authorization: `Bearer ${token}` },
    });

    window.dispatchEvent(
      new CustomEvent("cleaning-task:upsert", { detail: { doc: saved } })
    );

    reset(buildFormDefaults(null));
    onSuccess?.(saved);
  };

  // clavier dans l'input employé
  function onEmpKeyDown(e) {
    if (e.key === "Enter") {
      e.preventDefault();
      if (employeeOptions.length > 0) pickEmployee(employeeOptions[0]);
    } else if (e.key === "Escape") {
      setIsEmpOpen(false);
    }
  }

  const assignedInvalid = !!errors.assignedTo;

  /* ---------- STYLES (alignés sur MicrobiologyForm) ---------- */
  const fieldWrap =
    "group relative rounded-xl bg-white/50 backdrop-blur-sm px-3 py-2 h-[80px] transition-shadow";
  const labelCls =
    "flex items-center gap-2 text-xs font-medium text-darkBlue/60 mb-1";
  const inputCls =
    "h-11 w-full rounded-lg border border-darkBlue/20 bg-white px-3 text-[15px] outline-none transition placeholder:text-darkBlue/40";
  const selectCls =
    "h-11 w-full appearance-none rounded-lg border border-darkBlue/20 bg-white px-3 text-[15px] outline-none transition";
  const textareaCls =
    "w-full resize-none rounded-lg border border-darkBlue/20 bg-white p-[10px] text-[15px] outline-none transition placeholder:text-darkBlue/40";

  return (
    <form
      onSubmit={handleSubmit(onSubmit)}
      className="relative flex flex-col gap-2"
    >
      {/* Ligne 1 : Zone / Fréquence / Priorité */}
      <div className="grid grid-cols-1 gap-2 midTablet:grid-cols-3">
        <div className={fieldWrap}>
          <label className={labelCls}>Zone *</label>
          <input
            type="text"
            placeholder="ex: Plonge, Sol cuisine, Plan de travail froid…"
            autoComplete="off"
            spellCheck={false}
            autoCorrect="off"
            {...register("zone", { required: "Requis" })}
            className={`${inputCls} ${errors.zone ? "border-red ring-1 ring-red/30" : ""}`}
          />
          {errors.zone && (
            <p className="mt-1 text-xs text-red">{errors.zone.message}</p>
          )}
        </div>

        <div className={fieldWrap}>
          <label className={labelCls}>Fréquence</label>
          <div className="relative">
            <select {...register("frequency")} className={selectCls}>
              <option value="daily">Quotidienne</option>
              <option value="weekly">Hebdomadaire</option>
              <option value="monthly">Mensuelle</option>
              <option value="on_demand">À la demande</option>
            </select>
            <ChevronDown className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 size-4 text-darkBlue/40" />
          </div>
        </div>

        <div className={fieldWrap}>
          <label className={labelCls}>Priorité</label>
          <div className="relative">
            <select {...register("riskLevel")} className={selectCls}>
              <option value="low">Basse</option>
              <option value="medium">Moyenne</option>
              <option value="high">Élevée</option>
            </select>
            <ChevronDown className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 size-4 text-darkBlue/40" />
          </div>
        </div>
      </div>

      {/* Ligne 2 : Description / Prévue le / Assignée à */}
      <div className="grid grid-cols-1 gap-2 midTablet:grid-cols-3">
        <div className={fieldWrap}>
          <label className={labelCls}>Description</label>
          <input
            type="text"
            placeholder="Détails de l’intervention"
            autoComplete="off"
            spellCheck={false}
            autoCorrect="off"
            {...register("description")}
            className={inputCls}
          />
        </div>

        <div className={fieldWrap}>
          <label className={labelCls}>Prévue le</label>
          <input
            type="datetime-local"
            {...register("dueAt")}
            className={selectCls}
          />
        </div>

        {/* Assignée à (autocomplete) */}
        <div className={`${fieldWrap} h-auto relative z-[60]`}>
          <label className={labelCls}>Assignée à *</label>
          <div className="relative">
            <input
              type="text"
              value={empQuery}
              onChange={(e) => {
                setEmpQuery(e.target.value);
                setIsEmpOpen(true);
                setValue("assignedTo", "", {
                  shouldDirty: true,
                  shouldValidate: true,
                });
              }}
              onFocus={() => setIsEmpOpen(true)}
              onBlur={() => setTimeout(() => setIsEmpOpen(false), 120)}
              onKeyDown={onEmpKeyDown}
              placeholder="Rechercher un employé"
              className={`${inputCls} pr-10 ${assignedInvalid ? "border-red ring-1 ring-red/30" : ""}`}
              autoComplete="off"
              spellCheck={false}
              autoCorrect="off"
            />

            {/* Clear */}
            {empQuery?.length > 0 && (
              <button
                onMouseDown={(e) => e.preventDefault()}
                onClick={(e) => {
                  e.preventDefault();
                  clearEmployee();
                }}
                className="absolute right-3 top-1/2 -translate-y-1/2 size-6 rounded-full bg-black/30 text-white grid place-items-center"
                title="Effacer"
              >
                &times;
              </button>
            )}

            {/* Dropdown */}
            {isEmpOpen && empQuery.trim() !== "" && (
              <div className="absolute z-[90] left-0 right-0 mt-1 bg-white border border-darkBlue/20 rounded-lg shadow-xl">
                <ul className="max-h-60 overflow-auto">
                  {employeeOptions.length === 0 && (
                    <li className="px-3 py-2 text-sm opacity-70 italic">
                      Aucun résultat
                    </li>
                  )}
                  {employeeOptions.map((emp) => (
                    <li
                      key={emp._id}
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={() => pickEmployee(emp)}
                      className={`px-3 py-[8px] cursor-pointer hover:bg-lightGrey ${
                        assignedToWatch === emp._id ? "bg-gray-100" : ""
                      }`}
                    >
                      {emp.firstname} {emp.lastname}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>

          {/* Validation silencieuse */}
          <input
            type="hidden"
            {...register("assignedTo", {
              required: true,
              validate: (val) =>
                allEmployees.some((e) => e._id === String(val)),
            })}
          />
        </div>
      </div>

      {/* Ligne 3 : Produit / FDS / Temps contact */}
      <div className="grid grid-cols-1 gap-2 midTablet:grid-cols-3">
        <div className={fieldWrap}>
          <label className={labelCls}>Produit utilisé</label>
          <input
            type="text"
            {...register("productUsed")}
            className={inputCls}
            autoComplete="off"
            spellCheck={false}
            autoCorrect="off"
          />
        </div>
        <div className={fieldWrap}>
          <label className={labelCls}>FDS (URL)</label>
          <input
            type="url"
            {...register("productFDSUrl")}
            className={inputCls}
            autoComplete="off"
            spellCheck={false}
            autoCorrect="off"
          />
        </div>
        <div className={fieldWrap}>
          <label className={labelCls}>Temps contact (min)</label>
          <input
            type="number"
            step="1"
            onWheel={(e) => e.currentTarget.blur()}
            min="0"
            {...register("dwellTimeMin")}
            className={inputCls}
          />
        </div>
      </div>

      {/* Ligne 4 : Étapes & Preuves (hauteur augmentée) */}
      <div className="grid grid-cols-1 gap-2 midTablet:grid-cols-2">
        <div className={`${fieldWrap} h-auto`}>
          <label className={labelCls}>Étapes du protocole (1 par ligne)</label>
          <textarea
            rows={8}
            {...register("protocolStepsText")}
            className={`${textareaCls} min-h-[220px]`}
            placeholder={
              "1) Balayer\n2) Détergent\n3) Rinçage\n4) Désinfection\n5) Temps de contact\n6) Rinçage final"
            }
          />
        </div>
        <div className={`${fieldWrap} h-auto`}>
          <label className={labelCls}>Preuves (URLs, 1 par ligne)</label>
          <textarea
            rows={8}
            {...register("proofUrlsText")}
            className={`${textareaCls} min-h-[220px]`}
            placeholder={"https://…/photo1.jpg\nhttps://…/photo2.jpg"}
          />
        </div>
      </div>

      {/* Ligne 5A : Statut "À faire" + Date exécution */}
      <div className="grid grid-cols-1 gap-2 midTablet:grid-cols-2">
        <div className={fieldWrap}>
          <label className={labelCls}>Statut</label>
          <div className="flex items-center h-11">
            <label
              role="switch"
              aria-checked={!!doneWatch}
              className="w-full group inline-flex justify-between h-11 items-center gap-3 rounded-xl border border-darkBlue/20 bg-white px-3 py-2 cursor-pointer select-none"
            >
              <span className="text-sm text-darkBlue/70">
                {doneWatch ? "Fait" : "À faire"}
              </span>
              <input
                type="checkbox"
                {...register("done")}
                className="sr-only peer"
              />
              <span className="relative inline-flex h-6 w-11 items-center rounded-full bg-darkBlue/20 transition-colors group-aria-checked:bg-blue peer-checked:bg-blue">
                <span className="absolute left-1 top-1/2 -translate-y-1/2 size-4 rounded-full bg-white shadow transition-transform will-change-transform translate-x-0 group-aria-checked:translate-x-5 peer-checked:translate-x-5" />
              </span>
            </label>
          </div>
        </div>

        <div className={fieldWrap}>
          <label className={labelCls}>Date/heure exécution</label>
          <input
            type="datetime-local"
            {...register("doneAt")}
            className={selectCls}
          />
        </div>
      </div>

      {/* Ligne 5B : Statut "Vérifiée" + Date vérif */}
      <div className="grid grid-cols-1 gap-2 midTablet:grid-cols-2">
        <div className={fieldWrap}>
          <label className={labelCls}>Vérification</label>
          <div className="flex items-center h-11">
            <label
              role="switch"
              aria-checked={!!verifiedWatch}
              className={`group inline-flex justify-between h-11 w-full items-center gap-3 rounded-xl border bg-white px-3 py-2 cursor-pointer select-none ${
                !doneWatch
                  ? "border-darkBlue/10 opacity-50"
                  : "border-darkBlue/20"
              }`}
            >
              <span className="text-sm text-darkBlue/70">
                {verifiedWatch ? "Vérifiée" : "Non vérifiée"}
              </span>
              <input
                type="checkbox"
                {...register("verified")}
                className="sr-only peer"
                disabled={!doneWatch}
              />
              <span className="relative inline-flex h-6 w-11 items-center rounded-full bg-darkBlue/20 transition-colors group-aria-checked:bg-blue peer-checked:bg-blue">
                <span className="absolute left-1 top-1/2 -translate-y-1/2 size-4 rounded-full bg-white shadow transition-transform will-change-transform translate-x-0 group-aria-checked:translate-x-5 peer-checked:translate-x-5" />
              </span>
            </label>
          </div>
        </div>

        <div className={fieldWrap}>
          <label className={labelCls}>Date/heure vérif</label>
          <input
            type="datetime-local"
            {...register("verifiedAt")}
            className={selectCls}
            disabled={!doneWatch}
          />
        </div>
      </div>

      {/* Actions (style MicrobiologyForm) */}
      <div className="flex flex-col items-center gap-2 mt-3 mobile:flex-row">
        <button
          type="submit"
          disabled={isSubmitting}
          className="text-nowrap inline-flex items-center justify-center gap-2 h-[38px] rounded-lg bg-blue px-4 py-2 text-sm font-medium text-white shadow disabled:opacity-60"
        >
          {isSubmitting ? (
            <>
              <Loader2 className="size-4 animate-spin" />
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
              reset(buildFormDefaults(null));
              onCancel?.();
            }}
            className="inline-flex h-[38px] items-center justify-center gap-2 rounded-lg border border-red bg-white px-4 py-2 text-sm font-medium text-red"
          >
            Annuler
          </button>
        )}
      </div>
    </form>
  );
}
