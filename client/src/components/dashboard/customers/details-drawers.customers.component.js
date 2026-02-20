import { useEffect, useMemo, useRef, useState } from "react";
import {
  X,
  Phone,
  Mail,
  User,
  Calendar,
  Gift,
  Ticket,
  Tag,
  ClipboardList,
  Pencil,
  Save,
  Trash2,
  UserCheck,
  Crown,
  RotateCcw,
  UserX,
  Info,
} from "lucide-react";

const CLOSE_MS = 280;

function fmtDate(d) {
  if (!d) return "-";
  const dt = new Date(d);
  if (Number.isNaN(dt.getTime())) return "-";
  return dt.toLocaleDateString("fr-FR");
}

function fmtTime(t) {
  const v = String(t || "");
  if (!v) return "--:--";
  return v.slice(0, 5).replace(":", "h");
}

function fmtMoney(n) {
  const val = Number(n || 0);
  return new Intl.NumberFormat("fr-FR", {
    style: "currency",
    currency: "EUR",
    maximumFractionDigits: 0,
  }).format(val);
}

function getInitials(firstName, lastName) {
  const f = String(firstName || "").trim();
  const l = String(lastName || "").trim();
  const a = (f[0] || "").toUpperCase();
  const b = (l[0] || "").toUpperCase();
  const out = `${a}${b}`.trim();
  return out || "?";
}

function tagHelp(tagKey) {
  switch (tagKey) {
    case "very_regular":
      return "Client VIP (réservations fréquentes / forte récurrence).";
    case "regular":
      return "Client fidèle (revient souvent).";
    case "to_reconquer":
      return "Client à relancer (ne vient plus comme avant).";
    case "lost":
      return "Client inactif depuis longtemps.";
    default:
      return "Tag personnalisé.";
  }
}

const TAGS_UI = {
  regular: {
    label: "Régulier",
    cls: "bg-blue/10 text-blue border-blue/20",
    Icon: UserCheck,
  },
  very_regular: {
    label: "Très régulier",
    cls: "bg-green/10 text-green border-green/20",
    Icon: Crown,
  },
  to_reconquer: {
    label: "À reconquérir",
    cls: "bg-[#FF914D22] text-[#B95E1C] border-[#FF914D55]",
    Icon: RotateCcw,
  },
  lost: {
    label: "Perdu",
    cls: "bg-red/10 text-red border-red/20",
    Icon: UserX,
  },
};

function TagPill({ tagKey }) {
  const ui = TAGS_UI[tagKey] || {
    label: tagKey,
    cls: "bg-darkBlue/5 text-darkBlue/70 border-darkBlue/15",
    Icon: Tag,
  };

  const Icon = ui.Icon || Tag;

  return (
    <div className="relative">
      <div
        type="button"
        className={`inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs font-semibold ${ui.cls}`}
      >
        <Icon className="size-3.5 opacity-80" />
        {ui.label}
      </div>
    </div>
  );
}

export default function DetailsDrawerCustomersComponent({
  open,
  onClose,
  customer,
  t,
  onAction,
}) {
  const [isVisible, setIsVisible] = useState(false);
  const [tab, setTab] = useState("reservations");

  // edit modes
  const [isEditing, setIsEditing] = useState(false);
  const [isEditingNote, setIsEditingNote] = useState(false);

  // local fields
  const [form, setForm] = useState({
    firstName: "",
    lastName: "",
    email: "",
    phone: "",
  });
  const [noteDraft, setNoteDraft] = useState("");

  // Scroll lock
  const prevBodyOverflowRef = useRef("");
  const prevHtmlOverflowRef = useRef("");

  const restoreScroll = () => {
    if (typeof document === "undefined") return;
    document.body.style.overflow = prevBodyOverflowRef.current || "";
    document.documentElement.style.overflow = prevHtmlOverflowRef.current || "";
  };

  const lockScroll = () => {
    if (typeof document === "undefined") return;
    prevBodyOverflowRef.current = document.body.style.overflow || "";
    prevHtmlOverflowRef.current = document.documentElement.style.overflow || "";
    document.body.style.overflow = "hidden";
    document.documentElement.style.overflow = "hidden";
  };

  useEffect(() => {
    if (!open) return;
    setTab("reservations");
    lockScroll();
    const raf = requestAnimationFrame(() => setIsVisible(true));

    const onKeyDown = (e) => {
      if (e.key === "Escape") closeWithAnimation();
    };
    document.addEventListener("keydown", onKeyDown);

    return () => {
      cancelAnimationFrame(raf);
      document.removeEventListener("keydown", onKeyDown);
      restoreScroll();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  useEffect(() => {
    if (!open) setIsVisible(false);
  }, [open]);

  useEffect(() => {
    if (!customer) return;
    setTab("reservations");
    setIsEditing(false);
    setIsEditingNote(false);
    setForm({
      firstName: customer.firstName || "",
      lastName: customer.lastName || "",
      email: customer.email || "",
      phone: customer.phone || "",
    });
    setNoteDraft(customer.notes || "");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [customer?.id]);

  function closeWithAnimation() {
    setIsVisible(false);
    setTimeout(() => {
      restoreScroll();
      onClose?.();
    }, CLOSE_MS);
  }

  const fullName = useMemo(() => {
    if (!customer) return "-";
    return (
      `${customer.firstName || ""} ${customer.lastName || ""}`.trim() || "-"
    );
  }, [customer]);

  const reservations = customer?.history?.reservations || [];
  const giftCards = customer?.history?.giftCards || [];

  const stats = customer?.stats || {};
  const reservationsTotal = stats.reservationsTotal ?? reservations.length ?? 0;
  const reservationsCanceled = stats.reservationsCanceled ?? 0;
  const giftCardsBought = stats.giftCardsBought ?? giftCards.length ?? 0;

  const sortedReservations = useMemo(() => {
    return [...reservations].sort((a, b) => {
      const ad = new Date(a?.date || 0).getTime();
      const bd = new Date(b?.date || 0).getTime();
      return bd - ad;
    });
  }, [reservations]);

  const sortedGiftCards = useMemo(() => {
    return [...giftCards].sort((a, b) => {
      const ad = new Date(a?.date || 0).getTime();
      const bd = new Date(b?.date || 0).getTime();
      return bd - ad;
    });
  }, [giftCards]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[120]" role="dialog" aria-modal="true">
      {/* Overlay */}
      <div
        className={`
          absolute inset-0 bg-darkBlue/30
          transition-opacity duration-200
          ${isVisible ? "opacity-100" : "opacity-0"}
        `}
        onClick={closeWithAnimation}
      />

      {/* Panel */}
      <div
        className={`
          absolute z-[1]
          bg-lightGrey border border-darkBlue/10
          shadow-[0_25px_80px_rgba(19,30,54,0.25)]
          flex flex-col overflow-hidden

          left-0 right-0 bottom-0 w-full min-h-[40vh] max-h-[86vh] tablet:max-h-[100vh]
          rounded-t-3xl

          tablet:top-0 tablet:bottom-0 tablet:left-auto tablet:right-0
          tablet:h-full tablet:w-[560px]
          tablet:rounded-none

          transform transition-transform duration-300 ease-out

          ${
            isVisible
              ? "translate-y-0 tablet:translate-x-0"
              : "translate-y-full tablet:translate-x-full tablet:translate-y-0"
          }
        `}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="sticky top-0 z-10 px-4 py-3 border-b border-darkBlue/10 bg-white/50">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-xs text-darkBlue/50">Fiche client</p>

              <div className="mt-2 flex items-center gap-3 min-w-0">
                <div className="size-11 rounded-full bg-darkBlue text-white flex items-center justify-center text-sm font-semibold shrink-0">
                  {getInitials(customer?.firstName, customer?.lastName)}
                </div>

                <div className="min-w-0">
                  <h3 className="text-base font-semibold text-darkBlue truncate">
                    {fullName}
                  </h3>

                  <div className="mt-1 flex flex-wrap items-center gap-2">
                    {(customer?.tags || []).length
                      ? customer.tags.map((tagKey) => (
                          <TagPill
                            key={`${customer?.id}-drawer-tag-${tagKey}`}
                            tagKey={tagKey}
                          />
                        ))
                      : null}

                    <span className="inline-flex items-center gap-2 rounded-full border border-darkBlue/10 bg-white/60 px-3 py-1 text-xs font-semibold text-darkBlue/70">
                      <ClipboardList className="size-3.5 text-darkBlue/40" />
                      Créé le {fmtDate(customer?.createdAt)}
                    </span>
                  </div>
                </div>
              </div>
            </div>

            <button
              onClick={closeWithAnimation}
              className="inline-flex items-center justify-center rounded-xl border border-darkBlue/10 bg-white hover:bg-darkBlue/5 transition p-2"
              aria-label={t?.("buttons.close", "Fermer")}
              type="button"
            >
              <X className="size-4 text-darkBlue/70" />
            </button>
          </div>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-4 hide-scrollbar">
          {/* Infos */}
          <div className="rounded-2xl bg-white/50 border border-darkBlue/10 shadow-sm p-4">
            <div className="flex items-center justify-between gap-2">
              <p className="text-xs text-darkBlue/50">Informations client</p>

              <button
                type="button"
                onClick={() => setIsEditing((v) => !v)}
                className="inline-flex items-center gap-2 rounded-xl border border-darkBlue/10 bg-white hover:bg-darkBlue/5 transition px-3 py-2 text-xs font-semibold text-darkBlue"
              >
                {isEditing ? (
                  <Save className="size-4 text-darkBlue/60" />
                ) : (
                  <Pencil className="size-4 text-darkBlue/60" />
                )}
                {isEditing ? "Terminer" : "Modifier"}
              </button>
            </div>

            <div className="mt-3 grid grid-cols-1 gap-2">
              <div className="flex items-center gap-2 text-sm text-darkBlue/80">
                <User className="size-4 mt-0.5 text-darkBlue/40" />
                {!isEditing ? (
                  <p className="min-w-0 truncate">{fullName}</p>
                ) : (
                  <div className="flex gap-2 w-full">
                    <input
                      value={form.firstName}
                      onChange={(e) =>
                        setForm((p) => ({ ...p, firstName: e.target.value }))
                      }
                      className="w-full rounded-xl border border-darkBlue/10 bg-white/70 px-3 py-2 text-sm outline-none"
                      placeholder="Prénom"
                    />
                    <input
                      value={form.lastName}
                      onChange={(e) =>
                        setForm((p) => ({ ...p, lastName: e.target.value }))
                      }
                      className="w-full rounded-xl border border-darkBlue/10 bg-white/70 px-3 py-2 text-sm outline-none"
                      placeholder="Nom"
                    />
                  </div>
                )}
              </div>

              {/* Téléphone */}
              <div className="flex items-center gap-2 text-sm text-darkBlue/80">
                <Phone className="size-4 mt-0.5 text-darkBlue/40" />

                {!isEditing ? (
                  <button
                    type="button"
                    className="min-w-0 truncate hover:underline text-left"
                    title="Clique pour appeler"
                    onClick={() => {
                      if (!customer?.phone) return;
                      window.location.href = `tel:${String(customer.phone).replace(/\s/g, "")}`;
                    }}
                  >
                    {customer?.phone || "-"}
                  </button>
                ) : (
                  <input
                    value={form.phone || ""}
                    onChange={(e) =>
                      setForm((p) => ({ ...p, phone: e.target.value }))
                    }
                    className="w-full rounded-xl border border-darkBlue/10 bg-white/70 px-3 py-2 text-sm outline-none"
                    placeholder="Téléphone"
                    inputMode="tel"
                  />
                )}
              </div>

              <div className="flex items-center gap-2 text-sm text-darkBlue/80">
                <Mail className="size-4 mt-0.5 text-darkBlue/40" />
                {!isEditing ? (
                  <button
                    type="button"
                    className="min-w-0 truncate hover:underline text-left"
                    title="Clique pour envoyer un email"
                    onClick={() => {
                      if (!customer?.email) return;
                      window.location.href = `mailto:${customer.email}`;
                    }}
                  >
                    {customer?.email || "-"}
                  </button>
                ) : (
                  <input
                    value={form.email}
                    onChange={(e) =>
                      setForm((p) => ({ ...p, email: e.target.value }))
                    }
                    className="w-full rounded-xl border border-darkBlue/10 bg-white/70 px-3 py-2 text-sm outline-none"
                    placeholder="Email"
                  />
                )}
              </div>
            </div>

            <div className="mt-4 flex flex-wrap gap-2">
              <button
                onClick={() => {
                  if (!customer?.phone) return;
                  window.location.href = `tel:${String(customer.phone).replace(/\s/g, "")}`;
                }}
                className="inline-flex items-center justify-center gap-2 rounded-xl bg-blue px-4 py-3 text-white text-sm font-semibold shadow-sm hover:bg-blue/90 active:scale-[0.98] transition"
                type="button"
              >
                <Phone className="size-4" />
                Appeler
              </button>

              <button
                onClick={() => {
                  if (!customer?.email) return;
                  window.location.href = `mailto:${customer.email}`;
                }}
                className="inline-flex items-center justify-center gap-2 rounded-xl border border-darkBlue/10 bg-white hover:bg-darkBlue/5 transition px-4 py-3 text-sm font-semibold text-darkBlue"
                type="button"
              >
                <Mail className="size-4 text-darkBlue/60" />
                Envoyer un email
              </button>
            </div>
          </div>

          {/* Stats */}
          <div className="mt-4 grid grid-cols-2 tablet:grid-cols-3 gap-3">
            <div className="rounded-2xl bg-white/50 border border-darkBlue/10 shadow-sm p-4">
              <p className="text-[11px] text-darkBlue/50 flex items-center gap-2">
                <Calendar className="size-4 text-darkBlue/40" />
                Réservations
              </p>
              <p className="mt-1 text-lg font-semibold text-darkBlue">
                {reservationsTotal}
              </p>
            </div>

            <div className="rounded-2xl bg-white/50 border border-darkBlue/10 shadow-sm p-4">
              <p className="text-[11px] text-darkBlue/50 flex items-center gap-2">
                <Ticket className="size-4 text-darkBlue/40" />
                Annulations
              </p>
              <p className="mt-1 text-lg font-semibold text-darkBlue">
                {reservationsCanceled}
              </p>
            </div>

            <div className="rounded-2xl bg-white/50 border border-darkBlue/10 shadow-sm p-4 col-span-2 tablet:col-span-1">
              <p className="text-[11px] text-darkBlue/50 flex items-center gap-2">
                <Gift className="size-4 text-darkBlue/40" />
                Cartes cadeaux
              </p>
              <p className="mt-1 text-lg font-semibold text-darkBlue">
                {giftCardsBought}
              </p>
            </div>
          </div>

          {/* Notes */}
          <div className="mt-4 rounded-2xl bg-white/50 border border-darkBlue/10 shadow-sm p-4">
            <div className="flex items-center justify-between gap-2">
              <p className="text-xs text-darkBlue/50">Note sur le client</p>

              <button
                type="button"
                onClick={() => setIsEditingNote((v) => !v)}
                className="inline-flex items-center gap-2 rounded-xl border border-darkBlue/10 bg-white hover:bg-darkBlue/5 transition px-3 py-2 text-xs font-semibold text-darkBlue"
              >
                <Pencil className="size-4 text-darkBlue/60" />
                {isEditingNote ? "Annuler" : "Modifier"}
              </button>
            </div>

            {!isEditingNote ? (
              <div className="mt-2 rounded-2xl border border-darkBlue/10 bg-white/50 px-3 py-3 text-sm text-darkBlue/80 min-h-[44px]">
                {customer?.notes?.trim?.() ? customer.notes : "—"}
              </div>
            ) : (
              <>
                <textarea
                  value={noteDraft}
                  onChange={(e) => setNoteDraft(e.target.value)}
                  className="mt-2 w-full min-h-[110px] rounded-2xl border border-darkBlue/10 bg-white/70 px-3 py-3 text-sm outline-none"
                  placeholder="Ajouter une note..."
                />
                <div className="mt-2 flex justify-end">
                  <button
                    type="button"
                    onClick={() => {
                      onAction?.(customer, "note_save", { notes: noteDraft });
                      setIsEditingNote(false);
                    }}
                    className="inline-flex items-center justify-center gap-2 rounded-xl bg-blue px-4 py-3 text-white text-sm font-semibold shadow-sm hover:bg-blue/90 active:scale-[0.98] transition"
                  >
                    <Save className="size-4" />
                    Enregistrer la note
                  </button>
                </div>
              </>
            )}
          </div>

          {/* Tabs */}
          <div className="mt-4 rounded-2xl bg-white/50 border border-darkBlue/10 shadow-sm overflow-hidden">
            <div className="flex border-b border-darkBlue/10 bg-white/50">
              <button
                className={`flex-1 px-4 py-3 text-xs font-semibold transition ${
                  tab === "reservations"
                    ? "text-darkBlue bg-darkBlue/5"
                    : "text-darkBlue/60 hover:bg-darkBlue/5"
                }`}
                onClick={() => setTab("reservations")}
                type="button"
              >
                Dernières réservations ({reservations.length})
              </button>

              <button
                className={`flex-1 px-4 py-3 text-xs font-semibold transition ${
                  tab === "giftcards"
                    ? "text-darkBlue bg-darkBlue/5"
                    : "text-darkBlue/60 hover:bg-darkBlue/5"
                }`}
                onClick={() => setTab("giftcards")}
                type="button"
              >
                Cartes cadeaux ({giftCards.length})
              </button>
            </div>

            <div className="p-4">
              {tab === "reservations" ? (
                <div className="flex flex-col gap-2">
                  {sortedReservations.length ? (
                    sortedReservations.map((r) => (
                      <div
                        key={r.id}
                        className="rounded-2xl border border-darkBlue/10 bg-white/50 px-4 py-3"
                      >
                        <div className="flex items-center justify-between gap-3">
                          <div className="min-w-0">
                            <p className="text-sm font-semibold text-darkBlue truncate">
                              {fmtDate(r.date)} — {fmtTime(r.time)}
                            </p>
                            <p className="text-xs text-darkBlue/50 mt-0.5">
                              {r.guests || 0} personne
                              {(r.guests || 0) > 1 ? "s" : ""}
                            </p>
                          </div>

                          <span
                            className={`shrink-0 inline-flex items-center rounded-full border px-3 py-1 text-xs font-semibold ${
                              r.status === "Canceled"
                                ? "bg-red/10 text-red border-red/20"
                                : "bg-green/10 text-green border-green/20"
                            }`}
                          >
                            {r.status === "Canceled" ? "Annulée" : "OK"}
                          </span>
                        </div>
                      </div>
                    ))
                  ) : (
                    <p className="text-sm text-darkBlue/60">
                      Aucune réservation enregistrée.
                    </p>
                  )}
                </div>
              ) : (
                <div className="flex flex-col gap-2">
                  {sortedGiftCards.length ? (
                    sortedGiftCards.map((g) => (
                      <div
                        key={g.id}
                        className="rounded-2xl border border-darkBlue/10 bg-white/50 px-4 py-3"
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <p className="text-sm font-semibold text-darkBlue truncate">
                              {fmtMoney(g.amount)} — {fmtDate(g.date)}
                            </p>
                            <p className="text-xs text-darkBlue/50 mt-0.5">
                              {g.description?.trim?.() ? g.description : "—"}
                            </p>
                          </div>
                        </div>
                      </div>
                    ))
                  ) : (
                    <p className="text-sm text-darkBlue/60">
                      Aucun achat de carte cadeau.
                    </p>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* ✅ ACTIONS (en bas) + bouton supprimer ici */}
          <div className="mt-4 rounded-2xl bg-white/50 border border-darkBlue/10 shadow-sm p-4">
            <p className="text-xs text-darkBlue/50 mb-3">Actions</p>

            <button
              type="button"
              onClick={() => onAction?.(customer, "delete")}
              className="ml-auto inline-flex items-center justify-center gap-2 rounded-xl border border-red/20 bg-red/10 text-red hover:bg-red/15 transition px-4 py-3 text-sm font-semibold"
            >
              <Trash2 className="size-4" />
              Supprimer la fiche
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
