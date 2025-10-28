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
    type: rec?.type ?? "hygiene_check",
    performedAt: toDatetimeLocal(rec?.performedAt ?? new Date()),
    notes: rec?.notes ?? "",
    attachmentsText: Array.isArray(rec?.attachments)
      ? rec.attachments.join("\n")
      : "",
  };
}

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

    const attachments =
      typeof data.attachmentsText === "string" &&
      data.attachmentsText.trim().length
        ? data.attachmentsText
            .split(/[\n,;]+/g)
            .map((s) => s.trim())
            .filter(Boolean)
        : [];

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

    // live upsert
    window.dispatchEvent(
      new CustomEvent("health-mesures:upsert", { detail: { doc: saved } })
    );

    reset(buildDefaults(null));
    onSuccess?.(saved);
  };

  return (
    <form
      onSubmit={handleSubmit(onSubmit)}
      className="bg-white rounded-lg p-4 shadow-sm flex flex-col gap-6"
    >
      <div className="flex flex-col gap-4 midTablet:flex-row">
        <div className="w-full midTablet:w-72">
          <label className="text-sm font-medium">Type</label>
          <select
            {...register("type")}
            className="border rounded p-2 h-[44px] w-full"
          >
            <option value="hygiene_check">Contrôle hygiène</option>
            <option value="covid_check">Contrôle COVID</option>
            <option value="other">Autre</option>
          </select>
        </div>
        <div className="w-full midTablet:w-72">
          <label className="text-sm font-medium">Effectué le</label>
          <input
            type="datetime-local"
            {...register("performedAt")}
            className="border rounded p-2 h-[44px] w-full"
          />
        </div>
      </div>

      <div>
        <label className="text-sm font-medium">Notes</label>
        <textarea
          rows={4}
          {...register("notes")}
          className="border rounded p-2 resize-none w-full min-h-[96px]"
          placeholder="Observations, rappels, etc."
        />
      </div>

      <div>
        <label className="text-sm font-medium">
          Pièces (URLs, 1 par ligne)
        </label>
        <textarea
          rows={4}
          {...register("attachmentsText")}
          className="border rounded p-2 resize-none w-full min-h-[96px]"
          placeholder={"https://…/attestation.pdf\nhttps://…/photo.jpg"}
        />
      </div>

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
