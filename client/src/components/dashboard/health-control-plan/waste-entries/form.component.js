"use client";
import { useEffect, useMemo } from "react";
import { useForm } from "react-hook-form";
import axios from "axios";

function toDatetimeLocal(value) {
  const d = value ? new Date(value) : new Date();
  if (Number.isNaN(d.getTime())) return "";
  const off = d.getTimezoneOffset() * 60000;
  return new Date(d.getTime() - off).toISOString().slice(0, 16);
}

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

    const attachments =
      typeof data.attachmentsText === "string" &&
      data.attachmentsText.trim().length
        ? data.attachmentsText
            .split(/[\n,;]+/g)
            .map((s) => s.trim())
            .filter(Boolean)
        : [];

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

  return (
    <form
      onSubmit={handleSubmit(onSubmit)}
      className="bg-white rounded-lg p-4 shadow-sm flex flex-col gap-6"
    >
      {/* Ligne 1 */}
      <div className="flex flex-col gap-4 midTablet:flex-row">
        <div className="w-full midTablet:w-72">
          <label className="text-sm font-medium">Date *</label>
          <input
            type="datetime-local"
            {...register("date", { required: "Requis" })}
            className="border rounded p-2 h-[44px] w-full"
          />
          {errors.date && (
            <p className="text-xs text-red mt-1">{errors.date.message}</p>
          )}
        </div>
        <div className="w-full midTablet:w-72">
          <label className="text-sm font-medium">Type de déchet *</label>
          <select
            {...register("wasteType", { required: "Requis" })}
            className="border rounded p-2 h-[44px] w-full"
          >
            <option value="organic">Biodéchets</option>
            <option value="packaging">Emballages</option>
            <option value="cooking_oil">Huiles de cuisson</option>
            <option value="glass">Verre</option>
            <option value="paper">Papier</option>
            <option value="hazardous">Dangereux</option>
            <option value="other">Autre</option>
          </select>
        </div>
        <div className="w-full midTablet:w-56">
          <label className="text-sm font-medium">Poids (kg) *</label>
          <input
            type="number"
            step="0.01"
            onWheel={(e) => e.currentTarget.blur()}
            min="0"
            {...register("weightKg", {
              required: "Requis",
              validate: (v) => {
                const n = Number(v);
                if (!Number.isFinite(n) || n < 0) return "Valeur invalide";
                return true;
              },
            })}
            className="border rounded p-2 h-[44px] w-full"
          />
          {errors.weightKg && (
            <p className="text-xs text-red mt-1">{errors.weightKg.message}</p>
          )}
        </div>
      </div>

      {/* Ligne 2 */}
      <div className="flex flex-col gap-4 midTablet:flex-row">
        <div className="w-full midTablet:w-72">
          <label className="text-sm font-medium">Méthode d’élimination</label>
          <select
            {...register("disposalMethod")}
            className="border rounded p-2 h-[44px] w-full"
          >
            <option value="contractor_pickup">Collecteur (prestataire)</option>
            <option value="compost">Compost</option>
            <option value="recycle">Recyclage</option>
            <option value="landfill">Enfouissement</option>
            <option value="incineration">Incinération</option>
            <option value="other">Autre</option>
          </select>
        </div>
        <div className="flex-1">
          <label className="text-sm font-medium">Prestataire</label>
          <input
            type="text"
            {...register("contractor")}
            className="border rounded p-2 h-[44px] w-full"
            placeholder="Nom du collecteur"
            autoComplete="off"
            spellCheck={false}
            autoCorrect="off"
          />
        </div>
        <div className="flex-1">
          <label className="text-sm font-medium">Bordereau / N°</label>
          <input
            type="text"
            {...register("manifestNumber")}
            className="border rounded p-2 h-[44px] w-full"
            placeholder="Référence / numéro de suivi"
            autoComplete="off"
            spellCheck={false}
            autoCorrect="off"
          />
        </div>
      </div>

      {/* Notes + pièces */}
      <div className="flex flex-col gap-4 midTablet:flex-row">
        <div className="flex-1">
          <label className="text-sm font-medium">Notes</label>
          <textarea
            rows={4}
            {...register("notes")}
            className="border rounded p-2 resize-none w-full min-h-[96px]"
          />
        </div>
        <div className="flex-1">
          <label className="text-sm font-medium">
            Pièces (URLs, 1 par ligne)
          </label>
          <textarea
            rows={4}
            {...register("attachmentsText")}
            className="border rounded p-2 resize-none w-full min-h-[96px]"
            placeholder={"https://…/bon-enlevement.pdf\nhttps://…/photo.jpg"}
          />
        </div>
      </div>

      {/* Actions */}
      <div className="flex gap-2">
        <button
          type="submit"
          disabled={isSubmitting}
          className="px-4 py-2 rounded bg-blue text-white disabled:opacity-50"
        >
          {initial?._id ? "Mettre à jour" : "Enregistrer"}
        </button>
        {initial?._id && (
          <button
            type="button"
            onClick={() => {
              reset(buildDefaults(null));
              onCancel?.();
            }}
            className="px-4 py-2 rounded text-white bg-red"
          >
            Annuler
          </button>
        )}
      </div>
    </form>
  );
}
