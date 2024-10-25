import { useContext } from "react";

// AXIOS
import axios from "axios";

// CONTEXT
import { GlobalContext } from "@/contexts/global.context";

// I18N
import { useTranslation } from "next-i18next";
import { GiftSvg } from "../_shared/_svgs/gift.svg";

export default function PurchasesGiftListComponent(props) {
  const { t } = useTranslation("gifts");
  const { restaurantContext } = useContext(GlobalContext);

  const purchasesByStatus = {
    Valid: [],
    Used: [],
    Expired: [],
  };

  const statusTranslations = {
    Valid: t("labels.valid"),
    Used: t("labels.used"),
    Expired: t("labels.expired"),
  };

  props?.purchasesGiftCards?.forEach((purchase) => {
    const { status } = purchase;
    if (purchasesByStatus[status]) {
      purchasesByStatus[status].push(purchase);
    }
  });

  function markAsUsed(purchaseId) {
    axios
      .put(
        `${process.env.NEXT_PUBLIC_API_URL}/restaurants/${restaurantContext?.restaurantData?._id}/purchases/${purchaseId}/use`
      )
      .then((response) => {
        restaurantContext.setRestaurantData(response.data.restaurant);
      })
      .catch((error) => {
        console.error(
          "Erreur lors de la mise à jour de la carte cadeau :",
          error
        );
      });
  }

  return (
    <div>
      <div className="pl-2 flex gap-2 items-center">
        <GiftSvg width={30} height={30} fillColor="#131E3690" />

        <h1 className="pl-2 text-2xl">{t("titles.second")}</h1>
      </div>

      <div className="flex flex-col gap-6">
        {Object.entries(purchasesByStatus).map(([status, purchases]) => (
          <div key={status} className="flex flex-col gap-4">
            <h2 className="text-lg font-semibold text-center uppercase">
              {statusTranslations[status]}
            </h2>

            {purchases.length > 0 ? (
              <ul className="flex flex-col gap-2">
                {purchases.map((purchase) => (
                  <li
                    key={purchase._id}
                    className="bg-white p-4 rounded-lg drop-shadow-sm flex justify-between items-center"
                  >
                    <div>
                      <p>
                        {t("labels.amount")}: {purchase.value}€
                      </p>

                      <p>
                        {t("labels.owner")}: {purchase.beneficiaryFirstName}{" "}
                        {purchase.beneficiaryLastName}
                      </p>

                      <p>
                        {t("labels.code")}: {purchase.purchaseCode}
                      </p>

                      {status === "Valid" && (
                        <p>
                          {t("labels.valididy")}:{" "}
                          {new Date(purchase.validUntil).toLocaleDateString(
                            "fr-FR"
                          )}
                        </p>
                      )}
                    </div>

                    {status === "Valid" && (
                      <button
                        className="mt-2 px-4 py-2 bg-blue text-white rounded hover:bg-blue-600"
                        onClick={() => markAsUsed(purchase._id)}
                      >
                        {t("buttons.usedCard")}
                      </button>
                    )}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="italic">{t("labels.emptyCard")}</p>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
