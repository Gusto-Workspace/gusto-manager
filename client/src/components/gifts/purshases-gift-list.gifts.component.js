import { useContext, useState } from "react";

// AXIOS
import axios from "axios";

// CONTEXT
import { GlobalContext } from "@/contexts/global.context";

// I18N
import { useTranslation } from "next-i18next";

// SVG
import { GiftSvg } from "../_shared/_svgs/gift.svg";

export default function PurchasesGiftListComponent(props) {
  const { t } = useTranslation("gifts");
  const { restaurantContext } = useContext(GlobalContext);
  const [searchTerm, setSearchTerm] = useState("");

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

  // Function to handle search input change
  function handleSearchChange(event) {
    setSearchTerm(event.target.value);
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-4">
        <div className="flex gap-2 items-center">
          <GiftSvg width={30} height={30} fillColor="#131E3690" />

          <h1 className="pl-2 text-2xl">{t("titles.second")}</h1>
        </div>

        <input
          type="text"
          placeholder="Rechercher un code..."
          value={searchTerm}
          onChange={handleSearchChange}
          className="p-2 border border-[#131E3690] rounded-lg w-fit"
        />
      </div>

      <div className="flex flex-col gap-12">
        {Object.entries(purchasesByStatus).map(([status, purchases]) => {
          const filteredPurchases = purchases.filter((purchase) =>
            purchase.purchaseCode
              .toLowerCase()
              .includes(searchTerm.toLowerCase())
          );

          return (
            <div key={status} className="flex flex-col gap-4">
              <div className="relative">
                <h2 className="relative flex gap-2 items-center text-lg font-semibold w-fit px-6 mx-auto text-center uppercase bg-lightGrey z-20">
                  {statusTranslations[status]}{" "}
                  <span className="text-base opacity-50">
                    ({filteredPurchases.length})
                  </span>
                </h2>
                <hr className="bg-darkBlue absolute h-[1px] w-[350px] left-1/2 -translate-x-1/2 top-1/2 -translate-y-1/2 z-10" />
              </div>

              {filteredPurchases.length > 0 ? (
                <ul className="flex flex-col gap-2 max-h-[340px] overflow-y-auto">
                  {filteredPurchases.map((purchase) => (
                    <li
                      key={purchase._id}
                      className="bg-white p-4 rounded-lg drop-shadow-sm flex justify-between items-center"
                    >
                      <div className="flex flex-col gap-2">
                        <p>
                          {t("labels.amount")}: {purchase.value}€
                        </p>

                        {purchase.description && (
                          <p>
                            {t("labels.description")}: {purchase.description}
                          </p>
                        )}
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
                <div className="p-6 bg-white drop-shadow-sm rounded-lg">
                  <p className="italic">{t("labels.emptyCard")}</p>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
