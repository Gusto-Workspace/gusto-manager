"use client";
import { useEffect } from "react";
import { useForm, useFieldArray } from "react-hook-form";
import axios from "axios";

function toDatetimeLocalValue(value) {
  const base = value ? new Date(value) : new Date();
  if (Number.isNaN(base.getTime())) {
    const fallback = new Date();
    const offset = fallback.getTimezoneOffset() * 60000;
    return new Date(fallback.getTime() - offset).toISOString().slice(0, 16);
  }
  const offset = base.getTimezoneOffset() * 60000;
  return new Date(base.getTime() - offset).toISOString().slice(0, 16);
}

function buildFormDefaults(record) {
  return {
    supplier: record?.supplier ?? "",
    receivedAt: toDatetimeLocalValue(record?.receivedAt),
    note: record?.note ?? "",
    billUrl: record?.billUrl ?? "",
    lines:
      Array.isArray(record?.lines) && record.lines.length
        ? record.lines.map((l) => ({
            productName: l?.productName ?? "",
            supplierProductId: l?.supplierProductId ?? "",
            lotNumber: l?.lotNumber ?? "",
            dlc: l?.dlc ? new Date(l.dlc).toISOString().slice(0, 10) : "",
            ddm: l?.ddm ? new Date(l.ddm).toISOString().slice(0, 10) : "",
            qty: l?.qty ?? "",
            unit: l?.unit ?? "",
            tempOnArrival: l?.tempOnArrival ?? "",
            allergens: Array.isArray(l?.allergens)
              ? l.allergens.join(", ")
              : "",
            packagingCondition: l?.packagingCondition ?? "unknown",
          }))
        : [
            {
              productName: "",
              supplierProductId: "",
              lotNumber: "",
              dlc: "",
              ddm: "",
              qty: "",
              unit: "",
              tempOnArrival: "",
              allergens: "",
              packagingCondition: "unknown",
            },
          ],
  };
}

export default function ReceptionDeliveryForm({
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
    formState: { errors, isSubmitting },
  } = useForm({ defaultValues: buildFormDefaults(initial) });

  const { fields, append, remove } = useFieldArray({ control, name: "lines" });

  useEffect(() => {
    reset(buildFormDefaults(initial));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initial]);

  const onSubmit = async (data) => {
    const token = localStorage.getItem("token");
    if (!token) return;

    const payload = {
      supplier: data.supplier,
      receivedAt: data.receivedAt ? new Date(data.receivedAt) : undefined,
      note: data.note || undefined,
      billUrl: data.billUrl || undefined, // pour l’instant simple URL
      lines: (Array.isArray(data.lines) ? data.lines : [])
        .map((l) => ({
          productName: l.productName || undefined,
          supplierProductId: l.supplierProductId || undefined,
          lotNumber: l.lotNumber || undefined,
          dlc: l.dlc ? new Date(l.dlc) : undefined,
          ddm: l.ddm ? new Date(l.ddm) : undefined,
          qty: l.qty !== "" && l.qty != null ? Number(l.qty) : undefined,
          unit: l.unit || undefined,
          tempOnArrival:
            l.tempOnArrival !== "" && l.tempOnArrival != null
              ? Number(l.tempOnArrival)
              : undefined,
          allergens:
            typeof l.allergens === "string" && l.allergens.trim().length
              ? l.allergens
                  .split(/[;,]/g)
                  .map((s) => s.trim())
                  .filter(Boolean)
              : [],
          packagingCondition: l.packagingCondition || "unknown",
        }))
        // on laisse le serveur filtrer aussi, mais on évite d’envoyer des lignes vides
        .filter((x) =>
          Object.values(x).some((v) => v !== undefined && v !== "")
        ),
    };

    const url = initial?._id
      ? `${process.env.NEXT_PUBLIC_API_URL}/restaurants/${restaurantId}/reception-deliveries/${initial._id}`
      : `${process.env.NEXT_PUBLIC_API_URL}/restaurants/${restaurantId}/reception-deliveries`;
    const method = initial?._id ? "put" : "post";

    const { data: saved } = await axios[method](url, payload, {
      headers: { Authorization: `Bearer ${token}` },
    });

    reset(buildFormDefaults(null));
    onSuccess?.(saved);
  };

  return (
    <form
      onSubmit={handleSubmit(onSubmit)}
      className="bg-white rounded-lg p-4 shadow-sm flex flex-col gap-6"
    >
      {/* En-tête réception */}
      <div className="flex flex-col gap-4 midTablet:flex-row">
        <div className="flex-1">
          <label className="text-sm font-medium">Fournisseur *</label>
          <input
            type="text"
            placeholder="Nom du fournisseur"
            {...register("supplier", { required: "Requis" })}
            className="border rounded p-2 h-[44px] w-full"
          />
          {errors.supplier && (
            <p className="text-xs text-red mt-1">{errors.supplier.message}</p>
          )}
        </div>
        <div className="flex-1">
          <label className="text-sm font-medium">Date/heure réception *</label>
          <input
            type="datetime-local"
            {...register("receivedAt")}
            className="border rounded p-2 h-[44px] w-full"
          />
        </div>
      </div>

      {/* Lignes produits */}
      <div className="flex flex-col gap-4">
        <div className="flex items-center justify-between">
          <h3 className="text-base font-semibold">Produits reçus</h3>
          <button
            type="button"
            onClick={() =>
              append({
                productName: "",
                supplierProductId: "",
                lotNumber: "",
                dlc: "",
                ddm: "",
                qty: "",
                unit: "",
                tempOnArrival: "",
                allergens: "",
                packagingCondition: "unknown",
              })
            }
            className="px-3 py-1 rounded bg-blue text-white"
          >
            Ajouter une ligne
          </button>
        </div>

        {fields.map((field, idx) => (
          <div
            key={field.id}
            className="border rounded p-3 flex flex-col gap-3"
          >
            <div className="flex gap-3 midTablet:flex-row flex-col">
              <div className="flex-1">
                <label className="text-sm font-medium">Produit *</label>
                <input
                  type="text"
                  placeholder="Désignation"
                  {...register(`lines.${idx}.productName`)}
                  className="border rounded p-2 h-[44px] w-full"
                />
              </div>
              <div className="flex-1">
                <label className="text-sm font-medium">Réf. fournisseur</label>
                <input
                  type="text"
                  placeholder="Code article fournisseur"
                  {...register(`lines.${idx}.supplierProductId`)}
                  className="border rounded p-2 h-[44px] w-full"
                />
              </div>
              <div className="flex-1">
                <label className="text-sm font-medium">N° lot</label>
                <input
                  type="text"
                  placeholder="Lot"
                  {...register(`lines.${idx}.lotNumber`)}
                  className="border rounded p-2 h-[44px] w-full"
                />
              </div>
            </div>

            <div className="flex gap-3 midTablet:flex-row flex-col">
              <div className="flex-1">
                <label className="text-sm font-medium">DLC</label>
                <input
                  type="date"
                  {...register(`lines.${idx}.dlc`)}
                  className="border rounded p-2 h-[44px] w-full"
                />
              </div>
              <div className="flex-1">
                <label className="text-sm font-medium">DDM</label>
                <input
                  type="date"
                  {...register(`lines.${idx}.ddm`)}
                  className="border rounded p-2 h-[44px] w-full"
                />
              </div>
              <div className="flex-1 flex gap-2">
                <div className="flex-1">
                  <label className="text-sm font-medium">Qté</label>
                  <input
                    type="number"
                    step="0.01"
                    placeholder="ex: 5"
                    {...register(`lines.${idx}.qty`)}
                    className="border rounded p-2 h-[44px] w-full"
                  />
                </div>
                <div className="w-36">
                  <label className="text-sm font-medium">Unité</label>
                  <select
                    {...register(`lines.${idx}.unit`)}
                    className="border rounded p-2 h-[44px] w-full"
                  >
                    <option value="">—</option>
                    <option value="kg">kg</option>
                    <option value="g">g</option>
                    <option value="L">L</option>
                    <option value="mL">mL</option>
                    <option value="unit">unité</option>
                  </select>
                </div>
              </div>
            </div>

            <div className="flex gap-3 midTablet:flex-row flex-col">
              <div className="flex-1">
                <label className="text-sm font-medium">T° à l’arrivée</label>
                <input
                  type="number"
                  step="0.1"
                  placeholder="ex: 4.5"
                  {...register(`lines.${idx}.tempOnArrival`)}
                  className="border rounded p-2 h-[44px] w-full"
                />
              </div>
              <div className="flex-1">
                <label className="text-sm font-medium">Allergènes</label>
                <input
                  type="text"
                  placeholder="séparés par virgules (ex: gluten, lait)"
                  {...register(`lines.${idx}.allergens`)}
                  className="border rounded p-2 h-[44px] w-full"
                />
              </div>
              <div className="w-48">
                <label className="text-sm font-medium">Emballage</label>
                <select
                  {...register(`lines.${idx}.packagingCondition`)}
                  className="border rounded p-2 h-[44px] w-full"
                >
                  <option value="unknown">inconnue</option>
                  <option value="ok">ok</option>
                  <option value="damaged">endommagée</option>
                  <option value="wet">humide</option>
                </select>
              </div>
            </div>

            <div className="flex justify-end">
              <button
                type="button"
                onClick={() => remove(idx)}
                className="px-3 py-1 rounded bg-red text-white"
              >
                Supprimer la ligne
              </button>
            </div>
          </div>
        ))}
      </div>

      {/* Pièce jointe simple + Note */}
      <div className="flex flex-col midTablet:flex-row gap-4">
        <div className="flex-1">
          <label className="text-sm font-medium">
            Lien du bon de livraison (URL)
          </label>
          <input
            type="url"
            placeholder="https://… (optionnel)"
            {...register("billUrl")}
            className="border rounded p-2 h-[44px] w-full"
          />
        </div>
        <div className="flex-1">
          <label className="text-sm font-medium">Note</label>
          <textarea
            rows={4}
            {...register("note")}
            className="border rounded p-2 resize-none w-full h-[44px] min-h-[96px]"
            placeholder="Observations à la réception…"
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
              reset(buildFormDefaults(null));
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
