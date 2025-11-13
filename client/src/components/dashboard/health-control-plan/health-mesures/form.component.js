// app/(components)/health/HealthMeasuresForm.jsx
"use client";
import { useEffect, useMemo } from "react";
import { useForm } from "react-hook-form";
import axios from "axios";
import {
  CalendarClock,
  FileText,
  Link as LinkIcon,
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
    type: rec?.type ?? "hygiene_check",
    performedAt: toDatetimeLocal(rec?.performedAt ?? new Date()),
    notes: rec?.notes ?? "",
    attachmentsText: Array.isArray(rec?.attachments)
      ? rec.attachments.join("\n")
      : "",
  };
}

/* ---------- Styles alignés ---------- */
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

/* ---------- Component ---------- */
export default function HealthMeasuresForm({
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
      type: data.type || "hygiene_check",
      performedAt: data.performedAt ? new Date(data.performedAt) : new Date(),
      notes: data.notes || undefined,
      attachments,
    };

    const url = initial?._id
      ? `${process.env.NEXT_PUBLIC_API_URL}/restaurants/${restaurantId}/health-measures/${initial._id}`
      : `${process.env.NEXT_PUBLIC_API_URL}/restaurants/${restaurantId}/health-measures`;
    const method = initial?._id ? "put" : "post";

    const { data: saved } = await axios[method](url, payload, {
      headers: { Authorization: `Bearer ${token}` },
    });

    // live upsert (conserve le nom d’événement existant)
    window.dispatchEvent(
      new CustomEvent("health-mesures:upsert", { detail: { doc: saved } })
    );

    reset(buildDefaults(null));
    onSuccess?.(saved);
  };

  // Helpers
  const setNow = () =>
    setValue("performedAt", toDatetimeLocal(new Date()), {
      shouldDirty: true,
      shouldTouch: true,
    });

  const notesVal = watch("notes");
  const attachmentsPreview = uniqLines(watch("attachmentsText"));

  return (
    <form
      onSubmit={handleSubmit(onSubmit)}
      className="relative flex flex-col gap-2"
    >
      {/* Ligne 1 : Type / Effectué le */}
      <div className="grid grid-cols-1 gap-2 midTablet:grid-cols-2">
        <div className={fieldWrap}>
          <label className={labelCls}>Type</label>
          <div className="relative">
            <select {...register("type")} className={selectCls}>
              <option value="hygiene_check">Contrôle hygiène</option>
              <option value="covid_check">Contrôle COVID</option>
              <option value="other">Autre</option>
            </select>
            <ChevronDown className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 size-4 text-darkBlue/40" />
          </div>
        </div>

        <div className={fieldWrap}>
          <label className={labelCls}>
            <CalendarClock className="size-4" /> Effectué le
          </label>
          <div className="relative">
            <input
              type="datetime-local"
              {...register("performedAt")}
              className={selectCls}
            />
          </div>
        </div>
      </div>

      {/* Notes */}
      <div className={fieldWrap.replace("h-[80px]", "h-auto")}>
        <label className={labelCls}>
          <FileText className="size-4" /> Notes
        </label>
        <div className="relative">
          <textarea
            rows={4}
            {...register("notes")}
            className={textareaCls}
            placeholder="Observations, rappels, etc."
          />
          <span className="pointer-events-none absolute bottom-2 right-3 select-none text-[11px] text-darkBlue/40">
            {(notesVal?.length ?? 0).toString()}
          </span>
        </div>
      </div>

      {/* Pièces */}
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
          placeholder={"https://…/attestation.pdf\nhttps://…/photo.jpg"}
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
            <>Mettre à jour</>
          ) : (
            <>Enregistrer</>
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
