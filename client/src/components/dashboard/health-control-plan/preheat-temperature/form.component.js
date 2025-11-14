// app/(components)/dashboard/health-control-plan/preheat-temperature/form.component.jsx
"use client";
import { useEffect } from "react";
import { useForm } from "react-hook-form";
import {
  Thermometer,
  CalendarClock,
  ChevronDown,
  Loader2,
  HardDrive,
  Flame,
  FileText,
} from "lucide-react";
import axios from "axios";

function toDatetimeLocalValue(value) {
  const base = value ? new Date(value) : new Date();
  if (Number.isNaN(base.getTime()))
    return new Date().toISOString().slice(0, 16);
  const offset = base.getTimezoneOffset() * 60000;
  return new Date(base.getTime() - offset).toISOString().slice(0, 16);
}

function buildDefaults(record) {
  return {
    deviceRef: record?.deviceRef ?? "",
    value: record?.value ?? "",
    unit: record?.unit ?? "°C",
    phase: record?.phase ?? "preheat",
    note: record?.note ?? "",
    createdAt: toDatetimeLocalValue(record?.createdAt ?? new Date()),
  };
}

export default function PreheatTemperatureForm({
  restaurantId,
  initial = null,
  equipments = [],
  onSuccess,
  onCancel,
}) {
  const {
    register,
    handleSubmit,
    reset,
    watch,
    formState: { errors, isSubmitting },
    setValue,
  } = useForm({ defaultValues: buildDefaults(initial) });

  const deviceRef = watch("deviceRef");
  const selectedUnit =
    equipments.find((e) => String(e._id) === String(deviceRef))?.unit || "°C";

  useEffect(() => {
    reset(buildDefaults(initial));
  }, [initial, reset]);

  useEffect(() => {
    // refléter l’unité de l’appareil sélectionné côté UI
    setValue("unit", selectedUnit, { shouldTouch: false, shouldDirty: false });
  }, [selectedUnit, setValue]);

  const onSubmit = async (data) => {
    const token = localStorage.getItem("token");
    if (!token) return;

    const payload = {
      deviceRef: data.deviceRef, // required
      value: Number(data.value),
      phase: data.phase || "preheat",
      note: data.note || undefined,
      createdAt: data.createdAt ? new Date(data.createdAt) : undefined,
      // Pas d’unité envoyée: le serveur la prend depuis le snapshot de l’appareil
    };

    const url = initial?._id
      ? `${process.env.NEXT_PUBLIC_API_URL}/restaurants/${restaurantId}/preheat-temperatures/${initial._id}`
      : `${process.env.NEXT_PUBLIC_API_URL}/restaurants/${restaurantId}/preheat-temperatures`;
    const method = initial?._id ? "put" : "post";

    const { data: saved } = await axios[method](url, payload, {
      headers: { Authorization: `Bearer ${token}` },
    });

    reset(buildDefaults(null));
    onSuccess?.(saved);
  };

  // Styles alignés
  const fieldWrap =
    "group relative rounded-xl bg-white/50   px-3 py-2 h-[80px] transition-shadow";
  const labelCls =
    "flex items-center gap-2 text-xs font-medium text-darkBlue/60 mb-1";
  const inputCls =
    "h-11 w-full rounded-lg border border-darkBlue/20 bg-white px-3 text-[15px] outline-none transition placeholder:text-darkBlue/40";
  const selectCls =
    "h-11 w-full appearance-none rounded-lg border border-darkBlue/20 bg-white px-3 text-[15px] outline-none transition";
  const btnBase =
    "inline-flex items-center justify-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition active:scale-[0.98]";

  return (
    <form
      onSubmit={handleSubmit(onSubmit)}
      className="relative flex flex-col gap-2"
    >
      {/* Ligne 1 : Appareil / Valeur / Phase */}
      <div className="grid grid-cols-1 gap-2 midTablet:grid-cols-3">
        {/* Appareil */}
        <div className={fieldWrap}>
          <label className={labelCls}>
            <HardDrive className="size-4" /> Appareil *
          </label>
          <div className="relative">
            <select
              {...register("deviceRef", { required: "Requis" })}
              className={`${selectCls} ${errors.deviceRef ? "border-red focus:ring-red/20" : ""}`}
              disabled={!!initial?._id}
              aria-invalid={!!errors.deviceRef}
            >
              <option value="">— Sélectionner —</option>
              {equipments.map((d) => (
                <option key={d._id} value={d._id}>
                  {d.name}
                  {d.location ? ` — ${d.location}` : ""}
                </option>
              ))}
            </select>
            <ChevronDown className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 size-4 text-darkBlue/40" />
          </div>
        </div>

        {/* Température */}
        <div className={fieldWrap}>
          <label className={labelCls}>
            <Thermometer className="size-4" /> Température *
          </label>
          <div className="relative">
            <input
              type="number"
              step="0.1"
              placeholder="ex: 180"
              onWheel={(e) => e.currentTarget.blur()}
              {...register("value", {
                required: "Requis",
                validate: (v) =>
                  Number.isFinite(Number(v)) ? true : "Invalide",
              })}
              className={`${inputCls} text-right pr-12 ${errors.value ? "border-red focus:ring-red/20" : ""}`}
              aria-invalid={!!errors.value}
            />
            <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 select-none rounded-md bg-darkBlue/10 px-2 py-1 text-xs text-darkBlue/60">
              {selectedUnit}
            </span>
          </div>
        </div>

        {/* Phase */}
        <div className={fieldWrap}>
          <label className={labelCls}>
            <Flame className="size-4" /> Phase
          </label>
          <div className="relative">
            <select {...register("phase")} className={selectCls}>
              <option value="preheat">Mise en chauffe</option>
              <option value="hot-holding">Maintien au chaud</option>
            </select>
            <ChevronDown className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 size-4 text-darkBlue/40" />
          </div>
        </div>
      </div>

      {/* Ligne 2 : Date / Notes */}
      <div className="grid grid-cols-1 gap-2 midTablet:grid-cols-[1fr,2fr]">
        <div className={fieldWrap}>
          <label className={labelCls}>
            <CalendarClock className="size-4" /> Date / heure
          </label>
          <input
            type="datetime-local"
            {...register("createdAt")}
            className={selectCls}
          />
        </div>

        <div className={fieldWrap}>
          <label className={labelCls}>
            <FileText className="size-4" /> Notes
          </label>
          <textarea
            rows={1}
            {...register("note")}
            className="w-full resize-none rounded-lg border border-darkBlue/20 bg-white p-2 pr-16 text-[15px] outline-none transition placeholder:text-darkBlue/40"
            placeholder="Informations complémentaires…"
          />
        </div>
      </div>

      {/* Actions */}
      <div className="mt-3 flex flex-col gap-2 mobile:flex-row">
        <button
          type="submit"
          disabled={isSubmitting}
          className={`${btnBase} bg-blue border-blue border text-white disabled:opacity-60`}
        >
          {isSubmitting ? (
            <div className="flex items-center gap-2">
              <Loader2 className="size-4 animate-spin" />
              <span>Enregistrement…</span>
            </div>
          ) : (
            <>
              <Thermometer className="size-4" />
              {initial?._id ? "Mettre à jour" : "Enregistrer"}
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
            className={`${btnBase} border border-red bg-white text-red`}
          >
            Annuler
          </button>
        )}
      </div>
    </form>
  );
}
