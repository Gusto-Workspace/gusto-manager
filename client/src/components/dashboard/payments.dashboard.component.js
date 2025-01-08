import { useState } from "react";

// AXIOS
import axios from "axios";

// I18N
import { useTranslation } from "next-i18next";

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

  return (
    <div className="flex flex-col gap-4">
      {props?.payments?.length > 0 ? (
        <>
          {props.payments.map((payment, index) => (
            <div
              key={index}
              className="bg-white drop-shadow-sm flex items-center justify-between p-4 rounded-lg"
            >
              <div className="flex flex-col">
                <p className="font-medium">
                  <strong>{t("payments.date")} :</strong>{" "}
                  {new Date(payment.date * 1000).toLocaleDateString()}
                </p>
                <p>
                  <strong>{t("payments.customer")} :</strong>{" "}
                  {payment.customer || "Non renseigné"}
                </p>
                <p>
                  <strong>{t("payments.grossAmount")} :</strong>{" "}
                  {payment.grossAmount} €
                </p>
                <p>
                  <strong>{t("payments.fees")} : </strong>
                  {payment.status !== "succeeded" ? "-" : payment.feeAmount} €
                </p>
                <p>
                  <strong>{t("payments.netAmount")} :</strong>{" "}
                  {payment.status !== "succeeded" ? "-" : payment.netAmount} €
                </p>
                <p>
                  <strong>{t("payments.status.title")} : </strong>
                  {payment.refunded
                    ? t("payments.refunded")
                    : (() => {
                        switch (payment.status) {
                          case "succeeded":
                            return t("payments.status.succeeded");
                          case "pending":
                            return t("payments.status.pending");
                          case "failed":
                            return t("payments.status.failed");
                          case "canceled":
                            return t("payments.status.canceled");
                          default:
                            return t("payments.status.unknown");
                        }
                      })()}
                </p>
              </div>

              {payment.refunded ? (
                <p className="bg-blue text-white py-1 px-3 rounded-lg opacity-35">
                  {t("payments.refunded")}
                </p>
              ) : (
                <button
                  className={`bg-red text-white py-1 px-3 rounded-lg ${
                    payment.status !== "succeeded" && "hidden"
                  }`}
                  onClick={() => handleRefundClick(payment)}
                  disabled={payment.status !== "succeeded" || refundLoading}
                >
                  {refundLoading && selectedPayment?.id === payment.id
                    ? t("payments.refunding")
                    : t("payments.refund")}
                </button>
              )}
            </div>
          ))}

          {props.hasMorePayments && (
            <button
              className="bg-blue text-white py-2 px-4 rounded-lg w-fit self-center"
              onClick={() => props.onLoadMore("payments")}
              disabled={props.dataLoading}
            >
              {props.dataLoading
                ? t("payments.loading")
                : t("payments.loadingMore")}
            </button>
          )}
        </>
      ) : (
        <p className="bg-white p-6 rounded-lg drop-shadow-sm">
          {t("payments.empty")}
        </p>
      )}

      {/* Modale de confirmation */}
      {isModalOpen && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white p-6 rounded-lg shadow-lg max-w-[550px] mx-6 flex flex-col gap-6">
            <p className="text-xl font-semibold mx-auto flex flex-col gap-4">
              {t("payments.modale.title")}
              <span className="w-[200px] h-[1px] mx-auto bg-black" />
            </p>

            <p className="text-md text-center">
              {t("payments.modale.infoFirst")}
            </p>

            <p className="text-md mb-2 text-center">
              {t("payments.modale.infoSecond")}
            </p>
            <div className="flex justify-center gap-2">
              <button
                onClick={handleConfirmRefund}
                disabled={refundLoading}
                className="bg-blue text-white px-4 py-2 rounded-lg"
              >
                {refundLoading
                  ? t("payments.modale.buttons.loading")
                  : t("payments.modale.buttons.confirm")}
              </button>
              <button
                onClick={handleCancelRefund}
                className="bg-red text-white px-4 py-2 rounded-lg"
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
