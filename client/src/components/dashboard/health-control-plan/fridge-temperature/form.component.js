"use client";
import { useEffect, useMemo, useState, useCallback } from "react";
import { useForm } from "react-hook-form";
import axios from "axios";

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
  fridgesVersion = 0,
  onSaved, // (doc) => void  (create ou update)
}) {
  const {
    register,
    handleSubmit,
    reset,
    watch,
    setValue,
    formState: { errors, isSubmitting },
  } = useForm({ defaultValues: buildDefaults() });

  const [fridges, setFridges] = useState([]);
  const [editingId, setEditingId] = useState(null); // null => create, sinon edit
  const [recordedBy, setRecordedBy] = useState(null); // affichage read-only en mode édition

  const token = useMemo(
    () =>
      typeof window !== "undefined" ? localStorage.getItem("token") : null,
    []
  );

  // Charger les fridges actifs
  useEffect(() => {
    const fetchFridges = async () => {
      const url = `${process.env.NEXT_PUBLIC_API_URL}/restaurants/${restaurantId}/fridges`;
      const { data } = await axios.get(url, {
        headers: { Authorization: `Bearer ${token}` },
        params: { active: 1 },
      });
      setFridges(data.items || []);
    };
    if (restaurantId) fetchFridges();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [restaurantId, fridgesVersion]);

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

  // Écoute : éditer un relevé existant
  useEffect(() => {
    const onEdit = (e) => {
      const doc = e?.detail?.doc;
      if (!doc) return;
      setEditingId(doc._id);
      setRecordedBy(doc.recordedBy || null);
      reset(buildDefaults(doc));
      // focus sur T° pour rapidité
      setTimeout(() => {
        const el = document.querySelector("#ft-form-value");
        if (el) el.focus();
      }, 0);
    };
    window.addEventListener("fridge-temperature:edit", onEdit);
    return () => window.removeEventListener("fridge-temperature:edit", onEdit);
  }, [reset]);

  // Écoute : preset (préremplir pour création) -> fridgeRef + createdAt
  useEffect(() => {
    const onPreset = (e) => {
      const { fridgeRef, createdAt } = e?.detail || {};
      if (!fridgeRef) return;
      // on sort du mode édition si actif
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

  const onSubmit = async (data) => {
    const payload = {
      fridgeRef: data.fridgeRef,
      value: Number(data.value),
      doorState: data.doorState || "closed",
      note: data.note || undefined,
      createdAt: data.createdAt ? new Date(data.createdAt) : undefined,
    };

    if (!editingId) {
      // CREATE
      const url = `${process.env.NEXT_PUBLIC_API_URL}/restaurants/${restaurantId}/fridge-temperatures`;
      const { data: saved } = await axios.post(url, payload, {
        headers: { Authorization: `Bearer ${token}` },
      });
      window.dispatchEvent(
        new CustomEvent("fridge-temperature:upsert", { detail: { doc: saved } })
      );
      onSaved?.(saved);
      // garder la même enceinte, reset value/note/date
      reset({
        ...buildDefaults(null),
        fridgeRef: data.fridgeRef,
        createdAt: toDatetimeLocalValue(),
      });
    } else {
      // UPDATE
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

  return (
    <form
      onSubmit={handleSubmit(onSubmit)}
      className="bg-white rounded-lg p-4 shadow-sm flex flex-col gap-4"
    >
      {/* Bandeau mode édition + RecordedBy */}
      {editingId && (
        <div className="p-3 rounded bg-yellow-50 border border-yellow-200 text-sm flex items-center justify-between">
          <div>
            <strong>Mode édition</strong>
            {recordedBy ? (
              <span className="ml-2 opacity-80">
                • Saisi par : {recordedBy.firstName || ""}{" "}
                {recordedBy.lastName || ""}
              </span>
            ) : null}
          </div>
          <button
            type="button"
            className="px-3 py-1 rounded bg-red text-white"
            onClick={clearEditing}
          >
            Annuler
          </button>
        </div>
      )}

      <div className="flex flex-col gap-2 midTablet:flex-row">
        <div className="flex-1">
          <label className="text-sm font-medium">Enceinte *</label>
          <select
            {...register("fridgeRef", { required: "Requis" })}
            className="border rounded p-2 h-[44px] w-full"
            disabled={!!editingId} // on évite de changer l’enceinte en edit (optionnel)
          >
            <option value="">— Sélectionner —</option>
            {fridges.map((f) => (
              <option key={f._id} value={f._id}>
                {f.name}
                {/* volontairement sans code/référence */}
              </option>
            ))}
          </select>
          {errors.fridgeRef && (
            <p className="text-xs text-red mt-1">{errors.fridgeRef.message}</p>
          )}
        </div>

        <div className="w-28">
          <label className="text-sm font-medium">T° *</label>
          <input
            id="ft-form-value"
            type="number"
            step="0.1"
            placeholder="ex: 3.2"
            onWheel={(e) => e.currentTarget.blur()}
            {...register("value", { required: "Requis" })}
            className="border rounded p-2 h-[44px] w-full"
          />
          {errors.value && (
            <p className="text-xs text-red mt-1">{errors.value.message}</p>
          )}
        </div>

        <div className="w-24">
          <label className="text-sm font-medium">Unité</label>
          <input
            value={selectedUnit}
            readOnly
            className="border rounded p-2 h-[44px] w-full bg-gray-50"
          />
        </div>

        <div className="w-40">
          <label className="text-sm font-medium">Porte</label>
          <select
            {...register("doorState")}
            className="border rounded p-2 h-[44px] w-full"
          >
            <option value="closed">fermée</option>
            <option value="open">ouverte</option>
          </select>
        </div>

        <div className="w-[220px]">
          <label className="text-sm font-medium">Date/heure</label>
          <input
            type="datetime-local"
            {...register("createdAt")}
            className="border rounded p-2 h-[44px] w-full"
          />
        </div>
      </div>

      <div>
        <label className="text-sm font-medium">Note</label>
        <textarea
          rows={3}
          {...register("note")}
          className="border rounded p-2 w-full resize-none"
          placeholder="Informations complémentaires…"
        />
      </div>

      <div className="flex gap-2">
        <button
          type="submit"
          disabled={isSubmitting}
          className="px-4 py-2 rounded bg-blue text-white disabled:opacity-50"
        >
          {editingId ? "Mettre à jour" : "Enregistrer"}
        </button>
        {editingId && (
          <button
            type="button"
            className="px-4 py-2 rounded bg-gray-200"
            onClick={clearEditing}
          >
            Annuler
          </button>
        )}
      </div>
    </form>
  );
}
