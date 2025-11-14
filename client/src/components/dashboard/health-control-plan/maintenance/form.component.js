// app/(components)/maintenance/MaintenanceForm.jsx
"use client";
import { useEffect, useMemo } from "react";
import { useForm } from "react-hook-form";
import axios from "axios";
import {
  Wrench,
  Hash,
  CalendarClock,
  Link as LinkIcon,
  FileText,
  Building2,
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

/* ---------- Defaults ---------- */
function buildDefaults(rec) {
  return {
    equipment: rec?.equipment ?? "",
    equipmentId: rec?.equipmentId ?? "",
    type: rec?.type ?? "inspection",
    performedAt: toDatetimeLocal(rec?.performedAt ?? new Date()),
    nextDue: toDateValue(rec?.nextDue),
    provider: rec?.provider ?? "",
    notes: rec?.notes ?? "",
    proofUrlsText:
      Array.isArray(rec?.proofUrls) && rec.proofUrls.length
        ? rec.proofUrls.join("\n")
        : "",
  };
}

/* ---------- Styles alignés (comme Training/NonConformity) ---------- */
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
  "inline-flex items-center justify-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition active:scale-[0.98]";

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
    formState: { errors, isSubmitting },
  } = useForm({ defaultValues: buildDefaults(initial) });

  const isEdit = !!initial?._id;

  const token = useMemo(
    () =>
      typeof window !== "undefined" ? localStorage.getItem("token") : null,
    []
  );

  useEffect(() => {
    reset(buildDefaults(initial));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initial]);

  const onSubmit = async (data) => {
    if (!token) return;

    const proofs =
      typeof data.proofUrlsText === "string" && data.proofUrlsText.trim().length
        ? data.proofUrlsText
            .split(/[\n,;]+/g)
            .map((s) => s.trim())
            .filter(Boolean)
        : [];

    const payload = {
      equipment: data.equipment,
      equipmentId: data.equipmentId || undefined,
      type: data.type || "inspection",
      performedAt: data.performedAt ? new Date(data.performedAt) : new Date(),
      nextDue:
        data.nextDue === "" || data.nextDue == null
          ? null
          : new Date(data.nextDue),
      provider: data.provider || undefined,
      notes: data.notes || undefined,
      proofUrls: proofs,
    };

    const url = isEdit
      ? `${process.env.NEXT_PUBLIC_API_URL}/restaurants/${restaurantId}/maintenance/${initial._id}`
      : `${process.env.NEXT_PUBLIC_API_URL}/restaurants/${restaurantId}/maintenance`;
    const method = isEdit ? "put" : "post";

    const { data: saved } = await axios[method](url, payload, {
      headers: { Authorization: `Bearer ${token}` },
    });

    window.dispatchEvent(
      new CustomEvent("maintenance:upsert", { detail: { doc: saved } })
    );

    reset(buildDefaults(null));
    onSuccess?.(saved);
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="relative flex flex-col gap-2">
      {/* Ligne 1 : Équipement / ID interne */}
      <div className="grid grid-cols-1 gap-2 midTablet:grid-cols-2">
        <div className={`${fieldWrap} px-3`}>
          <label className={labelCls}>
            <Wrench className="size-4" /> Équipement *
          </label>
          <input
            type="text"
            {...register("equipment", { required: "Requis" })}
            className={`${inputCls} ${errors.equipment ? "border-red focus:ring-red/20" : ""}`}
            placeholder='ex: "Friteuse 1"'
            autoComplete="off"
            spellCheck={false}
            autoCorrect="off"
          />
          {errors.equipment && (
            <p className="text-xs text-red mt-1">{errors.equipment.message}</p>
          )}
        </div>

        <div className={`${fieldWrap} px-3`}>
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

      {/* Ligne 2 : Type / Effectué le / Prochaine échéance */}
      <div className="grid grid-cols-1 gap-2 midTablet:grid-cols-3">
        <div className={`${fieldWrap} px-3`}>
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

        <div className={`${fieldWrap} px-3`}>
          <label className={labelCls}>
            <CalendarClock className="size-4" /> Effectué le *
          </label>
          <input
            type="datetime-local"
            {...register("performedAt", { required: "Requis" })}
            className={`${selectCls} ${errors.performedAt ? "border-red focus:ring-red/20" : ""}`}
          />
          {errors.performedAt && (
            <p className="text-xs text-red mt-1">{errors.performedAt.message}</p>
          )}
        </div>

        <div className={`${fieldWrap} px-3`}>
          <label className={labelCls}>
            <CalendarClock className="size-4" /> Prochaine échéance
          </label>
          <input type="date" {...register("nextDue")} className={selectCls} />
        </div>
      </div>

      {/* Ligne 3 : Prestataire / Preuves */}
      <div className="grid grid-cols-1 gap-2 midTablet:grid-cols-2">
        <div className={`${fieldWrap} px-3 h-fit`}>
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

        <div className={`${fieldWrap} px-3`}>
          <label className={labelCls}>
            <LinkIcon className="size-4" /> Preuves (URLs, 1 par ligne)
          </label>
          <textarea
            rows={4}
            {...register("proofUrlsText")}
            className={`${textareaCls} min-h-[96px]`}
            placeholder={"https://…/rapport.pdf\nhttps://…/photo.jpg"}
          />
        </div>
      </div>

      {/* Notes */}
      <div className="grid grid-cols-1">
        <div className={`${fieldWrap} px-3 h-auto`}>
          <label className={labelCls}>
            <FileText className="size-4" /> Notes
          </label>
          <textarea
            rows={1}
            {...register("notes")}
            className={`${textareaCls}`}
            placeholder="Observations, références des pièces, etc."
          />
        </div>
      </div>

      {/* Actions */}
      <div className="flex flex-col gap-2 mt-3 mobile:flex-row">
        <button
          type="submit"
          disabled={isSubmitting}
          aria-disabled={isSubmitting}
          className={`text-nowrap ${btnBase} text-white shadow disabled:opacity-60 ${
            isSubmitting ? "bg-darkBlue/40" : "bg-blue border border-blue"
          }`}
        >
          {isEdit ? (
            <>
              <FileText className="size-4" /> Mettre à jour
            </>
          ) : (
            <>
              <FileText className="size-4" /> Enregistrer
            </>
          )}
        </button>

        {isEdit && (
          <button
            type="button"
            onClick={() => {
              reset(buildDefaults(null));
              onCancel?.();
            }}
            className={`${btnBase} border border-red bg-white text-red`}
          >
            Annuler
          </button>
        )}
      </div>
    </form>
  );
}
