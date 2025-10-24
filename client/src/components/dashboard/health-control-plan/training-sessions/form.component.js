"use client";
import { useEffect, useMemo, useState } from "react";
import { useForm, useFieldArray } from "react-hook-form";
import axios from "axios";

function toDatetimeLocal(value) {
  const d = value ? new Date(value) : new Date();
  if (Number.isNaN(d.getTime())) return "";
  const off = d.getTimezoneOffset() * 60000;
  return new Date(d.getTime() - off).toISOString().slice(0, 16);
}
function toDateValue(value) {
  if (!value) return "";
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? "" : d.toISOString().slice(0, 10);
}

function buildDefaults(rec) {
  return {
    title: rec?.title ?? "",
    topic: rec?.topic ?? "",
    provider: rec?.provider ?? "",
    date: toDatetimeLocal(rec?.date ?? new Date()),
    durationMinutes:
      typeof rec?.durationMinutes === "number"
        ? String(rec.durationMinutes)
        : "",
    location: rec?.location ?? "",
    materialsUrl: rec?.materialsUrl ?? "",
    validUntil: toDateValue(rec?.validUntil),
    notes: rec?.notes ?? "",
    attendees:
      Array.isArray(rec?.attendees) && rec.attendees.length
        ? rec.attendees.map((a) => ({
            employeeId: a?.employeeId ? String(a.employeeId) : "",
            status: a?.status ?? "attended",
            certificateUrl: a?.certificateUrl ?? "",
            signedAt: toDatetimeLocal(a?.signedAt),
            notes: a?.notes ?? "",
          }))
        : [
            {
              employeeId: "",
              status: "attended",
              certificateUrl: "",
              signedAt: "",
              notes: "",
            },
          ],
  };
}

export default function TrainingForm({
  restaurantId,
  initial = null,
  onSuccess,
  onCancel,
}) {
  const {
    register,
    handleSubmit,
    reset,
    control,
    watch,
    setError,
    clearErrors,
    formState: { errors, isSubmitting },
  } = useForm({ defaultValues: buildDefaults(initial) });

  const { fields, append, remove } = useFieldArray({
    control,
    name: "attendees",
  });

  const token = useMemo(
    () =>
      typeof window !== "undefined" ? localStorage.getItem("token") : null,
    []
  );

  // --- employés pour le select
  const [employees, setEmployees] = useState([]);
  const [empLoading, setEmpLoading] = useState(false);
  const [empError, setEmpError] = useState(false);

  async function fetchEmployees() {
    if (!restaurantId || !token) return;
    setEmpLoading(true);
    setEmpError(false);
    try {
      const url = `${process.env.NEXT_PUBLIC_API_URL}/restaurants/${restaurantId}/employees-select`;
      const { data } = await axios.get(url, {
        headers: { Authorization: `Bearer ${token}` },
        params: { limit: 300 },
      });
      setEmployees(Array.isArray(data?.items) ? data.items : []);
    } catch (e) {
      console.error("fetch employees-select:", e);
      setEmpError(true);
      setEmployees([]);
    } finally {
      setEmpLoading(false);
    }
  }

  useEffect(() => {
    reset(buildDefaults(initial));
    // re-fetch pour l'édition (au cas où)
    fetchEmployees();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initial, restaurantId]);

  // --- Watch des attendees pour filtrer sans casser l'option sélectionnée
  const attendeesWatch = watch("attendees") || [];
  const selectedIdsAll = attendeesWatch
    .map((r) => String(r?.employeeId || ""))
    .filter(Boolean);

  // --- Soumission
  const onSubmit = async (data) => {
    if (!token) return;

    // Bloque les doublons côté front (défense 1)
    const seen = new Set();
    for (let i = 0; i < (data.attendees || []).length; i++) {
      const id = String(data.attendees[i]?.employeeId || "");
      if (!id) continue;
      if (seen.has(id)) {
        setError(`attendees.${i}.employeeId`, {
          type: "manual",
          message: "Employé déjà sélectionné pour cette formation",
        });
        return;
      }
      seen.add(id);
    }
    clearErrors();

    const payload = {
      title: data.title,
      topic: data.topic || undefined,
      provider: data.provider || undefined,
      date: data.date ? new Date(data.date) : new Date(),
      durationMinutes:
        data.durationMinutes !== "" && data.durationMinutes != null
          ? Number(data.durationMinutes)
          : undefined,
      location: data.location || undefined,
      materialsUrl: data.materialsUrl || undefined,
      validUntil: data.validUntil ? new Date(data.validUntil) : undefined,
      notes: data.notes || undefined,
      attendees: (Array.isArray(data.attendees) ? data.attendees : [])
        .map((a) => ({
          employeeId: a.employeeId || undefined,
          status: a.status || "attended",
          certificateUrl: a.certificateUrl || undefined,
          signedAt: a.signedAt ? new Date(a.signedAt) : undefined,
          notes: a.notes || undefined,
        }))
        .filter((x) => x.employeeId), // côté serveur on re-valide, mais on nettoie déjà
    };

    const url = initial?._id
      ? `${process.env.NEXT_PUBLIC_API_URL}/restaurants/${restaurantId}/training-sessions/${initial._id}`
      : `${process.env.NEXT_PUBLIC_API_URL}/restaurants/${restaurantId}/training-sessions`;
    const method = initial?._id ? "put" : "post";

    const { data: saved } = await axios[method](url, payload, {
      headers: { Authorization: `Bearer ${token}` },
    });

    // live update
    window.dispatchEvent(
      new CustomEvent("training-sessions:upsert", { detail: { doc: saved } })
    );

    reset(buildDefaults(null));
    onSuccess?.(saved);
  };

  return (
    <form
      onSubmit={handleSubmit(onSubmit)}
      className="bg-white rounded-lg p-4 shadow-sm flex flex-col gap-6"
    >
      {/* En-tête */}
      <div className="flex flex-col gap-4 midTablet:flex-row">
        <div className="flex-1">
          <label className="text-sm font-medium">Intitulé *</label>
          <input
            type="text"
            {...register("title", { required: "Requis" })}
            className="border rounded p-2 h-[44px] w-full"
            placeholder='ex: "Formation Hygiène HACCP"'
          />
          {errors.title && (
            <p className="text-xs text-red mt-1">{errors.title.message}</p>
          )}
        </div>
        <div className="w-full midTablet:w-64">
          <label className="text-sm font-medium">Thème</label>
          <input
            type="text"
            {...register("topic")}
            className="border rounded p-2 h-[44px] w-full"
            placeholder='ex: "Allergènes"'
          />
        </div>
      </div>

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
        <div className="w-full midTablet:w-60">
          <label className="text-sm font-medium">Durée (min)</label>
          <input
            type="number"
            step="1"
            onWheel={(e) => e.currentTarget.blur()}
            min="0"
            {...register("durationMinutes", {
              validate: (v) =>
                v === "" ||
                (Number.isFinite(Number(v)) && Number(v) >= 0) ||
                "Invalide",
            })}
            className="border rounded p-2 h-[44px] w-full"
          />
          {errors.durationMinutes && (
            <p className="text-xs text-red mt-1">
              {errors.durationMinutes.message}
            </p>
          )}
        </div>
        <div className="flex-1">
          <label className="text-sm font-medium">Fournisseur</label>
          <input
            type="text"
            {...register("provider")}
            className="border rounded p-2 h-[44px] w-full"
            placeholder="ex: Acme Training"
          />
        </div>
      </div>

      <div className="flex flex-col gap-4 midTablet:flex-row">
        <div className="flex-1">
          <label className="text-sm font-medium">Lieu</label>
          <input
            type="text"
            {...register("location")}
            className="border rounded p-2 h-[44px] w-full"
            placeholder="Salle de réunion, visio…"
          />
        </div>
        <div className="flex-1">
          <label className="text-sm font-medium">Supports (URL)</label>
          <input
            type="url"
            {...register("materialsUrl")}
            className="border rounded p-2 h-[44px] w-full"
            placeholder="https://…/supports.pdf"
          />
        </div>
      </div>

      <div className="flex flex-col gap-4 midTablet:flex-row">
        <div className="w-full midTablet:w-72">
          <label className="text-sm font-medium">Validité jusqu’au</label>
          <input
            type="date"
            {...register("validUntil")}
            className="border rounded p-2 h-[44px] w-full"
          />
        </div>
      </div>

      {/* Participants */}
      <div className="flex flex-col gap-4">
        <div className="flex items-center justify-between">
          <h3 className="text-base font-semibold">Participants</h3>
          <button
            type="button"
            onClick={() =>
              append({
                employeeId: "",
                status: "attended",
                certificateUrl: "",
                signedAt: "",
                notes: "",
              })
            }
            disabled={
              empLoading ||
              (employees.length > 0 &&
                selectedIdsAll.length >= employees.length)
            }
            className={`px-3 py-1 rounded text-white ${
              empLoading ||
              (employees.length > 0 &&
                selectedIdsAll.length >= employees.length)
                ? "bg-blue/40 cursor-not-allowed"
                : "bg-blue"
            }`}
            title={
              employees.length > 0 && selectedIdsAll.length >= employees.length
                ? "Tous les employés sont déjà sélectionnés"
                : undefined
            }
          >
            Ajouter un participant
          </button>
        </div>

        {fields.map((field, idx) => {
          const selectedInRow = String(attendeesWatch?.[idx]?.employeeId || "");
          const optionsForRow = (employees || []).filter((e) => {
            const id = String(e._id);
            if (selectedInRow && id === selectedInRow) return true; // ✅ garder l'option courante en édition
            return !selectedIdsAll.includes(id); // éviter les doublons avec les autres lignes
          });

          return (
            <div
              key={field.id}
              className="border rounded p-3 flex flex-col gap-3"
            >
              <div className="flex gap-3 midTablet:flex-row flex-col">
                <div className="flex-1">
                  <label className="text-sm font-medium">Employé *</label>
                  <select
                    {...register(`attendees.${idx}.employeeId`, {
                      required: "Requis",
                      validate: (val) => {
                        const id = String(val || "");
                        if (!id) return true;
                        // anti-doublon soft sur le champ (défense 2)
                        const occurs = selectedIdsAll.filter(
                          (x) => x === id
                        ).length;
                        if (occurs > 1) return "Employé déjà sélectionné";
                        return true;
                      },
                    })}
                    className="border rounded p-2 h-[44px] w-full"
                  >
                    <option value="">— Sélectionner —</option>
                    {optionsForRow.map((e) => (
                      <option key={e._id} value={e._id}>
                        {`${e.lastName || e.lastname || ""} ${e.firstName || e.firstname || ""}`.trim() ||
                          e.email ||
                          e.phone ||
                          e._id}
                      </option>
                    ))}
                  </select>
                  {errors.attendees?.[idx]?.employeeId && (
                    <p className="text-xs text-red mt-1">
                      {errors.attendees[idx].employeeId.message}
                    </p>
                  )}
                </div>

                <div className="w-full midTablet:w-56">
                  <label className="text-sm font-medium">Statut</label>
                  <select
                    {...register(`attendees.${idx}.status`)}
                    className="border rounded p-2 h-[44px] w-full"
                  >
                    <option value="attended">Présent</option>
                    <option value="absent">Absent</option>
                    <option value="excused">Excusé</option>
                  </select>
                </div>
              </div>

              <div className="flex gap-3 midTablet:flex-row flex-col">
                <div className="flex-1">
                  <label className="text-sm font-medium">
                    Certificat (URL)
                  </label>
                  <input
                    type="url"
                    {...register(`attendees.${idx}.certificateUrl`)}
                    className="border rounded p-2 h-[44px] w-full"
                    placeholder="https://…/certificat.pdf"
                  />
                </div>
                <div className="w-full midTablet:w-72">
                  <label className="text-sm font-medium">Signé le</label>
                  <input
                    type="datetime-local"
                    {...register(`attendees.${idx}.signedAt`)}
                    className="border rounded p-2 h-[44px] w-full"
                  />
                </div>
              </div>

              <div className="flex gap-3 midTablet:flex-row flex-col">
                <div className="flex-1">
                  <label className="text-sm font-medium">Notes</label>
                  <input
                    type="text"
                    {...register(`attendees.${idx}.notes`)}
                    className="border rounded p-2 h-[44px] w-full"
                  />
                </div>
                <div className="w-full midTablet:w-40 flex items-end justify-end">
                  <button
                    type="button"
                    onClick={() => remove(idx)}
                    className="px-3 py-1 rounded bg-red text-white"
                  >
                    Supprimer
                  </button>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Notes globales */}
      <div>
        <label className="text-sm font-medium">Notes (session)</label>
        <textarea
          rows={4}
          {...register("notes")}
          className="border rounded p-2 resize-none w-full min-h-[96px]"
          placeholder="Observations complémentaires…"
        />
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
