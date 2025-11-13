import { useState } from "react";

// AXIOS
import axios from "axios";

// I18N
import { useTranslation } from "next-i18next";

// COMPONENTS
import SimpleSkeletonComponent from "../../_shared/skeleton/simple-skeleton.component";

// ICONS
import { Loader2, RotateCcw, CheckCircle2, ChevronDown } from "lucide-react";

export default function PaymentsDashboardComponent(props) {
  const { t } = useTranslation("transactions");

  const [selectedPayment, setSelectedPayment] = useState(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [refundLoading, setRefundLoading] = useState(false);

  function handleRefundClick(payment) {
    setSelectedPayment(payment);
    setIsModalOpen(true);
  }

  async function handleConfirmRefund() {
    if (!selectedPayment) return;

    try {
      setRefundLoading(true);

      const response = await axios.post(
        `${process.env.NEXT_PUBLIC_API_URL}/owner/restaurants/${props.restaurantId}/payments/refund`,
        {
          paymentId: selectedPayment.id,
        }
      );

      if (response.data.success) {
        props.handleRefundSuccess(selectedPayment.id);
        props.fetchMonthlySales();
      } else {
        console.error("Erreur de remboursement", response.data.message);
      }
    } catch (error) {
      console.error("Erreur lors de l'appel API refund :", error);
    } finally {
      setRefundLoading(false);
      setIsModalOpen(false);
      setSelectedPayment(null);
    }
  }

  function handleCancelRefund() {
    setIsModalOpen(false);
    setSelectedPayment(null);
  }

  // helper statut + couleurs
  function getStatus(payment) {
    if (payment.refunded) {
      return {
        label: t("payments.refunded"),
        cls: "bg-[#3b82f61a] text-[#1d4ed8] border-none",
      };
    }

    let label = t("payments.status.unknown");
    let cls = "bg-darkBlue/5 text-darkBlue border border-darkBlue/10";

    switch (payment.status) {
      case "succeeded":
        label = t("payments.status.succeeded");
        cls = "bg-[#4ead7a1a] text-[#167a47] border-none";
        break;
      case "pending":
        label = t("payments.status.pending");
        cls = "bg-[#f973161a] text-[#c2410c] border-none";
        break;
      case "failed":
        label = t("payments.status.failed");
        cls = "bg-[#ef44441a] text-[#b91c1c] border-none";
        break;
      case "canceled":
        label = t("payments.status.canceled");
        cls = "bg-[#9ca3af1a] text-[#4b5563] border-none";
        break;
    }

    return { label, cls };
  }

  return (
    <div className="flex flex-col gap-4">
      {props?.payments?.length > 0 ? (
        <>
          {props.payments.map((payment, index) => {
            const { label: statusLabel, cls: statusBadgeCls } =
              getStatus(payment);
            const isThisRefundLoading =
              refundLoading && selectedPayment?.id === payment.id;

            return (
              <section
                key={index}
                className="
                  rounded-2xl border border-darkBlue/10 bg-white/50 backdrop-blur-sm
                  px-4 py-4 midTablet:px-6 midTablet:py-5
                  flex gap-4 flex-row items-center justify-between
                  shadow-[0_18px_45px_rgba(19,30,54,0.06)]
                "
              >
                {/* Infos paiement */}
                <div className="flex flex-col gap-1 text-sm text-darkBlue">
                  <div className="flex flex-wrap items-center gap-2 mb-1">
                    <h3 className="font-semibold text-base">
                      {t("payments.title", "Paiement")}
                    </h3>
                    <span
                      className={`inline-flex items-center rounded-full px-3 py-0.5 text-[11px] font-medium ${statusBadgeCls}`}
                    >
                      {statusLabel}
                    </span>
                  </div>

                  <p>
                    <span className="font-medium">
                      {t("payments.date")} :
                    </span>{" "}
                    {new Date(payment.date * 1000).toLocaleDateString()}
                  </p>

                  <p>
                    <span className="font-medium">
                      {t("payments.customer")} :
                    </span>{" "}
                    {payment.customer || "Non renseigné"}
                  </p>

                  <p>
                    <span className="font-medium">
                      {t("payments.grossAmount")} :
                    </span>{" "}
                    {payment.grossAmount} €
                  </p>

                  <p>
                    <span className="font-medium">
                      {t("payments.fees")} :
                    </span>{" "}
                    {payment.status !== "succeeded"
                      ? "-"
                      : `${payment.feeAmount} €`}
                  </p>

                  <p>
                    <span className="font-medium">
                      {t("payments.netAmount")} :
                    </span>{" "}
                    {payment.status !== "succeeded"
                      ? "-"
                      : `${payment.netAmount} €`}
                  </p>
                </div>

                {/* CTA remboursement */}
                <div className="flex items-center justify-end">
                  {payment.refunded ? (
                    <span
                      className="
                        inline-flex items-center gap-2 rounded-full
                        bg-darkBlue/5 px-4 py-1.5 text-xs tablet:text-sm font-medium text-darkBlue
                        border border-darkBlue/15
                      "
                    >
                      <CheckCircle2 className="size-4 text-[#1d4ed8]" />
                      {t("payments.refunded")}
                    </span>
                  ) : (
                    <button
                      className={`
                        inline-flex items-center justify-center gap-2 rounded-full
                        bg-red px-4 py-2 text-xs tablet:text-sm font-medium text-white
                        shadow-sm transition-all duration-150
                        ${
                          payment.status !== "succeeded"
                            ? "opacity-30 cursor-not-allowed"
                            : "hover:shadow-md hover:opacity-95"
                        }
                      `}
                      onClick={() => handleRefundClick(payment)}
                      disabled={
                        payment.status !== "succeeded" || refundLoading
                      }
                    >
                      {isThisRefundLoading ? (
                        <>
                          <Loader2 className="size-4 animate-spin" />
                          <span className="hidden mobile:inline">
                            {t("payments.refunding")}
                          </span>
                        </>
                      ) : (
                        <>
                          <RotateCcw className="size-4" />
                          <span className="hidden mobile:inline">
                            {t("payments.refund")}
                          </span>
                        </>
                      )}
                    </button>
                  )}
                </div>
              </section>
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
        <section className="rounded-2xl border border-darkBlue/10 bg-white/50 backdrop-blur-sm px-4 py-5">
          {props.dataLoading ? (
            <SimpleSkeletonComponent />
          ) : (
            <p className="text-sm text-darkBlue/70">{t("payments.empty")}</p>
          )}
        </section>
      )}

      {/* Modale de confirmation */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm px-4">
          <div className="max-w-[520px] w-full rounded-2xl border border-darkBlue/10 bg-white/95 px-6 py-5 shadow-[0_18px_45px_rgba(19,30,54,0.20)] flex flex-col gap-5">
            <div className="text-center">
              <h2 className="text-base tablet:text-lg font-semibold text-darkBlue">
                {t("payments.modale.title")}
              </h2>
              <div className="mt-3 h-px w-32 mx-auto bg-darkBlue/15" />
            </div>

            <p className="text-sm text-darkBlue/70 text-center">
              {t("payments.modale.infoFirst")}
            </p>

            <p className="text-sm text-darkBlue/70 text-center text-pretty">
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
                {t("payments.modale.buttons.cancel")}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
