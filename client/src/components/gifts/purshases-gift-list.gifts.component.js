import axios from "axios";
import { useContext } from "react";
import { GlobalContext } from "@/contexts/global.context";

export default function PurchasesGiftListComponent({ purchases }) {
  const { restaurantContext } = useContext(GlobalContext);

  async function handleMarkAsUsed() {
   
  }

  // Filtrer les achats par statut
  const validPurchases = purchases?.filter(
    (purchase) => purchase.status === "Valid"
  );
  const usedPurchases = purchases?.filter(
    (purchase) => purchase.status === "Used"
  );
  const expiredPurchases = purchases?.filter(
    (purchase) => purchase.status === "Expired"
  );

  // Fonction pour afficher une catégorie d'achats
  const renderPurchaseList = (title, items, bgColor, showButton = false) => (
    <div>
      <h2 className="text-lg font-semibold mb-4">{title}</h2>
      <ul className="space-y-2">
        {items?.length > 0 ? (
          items.map((purchase) => (
            <li
              key={purchase._id}
              className={`${bgColor} p-4 rounded-lg shadow`}
            >
              <p>Code : {purchase.purchaseCode}</p>
              <p>
                {title === "Expirées"
                  ? `Expiré le : ${new Date(purchase.validUntil).toLocaleDateString()}`
                  : `Valable jusqu'au : ${new Date(purchase.validUntil).toLocaleDateString()}`}
              </p>
              {showButton && (
                <button
                  onClick={() => handleMarkAsUsed('used')}
                  className="mt-2 px-4 py-2 bg-violet text-white rounded-lg"
                >
                  Carte cadeau utilisée
                </button>
              )}
            </li>
          ))
        ) : (
          <p>Aucune carte cadeau {title.toLowerCase()}.</p>
        )}
      </ul>
    </div>
  );

  return (
    <div className="flex flex-col gap-6">
      {renderPurchaseList("Valides", validPurchases, "bg-green", true)}
      {renderPurchaseList("Utilisées", usedPurchases, "bg-blue")}
      {renderPurchaseList("Expirées", expiredPurchases, "bg-red")}
    </div>
  );
}
