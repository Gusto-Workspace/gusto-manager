import { useEffect, useMemo, useRef, useState } from "react";
import axios from "axios";
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
} from "lucide-react";

const CLOSE_MS = 280;

// Swipe config (mobile only)
const SWIPE_VELOCITY = 0.6; // px/ms
const CLOSE_RATIO = 0.25; // 25% panel height => close

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
    <div
      className={`inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs font-semibold ${ui.cls}`}
    >
      <Icon className="size-3.5 opacity-80" />
      {ui.label}
    </div>
  );
}

export default function DetailsDrawerCustomersComponent({
  open,
  onClose,
  customer, // basic (list)
  t,
  restaurantId,
  onUpdated,
  onAction,
}) {
  const [isVisible, setIsVisible] = useState(false);
  const [tab, setTab] = useState("reservations");

  // edit modes
  const [isEditing, setIsEditing] = useState(false);
  const [isEditingNote, setIsEditingNote] = useState(false);

  // local editable fields
  const [form, setForm] = useState({
    firstName: "",
    lastName: "",
    email: "",
    phone: "",
  });
  const [noteDraft, setNoteDraft] = useState("");

  // fetched details
  const [details, setDetails] = useState(null); // { customer, history }
  const [loadingDetails, setLoadingDetails] = useState(false);
  const [detailsError, setDetailsError] = useState(null);

  // save states
  const [saving, setSaving] = useState(false);
  const [savingNote, setSavingNote] = useState(false);
  const [saveError, setSaveError] = useState(null);

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

  const customerId = customer?._id;

  /* =========================
     ✅ Tablet+ detection
  ========================= */
  const [isTabletUp, setIsTabletUp] = useState(false);
  useEffect(() => {
    if (typeof window === "undefined") return;

    const mq = window.matchMedia("(min-width: 768px)");
    const update = () => setIsTabletUp(mq.matches);

    update();
    if (mq.addEventListener) mq.addEventListener("change", update);
    else mq.addListener(update);

    return () => {
      if (mq.removeEventListener) mq.removeEventListener("change", update);
      else mq.removeListener(update);
    };
  }, []);

  /* =========================
     ✅ Swipe state (mobile only)
  ========================= */
  const panelRef = useRef(null);
  const [panelH, setPanelH] = useState(null);

  const [dragY, setDragY] = useState(0);
  const dragStateRef = useRef({
    active: false,
    startY: 0,
    lastY: 0,
    startT: 0,
    lastT: 0,
  });

  const measurePanel = () => {
    const el = panelRef.current;
    if (!el) return;
    const h = el.getBoundingClientRect().height || 0;
    if (h > 0) setPanelH(h);
  };

  // open/close animation + default tab
  useEffect(() => {
    if (!open) return;

    setTab("reservations");
    setDragY(0);
    lockScroll();

    const raf = requestAnimationFrame(() => {
      setIsVisible(true);
      requestAnimationFrame(measurePanel);
    });

    const onResize = () => requestAnimationFrame(measurePanel);
    window.addEventListener("resize", onResize);

    const onKeyDown = (e) => {
      if (e.key === "Escape") closeWithAnimation();
    };
    document.addEventListener("keydown", onKeyDown);

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", onResize);
      document.removeEventListener("keydown", onKeyDown);
      restoreScroll();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  useEffect(() => {
    if (!open) setIsVisible(false);
  }, [open]);

  // ✅ reset edit states when closing drawer (even if reopening same customer)
  useEffect(() => {
    if (!open) {
      setIsEditing(false);
      setIsEditingNote(false);
      setSaveError(null);
      setDetailsError(null);
    }
  }, [open]);

  // init form when customer changes
  useEffect(() => {
    if (!customer) return;

    setTab("reservations");
    setIsEditing(false);
    setIsEditingNote(false);
    setSaveError(null);
    setDetails(null);
    setDetailsError(null);

    setForm({
      firstName: customer.firstName || "",
      lastName: customer.lastName || "",
      email: customer.email || "",
      phone: customer.phone || "",
    });
    setNoteDraft(customer.notes || "");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [customerId]);

  // fetch details when open + customerId
  useEffect(() => {
    const run = async () => {
      if (!open || !restaurantId || !customerId) return;

      const token =
        typeof window !== "undefined" ? localStorage.getItem("token") : null;
      if (!token) return;

      setLoadingDetails(true);
      setDetailsError(null);

      try {
        const { data } = await axios.get(
          `${process.env.NEXT_PUBLIC_API_URL}/restaurants/${restaurantId}/customers/${customerId}`,
          {
            headers: { Authorization: `Bearer ${token}` },
            params: {
              resaPage: 1,
              resaLimit: 40,
              giftPage: 1,
              giftLimit: 40,
            },
          },
        );

        setDetails(data || null);

        // sync note (si backend a valeur plus à jour)
        const backendCustomer = data?.customer;
        if (backendCustomer) {
          setNoteDraft(backendCustomer.notes || "");
          setForm({
            firstName: backendCustomer.firstName || "",
            lastName: backendCustomer.lastName || "",
            email: backendCustomer.email || "",
            phone: backendCustomer.phone || "",
          });
        }
      } catch (e) {
        setDetailsError(
          e?.response?.data?.message ||
            "Impossible de charger la fiche client.",
        );
        setDetails(null);
      } finally {
        setLoadingDetails(false);
      }
    };

    run();
  }, [open, restaurantId, customerId]);

  function closeWithAnimation() {
    setIsEditing(false);
    setIsEditingNote(false);
    setSaveError(null);
    setDetailsError(null);

    setIsVisible(false);
    setDragY(0);

    setTimeout(() => {
      restoreScroll();
      onClose?.();
    }, CLOSE_MS);
  }

  const baseCustomer = details?.customer || customer;

  const fullName = useMemo(() => {
    if (!baseCustomer) return "-";
    return (
      `${baseCustomer.firstName || ""} ${baseCustomer.lastName || ""}`.trim() ||
      "-"
    );
  }, [baseCustomer]);

  const reservations = details?.history?.reservations?.items || [];
  const giftCards = details?.history?.giftCards?.items || [];

  const stats = baseCustomer?.stats || {};
  const reservationsTotal = stats.reservationsTotal ?? 0;
  const reservationsCanceled = stats.reservationsCanceled ?? 0;
  const giftCardsBought = stats.giftCardsBought ?? 0;

  const sortedReservations = useMemo(() => {
    return [...reservations].sort((a, b) => {
      const ad = new Date(a?.reservationDate || 0).getTime();
      const bd = new Date(b?.reservationDate || 0).getTime();
      return bd - ad;
    });
  }, [reservations]);

  const sortedGiftCards = useMemo(() => {
    return [...giftCards].sort((a, b) => {
      const ad = new Date(a?.created_at || a?.createdAt || 0).getTime();
      const bd = new Date(b?.created_at || b?.createdAt || 0).getTime();
      return bd - ad;
    });
  }, [giftCards]);

  const saveIdentity = async () => {
    if (!restaurantId || !customerId) return;

    const token =
      typeof window !== "undefined" ? localStorage.getItem("token") : null;
    if (!token) return;

    setSaving(true);
    setSaveError(null);

    try {
      const { data } = await axios.put(
        `${process.env.NEXT_PUBLIC_API_URL}/restaurants/${restaurantId}/customers/${customerId}`,
        {
          firstName: form.firstName,
          lastName: form.lastName,
          email: form.email,
          phone: form.phone,
        },
        { headers: { Authorization: `Bearer ${token}` } },
      );

      const updated = data?.customer;
      if (updated) {
        setDetails((prev) => ({
          ...(prev || {}),
          customer: updated,
          history: prev?.history,
        }));
      }

      setIsEditing(false);
      onUpdated?.();
    } catch (e) {
      setSaveError(
        e?.response?.data?.message ||
          "Une erreur est survenue lors de l’enregistrement.",
      );
    } finally {
      setSaving(false);
    }
  };

  const saveNote = async () => {
    if (!restaurantId || !customerId) return;

    const token =
      typeof window !== "undefined" ? localStorage.getItem("token") : null;
    if (!token) return;

    setSavingNote(true);
    setSaveError(null);

    try {
      const { data } = await axios.put(
        `${process.env.NEXT_PUBLIC_API_URL}/restaurants/${restaurantId}/customers/${customerId}`,
        { notes: noteDraft },
        { headers: { Authorization: `Bearer ${token}` } },
      );

      const updated = data?.customer;
      if (updated) {
        setDetails((prev) => ({
          ...(prev || {}),
          customer: updated,
          history: prev?.history,
        }));
      }

      setIsEditingNote(false);
      onUpdated?.();
    } catch (e) {
      setSaveError(
        e?.response?.data?.message ||
          "Une erreur est survenue lors de l’enregistrement de la note.",
      );
    } finally {
      setSavingNote(false);
    }
  };

  if (!open) return null;

  // ✅ swipe thresholds (mobile)
  const panelFallback = 720;
  const DRAG_MAX_PX = Math.max(240, (panelH || panelFallback) - 12);
  const SWIPE_CLOSE_PX = Math.max(
    90,
    Math.floor((panelH || panelFallback) * CLOSE_RATIO),
  );

  // ✅ swipe handlers (mobile drag zone only)
  const onPointerDown = (e) => {
    if (isTabletUp) return; // ✅ never swipe on tablet+
    if (e.pointerType === "mouse" && e.button !== 0) return;

    dragStateRef.current.active = true;
    dragStateRef.current.startY = e.clientY;
    dragStateRef.current.lastY = e.clientY;
    dragStateRef.current.startT = performance.now();
    dragStateRef.current.lastT = dragStateRef.current.startT;

    try {
      e.currentTarget.setPointerCapture?.(e.pointerId);
    } catch {}
  };

  const onPointerMove = (e) => {
    if (isTabletUp) return;
    if (!dragStateRef.current.active) return;

    const y = e.clientY;
    const dy = y - dragStateRef.current.startY;

    dragStateRef.current.lastY = y;
    dragStateRef.current.lastT = performance.now();

    const clamped = Math.max(0, Math.min(DRAG_MAX_PX, dy));
    setDragY(clamped);
  };

  const onPointerUp = () => {
    if (isTabletUp) return;
    if (!dragStateRef.current.active) return;
    dragStateRef.current.active = false;

    const dt = Math.max(
      1,
      dragStateRef.current.lastT - dragStateRef.current.startT,
    );
    const v = (dragStateRef.current.lastY - dragStateRef.current.startY) / dt; // px/ms

    if (dragY >= SWIPE_CLOSE_PX || v >= SWIPE_VELOCITY) {
      closeWithAnimation();
      return;
    }

    setDragY(0);
  };

  // overlay opacity while dragging (mobile)
  const overlayOpacity = !isVisible
    ? 0
    : 1 * (1 - Math.min(1, dragY / DRAG_MAX_PX));

  return (
    <div className="fixed inset-0 z-[120]" role="dialog" aria-modal="true">
      {/* Overlay */}
      <div
        className={`
          absolute inset-0 bg-darkBlue/30
          transition-opacity duration-200
          ${isVisible ? "opacity-100" : "opacity-0"}
        `}
        style={{ opacity: overlayOpacity }}
        onClick={closeWithAnimation}
      />

      {/* Panel */}
      <div
        ref={panelRef}
        className={`
          absolute z-[1]
          bg-white border border-darkBlue/10
          shadow-[0_25px_80px_rgba(19,30,54,0.25)]
          flex flex-col overflow-hidden

          left-0 right-0 bottom-0 w-full min-h-[40vh] max-h-[86vh] tablet:max-h-[100vh]
          rounded-t-3xl

          tablet:top-0 tablet:bottom-0 tablet:left-auto tablet:right-0
          tablet:h-full tablet:w-[560px]
          tablet:rounded-none

          transform transition-transform duration-300 ease-out will-change-transform
          ${
            isVisible
              ? "translate-y-0 tablet:translate-x-0"
              : "translate-y-full tablet:translate-x-full tablet:translate-y-0"
          }
        `}
        style={
          isTabletUp
            ? undefined
            : {
                transform: isVisible
                  ? `translateY(${dragY}px)`
                  : "translateY(100%)",
                transition: dragStateRef.current.active
                  ? "none"
                  : "transform 240ms ease-out",
                willChange: "transform",
              }
        }
        onClick={(e) => e.stopPropagation()}
      >
        {/* ✅ Mobile drag zone */}
        <div
          className="tablet:hidden cursor-grab active:cursor-grabbing touch-none"
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
        >
          {/* Handle */}
          <div className="py-3 flex justify-center">
            <div className="h-1.5 w-12 rounded-full bg-darkBlue/20" />
          </div>
        </div>

        {/* Header */}
        <div className="sticky top-0 z-10 px-4 pb-3 midTablet:py-3 border-b border-darkBlue/10 bg-white/50">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-xs text-darkBlue/50">Fiche client</p>

              <div className="mt-2 flex items-center gap-3 min-w-0">
                <div className="size-11 rounded-full bg-darkBlue text-white flex items-center justify-center text-sm font-semibold shrink-0">
                  {getInitials(baseCustomer?.firstName, baseCustomer?.lastName)}
                </div>

                <div className="min-w-0">
                  <h3 className="text-base font-semibold text-darkBlue truncate">
                    {fullName}
                  </h3>

                  <div className="mt-1 flex flex-wrap items-center gap-2">
                    {(baseCustomer?.tags || []).length
                      ? baseCustomer.tags.map((tagKey) => (
                          <TagPill
                            key={`${customerId}-drawer-tag-${tagKey}`}
                            tagKey={tagKey}
                          />
                        ))
                      : null}

                    <span className="inline-flex items-center gap-2 rounded-full border border-darkBlue/10 bg-white/60 px-3 py-1 text-xs font-semibold text-darkBlue/70">
                      <ClipboardList className="size-3.5 text-darkBlue/40" />
                      Créé le {fmtDate(baseCustomer?.createdAt)}
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
        <div className="flex-1 bg-lightGrey overflow-y-auto p-4 hide-scrollbar overscroll-contain">
          {/* Error details */}
          {detailsError ? (
            <div className="rounded-2xl border border-red/20 bg-red/10 px-4 py-3 text-sm text-red mb-4">
              {detailsError}
            </div>
          ) : null}

          {/* Infos */}
          <div className="rounded-2xl bg-white/50 border border-darkBlue/10 shadow-sm p-4">
            <div className="flex items-center justify-between gap-2">
              <p className="text-xs text-darkBlue/50">Informations client</p>

              <button
                type="button"
                onClick={async () => {
                  if (!isEditing) {
                    setIsEditing(true);
                    return;
                  }
                  await saveIdentity();
                }}
                disabled={saving}
                className="inline-flex items-center gap-2 rounded-xl border border-darkBlue/10 bg-white hover:bg-darkBlue/5 transition px-3 py-2 text-xs font-semibold text-darkBlue disabled:opacity-60"
              >
                {isEditing ? (
                  <Save className="size-4 text-darkBlue/60" />
                ) : (
                  <Pencil className="size-4 text-darkBlue/60" />
                )}
                {isEditing
                  ? saving
                    ? "Enregistrement..."
                    : "Enregistrer"
                  : "Modifier"}
              </button>
            </div>

            {saveError ? (
              <div className="mt-3 rounded-2xl border border-red/20 bg-red/10 px-4 py-3 text-sm text-red">
                {saveError}
              </div>
            ) : null}

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
                      if (!baseCustomer?.phone) return;
                      window.location.href = `tel:${String(
                        baseCustomer.phone,
                      ).replace(/\s/g, "")}`;
                    }}
                  >
                    {baseCustomer?.phone || "-"}
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

              {/* Email */}
              <div className="flex items-center gap-2 text-sm text-darkBlue/80">
                <Mail className="size-4 mt-0.5 text-darkBlue/40" />
                {!isEditing ? (
                  <button
                    type="button"
                    className="min-w-0 truncate hover:underline text-left"
                    title="Clique pour envoyer un email"
                    onClick={() => {
                      if (!baseCustomer?.email) return;
                      window.location.href = `mailto:${baseCustomer.email}`;
                    }}
                  >
                    {baseCustomer?.email || "-"}
                  </button>
                ) : (
                  <input
                    value={form.email || ""}
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
                  if (!baseCustomer?.phone) return;
                  window.location.href = `tel:${String(
                    baseCustomer.phone,
                  ).replace(/\s/g, "")}`;
                }}
                className="inline-flex items-center justify-center gap-2 rounded-xl bg-blue px-4 py-3 text-white text-sm font-semibold shadow-sm hover:bg-blue/90 active:scale-[0.98] transition"
                type="button"
              >
                <Phone className="size-4" />
                Appeler
              </button>

              <button
                onClick={() => {
                  if (!baseCustomer?.email) return;
                  window.location.href = `mailto:${baseCustomer.email}`;
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
                {baseCustomer?.notes?.trim?.() ? baseCustomer.notes : "—"}
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
                    disabled={savingNote}
                    onClick={saveNote}
                    className="inline-flex items-center justify-center gap-2 rounded-xl bg-blue px-4 py-3 text-white text-sm font-semibold shadow-sm hover:bg-blue/90 active:scale-[0.98] transition disabled:opacity-60"
                  >
                    <Save className="size-4" />
                    {savingNote ? "Enregistrement..." : "Enregistrer la note"}
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
              {loadingDetails ? (
                <div className="text-sm text-darkBlue/60">Chargement...</div>
              ) : tab === "reservations" ? (
                <div className="flex flex-col gap-2">
                  {sortedReservations.length ? (
                    sortedReservations.map((r) => (
                      <div
                        key={String(r._id)}
                        className="rounded-2xl border border-darkBlue/10 bg-white/50 px-4 py-3"
                      >
                        <div className="flex items-center justify-between gap-3">
                          <div className="min-w-0">
                            <p className="text-sm font-semibold text-darkBlue truncate">
                              {fmtDate(r.reservationDate)} —{" "}
                              {fmtTime(r.reservationTime)}
                            </p>
                            <p className="text-xs text-darkBlue/50 mt-0.5">
                              {r.numberOfGuests || 0} personne
                              {(r.numberOfGuests || 0) > 1 ? "s" : ""}
                            </p>
                          </div>

                          <span
                            className={`shrink-0 inline-flex items-center rounded-full border px-3 py-1 text-xs font-semibold ${
                              r.status === "Canceled" || r.status === "Rejected"
                                ? "bg-red/10 text-red border-red/20"
                                : "bg-green/10 text-green border-green/20"
                            }`}
                          >
                            {r.status === "Canceled"
                              ? "Annulée"
                              : r.status === "Rejected"
                                ? "Refusée"
                                : "OK"}
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
                    sortedGiftCards.map((g) => {
                      const giftAmountEUR =
                        Number.isFinite(Number(g.value)) && Number(g.value) > 0
                          ? Number(g.value)
                          : Number(g.amount || 0) / 100;

                      return (
                        <div
                          key={String(g._id || g.id)}
                          className="rounded-2xl border border-darkBlue/10 bg-white/50 px-4 py-3"
                        >
                          <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0">
                              <p className="text-sm font-semibold text-darkBlue truncate">
                                {fmtMoney(giftAmountEUR)} —{" "}
                                {fmtDate(g.created_at || g.createdAt)}
                              </p>

                              <p className="text-xs text-darkBlue/60 mt-0.5">
                                Code :{" "}
                                <span className="font-semibold text-darkBlue">
                                  {g.purchaseCode || "—"}
                                </span>
                              </p>
                            </div>
                          </div>
                        </div>
                      );
                    })
                  ) : (
                    <p className="text-sm text-darkBlue/60">
                      Aucun achat de carte cadeau.
                    </p>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* ACTIONS */}
          <div className="mt-4 rounded-2xl bg-white/50 border border-darkBlue/10 shadow-sm p-4">
            <p className="text-xs text-darkBlue/50 mb-3">Actions</p>

            <button
              type="button"
              onClick={() => onAction?.(baseCustomer, "delete")}
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
