"use client";
import { useEffect } from "react";
import { useForm, useFieldArray } from "react-hook-form";
import axios from "axios";

function toDateValue(value) {
  if (!value) return "";
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? "" : d.toISOString().slice(0, 10);
}
function toDatetimeLocal(value) {
  if (!value) return "";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "";
  const offset = d.getTimezoneOffset() * 60000;
  return new Date(d.getTime() - offset).toISOString().slice(0, 16);
}

function buildDefaults(rec) {
  return {
    provider: rec?.provider ?? "",
    providerId: rec?.providerId ? String(rec.providerId) : "",
    providerContactName: rec?.providerContactName ?? "",
    providerPhone: rec?.providerPhone ?? "",
    providerEmail: rec?.providerEmail ?? "",

    contractStart: toDateValue(rec?.contractStart),
    contractEnd: toDateValue(rec?.contractEnd),
    visitFrequency: rec?.visitFrequency ?? "monthly",

    baitStationsCount:
      rec?.baitStationsCount !== undefined && rec?.baitStationsCount !== null
        ? String(rec.baitStationsCount)
        : "",
    trapsCount:
      rec?.trapsCount !== undefined && rec?.trapsCount !== null
        ? String(rec.trapsCount)
        : "",

    lastVisitAt: toDatetimeLocal(rec?.lastVisitAt),
    nextPlannedVisit: toDatetimeLocal(rec?.nextPlannedVisit),

    activityLevel: rec?.activityLevel ?? "none",
    complianceStatus: rec?.complianceStatus ?? "pending",

    reportUrlsText: Array.isArray(rec?.reportUrls) ? rec.reportUrls.join("\n") : "",
    notes: rec?.notes ?? "",

    actions: Array.isArray(rec?.actions) && rec.actions.length
      ? rec.actions.map((a) => ({
          date: toDatetimeLocal(a?.date),
          action: a?.action ?? "",
          technician: a?.technician ?? "",
          zone: a?.zone ?? "",
          severity: a?.severity ?? "none",
          findings: a?.findings ?? "",
          baitRefilled:
            a?.baitRefilled !== undefined && a?.baitRefilled !== null
              ? String(a.baitRefilled)
              : "",
          proofUrlsText: Array.isArray(a?.proofUrls) ? a.proofUrls.join("\n") : "",
          notes: a?.notes ?? "",
        }))
      : [
          {
            date: "",
            action: "",
            technician: "",
            zone: "",
            severity: "none",
            findings: "",
            baitRefilled: "",
            proofUrlsText: "",
            notes: "",
          },
        ],
  };
}

export default function PestControlForm({ restaurantId, initial = null, onSuccess, onCancel }) {
  const {
    register,
    control,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm({ defaultValues: buildDefaults(initial) });

  const { fields, append, remove } = useFieldArray({ control, name: "actions" });

  useEffect(() => {
    reset(buildDefaults(initial));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initial]);

  const onSubmit = async (data) => {
    const token = localStorage.getItem("token");
    if (!token) return;

    const reportUrls =
      typeof data.reportUrlsText === "string" && data.reportUrlsText.trim().length
        ? data.reportUrlsText
            .split(/[\n,;]+/g)
            .map((s) => s.trim())
            .filter(Boolean)
        : [];

    const actions = (Array.isArray(data.actions) ? data.actions : []).map((a) => ({
      date: a.date ? new Date(a.date) : undefined,
      action: a.action || undefined,
      technician: a.technician || undefined,
      zone: a.zone || undefined,
      severity: a.severity || "none",
      findings: a.findings || undefined,
      baitRefilled:
        a.baitRefilled !== "" && a.baitRefilled != null ? Number(a.baitRefilled) : undefined,
      proofUrls:
        typeof a.proofUrlsText === "string" && a.proofUrlsText.trim().length
          ? a.proofUrlsText
              .split(/[\n,;]+/g)
              .map((s) => s.trim())
              .filter(Boolean)
          : [],
      notes: a.notes || undefined,
    })).filter((x) => x.date);

    const payload = {
      provider: data.provider || undefined,
      providerId: data.providerId || undefined,
      providerContactName: data.providerContactName || undefined,
      providerPhone: data.providerPhone || undefined,
      providerEmail: data.providerEmail || undefined,

      contractStart: data.contractStart ? new Date(data.contractStart) : undefined,
      contractEnd: data.contractEnd ? new Date(data.contractEnd) : undefined,
      visitFrequency: data.visitFrequency || "monthly",

      baitStationsCount:
        data.baitStationsCount !== "" && data.baitStationsCount != null
          ? Number(data.baitStationsCount)
          : undefined,
      trapsCount:
        data.trapsCount !== "" && data.trapsCount != null ? Number(data.trapsCount) : undefined,

      lastVisitAt: data.lastVisitAt ? new Date(data.lastVisitAt) : undefined,
      nextPlannedVisit: data.nextPlannedVisit ? new Date(data.nextPlannedVisit) : undefined,

      activityLevel: data.activityLevel || "none",
      complianceStatus: data.complianceStatus || "pending",

      reportUrls,
      notes: data.notes || undefined,

      actions,
    };

    const url = initial?._id
      ? `${process.env.NEXT_PUBLIC_API_URL}/restaurants/${restaurantId}/pest-controls/${initial._id}`
      : `${process.env.NEXT_PUBLIC_API_URL}/restaurants/${restaurantId}/pest-controls`;
    const method = initial?._id ? "put" : "post";

    const { data: saved } = await axios[method](url, payload, {
      headers: { Authorization: `Bearer ${token}` },
    });

    window.dispatchEvent(new CustomEvent("pest-control:upsert", { detail: { doc: saved } }));

    reset(buildDefaults(null));
    onSuccess?.(saved);
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="bg-white rounded-lg p-4 shadow-sm flex flex-col gap-6">
      {/* Ligne 1 : Prestataire / contrat */}
      <div className="flex flex-col gap-4 mobile:flex-row flex-wrap">
        <div className="flex-1">
          <label className="text-sm font-medium">Prestataire *</label>
          <input
            type="text"
            {...register("provider", { required: "Requis" })}
            className="border rounded p-2 h-[44px] w-full min-w-[200px]"
            placeholder="Nom du prestataire"
          />
          {errors.provider && <p className="text-xs text-red mt-1">{errors.provider.message}</p>}
        </div>
        <div className="w-full mobile:w-48">
          <label className="text-sm font-medium">Fréquence</label>
          <select {...register("visitFrequency")} className="border rounded p-2 h-[44px] w-full">
            <option value="monthly">Mensuelle</option>
            <option value="bimonthly">Bimestrielle</option>
            <option value="quarterly">Trimestrielle</option>
            <option value="semester">Semestrielle</option>
            <option value="yearly">Annuelle</option>
            <option value="on_demand">À la demande</option>
          </select>
        </div>
        <div className="w-full mobile:w-44">
          <label className="text-sm font-medium">Début contrat</label>
          <input type="date" {...register("contractStart")} className="border rounded p-2 h-[44px] w-full" />
        </div>
        <div className="w-full mobile:w-44">
          <label className="text-sm font-medium">Fin contrat</label>
          <input type="date" {...register("contractEnd")} className="border rounded p-2 h-[44px] w-full" />
        </div>
      </div>

      {/* Ligne 2 : contacts & parc */}
      <div className="flex flex-col gap-4 mobile:flex-row flex-wrap">
        <div className="flex-1">
          <label className="text-sm font-medium">Contact</label>
          <input type="text" {...register("providerContactName")} className="border rounded p-2 h-[44px] w-full min-w-[200px]" />
        </div>
        <div className="w-full mobile:w-48">
          <label className="text-sm font-medium">Téléphone</label>
          <input type="text" {...register("providerPhone")} className="border rounded p-2 h-[44px] w-full" />
        </div>
        <div className="w-full mobile:w-72">
          <label className="text-sm font-medium">Email</label>
          <input type="email" {...register("providerEmail")} className="border rounded p-2 h-[44px] w-full" />
        </div>
      </div>

      <div className="flex flex-col gap-4 mobile:flex-row flex-wrap">
        <div className="w-full mobile:w-48">
          <label className="text-sm font-medium">Postes appâts</label>
          <input type="number" {...register("baitStationsCount")} className="border rounded p-2 h-[44px] w-full" />
        </div>
        <div className="w-full mobile:w-48">
          <label className="text-sm font-medium">Pièges</label>
          <input type="number" {...register("trapsCount")} className="border rounded p-2 h-[44px] w-full" />
        </div>
        <div className="w-full mobile:w-56">
          <label className="text-sm font-medium">Niveau activité</label>
          <select {...register("activityLevel")} className="border rounded p-2 h-[44px] w-full">
            <option value="none">Nulle</option>
            <option value="low">Faible</option>
            <option value="medium">Moyenne</option>
            <option value="high">Forte</option>
          </select>
        </div>
        <div className="w-full mobile:w-56">
          <label className="text-sm font-medium">Conformité</label>
          <select {...register("complianceStatus")} className="border rounded p-2 h-[44px] w-full">
            <option value="pending">En attente</option>
            <option value="compliant">Conforme</option>
            <option value="non_compliant">Non conforme</option>
          </select>
        </div>
      </div>

      {/* Dates visites */}
      <div className="flex flex-col gap-4 mobile:flex-row flex-wrap">
        <div className="w-full mobile:w-72">
          <label className="text-sm font-medium">Dernière visite</label>
          <input type="datetime-local" {...register("lastVisitAt")} className="border rounded p-2 h-[44px] w-full" />
        </div>
        <div className="w-full mobile:w-72">
          <label className="text-sm font-medium">Prochaine prévue</label>
          <input
            type="datetime-local"
            {...register("nextPlannedVisit")}
            className="border rounded p-2 h-[44px] w-full"
          />
        </div>
      </div>

      {/* Rapports / Notes */}
      <div className="flex flex-col gap-4 mobile:flex-row flex-wrap">
        <div className="flex-1">
          <label className="text-sm font-medium">Rapports (URLs, 1 par ligne)</label>
          <textarea
            rows={4}
            {...register("reportUrlsText")}
            className="border rounded p-2 resize-none w-full min-h-[96px]"
            placeholder={"https://…/rapport-janvier.pdf\nhttps://…/rapport-mars.pdf"}
          />
        </div>
        <div className="flex-1">
          <label className="text-sm font-medium">Notes</label>
          <textarea rows={4} {...register("notes")} className="border rounded p-2 resize-none w-full min-h-[96px]"/>
        </div>
      </div>

      {/* Actions (journal d’intervention) */}
      <div className="flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <h3 className="text-base font-semibold">Journal d’intervention</h3>
          <button
            type="button"
            onClick={() =>
              append({
                date: "",
                action: "",
                technician: "",
                zone: "",
                severity: "none",
                findings: "",
                baitRefilled: "",
                proofUrlsText: "",
                notes: "",
              })
            }
            className="px-3 py-1 rounded bg-blue text-white"
          >
            Ajouter une action
          </button>
        </div>

        {fields.map((f, idx) => (
          <div key={f.id} className="border rounded p-3 flex flex-col gap-3">
            <div className="flex gap-3 midTablet:flex-row flex-col">
              <div className="w-full mobile:w-72">
                <label className="text-sm font-medium">Date *</label>
                <input
                  type="datetime-local"
                  {...register(`actions.${idx}.date`, { required: "Requis" })}
                  className="border rounded p-2 h-[44px] w-full"
                />
              </div>
              <div className="flex-1">
                <label className="text-sm font-medium">Action</label>
                <input
                  type="text"
                  {...register(`actions.${idx}.action`)}
                  placeholder="Inspection / Pose / Relevé…"
                  className="border rounded p-2 h-[44px] w-full"
                />
              </div>
              <div className="w-full mobile:w-56">
                <label className="text-sm font-medium">Technicien</label>
                <input type="text" {...register(`actions.${idx}.technician`)} className="border rounded p-2 h-[44px] w-full" />
              </div>
            </div>

            <div className="flex gap-3 midTablet:flex-row flex-col">
              <div className="flex-1">
                <label className="text-sm font-medium">Zone</label>
                <input type="text" {...register(`actions.${idx}.zone`)} className="border rounded p-2 h-[44px] w-full" />
              </div>
              <div className="w-full mobile:w-56">
                <label className="text-sm font-medium">Gravité</label>
                <select {...register(`actions.${idx}.severity`)} className="border rounded p-2 h-[44px] w-full">
                  <option value="none">Nulle</option>
                  <option value="low">Faible</option>
                  <option value="medium">Moyenne</option>
                  <option value="high">Forte</option>
                </select>
              </div>
              <div className="w-full mobile:w-48">
                <label className="text-sm font-medium">Appâts rechargés</label>
                <input type="number" {...register(`actions.${idx}.baitRefilled`)} className="border rounded p-2 h-[44px] w-full" />
              </div>
            </div>

            <div className="flex gap-3 midTablet:flex-row flex-col">
              <div className="flex-1">
                <label className="text-sm font-medium">Constats</label>
                <input type="text" {...register(`actions.${idx}.findings`)} className="border rounded p-2 h-[44px] w-full" />
              </div>
              <div className="flex-1">
                <label className="text-sm font-medium">Preuves (URLs, 1 par ligne)</label>
                <textarea rows={3} {...register(`actions.${idx}.proofUrlsText`)} className="border rounded p-2 w-full" />
              </div>
            </div>

            <div>
              <label className="text-sm font-medium">Notes</label>
              <textarea rows={3} {...register(`actions.${idx}.notes`)} className="border rounded p-2 w-full" />
            </div>

            <div className="flex justify-end">
              <button type="button" onClick={() => remove(idx)} className="px-3 py-1 rounded bg-red text-white">
                Supprimer
              </button>
            </div>
          </div>
        ))}
      </div>

      {/* Actions */}
      <div className="flex gap-2">
        <button type="submit" disabled={isSubmitting} className="px-4 py-2 rounded bg-blue text-white disabled:opacity-50">
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
