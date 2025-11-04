"use client";
import { useEffect } from "react";
import { useForm } from "react-hook-form";
import axios from "axios";
import {
  CalendarClock,
  FileText,
  Hash,
  Link as LinkIcon,
  ChevronDown,
  Loader2,
} from "lucide-react";

function toDatetimeLocal(value) {
  if (!value) return "";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "";
  const offset = d.getTimezoneOffset() * 60000;
  return new Date(d.getTime() - offset).toISOString().slice(0, 16);
}

function buildDefaults(rec) {
  return {
    // Échantillon
    sampleType: rec?.sampleType ?? "surface", // surface | food | water
    sampledAt: toDatetimeLocal(rec?.sampledAt ?? new Date()),
    analysedAt: toDatetimeLocal(rec?.analysedAt),

    // Identif / contexte
    samplingPoint: rec?.samplingPoint ?? "",
    productName: rec?.productName ?? "",
    lotNumber: rec?.lotNumber ?? "",

    // Labo
    labName: rec?.labName ?? "",
    labReference: rec?.labReference ?? "",

    // Méthode / critère
    method: rec?.method ?? "",
    detectionLimit: rec?.detectionLimit ?? "",
    criterion: rec?.criterion ?? "",

    // Résultats
    parameter: rec?.parameter ?? "",
    result: rec?.result ?? "",
    unit: rec?.unit ?? "",
    passed: typeof rec?.passed === "boolean" ? rec.passed : false,

    // Pièces / notes
    reportUrl: rec?.reportUrl ?? "",
    notes: rec?.notes ?? "",
  };
}

export default function MicrobiologyForm({
  restaurantId,
  initial = null,
  onSuccess,
  onCancel,
}) {
  const {
    register,
    handleSubmit,
    reset,
    setValue,
    watch,
    formState: { errors, isSubmitting },
  } = useForm({ defaultValues: buildDefaults(initial) });

  useEffect(() => {
    reset(buildDefaults(initial));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initial]);

  const onSubmit = async (data) => {
    const token = localStorage.getItem("token");
    if (!token) return;

    const payload = {
      // Échantillon
      sampleType: data.sampleType || "surface",
      sampledAt: data.sampledAt ? new Date(data.sampledAt) : new Date(),
      analysedAt: data.analysedAt ? new Date(data.analysedAt) : undefined,

      // Identif / contexte
      samplingPoint: data.samplingPoint || undefined,
      productName: data.productName || undefined,
      lotNumber: data.lotNumber || undefined,

      // Labo
      labName: data.labName || undefined,
      labReference: data.labReference || undefined,

      // Méthode / critère
      method: data.method || undefined,
      detectionLimit: data.detectionLimit || undefined,
      criterion: data.criterion || undefined,

      // Résultats
      parameter: data.parameter || undefined,
      result: data.result || undefined,
      unit: data.unit || undefined,
      passed: !!data.passed,

      // Pièces / notes
      reportUrl: data.reportUrl || undefined,
      notes: data.notes || undefined,
    };

    const url = initial?._id
      ? `${process.env.NEXT_PUBLIC_API_URL}/restaurants/${restaurantId}/microbiology/${initial._id}`
      : `${process.env.NEXT_PUBLIC_API_URL}/restaurants/${restaurantId}/microbiology`;
    const method = initial?._id ? "put" : "post";

    const { data: saved } = await axios[method](url, payload, {
      headers: { Authorization: `Bearer ${token}` },
    });

    window.dispatchEvent(
      new CustomEvent("microbiology:upsert", { detail: { doc: saved } })
    );

    reset(buildDefaults(null));
    onSuccess?.(saved);
  };

  // Helpers
  const setNow = (field) =>
    setValue(field, toDatetimeLocal(new Date()), {
      shouldDirty: true,
      shouldTouch: true,
    });

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
    "inline-flex items-center justify-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition active:scale-[0.98]";

  const notesVal = watch("notes");
  const passed = watch("passed"); // boolean

  return (
    <form
      onSubmit={handleSubmit(onSubmit)}
      className="relative flex flex-col gap-2"
    >
      {/* Ligne 1 : Échantillon */}
      <div className="grid grid-cols-1 gap-2 midTablet:grid-cols-3">
        {/* Type d’échantillon */}
        <div className={fieldWrap}>
          <label className={labelCls}>Type d’échantillon *</label>
          <div className="relative">
            <select
              {...register("sampleType", { required: "Requis" })}
              className={selectCls}
            >
              <option value="surface">Surface</option>
              <option value="food">Aliment</option>
              <option value="water">Eau</option>
            </select>
            <ChevronDown className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 size-4 text-darkBlue/40" />
          </div>
          {errors.sampleType && (
            <p className="mt-1 text-xs text-red">{errors.sampleType.message}</p>
          )}
        </div>

        {/* Prélevé le */}
        <div className={fieldWrap}>
          <label className={labelCls}>
            <CalendarClock className="size-4" /> Prélevé le *
          </label>
          <div className="relative flex items-center gap-2">
            <input
              type="datetime-local"
              {...register("sampledAt", { required: "Requis" })}
              className={selectCls}
            />
          </div>
          {errors.sampledAt && (
            <p className="mt-1 text-xs text-red">{errors.sampledAt.message}</p>
          )}
        </div>

        {/* Analysé le */}
        <div className={fieldWrap}>
          <label className={labelCls}>
            <CalendarClock className="size-4" /> Analysé le
          </label>
          <div className="relative flex items-center gap-2">
            <input
              type="datetime-local"
              {...register("analysedAt")}
              className={selectCls}
            />
          </div>
        </div>
      </div>

      {/* Ligne 2 : Identification / Contexte */}
      <div className="grid grid-cols-1 gap-2 midTablet:grid-cols-3">
        <div className={fieldWrap}>
          <label className={labelCls}>Point de prélèvement / Surface</label>
          <input
            type="text"
            {...register("samplingPoint")}
            className={inputCls}
            autoComplete="off"
            spellCheck={false}
            autoCorrect="off"
          />
        </div>
        <div className={fieldWrap}>
          <label className={labelCls}>Produit (si Aliment)</label>
          <input
            type="text"
            {...register("productName")}
            className={inputCls}
            placeholder="Ex: Tiramisu"
            autoComplete="off"
            spellCheck={false}
            autoCorrect="off"
          />
        </div>
        <div className={fieldWrap}>
          <label className={labelCls}>
            <Hash className="size-4" /> Lot
          </label>
          <input
            type="text"
            {...register("lotNumber")}
            className={inputCls}
            autoComplete="off"
            spellCheck={false}
            autoCorrect="off"
          />
        </div>
      </div>

      {/* Ligne 3 : Labo */}
      <div className="grid grid-cols-1 gap-2 midTablet:grid-cols-2">
        <div className={fieldWrap}>
          <label className={labelCls}>Laboratoire</label>
          <input
            type="text"
            {...register("labName")}
            className={inputCls}
            autoComplete="off"
            spellCheck={false}
            autoCorrect="off"
          />
        </div>
        <div className={fieldWrap}>
          <label className={labelCls}>Référence labo</label>
          <input
            type="text"
            {...register("labReference")}
            className={inputCls}
            autoComplete="off"
            spellCheck={false}
            autoCorrect="off"
          />
        </div>
      </div>

      {/* Ligne 4 : Méthode / Critère */}
      <div className="grid grid-cols-1 gap-2 midTablet:grid-cols-3">
        <div className={fieldWrap}>
          <label className={labelCls}>Méthode</label>
          <input
            type="text"
            {...register("method")}
            className={inputCls}
            placeholder="Ex: ISO 6579-1"
            autoComplete="off"
            spellCheck={false}
            autoCorrect="off"
          />
        </div>
        <div className={fieldWrap}>
          <label className={labelCls}>Limite de détection</label>
          <input
            type="text"
            {...register("detectionLimit")}
            className={inputCls}
            placeholder="<10"
            autoComplete="off"
            spellCheck={false}
            autoCorrect="off"
          />
        </div>
        <div className={fieldWrap}>
          <label className={labelCls}>Critère de conformité</label>
          <input
            type="text"
            {...register("criterion")}
            className={inputCls}
            placeholder="Ex: Absence/25g"
            autoComplete="off"
            spellCheck={false}
            autoCorrect="off"
          />
        </div>
      </div>

      {/* Ligne 5 : Paramètre & Résultat */}
      <div className="grid grid-cols-1 gap-2 midTablet:grid-cols-4">
        <div className={fieldWrap}>
          <label className={labelCls}>Paramètre</label>
          <input
            type="text"
            {...register("parameter")}
            className={inputCls}
            placeholder="Ex: Listeria monocytogenes"
            autoComplete="off"
            spellCheck={false}
            autoCorrect="off"
          />
        </div>
        <div className={fieldWrap}>
          <label className={labelCls}>Résultat</label>
          <input
            type="text"
            {...register("result")}
            className={inputCls}
            placeholder="<10 / absent"
            autoComplete="off"
            spellCheck={false}
            autoCorrect="off"
          />
        </div>
        <div className={fieldWrap}>
          <label className={labelCls}>Unité</label>
          <input
            type="text"
            {...register("unit")}
            className={inputCls}
            placeholder="CFU/g, abs/25g, …"
            autoComplete="off"
            spellCheck={false}
            autoCorrect="off"
          />
        </div>

        {/* Toggle Conforme (style ARIA + peer fallback) */}
        <div className={fieldWrap}>
          <label className={labelCls}>Conformité</label>

          <label
            role="switch"
            aria-checked={!!passed}
            className="group inline-flex justify-between h-11 w-full items-center gap-3 rounded-xl border border-darkBlue/20 bg-white px-3 py-2 cursor-pointer select-none"
          >
            <span className="text-sm text-darkBlue/70">
              {passed ? "Conforme" : "Non conforme"}
            </span>

            {/* Checkbox cachée (RHF) + peer pour un feedback instantané */}
            <input
              type="checkbox"
              {...register("passed")}
              className="sr-only peer"
            />

            {/* rail + knob animé (ARIA + peer) */}
            <span
              className="
                relative inline-flex h-6 w-11 items-center rounded-full
                bg-darkBlue/20 transition-colors
                group-aria-checked:bg-blue
                peer-checked:bg-blue
              "
            >
              <span
                className="
                  absolute left-1 top-1/2 -translate-y-1/2
                  size-4 rounded-full bg-white shadow
                  transition-transform will-change-transform translate-x-0
                  group-aria-checked:translate-x-5
                  peer-checked:translate-x-5
                "
              />
            </span>
          </label>
        </div>
      </div>

      {/* Rapport / Notes */}
      <div className="grid grid-cols-1 gap-2 midTablet:grid-cols-2">
        <div className={fieldWrap}>
          <label className={labelCls}>
            <LinkIcon className="size-4" /> Rapport (URL)
          </label>
          <input
            type="url"
            {...register("reportUrl")}
            className={inputCls}
            placeholder="https://…/rapport.pdf"
            autoComplete="off"
            spellCheck={false}
            autoCorrect="off"
          />
        </div>
        <div className={fieldWrap}>
          <label className={labelCls}>
            <FileText className="size-4" /> Notes
          </label>
          <div className="relative">
            <textarea
              rows={1}
              {...register("notes")}
              className="w-full resize-none rounded-lg border border-darkBlue/20 bg-white p-[10px] pr-16 text-[15px] outline-none transition placeholder:text-darkBlue/40"
              placeholder="Observations complémentaires…"
            />
            <span className="pointer-events-none absolute bottom-2 right-3 select-none text-[11px] text-darkBlue/40">
              {(notesVal?.length ?? 0).toString()}
            </span>
          </div>
        </div>
      </div>

      {/* Actions */}
      <div className="flex flex-col items-center gap-2 mt-3 mobile:flex-row">
        <button
          type="submit"
          disabled={isSubmitting}
          className="text-nowrap inline-flex items-center justify-center  gap-2 h-[38px] rounded-lg bg-blue px-4 py-2 text-sm font-medium text-white shadow disabled:opacity-60"
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
            className="inline-flex h-[38px] items-center justify-center gap-2 rounded-lg border border-red bg-white px-4 py-2 text-sm font-medium text-red"
          >
            Annuler
          </button>
        )}
      </div>
    </form>
  );
}
