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
import { Plus, SlidersHorizontal } from "lucide-react";

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
  restrictToParentElement,
} from "@dnd-kit/modifiers";

// COMPONENTS
import PurchasesGiftListComponent from "./purshases-gift-list.gift-cards.component";
import CardGiftsComponent from "./card.gift-cards.component";
import CreateDrawerGiftCardsComponent from "../../_shared/gift-cards/create-drawer.gift-cards.component";

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

  const sectionChipWrap = "flex items-center gap-3 my-6 max-w-4xl mx-auto px-2";
  const sectionChipLine = "h-px flex-1 bg-darkBlue/10";
  const sectionChipLabel =
    "inline-flex items-center justify-center rounded-full border border-darkBlue/10 bg-white/90 px-6 py-1.5 text-[11px] font-semibold tracking-[0.18em] text-darkBlue uppercase shadow-sm";

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

        <div className="shrink-0 flex items-center gap-1">
          <button
            type="button"
            onClick={() => router.push("/dashboard/gift-cards/parameters")}
            className="inline-flex items-center justify-center rounded-full border border-darkBlue/10 bg-white/70 hover:bg-darkBlue/5 transition h-[40px] w-[40px]"
            aria-label={t("buttons.parameters", "Paramètres")}
            title={t("buttons.parameters", "Paramètres")}
          >
            <SlidersHorizontal className="size-4 text-darkBlue/70" />
          </button>

          <button
            type="button"
            onClick={() => {
              setEditingGift(null);
              setIsDeleting(false);
              setIsModalOpen(true);
            }}
            className="inline-flex items-center justify-center rounded-full bg-blue text-white shadow-sm hover:bg-blue/90 active:scale-[0.98] transition h-[40px] w-[40px]"
            aria-label={t("buttons.addGift")}
            title={t("buttons.addGift")}
          >
            <Plus className="size-4" />
          </button>
        </div>
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

              restrictToParentElement,
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
        <div>
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

              restrictToParentElement,
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

      {isModalOpen && (
        <CreateDrawerGiftCardsComponent
          open={isModalOpen}
          onClose={closeModal}
          title={
            isDeleting
              ? t("buttons.deleteGift")
              : editingGift
                ? t("buttons.editGift")
                : t("buttons.addGift")
          }
          onSubmit={handleSubmit(onSubmit)}
          register={register}
          errors={errors}
          currencySymbol={currencySymbol}
          isDeleting={isDeleting}
          editingGift={editingGift}
          t={t}
        />
      )}
    </section>
  );
}
