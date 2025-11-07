// components/dashboard/health-control-plan/cleaning-task/form.component.jsx
"use client";
import { useEffect, useState, useContext } from "react";
import { useForm } from "react-hook-form";
import axios from "axios";
import {
  ChevronDown,
  FileText,
  Loader2,
  MapPin,
  RefreshCcw,
  AlertTriangle,
  Timer,
  ListTodo,
  History,
  FlaskConical,
  X as XIcon, // pour Annuler (éditeur de note)
  XCircle, // petite croix rouge (ouvrir confirmation)
  Check as CheckIcon,
} from "lucide-react";
import { GlobalContext } from "@/contexts/global.context";

/* ---------- Defaults ---------- */
function buildFormDefaults(record) {
  return {
    zone: record?.zone ?? "",
    zoneId: record?.zoneId ?? "",
    description: record?.description ?? "",
    frequency: record?.frequency ?? "daily",
    riskLevel: record?.riskLevel ?? "low",
    dwellTimeMin:
      record?.dwellTimeMin !== undefined && record?.dwellTimeMin !== null
        ? String(record.dwellTimeMin)
        : "",
    productsText: Array.isArray(record?.products)
      ? record.products.join("\n")
      : "",
    protocolStepsText: Array.isArray(record?.protocolSteps)
      ? record.protocolSteps.join("\n")
      : "",
    history: Array.isArray(record?.history) ? record.history : [],
  };
}

/* ---------- Helpers (Historique) ---------- */
function fmtFRDate(d) {
  try {
    return new Intl.DateTimeFormat("fr-FR", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    }).format(new Date(d));
  } catch {
    return "—";
  }
}
function initials(user) {
  const f = (user?.firstName || user?.firstname || "").trim();
  const l = (user?.lastName || user?.lastname || "").trim();
  const i1 = f ? f[0] : "";
  const i2 = l ? l[0] : "";
  return (i1 + i2 || "?").toUpperCase();
}
function displayUser(user) {
  const f = (user?.firstName || user?.firstname || "").trim();
  const l = (user?.lastName || user?.lastname || "").trim();
  const name = `${f} ${l}`.trim();
  if (name) return name;
  if (user?.role === "owner") return "Gérant";
  if (user?.role === "employee") return "Employé";
  return "—";
}
function getAvatarUrlFromDoneBy(doneBy, employeeAvatarById) {
  if (doneBy?.avatarUrl) return doneBy.avatarUrl; // dénormalisé par le back
  const id = doneBy?.userId ? String(doneBy.userId) : "";
  if (!id) return "";
  return employeeAvatarById.get(id) || "";
}

export default function CleaningTaskForm({
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
    watch,
    setValue,
  } = useForm({ defaultValues: buildFormDefaults(initial) });

  const { restaurantContext } = useContext(GlobalContext);
  const employees = restaurantContext?.restaurantData?.employees || [];
  const employeeAvatarById = new Map(
    employees.map((e) => [String(e._id), e?.profilePicture?.url || ""])
  );

  const [noteEditIdx, setNoteEditIdx] = useState(null);
  const [noteDraft, setNoteDraft] = useState("");
  const [savingNote, setSavingNote] = useState(false);

  // index actuellement "armé" pour confirmation (un seul à la fois)
  const [confirmIdx, setConfirmIdx] = useState(null);
  // index en cours de suppression (spinner)
  const [deletingIdx, setDeletingIdx] = useState(null);

  useEffect(() => {
    reset(buildFormDefaults(initial));
    setNoteEditIdx(null);
    setNoteDraft("");
    setConfirmIdx(null);
    setDeletingIdx(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initial]);

  /* ---------- Submit (Plan) ---------- */
  const onSubmit = async (data) => {
    const token = localStorage.getItem("token");
    if (!token) return;

    const products = data.productsText
      ? data.productsText
          .split(/\n+/g)
          .map((s) => s.trim())
          .filter(Boolean)
      : [];
    const protocolSteps = data.protocolStepsText
      ? data.protocolStepsText
          .split(/\n+/g)
          .map((s) => s.trim())
          .filter(Boolean)
      : [];

    const payload = {
      zone: data.zone || undefined,
      zoneId: data.zoneId || undefined,
      description: data.description || undefined,
      frequency: data.frequency || "daily",
      riskLevel: data.riskLevel || "low",
      dwellTimeMin:
        data.dwellTimeMin !== "" && data.dwellTimeMin != null
          ? Number(data.dwellTimeMin)
          : undefined,
      products,
      protocolSteps,
    };

    const url = initial?._id
      ? `${process.env.NEXT_PUBLIC_API_URL}/restaurants/${restaurantId}/cleaning-tasks/${initial._id}`
      : `${process.env.NEXT_PUBLIC_API_URL}/restaurants/${restaurantId}/cleaning-tasks`;
    const method = initial?._id ? "put" : "post";

    const { data: saved } = await axios[method](url, payload, {
      headers: { Authorization: `Bearer ${token}` },
    });

    window.dispatchEvent(
      new CustomEvent("cleaning-task:upsert", { detail: { doc: saved } })
    );

    reset(buildFormDefaults(null));
    onSuccess?.(saved);
  };

  /* ---------- Note (édition inline) ---------- */
  async function saveNoteForHistoryIndex(idx) {
    if (!initial?._id) return;
    const token = localStorage.getItem("token");
    if (!token) return;

    try {
      setSavingNote(true);
      const url = `${process.env.NEXT_PUBLIC_API_URL}/restaurants/${restaurantId}/cleaning-tasks/${initial._id}/history/${idx}/note`;
      const { data: saved } = await axios.put(
        url,
        { note: noteDraft },
        { headers: { Authorization: `Bearer ${token}` } }
      );

      setValue("history", saved?.history || [], { shouldDirty: false });
      window.dispatchEvent(
        new CustomEvent("cleaning-task:upsert", { detail: { doc: saved } })
      );

      setNoteEditIdx(null);
      setNoteDraft("");
      setConfirmIdx(null); // au cas où un confirm était ouvert
    } catch (e) {
      console.error("save note error:", e);
      alert("Impossible d'enregistrer la note.");
    } finally {
      setSavingNote(false);
    }
  }

  /* ---------- Suppression d'une exécution ---------- */
  async function deleteHistoryAtIndex(idx) {
    if (!initial?._id) return;

    const token = localStorage.getItem("token");
    if (!token) return;

    try {
      setDeletingIdx(idx);
      const url = `${process.env.NEXT_PUBLIC_API_URL}/restaurants/${restaurantId}/cleaning-tasks/${initial._id}/history/${idx}`;
      const { data: saved } = await axios.delete(url, {
        headers: { Authorization: `Bearer ${token}` },
      });

      setValue("history", saved?.history || [], { shouldDirty: false });
      window.dispatchEvent(
        new CustomEvent("cleaning-task:upsert", { detail: { doc: saved } })
      );

      if (noteEditIdx === idx) {
        setNoteEditIdx(null);
        setNoteDraft("");
      }
      setConfirmIdx(null);
    } catch (e) {
      console.error("delete history error:", e);
      alert("Suppression impossible pour le moment.");
    } finally {
      setDeletingIdx(null);
    }
  }

  /* ---------- Styles ---------- */
  const fieldWrap =
    "group relative rounded-xl bg-white/50 backdrop-blur-sm px-3 py-2 transition-shadow";
  const labelCls =
    "flex items-center gap-2 text-xs font-medium text-darkBlue/60 mb-1";
  const inputCls =
    "h-11 w-full rounded-lg border border-darkBlue/20 bg-white px-3 text-[15px] outline-none transition placeholder:text-darkBlue/40";
  const selectCls =
    "h-11 w-full appearance-none rounded-lg border border-darkBlue/20 bg-white px-3 text-[15px] outline-none transition";
  const textareaCls =
    "w-full resize-none rounded-lg border border-darkBlue/20 bg-white p-[10px] text-[15px] outline-none transition placeholder:text-darkBlue/40";
  const btnBase =
    "inline-flex items-center justify-center gap-2 rounded-lg px-3 py-2 text-xs font-medium transition active:scale-[0.98]";

  const history = watch("history") || [];

  // Conserver l’index original (pour l’API) tout en affichant du plus récent au plus ancien
  const historyWithIdxDesc = [...(history || [])]
    .map((h, idx) => ({ ...h, __idx: idx }))
    .reverse();

  return (
    <form
      onSubmit={handleSubmit(onSubmit)}
      className="relative flex flex-col gap-2"
    >
      {/* Zone / Fréquence / Priorité */}
      <div className="grid grid-cols-1 gap-2 midTablet:grid-cols-3">
        <div className={fieldWrap}>
          <label className={labelCls}>
            <MapPin className="size-4" /> Zone *
          </label>
          <input
            type="text"
            placeholder="ex: Cuisine, Plonge, Salle…"
            autoComplete="off"
            {...register("zone", { required: "Requis" })}
            className={`${inputCls} ${errors.zone ? "border-red ring-1 ring-red/30" : ""}`}
          />
          {errors.zone && (
            <p className="mt-1 text-xs text-red">{errors.zone.message}</p>
          )}
        </div>

        <div className={fieldWrap}>
          <label className={labelCls}>
            <RefreshCcw className="size-4" /> Fréquence
          </label>
          <div className="relative">
            <select {...register("frequency")} className={selectCls}>
              <option value="daily">Quotidienne</option>
              <option value="weekly">Hebdomadaire</option>
              <option value="monthly">Mensuelle</option>
              <option value="on_demand">À la demande</option>
            </select>
            <ChevronDown className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 size-4 text-darkBlue/40" />
          </div>
        </div>

        <div className={fieldWrap}>
          <label className={labelCls}>
            <AlertTriangle className="size-4" /> Priorité
          </label>
          <div className="relative">
            <select {...register("riskLevel")} className={selectCls}>
              <option value="low">Basse</option>
              <option value="medium">Moyenne</option>
              <option value="high">Élevée</option>
            </select>
            <ChevronDown className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 size-4 text-darkBlue/40" />
          </div>
        </div>
      </div>

      {/* Description / Temps contact */}
      <div className="grid grid-cols-1 gap-2 midTablet:grid-cols-2">
        <div className={fieldWrap}>
          <label className={labelCls}>
            <FileText className="size-4" /> Description
          </label>
          <input
            type="text"
            {...register("description")}
            className={inputCls}
            placeholder="Détails de l’intervention"
            autoComplete="off"
            spellCheck={false}
            autoCorrect="off"
          />
        </div>

        <div className={fieldWrap}>
          <label className={labelCls}>
            <Timer className="size-4" /> Temps contact (min)
          </label>
          <input
            type="number"
            step="1"
            onWheel={(e) => e.currentTarget.blur()}
            min="0"
            {...register("dwellTimeMin")}
            className={inputCls}
          />
        </div>
      </div>

      {/* Produits / Étapes */}
      <div className="grid grid-cols-1 gap-2 midTablet:grid-cols-2">
        <div className={`${fieldWrap} h-auto`}>
          <label className={labelCls}>
            <FlaskConical className="size-4" /> Produits (1 par ligne)
          </label>
          <textarea
            rows={10}
            {...register("productsText")}
            className={textareaCls}
            placeholder={"Détergent X\nDésinfectant Y"}
          />
        </div>

        <div className={`${fieldWrap} h-auto`}>
          <label className={labelCls}>
            <ListTodo className="size-4" /> Étapes du protocole (1 par ligne)
          </label>
          <textarea
            rows={10}
            {...register("protocolStepsText")}
            className={textareaCls}
            placeholder={
              "1) Balayer\n2) Détergent\n3) Rinçage\n4) Désinfection\n5) Temps de contact\n6) Rinçage final"
            }
          />
        </div>
      </div>

      {/* Historique (timeline + note inline) */}
      {initial?._id && (
        <div className={`${fieldWrap} h-auto`}>
          <label className={labelCls}>
            <History className="size-4" /> Historique d’exécution
          </label>

          {/* hauteur max + scroll Y */}
          <div className="pt-2 pb-0 max-h-[400px] overflow-y-auto">
            {historyWithIdxDesc.length === 0 ? (
              <div className="rounded-lg border border-darkBlue/10 p-3 text-sm text-darkBlue/60 italic">
                Aucun historique pour le moment.
              </div>
            ) : (
              <ol className="relative ml-2 border-l border-darkBlue/15">
                {historyWithIdxDesc.map((h) => {
                  const idx = h.__idx; // index réel pour l’API
                  const isEditing = noteEditIdx === idx;
                  const isConfirming = confirmIdx === idx;
                  const proofCount = Array.isArray(h?.proofUrls)
                    ? h.proofUrls.length
                    : 0;

                  return (
                    <li
                      key={`${idx}-${h?.doneAt || "na"}`}
                      className="mb-4 last:mb-0 pl-4"
                    >
                      {/* Puce timeline */}
                      <span className="absolute -left-[9px] mt-1 inline-flex h-4 w-4 items-center justify-center rounded-full bg-blue/90 ring-4 ring-white">
                        <span className="h-1.5 w-1.5 rounded-full bg-white" />
                      </span>

                      {/* Carte */}
                      <div className="rounded-xl border border-darkBlue/10 bg-white shadow-sm">
                        <div className="flex flex-col gap-3 p-3 mobile:flex-row mobile:items-center mobile:justify-between">
                          {/* Avatar / initiales + date */}
                          <div className="flex items-center gap-3">
                            {(() => {
                              const url = getAvatarUrlFromDoneBy(
                                h?.doneBy,
                                employeeAvatarById
                              );
                              const name = displayUser(h?.doneBy);
                              return url ? (
                                <img
                                  src={url}
                                  alt={name}
                                  className="h-9 w-9 rounded-full object-cover ring-2 ring-white shadow"
                                  referrerPolicy="no-referrer"
                                />
                              ) : (
                                <div className="grid h-9 w-9 place-items-center rounded-full bg-blue text-white text-sm font-semibold">
                                  {initials(h?.doneBy)}
                                </div>
                              );
                            })()}
                            <div className="leading-tight">
                              <div className="text-[13px] text-darkBlue/60">
                                Fait le
                              </div>
                              <div className="text-sm font-medium">
                                {fmtFRDate(h?.doneAt)}
                              </div>
                            </div>
                          </div>

                          <div className="flex flex-wrap items-center gap-2">
                            <span className="rounded-full border border-darkBlue/15 px-2 py-[2px] text-xs text-darkBlue/80">
                              par {displayUser(h?.doneBy)}
                            </span>

                            {proofCount > 0 && (
                              <span className="rounded-full bg-darkBlue/5 px-2 py-[2px] text-xs text-darkBlue/80">
                                {proofCount} preuve{proofCount > 1 ? "s" : ""}
                              </span>
                            )}

                            {h?.verified && (
                              <span className="rounded-full bg-green px-2 py-[2px] text-xs font-medium text-white">
                                Vérifié
                              </span>
                            )}

                            {/* Suppression : croix -> bouton "Confirmer" */}
                            {!isConfirming ? (
                              <button
                                type="button"
                                onClick={() => {
                                  setConfirmIdx(idx);
                                }}
                                className="inline-flex items-center justify-center rounded-md p-1 text-red hover:bg-red/10"
                                title="Supprimer cette exécution"
                                aria-label="Supprimer cette exécution"
                                disabled={deletingIdx === idx}
                              >
                                <XCircle className="size-4" />
                              </button>
                            ) : (
                              <button
                                type="button"
                                onClick={() => deleteHistoryAtIndex(idx)}
                                className="inline-flex items-center justify-center rounded-md border border-red bg-white px-2 py-[2px] text-xs font-medium text-red hover:bg-red/10 disabled:opacity-60"
                                title="Confirmer la suppression"
                                disabled={deletingIdx === idx}
                              >
                                {deletingIdx === idx ? (
                                  <>
                                    <Loader2 className="mr-1 size-3.5 animate-spin" />
                                    Suppression…
                                  </>
                                ) : (
                                  "Confirmer"
                                )}
                              </button>
                            )}
                          </div>
                        </div>

                        {/* Note + édition inline */}
                        <div className="border-t border-darkBlue/10 p-3">
                          {!isEditing ? (
                            <div className="flex items-start gap-3">
                              <div className="flex-1 text-sm text-darkBlue/90">
                                <span className="mr-1 font-medium">Note :</span>
                                {h?.note ? (
                                  <span>{h.note}</span>
                                ) : (
                                  <span className="italic text-darkBlue/60">
                                    —
                                  </span>
                                )}
                              </div>
                              <button
                                type="button"
                                onClick={() => {
                                  setNoteEditIdx(idx);
                                  setNoteDraft(h?.note || "");
                                  setConfirmIdx(null); // fermer une éventuelle confirmation ouverte
                                }}
                                className="text-xs text-blue underline underline-offset-2"
                                title={
                                  h?.note
                                    ? "Éditer la note"
                                    : "Ajouter une note"
                                }
                              >
                                {h?.note
                                  ? "Éditer la note"
                                  : "Ajouter une note"}
                              </button>
                            </div>
                          ) : (
                            <div className="flex gap-2">
                              <textarea
                                rows={1}
                                value={noteDraft}
                                onChange={(e) => setNoteDraft(e.target.value)}
                                className="w-full resize-none rounded-md border border-darkBlue/20 p-2 text-[14px] outline-none"
                                placeholder="Saisir une note …"
                              />
                              <div className="flex items-center justify-end gap-2">
                                <button
                                  type="button"
                                  onClick={() => {
                                    setNoteEditIdx(null);
                                    setNoteDraft("");
                                  }}
                                  className={`${btnBase} border border-red bg-white text-red`}
                                  disabled={savingNote}
                                >
                                  <XIcon className="size-4" /> Annuler
                                </button>
                                <button
                                  type="button"
                                  onClick={() => saveNoteForHistoryIndex(idx)}
                                  className={`${btnBase} bg-blue text-white disabled:opacity-60`}
                                  disabled={savingNote}
                                >
                                  {savingNote ? (
                                    <>
                                      <Loader2 className="size-4 animate-spin" />
                                      Enregistrement…
                                    </>
                                  ) : (
                                    <>
                                      <CheckIcon className="size-4" />
                                      Enregistrer
                                    </>
                                  )}
                                </button>
                              </div>
                            </div>
                          )}
                        </div>
                      </div>
                    </li>
                  );
                })}
              </ol>
            )}
          </div>
        </div>
      )}

      {/* Actions */}
      <div className="mt-3 flex flex-col items-center gap-2 mobile:flex-row">
        <button
          type="submit"
          disabled={isSubmitting}
          className="text-nowrap inline-flex items-center justify-center gap-2 h-[38px] rounded-lg bg-blue px-4 py-2 text-sm font-medium text-white shadow disabled:opacity-60"
        >
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
            className="inline-flex h-[38px] items-center justify-center gap-2 rounded-lg border border-red bg-white px-4 py-2 text-sm font-medium text-red"
          >
            Annuler
          </button>
        )}
      </div>
    </form>
  );
}
