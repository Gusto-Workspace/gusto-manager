// app/(components)/maintenance/MaintenanceForm.jsx
"use client";
import { useEffect, useMemo, useState } from "react";
import { useForm } from "react-hook-form";
import axios from "axios";
import {
  Wrench,
  Hash,
  CalendarClock,
  Link as LinkIcon,
  FileText,
  Building2,
  History,
  Loader2,
  X as XIcon,
  XCircle,
  Check as CheckIcon,
} from "lucide-react";

/* ---------- Utils ---------- */
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
function displayUserName(user) {
  if (!user) return "—";
  const f = (user.firstName || "").trim();
  const l = (user.lastName || "").trim();
  const name = `${f} ${l}`.trim();
  return name || "—";
}

/* ---------- NextDue helpers ---------- */
const FREQ_TO_DAYS = {
  daily: 1,
  weekly: 7,
  monthly: 30,
  on_demand: null,
};

function computeNextDueFromBase(baseDate, frequency) {
  const days = FREQ_TO_DAYS[frequency] || null;
  if (!days || !baseDate) return null;

  const base = new Date(baseDate);
  if (Number.isNaN(base.getTime())) return null;

  base.setDate(base.getDate() + days);
  return base;
}

/**
 * Calcule une prochaine échéance "par défaut" à partir du record
 * - priorité à rec.nextDue si déjà stocké
 * - sinon : date dernière exécution (lastDoneAt) ou performedAt ou createdAt
 *   + fréquence
 */
function computeNextDueValue(rec) {
  if (!rec) return null;

  if (rec.nextDue) return rec.nextDue;

  const freq = rec.frequency || "monthly";
  const base = rec.lastDoneAt || rec.performedAt || rec.createdAt;
  return computeNextDueFromBase(base, freq);
}

/* ---------- Defaults ---------- */
function buildDefaults(rec) {
  // base pour "Première / Dernière exécution"
  const baseExec =
    rec?.lastDoneAt || rec?.performedAt || rec?.createdAt || new Date();

  const autoNext = computeNextDueValue({
    ...rec,
    performedAt: baseExec,
  });

  return {
    equipment: rec?.equipment ?? "",
    equipmentId: rec?.equipmentId ?? "",
    type: rec?.type ?? "inspection",
    frequency: rec?.frequency ?? "monthly",
    // affichage "Première / Dernière exécution"
    performedAt: toDatetimeLocal(baseExec),
    // pré-rempli avec prochaine échéance calculée si dispo
    nextDue: toDateValue(autoNext),
    provider: rec?.provider ?? "",
    notes: rec?.notes ?? "",
    proofUrlsText:
      Array.isArray(rec?.proofUrls) && rec.proofUrls.length
        ? rec.proofUrls.join("\n")
        : "",
    history: Array.isArray(rec?.history) ? rec.history : [],
  };
}

/* ---------- Styles alignés ---------- */
const fieldWrap =
  "group relative rounded-xl bg-white/50   py-2 min-h-[80px] transition-shadow";
const labelCls =
  "flex items-center gap-2 text-xs font-medium text-darkBlue/60 mb-1";
const inputCls =
  "h-11 w-full rounded-lg border border-darkBlue/20 bg-white px-3 text-[15px] outline-none transition placeholder:text-darkBlue/40";
const selectCls =
  "h-11 w-full appearance-none rounded-lg border border-darkBlue/20 bg-white px-3 text-[15px] outline-none transition";
const textareaCls =
  "w-full resize-none rounded-lg border border-darkBlue/20 bg-white p-[10px] text-[15px] outline-none transition placeholder:text-darkBlue/40";
const btnBase =
  "inline-flex items-center justify-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition active:scale-[0.98]";

/* ---------- Component ---------- */
export default function MaintenanceForm({
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
  } = useForm({ defaultValues: buildDefaults(initial) });

  const isEdit = !!initial?._id;

  const token = useMemo(
    () =>
      typeof window !== "undefined" ? localStorage.getItem("token") : null,
    []
  );

  const [noteEditIdx, setNoteEditIdx] = useState(null);
  const [noteDraft, setNoteDraft] = useState("");
  const [savingNote, setSavingNote] = useState(false);
  const [confirmIdx, setConfirmIdx] = useState(null);
  const [deletingIdx, setDeletingIdx] = useState(null);

  useEffect(() => {
    reset(buildDefaults(initial));
    setNoteEditIdx(null);
    setNoteDraft("");
    setConfirmIdx(null);
    setDeletingIdx(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initial]);

  const history = watch("history") || [];

  const historyWithIdxDesc = [...(history || [])]
    .map((h, idx) => ({ ...h, __idx: idx }))
    .reverse();

  /* ---------- Auto-calcul de prochaine échéance ---------- */
  const freqWatch = watch("frequency");
  const performedAtWatch = watch("performedAt");

  useEffect(() => {
    // base = dernière exécution si on est en édition, sinon "première exécution" saisie
    let baseDate;
    if (isEdit) {
      baseDate =
        initial?.lastDoneAt ||
        initial?.performedAt ||
        initial?.createdAt ||
        null;
    } else {
      baseDate = performedAtWatch || new Date();
    }

    const next = computeNextDueFromBase(baseDate, freqWatch);
    const nextStr = toDateValue(next);

    // Si fréquence "à la demande" ou pas de calcul possible → on vide le champ
    setValue("nextDue", nextStr, { shouldDirty: true });
  }, [freqWatch, performedAtWatch, isEdit, initial, setValue]);

  /* ---------- Submit ---------- */
  const onSubmit = async (data) => {
    if (!token) return;

    const proofs =
      typeof data.proofUrlsText === "string" && data.proofUrlsText.trim().length
        ? data.proofUrlsText
            .split(/[\n,;]+/g)
            .map((s) => s.trim())
            .filter(Boolean)
        : [];

    const payload = {
      equipment: data.equipment,
      equipmentId: data.equipmentId || undefined,
      type: data.type || "inspection",
      frequency: data.frequency || "monthly",
      nextDue:
        data.nextDue === "" || data.nextDue == null
          ? null
          : new Date(data.nextDue),
      provider: data.provider || undefined,
      notes: data.notes || undefined,
      proofUrls: proofs,
      ...(isEdit
        ? {}
        : {
            performedAt: data.performedAt
              ? new Date(data.performedAt)
              : new Date(),
          }),
    };

    const url = isEdit
      ? `${process.env.NEXT_PUBLIC_API_URL}/restaurants/${restaurantId}/maintenance/${initial._id}`
      : `${process.env.NEXT_PUBLIC_API_URL}/restaurants/${restaurantId}/maintenance`;
    const method = isEdit ? "put" : "post";

    const { data: saved } = await axios[method](url, payload, {
      headers: { Authorization: `Bearer ${token}` },
    });

    window.dispatchEvent(
      new CustomEvent("maintenance:upsert", { detail: { doc: saved } })
    );

    reset(buildDefaults(null));
    onSuccess?.(saved);
  };

  /* ---------- Note / historique ---------- */
  async function saveNoteForHistoryIndex(idx) {
    if (!initial?._id || !token) return;
    try {
      setSavingNote(true);
      const url = `${process.env.NEXT_PUBLIC_API_URL}/restaurants/${restaurantId}/maintenance/${initial._id}/history/${idx}/note`;
      const { data: saved } = await axios.put(
        url,
        { note: noteDraft },
        { headers: { Authorization: `Bearer ${token}` } }
      );

      setValue("history", saved?.history || [], { shouldDirty: false });
      window.dispatchEvent(
        new CustomEvent("maintenance:upsert", { detail: { doc: saved } })
      );

      setNoteEditIdx(null);
      setNoteDraft("");
      setConfirmIdx(null);
    } catch (e) {
      console.error("save note error:", e);
      alert("Impossible d'enregistrer la note.");
    } finally {
      setSavingNote(false);
    }
  }

  async function deleteHistoryAtIndex(idx) {
    if (!initial?._id || !token) return;
    try {
      setDeletingIdx(idx);
      const url = `${process.env.NEXT_PUBLIC_API_URL}/restaurants/${restaurantId}/maintenance/${initial._id}/history/${idx}`;
      const { data: saved } = await axios.delete(url, {
        headers: { Authorization: `Bearer ${token}` },
      });

      setValue("history", saved?.history || [], { shouldDirty: false });
      window.dispatchEvent(
        new CustomEvent("maintenance:upsert", { detail: { doc: saved } })
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

  return (
    <form
      onSubmit={handleSubmit(onSubmit)}
      className="relative flex flex-col gap-2"
    >
      {/* Ligne 1 : Équipement / ID interne */}
      <div className="grid grid-cols-1 gap-2 midTablet:grid-cols-2">
        <div className={`${fieldWrap} px-3`}>
          <label className={labelCls}>
            <Wrench className="size-4" /> Équipement *
          </label>
          <input
            type="text"
            {...register("equipment", { required: "Requis" })}
            className={`${inputCls} ${errors.equipment ? "border-red focus:ring-red/20" : ""}`}
            placeholder='ex: "Friteuse 1"'
            autoComplete="off"
            spellCheck={false}
            autoCorrect="off"
          />
          {errors.equipment && (
            <p className="text-xs text-red mt-1">{errors.equipment.message}</p>
          )}
        </div>

        <div className={`${fieldWrap} px-3`}>
          <label className={labelCls}>
            <Hash className="size-4" /> ID interne
          </label>
          <input
            type="text"
            {...register("equipmentId")}
            className={inputCls}
            placeholder="ex: EQ-001"
            autoComplete="off"
            spellCheck={false}
            autoCorrect="off"
          />
        </div>
      </div>

      {/* Ligne 2 : Type / Dernière ou Première exécution / Fréquence / Prochaine échéance */}
      <div className="grid grid-cols-1 gap-2 midTablet:grid-cols-4">
        <div className={`${fieldWrap} px-3`}>
          <label className={labelCls}>
            <Building2 className="size-4" /> Type
          </label>
          <select {...register("type")} className={selectCls}>
            <option value="filter_change">Changement filtre</option>
            <option value="inspection">Inspection</option>
            <option value="repair">Réparation</option>
            <option value="other">Autre</option>
          </select>
        </div>

        <div className={`${fieldWrap} px-3`}>
          <label className={labelCls}>
            <CalendarClock className="size-4" />{" "}
            {isEdit ? "Dernière exécution" : "Première exécution"}
          </label>
          <input
            type="datetime-local"
            {...register("performedAt")}
            className={selectCls}
            disabled={isEdit} // en édition : affichage uniquement, base pour l'échéance
          />
        </div>

        <div className={`${fieldWrap} px-3`}>
          <label className={labelCls}>Fréquence</label>
          <select {...register("frequency")} className={selectCls}>
            <option value="daily">Quotidienne</option>
            <option value="weekly">Hebdomadaire</option>
            <option value="monthly">Mensuelle</option>
            <option value="on_demand">À la demande</option>
          </select>
        </div>

        <div className={`${fieldWrap} px-3`}>
          <label className={labelCls}>
            <CalendarClock className="size-4" /> Prochaine échéance
          </label>
          <input type="date" {...register("nextDue")} className={selectCls} />
        </div>
      </div>

      {/* Ligne 3 : Prestataire / Preuves (en édition) */}
      <div className="grid grid-cols-1 gap-2 midTablet:grid-cols-2">
        <div className={`${fieldWrap} px-3 h-fit`}>
          <label className={labelCls}>Prestataire</label>
          <input
            type="text"
            {...register("provider")}
            className={inputCls}
            placeholder="ex: Acme Services"
            autoComplete="off"
            spellCheck={false}
            autoCorrect="off"
          />
        </div>

        {isEdit && (
          <div className={`${fieldWrap} px-3`}>
            <label className={labelCls}>
              <LinkIcon className="size-4" /> Preuves (URLs, 1 par ligne)
            </label>
            <textarea
              rows={4}
              {...register("proofUrlsText")}
              className={`${textareaCls} min-h-[96px]`}
              placeholder={"https://…/rapport.pdf\nhttps://…/photo.jpg"}
            />
          </div>
        )}

        {!isEdit && (
          <div className={`${fieldWrap} px-3`}>
            <label className={labelCls}>
              <LinkIcon className="size-4" /> Preuves (URLs, 1 par ligne)
            </label>
            <textarea
              rows={4}
              {...register("proofUrlsText")}
              className={`${textareaCls} min-h-[96px]`}
              placeholder={"https://…/rapport.pdf\nhttps://…/photo.jpg"}
            />
          </div>
        )}
      </div>

      {/* Notes plan */}
      <div className="grid grid-cols-1">
        <div className={`${fieldWrap} px-3 h-auto`}>
          <label className={labelCls}>
            <FileText className="size-4" /> Notes plan
          </label>
          <textarea
            rows={1}
            {...register("notes")}
            className={`${textareaCls}`}
            placeholder="Observations, références des pièces, etc."
          />
        </div>
      </div>

      {/* Historique d’exécution */}
      {isEdit && (
        <div className={`${fieldWrap} px-3 h-auto`}>
          <label className={labelCls}>
            <History className="size-4" /> Historique d’exécution
          </label>

          <div className="pt-2 pb-0 max-h-[400px] overflow-y-auto">
            {historyWithIdxDesc.length === 0 ? (
              <div className="rounded-lg border border-darkBlue/10 p-3 text-sm text-darkBlue/60 italic">
                Aucun historique pour le moment.
              </div>
            ) : (
              <ol className="relative ml-2 border-l border-darkBlue/15">
                {historyWithIdxDesc.map((h) => {
                  const idx = h.__idx;
                  const isEditingNote = noteEditIdx === idx;
                  const isConfirming = confirmIdx === idx;
                  const proofCount = Array.isArray(h?.proofUrls)
                    ? h.proofUrls.length
                    : 0;

                  return (
                    <li
                      key={`${idx}-${h?.doneAt || "na"}`}
                      className="mb-4 last:mb-0 pl-4"
                    >
                      <span className="absolute -left-[9px] mt-1 inline-flex h-4 w-4 items-center justify-center rounded-full bg-blue/90 ring-4 ring-white">
                        <span className="h-1.5 w-1.5 rounded-full bg-white" />
                      </span>

                      <div className="rounded-xl border border-darkBlue/10 bg-white shadow-sm">
                        <div className="flex flex-col gap-3 p-3 mobile:flex-row mobile:items-center mobile:justify-between">
                          <div className="leading-tight">
                            <div className="text-[13px] text-darkBlue/60">
                              Fait le
                            </div>
                            <div className="text-sm font-medium">
                              {fmtFRDate(h?.doneAt)}
                            </div>
                            <div className="mt-1 text-xs text-darkBlue/70">
                              par {displayUserName(h?.doneBy)}
                            </div>
                          </div>

                          <div className="flex flex-wrap items-center gap-2">
                            {proofCount > 0 && (
                              <span className="rounded-full bg-darkBlue/5 px-2 py-[2px] text-xs text-darkBlue/80">
                                {proofCount} preuve
                                {proofCount > 1 ? "s" : ""}
                              </span>
                            )}

                            {h?.verified && (
                              <span className="rounded-full bg-green px-2 py-[2px] text-xs font-medium text-white">
                                Vérifié
                              </span>
                            )}

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

                        <div className="border-t border-darkBlue/10 p-3">
                          {!isEditingNote ? (
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
                                  setConfirmIdx(null);
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
                                    <div className="flex items-center gap-2">
                                      <Loader2 className="size-4 animate-spin" />
                                      <span>Enregistrement…</span>
                                    </div>
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
      <div className="flex flex-col gap-2 mt-3 mobile:flex-row">
        <button
          type="submit"
          disabled={isSubmitting}
          aria-disabled={isSubmitting}
          className={`text-nowrap ${btnBase} text-white shadow disabled:opacity-60 ${
            isSubmitting ? "bg-darkBlue/40" : "bg-blue border border-blue"
          }`}
        >
          {isEdit ? (
            <>
              <FileText className="size-4" /> Mettre à jour
            </>
          ) : (
            <>
              <FileText className="size-4" /> Enregistrer
            </>
          )}
        </button>

        {isEdit && (
          <button
            type="button"
            onClick={() => {
              reset(buildDefaults(null));
              onCancel?.();
            }}
            className={`${btnBase} border border-red bg-white text-red`}
          >
            Annuler
          </button>
        )}
      </div>
    </form>
  );
}
