import { useRouter } from "next/router";
import { useState } from "react";

// AXIOS
import axios from "axios";

// I18N
import { useTranslation } from "next-i18next";

// COMPONENTS
import SimpleSkeletonComponent from "@/components/_shared/skeleton/simple-skeleton.component";
import DoubleSkeletonComonent from "@/components/_shared/skeleton/double-skeleton.component";

export default function ListSubscriptionsAdminComponent(props) {
  const { t } = useTranslation("admin");
  const router = useRouter();

  const [invoices, setInvoices] = useState({});
  const [showInvoices, setShowInvoices] = useState({});

  function handleAddClick() {
    router.push(`/admin/subscriptions/add`);
  }

  function fetchInvoices(subscriptionId) {
    axios
      .get(
        `${process.env.NEXT_PUBLIC_API_URL}/admin/subscription-invoices/${subscriptionId}`
      )
      .then((response) => {
        setInvoices((prevInvoices) => ({
          ...prevInvoices,
          [subscriptionId]: response.data.invoices,
        }));
        setShowInvoices((prevShowInvoices) => ({
          ...prevShowInvoices,
          [subscriptionId]: !prevShowInvoices[subscriptionId],
        }));
      })
      .catch((error) =>
        console.error("Erreur lors de la récupération des factures :", error)
      );
  }

  return (
    <div>
      <div className="flex justify-between">
        <div className="flex gap-2 items-center">
          <h1 className="text-3xl flex items-center gap-2">
            <span
              className="cursor-pointer hover:underline"
              onClick={() => router.push("/subscriptions")}
            >
              {t("nav.subscriptions")}
            </span>
          </h1>
        </div>

        <button
          onClick={handleAddClick}
          className="bg-blue px-6 py-2 rounded-lg text-white cursor-pointer"
        >
          {t("subscriptions.list.add")}
        </button>
      </div>

      <div className="mt-4">
        {props?.loading ? (
          <div className="flex flex-col gap-4">
            {Array.from({ length: 3 }, (_, i) => (
              <div
                key={i}
                className="bg-white p-6 drop-shadow-sm flex flex-col gap-2 rounded-lg"
              >
                <DoubleSkeletonComonent justify="justify-start" />
                <SimpleSkeletonComponent />
                <SimpleSkeletonComponent />
              </div>
            ))}
          </div>
        ) : (
          <ul className="flex flex-col gap-4">
            {props?.ownersSubscriptionsList?.map((subscription) => (
              <li
                key={subscription.id}
                className="bg-white p-6 rounded-lg drop-shadow-sm"
              >
                <div>
                  {t("subscriptions.list.type")} : {subscription.productName} -{" "}
                  {subscription.productAmount} {subscription.productCurrency}
                </div>

                <div>
                  {t("subscriptions.list.owner")} :{" "}
                  {subscription.latest_invoice.customer_name}{" "}
                  <span className="text-sm italic opacity-50">
                    ({subscription.latest_invoice.customer_email})
                  </span>
                </div>

                <div>
                  {t("subscriptions.list.restaurant")} :{" "}
                  {subscription.restaurantName} (ID :{" "}
                  {subscription.restaurantId})
                </div>

                {/* Mode de paiement : automatique ou manuel */}
                <div>
                  {t("subscriptions.list.payment")} :{" "}
                  {subscription.collection_method === "charge_automatically"
                    ? t("subscriptions.list.automaticMethod")
                    : t("subscriptions.list.manualMethod")}
                </div>

                {subscription.latest_invoice && (
                  <>
                    <div>
                      {t("subscriptions.list.lastInvoice")} :{" "}
                      {new Date(
                        subscription.latest_invoice.created * 1000
                      ).toLocaleDateString()}
                    </div>

                    {/* Statut de la facture */}
                    <div>
                      {t("subscriptions.list.invoiceStatus")} :{" "}
                      <span
                        className={
                          subscription.latest_invoice.status === "paid"
                            ? "text-green"
                            : subscription.latest_invoice.status === "open"
                              ? "text-violet"
                              : subscription.latest_invoice.status === "draft"
                                ? "text-lightGrey"
                                : "text-red"
                        }
                      >
                        {subscription.latest_invoice.status === "paid"
                          ? t("subscriptions.list.paid")
                          : subscription.latest_invoice.status === "open"
                            ? t("subscriptions.list.sent")
                            : subscription.latest_invoice.status === "draft"
                              ? t("subscriptions.list.draft")
                              : t("subscriptions.list.unpaid")}
                      </span>
                    </div>

                    {/* Bouton pour afficher/masquer les factures */}
                    <button
                      onClick={() => fetchInvoices(subscription.id)}
                      className="bg-blue text-white px-4 py-2 mt-2 rounded-lg hover:bg-blue-600"
                    >
                      {showInvoices[subscription.id]
                        ? t("subscriptions.list.hideInvoices")
                        : t("subscriptions.list.showInvoices")}
                    </button>

                    {/* Affichage des factures */}
                    {showInvoices[subscription.id] &&
                      invoices[subscription.id] && (
                        <div className="mt-6">
                          <ul className="flex flex-col gap-4">
                            {invoices[subscription.id].map((invoice) => {
                              return (
                                <li
                                  key={invoice.id}
                                  className="border p-2 rounded-lg flex justify-between items-center w-full"
                                >
                                  <div>
                                    <div>
                                      {t("subscriptions.list.date")} :{" "}
                                      {new Date(
                                        invoice.created * 1000
                                      ).toLocaleDateString()}
                                    </div>

                                    <div>
                                      {t("subscriptions.list.amount")} :{" "}
                                      {invoice.amount_due / 100}{" "}
                                      {invoice.currency.toUpperCase()}
                                    </div>

                                    <div>
                                      {t("subscriptions.list.status")} :{" "}
                                      <span
                                        className={
                                          invoice.status === "paid"
                                            ? "text-green"
                                            : invoice.status === "open"
                                              ? "text-violet"
                                              : invoice.status === "draft"
                                                ? "text-lightGrey"
                                                : "text-red"
                                        }
                                      >
                                        {invoice.status === "paid"
                                          ? t("subscriptions.list.paid")
                                          : invoice.status === "open"
                                            ? t("subscriptions.list.sent")
                                            : invoice.status === "draft"
                                              ? t("subscriptions.list.draft")
                                              : t("subscriptions.list.unpaid")}
                                      </span>
                                    </div>
                                  </div>

                                  <a
                                    href={invoice.invoice_pdf}
                                    download
                                    rel="noopener noreferrer"
                                    className="text-blue px-4 py-2 rounded-lg hover:bg-blue-600 transition"
                                  >
                                    Télécharger
                                  </a>
                                </li>
                              );
                            })}
                          </ul>
                        </div>
                      )}
                  </>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
