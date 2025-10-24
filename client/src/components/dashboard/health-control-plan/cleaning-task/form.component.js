// components/dashboard/health-control-plan/cleaning-tasks/form.component.jsx
"use client";
import { useEffect, useMemo, useContext, useState } from "react";
import { useForm } from "react-hook-form";
import axios from "axios";
import { GlobalContext } from "@/contexts/global.context";

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
      // requis et doit correspondre à un employé existant
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
      e.preventDefault(); // ne pas soumettre
      if (employeeOptions.length > 0) pickEmployee(employeeOptions[0]);
    } else if (e.key === "Escape") {
      setIsEmpOpen(false);
    }
  }

  const assignedInvalid = !!errors.assignedTo;

  return (
    <form
      onSubmit={handleSubmit(onSubmit)}
      className="bg-white rounded-lg p-4 shadow-sm flex flex-col gap-6"
    >
      {/* Ligne 1 */}
      <div className="flex flex-col gap-4 midTablet:flex-row">
        <div className="flex-1">
          <label className="text-sm font-medium">Zone *</label>
          <input
            type="text"
            placeholder="ex: Plonge, Sol cuisine, Plan de travail froid…"
            {...register("zone", { required: "Requis" })}
            className="border rounded p-2 h-[44px] w-full"
          />
          {errors.zone && (
            <p className="text-xs text-red mt-1">{errors.zone.message}</p>
          )}
        </div>
        <div className="w-56">
          <label className="text-sm font-medium">Fréquence</label>
          <select
            {...register("frequency")}
            className="border rounded p-2 h-[44px] w-full"
          >
            <option value="daily">Quotidienne</option>
            <option value="weekly">Hebdomadaire</option>
            <option value="monthly">Mensuelle</option>
            <option value="on_demand">À la demande</option>
          </select>
        </div>
        <div className="w-48">
          <label className="text-sm font-medium">Priorité</label>
          <select
            {...register("riskLevel")}
            className="border rounded p-2 h-[44px] w-full"
          >
            <option value="low">Basse</option>
            <option value="medium">Moyenne</option>
            <option value="high">Élevée</option>
          </select>
        </div>
      </div>

      {/* Ligne 2 */}
      <div className="flex flex-col gap-4 midTablet:flex-row">
        <div className="flex-1">
          <label className="text-sm font-medium">Description</label>
          <input
            type="text"
            placeholder="Détails de l’intervention"
            {...register("description")}
            className="border rounded p-2 h-[44px] w-full"
          />
        </div>
        <div className="w-72">
          <label className="text-sm font-medium">Prévue le</label>
          <input
            type="datetime-local"
            {...register("dueAt")}
            className="border rounded p-2 h-[44px] w-full"
          />
        </div>

        {/* Assignée à */}
        <div className="w-[360px]">
          <label className="text-sm font-medium">Assignée à *</label>
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
              className={`w-full border rounded p-2 h-[44px] pr-10 ${assignedInvalid ? "border-red ring-1 ring-red" : ""}`}
            />

            {/* Croix pour vider */}
            {empQuery?.length > 0 && (
              <button
                onMouseDown={(e) => e.preventDefault()}
                onClick={(e) => {
                  e.preventDefault();
                  clearEmployee();
                }}
                className="absolute right-3 top-1/2 transform -translate-y-1/2 w-6 h-6 bg-black bg-opacity-30 text-white rounded-full flex items-center justify-center"
              >
                &times;
              </button>
            )}

            {/* Dropdown : max height + scroll, pas de overflow hidden sur le parent */}
            {isEmpOpen && empQuery.trim() !== "" && (
              <div className="absolute z-10 left-0 right-0 mt-1 bg-white border rounded shadow">
                <ul className="max-h-56 overflow-auto">
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

          {/* Validation silencieuse (obligatoire & existant) */}
          <input
            type="hidden"
            {...register("assignedTo", {
              required: true,
              validate: (val) =>
                allEmployees.some((e) => e._id === String(val)),
            })}
          />
          {/* Pas de message d’erreur affiché */}
        </div>
      </div>

      {/* Ligne 3 : produit & protocole */}
      <div className="flex flex-col gap-4 midTablet:flex-row">
        <div className="flex-1">
          <label className="text-sm font-medium">Produit utilisé</label>
          <input
            type="text"
            {...register("productUsed")}
            className="border rounded p-2 h-[44px] w-full"
          />
        </div>
        <div className="flex-1">
          <label className="text-sm font-medium">FDS (URL)</label>
          <input
            type="url"
            {...register("productFDSUrl")}
            className="border rounded p-2 h-[44px] w-full"
          />
        </div>
        <div className="w-48">
          <label className="text-sm font-medium">Temps contact (min)</label>
          <input
            type="number"
            step="1"
            onWheel={(e) => e.currentTarget.blur()}
            min="0"
            {...register("dwellTimeMin")}
            className="border rounded p-2 h-[44px] w-full"
          />
        </div>
      </div>

      <div className="flex flex-col gap-4 midTablet:flex-row">
        <div className="flex-1">
          <label className="text-sm font-medium">
            Étapes du protocole (1 par ligne)
          </label>
          <textarea
            rows={4}
            {...register("protocolStepsText")}
            className="border rounded p-2 resize-none w-full min-h-[96px]"
            placeholder={
              "1) Balayer\n2) Détergent\n3) Rinçage\n4) Désinfection\n5) Temps de contact\n6) Rinçage final"
            }
          />
        </div>
        <div className="flex-1">
          <label className="text-sm font-medium">
            Preuves (URLs, 1 par ligne)
          </label>
          <textarea
            rows={4}
            {...register("proofUrlsText")}
            className="border rounded p-2 resize-none w-full min-h-[96px]"
            placeholder={"https://…/photo1.jpg\nhttps://…/photo2.jpg"}
          />
        </div>
      </div>

      {/* Ligne 4 : statut */}
      <div className="flex flex-col items-center gap-4 midTablet:flex-row">
        <div className="flex items-center gap-2 pt-6">
          <input
            id="done"
            type="checkbox"
            {...register("done")}
            className="border rounded"
          />
          <label htmlFor="done" className="text-sm font-medium">
            Fait
          </label>
        </div>
        <div className="w-72">
          <label className="text-sm font-medium">Date/heure exécution</label>
          <input
            type="datetime-local"
            {...register("doneAt")}
            className="border rounded p-2 h-[44px] w-full"
          />
        </div>

        <div className="flex items-center gap-2 pt-6">
          <input
            id="verified"
            type="checkbox"
            {...register("verified")}
            className="border rounded"
            disabled={!doneWatch}
          />
          <label htmlFor="verified" className="text-sm font-medium">
            Vérifiée
          </label>
        </div>
        <div className="w-72">
          <label className="text-sm font-medium">Date/heure vérif</label>
          <input
            type="datetime-local"
            {...register("verifiedAt")}
            className="border rounded p-2 h-[44px] w-full"
            disabled={!doneWatch}
          />
        </div>
      </div>

      {/* Actions */}
      <div className="flex gap-2">
        <button
          type="submit"
          disabled={isSubmitting}
          className="px-4 py-2 rounded bg-blue text-white disabled:opacity-50"
        >
          {initial?._id ? "Mettre à jour" : "Enregistrer"}
        </button>
        {initial?._id && (
          <button
            type="button"
            onClick={() => {
              reset(buildFormDefaults(null));
              onCancel?.();
            }}
            className="px-4 py-2 rounded text-white bg-red"
          >
            Annuler
          </button>
        )}
      </div>
    </form>
  );
}
