// components/dashboard/health-control-plan/postheat-temperature/form.component.jsx
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
  Ruler,
  FileText,
} from "lucide-react";
import axios from "axios";

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

function buildFormDefaults(record) {
  return {
    deviceRef: "",
    equipmentName: record?.equipmentName ?? "",
    equipmentId: record?.equipmentId ?? "",
    location: record?.location ?? "",
    locationId: record?.locationId ?? "",
    value: record?.value ?? "",
    unit: record?.unit ?? "°C",
    probeType: record?.probeType ?? "core",
    phase: record?.phase ?? "postheat",
    note: record?.note ?? "",
    createdAt: toDatetimeLocalValue(record?.createdAt),
  };
}

function resolveDeviceRefFromInitial(initial, equipments) {
  if (!initial || !Array.isArray(equipments) || equipments.length === 0)
    return "";
  if (initial.equipmentId) {
    const byCode = equipments.find(
      (e) =>
        e?.equipmentCode &&
        String(e.equipmentCode) === String(initial.equipmentId)
    );
    if (byCode) return String(byCode._id);
  }
  if (initial.equipmentName && initial.locationId) {
    const byNameLocCode = equipments.find(
      (e) =>
        (e?.name || "") === (initial.equipmentName || "") &&
        (e?.locationCode || "") === (initial.locationId || "")
    );
    if (byNameLocCode) return String(byNameLocCode._id);
  }
  if (initial.equipmentName && initial.location) {
    const byNameLoc = equipments.find(
      (e) =>
        (e?.name || "") === (initial.equipmentName || "") &&
        (e?.location || "") === (initial.location || "")
    );
    if (byNameLoc) return String(byNameLoc._id);
  }
  if (initial.equipmentName) {
    const byName = equipments.find(
      (e) => (e?.name || "") === (initial.equipmentName || "")
    );
    if (byName) return String(byName._id);
  }
  return "";
}

export default function PostheatTemperatureForm({
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
  } = useForm({ defaultValues: buildFormDefaults(initial) });

  const deviceRef = watch("deviceRef");
  const selected =
    equipments.find((e) => String(e._id) === String(deviceRef)) || null;

  const selectedUnit = selected?.unit || watch("unit") || "°C";

  useEffect(() => {
    reset(buildFormDefaults(initial));
  }, [initial, reset]);

  useEffect(() => {
    if (!initial) return;
    const guessId = resolveDeviceRefFromInitial(initial, equipments);
    if (guessId) {
      setValue("deviceRef", guessId, {
        shouldDirty: false,
        shouldTouch: false,
      });
    }
  }, [initial, equipments, setValue]);

  useEffect(() => {
    if (!selected) return;
    setValue("equipmentName", selected.name || "", { shouldDirty: true });
    setValue("equipmentId", selected.equipmentCode || "", {
      shouldDirty: true,
    });
    setValue("location", selected.location || "", { shouldDirty: true });
    setValue("locationId", selected.locationCode || "", { shouldDirty: true });
    setValue("unit", selected.unit || "°C", { shouldDirty: true });
  }, [selected, setValue]);

  // Styles (alignés à preheat)
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

  const onSubmit = async (data) => {
    const token =
      (typeof window !== "undefined" && localStorage.getItem("token")) || "";
    if (!token) return;

    const payload = {
      equipmentName: data.equipmentName,
      equipmentId: data.equipmentId || undefined,
      location: data.location || undefined,
      locationId: data.locationId || undefined,
      value: Number(data.value),
      unit: data.unit,
      probeType: data.probeType || undefined,
      phase: data.phase || undefined,
      note: data.note || undefined,
      createdAt: data.createdAt ? new Date(data.createdAt) : undefined,
    };

    const url = initial?._id
      ? `${process.env.NEXT_PUBLIC_API_URL}/restaurants/${restaurantId}/postheat-temperatures/${initial._id}`
      : `${process.env.NEXT_PUBLIC_API_URL}/restaurants/${restaurantId}/postheat-temperatures`;
    const method = initial?._id ? "put" : "post";

    const { data: saved } = await axios[method](url, payload, {
      headers: { Authorization: `Bearer ${token}` },
    });

    reset(buildFormDefaults(null));
    onSuccess?.(saved);
  };

  return (
    <form
      onSubmit={handleSubmit(onSubmit)}
      className="relative flex flex-col gap-2"
    >
      {/* Ligne 1 : Appareil / Température / Phase */}
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
              placeholder="ex: 75.0"
              onWheel={(e) => e.currentTarget.blur()}
              aria-invalid={!!errors.value}
              {...register("value", {
                required: "Requis",
                validate: (v) =>
                  Number.isFinite(Number(v)) ? true : "Invalide",
              })}
              className={`${inputCls} text-right pr-12 ${errors.value ? "border-red focus:ring-red/20" : ""}`}
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
              <option value="postheat">Fin de cuisson</option>
              <option value="reheat">Remise en T°</option>
              <option value="hot-holding">Maintien chaud</option>
            </select>
            <ChevronDown className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 size-4 text-darkBlue/40" />
          </div>
        </div>
      </div>

      {/* Ligne 2 : Type de mesure + Date/heure */}
      <div className="grid grid-cols-1 gap-2 midTablet:grid-cols-2">
        <div className={fieldWrap}>
          <label className={labelCls}>
            <Ruler className="size-4" /> Type de mesure
          </label>
          <div className="relative">
            <select {...register("probeType")} className={selectCls}>
              <option value="core">Cœur (noyau)</option>
              <option value="surface">Surface</option>
              <option value="ambient">Air (enceinte)</option>
              <option value="oil">Huile</option>
              <option value="other">Autre</option>
            </select>
            <ChevronDown className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 size-4 text-darkBlue/40" />
          </div>
        </div>

        <div className={fieldWrap}>
          <label className={labelCls}>
            <CalendarClock className="size-4" /> Date / heure mesure
          </label>
          <input
            type="datetime-local"
            {...register("createdAt")}
            className={selectCls}
          />
        </div>
      </div>

      {/* Note */}
      <div className={fieldWrap}>
        <label className={labelCls}>
          <FileText className="size-4" /> Note
        </label>
        <textarea
          rows={1}
          {...register("note")}
          className="w-full resize-none rounded-lg border border-darkBlue/20 bg-white p-2 pr-16 text-[15px] outline-none transition placeholder:text-darkBlue/40"
          placeholder="Informations complémentaires…"
        />
      </div>

      {/* Champs cachés pour l’API post-heat */}
      <input type="hidden" {...register("equipmentName", { required: true })} />
      <input type="hidden" {...register("equipmentId")} />
      <input type="hidden" {...register("location")} />
      <input type="hidden" {...register("locationId")} />
      <input type="hidden" {...register("unit")} />

      {/* Actions */}
      <div className="mt-3 flex flex-col gap-2 mobile:flex-row">
        <button
          type="submit"
          disabled={isSubmitting}
          className={`${btnBase} bg-blue border border-blue text-white disabled:opacity-60`}
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
              reset(buildFormDefaults(null));
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
