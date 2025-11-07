"use client";
import { useEffect, useMemo, useState, useCallback } from "react";
import { useForm } from "react-hook-form";
import axios from "axios";
import {
  Thermometer,
  Snowflake,
  CalendarClock,
  ChevronDown,
  DoorOpen,
  Lock,
  Loader2,
  Trash2,
  X,
} from "lucide-react";

function toDatetimeLocalValue(value) {
  const base = value ? new Date(value) : new Date();
  if (Number.isNaN(base.getTime()))
    return new Date().toISOString().slice(0, 16);
  const offset = base.getTimezoneOffset() * 60000;
  return new Date(base.getTime() - offset).toISOString().slice(0, 16);
}

function buildDefaults(doc = null) {
  if (!doc) {
    return {
      fridgeRef: "",
      value: "",
      doorState: "closed",
      note: "",
      createdAt: toDatetimeLocalValue(),
      _id: null,
      recordedBy: null,
    };
  }
  return {
    fridgeRef: doc.fridgeRef || "",
    value: doc.value ?? "",
    doorState: doc.doorState || "closed",
    note: doc.note || "",
    createdAt: toDatetimeLocalValue(doc.createdAt),
    _id: doc._id || null,
    recordedBy: doc.recordedBy || null,
  };
}

export default function FridgeTemperatureForm({
  restaurantId,
  fridges = [],
  onSaved,
  onCreated,
}) {
  const {
    register,
    handleSubmit,
    reset,
    watch,
    setValue,
    formState: { errors, isSubmitting },
  } = useForm({ defaultValues: buildDefaults() });

  const noteValue = watch("note");
  const doorState = watch("doorState");
  const isClosed = doorState === "closed";

  const [editingId, setEditingId] = useState(null);
  const [recordedBy, setRecordedBy] = useState(null);

  const token =
    typeof window !== "undefined" ? localStorage.getItem("token") : null;

  const selected = watch("fridgeRef");
  const selectedUnit = useMemo(() => {
    const f = fridges.find((x) => String(x._id) === String(selected));
    return f?.unit || "°C";
  }, [selected, fridges]);

  const clearEditing = useCallback(() => {
    setEditingId(null);
    setRecordedBy(null);
    reset(buildDefaults(null));
  }, [reset]);

  // Éditer un relevé existant (depuis la liste)
  useEffect(() => {
    const onEdit = (e) => {
      const doc = e?.detail?.doc;
      if (!doc) return;
      setEditingId(doc._id);
      setRecordedBy(doc.recordedBy || null);
      reset(buildDefaults(doc));
      setTimeout(() => {
        const el = document.querySelector("#ft-form-value");
        if (el) el.focus();
      }, 0);
    };
    window.addEventListener("fridge-temperature:edit", onEdit);
    return () => window.removeEventListener("fridge-temperature:edit", onEdit);
  }, [reset]);

  // Préremplir pour création (depuis la mini-table "Ajouter")
  useEffect(() => {
    const onPreset = (e) => {
      const { fridgeRef, createdAt } = e?.detail || {};
      if (!fridgeRef) return;
      setEditingId(null);
      setRecordedBy(null);
      reset({
        ...buildDefaults(null),
        fridgeRef,
        createdAt: toDatetimeLocalValue(createdAt || new Date()),
      });
      setTimeout(() => {
        const el = document.querySelector("#ft-form-value");
        if (el) el.focus();
      }, 0);
    };
    window.addEventListener("fridge-temperature:preset", onPreset);
    return () =>
      window.removeEventListener("fridge-temperature:preset", onPreset);
  }, [reset]);

  // Si le relevé en cours d’édition est supprimé depuis la liste
  useEffect(() => {
    const onDeleted = (e) => {
      const id = e?.detail?.id;
      if (id && id === editingId) clearEditing();
    };
    window.addEventListener("fridge-temperature:deleted", onDeleted);
    return () =>
      window.removeEventListener("fridge-temperature:deleted", onDeleted);
  }, [editingId, clearEditing]);

  const onSubmit = async (data) => {
    const payload = {
      fridgeRef: data.fridgeRef,
      value: Number(data.value),
      doorState: data.doorState || "closed",
      note: data.note || undefined,
      createdAt: data.createdAt ? new Date(data.createdAt) : undefined,
    };

    if (!editingId) {
      const url = `${process.env.NEXT_PUBLIC_API_URL}/restaurants/${restaurantId}/fridge-temperatures`;
      const { data: saved } = await axios.post(url, payload, {
        headers: { Authorization: `Bearer ${token}` },
      });
      window.dispatchEvent(
        new CustomEvent("fridge-temperature:upsert", { detail: { doc: saved } })
      );
      onCreated?.(saved);
      onSaved?.(saved);
      reset({
        ...buildDefaults(null),
        createdAt: toDatetimeLocalValue(),
      });
    } else {
      const url = `${process.env.NEXT_PUBLIC_API_URL}/restaurants/${restaurantId}/fridge-temperatures/${editingId}`;
      const { data: saved } = await axios.put(url, payload, {
        headers: { Authorization: `Bearer ${token}` },
      });
      window.dispatchEvent(
        new CustomEvent("fridge-temperature:upsert", { detail: { doc: saved } })
      );
      onSaved?.(saved);
      clearEditing();
    }
  };

  const handleDelete = async () => {
    if (!editingId) return;
    const url = `${process.env.NEXT_PUBLIC_API_URL}/restaurants/${restaurantId}/fridge-temperatures/${editingId}`;
    await axios.delete(url, { headers: { Authorization: `Bearer ${token}` } });
    window.dispatchEvent(
      new CustomEvent("fridge-temperature:deleted", {
        detail: { id: editingId },
      })
    );
    clearEditing();
  };

  // UI helpers
  const setNow = () => setValue("createdAt", toDatetimeLocalValue());

  const fieldWrap =
    "group relative rounded-xl bg-white/50 backdrop-blur-sm px-3 py-2 h-[80px] transition-shadow";
  const labelCls =
    "flex items-center gap-2 text-xs font-medium text-darkBlue/60 mb-1";
  const inputCls =
    "h-11 w-full rounded-lg border border-darkBlue/20 bg-white px-3 text-[15px] outline-none transition placeholder:text-darkBlue/40";
  const selectCls =
    "h-11 w-full appearance-none rounded-lg border border-darkBlue/20 bg-white px-3 text-[15px] outline-none transition";

  return (
    <form
      onSubmit={handleSubmit(onSubmit)}
      className="relative flex flex-col gap-2"
    >
      {/* Grid fields */}
      <div className="grid grid-cols-1 midTablet:grid-cols-3 gap-2">
        {/* Enceinte */}
        <div className="w-full">
          <div className={fieldWrap}>
            <label className={labelCls}>
              <Snowflake className="size-4" /> Enceinte *
            </label>
            <div className="relative">
              <select
                {...register("fridgeRef", { required: "Requis" })}
                className={selectCls}
                disabled={!!editingId}
              >
                <option value="">— Sélectionner —</option>
                {fridges.map((f) => (
                  <option key={f._id} value={f._id}>
                    {f.name}
                  </option>
                ))}
              </select>
              <ChevronDown className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 size-4 text-darkBlue/40" />
            </div>
          </div>
          {errors.fridgeRef && (
            <p className="mt-1 text-xs text-red-600">
              {errors.fridgeRef.message}
            </p>
          )}
        </div>

        {/* Temperature */}
        <div className="w-full">
          <div className={fieldWrap}>
            <label className={labelCls}>
              <Thermometer className="size-4" /> T° *
            </label>

            <div className="relative">
              <input
                id="ft-form-value"
                type="number"
                step="0.1"
                placeholder="ex: 3.2"
                onWheel={(e) => e.currentTarget.blur()}
                {...register("value", { required: "Requis" })}
                className={`${inputCls} text-right pr-12`}
              />
              <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 select-none rounded-md bg-darkBlue/10 px-2 py-1 text-xs text-darkBlue/60">
                {selectedUnit}
              </span>
            </div>
          </div>
          {errors.value && (
            <p className="mt-1 text-xs text-red">{errors.value.message}</p>
          )}
        </div>

        {/* Door state — switch accessible */}
        <div className="w-full">
          <div className={fieldWrap}>
            <label className={labelCls}>
              <DoorOpen className="size-4" /> Porte
            </label>

            <label
              role="switch"
              aria-checked={isClosed}
              className="group inline-flex justify-between h-11 w-full items-center gap-3 rounded-lg border border-darkBlue/20 bg-white px-3 py-2 cursor-pointer select-none"
              title="Basculer fermée / ouverte"
            >
              <span className="text-sm text-darkBlue/70 flex items-center gap-1">
                {isClosed ? (
                  <>
                    <Lock className="size-3.5" /> Fermée
                  </>
                ) : (
                  <>
                    <DoorOpen className="size-3.5" /> Ouverte
                  </>
                )}
              </span>

              {/* Checkbox visuelle */}
              <input
                type="checkbox"
                className="sr-only peer"
                checked={isClosed}
                onChange={() =>
                  setValue("doorState", isClosed ? "open" : "closed", {
                    shouldDirty: true,
                    shouldTouch: true,
                  })
                }
              />

              {/* Rail + knob en darkBlue quand actif */}
              <span
                className="
                  relative inline-flex h-6 w-11 items-center rounded-full
                  bg-darkBlue/20 transition-colors
                  peer-checked:bg-darkBlue/80 group-aria-checked:bg-darkBlue/80
                "
              >
                <span
                  className="
                    absolute left-1 top-1/2 -translate-y-1/2
                    size-4 rounded-full bg-white shadow
                    transition-transform will-change-transform translate-x-0
                    peer-checked:translate-x-5 group-aria-checked:translate-x-5
                  "
                />
              </span>
            </label>

            {/* champ RHF (valeur string) */}
            <select {...register("doorState")} className="hidden">
              <option value="closed">fermée</option>
              <option value="open">ouverte</option>
            </select>
          </div>
        </div>
      </div>

      <div className="flex flex-col midTablet:flex-row gap-2">
        {/* Datetime */}
        <div className="">
          <div className={fieldWrap}>
            <label className={labelCls}>
              <CalendarClock className="size-4" /> Date / heure
            </label>
            <div className="relative flex items-center gap-2">
              <input
                type="datetime-local"
                {...register("createdAt")}
                className={selectCls}
              />
            </div>
          </div>
        </div>

        {/* Notes */}
        <div className="w-full h-[80px]">
          <div className={fieldWrap}>
            <label className={labelCls}>Notes</label>

            <div className="relative">
              <textarea
                rows={1}
                {...register("note")}
                className="w-full resize-none rounded-lg border border-darkBlue/20 bg-white p-2 pr-16 text-[15px] outline-none transition placeholder:text-darkBlue/40"
                placeholder="Informations complémentaires…"
              />
              <span className="pointer-events-none absolute bottom-2 right-3 select-none text-[11px] text-darkBlue/40">
                {noteValue?.length ?? 0}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Meta */}
      {editingId && recordedBy && (
        <div className="mt-2 text-xs text-slate-500">
          Saisie par : {recordedBy.firstName || ""} {recordedBy.lastName || ""}
        </div>
      )}

      {/* Actions */}
      <div className="mt-4 flex flex-col mobile:flex-row gap-2">
        <button
          type="submit"
          disabled={isSubmitting}
          className="text-nowrap inline-flex items-center justify-center gap-2 rounded-lg bg-blue px-4 py-2 text-sm font-medium text-white shadow disabled:opacity-60"
        >
          {isSubmitting ? (
            <>
              <Loader2 className="size-4 animate-spin" />
              Enregistrement…
            </>
          ) : (
            <>
              <Thermometer className="size-4" />
              {editingId ? "Mettre à jour" : "Enregistrer"}
            </>
          )}
        </button>

        {editingId && (
          <div className="flex w-full items-center justify-between gap-6">
            <button
              type="button"
              className="inline-flex items-center justify-center gap-2 rounded-lg bg-red px-4 py-2 text-sm font-medium text-white"
              onClick={clearEditing}
            >
              <X className="size-4" /> Annuler
            </button>
            <button
              type="button"
              className="inline-flex items-center justify-center gap-2 rounded-lg border border-red bg-white px-4 py-2 text-sm font-medium text-red"
              onClick={handleDelete}
            >
              <Trash2 className="size-4" /> Supprimer
            </button>
          </div>
        )}
      </div>
    </form>
  );
}
