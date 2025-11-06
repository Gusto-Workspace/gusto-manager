// app/(components)/health/CalibrationsForm.jsx
"use client";
import { useEffect, useMemo } from "react";
import { useForm } from "react-hook-form";
import axios from "axios";
import {
  Hash,
  Thermometer,
  CalendarClock,
  CalendarDays,
  FlaskConical,
  Link as LinkIcon,
  Building2,
  FileText,
  Loader2,
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
    deviceIdentifier: rec?.deviceIdentifier ?? "",
    deviceType: rec?.deviceType ?? "",
    calibratedAt: toDatetimeLocal(rec?.calibratedAt ?? new Date()),
    nextCalibrationDue: toDateValue(rec?.nextCalibrationDue),
    method: rec?.method ?? "",
    certificateUrl: rec?.certificateUrl ?? "",
    provider: rec?.provider ?? "",
    notes: rec?.notes ?? "",
  };
}

/* ---------- STYLES alignés ---------- */
const fieldWrap =
  "group relative rounded-xl bg-white/50 backdrop-blur-sm px-3 py-2 min-h-[80px] transition-shadow";
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

export default function CalibrationsForm({
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

    const payload = {
      deviceIdentifier: data.deviceIdentifier,
      deviceType: data.deviceType || undefined,
      calibratedAt: data.calibratedAt
        ? new Date(data.calibratedAt)
        : new Date(),
      nextCalibrationDue: data.nextCalibrationDue
        ? new Date(data.nextCalibrationDue)
        : undefined,
      method: data.method || undefined,
      certificateUrl: data.certificateUrl || undefined,
      provider: data.provider || undefined,
      notes: data.notes || undefined,
    };

    const url = initial?._id
      ? `${process.env.NEXT_PUBLIC_API_URL}/restaurants/${restaurantId}/calibrations/${initial._id}`
      : `${process.env.NEXT_PUBLIC_API_URL}/restaurants/${restaurantId}/calibrations`;
    const method = initial?._id ? "put" : "post";

    const { data: saved } = await axios[method](url, {
      ...payload,
      _id: undefined,
    }, { headers: { Authorization: `Bearer ${token}` } });

    window.dispatchEvent(
      new CustomEvent("calibrations:upsert", { detail: { doc: saved } })
    );

    reset(buildDefaults(null));
    onSuccess?.(saved);
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="relative flex flex-col gap-2">
      {/* Ligne 1 : Identifiant + Type */}
      <div className="grid grid-cols-1 gap-2 midTablet:grid-cols-2">
        <div className={fieldWrap}>
          <label className={labelCls}>
            <Hash className="size-4" /> Identifiant appareil *
          </label>
          <input
            type="text"
            {...register("deviceIdentifier", { required: true })}
            className={`${inputCls} ${errors.deviceIdentifier ? "border-red focus:ring-red/20" : ""}`}
            placeholder="ex: THERMO-001 / SONDE-12A"
            autoComplete="off"
            spellCheck={false}
          />
          {/* pas de message "Requis" */}
        </div>

        <div className={fieldWrap}>
          <label className={labelCls}>
            <Thermometer className="size-4" /> Type
          </label>
          <input
            type="text"
            {...register("deviceType")}
            className={inputCls}
            placeholder='ex: "thermometer"'
            autoComplete="off"
            spellCheck={false}
          />
        </div>
      </div>

      {/* Ligne 2 : Dates */}
      <div className="grid grid-cols-1 gap-2 midTablet:grid-cols-2">
        <div className={fieldWrap}>
          <label className={labelCls}>
            <CalendarClock className="size-4" /> Calibré le *
          </label>
          <input
            type="datetime-local"
            {...register("calibratedAt", { required: true })}
            className={`${selectCls} ${errors.calibratedAt ? "border-red focus:ring-red/20" : ""}`}
          />
          {/* pas de message "Requis" */}
        </div>

        <div className={fieldWrap}>
          <label className={labelCls}>
            <CalendarDays className="size-4" /> Prochaine échéance
          </label>
          <input
            type="date"
            {...register("nextCalibrationDue")}
            className={selectCls}
          />
        </div>
      </div>

      {/* Ligne 3 : Méthode + Fournisseur */}
      <div className="grid grid-cols-1 gap-2 midTablet:grid-cols-2">
        <div className={fieldWrap}>
          <label className={labelCls}>
            <FlaskConical className="size-4" /> Méthode
          </label>
          <input
            type="text"
            {...register("method")}
            className={inputCls}
            placeholder='ex: "ice point", "wet bath"'
            autoComplete="off"
            spellCheck={false}
          />
        </div>

        <div className={fieldWrap}>
          <label className={labelCls}>
            <Building2 className="size-4" /> Fournisseur
          </label>
          <input
            type="text"
            {...register("provider")}
            className={inputCls}
            placeholder="ex: Acme Labs"
            autoComplete="off"
            spellCheck={false}
          />
        </div>
      </div>

      {/* Ligne 4 : Certificat */}
      <div className="grid grid-cols-1">
        <div className={fieldWrap}>
          <label className={labelCls}>
            <LinkIcon className="size-4" /> Certificat (URL)
          </label>
          <input
            type="url"
            {...register("certificateUrl")}
            className={inputCls}
            placeholder="https://…/certificat.pdf"
            autoComplete="off"
            spellCheck={false}
          />
        </div>
      </div>

      {/* Ligne 5 : Notes */}
      <div className="grid grid-cols-1">
        <div className={`${fieldWrap} h-auto`}>
          <label className={labelCls}>
            <FileText className="size-4" /> Notes
          </label>
          <textarea
            rows={4}
            {...register("notes")}
            className={`${textareaCls} min-h-[96px]`}
            placeholder="Observations, numéro de certificat, etc."
          />
        </div>
      </div>

      {/* Actions form */}
      <div className="flex mt-3 flex-col  gap-2 mobile:flex-row">
        <button
          type="submit"
          disabled={isSubmitting}
          className={`text-nowrap ${btnBase} h-[38px] text-white shadow ${isSubmitting ? "bg-darkBlue/40" : "bg-blue"}`}
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
              reset(buildDefaults(null));
              onCancel?.();
            }}
            className={`${btnBase} h-[38px] border border-red bg-white text-red`}
          >
            Annuler
          </button>
        )}
      </div>
    </form>
  );
}
