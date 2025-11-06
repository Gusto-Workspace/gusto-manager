// app/(components)/oil/OilChangeForm.jsx
"use client";
import { useEffect } from "react";
import { useForm } from "react-hook-form";
import axios from "axios";
import {
  CalendarClock,
  FileText,
  Hash,
  Link as LinkIcon,
  Loader2,
  Wrench,
  Droplet,
  Building2,
  Percent,
  Filter,
  Palette,
  Wind,
  Tag,
} from "lucide-react";

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
    fryerId: record?.fryerId ?? "",
    performedAt: toDatetimeLocalValue(record?.performedAt),

    litersRemoved:
      record?.litersRemoved !== undefined && record?.litersRemoved !== null
        ? String(record.litersRemoved)
        : "",

    // Huile neuve
    batchNumber: record?.newOilBatch?.batchNumber ?? "",
    supplier: record?.newOilBatch?.supplier
      ? String(record.newOilBatch.supplier)
      : "",

    // Qualité
    tpmPercent:
      record?.tpmPercent !== undefined && record?.tpmPercent !== null
        ? String(record.tpmPercent)
        : "",
    filteredBeforeChange: Boolean(record?.filteredBeforeChange ?? false),
    colorIndex: record?.colorIndex ?? "",
    odorCheck: record?.odorCheck ?? "",
    oilBrand: record?.oilBrand ?? "",

    qualityNotes: record?.qualityNotes ?? "",
    disposalDocumentUrl: record?.disposalDocumentUrl ?? "",
  };
}

export default function OilChangeForm({
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
  } = useForm({ defaultValues: buildFormDefaults(initial) });

  useEffect(() => {
    reset(buildFormDefaults(initial));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initial]);

  const onSubmit = async (data) => {
    const token = localStorage.getItem("token");
    if (!token) return;

    const payload = {
      fryerId: data.fryerId || undefined,
      performedAt: data.performedAt ? new Date(data.performedAt) : undefined,

      litersRemoved:
        data.litersRemoved !== "" && data.litersRemoved != null
          ? Number(String(data.litersRemoved).replace(",", "."))
          : undefined,

      newOilBatch:
        data.batchNumber || data.supplier
          ? {
              ...(data.batchNumber ? { batchNumber: data.batchNumber } : {}),
              ...(data.supplier ? { supplier: data.supplier } : {}),
            }
          : undefined,

      tpmPercent:
        data.tpmPercent !== "" && data.tpmPercent != null
          ? Number(String(data.tpmPercent).replace(",", "."))
          : undefined,

      filteredBeforeChange: !!data.filteredBeforeChange,
      colorIndex: data.colorIndex || undefined,
      odorCheck: data.odorCheck || undefined,
      oilBrand: data.oilBrand || undefined,

      qualityNotes: data.qualityNotes || undefined,
      disposalDocumentUrl: data.disposalDocumentUrl || undefined,
    };

    const url = initial?._id
      ? `${process.env.NEXT_PUBLIC_API_URL}/restaurants/${restaurantId}/oil-changes/${initial._id}`
      : `${process.env.NEXT_PUBLIC_API_URL}/restaurants/${restaurantId}/oil-changes`;
    const method = initial?._id ? "put" : "post";

    const { data: saved } = await axios[method](url, payload, {
      headers: { Authorization: `Bearer ${token}` },
    });

    window.dispatchEvent(
      new CustomEvent("oil-change:upsert", { detail: { doc: saved } })
    );

    reset(buildFormDefaults(null));
    onSuccess?.(saved);
  };

  // --- Styles (comme Microbiology/SupplierCertificateForm)
  const fieldWrap =
    "group relative rounded-xl bg-white/50 backdrop-blur-sm px-3 py-2 h-[80px] transition-shadow";
  const labelCls =
    "flex items-center gap-2 text-xs font-medium text-darkBlue/60 mb-1";
  const inputCls =
    "h-11 w-full rounded-lg border border-darkBlue/20 bg-white px-3 text-[15px] outline-none transition placeholder:text-darkBlue/40";
  const selectCls =
    "h-11 w-full appearance-none rounded-lg border border-darkBlue/20 bg-white px-3 text-[15px] outline-none transition";
  const btnPrimary =
    "text-nowrap inline-flex items-center justify-center gap-2 h-[38px] rounded-lg bg-blue px-4 py-2 text-sm font-medium text-white shadow disabled:opacity-60";
  const btnSecondary =
    "inline-flex items-center justify-center gap-2 rounded-lg border border-red bg-white px-4 py-2 text-sm font-medium text-red";

  const notesVal = watch("qualityNotes");
  const filtered = watch("filteredBeforeChange");

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="relative flex flex-col gap-2">
      {/* Ligne 1 : Matériel / Date */}
      <div className="grid grid-cols-1 gap-2 midTablet:grid-cols-2">
        <div className={fieldWrap}>
          <label className={labelCls}>
            <Wrench className="size-4" />
            Friteuse / Équipement
          </label>
          <input
            type="text"
            placeholder="ex: fryer-1 / cuisine"
            {...register("fryerId")}
            className={inputCls}
            autoComplete="off"
            spellCheck={false}
            autoCorrect="off"
          />
        </div>

        <div className={fieldWrap}>
          <label className={labelCls}>
            <CalendarClock className="size-4" />
            Date / heure *
          </label>
          <input
            type="datetime-local"
            {...register("performedAt", { required: "Requis" })}
            className={selectCls}
          />
          {errors.performedAt && (
            <p className="mt-1 text-xs text-red">{errors.performedAt.message}</p>
          )}
        </div>
      </div>

      {/* Ligne 2 : Volume retiré / Lot / Fournisseur */}
      <div className="grid grid-cols-1 gap-2 midTablet:grid-cols-3">
        <div className={fieldWrap}>
          <label className={labelCls}>
            <Droplet className="size-4" />
            Litres retirés
          </label>
          <input
            type="number"
            step="0.1"
            placeholder="ex: 12.5"
            onWheel={(e) => e.currentTarget.blur()}
            {...register("litersRemoved")}
            className={inputCls}
          />
        </div>

        <div className={fieldWrap}>
          <label className={labelCls}>
            <Hash className="size-4" />
            N° lot (huile neuve)
          </label>
          <input
            type="text"
            placeholder="ex: OIL-2025-07-18-A"
            {...register("batchNumber")}
            className={inputCls}
            autoComplete="off"
            spellCheck={false}
            autoCorrect="off"
          />
        </div>

        <div className={fieldWrap}>
          <label className={labelCls}>
            <Building2 className="size-4" />
            Fournisseur
          </label>
          <input
            type="text"
            placeholder="Nom du fournisseur"
            {...register("supplier")}
            className={inputCls}
            autoComplete="off"
            spellCheck={false}
            autoCorrect="off"
          />
        </div>
      </div>

      {/* Ligne 3 : TPM + Filtrage (switch) */}
      <div className="grid grid-cols-1 gap-2 midTablet:grid-cols-3">
        <div className={fieldWrap}>
          <label className={labelCls}>
            <Percent className="size-4" />
            % TPM
          </label>
          <input
            type="number"
            step="0.1"
            min="0"
            max="100"
            onWheel={(e) => e.currentTarget.blur()}
            placeholder="ex: 22.5"
            {...register("tpmPercent")}
            className={inputCls}
          />
        </div>

        <div className={`${fieldWrap} midTablet:col-span-2`}>
          <label className={labelCls}>
            <Filter className="size-4" />
            Filtrage (service)
          </label>

          <label
            role="switch"
            aria-checked={!!filtered}
            className="group inline-flex justify-between h-11 w-full items-center gap-3 rounded-lg border border-darkBlue/20 bg-white px-3 py-2 cursor-pointer select-none"
          >
            <span className="text-sm text-darkBlue/70">
              {filtered ? "Filtrée avant/pendant" : "Non filtrée"}
            </span>

            {/* RHF checkbox masquée + peer */}
            <input
              type="checkbox"
              {...register("filteredBeforeChange")}
              className="sr-only peer"
              onChange={(e) =>
                setValue("filteredBeforeChange", e.target.checked, {
                  shouldDirty: true,
                })
              }
            />

            <span
              className="
                relative inline-flex h-6 w-11 items-center rounded-full
                bg-darkBlue/20 transition-colors
                group-aria-checked:bg-darkBlue/80
                peer-checked:bg-darkBlue/80
              "
            >
              <span
                className="
                  absolute left-1 top-1/2 -translate-y-1/2
                  size-4 rounded-full bg-white shadow
                  transition-transform will-change-transform translate-x-0
                  group-aria-checked:translate-x-5
                  peer-checked:translate-x-5
                "
              />
            </span>
          </label>
        </div>
      </div>

      {/* Ligne 4 : Couleur / Odeur / Marque */}
      <div className="grid grid-cols-1 gap-2 midTablet:grid-cols-3">
        <div className={fieldWrap}>
          <label className={labelCls}>
            <Palette className="size-4" />
            Couleur / Indice
          </label>
          <input
            type="text"
            placeholder="ex: dorée / ambrée / foncée…"
            {...register("colorIndex")}
            className={inputCls}
            autoComplete="off"
            spellCheck={false}
            autoCorrect="off"
          />
        </div>

        <div className={fieldWrap}>
          <label className={labelCls}>
            <Wind className="size-4" />
            Odeur
          </label>
          <input
            type="text"
            placeholder="ex: neutre, ok, rance…"
            {...register("odorCheck")}
            className={inputCls}
            autoComplete="off"
            spellCheck={false}
            autoCorrect="off"
          />
        </div>

        <div className={fieldWrap}>
          <label className={labelCls}>
            <Tag className="size-4" />
            Marque d’huile
          </label>
          <input
            type="text"
            placeholder="ex: XYZ ProFry"
            {...register("oilBrand")}
            className={inputCls}
            autoComplete="off"
            spellCheck={false}
            autoCorrect="off"
          />
        </div>
      </div>

      {/* Ligne 5 : Observations / Lien doc */}
      <div className="grid grid-cols-1 gap-2 midTablet:grid-cols-2">
        <div className={fieldWrap}>
          <label className={labelCls}>
            <FileText className="size-4" />
            Observations qualité
          </label>
          <div className="relative">
            <textarea
              rows={1}
              {...register("qualityNotes")}
              className="w-full resize-none rounded-lg border border-darkBlue/20 bg-white p-[10px] pr-16 text-[15px] outline-none transition placeholder:text-darkBlue/40"
              placeholder="Couleur, odeur, particules, filtrage, seuil TPM, etc."
            />
            <span className="pointer-events-none absolute bottom-2 right-3 select-none text-[11px] text-darkBlue/40">
              {(notesVal?.length ?? 0).toString()}
            </span>
          </div>
        </div>

        <div className={fieldWrap}>
          <label className={labelCls}>
            <LinkIcon className="size-4" />
            Lien doc. élimination (URL)
          </label>
          <input
            type="url"
            placeholder="https://… (BSDA, ticket collecte, etc.)"
            {...register("disposalDocumentUrl")}
            className={inputCls}
            autoComplete="off"
            spellCheck={false}
            autoCorrect="off"
          />
        </div>
      </div>

      {/* Actions */}
      <div className="flex flex-col gap-2 mt-3 mobile:flex-row">
        <button type="submit" disabled={isSubmitting} className={btnPrimary}>
          {isSubmitting ? (
            <>
              <Loader2 className="size-4 animate-spin" />
              Enregistrement…
            </>
          ) : initial?._id ? (
            <>
              <FileText className="size-4" />
              Mettre à jour
            </>
          ) : (
            <>
              <FileText className="size-4" />
              Enregistrer
            </>
          )}
        </button>

        {initial?._id && (
          <button
            type="button"
            onClick={() => {
              reset(buildFormDefaults(null));
              onCancel?.();
            }}
            className={btnSecondary}
          >
            Annuler
          </button>
        )}
      </div>
    </form>
  );
}
