import { useRouter } from "next/router";
import { useState, useContext, useEffect } from "react";

// REACT HOOK FORM
import { useForm } from "react-hook-form";

// AXIOS
import axios from "axios";

// CONTEXT
import { GlobalContext } from "@/contexts/global.context";

// I18N
import { useTranslation } from "next-i18next";

// SVG
import { GiftSvg } from "../_shared/_svgs/_index";

// COMPONENTS
import PurchasesGiftListComponent from "./purshases-gift-list.gifts.component";
import CardGiftsComponent from "./card.gifts.component";

export default function ListGiftsComponent(props) {
  const { t } = useTranslation("gifts");
  const { restaurantContext } = useContext(GlobalContext);
  const router = useRouter();
  const { locale } = router;
  const currencySymbol = locale === "fr" ? "€" : "$";
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingGift, setEditingGift] = useState(null);
  const [isDeleting, setIsDeleting] = useState(false);

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm();

  useEffect(() => {
    if (editingGift) {
      reset({ value: editingGift.value, description: editingGift.description });
    } else {
      reset({ value: null, description: null });
    }
  }, [editingGift, reset]);

  function handleEditClick(gift) {
    setEditingGift(gift);
    setIsModalOpen(true);
  }

  function handleDeleteClick(gift) {
    setEditingGift(gift);
    setIsDeleting(true);
    setIsModalOpen(true);
  }

  function onSubmit(data) {
    const apiUrl = editingGift
      ? `${process.env.NEXT_PUBLIC_API_URL}/restaurants/${restaurantContext?.restaurantData?._id}/gifts/${editingGift._id}`
      : `${process.env.NEXT_PUBLIC_API_URL}/restaurants/${restaurantContext?.restaurantData?._id}/gifts`;

    const method = isDeleting ? "delete" : editingGift ? "put" : "post";

    axios[method](apiUrl, isDeleting ? {} : data)
      .then((response) => {
        restaurantContext.setRestaurantData(response.data.restaurant);
        setIsModalOpen(false);
        reset();
        setEditingGift(null);
        setIsDeleting(false);
      })
      .catch((error) => {
        console.error("Error modifying, adding or deleting gift:", error);
      });
  }

  function handleVisibilityToggle(gift) {
    const updatedVisibility = !gift.visible;

    axios
      .put(
        `${process.env.NEXT_PUBLIC_API_URL}/restaurants/${restaurantContext?.restaurantData?._id}/gifts/${gift._id}`,
        { visible: updatedVisibility }
      )
      .then((response) => {
        restaurantContext.setRestaurantData(response.data.restaurant);
      })
      .catch((error) => {
        console.error("Error updating gift visibility:", error);
      });
  }

  return (
    <section className="flex flex-col gap-6">
      <hr className="opacity-20" />

      <div className="flex justify-between">
        <div className="flex gap-2 items-center">
          <GiftSvg width={30} height={30} fillColor="#131E3690" />

          <h1 className="pl-2 text-2xl">{t("titles.main")}</h1>
        </div>

        <button
          onClick={() => {
            setEditingGift(null);
            setIsDeleting(false);
            setIsModalOpen(true);
          }}
          className="bg-blue px-6 py-2 rounded-lg text-white cursor-pointer"
        >
          {t("buttons.addGift")}
        </button>
      </div>

      <div className="mb-12">
        <CardGiftsComponent
          titleKey="titles.amountCard"
          filterCondition={(giftCard) => !giftCard.description}
          handleEditClick={handleEditClick}
          handleDeleteClick={handleDeleteClick}
          handleVisibilityToggle={handleVisibilityToggle}
          currencySymbol={currencySymbol}
        />

        <CardGiftsComponent
          titleKey="titles.menuCard"
          filterCondition={(giftCard) => giftCard.description}
          handleEditClick={handleEditClick}
          handleDeleteClick={handleDeleteClick}
          handleVisibilityToggle={handleVisibilityToggle}
          currencySymbol={currencySymbol}
        />
      </div>
      <PurchasesGiftListComponent
        purchasesGiftCards={
          restaurantContext?.restaurantData?.purchasesGiftCards
        }
      />

      {/* MODALES */}

      {isModalOpen && (
        <div className="fixed inset-0 flex items-center justify-center z-[100]">
          <div
            onClick={() => {
              setIsModalOpen(false);
              setEditingGift(null);
              setIsDeleting(false);
            }}
            className="fixed inset-0 bg-black bg-opacity-20"
          />

          <div className="bg-white p-6 rounded-lg shadow-lg w-[450px] z-10">
            <h2 className="text-xl font-semibold mb-6 text-center">
              {isDeleting
                ? t("buttons.deleteGift")
                : editingGift
                  ? t("buttons.editGift")
                  : t("buttons.addGift")}
            </h2>

            <form
              onSubmit={handleSubmit(onSubmit)}
              className="flex flex-col gap-6"
            >
              <div className="flex flex-col gap-2">
                <label className="block font-semibold">
                  <span>{t("form.labels.description")}</span>
                  <span className="text-xs opacity-50 ml-2 italic">
                    {t("form.labels.optional")}
                  </span>
                </label>

                <textarea
                  className={`border p-2 rounded-lg w-full resize-none  ${isDeleting ? "opacity-50 cursor-not-allowed" : ""}`}
                  {...register("description", { required: false })}
                  disabled={isDeleting}
                />

                <label className="block font-semibold">
                  {t("form.labels.value")}
                </label>

                <div className="flex items-center">
                  <span
                    className={`px-3 py-2 rounded-l-lg ${isDeleting ? "opacity-50 cursor-not-allowed" : ""}  ${errors.value ? " border border-r-0 border-t-red border-l-red border-b-red" : " border-t border-l border-b"}`}
                  >
                    {currencySymbol}
                  </span>

                  <input
                    type="number"
                    placeholder="-"
                    step="0.01"
                    defaultValue={editingGift?.value || ""}
                    disabled={isDeleting}
                    {...register("value", { required: !isDeleting })}
                    className={`border p-2 rounded-r-lg w-full ${
                      errors.value ? "border-red" : ""
                    } ${isDeleting ? "opacity-50 cursor-not-allowed" : ""}`}
                  />
                </div>
              </div>

              <div className="flex gap-4">
                <button
                  type="submit"
                  className="px-4 py-2 rounded-lg bg-blue text-white"
                >
                  {isDeleting ? t("buttons.confirm") : t("buttons.save")}
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setIsModalOpen(false);
                    setEditingGift(null);
                    setIsDeleting(false);
                  }}
                  className="px-4 py-2 rounded-lg text-white bg-red"
                >
                  {t("buttons.cancel")}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </section>
  );
}
