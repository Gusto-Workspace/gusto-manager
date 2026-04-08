import { useEffect, useMemo, useRef, useState } from "react";

import DoubleSkeletonComponent from "@/components/_shared/skeleton/double-skeleton.component";
import SimpleSkeletonComponent from "@/components/_shared/skeleton/simple-skeleton.component";

import {
  AlertTriangle,
  Ban,
  Calendar,
  ChevronDown,
  ExternalLink,
  Loader2,
  Mail,
  Pencil,
  Receipt,
  RefreshCcw,
  Store,
  User,
  X,
} from "lucide-react";

const CLOSE_MS = 280;
const SWIPE_VELOCITY = 0.6;
const CLOSE_RATIO = 0.25;

function formatCurrency(amount, currency = "eur") {
  const numericAmount = Number(amount || 0);

  return new Intl.NumberFormat("fr-FR", {
    style: "currency",
    currency: String(currency || "eur").toUpperCase(),
  }).format(Number.isFinite(numericAmount) ? numericAmount : 0);
}

function DateCard({ label, value }) {
  return (
    <div className="rounded-xl border border-darkBlue/10 bg-white/80 px-3 py-3">
      <p className="text-xs text-darkBlue/45">{label}</p>
      <p className="mt-1 text-sm font-semibold text-darkBlue">{value || "-"}</p>
    </div>
  );
}

function InfoBlock({ icon: Icon, label, value }) {
  return (
    <div className="rounded-xl border border-darkBlue/10 bg-white/80 px-3 py-3">
      <div className="flex items-start gap-2">
        <Icon className="mt-0.5 size-4 shrink-0 text-darkBlue/40" />
        <div className="min-w-0">
          <p className="text-xs text-darkBlue/45">{label}</p>
          <p className="mt-1 truncate text-sm font-semibold text-darkBlue">
            {value || "-"}
          </p>
        </div>
      </div>
    </div>
  );
}

export default function InvoicesDrawerSubscriptionsComponent({
  open,
  onClose,
  sub,
  invoices,
  loading,
  invoicesLoaded,
  t,
  fmtStripeDate,
  statusUi,
  actionErrorMessage,
  resumeLoading,
  onEdit,
  onChangePayer,
  onStop,
  onResumeScheduledStop,
  onLoadInvoices,
}) {
  const [isVisible, setIsVisible] = useState(false);
  const [invoicesOpen, setInvoicesOpen] = useState(false);
  const [isTabletUp, setIsTabletUp] = useState(false);

  const prevBodyOverflowRef = useRef("");
  const prevHtmlOverflowRef = useRef("");
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

  const measurePanel = () => {
    const element = panelRef.current;
    if (!element) return;
    const height = element.getBoundingClientRect().height || 0;
    if (height > 0) setPanelH(height);
  };

  useEffect(() => {
    if (!open) return;

    lockScroll();
    setIsVisible(false);
    setDragY(0);
    setInvoicesOpen(false);

    const raf = requestAnimationFrame(() => {
      setIsVisible(true);
      requestAnimationFrame(measurePanel);
    });

    const onResize = () => requestAnimationFrame(measurePanel);
    window.addEventListener("resize", onResize);

    const onKeyDown = (event) => {
      if (event.key === "Escape") closeWithAnimation();
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

  useEffect(() => {
    if (!open || !invoicesOpen || !sub?.id || invoicesLoaded) return;
    onLoadInvoices?.(sub.id);
  }, [invoicesLoaded, invoicesOpen, onLoadInvoices, open, sub?.id]);

  function closeWithAnimation() {
    setIsVisible(false);
    setDragY(0);

    setTimeout(() => {
      restoreScroll();
      onClose?.();
    }, CLOSE_MS);
  }

  const invoiceStatusUi = useMemo(() => {
    if (!sub?.displayInvoiceStatus) return null;
    return statusUi(sub.displayInvoiceStatus);
  }, [statusUi, sub?.displayInvoiceStatus]);

  const periodEnd =
    sub?.currentPeriodEnd || sub?.nextChargeAt || sub?.cancelAt || 0;
  const invoiceCount = Array.isArray(invoices) ? invoices.length : 0;
  const addonNames = Array.isArray(sub?.addonNames) ? sub.addonNames : [];

  if (!open) return null;

  const panelFallback = 720;
  const dragMaxPx = Math.max(240, (panelH || panelFallback) - 12);
  const swipeClosePx = Math.max(
    90,
    Math.floor((panelH || panelFallback) * CLOSE_RATIO),
  );

  const onPointerDown = (event) => {
    if (isTabletUp) return;
    if (event.pointerType === "mouse" && event.button !== 0) return;

    dragStateRef.current.active = true;
    dragStateRef.current.startY = event.clientY;
    dragStateRef.current.lastY = event.clientY;
    dragStateRef.current.startT = performance.now();
    dragStateRef.current.lastT = dragStateRef.current.startT;

    try {
      event.currentTarget.setPointerCapture?.(event.pointerId);
    } catch {}
  };

  const onPointerMove = (event) => {
    if (isTabletUp) return;
    if (!dragStateRef.current.active) return;

    const nextY = event.clientY;
    const deltaY = nextY - dragStateRef.current.startY;

    dragStateRef.current.lastY = nextY;
    dragStateRef.current.lastT = performance.now();

    setDragY(Math.max(0, Math.min(dragMaxPx, deltaY)));
  };

  const onPointerUp = () => {
    if (isTabletUp) return;
    if (!dragStateRef.current.active) return;
    dragStateRef.current.active = false;

    const elapsed = Math.max(
      1,
      dragStateRef.current.lastT - dragStateRef.current.startT,
    );
    const velocity =
      (dragStateRef.current.lastY - dragStateRef.current.startY) / elapsed;

    if (dragY >= swipeClosePx || velocity >= SWIPE_VELOCITY) {
      closeWithAnimation();
      return;
    }

    setDragY(0);
  };

  return (
    <div className="fixed inset-0 z-[120]" role="dialog" aria-modal="true">
      <div
        className={`absolute inset-0 bg-darkBlue/30 transition-opacity ease-out ${
          isVisible ? "opacity-100" : "opacity-0"
        }`}
        style={{ transitionDuration: `${CLOSE_MS}ms`, willChange: "opacity" }}
        onClick={closeWithAnimation}
        aria-label={t("buttons.close", "Fermer")}
      />

      <div
        ref={panelRef}
        className={`
          absolute z-[1] flex h-[90vh] max-h-[90vh] flex-col overflow-hidden border border-darkBlue/10 bg-white
          shadow-[0_25px_80px_rgba(19,30,54,0.25)]
          inset-x-0 bottom-0 w-full rounded-t-3xl
          tablet:top-0 tablet:bottom-0 tablet:left-auto tablet:right-0 tablet:h-[100dvh] tablet:max-h-[100dvh] tablet:w-[560px] tablet:rounded-none
          transform-gpu transition-transform ease-out will-change-transform
          ${
            isVisible
              ? "translate-y-0 tablet:translate-y-0 tablet:translate-x-0"
              : "translate-y-full tablet:translate-y-0 tablet:translate-x-full"
          }
        `}
        style={
          isTabletUp
            ? { transitionDuration: `${CLOSE_MS}ms` }
            : {
                transform: isVisible
                  ? `translateY(${dragY}px)`
                  : "translateY(100%)",
                transition: dragStateRef.current.active
                  ? "none"
                  : `transform ${CLOSE_MS}ms ease-out`,
                willChange: "transform",
              }
        }
        onClick={(event) => event.stopPropagation()}
      >
        <div className="sticky top-0 z-10 bg-white">
          <div
            className="tablet:hidden cursor-grab active:cursor-grabbing touch-none"
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onPointerCancel={onPointerUp}
          >
            <div className="py-3 flex justify-center bg-white">
              <div className="h-1.5 w-12 rounded-full bg-darkBlue/20" />
            </div>
          </div>

          <div className="border-b border-darkBlue/10 bg-white/70 px-4 pb-3 midTablet:py-3">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-xs text-darkBlue/50">
                  {t(
                    "subscriptions.list.detailsTitle",
                    "Detail de l'abonnement",
                  )}
                </p>

                <h3 className="text-base font-semibold text-darkBlue truncate">
                  {sub?.restaurantName ||
                    t("subscriptions.list.noRestaurant", "Restaurant")}
                </h3>

                <p className="mt-1 text-sm text-darkBlue/55 truncate">
                  {t("subscriptions.list.owner", "Proprietaire")} :{" "}
                  {sub?.displayOwnerName || "-"}
                </p>
              </div>

              <button
                onClick={closeWithAnimation}
                className="inline-flex items-center justify-center rounded-xl border border-darkBlue/10 bg-white hover:bg-darkBlue/5 transition p-2"
                aria-label={t("buttons.close", "Fermer")}
              >
                <X className="size-4 text-darkBlue/70" />
              </button>
            </div>
          </div>
        </div>

        <div className="flex-1 bg-lightGrey overflow-y-auto p-4 hide-scrollbar overscroll-contain">
          {!sub ? (
            <div className="rounded-xl border border-darkBlue/10 bg-white/60 p-6 text-center">
              <div className="mx-auto mb-3 flex size-11 items-center justify-center rounded-2xl bg-darkBlue/5">
                <AlertTriangle className="size-5 text-darkBlue/60" />
              </div>
              <p className="text-sm text-darkBlue/70">
                {t(
                  "subscriptions.list.unavailable",
                  "Cet abonnement n'est plus disponible dans la liste.",
                )}
              </p>
            </div>
          ) : (
            <>
              <div className="rounded-2xl bg-white/60 border border-darkBlue/10 shadow-sm p-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-xs text-darkBlue/50">
                      {t("subscriptions.list.type", "Type abonnement")}
                    </p>
                    <p className="text-sm font-semibold text-darkBlue truncate">
                      {sub.plan?.name || sub.productName || "-"}
                    </p>
                  </div>

                  <span className="inline-flex items-center rounded-full border border-darkBlue/10 bg-white/80 px-3 py-1 text-xs font-semibold text-darkBlue">
                    {formatCurrency(
                      sub.totalAmount ?? sub.productAmount,
                      sub.totalCurrency || sub.productCurrency || "EUR",
                    )}
                  </span>
                </div>

                <div className="mt-3 flex flex-wrap items-center gap-2">
                  {invoiceStatusUi ? (
                    <span className="inline-flex items-center gap-2 rounded-full border border-darkBlue/10 bg-white/80 px-3 py-1 text-xs font-semibold text-darkBlue">
                      <Receipt className="size-3.5 text-darkBlue/50" />
                      <span className={invoiceStatusUi.cls}>
                        {invoiceStatusUi.label}
                      </span>
                    </span>
                  ) : null}

                  {sub.payerChangeRequired ? (
                    <span className="inline-flex items-center gap-2 rounded-full border border-red/20 bg-red/10 px-3 py-1 text-xs font-semibold text-red">
                      {t(
                        "subscriptions.list.payerUpdateNeeded",
                        "Payeur a mettre a jour",
                      )}
                    </span>
                  ) : null}

                  {sub.cancelAtPeriodEnd && periodEnd ? (
                    <span className="inline-flex items-center gap-2 rounded-full border border-red/20 bg-red/10 px-3 py-1 text-xs font-semibold text-red">
                      <Ban className="size-3.5" />
                      {t(
                        "subscriptions.list.scheduledStop",
                        "Arret programme le",
                      )}{" "}
                      {fmtStripeDate(periodEnd)}
                    </span>
                  ) : null}
                </div>

                <div className="mt-4 grid grid-cols-1 gap-3">
                  <div className="grid grid-cols-2 gap-2">
                    <InfoBlock
                      icon={Store}
                      label={t("subscriptions.list.restaurant", "Restaurant")}
                      value={sub.restaurantName}
                    />
                    <InfoBlock
                      icon={User}
                      label={t("subscriptions.list.owner", "Proprietaire")}
                      value={sub.displayOwnerName}
                    />
                  </div>

                  <InfoBlock
                    icon={Mail}
                    label={t("subscriptions.list.email", "Email")}
                    value={sub.displayCustomerEmail}
                  />

                  <div className="grid grid-cols-2 gap-2">
                    <DateCard
                      label={t(
                        "subscriptions.list.lastInvoice",
                        "Derniere facture",
                      )}
                      value={
                        sub.displayLastInvoiceAt
                          ? fmtStripeDate(sub.displayLastInvoiceAt)
                          : "-"
                      }
                    />
                    <DateCard
                      label={t(
                        "subscriptions.list.nextCharge",
                        "Prochaine echeance",
                      )}
                      value={
                        sub.nextChargeAt ? fmtStripeDate(sub.nextChargeAt) : "-"
                      }
                    />
                  </div>

                  {addonNames.length > 0 ? (
                    <div className="rounded-xl border border-darkBlue/10 bg-white/80 px-3 py-3">
                      <div className="flex items-start gap-2">
                        <Receipt className="mt-0.5 size-4 shrink-0 text-darkBlue/40" />
                        <div className="min-w-0">
                          <p className="text-xs text-darkBlue/45">
                            {t("subscriptions.list.modules", "Modules")}
                          </p>
                          <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-darkBlue/80">
                            {addonNames.map((addonName) => (
                              <li key={addonName}>{addonName}</li>
                            ))}
                          </ul>
                        </div>
                      </div>
                    </div>
                  ) : null}
                </div>
              </div>

              <div className="mt-4 rounded-2xl bg-white/60 border border-darkBlue/10 shadow-sm overflow-hidden">
                <button
                  type="button"
                  onClick={() => setInvoicesOpen((current) => !current)}
                  className="w-full p-4 flex items-center justify-between gap-3 text-left"
                >
                  <p className="text-sm font-semibold text-darkBlue">
                    {t("subscriptions.list.invoicesTitle", "Factures")}
                  </p>

                  <div className="inline-flex items-center gap-2">
                    {loading ? (
                      <Loader2 className="size-4 animate-spin text-darkBlue/50" />
                    ) : null}
                    <ChevronDown
                      className={`size-4 text-darkBlue/50 transition-transform ${
                        invoicesOpen ? "rotate-180" : ""
                      }`}
                    />
                  </div>
                </button>

                {invoicesOpen ? (
                  <div className="px-4 pb-4">
                    {loading ? (
                      <div className="rounded-2xl border border-darkBlue/10 bg-white/70 p-4">
                        <div className="flex flex-col gap-3">
                          <DoubleSkeletonComponent
                            justify="justify-start"
                            height="h-4"
                          />
                          <SimpleSkeletonComponent height="h-4" />
                          <SimpleSkeletonComponent height="h-4" />
                        </div>
                      </div>
                    ) : invoiceCount === 0 ? (
                      <div className="rounded-xl border border-darkBlue/10 bg-white/70 p-6 text-center">
                        <div className="mx-auto mb-3 flex size-11 items-center justify-center rounded-2xl bg-darkBlue/5">
                          <AlertTriangle className="size-5 text-darkBlue/60" />
                        </div>
                        <p className="text-sm text-darkBlue/70">
                          {t(
                            "subscriptions.list.noInvoices",
                            "Aucune facture a afficher.",
                          )}
                        </p>
                      </div>
                    ) : (
                      <div className="max-h-[320px] overflow-y-auto pr-1 hide-scrollbar">
                        <ul className="flex flex-col gap-2">
                          {invoices.map((invoice) => {
                            const invoiceUi = statusUi(invoice.status);
                            const amount = Number(
                              invoice.amount_paid ??
                                invoice.amount_due ??
                                invoice.total ??
                                0,
                            );

                            return (
                              <li
                                key={invoice.id}
                                className="rounded-xl border border-darkBlue/10 bg-white/75 p-3"
                              >
                                <div className="flex items-start justify-between gap-3">
                                  <div className="min-w-0 space-y-1">
                                    <p className="text-sm font-semibold text-darkBlue">
                                      {fmtStripeDate(invoice.created)}
                                    </p>
                                    <p className="text-sm text-darkBlue/80">
                                      {formatCurrency(
                                        amount / 100,
                                        invoice.currency || "EUR",
                                      )}
                                    </p>
                                    <p className="text-xs font-semibold text-darkBlue/60">
                                      <span className={invoiceUi.cls}>
                                        {invoiceUi.label}
                                      </span>
                                    </p>
                                  </div>

                                  {invoice.invoice_pdf ? (
                                    <a
                                      href={invoice.invoice_pdf}
                                      target="_blank"
                                      rel="noopener noreferrer"
                                      className="inline-flex shrink-0 items-center gap-2 rounded-xl border border-blue/20 bg-blue/10 px-3 py-2 text-sm font-semibold text-blue transition hover:bg-blue/15"
                                    >
                                      <ExternalLink className="size-4" />
                                      {t("subscriptions.list.download", "PDF")}
                                    </a>
                                  ) : (
                                    <span className="text-xs text-darkBlue/35">
                                      -
                                    </span>
                                  )}
                                </div>
                              </li>
                            );
                          })}
                        </ul>
                      </div>
                    )}
                  </div>
                ) : null}
              </div>
            </>
          )}
        </div>

        <div className="border-t border-darkBlue/10 bg-white/70 px-4 py-4 pb-[calc(env(safe-area-inset-bottom)+16px)]">
          {sub ? (
            <>
              <p className="text-xs text-darkBlue/50 mb-3">
                {t("subscriptions.list.actionsTitle", "Actions")}
              </p>

              {actionErrorMessage ? (
                <div className="mb-3 rounded-2xl border border-red/20 bg-red/10 px-4 py-3 text-sm font-semibold text-red">
                  {actionErrorMessage}
                </div>
              ) : null}

              <div className="flex flex-col gap-2">
                <button
                  type="button"
                  onClick={() => onEdit?.(sub.id)}
                  className="inline-flex items-center justify-center gap-2 rounded-xl border border-blue/20 bg-blue/10 px-4 py-3 text-sm font-semibold text-blue transition hover:bg-blue/15"
                >
                  <Pencil className="size-4" />
                  {t("subscriptions.list.edit", "Modifier l'abonnement")}
                </button>

                {sub.payerChangeRequired && sub.restaurantId ? (
                  <button
                    type="button"
                    onClick={() => onChangePayer?.(sub.restaurantId)}
                    className="inline-flex items-center justify-center gap-2 rounded-xl border border-red/20 bg-red/10 px-4 py-3 text-sm font-semibold text-red transition hover:bg-red/15"
                  >
                    <RefreshCcw className="size-4" />
                    {t("subscriptions.list.changePayer", "Changer le payeur")}
                  </button>
                ) : null}

                {sub.cancelAtPeriodEnd ? (
                  <>
                    <button
                      type="button"
                      onClick={() => onResumeScheduledStop?.(sub.id)}
                      disabled={resumeLoading}
                      className="inline-flex items-center justify-center gap-2 rounded-xl border border-green/20 bg-green/10 px-4 py-3 text-sm font-semibold text-green transition hover:bg-green/15 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      {resumeLoading ? (
                        <>
                          <Loader2 className="size-4 animate-spin" />
                          {t("buttons.loading", "Chargement...")}
                        </>
                      ) : (
                        <>
                          <RefreshCcw className="size-4" />
                          {t(
                            "subscriptions.list.resumeScheduledStop",
                            "Annuler l'arret programme",
                          )}
                        </>
                      )}
                    </button>

                    <button
                      type="button"
                      onClick={() => onStop?.(sub)}
                      className="inline-flex items-center justify-center gap-2 rounded-xl border border-red/20 bg-white px-4 py-3 text-sm font-semibold text-red transition hover:bg-red/5"
                    >
                      <Ban className="size-4" />
                      {t("subscriptions.list.stopNow", "Arreter immediatement")}
                    </button>
                  </>
                ) : (
                  <button
                    type="button"
                    onClick={() => onStop?.(sub)}
                    className="inline-flex items-center justify-center gap-2 rounded-xl border border-red/20 bg-white px-4 py-3 text-sm font-semibold text-red transition hover:bg-red/5"
                  >
                    <Ban className="size-4" />
                    {t("subscriptions.list.stop", "Arreter l'abonnement")}
                  </button>
                )}
              </div>
            </>
          ) : (
            <button
              onClick={closeWithAnimation}
              className="w-full inline-flex items-center justify-center rounded-xl bg-blue px-4 py-3 text-white text-sm font-semibold shadow-sm hover:bg-blue/90 active:scale-[0.98] transition"
            >
              {t("buttons.back", "Retour")}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
