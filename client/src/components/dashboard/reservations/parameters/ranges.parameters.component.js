import { useEffect, useMemo, useState } from "react";
import axios from "axios";

// ICONS
import { Loader2, Plus, Trash2, Ban } from "lucide-react";

function pad2(n) {
  return String(n).padStart(2, "0");
}

function toLocalDatetimeInputValue(date) {
  const d = date instanceof Date ? date : new Date(date);
  if (Number.isNaN(d.getTime())) return "";
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}T${pad2(
    d.getHours(),
  )}:${pad2(d.getMinutes())}`;
}

function fmtShortFR(date) {
  const d = date instanceof Date ? date : new Date(date);
  if (Number.isNaN(d.getTime())) return "-";
  return d.toLocaleString("fr-FR", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function isRangeActive(range) {
  const now = new Date();
  const start = new Date(range.startAt);
  const end = new Date(range.endAt);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()))
    return false;
  return now >= start && now < end;
}

export default function RangesParametersComponent({
  restaurantId,
  blockedRanges = [],
  setRestaurantData,
}) {
  const [blockedStart, setBlockedStart] = useState("");
  const [blockedEnd, setBlockedEnd] = useState("");
  const [blockedNote, setBlockedNote] = useState("");
  const [blockedError, setBlockedError] = useState("");
  const [blockedAdding, setBlockedAdding] = useState(false);
  const [blockedDeletingId, setBlockedDeletingId] = useState(null);

  const hasActivePause = useMemo(() => {
    return (blockedRanges || []).some(isRangeActive);
  }, [blockedRanges]);

  useEffect(() => {
    const now = new Date();
    const plus2h = new Date(now.getTime() + 2 * 60 * 60 * 1000);
    setBlockedStart((v) => v || toLocalDatetimeInputValue(now));
    setBlockedEnd((v) => v || toLocalDatetimeInputValue(plus2h));
  }, []);

  function validateBlockedForm(startStr, endStr) {
    setBlockedError("");
    if (!startStr || !endStr) return "Veuillez renseigner un début et une fin.";
    const start = new Date(startStr);
    const end = new Date(endStr);
    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()))
      return "Dates invalides.";
    if (end <= start) return "La fin doit être après le début.";
    return "";
  }

  async function addBlockedRange() {
    const msg = validateBlockedForm(blockedStart, blockedEnd);
    if (msg) {
      setBlockedError(msg);
      return;
    }

    try {
      setBlockedAdding(true);
      setBlockedError("");

      const token = localStorage.getItem("token");
      if (!restaurantId) return;

      const res = await axios.post(
        `${process.env.NEXT_PUBLIC_API_URL}/restaurants/${restaurantId}/reservations/blocked-ranges`,
        {
          startAt: new Date(blockedStart).toISOString(),
          endAt: new Date(blockedEnd).toISOString(),
          note: (blockedNote || "").trim(),
        },
        { headers: { Authorization: `Bearer ${token}` } },
      );

      setRestaurantData?.(res.data.restaurant);
      setBlockedNote("");
    } catch (e) {
      console.error("Error adding blocked range:", e);
      setBlockedError(
        e?.response?.data?.message ||
          "Erreur lors de l’ajout de la pause. Réessayez.",
      );
    } finally {
      setBlockedAdding(false);
    }
  }

  async function deleteBlockedRange(rangeId) {
    if (!rangeId) return;

    try {
      setBlockedDeletingId(rangeId);
      setBlockedError("");

      const token = localStorage.getItem("token");
      if (!restaurantId) return;

      const res = await axios.delete(
        `${process.env.NEXT_PUBLIC_API_URL}/restaurants/${restaurantId}/reservations/blocked-ranges/${rangeId}`,
        { headers: { Authorization: `Bearer ${token}` } },
      );

      setRestaurantData?.(res.data.restaurant);
    } catch (e) {
      console.error("Error deleting blocked range:", e);
      setBlockedError(
        e?.response?.data?.message ||
          "Erreur lors de la suppression. Réessayez.",
      );
    } finally {
      setBlockedDeletingId(null);
    }
  }

  const card = "rounded-3xl border border-darkBlue/10 bg-white/70 shadow-sm";
  const cardInner = "px-2 py-4 mobile:p-4 midTablet:p-6";
  const sectionTitle =
    "text-base font-semibold text-darkBlue flex items-center gap-2";
  const hint = "text-sm text-darkBlue/60";
  const divider = "h-px bg-darkBlue/10 my-4";

  const toggleWrap = "inline-flex items-center gap-2 select-none";
  const toggleBase =
    "relative inline-flex h-8 w-14 items-center rounded-full border transition";
  const toggleOn = "bg-blue border-blue/40";
  const toggleOff = "bg-darkBlue/10 border-darkBlue/10";
  const toggleDot =
    "absolute top-1/2 -translate-y-1/2 h-6 w-6 rounded-full bg-white shadow-sm transition";
  const toggleDotOn = "translate-x-7";
  const toggleDotOff = "translate-x-1";

  const inputBase =
    "h-11 w-full rounded-2xl border border-darkBlue/10 bg-white/80 px-4 text-base outline-none transition placeholder:text-darkBlue/35 focus:border-blue/60 focus:ring-2 focus:ring-blue/20";
  const selectBase =
    "h-11 w-full rounded-2xl border border-darkBlue/10 bg-white/80 px-4 text-base outline-none transition focus:border-blue/60 focus:ring-2 focus:ring-blue/20";

  const chip =
    "inline-flex items-center gap-2 rounded-2xl border border-darkBlue/10 bg-white/70 px-3 py-2 text-xs text-darkBlue/60";

  return (
    <div className={card}>
      <div className={cardInner}>
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <p className={sectionTitle}>
              <Ban className="size-4 shrink-0 opacity-60" />
              Mise en pause des réservations
            </p>
            <p className={hint}>
              Ajoute des plages où le site ne peut plus prendre temporairement
              de réservations.
            </p>
          </div>

          <span
            className={[
              "shrink-0 inline-flex items-center gap-2 rounded-2xl border px-3 py-2 text-xs",
              hasActivePause
                ? "border-green/20 bg-green/10 text-green"
                : "border-darkBlue/10 bg-white/60 text-darkBlue/60",
            ].join(" ")}
          >
            <span
              className={[
                "size-2 rounded-full",
                hasActivePause ? "bg-green" : "bg-darkBlue/25",
              ].join(" ")}
            />
            {hasActivePause ? "Pause active" : "Aucune pause"}
          </span>
        </div>

        <div className={divider} />

        <div className="grid grid-cols-1 midTablet:grid-cols-2 gap-3">
          <div className="rounded-2xl border border-darkBlue/10 bg-white/60 p-3">
            <p className="text-sm font-semibold text-darkBlue">Début</p>
            <input
              type="datetime-local"
              value={blockedStart}
              onChange={(e) => setBlockedStart(e.target.value)}
              className={inputBase}
            />
          </div>

          <div className="rounded-2xl border border-darkBlue/10 bg-white/60 p-3">
            <p className="text-sm font-semibold text-darkBlue">Fin</p>
            <input
              type="datetime-local"
              value={blockedEnd}
              onChange={(e) => setBlockedEnd(e.target.value)}
              className={inputBase}
            />
          </div>

          <div className="rounded-2xl border border-darkBlue/10 bg-white/60 p-3">
            <p className="text-sm font-semibold text-darkBlue">
              Note (optionnel)
            </p>
            <input
              type="text"
              value={blockedNote}
              onChange={(e) => setBlockedNote(e.target.value)}
              placeholder="Ex: service complet, privatisation…"
              className={inputBase}
            />
          </div>
        </div>

        {blockedError && (
          <p className="mt-3 text-xs text-red">{blockedError}</p>
        )}

        <div className="mt-3 flex items-center justify-end gap-3">
          <button
            type="button"
            onClick={addBlockedRange}
            disabled={blockedAdding || !!blockedDeletingId}
            className={[
              "inline-flex items-center justify-center gap-2 rounded-2xl px-5 h-11",
              "text-sm font-semibold text-white",
              "bg-blue hover:bg-blue/90 active:scale-[0.98] transition",
              blockedAdding ? "opacity-50 cursor-not-allowed" : "",
            ].join(" ")}
          >
            {blockedAdding ? (
              <>
                <Loader2 className="size-4 shrink-0 animate-spin" />
                En cours…
              </>
            ) : (
              <>
                <Plus className="size-4 shrink-0" />
                Ajouter une pause
              </>
            )}
          </button>
        </div>

        <div className={divider} />

        <div className="flex flex-col gap-3">
          {blockedRanges.length === 0 ? (
            <p className="text-sm text-darkBlue/55">
              Aucune plage de pause configurée.
            </p>
          ) : (
            blockedRanges
              .slice()
              .sort((a, b) => new Date(a.startAt) - new Date(b.startAt))
              .map((r) => {
                const active = isRangeActive(r);
                return (
                  <div
                    key={String(r._id)}
                    className={[
                      "rounded-2xl border p-3 flex items-center justify-between gap-3",
                      active
                        ? "border-red/20 bg-red/10"
                        : "border-darkBlue/10 bg-white/60",
                    ].join(" ")}
                  >
                    <div className="min-w-0">
                      <p
                        className={[
                          "text-sm font-semibold",
                          active ? "text-red" : "text-darkBlue",
                        ].join(" ")}
                      >
                        {fmtShortFR(r.startAt)} → {fmtShortFR(r.endAt)}
                      </p>

                      {r.note ? (
                        <p className="mt-1 text-xs text-darkBlue/60 break-words">
                          {r.note}
                        </p>
                      ) : null}

                      {active ? (
                        <p className="mt-1 text-xs text-red/80">
                          En cours (le site ne peut pas accepter de réservations
                          sur ce créneau).
                        </p>
                      ) : null}
                    </div>

                    <button
                      type="button"
                      onClick={() => deleteBlockedRange(r._id)}
                      disabled={blockedAdding || !!blockedDeletingId}
                      className="min-w-[44px] flex items-center justify-center size-11 rounded-2xl bg-red text-white shadow-sm hover:opacity-75 active:scale-[0.98] transition disabled:opacity-50 disabled:cursor-not-allowed"
                      aria-label="Supprimer"
                      title="Supprimer"
                    >
                      {blockedDeletingId === r._id ? (
                        <Loader2 className="size-4 shrink-0 animate-spin" />
                      ) : (
                        <Trash2 className="size-4 shrink-0" />
                      )}
                    </button>
                  </div>
                );
              })
          )}
        </div>
      </div>
    </div>
  );
}
