"use client";
import { useEffect, useMemo, useState } from "react";
import { useForm } from "react-hook-form";
import axios from "axios";

function toDateValue(value) {
  if (!value) return "";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "";
  return d.toISOString().slice(0, 10);
}

function buildFormDefaults(record) {
  return {
    receptionId: (() => {
      const raw = record?.receptionId;
      if (!raw) return "";
      if (typeof raw === "string") return raw;
      if (typeof raw === "object" && raw !== null) return raw._id || "";
      return "";
    })(),

    productName: record?.productName ?? "",
    supplier: record?.supplier ?? "",
    lotNumber: record?.lotNumber ?? "",
    dlc: toDateValue(record?.dlc),
    ddm: toDateValue(record?.ddm),
    allergens: Array.isArray(record?.allergens)
      ? record.allergens.join(", ")
      : "",

    qtyReceived:
      record?.qtyReceived !== undefined && record?.qtyReceived !== null
        ? String(record.qtyReceived)
        : "",
    qtyRemaining:
      record?.qtyRemaining !== undefined && record?.qtyRemaining !== null
        ? String(record.qtyRemaining)
        : "",

    unit: record?.unit ?? "",
    tempOnArrival:
      record?.tempOnArrival !== undefined && record?.tempOnArrival !== null
        ? String(record.tempOnArrival)
        : "",

    packagingCondition: record?.packagingCondition ?? "unknown",
    storageArea: record?.storageArea ?? "",
    openedAt: toDateValue(record?.openedAt),
    internalUseBy: toDateValue(record?.internalUseBy),

    status: record?.status ?? "in_stock",
    disposalReason: record?.disposalReason ?? "",

    labelCode: record?.labelCode ?? "",
    notes: record?.notes ?? "",
  };
}

function formatReceptionLabel(reception) {
  if (!reception) return "Réception enregistrée";
  let dateLabel = "Date inconnue";
  if (reception.receivedAt) {
    const date = new Date(reception.receivedAt);
    if (!Number.isNaN(date.getTime())) {
      dateLabel = date.toLocaleString();
    }
  }
  const supplierInfo = reception.supplier ? ` • ${reception.supplier}` : "";
  return `${dateLabel}${supplierInfo}`;
}

export default function InventoryLotForm({
  restaurantId,
  initial = null,
  onSuccess,
  onCancel,
}) {
  const [receptions, setReceptions] = useState([]);
  const [receptionsLoading, setReceptionsLoading] = useState(false);
  const [receptionsError, setReceptionsError] = useState(false);

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
    watch,
  } = useForm({ defaultValues: buildFormDefaults(initial) });

  useEffect(() => {
    reset(buildFormDefaults(initial));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initial]);

  // Charger les réceptions (même route que ton autre composant)
  useEffect(() => {
    if (!restaurantId) {
      setReceptions([]);
      return;
    }

    let cancelled = false;

    const loadReceptions = async () => {
      setReceptionsLoading(true);
      setReceptionsError(false);

      try {
        const token = localStorage.getItem("token");
        if (!token) {
          if (!cancelled) {
            setReceptions([]);
            setReceptionsLoading(false);
          }
          return;
        }

        const url = `${process.env.NEXT_PUBLIC_API_URL}/restaurants/${restaurantId}/reception-deliveries`;
        const { data } = await axios.get(url, {
          headers: { Authorization: `Bearer ${token}` },
          params: { limit: 100 },
        });

        if (!cancelled) {
          const items = Array.isArray(data?.items) ? data.items : [];
          setReceptions(items);
        }
      } catch (err) {
        if (!cancelled) {
          console.error(err);
          setReceptions([]);
          setReceptionsError(true);
        }
      } finally {
        if (!cancelled) {
          setReceptionsLoading(false);
        }
      }
    };

    loadReceptions();
    return () => {
      cancelled = true;
    };
  }, [restaurantId]);

  const receptionOptions = useMemo(() => {
    const list = Array.isArray(receptions) ? [...receptions] : [];

    const initialReception =
      initial && typeof initial.receptionId === "object" && initial.receptionId
        ? initial.receptionId
        : null;

    if (initialReception && initialReception._id) {
      const hasInitial = list.some(
        (item) => String(item?._id) === String(initialReception._id)
      );
      if (!hasInitial) {
        list.push(initialReception);
      }
    }

    const unique = [];
    const seen = new Set();
    for (const item of list) {
      if (!item || !item._id) continue;
      const key = String(item._id);
      if (seen.has(key)) continue;
      seen.add(key);
      unique.push(item);
    }

    return unique.sort((a, b) => {
      const timeA = a?.receivedAt ? new Date(a.receivedAt).getTime() : 0;
      const timeB = b?.receivedAt ? new Date(b.receivedAt).getTime() : 0;
      return timeB - timeA;
    });
  }, [receptions, initial]);

  const status = watch("status");

  const onSubmit = async (data) => {
    const token = localStorage.getItem("token");
    if (!token) return;

    const payload = {
      receptionId: data.receptionId || undefined,

      productName: data.productName || undefined,
      supplier: data.supplier || undefined,
      lotNumber: data.lotNumber || undefined,

      dlc: data.dlc ? new Date(data.dlc) : undefined,
      ddm: data.ddm ? new Date(data.ddm) : undefined,
      allergens:
        typeof data.allergens === "string" && data.allergens.trim().length
          ? data.allergens
              .split(/[;,]/g)
              .map((s) => s.trim())
              .filter(Boolean)
          : [],

      qtyReceived:
        data.qtyReceived !== "" && data.qtyReceived != null
          ? Number(data.qtyReceived)
          : undefined,

      qtyRemaining:
        initial?._id && data.qtyRemaining !== "" && data.qtyRemaining != null
          ? Number(data.qtyRemaining)
          : undefined,

      unit: data.unit || undefined,
      tempOnArrival:
        data.tempOnArrival !== "" && data.tempOnArrival != null
          ? Number(data.tempOnArrival)
          : undefined,

      packagingCondition: data.packagingCondition || "unknown",
      storageArea: data.storageArea || undefined,

      openedAt: data.openedAt ? new Date(data.openedAt) : undefined,
      internalUseBy: data.internalUseBy
        ? new Date(data.internalUseBy)
        : undefined,

      status: data.status || "in_stock",
      disposalReason:
        data.disposalReason && data.disposalReason.trim().length
          ? data.disposalReason
          : undefined,

      labelCode: data.labelCode || undefined,
      notes: data.notes || undefined,
    };

    const url = initial?._id
      ? `${process.env.NEXT_PUBLIC_API_URL}/restaurants/${restaurantId}/inventory-lots/${initial._id}`
      : `${process.env.NEXT_PUBLIC_API_URL}/restaurants/${restaurantId}/inventory-lots`;
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
      {/* Ligne réception associée */}
      <div className="flex gap-3 midTablet:flex-row flex-col">
        <div className="flex-1">
          <label className="text-sm font-medium">Réception associée</label>
          <select
            {...register("receptionId")}
            className="border rounded p-2 h-[44px] w-full"
          >
            <option value="">Aucune réception liée</option>
            {receptionOptions.map((reception) => (
              <option key={reception._id} value={String(reception._id)}>
                {formatReceptionLabel(reception)}
              </option>
            ))}
          </select>
          {receptionsError && (
            <p className="text-xs text-red mt-1">
              Erreur lors du chargement des réceptions.
            </p>
          )}
        </div>
      </div>

      {/* En-tête produit */}
      <div className="flex flex-col gap-4 midTablet:flex-row">
        <div className="flex-1">
          <label className="text-sm font-medium">Produit *</label>
          <input
            type="text"
            placeholder="Désignation"
            {...register("productName", { required: "Requis" })}
            className="border rounded p-2 h-[44px] w-full"
          />
          {errors.productName && (
            <p className="text-xs text-red mt-1">
              {errors.productName.message}
            </p>
          )}
        </div>

        <div className="flex-1">
          <label className="text-sm font-medium">Fournisseur</label>
          <input
            type="text"
            placeholder="Nom du fournisseur"
            {...register("supplier")}
            className="border rounded p-2 h-[44px] w-full"
          />
        </div>
      </div>

      {/* Traçabilité */}
      <div className="flex flex-col gap-4 midTablet:flex-row">
        <div className="flex-1">
          <label className="text-sm font-medium">N° lot *</label>
          <input
            type="text"
            placeholder="Lot"
            {...register("lotNumber", { required: "Requis" })}
            className="border rounded p-2 h-[44px] w-full"
          />
          {errors.lotNumber && (
            <p className="text-xs text-red mt-1">{errors.lotNumber.message}</p>
          )}
        </div>
        <div className="flex-1">
          <label className="text-sm font-medium">DLC</label>
          <input
            type="date"
            {...register("dlc")}
            className="border rounded p-2 h-[44px] w-full"
          />
        </div>
        <div className="flex-1">
          <label className="text-sm font-medium">DDM</label>
          <input
            type="date"
            {...register("ddm")}
            className="border rounded p-2 h-[44px] w-full"
          />
        </div>
      </div>

      {/* Quantités */}
      <div className="flex gap-3 midTablet:flex-row flex-col">
        <div className="flex-1">
          <label className="text-sm font-medium">Qté reçue *</label>
          <input
            type="number"
            step="0.01"
            placeholder="ex: 5"
            {...register("qtyReceived", { required: "Requis" })}
            className="border rounded p-2 h-[44px] w-full"
          />
          {errors.qtyReceived && (
            <p className="text-xs text-red mt-1">
              {errors.qtyReceived.message}
            </p>
          )}
        </div>
        {initial?._id && (
          <div className="flex-1">
            <label className="text-sm font-medium">Qté restante</label>
            <input
              type="number"
              step="0.01"
              placeholder="ex: 3"
              {...register("qtyRemaining")}
              className="border rounded p-2 h-[44px] w-full"
            />
          </div>
        )}
        <div className="w-36">
          <label className="text-sm font-medium">Unité *</label>
          <select
            {...register("unit", { required: "Requis" })}
            className="border rounded p-2 h-[44px] w-full"
          >
            <option value="">—</option>
            <option value="kg">kg</option>
            <option value="g">g</option>
            <option value="L">L</option>
            <option value="mL">mL</option>
            <option value="unit">unité</option>
          </select>
          {errors.unit && (
            <p className="text-xs text-red mt-1">{errors.unit.message}</p>
          )}
        </div>
      </div>

      {/* Conditions & Allergènes */}
      <div className="flex gap-3 midTablet:flex-row flex-col">
        <div className="flex-1">
          <label className="text-sm font-medium">T° à l’arrivée</label>
          <input
            type="number"
            step="0.1"
            placeholder="ex: 4.5"
            {...register("tempOnArrival")}
            className="border rounded p-2 h-[44px] w-full"
          />
        </div>
        <div className="flex-1">
          <label className="text-sm font-medium">Allergènes</label>
          <input
            type="text"
            placeholder="séparés par virgules (ex: gluten, lait)"
            {...register("allergens")}
            className="border rounded p-2 h-[44px] w-full"
          />
        </div>
        <div className="w-48">
          <label className="text-sm font-medium">Emballage</label>
          <select
            {...register("packagingCondition")}
            className="border rounded p-2 h-[44px] w-full"
          >
            <option value="unknown">inconnue</option>
            <option value="ok">ok</option>
            <option value="damaged">endommagée</option>
            <option value="wet">humide</option>
          </select>
        </div>
      </div>

      {/* Stockage & dates d’ouverture */}
      <div className="flex gap-3 midTablet:flex-row flex-col">
        <div className="flex-1">
          <label className="text-sm font-medium">Zone de stockage</label>
          <input
            type="text"
            placeholder="ex: fridge-1, dry, freezer-2"
            {...register("storageArea")}
            className="border rounded p-2 h-[44px] w-full"
          />
        </div>
        <div className="flex-1">
          <label className="text-sm font-medium">Ouvert le</label>
          <input
            type="date"
            {...register("openedAt")}
            className="border rounded p-2 h-[44px] w-full"
          />
        </div>
        <div className="flex-1">
          <label className="text-sm font-medium">DLU après ouverture</label>
          <input
            type="date"
            {...register("internalUseBy")}
            className="border rounded p-2 h-[44px] w-full"
          />
        </div>
      </div>

      {/* Statut */}
      <div className="flex gap-3 midTablet:flex-row flex-col">
        <div className="w-60">
          <label className="text-sm font-medium">Statut</label>
          <select
            {...register("status")}
            className="border rounded p-2 h-[44px] w-full"
          >
            <option value="in_stock">En stock</option>
            <option value="used">Utilisé</option>
            <option value="expired">Périmé</option>
            <option value="discarded">Jeté</option>
            <option value="returned">Retourné</option>
            <option value="recalled">Rappel</option>
          </select>
        </div>
        <div className="flex-1">
          <label className="text-sm font-medium">
            Motif (si jeté/retourné/rappel)
          </label>
          <input
            type="text"
            placeholder="motif"
            {...register("disposalReason")}
            className="border rounded p-2 h-[44px] w-full"
          />
          {["discarded", "returned", "recalled"].includes(watch("status")) && (
            <p className="text-xs opacity-70 mt-1">
              Recommandé : renseigner le motif lorsque le statut est{" "}
              {watch("status")}.
            </p>
          )}
        </div>
      </div>

      {/* Liens & notes */}
      <div className="flex gap-3 midTablet:flex-row flex-col">
        <div className="flex-1">
          <label className="text-sm font-medium">Code étiquette</label>
          <input
            type="text"
            placeholder="ex: QR-ABC123"
            {...register("labelCode")}
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
          placeholder="Observations, info d’étiquette interne…"
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
