import { useState } from "react";

// AXIOS
import axios from "axios";

// I18N
import { useTranslation } from "next-i18next";

// COMPONENTS
import SimpleSkeletonComponent from "../../_shared/skeleton/simple-skeleton.component";
import PaymentsDrawerDashboardComponent from "./payments-drawer.dashboard.component";

// ICONS
import {
  Loader2,
  RotateCcw,
  CheckCircle2,
  ChevronDown,
  ArrowUpRight,
  Calendar,
  Gift,
  CreditCard,
  ExternalLink,
} from "lucide-react";

function formatDateFromUnix(timestamp) {
  const date = new Date(Number(timestamp || 0) * 1000);
  if (Number.isNaN(date.getTime())) return "-";
  return date.toLocaleDateString("fr-FR");
}

function getStatus(payment, t) {
  if (payment?.refunded) {
    return {
      label: t("payments.refunded"),
      cls: "bg-[#3b82f61a] text-[#1d4ed8] border-none",
    };
  }

  switch (payment?.status) {
    case "succeeded":
      return {
        label: t("payments.status.succeeded"),
        cls: "bg-[#4ead7a1a] text-[#167a47] border-none",
      };
    case "pending":
      return {
        label: t("payments.status.pending"),
        cls: "bg-[#f973161a] text-[#c2410c] border-none",
      };
    case "failed":
      return {
        label: t("payments.status.failed"),
        cls: "bg-[#ef44441a] text-[#b91c1c] border-none",
      };
    case "canceled":
      return {
        label: t("payments.status.canceled"),
        cls: "bg-[#9ca3af1a] text-[#4b5563] border-none",
      };
    default:
      return {
        label: t("payments.status.unknown"),
        cls: "bg-darkBlue/5 text-darkBlue border border-darkBlue/10",
      };
  }
}

function getTransactionTypeUi(payment, t) {
  if (payment?.type === "bank_hold_capture") {
    return {
      label: t(
        "payments.typeLabels.bankHoldCapture",
        "Empreinte bancaire capturée",
      ),
      icon: CreditCard,
      cls: "bg-blue/10 text-blue border-blue/25",
    };
  }

  return {
    label: t("payments.typeLabels.giftCardPurchase", "Achat carte cadeau"),
    icon: Gift,
    cls: "bg-[#F59E0B1A] text-[#B45309] border-[#F59E0B55]",
  };
}

export default function PaymentsDashboardComponent(props) {
  const { t } = useTranslation("transactions");

  const [selectedPaymentId, setSelectedPaymentId] = useState(null);
  const [refundTargetId, setRefundTargetId] = useState(null);
  const [refundLoading, setRefundLoading] = useState(false);

  const selectedPayment =
    props?.payments?.find((payment) => payment.id === selectedPaymentId) ||
    null;
  const refundTarget =
    props?.payments?.find((payment) => payment.id === refundTargetId) || null;

  function openPaymentDetails(payment) {
    setSelectedPaymentId(payment.id);
  }

  function closePaymentDetails() {
    setSelectedPaymentId(null);
  }

  function handleRefundClick(payment) {
    setRefundTargetId(payment.id);
  }

  function handleCancelRefund() {
    setRefundTargetId(null);
  }

  async function handleConfirmRefund() {
    if (!refundTarget) return;

    try {
      setRefundLoading(true);

      const response = await axios.post(
        `${process.env.NEXT_PUBLIC_API_URL}/owner/restaurants/${props.restaurantId}/payments/refund`,
        {
          paymentId: refundTarget.id,
        },
      );

      if (response.data.success) {
        props.handleRefundSuccess(refundTarget.id);
        props.fetchMonthlySales();
      } else {
        console.error("Erreur de remboursement", response.data.message);
      }
    } catch (error) {
      console.error("Erreur lors de l'appel API refund :", error);
    } finally {
      setRefundLoading(false);
      setRefundTargetId(null);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      {props?.payments?.length > 0 ? (
        <>
          {props.payments.map((payment) => {
            const statusUi = getStatus(payment, t);
            const transactionTypeUi = getTransactionTypeUi(payment, t);
            const TransactionTypeIcon = transactionTypeUi.icon;

            return (
              <div
                key={payment.id}
                className="
                   flex w-full items-center justify-between gap-4 rounded-2xl border border-darkBlue/10
                  bg-white/50 px-4 py-4 text-left transition duration-150
                  shadow-[0_18px_45px_rgba(19,30,54,0.06)]
                  midTablet:px-6 midTablet:py-5
                "
              >
                <span
                  className={`inline-flex size-12 items-center justify-center rounded-full border ${transactionTypeUi.cls}`}
                  title={transactionTypeUi.label}
                  aria-label={transactionTypeUi.label}
                >
                  <TransactionTypeIcon className="size-6" />
                </span>

                <div className="min-w-0 flex-1">
                  <p className="truncate text-base font-semibold text-darkBlue">
                    {payment.customer ||
                      t("payments.customerFallback", "Non renseigne")}
                  </p>

                  <div className="mt-1 flex flex-wrap items-center gap-2">
                    <span className="inline-flex items-center gap-2 rounded-full border border-darkBlue/10 bg-darkBlue/5 px-3 py-1.5 text-xs font-medium text-darkBlue">
                      <Calendar className="size-4" />
                      {formatDateFromUnix(payment.date)}
                    </span>

                    <span
                      className={`inline-flex items-center rounded-full px-3 py-1.5 text-xs font-medium ${statusUi.cls}`}
                    >
                      {statusUi.label}
                    </span>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => openPaymentDetails(payment)}
                  className="inline-flex size-8 shrink-0 items-center justify-center rounded-full border border-darkBlue/10 bg-white text-darkBlue transition hover:bg-darkBlue/5"
                >
                  <ExternalLink className="size-4 text-darkBlue/60" />
                </button>
              </div>
            );
          })}

          {props.hasMorePayments && !props.isFiltered && (
            <button
              className="
                inline-flex self-center items-center justify-center gap-2 rounded-full
                bg-blue px-4 py-2 text-xs tablet:text-sm font-medium text-white
                shadow-sm hover:shadow-md hover:opacity-95
                disabled:opacity-40 disabled:cursor-not-allowed
              "
              onClick={() => props.onLoadMore("payments")}
              disabled={props.dataLoading}
            >
              {props.dataLoading ? (
                <>
                  <Loader2 className="size-4 animate-spin" />
                  <span>{t("payments.loading")}</span>
                </>
              ) : (
                <>
                  <ChevronDown className="size-4" />
                  <span>{t("payments.loadMore")}</span>
                </>
              )}
            </button>
          )}
        </>
      ) : (
        <section className="rounded-2xl border border-darkBlue/10 bg-white/50 px-4 py-5">
          {props.dataLoading ? (
            <SimpleSkeletonComponent />
          ) : (
            <p className="text-sm text-darkBlue/70">{t("payments.empty")}</p>
          )}
        </section>
      )}

      <PaymentsDrawerDashboardComponent
        open={Boolean(selectedPayment)}
        onClose={closePaymentDetails}
        transaction={selectedPayment}
        t={t}
        onRefund={handleRefundClick}
        refundLoading={
          refundLoading &&
          Boolean(selectedPayment?.id) &&
          selectedPayment?.id === refundTargetId
        }
      />

      {refundTarget && (
        <div className="fixed inset-0 z-[130] flex items-center justify-center bg-black/40 px-4">
          <div className="flex w-full max-w-[520px] flex-col gap-5 rounded-2xl border border-darkBlue/10 bg-white/95 px-6 py-5 shadow-[0_18px_45px_rgba(19,30,54,0.20)]">
            <div className="text-center">
              <h2 className="text-base font-semibold text-darkBlue tablet:text-lg">
                {t("payments.modale.title")}
              </h2>
              <div className="mx-auto mt-3 h-px w-32 bg-darkBlue/15" />
            </div>

            <p className="text-center text-sm text-darkBlue/70">
              {t("payments.modale.infoFirst")}
            </p>

            <p className="text-center text-pretty text-sm text-darkBlue/70">
              {t("payments.modale.infoSecond")}
            </p>

            <div className="mt-2 flex flex-wrap items-center justify-center gap-3">
              <button
                onClick={handleConfirmRefund}
                disabled={refundLoading}
                className="
                  inline-flex items-center justify-center gap-2 rounded-full
                  bg-red px-5 py-2 text-sm font-medium text-white
                  shadow-sm hover:shadow-md hover:opacity-95
                  disabled:opacity-50 disabled:cursor-not-allowed
                "
              >
                {refundLoading ? (
                  <>
                    <Loader2 className="size-4 animate-spin" />
                    <span>{t("payments.modale.buttons.loading")}</span>
                  </>
                ) : (
                  <>
                    <RotateCcw className="size-4" />
                    <span>{t("payments.modale.buttons.confirm")}</span>
                  </>
                )}
              </button>

              <button
                onClick={handleCancelRefund}
                className="
                  inline-flex items-center justify-center gap-2 rounded-full
                  bg-darkBlue/5 px-5 py-2 text-sm font-medium text-darkBlue
                  border border-darkBlue/15 hover:bg-darkBlue/8
                "
              >
                <CheckCircle2 className="size-4 text-darkBlue/60" />
                {t("payments.modale.buttons.cancel")}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
