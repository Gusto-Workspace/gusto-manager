// components/dashboard/health-control-plan/service-temperature/form.component.jsx
"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { useForm } from "react-hook-form";
import axios from "axios";
import {
  MapPin,
  Thermometer,
  CalendarClock,
  ChevronDown,
  FileText,
  UtensilsCrossed,
  Tag,
  Loader2,
} from "lucide-react";

function toDatetimeLocalValue(value) {
  const base = value ? new Date(value) : new Date();
  if (Number.isNaN(base.getTime()))
    return new Date().toISOString().slice(0, 16);
  const offset = base.getTimezoneOffset() * 60000;
  return new Date(base.getTime() - offset).toISOString().slice(0, 16);
}

function buildFormDefaults(record) {
  return {
    serviceArea: record?.serviceArea ?? "",
    plateId: record?.plateId ?? "",
    dishName: record?.dishName ?? "",
    servingMode: record?.servingMode ?? "pass",
    serviceType: record?.serviceType ?? "unknown",
    value: record?.value ?? "",
    note: record?.note ?? "",
    createdAt: toDatetimeLocalValue(record?.createdAt ?? new Date()),
  };
}

function fmtDate(d) {
  try {
    const date = new Date(d);
    if (Number.isNaN(date.getTime())) return "";
    return new Intl.DateTimeFormat("fr-FR", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    }).format(date);
  } catch {
    return "";
  }
}

// libellés FR pour les selects
const MODE_OPTS = [
  { value: "pass", label: "Passe" },
  { value: "buffet-hot", label: "Buffet (chaud)" },
  { value: "buffet-cold", label: "Buffet (froid)" },
  { value: "table", label: "Service à table" },
  { value: "delivery", label: "Livraison" },
  { value: "takeaway", label: "À emporter" },
  { value: "room-service", label: "Room service" },
  { value: "catering", label: "Traiteur" },
  { value: "other", label: "Autre" },
];

const TYPE_OPTS = [
  { value: "unknown", label: "—" },
  { value: "hot", label: "Chaud" },
  { value: "cold", label: "Froid" },
];

export default function ServiceTemperatureForm({
  restaurantId,
  zones = [], // [{ _id, name, unit, ... }]
  initial = null,
  onSuccess,
  onCancel,
}) {
  const {
    register,
    handleSubmit,
    reset,
    watch,
    setValue,
    formState: { errors, isSubmitting },
  } = useForm({ defaultValues: buildFormDefaults(initial) });

  // dropdown state + guard to avoid opening on edit
  const token = useMemo(
    () =>
      typeof window !== "undefined" ? localStorage.getItem("token") : null,
    []
  );
  const dishName = watch("dishName");
  const [batchOpen, setBatchOpen] = useState(false);
  const [batchLoading, setBatchLoading] = useState(false);
  const [batchItems, setBatchItems] = useState([]);
  const dishBoxRef = useRef(null);
  const userTypedRef = useRef(false);

  useEffect(() => {
    reset(buildFormDefaults(initial));
    setBatchOpen(false);
    userTypedRef.current = false; // ne pas ouvrir à l’édition
  }, [initial, reset]);

  // Styles (alignés sur PreheatTemperatureForm)
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

  // Unité affichée = unité de la zone sélectionnée
  const serviceArea = watch("serviceArea");
  const selectedUnit = useMemo(() => {
    const z = zones.find((x) => String(x.name) === String(serviceArea));
    return z?.unit || "°C";
  }, [zones, serviceArea]);

  // Fermer le menu au clic extérieur
  useEffect(() => {
    const onClickOutside = (e) => {
      if (!dishBoxRef.current) return;
      if (!dishBoxRef.current.contains(e.target)) setBatchOpen(false);
    };
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, []);

  // Recherche des batches (n’ouvre que si l’utilisateur tape)
  useEffect(() => {
    let cancel = false;
    if (!restaurantId || !token) return;

    const q = String(dishName || "").trim();

    if (!userTypedRef.current) {
      setBatchOpen(false);
      return;
    }

    if (q.length < 2) {
      setBatchItems([]);
      setBatchOpen(false);
      return;
    }

    const t = setTimeout(async () => {
      setBatchLoading(true);
      try {
        const url = `${process.env.NEXT_PUBLIC_API_URL}/restaurants/${restaurantId}/list-recipe-batches`;
        const { data } = await axios.get(url, {
          headers: { Authorization: `Bearer ${token}` },
          params: { q, limit: 8, page: 1 },
        });
        if (cancel) return;
        const items = Array.isArray(data?.items) ? data.items : [];
        setBatchItems(items);
        setBatchOpen(true);
      } catch {
        if (!cancel) {
          setBatchItems([]);
          setBatchOpen(false);
        }
      } finally {
        if (!cancel) setBatchLoading(false);
      }
    }, 250);

    return () => {
      cancel = true;
      clearTimeout(t);
    };
  }, [dishName, restaurantId, token]);

  const pickBatch = (it) => {
    setValue("dishName", it?.recipeId || "");
    setValue("plateId", it?.batchId || "");
    setBatchOpen(false);
    userTypedRef.current = false;
  };

  const onSubmit = async (data) => {
    const tk = localStorage.getItem("token");
    if (!tk) return;

    const payload = {
      serviceArea: data.serviceArea, // zone (label)
      plateId: data.plateId || undefined,
      dishName: data.dishName || undefined,
      servingMode: data.servingMode || undefined,
      serviceType: data.serviceType || undefined,
      value: Number(data.value),
      unit: selectedUnit, // unité issue de la zone (UI sans input dédié)
      note: data.note || undefined,
      createdAt: data.createdAt ? new Date(data.createdAt) : undefined,
    };

    const url = initial?._id
      ? `${process.env.NEXT_PUBLIC_API_URL}/restaurants/${restaurantId}/service-temperatures/${initial._id}`
      : `${process.env.NEXT_PUBLIC_API_URL}/restaurants/${restaurantId}/service-temperatures`;
    const method = initial?._id ? "put" : "post";

    const { data: saved } = await axios[method](
      url,
      {
        ...payload,
      },
      { headers: { Authorization: `Bearer ${tk}` } }
    );

    reset(buildFormDefaults(null));
    setBatchOpen(false);
    userTypedRef.current = false;
    onSuccess?.(saved);
  };

  return (
    <form
      onSubmit={handleSubmit(onSubmit)}
      className="relative flex flex-col gap-2"
    >
      {/* Ligne 1 : Zone / Température / Type */}
      <div className="grid grid-cols-1 gap-2 midTablet:grid-cols-3">
        {/* Zone (select) */}
        <div className={fieldWrap}>
          <label className={labelCls}>
            <MapPin className="size-4" /> Zone de service *
          </label>
          <div className="relative">
            <select
              {...register("serviceArea", { required: "Requis" })}
              className={`${selectCls} ${errors.serviceArea ? "border-red focus:ring-red/20" : ""}`}
              disabled={!!initial?._id}
              aria-invalid={!!errors.serviceArea}
            >
              <option value="">— Sélectionner —</option>
              {(zones || []).map((z) => (
                <option key={z._id || z.name} value={z.name}>
                  {z.name}
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
              placeholder="ex: 63.0"
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

        {/* Type de service */}
        <div className={fieldWrap}>
          <label className={labelCls}>Type de service</label>
          <div className="relative">
            <select {...register("serviceType")} className={selectCls}>
              {TYPE_OPTS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
            <ChevronDown className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 size-4 text-darkBlue/40" />
          </div>
        </div>
      </div>

      {/* Ligne 2 : Mode / Plat / Lot */}
      <div className="grid grid-cols-1 gap-2 midTablet:grid-cols-3">
        {/* Mode de service */}
        <div className={fieldWrap}>
          <label className={labelCls}>Mode de service</label>
          <div className="relative">
            <select {...register("servingMode")} className={selectCls}>
              {MODE_OPTS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
            <ChevronDown className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 size-4 text-darkBlue/40" />
          </div>
        </div>

        {/* Plat / préparation (avec suggestions) */}
        <div
          className={`${fieldWrap} ${batchOpen ? "z-40" : "z-auto"}`}
          ref={dishBoxRef}
        >
          <label className={labelCls}>
            <UtensilsCrossed className="size-4" /> Plat / préparation
          </label>
          <div className="relative">
            <input
              type="text"
              placeholder="ex: Lasagnes bœuf, Velouté potimarron…"
              {...register("dishName", {
                onChange: () => {
                  userTypedRef.current = true;
                },
              })}
              className={inputCls}
              autoComplete="off"
              spellCheck={false}
              autoCorrect="off"
            />
            {/* Dropdown suggestions */}
            {batchOpen && (
              <div
                className="absolute left-0 right-0 top-full mt-1 z-50 rounded-lg border border-darkBlue/15 bg-white shadow max-h-64 overflow-auto"
                role="listbox"
                aria-label="Suggestions de batches"
              >
                {!batchLoading &&
                  batchItems.map((it) => (
                    <button
                      key={it._id}
                      type="button"
                      onClick={() => pickBatch(it)}
                      className="w-full text-left px-3 py-2 hover:bg-blue/5 text-sm"
                      role="option"
                      title="Cliquer pour préremplir"
                    >
                      <div className="font-medium text-darkBlue">
                        {it?.recipeId || "(recette sans nom)"}{" "}
                        {it?.batchId ? (
                          <span className="text-darkBlue/60">
                            • Lot {it.batchId}
                          </span>
                        ) : null}
                      </div>
                      <div className="text-[12px] text-darkBlue/60">
                        Préparé le {fmtDate(it?.preparedAt)}
                      </div>
                    </button>
                  ))}
              </div>
            )}
          </div>
        </div>

        {/* Identifiant plat / lot */}
        <div className={fieldWrap}>
          <label className={labelCls}>
            <Tag className="size-4" /> Identifiant plat
          </label>
          <input
            type="text"
            placeholder="ID plat / lot (optionnel)"
            {...register("plateId")}
            className={inputCls}
            autoComplete="off"
            spellCheck={false}
            autoCorrect="off"
          />
        </div>
      </div>

      {/* Ligne 3 : Date / Notes */}
      <div className="grid grid-cols-1 gap-2 midTablet:grid-cols-[1fr,2fr]">
        <div className={fieldWrap}>
          <label className={labelCls}>
            <CalendarClock className="size-4" /> Date / heure
          </label>
          <div className="relative">
            <input
              type="datetime-local"
              {...register("createdAt")}
              className={selectCls}
            />
            {/* Chevron masqué pour alignement visuel */}
            <ChevronDown className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 size-4 opacity-0" />
          </div>
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
              reset(buildFormDefaults(null));
              setBatchOpen(false);
              userTypedRef.current = false;
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
