"use client";
import { useEffect, useMemo, useState } from "react";
import { useForm } from "react-hook-form";
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
    value: record?.value ?? "",
    unit: record?.unit ?? "°C",
    packagingCondition: record?.packagingCondition ?? "unknown",
    note: record?.note ?? "",
    receptionId: (() => {
      const raw = record?.receptionId;
      if (!raw) return "";
      if (typeof raw === "string") return raw;
      if (typeof raw === "object" && raw !== null) {
        return raw._id || "";
      }
      return "";
    })(),
    receivedAt: toDatetimeLocalValue(record?.receivedAt),
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

export default function ReceptionTemperatureForm({
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
  } = useForm({
    defaultValues: buildFormDefaults(initial),
  });

  useEffect(() => {
    reset(buildFormDefaults(initial));
  }, [initial, reset]);

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

  const onSubmit = async (data) => {
    const token = localStorage.getItem("token");
    const payload = {
      ...data,
      receptionId: data.receptionId === "" ? null : data.receptionId,
      // back attend un Date -> convertir le datetime-local (string) en Date
      receivedAt: data.receivedAt ? new Date(data.receivedAt) : undefined,
    };

    const url = initial?._id
      ? `${process.env.NEXT_PUBLIC_API_URL}/restaurants/${restaurantId}/reception-temperatures/${initial._id}`
      : `${process.env.NEXT_PUBLIC_API_URL}/restaurants/${restaurantId}/reception-temperatures`;

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
      <div className="flex flex-col midTablet:flex-row justify-between gap-4">
        <div className="flex flex-col gap-2 w-full">
          <div className="flex flex-wrap justify-between gap-2">
            <div className="flex  gap-2">
              <div className="flex flex-col w-24">
                <label className="text-sm font-medium">Température</label>
                <input
                  type="number"
                  step="0.1"
                  placeholder="ex: 4.5"
                  {...register("value", { required: "Requis" })}
                  className="border rounded p-2 h-[44px]"
                />
                {errors.value && (
                  <p className="text-xs text-red mt-1">
                    {errors.value.message}
                  </p>
                )}
              </div>

              <div className="flex flex-col w-fit">
                <label className="text-sm font-medium">Unité</label>
                <select
                  {...register("unit")}
                  className="border rounded p-2 h-[44px]"
                >
                  <option value="°C">°C</option>
                  <option value="°F">°F</option>
                </select>
              </div>
            </div>

            <div className="flex flex-col">
              <label className="text-sm font-medium">Condition emballage</label>
              <select
                {...register("packagingCondition")}
                className="border rounded p-2 h-[44px]"
              >
                <option value="ok">ok</option>
                <option value="damaged">endommagée</option>
                <option value="wet">humide</option>
                <option value="unknown">inconnue</option>
              </select>
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
            <div className="flex-1 flex flex-col w-1/2">
              <label className="text-sm font-medium">Réception associée</label>
              <select
                {...register("receptionId")}
                className="border rounded p-2 h-[44px]"
              >
                <option value="">Aucune réception liée</option>
                {receptionOptions.map((reception) => (
                  <option key={reception._id} value={String(reception._id)}>
                    {formatReceptionLabel(reception)}
                  </option>
                ))}
              </select>
            </div>

            <div className="flex flex-col w-1/2">
              <label className="text-sm font-medium">Date/heure mesure</label>
              <input
                type="datetime-local"
                {...register("receivedAt")}
                className="border rounded p-2"
              />
            </div>
          </div>
        </div>

        <div className="flex flex-col w-full">
          <label className="text-sm font-medium">Note</label>
          <textarea
            rows={4}
            {...register("note")}
            className="border rounded p-2 resize-none h-full min-h-[96px]"
            placeholder="Informations complémentaires…"
          />
        </div>
      </div>

      <div className="flex gap-2 ">
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
