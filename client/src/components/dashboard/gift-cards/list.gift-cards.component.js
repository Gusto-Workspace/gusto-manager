import { useRouter } from "next/router";
import { useState, useContext, useEffect, useId } from "react";

// REACT HOOK FORM
import { useForm } from "react-hook-form";

// AXIOS
import axios from "axios";

// CONTEXT
import { GlobalContext } from "@/contexts/global.context";

// I18N
import { useTranslation } from "next-i18next";

// SVG
import { GiftSvg } from "../../_shared/_svgs/_index";
import { Plus } from "lucide-react";

// DND
import {
  DndContext,
  closestCenter,
  MouseSensor,
  TouchSensor,
  useSensor,
  useSensors,
} from "@dnd-kit/core";

import { arrayMove, SortableContext } from "@dnd-kit/sortable";

import {
  restrictToFirstScrollableAncestor,
  restrictToWindowEdges,
} from "@dnd-kit/modifiers";

// COMPONENTS
import PurchasesGiftListComponent from "./purshases-gift-list.gift-cards.component";
import CardGiftsComponent from "./card.gift-cards.component";

export default function ListGiftsComponent(props) {
  const { t } = useTranslation("gifts");
  const { restaurantContext } = useContext(GlobalContext);
  const router = useRouter();
  const { locale } = router;
  const currencySymbol = locale === "fr" ? "€" : "$";

  // ----- Initialisation giftCards depuis le contexte pour éviter le flash -----
  const initialCards = restaurantContext?.restaurantData?.giftCards || [];

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingGift, setEditingGift] = useState(null);
  const [isDeleting, setIsDeleting] = useState(false);

  const [giftCardsValue, setGiftCardsValue] = useState(() =>
    initialCards.filter((giftCard) => !giftCard.description),
  );
  const [giftCardsDescription, setGiftCardsDescription] = useState(() =>
    initialCards.filter((giftCard) => giftCard.description),
  );

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm();

  // Styles communs
  const btnPrimary =
    "inline-flex items-center justify-center rounded-xl bg-blue px-5 py-2.5 text-sm font-medium text-white shadow hover:bg-blue/90 transition disabled:opacity-60 disabled:cursor-not-allowed gap-2";
  const btnSecondary =
    "inline-flex items-center justify-center rounded-xl bg-red px-5 py-2.5 text-sm font-medium text-white shadow hover:bg-red/90 transition disabled:opacity-60 disabled:cursor-not-allowed";
  const sectionChipWrap = "flex items-center gap-3 my-6 max-w-4xl mx-auto px-2";
  const sectionChipLine = "h-px flex-1 bg-darkBlue/10";
  const sectionChipLabel =
    "inline-flex items-center justify-center rounded-full border border-darkBlue/10 bg-white/90 px-6 py-1.5 text-[11px] font-semibold tracking-[0.18em] text-darkBlue uppercase shadow-sm";
  const modalCardCls =
    "relative w-full max-w-[460px] rounded-2xl border border-darkBlue/10 bg-white/95 px-5 py-6 tablet:px-7 tablet:py-7 shadow-[0_22px_55px_rgba(19,30,54,0.18)] flex flex-col gap-5";
  const fieldWrap = "flex flex-col gap-1.5";
  const labelCls =
    "text-xs font-semibold uppercase tracking-[0.08em] text-darkBlue/70";
  const inputCls =
    "h-10 w-full rounded-xl border border-darkBlue/15 bg-white px-3 text-sm outline-none transition placeholder:text-darkBlue/40 focus:border-blue/60 focus:ring-1 focus:ring-blue/30";
  const textAreaCls =
    "w-full rounded-xl border border-darkBlue/15 bg-white px-3 py-2 text-sm outline-none transition placeholder:text-darkBlue/40 resize-none min-h-[80px] focus:border-blue/60 focus:ring-1 focus:ring-blue/30";
  const errorTextCls = "text-[11px] text-red mt-0.5";

  // ID DnD
  const id = useId();

  // Capteurs souris + touch
  const mouseSensor = useSensor(MouseSensor);
  const touchSensor = useSensor(TouchSensor);
  const sensors = useSensors(mouseSensor, touchSensor);

  // Met à jour les listes quand restaurantData change (après fetch ou modif)
  useEffect(() => {
    const cards = restaurantContext?.restaurantData?.giftCards || [];
    setGiftCardsValue(cards.filter((giftCard) => !giftCard.description));
    setGiftCardsDescription(cards.filter((giftCard) => giftCard.description));
  }, [restaurantContext?.restaurantData]);

  useEffect(() => {
    if (editingGift) {
      reset({
        value: editingGift.value,
        description: editingGift.description || "",
      });
    } else {
      reset({
        value: "",
        description: "",
      });
    }
  }, [editingGift, reset]);

  function handleEditClick(gift) {
    setEditingGift(gift);
    setIsDeleting(false);
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
        restaurantContext.setRestaurantData((prev) => ({
          ...prev,
          giftCards: response.data.restaurant.giftCards,
        }));

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
        { visible: updatedVisibility },
      )
      .then((response) => {
        restaurantContext.setRestaurantData((prev) => ({
          ...prev,
          giftCards: response.data.restaurant.giftCards,
        }));
      })
      .catch((error) => {
        console.error("Error updating gift visibility:", error);
      });
  }

  function handleDragEnd(event) {
    const { active, over } = event;

    if (!active || !over) return;

    const allGiftCards = [...giftCardsValue, ...giftCardsDescription];

    const oldIndex = allGiftCards.findIndex(
      (giftCard) => giftCard._id === active.id,
    );
    const newIndex = allGiftCards.findIndex(
      (giftCard) => giftCard._id === over.id,
    );

    if (oldIndex !== -1 && newIndex !== -1) {
      const newOrder = arrayMove(allGiftCards, oldIndex, newIndex);

      const newGiftCardsValue = newOrder.filter(
        (giftCard) => !giftCard.description,
      );
      const newGiftCardsDescription = newOrder.filter(
        (giftCard) => giftCard.description,
      );

      setGiftCardsValue(newGiftCardsValue);
      setGiftCardsDescription(newGiftCardsDescription);

      saveNewGiftCardsOrder(newOrder);
    }
  }

  function saveNewGiftCardsOrder(updatedGiftCards) {
    const orderedGiftCardIds = updatedGiftCards.map((giftCard) => giftCard._id);

    axios
      .put(
        `${process.env.NEXT_PUBLIC_API_URL}/restaurants/${restaurantContext?.restaurantData?._id}/gifts/giftCards-list/order`,
        { orderedGiftCardIds },
      )
      .then((response) => {
        restaurantContext.setRestaurantData(response.data.restaurant);
      })
      .catch((error) => {
        console.error("Error saving giftCard order:", error);
      });
  }

  const closeModal = () => {
    setIsModalOpen(false);
    setEditingGift(null);
    setIsDeleting(false);
  };

  return (
    <section className="flex flex-col gap-6">
      <hr className="hidden midTablet:block opacity-20" />

      {/* Header page */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex gap-2 items-center min-h-[40px]">
          <GiftSvg
            width={30}
            height={30}
            className="min-h-[30px] min-w-[30px]"
            fillColor="#131E3690"
          />

          <h1 className="pl-2 text-xl tablet:text-2xl text-darkBlue">
            {t("titles.main")}
          </h1>
        </div>

        <button
          onClick={() => {
            setEditingGift(null);
            setIsDeleting(false);
            setIsModalOpen(true);
          }}
          className={btnPrimary}
        >
          <Plus className="size-4" />
          <span className="hidden mobile:block">{t("buttons.addGift")}</span>
        </button>
      </div>

      {/* Cartes montant fixe */}
      {giftCardsValue?.length > 0 && (
        <div>
          {/* Header type ligne + pill */}
          <div className={sectionChipWrap}>
            <div className={sectionChipLine} />
            <div className={sectionChipLabel}>{t("titles.amountCard")}</div>
            <div className={sectionChipLine} />
          </div>

          <DndContext
            id={id}
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragEnd={handleDragEnd}
            modifiers={[
              restrictToFirstScrollableAncestor,
              restrictToWindowEdges,
            ]}
          >
            <SortableContext
              items={giftCardsValue.map((giftCard) => giftCard._id)}
            >
              <div className="mt-6 mb-10 grid grid-cols-2 tablet:grid-cols-3 desktop:grid-cols-4 ultraWild:grid-cols-5 gap-3 tablet:gap-4">
                {giftCardsValue.map((giftCard) => (
                  <CardGiftsComponent
                    key={giftCard._id}
                    giftCard={giftCard}
                    handleEditClick={handleEditClick}
                    handleDeleteClick={handleDeleteClick}
                    handleVisibilityToggle={handleVisibilityToggle}
                    currencySymbol={currencySymbol}
                  />
                ))}
              </div>
            </SortableContext>
          </DndContext>
        </div>
      )}

      {/* Cartes type “menu / expérience” */}
      {giftCardsDescription?.length > 0 && (
        <div className="mb-10">
          <div className={sectionChipWrap}>
            <div className={sectionChipLine} />
            <div className={sectionChipLabel}>{t("titles.menuCard")}</div>
            <div className={sectionChipLine} />
          </div>

          <DndContext
            id={id}
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragEnd={handleDragEnd}
            modifiers={[
              restrictToFirstScrollableAncestor,
              restrictToWindowEdges,
            ]}
          >
            <SortableContext
              items={giftCardsDescription.map((giftCard) => giftCard._id)}
            >
              <div className="mt-6 mb-10 grid grid-cols-2 tablet:grid-cols-3 desktop:grid-cols-4 ultraWild:grid-cols-5 gap-3 tablet:gap-4">
                {giftCardsDescription.map((giftCard) => (
                  <CardGiftsComponent
                    key={giftCard._id}
                    giftCard={giftCard}
                    handleEditClick={handleEditClick}
                    handleDeleteClick={handleDeleteClick}
                    handleVisibilityToggle={handleVisibilityToggle}
                    currencySymbol={currencySymbol}
                  />
                ))}
              </div>
            </SortableContext>
          </DndContext>
        </div>
      )}

      {/* Achats de cartes cadeaux */}
      <PurchasesGiftListComponent
        purchasesGiftCards={
          restaurantContext?.restaurantData?.purchasesGiftCards
        }
      />

      {/* MODALE ajout / édition / suppression */}
      {isModalOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center px-4">
          <div
            onClick={closeModal}
            className="fixed inset-0 bg-black/25 backdrop-blur-[1px]"
          />

          <div className={modalCardCls}>
            <h2 className="text-lg tablet:text-xl font-semibold text-center text-darkBlue">
              {isDeleting
                ? t("buttons.deleteGift")
                : editingGift
                  ? t("buttons.editGift")
                  : t("buttons.addGift")}
            </h2>

            <form
              onSubmit={handleSubmit(onSubmit)}
              className="flex flex-col gap-5"
            >
              {/* Description */}
              <div className={fieldWrap}>
                <label className={labelCls}>
                  <span>{t("form.labels.description")}</span>
                  <span className="ml-2 text-[11px] text-darkBlue/40 italic">
                    {t("form.labels.optional")}
                  </span>
                </label>

                <textarea
                  className={`${textAreaCls} ${
                    isDeleting ? "opacity-60 cursor-not-allowed" : ""
                  }`}
                  {...register("description")}
                  disabled={isDeleting}
                  placeholder={t("Commencer à écrire...")}
                />
              </div>

              {/* Valeur */}
              <div className={fieldWrap}>
                <label className={labelCls}>{t("form.labels.value")}</label>

                <div className="flex items-stretch rounded-xl border border-darkBlue/15 bg-white/90 overflow-hidden text-sm">
                  <span
                    className={`px-3 inline-flex items-center text-darkBlue/70 select-none ${
                      isDeleting ? "opacity-60" : ""
                    }`}
                  >
                    {currencySymbol}
                  </span>

                  <input
                    type="number"
                    step="0.01"
                    onWheel={(e) => e.currentTarget.blur()}
                    placeholder="-"
                    defaultValue={editingGift?.value || ""}
                    disabled={isDeleting}
                    {...register("value", { required: !isDeleting })}
                    className={`h-10 w-full border-l px-3 outline-none [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none ${
                      errors.value
                        ? "border-red text-red"
                        : "border-darkBlue/10 text-darkBlue"
                    } ${isDeleting ? "opacity-60 cursor-not-allowed" : ""}`}
                  />
                </div>

                {errors.value && !isDeleting && (
                  <p className={errorTextCls}>{t("form.errors.required")}</p>
                )}
              </div>

              {/* Actions */}
              <div className="mt-1 flex flex-col gap-2 tablet:flex-row tablet:justify-center">
                <button type="submit" className={btnPrimary}>
                  {isDeleting ? t("buttons.confirm") : t("buttons.save")}
                </button>

                <button
                  type="button"
                  onClick={closeModal}
                  className={btnSecondary}
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
