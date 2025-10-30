// app/(components)/haccp/non-conformity/NonConformityForm.jsx
"use client";
import { useContext, useEffect, useMemo, useState } from "react";
import { useForm, useFieldArray } from "react-hook-form";
import axios from "axios";
import { GlobalContext } from "@/contexts/global.context";

function toDatetimeLocal(value) {
  if (!value) return "";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "";
  const offset = d.getTimezoneOffset() * 60000;
  return new Date(d.getTime() - offset).toISOString().slice(0, 16);
}

function buildDefaults(rec) {
  return {
    type: rec?.type ?? "other",
    referenceId: rec?.referenceId ?? "",
    description: rec?.description ?? "",
    severity: rec?.severity ?? "medium",
    reportedAt: toDatetimeLocal(rec?.reportedAt ?? new Date()),
    status: rec?.status ?? "open",

    attachmentsText: Array.isArray(rec?.attachments)
      ? rec.attachments.join("\n")
      : "",

    correctiveActions:
      Array.isArray(rec?.correctiveActions) && rec.correctiveActions.length
        ? rec.correctiveActions.map((c) => ({
            action: c?.action ?? "",
            done: !!c?.done,
            doneAt: toDatetimeLocal(c?.doneAt),
            doneBy: c?.doneBy ? String(c.doneBy) : "",
            doneByDisplay: "", // rempli après avec la liste employés
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
  };
}

export default function NonConformityForm({
  restaurantId,
  initial = null,
  onSuccess,
  onCancel,
}) {
  const {
    register,
    control,
    handleSubmit,
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

  /* ---------- employées (autocomplete) ---------- */
  const { restaurantContext } = useContext(GlobalContext);
  const allEmployees = useMemo(
    () =>
      restaurantContext.restaurantData?.employees?.map((e) => ({
        _id: String(e._id),
        firstname: e.firstname,
        lastname: e.lastname,
        full: `${e.firstname ?? ""} ${e.lastname ?? ""}`.trim(),
      })) || [],
    [restaurantContext.restaurantData?.employees]
  );

  const normalize = (s) =>
    (s || "")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/\s+/g, " ")
      .toLowerCase()
      .trim();

  const findEmployeeByExactFull = (txt) => {
    const n = normalize(txt);
    if (!n) return null;
    return allEmployees.find((e) => normalize(e.full) === n) || null;
  };

  /* ---------- état dropdown par ligne ---------- */
  const [actionDropdownOpen, setActionDropdownOpen] = useState({});
  function setActionOpen(idx, open) {
    setActionDropdownOpen((m) => ({ ...m, [idx]: open }));
  }
  function actionOptionsFor(idx) {
    const q = normalize(watch(`correctiveActions.${idx}.doneByDisplay`) || "");
    if (!q) return allEmployees.slice(0, 8);
    return allEmployees
      .filter((e) => normalize(e.full).includes(q))
      .slice(0, 8);
  }
  function pickActionEmployee(idx, emp) {
    setValue(`correctiveActions.${idx}.doneBy`, emp?._id || "", {
      shouldDirty: true,
      shouldValidate: true,
    });
    setValue(`correctiveActions.${idx}.doneByDisplay`, emp?.full || "", {
      shouldDirty: true,
    });
    clearErrors([
      `correctiveActions.${idx}.doneBy`,
      `correctiveActions.${idx}.doneByDisplay`,
    ]);
    setActionOpen(idx, false);
  }
  function clearActionEmployee(idx) {
    setValue(`correctiveActions.${idx}.doneBy`, "", {
      shouldDirty: true,
      shouldValidate: true,
    });
    setValue(`correctiveActions.${idx}.doneByDisplay`, "", {
      shouldDirty: true,
    });
    setActionOpen(idx, false);
    clearErrors([
      `correctiveActions.${idx}.doneBy`,
      `correctiveActions.${idx}.doneByDisplay`,
    ]);
  }
  function onActionKeyDown(idx, e) {
    if (e.key === "Enter") {
      e.preventDefault();
      const opts = actionOptionsFor(idx);
      if (opts.length > 0) pickActionEmployee(idx, opts[0]);
    } else if (e.key === "Escape") {
      setActionOpen(idx, false);
    }
  }
  function onActionBlur(idx) {
    setTimeout(() => setActionOpen(idx, false), 120);
    const txt = (
      getValues(`correctiveActions.${idx}.doneByDisplay`) || ""
    ).trim();
    const id = getValues(`correctiveActions.${idx}.doneBy`) || "";
    if (!txt) {
      clearErrors([
        `correctiveActions.${idx}.doneBy`,
        `correctiveActions.${idx}.doneByDisplay`,
      ]);
      return;
    }
    if (!id) {
      const exact = findEmployeeByExactFull(txt);
      if (exact) {
        setValue(`correctiveActions.${idx}.doneBy`, exact._id, {
          shouldDirty: true,
          shouldValidate: true,
        });
        setValue(`correctiveActions.${idx}.doneByDisplay`, exact.full, {
          shouldDirty: true,
        });
        clearErrors([
          `correctiveActions.${idx}.doneBy`,
          `correctiveActions.${idx}.doneByDisplay`,
        ]);
      } else {
        setError(`correctiveActions.${idx}.doneByDisplay`, {
          type: "manual",
          message: "Veuillez sélectionner un nom dans la liste",
        });
      }
    } else {
      clearErrors([
        `correctiveActions.${idx}.doneBy`,
        `correctiveActions.${idx}.doneByDisplay`,
      ]);
    }
  }
  const actionInvalid = (idx) => {
    const txt = (watch(`correctiveActions.${idx}.doneByDisplay`) || "").trim();
    const id = watch(`correctiveActions.${idx}.doneBy`) || "";
    return txt !== "" && !id;
  };

  /* ---------- auto dates quand 'Fait' coche/décoche ---------- */
  const caWatch = watch("correctiveActions") || [];
  useEffect(() => {
    caWatch.forEach((row, idx) => {
      if (row?.done && !row?.doneAt) {
        const now = new Date();
        const offset = now.getTimezoneOffset() * 60000;
        const v = new Date(now.getTime() - offset).toISOString().slice(0, 16);
        setValue(`correctiveActions.${idx}.doneAt`, v, { shouldDirty: true });
      }
      if (!row?.done) {
        setValue(`correctiveActions.${idx}.doneAt`, "", { shouldDirty: true });
      }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [JSON.stringify(caWatch.map((r) => [r.done, r.doneAt]))]);

  /* ---------- reset + préremplir doneByDisplay à partir de la liste employés ---------- */
  useEffect(() => {
    reset(buildDefaults(initial));
    // préremplissage du display si on a déjà des ids
    const rows = (initial?.correctiveActions || []).map((r) => ({
      id: r?.doneBy ? String(r.doneBy) : "",
    }));
    rows.forEach((r, idx) => {
      const disp = allEmployees.find((e) => e._id === r.id)?.full || "";
      setValue(`correctiveActions.${idx}.doneBy`, r.id || "", {
        shouldDirty: false,
      });
      setValue(`correctiveActions.${idx}.doneByDisplay`, disp, {
        shouldDirty: false,
      });
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initial, reset, allEmployees.length]);

  const onSubmit = async (data) => {
    const token = localStorage.getItem("token");
    if (!token) return;

    const attachments =
      typeof data.attachmentsText === "string" &&
      data.attachmentsText.trim().length
        ? data.attachmentsText
            .split(/[\n,;]+/g)
            .map((s) => s.trim())
            .filter(Boolean)
        : [];

    // validation texte vs id pour chaque action
    const rows = Array.isArray(data.correctiveActions)
      ? data.correctiveActions
      : [];
    for (let idx = 0; idx < rows.length; idx++) {
      const display = (
        getValues(`correctiveActions.${idx}.doneByDisplay`) || ""
      ).trim();
      if (display && !rows[idx].doneBy) {
        const exact = findEmployeeByExactFull(display);
        if (exact) {
          rows[idx].doneBy = exact._id;
          setValue(`correctiveActions.${idx}.doneBy`, exact._id, {
            shouldDirty: true,
          });
          setValue(`correctiveActions.${idx}.doneByDisplay`, exact.full, {
            shouldDirty: true,
          });
          clearErrors([
            `correctiveActions.${idx}.doneByDisplay`,
            `correctiveActions.${idx}.doneBy`,
          ]);
        } else {
          setError(`correctiveActions.${idx}.doneByDisplay`, {
            type: "manual",
            message: "Veuillez sélectionner un nom dans la liste",
          });
          return;
        }
      }
    }

    const correctiveActions = rows
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
      .filter((x) => x.action);

    const payload = {
      type: data.type || "other",
      referenceId: data.referenceId || undefined,
      description: data.description || undefined,
      severity: data.severity || "medium",
      reportedAt: data.reportedAt ? new Date(data.reportedAt) : new Date(),
      status: data.status || "open",
      attachments,
      correctiveActions,
    };

    const url = initial?._id
      ? `${process.env.NEXT_PUBLIC_API_URL}/restaurants/${restaurantId}/non-conformities/${initial._id}`
      : `${process.env.NEXT_PUBLIC_API_URL}/restaurants/${restaurantId}/non-conformities`;
    const method = initial?._id ? "put" : "post";

    const { data: saved } = await axios[method](url, payload, {
      headers: { Authorization: `Bearer ${token}` },
    });

    window.dispatchEvent(
      new CustomEvent("non-conformity:upsert", { detail: { doc: saved } })
    );
    reset(buildDefaults(null));
    onSuccess?.(saved);
  };

  return (
    <form
      onSubmit={handleSubmit(onSubmit)}
      className="bg-white rounded-lg p-4 shadow-sm flex flex-col gap-6"
    >
      {/* Ligne 1 : type / statut / sévérité / date */}
      <div className="flex flex-col gap-4 mobile:flex-row flex-wrap">
        <div className="w-full mobile:w-56">
          <label className="text-sm font-medium">Type *</label>
          <select
            {...register("type", { required: "Requis" })}
            className="border rounded p-2 h-[44px] w-full"
          >
            <option value="temperature">Température</option>
            <option value="hygiene">Hygiène</option>
            <option value="reception">Réception</option>
            <option value="microbiology">Microbiologie</option>
            <option value="other">Autre</option>
          </select>
          {errors.type && (
            <p className="text-xs text-red mt-1">{errors.type.message}</p>
          )}
        </div>

        <div className="w-full mobile:w-56">
          <label className="text-sm font-medium">Statut *</label>
          <select
            {...register("status", { required: "Requis" })}
            className="border rounded p-2 h-[44px] w-full"
          >
            <option value="open">Ouverte</option>
            <option value="in_progress">En cours</option>
            <option value="closed">Fermée</option>
          </select>
          {errors.status && (
            <p className="text-xs text-red mt-1">{errors.status.message}</p>
          )}
        </div>

        <div className="w-full mobile:w-56">
          <label className="text-sm font-medium">Gravité *</label>
          <select
            {...register("severity", { required: "Requis" })}
            className="border rounded p-2 h-[44px] w-full"
          >
            <option value="low">Faible</option>
            <option value="medium">Moyenne</option>
            <option value="high">Élevée</option>
          </select>
          {errors.severity && (
            <p className="text-xs text-red mt-1">{errors.severity.message}</p>
          )}
        </div>

        <div className="w-full mobile:w-72">
          <label className="text-sm font-medium">Déclarée le *</label>
          <input
            type="datetime-local"
            {...register("reportedAt", { required: "Requis" })}
            className="border rounded p-2 h-[44px] w-full"
          />
          {errors.reportedAt && (
            <p className="text-xs text-red mt-1">{errors.reportedAt.message}</p>
          )}
        </div>
      </div>

      {/* Ligne 2 : ref / description */}
      <div className="flex flex-col gap-4 mobile:flex-row flex-wrap">
        <div className="w-full mobile:w-64">
          <label className="text-sm font-medium">Référence</label>
          <input
            type="text"
            {...register("referenceId")}
            className="border rounded p-2 h-[44px] w-full"
            placeholder="Ex: BON-RECEP-0425"
            autoComplete="off"
            spellCheck={false}
            autoCorrect="off"
          />
        </div>
        <div className="flex-1 min-w-[220px]">
          <label className="text-sm font-medium">Description</label>
          <input
            type="text"
            {...register("description")}
            className="border rounded p-2 h-[44px] w-full"
            placeholder="Détail de la NC"
            autoComplete="off"
            spellCheck={false}
            autoCorrect="off"
          />
        </div>
      </div>

      {/* Ligne 3 : pièces */}
      <div className="flex flex-col gap-4 mobile:flex-row flex-wrap">
        <div className="flex-1">
          <label className="text-sm font-medium">
            Pièces (URLs, 1 par ligne)
          </label>
          <textarea
            rows={4}
            {...register("attachmentsText")}
            className="border rounded p-2 resize-none w-full min-h-[96px]"
            placeholder={"https://…/photo1.jpg\nhttps://…/rapport.pdf"}
          />
        </div>
      </div>

      {/* Actions correctives */}
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
            Ajouter une action
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
                  placeholder="Ex: Corriger l'étiquetage, Former le personnel…"
                  className="border rounded p-2 h-[44px] w-full"
                  autoComplete="off"
                  spellCheck={false}
                  autoCorrect="off"
                />
                {errors.correctiveActions?.[idx]?.action && (
                  <p className="text-xs text-red mt-1">
                    {errors.correctiveActions[idx].action.message}
                  </p>
                )}
              </div>
              <div className="w-full mobile:w-40 flex items-center gap-2">
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
              <div className="w-full mobile:w-64">
                <label className="text-sm font-medium">Fait le</label>
                <input
                  type="datetime-local"
                  {...register(`correctiveActions.${idx}.doneAt`)}
                  className="border rounded p-2 h-[44px] w-full"
                />
              </div>
            </div>

            <div className="flex gap-3 midTablet:flex-row flex-col">
              {/* doneBy (recherche employé) */}
              <div className="w-full mobile:w-[360px]">
                <label className="text-sm font-medium">Effectué par</label>
                <div className="relative">
                  <input
                    type="text"
                    {...register(`correctiveActions.${idx}.doneByDisplay`)}
                    autoComplete="off"
                    spellCheck={false}
                    autoCorrect="off"
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
                    className={`w-full border rounded p-2 h-[44px] pr-8 ${actionInvalid(idx) || errors?.correctiveActions?.[idx]?.doneByDisplay ? "border-red ring-1 ring-red" : ""}`}
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
                  autoComplete="off"
                  spellCheck={false}
                  autoCorrect="off"
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
