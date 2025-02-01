import { useContext, useState } from "react";

// AXIOS
import axios from "axios";

// CONTEXT
import { GlobalContext } from "@/contexts/global.context";

// I18N
import { useTranslation } from "next-i18next";

// SVG
import { GiftSvg } from "../_shared/_svgs/gift.svg";
import { TrashSvg } from "../_shared/_svgs/trash.svg";

export default function PurchasesGiftListComponent(props) {
  const { t } = useTranslation("gifts");
  const { restaurantContext } = useContext(GlobalContext);
  const [searchTerm, setSearchTerm] = useState("");
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedPurchase, setSelectedPurchase] = useState(null);
  const [actionType, setActionType] = useState("");

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

  function handleActionConfirm() {
    if (!selectedPurchase || !actionType) return;

    const url =
      actionType === "Used"
        ? `${process.env.NEXT_PUBLIC_API_URL}/restaurants/${restaurantContext?.restaurantData?._id}/purchases/${selectedPurchase._id}/use`
        : actionType === "Valid"
          ? `${process.env.NEXT_PUBLIC_API_URL}/restaurants/${restaurantContext?.restaurantData?._id}/purchases/${selectedPurchase._id}/validate`
          : `${process.env.NEXT_PUBLIC_API_URL}/restaurants/${restaurantContext?.restaurantData?._id}/purchases/${selectedPurchase._id}/delete`;

    const method = actionType === "Delete" ? "delete" : "put";

    axios[method](url)
      .then((response) => {
        if (actionType !== "Delete") {
          restaurantContext.setRestaurantData(response.data.restaurant);
        } else {
          restaurantContext.setRestaurantData(response.data.restaurant);
        }
        setIsModalOpen(false);
      })
      .catch((error) => {
        console.error(
          "Erreur lors de la mise à jour de la carte cadeau :",
          error
        );
        setIsModalOpen(false);
      });
  }

  function handleDeleteGiftCard(purchase) {
    setSelectedPurchase(purchase);
    setActionType("Delete");
    setIsModalOpen(true);
  }

  function handleActionClick(purchase, type) {
    setSelectedPurchase(purchase);
    setActionType(type);
    setIsModalOpen(true);
  }

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
          placeholder="Rechercher un code, un bénéficiaire, un email ..."
          value={searchTerm}
          onChange={handleSearchChange}
          className="p-2 border border-[#131E3690] rounded-lg midTablet:w-[350px]"
        />
      </div>

      <div className="flex flex-col gap-12">
        {Object.entries(purchasesByStatus).map(([status, purchases]) => {
          const filteredPurchases = purchases.filter((purchase) => {
            const term = searchTerm.toLowerCase();
            return (
              purchase?.purchaseCode?.toLowerCase().includes(term) ||
              purchase?.beneficiaryFirstName?.toLowerCase().includes(term) ||
              purchase?.beneficiaryLastName?.toLowerCase().includes(term) ||
              purchase?.sender?.toLowerCase().includes(term) ||
              purchase?.sendEmail?.toLowerCase().includes(term)
            );
          });

          return (
            <div key={status} className="flex flex-col gap-4">
              <div className="relative">
                <h2 className="relative flex gap-2 items-center text-lg font-semibold w-fit px-6 mx-auto text-center uppercase bg-lightGrey z-20">
                  {statusTranslations[status]}{" "}
                  <span className="text-base opacity-50">
                    ({filteredPurchases.length})
                  </span>
                </h2>

                <hr className="bg-darkBlue absolute h-[1px] w-full midTablet:w-[350px] left-1/2 -translate-x-1/2 top-1/2 -translate-y-1/2 z-10" />
              </div>

              {filteredPurchases.length > 0 ? (
                <ul className="flex flex-col gap-2 max-h-[570px] overflow-y-auto">
                  {filteredPurchases.map((purchase) => (
                    <li
                      key={purchase._id}
                      className="relative bg-white p-4 rounded-lg drop-shadow-sm flex flex-col gap-4 midTablet:flex-row text-center midTablet:text-start justify-between item-start midTablet:items-end"
                    >
                      <button
                        className="group absolute bottom-4 mobile:top-4 right-4 px-2 py-2 rounded h-fit bg-white drop-shadow-md"
                        onClick={() => handleDeleteGiftCard(purchase)}
                      >
                        <TrashSvg
                          height={28}
                          width={28}
                          strokeColor="#FF7664"
                          className="group-hover:rotate-12 transition-all duration-200"
                        />
                      </button>

                      <div className="flex flex-col gap-2">
                        <p>
                          {t("labels.amount")} : {purchase.value}€
                        </p>

                        {purchase.description && (
                          <p>
                            {t("labels.description")} : {purchase.description}
                          </p>
                        )}

                        <p>
                          {t("labels.owner")} : {purchase.beneficiaryFirstName}{" "}
                          {purchase.beneficiaryLastName}
                        </p>

                        <p>
                          {t("labels.code")} : {purchase.purchaseCode}
                        </p>

                        <p>
                          {t("labels.sender")} : {purchase.sender}{" "}
                          {purchase.sendEmail && (
                            <span className="text-sm opacity-30 italic">
                              ({purchase.sendEmail})
                            </span>
                          )}
                        </p>

                        <p>
                          {t("labels.orderedDay")} :{" "}
                          {new Date(purchase.created_at).toLocaleDateString(
                            "fr-FR"
                          )}
                        </p>

                        {status === "Valid" && (
                          <p>
                            {t("labels.valididy")}:{" "}
                            {new Date(purchase.validUntil).toLocaleDateString(
                              "fr-FR"
                            )}
                          </p>
                        )}

                        {status === "Used" && (
                          <p>
                            {t("labels.useDate")}:{" "}
                            {new Date(purchase.useDate).toLocaleDateString(
                              "fr-FR"
                            )}
                          </p>
                        )}
                      </div>

                      {(status === "Valid" || status === "Expired") && (
                        <button
                          className="mt-2 whitespace-nowrap px-4 py-2 bg-blue text-white rounded hover:bg-opacity-50 transition-all duration-200 w-fit mobile:mx-auto midTablet:mx-0"
                          onClick={() => handleActionClick(purchase, "Used")}
                        >
                          {t("buttons.usedCard")}
                        </button>
                      )}

                      {status === "Used" && (
                        <button
                          className="mt-2 px-4 py-2 bg-blue text-white rounded hover:bg-opacity-50 transition-all duration-200 w-fit mobile:mx-auto midTablet:mx-0"
                          onClick={() => handleActionClick(purchase, "Valid")}
                        >
                          {t("buttons.revalidateCard")}
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

      {isModalOpen && (
        <div className="fixed inset-0 flex items-center mx-6 justify-center z-[100]">
          <div
            onClick={() => setIsModalOpen(false)}
            className="fixed inset-0 bg-black bg-opacity-20"
          />

          <div className="bg-white mx-6 w-[500px] p-6 rounded-lg shadow-lg flex flex-col gap-6 z-10">
            <p className="text-xl font-semibold mx-auto flex flex-col gap-4 text-center text-pretty">
              {actionType === "Used"
                ? t("labels.confirmUse.title")
                : actionType === "Valid"
                  ? t("labels.confirmRevalidate.title")
                  : t("labels.confirmDelete.title")}
              <span className="w-[200px] h-[1px] mx-auto bg-black" />
            </p>

            <p className="text-md mb-2 text-center text-balance">
              {actionType === "Used"
                ? t("labels.confirmUse.text")
                : actionType === "Valid"
                  ? t("labels.confirmRevalidate.text")
                  : t("labels.confirmDelete.text")}
            </p>

            <div className="flex justify-center gap-4">
              <button
                className="px-4 py-2 bg-blue text-white rounded hover:bg-green-400"
                onClick={handleActionConfirm}
              >
                {t("buttons.confirm")}
              </button>

              <button
                className="px-4 py-2 bg-red text-white rounded hover:bg-red-400"
                onClick={() => setIsModalOpen(false)}
              >
                {t("buttons.cancel")}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
