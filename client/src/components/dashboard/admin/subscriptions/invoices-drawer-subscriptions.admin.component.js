import { useEffect, useRef, useState } from "react";

import DoubleSkeletonComponent from "@/components/_shared/skeleton/double-skeleton.component";
import SimpleSkeletonComponent from "@/components/_shared/skeleton/simple-skeleton.component";

import {
  AlertTriangle,
  Calendar,
  ExternalLink,
  Receipt,
  X,
} from "lucide-react";

const CLOSE_MS = 280;

export default function InvoicesDrawerSubscriptionsComponent({
  open,
  onClose,
  sub,
  invoices,
  loading,
  t,
  fmtStripeDate,
  statusUi,
}) {
  const [isVisible, setIsVisible] = useState(false);

  // ✅ sauvegarde scroll lock (robuste)
  const prevBodyOverflowRef = useRef("");
  const prevHtmlOverflowRef = useRef("");

  const restoreScroll = () => {
    if (typeof document === "undefined") return;
    document.body.style.overflow = prevBodyOverflowRef.current || "";
    document.documentElement.style.overflow = prevHtmlOverflowRef.current || "";
  };

  const lockScroll = () => {
    if (typeof document === "undefined") return;
    // sauvegarde UNE seule fois (au moment de l'ouverture)
    prevBodyOverflowRef.current = document.body.style.overflow || "";
    prevHtmlOverflowRef.current = document.documentElement.style.overflow || "";

    document.body.style.overflow = "hidden";
    document.documentElement.style.overflow = "hidden";
  };

  // ✅ entrée (exactement comme ta modal owner)
  useEffect(() => {
    if (!open) return;

    lockScroll();

    const raf = requestAnimationFrame(() => setIsVisible(true));

    const onKeyDown = (e) => {
      if (e.key === "Escape") closeWithAnimation();
    };
    document.addEventListener("keydown", onKeyDown);

    return () => {
      cancelAnimationFrame(raf);
      document.removeEventListener("keydown", onKeyDown);

      // double sécurité : restore ici aussi
      restoreScroll();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // ✅ si parent repasse open=false, on reset l'état
  useEffect(() => {
    if (!open) setIsVisible(false);
  }, [open]);

  function closeWithAnimation() {
    // on joue l'anim
    setIsVisible(false);

    // ✅ restore scroll à la fin quoiqu'il arrive
    setTimeout(() => {
      restoreScroll();
      onClose?.();
    }, CLOSE_MS);
  }

  const lastInvoice = sub?.latest_invoice || null;
  const st = statusUi(lastInvoice?.status);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[100]" role="dialog" aria-modal="true">
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
          flex flex-col
          overflow-hidden

          left-0 right-0 bottom-0 w-full min-h-[35vh] max-h-[86vh] tablet:max-h-[100vh]
          rounded-t-3xl

          tablet:top-0 tablet:bottom-0 tablet:left-auto tablet:right-0
          tablet:h-full tablet:w-[460px]
          tablet:rounded-none

          transform transition-transform duration-300 ease-out

          ${
            isVisible
              ? `
                translate-y-0
                tablet:translate-y-0 tablet:translate-x-0
              `
              : `
                translate-y-full
                tablet:translate-y-0 tablet:translate-x-full
              `
          }
        `}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="sticky top-0 z-10 px-4 py-3 border-b border-darkBlue/10 bg-white/70">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-xs text-darkBlue/50">
                {t("subscriptions.list.invoicesTitle", "Factures")}
              </p>

              <h3 className="text-base font-semibold text-darkBlue truncate">
                {sub?.restaurantName ||
                  t("subscriptions.list.noRestaurant", "Restaurant")}
              </h3>

              <div className="mt-1 flex flex-wrap items-center gap-2">
                {lastInvoice?.status ? (
                  <span className="inline-flex items-center gap-2 rounded-full border border-darkBlue/10 bg-white/80 px-3 py-1 text-xs font-semibold text-darkBlue">
                    <Receipt className="size-3.5 text-darkBlue/50" />
                    <span className={st.cls}>{st.label}</span>
                  </span>
                ) : null}

                {lastInvoice?.created ? (
                  <span className="inline-flex items-center gap-2 rounded-full border border-darkBlue/10 bg-white/80 px-3 py-1 text-xs font-semibold text-darkBlue">
                    <Calendar className="size-3.5 text-darkBlue/50" />
                    {fmtStripeDate(lastInvoice.created)}
                  </span>
                ) : null}
              </div>
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

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-4 hide-scrollbar">
          {loading ? (
            <div className="rounded-2xl bg-white/60 border border-darkBlue/10 shadow-sm p-4 flex flex-col gap-3">
              <DoubleSkeletonComponent justify="justify-start" height="h-4"/>
              <SimpleSkeletonComponent height="h-4"/>
              <SimpleSkeletonComponent height="h-4" />
            </div>
          ) : invoices?.length === 0 ? (
            <div className="rounded-xl bg-white/60 border border-darkBlue/10 shadow-sm p-6 text-center">
              <div className="mx-auto mb-3 size-11 rounded-2xl bg-darkBlue/5 flex items-center justify-center">
                <AlertTriangle className="size-5 text-darkBlue/60" />
              </div>
              <p className="text-sm text-darkBlue/70">
                {t(
                  "subscriptions.list.noInvoices",
                  "Aucune facture à afficher.",
                )}
              </p>
            </div>
          ) : (
            <ul className="flex flex-col gap-2">
              {invoices.map((invoice) => {
                const inv = statusUi(invoice.status);

                return (
                  <li
                    key={invoice.id}
                    className="rounded-xl border border-darkBlue/10 bg-white/60 p-3 flex items-start justify-between gap-3"
                  >
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-darkBlue">
                        {t("subscriptions.list.date")} :{" "}
                        {fmtStripeDate(invoice.created)}
                      </p>

                      <p className="text-sm text-darkBlue/80 mt-0.5">
                        {t("subscriptions.list.amount")} :{" "}
                        {(invoice.amount_due || 0) / 100}{" "}
                        {invoice.currency?.toUpperCase?.() || ""}
                      </p>

                      <p className="text-sm text-darkBlue/80 mt-0.5">
                        {t("subscriptions.list.status")} :{" "}
                        <span className={inv.cls}>{inv.label}</span>
                      </p>
                    </div>

                    {invoice.invoice_pdf ? (
                      <a
                        href={invoice.invoice_pdf}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="shrink-0 inline-flex items-center gap-2 rounded-xl border border-blue/20 bg-blue/10 text-blue px-3 py-2 text-sm font-semibold hover:bg-blue/15 transition"
                      >
                        <ExternalLink className="size-4" />
                        {t("subscriptions.list.download", "PDF")}
                      </a>
                    ) : (
                      <span className="text-xs text-darkBlue/40">-</span>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        {/* Footer mobile */}
        <div className="tablet:hidden border-t border-darkBlue/10 bg-white/70 px-4 py-3">
          <button
            onClick={closeWithAnimation}
            className="w-full inline-flex items-center justify-center rounded-xl bg-blue px-4 py-3 text-white text-sm font-semibold shadow-sm hover:bg-blue/90 active:scale-[0.98] transition"
          >
            {t("buttons.back", "Retour")}
          </button>
        </div>
      </div>
    </div>
  );
}
