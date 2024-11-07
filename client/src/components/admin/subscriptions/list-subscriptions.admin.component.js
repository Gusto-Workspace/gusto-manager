import { useRouter } from "next/router";
import { useEffect, useState } from "react";
import axios from "axios";

// I18N
import { useTranslation } from "next-i18next";

export default function ListSubscriptionsAdminComponent() {
  const { t } = useTranslation("admin");
  const router = useRouter();
  const [subscriptions, setSubscriptions] = useState([]);
  const [message, setMessage] = useState("");
  const [invoices, setInvoices] = useState({}); // Stocke les factures par abonnement

  function handleAddClick() {
    router.push(`/admin/subscriptions/add`);
  }

  useEffect(() => {
    // Récupérer la liste de tous les abonnements
    axios
      .get(`${process.env.NEXT_PUBLIC_API_URL}/admin/all-subscriptions`)
      .then((response) => {
        setSubscriptions(response.data.subscriptions);
      })
      .catch((error) =>
        console.error("Erreur lors de la récupération:", error)
      );
  }, []);

  const fetchInvoices = (subscriptionId) => {
    axios
      .get(
        `${process.env.NEXT_PUBLIC_API_URL}/admin/subscription-invoices/${subscriptionId}`
      )
      .then((response) => {
        setInvoices((prevInvoices) => ({
          ...prevInvoices,
          [subscriptionId]: response.data.invoices,
        }));
      })
      .catch((error) =>
        console.error("Erreur lors de la récupération des factures :", error)
      );
  };

  const handleSwitchToAutomatic = (subscriptionId) => {
    axios
      .post(`${process.env.NEXT_PUBLIC_API_URL}/admin/switch-to-automatic`, {
        subscriptionId,
      })
      .then((response) => {
        setMessage(response.data.message);
        // Mettre à jour la liste des abonnements
        setSubscriptions((prevSubscriptions) =>
          prevSubscriptions.map((subscription) =>
            subscription.id === subscriptionId
              ? { ...subscription, collection_method: "charge_automatically" }
              : subscription
          )
        );
      })
      .catch((error) => {
        console.error("Erreur lors du passage en mode automatique:", error);
        setMessage("Erreur lors du passage en mode automatique.");
      });
  };

  return (
    <div className="flex flex-col gap-6">
      <div className="flex justify-between">
        <div className="flex gap-2 items-center">
          <h1 className="pl-2 text-2xl flex items-center gap-2">
            <span
              className="cursor-pointer hover:underline"
              onClick={() => router.push("/subscriptions")}
            >
              {t("titles.main")}
            </span>
          </h1>
        </div>

        <button
          onClick={handleAddClick}
          className="bg-blue px-6 py-2 rounded-lg text-white cursor-pointer"
        >
          {t("buttons.add")}
        </button>
      </div>

      {/* Afficher les abonnements */}
      <div className="mt-4">
        <h2>{t("titles.subscriptionsList")}</h2>
        {message && <div className="message text-green-500">{message}</div>}
        <ul className="list-disc pl-5">
          {subscriptions.map((subscription) => (
            <li key={subscription.id} className="border p-4 rounded-lg mb-4">
              <div>Abonnement ID : {subscription.id}</div>
              <div>
                Client : {subscription.latest_invoice.customer_name}{" "}
                <span className="text-sm italic opacity-50">
                  ({subscription.latest_invoice.customer_email})
                </span>
              </div>
              <div>Statut de l'abonnement : {subscription.status}</div>

              {/* Mode de paiement : automatique ou manuel */}
              <div>
                Mode de paiement :{" "}
                {subscription.collection_method === "charge_automatically"
                  ? "Automatique"
                  : "Manuel"}
              </div>

              {subscription.latest_invoice && (
                <>
                  <div>Latest Facture ID : {subscription.latest_invoice.id}</div>

                  {/* Statut de la facture */}
                  <div>
                    Statut de la facture :{" "}
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
                        ? "Payée"
                        : subscription.latest_invoice.status === "open"
                          ? "Envoyée (En attente de paiement)"
                          : subscription.latest_invoice.status === "draft"
                            ? "Brouillon"
                            : "Non payée"}
                    </span>
                  </div>

                  {/* Bouton pour passer en mode automatique */}
                  {subscription.latest_invoice.status === "paid" &&
                    subscription.collection_method === "send_invoice" && (
                      <button
                        onClick={() => handleSwitchToAutomatic(subscription.id)}
                        className="bg-blue text-white px-4 py-2 mt-2 rounded-lg hover:bg-green-600"
                      >
                        Passer en mode paiement automatique
                      </button>
                    )}

                  {/* Bouton pour afficher les factures */}
                  <button
                    onClick={() => fetchInvoices(subscription.id)}
                    className="bg-blue text-white px-4 py-2 mt-2 rounded-lg hover:bg-blue-600"
                  >
                    Afficher les factures
                  </button>

                  {/* Affichage des factures */}
                  {invoices[subscription.id] && (
                    <div className="mt-2">
                      <h3>Factures :</h3>
                      <ul>
                        {invoices[subscription.id].map((invoice) => (
                          <li
                            key={invoice.id}
                            className="border p-2 rounded-lg"
                          >
                            <div>Facture ID : {invoice.id}</div>
                            <div>
                              Statut :{" "}
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
                                  ? "Payée"
                                  : invoice.status === "open"
                                    ? "Envoyée (En attente de paiement)"
                                    : invoice.status === "draft"
                                      ? "Brouillon"
                                      : "Non payée"}
                              </span>
                            </div>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </>
              )}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
