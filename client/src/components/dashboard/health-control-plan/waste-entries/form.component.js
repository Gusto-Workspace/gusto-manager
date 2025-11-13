// app/(components)/waste/WasteEntriesForm.jsx
"use client";
import { useEffect, useMemo } from "react";
import { useForm } from "react-hook-form";
import axios from "axios";
import {
  CalendarClock,
  FileText,
  Link as LinkIcon,
  Hash,
  ChevronDown,
  Loader2,
} from "lucide-react";

/* ---------- Utils ---------- */
function toDatetimeLocal(value) {
  const d = value ? new Date(value) : new Date();
  if (Number.isNaN(d.getTime())) return "";
  const off = d.getTimezoneOffset() * 60000;
  return new Date(d.getTime() - off).toISOString().slice(0, 16);
}
function uniqLines(text) {
  const lines = (text || "")
    .split(/[\n,;]+/g)
    .map((s) => s.trim())
    .filter(Boolean);
  return Array.from(new Set(lines));
}

/* ---------- Defaults ---------- */
function buildDefaults(rec) {
  return {
    date: toDatetimeLocal(rec?.date ?? new Date()),
    wasteType: rec?.wasteType ?? "organic",
    weightKg:
      rec?.weightKg !== undefined && rec?.weightKg !== null
        ? String(rec.weightKg)
        : "",
    disposalMethod: rec?.disposalMethod ?? "contractor_pickup",
    contractor: rec?.contractor ?? "",
    manifestNumber: rec?.manifestNumber ?? "",
    notes: rec?.notes ?? "",
    attachmentsText: Array.isArray(rec?.attachments)
      ? rec.attachments.join("\n")
      : "",
  };
}

/* ---------- Styles (alignés) ---------- */
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
const btnBase =
  "inline-flex items-center justify-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition active:scale-[0.98]";

export default function WasteEntriesForm({
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
    setValue,
    watch,
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

    const attachments = uniqLines(data.attachmentsText);

    const payload = {
      date: data.date ? new Date(data.date) : new Date(),
      wasteType: data.wasteType,
      weightKg:
        data.weightKg !== "" && data.weightKg != null
          ? Number(data.weightKg)
          : undefined,
      unit: "kg",
      disposalMethod: data.disposalMethod || undefined,
      contractor: data.contractor || undefined,
      manifestNumber: data.manifestNumber || undefined,
      notes: data.notes || undefined,
      attachments, // remplace en update si fourni
    };

    const url = initial?._id
      ? `${process.env.NEXT_PUBLIC_API_URL}/restaurants/${restaurantId}/waste-entries/${initial._id}`
      : `${process.env.NEXT_PUBLIC_API_URL}/restaurants/${restaurantId}/waste-entries`;
    const method = initial?._id ? "put" : "post";

    const { data: saved } = await axios[method](url, payload, {
      headers: { Authorization: `Bearer ${token}` },
    });

    // live update
    window.dispatchEvent(
      new CustomEvent("waste:upsert", { detail: { doc: saved } })
    );

    reset(buildDefaults(null));
    onSuccess?.(saved);
  };

  // Helpers
  const setNow = () =>
    setValue("date", toDatetimeLocal(new Date()), {
      shouldDirty: true,
      shouldTouch: true,
    });

  const attachmentsPreview = uniqLines(watch("attachmentsText"));
  const notesVal = watch("notes");

  return (
    <form
      onSubmit={handleSubmit(onSubmit)}
      className="relative flex flex-col gap-2"
    >
      {/* Ligne 1 : Date / Type / Poids */}
      <div className="grid grid-cols-1 gap-2 midTablet:grid-cols-3">
        {/* Date */}
        <div className={fieldWrap}>
          <label className={labelCls}>
            <CalendarClock className="size-4" /> Date *
          </label>
          <div className="relative flex items-center gap-2">
            <input
              type="datetime-local"
              {...register("date", { required: "Requis" })}
              className={selectCls}
            />
          </div>
          {errors.date && (
            <p className="mt-1 text-xs text-red">{errors.date.message}</p>
          )}
        </div>

        {/* Type de déchet */}
        <div className={fieldWrap}>
          <label className={labelCls}>Type de déchet *</label>
          <div className="relative">
            <select
              {...register("wasteType", { required: "Requis" })}
              className={selectCls}
            >
              <option value="organic">Biodéchets</option>
              <option value="packaging">Emballages</option>
              <option value="cooking_oil">Huiles de cuisson</option>
              <option value="glass">Verre</option>
              <option value="paper">Papier</option>
              <option value="hazardous">Dangereux</option>
              <option value="other">Autre</option>
            </select>
            <ChevronDown className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 size-4 text-darkBlue/40" />
          </div>
          {errors.wasteType && (
            <p className="mt-1 text-xs text-red">{errors.wasteType.message}</p>
          )}
        </div>

        {/* Poids */}
        <div className={fieldWrap}>
          <label className={labelCls}>Poids (kg) *</label>
          <div className="relative">
            <input
              type="number"
              step="0.01"
              min="0"
              inputMode="decimal"
              onWheel={(e) => e.currentTarget.blur()}
              {...register("weightKg", {
                required: "Requis",
                validate: (v) => {
                  const n = Number(v);
                  if (!Number.isFinite(n) || n < 0) return "Valeur invalide";
                  return true;
                },
              })}
              className={`${inputCls} pr-12`}
              placeholder="ex: 12.50"
            />
            <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-[13px] text-darkBlue/50">
              kg
            </span>
          </div>
          {errors.weightKg && (
            <p className="mt-1 text-xs text-red">{errors.weightKg.message}</p>
          )}
        </div>
      </div>

      {/* Ligne 2 : Méthode / Prestataire / Bordereau */}
      <div className="grid grid-cols-1 gap-2 midTablet:grid-cols-3">
        <div className={fieldWrap}>
          <label className={labelCls}>Méthode d’élimination</label>
          <div className="relative">
            <select {...register("disposalMethod")} className={selectCls}>
              <option value="contractor_pickup">
                Collecteur (prestataire)
              </option>
              <option value="compost">Compost</option>
              <option value="recycle">Recyclage</option>
              <option value="landfill">Enfouissement</option>
              <option value="incineration">Incinération</option>
              <option value="other">Autre</option>
            </select>
            <ChevronDown className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 size-4 text-darkBlue/40" />
          </div>
        </div>

        <div className={fieldWrap}>
          <label className={labelCls}>Prestataire</label>
          <input
            type="text"
            {...register("contractor")}
            className={inputCls}
            placeholder="Nom du collecteur"
            autoComplete="off"
            spellCheck={false}
            autoCorrect="off"
          />
        </div>

        <div className={fieldWrap}>
          <label className={labelCls}>
            <Hash className="size-4" /> Bordereau / N°
          </label>
          <input
            type="text"
            {...register("manifestNumber")}
            className={inputCls}
            placeholder="Référence / numéro de suivi"
            autoComplete="off"
            spellCheck={false}
            autoCorrect="off"
          />
        </div>
      </div>

      {/* Notes / Pièces */}
      <div className="grid grid-cols-1 gap-2 midTablet:grid-cols-2">
        <div className={fieldWrap.replace("h-[80px]", "h-auto")}>
          <label className={labelCls}>
            <FileText className="size-4" /> Notes
          </label>
          <div className="relative">
            <textarea
              rows={4}
              {...register("notes")}
              className={textareaCls}
              placeholder="Observations, consignes, etc."
            />
            <span className="pointer-events-none absolute bottom-2 right-3 select-none text-[11px] text-darkBlue/40">
              {(notesVal?.length ?? 0).toString()}
            </span>
          </div>
        </div>

        <div className={fieldWrap.replace("h-[80px]", "h-auto")}>
          <label className={labelCls}>
            <LinkIcon className="size-4" /> Pièces (URLs, 1 par ligne)
          </label>
          <textarea
            rows={4}
            {...register("attachmentsText", {
              onBlur: (e) => {
                const cleaned = uniqLines(e.target.value).join("\n");
                setValue("attachmentsText", cleaned, {
                  shouldDirty: true,
                  shouldTouch: true,
                });
              },
            })}
            className={textareaCls}
            placeholder={"https://…/bon-enlevement.pdf\nhttps://…/photo.jpg"}
          />
          {!!attachmentsPreview.length && (
            <div className="mt-2 flex flex-wrap gap-1">
              {attachmentsPreview.map((u) => (
                <a
                  key={u}
                  href={u}
                  target="_blank"
                  rel="noreferrer"
                  className="rounded-md bg-darkBlue/10 px-2 py-0.5 text-[11px] text-darkBlue/70 hover:underline"
                  title={u}
                >
                  {u.length > 38 ? `${u.slice(0, 35)}…` : u}
                </a>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Actions */}
      <div className="flex flex-col items-center gap-2 mt-3 mobile:flex-row">
        <button
          type="submit"
          disabled={isSubmitting}
          className="text-nowrap inline-flex items-center justify-center gap-2 h-[38px] rounded-lg bg-blue px-4 py-2 text-sm font-medium text-white shadow disabled:opacity-60"
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
