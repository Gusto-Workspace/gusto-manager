"use client";
import { useContext, useEffect, useMemo, useState, useCallback } from "react";
import { useForm, useFieldArray } from "react-hook-form";
import axios from "axios";
import { GlobalContext } from "@/contexts/global.context";

/* ---------- Utils ---------- */
const toDTLocal = (v) => {
  if (!v) return "";
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return "";
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000)
    .toISOString()
    .slice(0, 16);
};
const nowLocal = () => toDTLocal(new Date());
const empId = (v) =>
  v ? String(typeof v === "object" ? v._id || v.id || "" : v) : "";
const empFull = (v) => {
  if (!v || typeof v !== "object") return "";
  const f = v.firstname || v.firstName || "";
  const l = v.lastname || v.lastName || "";
  return `${f} ${l}`.trim();
};
const parseList = (s) =>
  typeof s === "string" && s.trim()
    ? s
        .split(/[\n,;]+/g)
        .map((x) => x.trim())
        .filter(Boolean)
    : [];
const normalize = (s) =>
  (s || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .toLowerCase()
    .trim();

const buildDefaults = (rec) => ({
  source: rec?.source ?? "internal",
  itemName: rec?.itemName ?? "",
  itemId: rec?.itemId ? String(rec.itemId) : "",
  itemRefModel: rec?.itemRefModel ?? "",
  supplierId: rec?.supplierId ? String(rec.supplierId) : "",
  detectedAt: toDTLocal(rec?.detectedAt ?? new Date()),
  detectedBy: empId(rec?.detectedBy),
  detectedByDisplay: empFull(rec?.detectedBy),
  allergensText: Array.isArray(rec?.allergens) ? rec.allergens.join("\n") : "",
  severity: rec?.severity ?? "medium",
  description: rec?.description ?? "",
  immediateAction: rec?.immediateAction ?? "",
  attachmentsText: Array.isArray(rec?.attachments)
    ? rec.attachments.join("\n")
    : "",
  closed: !!rec?.closed,
  closedAt: toDTLocal(rec?.closedAt),
  correctiveActions:
    Array.isArray(rec?.correctiveActions) && rec.correctiveActions.length
      ? rec.correctiveActions.map((c) => ({
          action: c?.action ?? "",
          done: !!c?.done,
          doneAt: toDTLocal(c?.doneAt),
          doneBy: empId(c?.doneBy),
          doneByDisplay: empFull(c?.doneBy),
          note: c?.note ?? "",
        }))
      : [
          {
            action: "",
            done: false,
            doneAt: "",
            doneBy: "",
            doneByDisplay: "",
            note: "",
          },
        ],
});

export default function AllergenIncidentForm({
  restaurantId,
  initial = null,
  onSuccess,
  onCancel,
}) {
  const {
    register,
    handleSubmit,
    control,
    reset,
    watch,
    setValue,
    getValues,
    setError,
    clearErrors,
    formState: { errors, isSubmitting },
  } = useForm({ defaultValues: buildDefaults(initial) });

  const { fields, append, remove } = useFieldArray({
    control,
    name: "correctiveActions",
  });

  /* ---------- Employees (pré-normalisés) ---------- */
  const { restaurantContext } = useContext(GlobalContext);
  const employees = useMemo(() => {
    const list = restaurantContext.restaurantData?.employees || [];
    return list.map((e) => {
      const full = `${e.firstname ?? ""} ${e.lastname ?? ""}`.trim();
      return {
        _id: String(e._id),
        firstname: e.firstname,
        lastname: e.lastname,
        full,
        nfull: normalize(full),
      };
    });
  }, [restaurantContext.restaurantData?.employees]);
  const exactMap = useMemo(
    () => new Map(employees.map((e) => [e.nfull, e])),
    [employees]
  );

  const findExact = useCallback(
    (txt) => (txt ? exactMap.get(normalize(txt)) || null : null),
    [exactMap]
  );
  const searchEmp = useCallback(
    (q, limit) => {
      const n = normalize(q);
      if (!n) return employees.slice(0, limit);
      const out = [];
      for (let i = 0; i < employees.length && out.length < limit; i++) {
        if (employees[i].nfull.includes(n)) out.push(employees[i]);
      }
      return out;
    },
    [employees]
  );

  /* ---------- Détecté par (auto-complétion) ---------- */
  const [detectedQuery, setDetectedQuery] = useState(
    buildDefaults(initial).detectedByDisplay || ""
  );
  const [showDetectedDropdown, setShowDetectedDropdown] = useState(false);
  const detectedBy = watch("detectedBy") || "";
  const detectedOptions = useMemo(
    () => searchEmp(detectedQuery, 10),
    [searchEmp, detectedQuery]
  );
  const detectedInvalid = detectedQuery.trim() !== "" && !detectedBy;

  // Sync libellé quand id change / liste prête
  useEffect(() => {
    if (detectedBy) {
      const found = employees.find((e) => e._id === String(detectedBy));
      if (found && found.full !== detectedQuery) setDetectedQuery(found.full);
    } else if (initial?.detectedBy) {
      const disp = empFull(initial.detectedBy);
      if (disp && disp !== detectedQuery) setDetectedQuery(disp);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [detectedBy, employees]);

  const pickDetected = (emp) => {
    setValue("detectedBy", emp?._id || "", {
      shouldDirty: true,
      shouldValidate: true,
    });
    setDetectedQuery(emp?.full || "");
    clearErrors("detectedBy");
    setShowDetectedDropdown(false);
  };
  const clearDetected = () => {
    setValue("detectedBy", "", { shouldDirty: true, shouldValidate: true });
    setDetectedQuery("");
    setShowDetectedDropdown(false);
    clearErrors("detectedBy");
  };
  const onDetectedKeyDown = (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      if (detectedOptions.length) pickDetected(detectedOptions[0]);
    } else if (e.key === "Escape") setShowDetectedDropdown(false);
  };
  const verifyDetected = useCallback(() => {
    const txt = detectedQuery.trim();
    const curId = getValues("detectedBy") || "";
    if (!txt) return true;
    if (curId) return true;
    const exact = findExact(txt);
    if (exact) {
      setValue("detectedBy", exact._id, {
        shouldDirty: true,
        shouldValidate: true,
      });
      setDetectedQuery(exact.full);
      clearErrors("detectedBy");
      return true;
    }
    setError("detectedBy", {
      type: "manual",
      message: "Veuillez sélectionner un nom dans la liste",
    });
    return false;
  }, [detectedQuery, getValues, findExact, setValue, clearErrors, setError]);

  const onDetectedBlur = () => {
    setTimeout(() => setShowDetectedDropdown(false), 120);
    verifyDetected();
  };

  /* ---------- Effectué par (par action) ---------- */
  const [actionDropdownOpen, setActionDropdownOpen] = useState({});
  const setActionOpen = (i, open) =>
    setActionDropdownOpen((m) => ({ ...m, [i]: open }));
  const actionOptionsFor = (i) =>
    searchEmp(watch(`correctiveActions.${i}.doneByDisplay`) || "", 8);
  const pickActionEmployee = (i, emp) => {
    setValue(`correctiveActions.${i}.doneBy`, emp?._id || "", {
      shouldDirty: true,
      shouldValidate: true,
    });
    setValue(`correctiveActions.${i}.doneByDisplay`, emp?.full || "", {
      shouldDirty: true,
    });
    clearErrors([
      `correctiveActions.${i}.doneBy`,
      `correctiveActions.${i}.doneByDisplay`,
    ]);
    setActionOpen(i, false);
  };
  const clearActionEmployee = (i) => {
    setValue(`correctiveActions.${i}.doneBy`, "", {
      shouldDirty: true,
      shouldValidate: true,
    });
    setValue(`correctiveActions.${i}.doneByDisplay`, "", { shouldDirty: true });
    clearErrors([
      `correctiveActions.${i}.doneBy`,
      `correctiveActions.${i}.doneByDisplay`,
    ]);
    setActionOpen(i, false);
  };
  const onActionKeyDown = (i, e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      const opts = actionOptionsFor(i);
      if (opts.length) pickActionEmployee(i, opts[0]);
    } else if (e.key === "Escape") setActionOpen(i, false);
  };
  const verifyActionAtIdx = useCallback(
    (i) => {
      const txt = (
        getValues(`correctiveActions.${i}.doneByDisplay`) || ""
      ).trim();
      const id = getValues(`correctiveActions.${i}.doneBy`) || "";
      if (!txt) return true;
      if (id) return true;
      const exact = findExact(txt);
      if (exact) {
        setValue(`correctiveActions.${i}.doneBy`, exact._id, {
          shouldDirty: true,
          shouldValidate: true,
        });
        setValue(`correctiveActions.${i}.doneByDisplay`, exact.full, {
          shouldDirty: true,
        });
        clearErrors([
          `correctiveActions.${i}.doneByDisplay`,
          `correctiveActions.${i}.doneBy`,
        ]);
        return true;
      }
      setError(`correctiveActions.${i}.doneByDisplay`, {
        type: "manual",
        message: "Veuillez sélectionner un nom dans la liste",
      });
      return false;
    },
    [getValues, findExact, setValue, clearErrors, setError]
  );
  const onActionBlur = (i) => {
    setTimeout(() => setActionOpen(i, false), 120);
    verifyActionAtIdx(i);
  };
  const actionInvalid = (i) => {
    const txt = (watch(`correctiveActions.${i}.doneByDisplay`) || "").trim();
    const id = watch(`correctiveActions.${i}.doneBy`) || "";
    return !!txt && !id;
  };

  /* ---------- Auto dates ---------- */
  const caWatch = watch("correctiveActions") || [];
  useEffect(() => {
    caWatch.forEach((row, i) => {
      const path = `correctiveActions.${i}.doneAt`;
      const val = getValues(path);
      if (row?.done && !val) setValue(path, nowLocal(), { shouldDirty: true });
      if (!row?.done && val) setValue(path, "", { shouldDirty: true });
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [caWatch]);

  const closed = watch("closed");
  const closedAt = watch("closedAt");
  useEffect(() => {
    if (closed && !closedAt)
      setValue("closedAt", nowLocal(), { shouldDirty: true });
    if (!closed && closedAt) setValue("closedAt", "", { shouldDirty: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [closed, closedAt]);

  /* ---------- Reset quand initial change ---------- */
  useEffect(() => {
    const def = buildDefaults(initial);
    reset(def);

    // "Détecté par" (label)
    if (def.detectedByDisplay) {
      setDetectedQuery(def.detectedByDisplay);
    } else if (def.detectedBy) {
      const found = employees.find((e) => e._id === def.detectedBy);
      setDetectedQuery(found?.full || "");
    } else {
      setDetectedQuery("");
    }

    // doneByDisplay pré-rempli si ids seuls
    (initial?.correctiveActions || []).forEach((r, i) => {
      const id = empId(r?.doneBy);
      const disp =
        empFull(r?.doneBy) || employees.find((e) => e._id === id)?.full || "";
      setValue(`correctiveActions.${i}.doneByDisplay`, disp, {
        shouldDirty: false,
      });
      setValue(`correctiveActions.${i}.doneBy`, id || "", {
        shouldDirty: false,
      });
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initial, employees]);

  /* ---------- Submit ---------- */
  const onSubmit = async (data) => {
    const token = localStorage.getItem("token");
    if (!token) return;

    if (!verifyDetected()) return;
    const rows = Array.isArray(data.correctiveActions)
      ? data.correctiveActions
      : [];
    for (let i = 0; i < rows.length; i++) {
      if (!verifyActionAtIdx(i)) return;
    }

    const payload = {
      source: data.source || "internal",
      itemName: data.itemName || undefined,
      itemId: data.itemId || undefined,
      itemRefModel: data.itemRefModel || undefined,
      supplierId: data.supplierId || undefined,
      detectedAt: data.detectedAt ? new Date(data.detectedAt) : new Date(),
      detectedBy: data.detectedBy || undefined,
      allergens: parseList(data.allergensText),
      severity: data.severity || "medium",
      description: data.description || undefined,
      immediateAction: data.immediateAction || undefined,
      attachments: parseList(data.attachmentsText),
      closed: !!data.closed,
      closedAt: data.closed
        ? data.closedAt
          ? new Date(data.closedAt)
          : new Date()
        : undefined,
      correctiveActions: rows
        .map((c) => ({
          action: c.action || undefined,
          done: !!c.done,
          doneAt: c.done
            ? c.doneAt
              ? new Date(c.doneAt)
              : new Date()
            : undefined,
          doneBy: c.doneBy || undefined,
          note: c.note || undefined,
        }))
        .filter((x) => x.action),
    };

    const base = process.env.NEXT_PUBLIC_API_URL;
    const url = initial?._id
      ? `${base}/restaurants/${restaurantId}/allergen-incidents/${initial._id}`
      : `${base}/restaurants/${restaurantId}/allergen-incidents`;
    const method = initial?._id ? "put" : "post";

    const { data: saved } = await axios[method](url, payload, {
      headers: { Authorization: `Bearer ${token}` },
    });

    window.dispatchEvent(
      new CustomEvent("allergen-incident:upsert", { detail: { doc: saved } })
    );

    reset(buildDefaults(null));
    setDetectedQuery("");
    onSuccess?.(saved);
  };

  return (
    <form
      onSubmit={handleSubmit(onSubmit)}
      className="bg-white rounded-lg p-4 shadow-sm flex flex-col gap-6"
    >
      {/* Ligne 1 */}
      <div className="flex flex-col gap-4 midTablet:flex-row">
        <div className="w-56">
          <label className="text-sm font-medium">Source</label>
          <select
            {...register("source")}
            className="border rounded p-2 h-[44px] w-full"
          >
            <option value="internal">Interne</option>
            <option value="supplier">Fournisseur</option>
            <option value="customer">Client</option>
            <option value="lab">Laboratoire</option>
            <option value="other">Autre</option>
          </select>
        </div>
        <div className="flex-1">
          <label className="text-sm font-medium">Produit / Plat</label>
          <input
            type="text"
            {...register("itemName")}
            className="border rounded p-2 h-[44px] w-full"
            placeholder="Ex: Sauce bolognaise"
          />
        </div>
        <div className="w-52">
          <label className="text-sm font-medium">Gravité</label>
          <select
            {...register("severity")}
            className="border rounded p-2 h-[44px] w-full"
          >
            <option value="low">Faible</option>
            <option value="medium">Moyenne</option>
            <option value="high">Élevée</option>
          </select>
        </div>
      </div>

      {/* Ligne 2 */}
      <div className="flex flex-col gap-4 midTablet:flex-row">
        <div className="w-72">
          <label className="text-sm font-medium">Détecté le *</label>
          <input
            type="datetime-local"
            {...register("detectedAt", { required: "Requis" })}
            className="border rounded p-2 h-[44px] w-full"
          />
          {errors.detectedAt && (
            <p className="text-xs text-red mt-1">{errors.detectedAt.message}</p>
          )}
        </div>

        {/* Détecté par */}
        <div className="w-[360px]">
          <label className="text-sm font-medium">Détecté par</label>
          <div className="relative">
            <input
              type="text"
              value={detectedQuery}
              onChange={(e) => {
                setDetectedQuery(e.target.value);
                setShowDetectedDropdown(true);
                setValue("detectedBy", "", {
                  shouldDirty: true,
                  shouldValidate: true,
                });
              }}
              onFocus={() => setShowDetectedDropdown(true)}
              onBlur={onDetectedBlur}
              onKeyDown={onDetectedKeyDown}
              placeholder="Rechercher un employé…"
              className={`w-full border rounded p-2 h-[44px] pr-8 ${
                detectedInvalid || errors.detectedBy
                  ? "border-red ring-1 ring-red"
                  : ""
              }`}
            />
            {detectedQuery && (
              <button
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={clearDetected}
                className="absolute right-2 top-1/2 -translate-y-1/2 w-6 h-6 bg-black bg-opacity-30 text-white rounded-full flex items-center justify-center"
                title="Effacer"
              >
                &times;
              </button>
            )}
            {showDetectedDropdown && detectedQuery.trim() !== "" && (
              <ul
                className="absolute z-10 left-0 right-0 mt-1 bg-white border rounded shadow max-h-56 overflow-auto"
                onMouseDown={(e) => e.preventDefault()}
              >
                {detectedOptions.length === 0 && (
                  <li className="px-3 py-2 text-sm opacity-70 italic">
                    Aucun résultat
                  </li>
                )}
                {detectedOptions.map((emp) => (
                  <li
                    key={emp._id}
                    onClick={() => pickDetected(emp)}
                    className={`px-3 py-[8px] cursor-pointer hover:bg-lightGrey ${detectedBy === emp._id ? "bg-gray-100" : ""}`}
                  >
                    {emp.full}
                  </li>
                ))}
              </ul>
            )}
          </div>
          <input type="hidden" {...register("detectedBy")} />
          {(detectedInvalid || errors.detectedBy) && (
            <p className="text-xs text-red mt-1">
              {errors.detectedBy?.message ||
                "Veuillez sélectionner un nom dans la liste"}
            </p>
          )}
        </div>

        <div className="flex-1">
          <label className="text-sm font-medium">Action immédiate</label>
          <input
            type="text"
            {...register("immediateAction")}
            className="border rounded p-2 h-[44px] w-full"
            placeholder="Isolement lot, rappel, etc."
          />
        </div>
      </div>

      {/* Ligne 3 */}
      <div className="flex flex-col gap-4 midTablet:flex-row">
        <div className="flex-1">
          <label className="text-sm font-medium">
            Allergènes (1 par ligne)
          </label>
          <textarea
            rows={4}
            {...register("allergensText")}
            className="border rounded p-2 resize-none w-full min-h-[96px]"
            placeholder={"gluten\nlait\noeuf\narachides"}
          />
        </div>
        <div className="flex-1">
          <label className="text-sm font-medium">Pièces jointes (URLs)</label>
          <textarea
            rows={4}
            {...register("attachmentsText")}
            className="border rounded p-2 resize-none w-full min-h-[96px]"
            placeholder={
              "https://…/rapport-lab.pdf\nhttps://…/photo-etiquette.jpg"
            }
          />
        </div>
      </div>

      {/* Description */}
      <div>
        <label className="text-sm font-medium">Description</label>
        <textarea
          rows={3}
          {...register("description")}
          className="border rounded p-2 resize-none w-full"
        />
      </div>

      {/* Corrective actions */}
      <div className="flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <h3 className="text-base font-semibold">Actions correctives</h3>
          <button
            type="button"
            onClick={() =>
              append({
                action: "",
                done: false,
                doneAt: "",
                doneBy: "",
                doneByDisplay: "",
                note: "",
              })
            }
            className="px-3 py-1 rounded bg-blue text-white"
          >
            Ajouter
          </button>
        </div>

        {fields.map((f, idx) => (
          <div key={f.id} className="border rounded p-3 flex flex-col gap-3">
            <div className="flex gap-3 midTablet:flex-row flex-col">
              <div className="flex-1">
                <label className="text-sm font-medium">Action *</label>
                <input
                  type="text"
                  {...register(`correctiveActions.${idx}.action`, {
                    required: "Requis",
                  })}
                  className="border rounded p-2 h-[44px] w-full"
                  placeholder="Ex: Mise à jour étiquetage vitrine"
                />
                {errors.correctiveActions?.[idx]?.action && (
                  <p className="text-xs text-red mt-1">
                    {errors.correctiveActions[idx].action.message}
                  </p>
                )}
              </div>
              <div className="w-56 flex items-center gap-2">
                <input
                  id={`ca_done_${idx}`}
                  type="checkbox"
                  {...register(`correctiveActions.${idx}.done`)}
                />
                <label
                  htmlFor={`ca_done_${idx}`}
                  className="text-sm font-medium"
                >
                  Fait
                </label>
              </div>
              <div className="w-64">
                <label className="text-sm font-medium">Fait le</label>
                <input
                  type="datetime-local"
                  {...register(`correctiveActions.${idx}.doneAt`)}
                  className="border rounded p-2 h-[44px] w-full"
                />
              </div>
            </div>

            <div className="flex gap-3 midTablet:flex-row flex-col">
              {/* doneBy (recherche) */}
              <div className="w-[360px]">
                <label className="text-sm font-medium">Effectué par</label>
                <div className="relative">
                  <input
                    type="text"
                    {...register(`correctiveActions.${idx}.doneByDisplay`)}
                    onFocus={() => setActionOpen(idx, true)}
                    onBlur={() => onActionBlur(idx)}
                    onChange={(e) => {
                      setValue(
                        `correctiveActions.${idx}.doneByDisplay`,
                        e.target.value,
                        { shouldDirty: true }
                      );
                      setActionOpen(idx, true);
                      setValue(`correctiveActions.${idx}.doneBy`, "", {
                        shouldDirty: true,
                        shouldValidate: true,
                      });
                    }}
                    onKeyDown={(e) => onActionKeyDown(idx, e)}
                    className={`w-full border rounded p-2 h-[44px] pr-8 ${
                      actionInvalid(idx) ||
                      errors?.correctiveActions?.[idx]?.doneByDisplay
                        ? "border-red ring-1 ring-red"
                        : ""
                    }`}
                    placeholder="Rechercher un employé…"
                  />
                  {(watch(`correctiveActions.${idx}.doneByDisplay`) || "") && (
                    <button
                      type="button"
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={() => clearActionEmployee(idx)}
                      className="absolute right-2 top-1/2 -translate-y-1/2 w-6 h-6 bg-black bg-opacity-30 text-white rounded-full flex items-center justify-center"
                      title="Effacer"
                    >
                      &times;
                    </button>
                  )}
                  {actionDropdownOpen[idx] &&
                    (
                      watch(`correctiveActions.${idx}.doneByDisplay`) || ""
                    ).trim() !== "" && (
                      <ul
                        className="absolute z-10 left-0 right-0 mt-1 bg-white border rounded shadow max-h-56 overflow-auto"
                        onMouseDown={(e) => e.preventDefault()}
                      >
                        {actionOptionsFor(idx).length === 0 && (
                          <li className="px-3 py-2 text-sm opacity-70 italic">
                            Aucun résultat
                          </li>
                        )}
                        {actionOptionsFor(idx).map((emp) => (
                          <li
                            key={emp._id}
                            onClick={() => pickActionEmployee(idx, emp)}
                            className={`px-3 py-[8px] cursor-pointer hover:bg-lightGrey ${
                              (watch(`correctiveActions.${idx}.doneBy`) ||
                                "") === emp._id
                                ? "bg-gray-100"
                                : ""
                            }`}
                          >
                            {emp.full}
                          </li>
                        ))}
                      </ul>
                    )}
                </div>
                <input
                  type="hidden"
                  {...register(`correctiveActions.${idx}.doneBy`)}
                />
                {(actionInvalid(idx) ||
                  errors?.correctiveActions?.[idx]?.doneByDisplay) && (
                  <p className="text-xs text-red mt-1">
                    {errors?.correctiveActions?.[idx]?.doneByDisplay?.message ||
                      "Veuillez sélectionner un nom dans la liste"}
                  </p>
                )}
              </div>

              <div className="flex-1">
                <label className="text-sm font-medium">Note</label>
                <input
                  type="text"
                  {...register(`correctiveActions.${idx}.note`)}
                  className="border rounded p-2 h-[44px] w-full"
                />
              </div>
            </div>

            <div className="flex justify-end">
              <button
                type="button"
                onClick={() => remove(idx)}
                className="px-3 py-1 rounded bg-red text-white"
              >
                Supprimer
              </button>
            </div>
          </div>
        ))}
      </div>

      {/* Clôture */}
      <div className="flex gap-4 items-center">
        <div className="flex items-center gap-2">
          <input id="closed" type="checkbox" {...register("closed")} />
          <label htmlFor="closed" className="text-sm font-medium">
            Clôturé
          </label>
        </div>
        <div className="w-72">
          <label className="text-sm font-medium">Clôturé le</label>
          <input
            type="datetime-local"
            {...register("closedAt")}
            className="border rounded p-2 h-[44px] w-full"
            disabled={!watch("closed")}
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
              setDetectedQuery("");
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
