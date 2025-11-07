"use client";
import { useEffect } from "react";
import { useForm } from "react-hook-form";
import axios from "axios";
import { MapPin, Thermometer, CalendarClock, Loader2, FileText, ChevronDown } from "lucide-react";

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
    zoneRef: "", // sélection zone
    location: record?.location ?? "",
    locationId: record?.locationId ?? "",
    value: record?.value ?? "",
    unit: record?.unit ?? "°C",
    note: record?.note ?? "",
    createdAt: toDatetimeLocalValue(record?.createdAt),
  };
}

// essaie de retrouver la zone pour un doc existant
function resolveZoneRefFromInitial(initial, zones = []) {
  if (!initial || !Array.isArray(zones) || zones.length === 0) return "";
  // 1) match sur zoneCode
  if (initial.locationId) {
    const byCode = zones.find((z) => (z?.zoneCode || "") === (initial.locationId || ""));
    if (byCode) return String(byCode._id);
  }
  // 2) match sur nom
  if (initial.location) {
    const byName = zones.find((z) => (z?.name || "") === (initial.location || ""));
    if (byName) return String(byName._id);
  }
  return "";
}

export default function GenericTemperatureForm({
  restaurantId,
  zones = [],
  initial = null,
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

  const zoneRef = watch("zoneRef");
  const selected = Array.isArray(zones)
    ? zones.find((z) => String(z._id) === String(zoneRef))
    : null;
  const selectedUnit = selected?.unit || watch("unit") || "°C";

  useEffect(() => {
    reset(buildFormDefaults(initial));
  }, [initial, reset]);

  // pré-sélection en édition
  useEffect(() => {
    if (!initial) return;
    const id = resolveZoneRefFromInitial(initial, zones);
    if (id) {
      setValue("zoneRef", id, { shouldDirty: false, shouldTouch: false });
    }
  }, [initial, zones, setValue]);

  // refléter zone -> location/locationId/unit (hidden)
  useEffect(() => {
    if (!selected) return;
    setValue("location", selected.name || "", { shouldDirty: true });
    setValue("locationId", selected.zoneCode || "", { shouldDirty: true });
    setValue("unit", selected.unit || "°C", { shouldDirty: true });
  }, [selected, setValue]);

  const onSubmit = async (data) => {
    const token =
      (typeof window !== "undefined" && localStorage.getItem("token")) || "";
    if (!token) return;

    const payload = {
      location: data.location,        // depuis zone
      locationId: data.locationId || undefined, // depuis zone
      value: Number(data.value),
      unit: data.unit,                // depuis zone
      note: data.note || undefined,
      createdAt: data.createdAt ? new Date(data.createdAt) : undefined,
    };

    const url = initial?._id
      ? `${process.env.NEXT_PUBLIC_API_URL}/restaurants/${restaurantId}/generic-temperatures/${initial._id}`
      : `${process.env.NEXT_PUBLIC_API_URL}/restaurants/${restaurantId}/generic-temperatures`;
    const method = initial?._id ? "put" : "post";

    const { data: saved } = await axios[method](url, payload, {
      headers: { Authorization: `Bearer ${token}` },
    });

    reset(buildFormDefaults(null));
    onSuccess?.(saved);
  };

  // Styles
  const fieldWrap =
    "group relative rounded-xl bg-white/50 backdrop-blur-sm px-3 py-2 h-[80px] transition-shadow";
  const labelCls =
    "flex items-center gap-2 text-xs font-medium text-darkBlue/60 mb-1";
  const inputCls =
    "h-11 w-full rounded-lg border border-darkBlue/20 bg-white px-3 text-[15px] outline-none transition placeholder:text-darkBlue/40";
  const selectCls =
    "h-11 w-full appearance-none rounded-lg border border-darkBlue/20 bg-white px-3 text-[15px] outline-none transition";
  const btnBase =
    "inline-flex items-center justify-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition active:scale-[0.98]";

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="relative flex flex-col gap-2">
      {/* Ligne 1 : Zone / Température */}
      <div className="grid grid-cols-1 gap-2 midTablet:grid-cols-2">
        {/* Zone */}
        <div className={fieldWrap}>
          <label className={labelCls}>
            <MapPin className="size-4" /> Zone *
          </label>
          <div className="relative">
            <select
              {...register("zoneRef", { required: "Requis" })}
              className={`${selectCls} ${errors.zoneRef ? "border-red focus:ring-red/20" : ""}`}
              disabled={!!initial?._id}
              aria-invalid={!!errors.zoneRef}
            >
              <option value="">— Sélectionner —</option>
              {zones
                .slice()
                .sort((a, b) => String(a?.name || "").localeCompare(String(b?.name || ""), "fr"))
                .map((z) => (
                  <option key={z._id} value={z._id}>
                    {z.name}{z.zoneCode ? ` — ${z.zoneCode}` : ""}
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
              placeholder="ex: 22.5"
              onWheel={(e) => e.currentTarget.blur()}
              {...register("value", {
                required: "Requis",
                validate: (v) => (Number.isFinite(Number(v)) ? true : "Invalide"),
              })}
              className={`${inputCls} text-right pr-12 ${errors.value ? "border-red focus:ring-red/20" : ""}`}
              aria-invalid={!!errors.value}
            />
            <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 select-none rounded-md bg-darkBlue/10 px-2 py-1 text-xs text-darkBlue/60">
              {selectedUnit}
            </span>
          </div>
          {errors.value && (
            <p className="mt-1 text-xs text-red">{errors.value.message}</p>
          )}
        </div>
      </div>

      {/* Ligne 2 : Date/heure / Note */}
      <div className="grid grid-cols-1 gap-2 midTablet:grid-cols-[1fr,2fr]">
        <div className={fieldWrap}>
          <label className={labelCls}>
            <CalendarClock className="size-4" /> Date / heure mesure
          </label>
          <input type="datetime-local" {...register("createdAt")} className={selectCls} />
        </div>

        <div className={fieldWrap}>
          <label className={labelCls}>
            <FileText className="size-4" /> Note
          </label>
          <textarea
            rows={1}
            {...register("note")}
            className="w-full resize-none rounded-lg border border-darkBlue/20 bg-white p-2 pr-16 text-[15px] outline-none transition placeholder:text-darkBlue/40"
            placeholder="Contexte, consigne attendue, action corrective…"
          />
        </div>
      </div>

      {/* Champs cachés mappés depuis la zone */}
      <input type="hidden" {...register("location", { required: true })} />
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
            <>
              <Loader2 className="size-4 animate-spin" /> Enregistrement…
            </>
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
