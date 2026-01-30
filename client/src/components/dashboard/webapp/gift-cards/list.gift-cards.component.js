import { useRouter } from "next/router";
import { useState, useContext, useEffect, useId, useMemo } from "react";

// REACT HOOK FORM
import { useForm } from "react-hook-form";

// AXIOS
import axios from "axios";

// CONTEXT
import { GlobalContext } from "@/contexts/global.context";

// I18N
import { useTranslation } from "next-i18next";

// SVG
import { GiftSvg } from "../../../_shared/_svgs/_index";
import { ChevronDown, Plus } from "lucide-react";

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
import WebAppPurchasesGiftListComponent from "./purshases-gift-list.gift-cards.component";
import CardGiftsComponent from "./card.gift-cards.component";
import BottomSheetCreateGiftCardsComponent from "./bottom-sheet-create.gift-cards.component";

// ✅ New: change restaurant bottom sheet (same behavior as reservations)
import BottomSheetChangeRestaurantComponent from "../_shared/bottom-sheet-change-restaurant.webapp.component";

export default function WebAppListGiftCardsComponent(props) {
  const { t } = useTranslation("gifts");
  const { restaurantContext } = useContext(GlobalContext);
  const router = useRouter();
  const { locale } = router;
  const currencySymbol = locale === "fr" ? "€" : "$";

  // ----- Initialisation giftCards depuis le contexte pour éviter le flash -----
  const initialCards = restaurantContext?.restaurantData?.giftCards || [];

  // ✅ BottomSheet change restaurant
  const [changeRestaurantOpen, setChangeRestaurantOpen] = useState(false);

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
    "inline-flex items-center justify-center rounded-xl bg-blue px-5 py-2.5 text-sm font-medium text-white shadow hover:bg-blue/90 transition disabled:opacity-60 disabled:cursor-not-allowed";
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

  // ✅ Restos éligibles au module gift_card (utile pour activer/désactiver le bouton)
  const giftCardRestaurants = useMemo(() => {
    const list = restaurantContext?.restaurantsList || [];
    return list.filter((r) => r?.options?.gift_card === true);
  }, [restaurantContext?.restaurantsList]);

  const canSwitchRestaurant = giftCardRestaurants.length > 1;

  const currentName =
    restaurantContext?.restaurantData?.name ||
    props?.restaurantName ||
    t?.("titles.main", "Cartes cadeaux");

  const openChangeRestaurant = () => {
    if (!canSwitchRestaurant) return;
    setChangeRestaurantOpen(true);
  };

  const closeChangeRestaurant = () => setChangeRestaurantOpen(false);

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
    <section className="flex flex-col gap-2">
      {/* ✅ Change restaurant bottom sheet (même comportement que réservations) */}
      <BottomSheetChangeRestaurantComponent
        open={changeRestaurantOpen}
        onClose={closeChangeRestaurant}
        restaurantContext={restaurantContext}
        currentName={currentName}
        t={t}
        // ✅ important: filtre sur gift_card (pas reservations)
        optionKey="gift_card"
        // ✅ labels module (sinon il va afficher “Réservations”)
        moduleLabel={t?.("titles.main", "Cartes cadeaux")}
      />

      {/* Header page */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex gap-2 items-center min-h-[40px]">
          <GiftSvg
            width={30}
            height={30}
            className="min-h-[30px] min-w-[30px]"
            fillColor="#131E3690"
          />

          {/* ✅ Le titre devient aussi le trigger du changement de restaurant */}
          <button
            type="button"
            onClick={openChangeRestaurant}
            className={`min-w-0 inline-flex items-center gap-2 rounded-2xl border border-darkBlue/10 bg-white/70 px-3 py-2 hover:bg-darkBlue/5 transition ${
              canSwitchRestaurant
                ? "cursor-pointer"
                : "cursor-default opacity-90"
            }`}
            disabled={!canSwitchRestaurant}
            aria-label={
              canSwitchRestaurant ? "Changer de restaurant" : "Restaurant"
            }
            title={canSwitchRestaurant ? "Changer de restaurant" : undefined}
          >
            <span className="truncate text-lg font-semibold text-darkBlue">
              {currentName}
            </span>
            {canSwitchRestaurant ? (
              <ChevronDown className="size-4 text-darkBlue/50 shrink-0" />
            ) : null}
          </button>
        </div>

        <button
          onClick={() => {
            setEditingGift(null);
            setIsDeleting(false);
            setIsModalOpen(true);
          }}
          className="inline-flex items-center justify-center rounded-full bg-blue text-white shadow-sm hover:bg-blue/90 active:scale-[0.98] transition p-4"
        >
          <Plus className="size-4" />
        </button>
      </div>

      {/* Cartes montant fixe */}
      {giftCardsValue?.length > 0 && (
        <div>
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
              <div className="mb-2 grid grid-cols-2 gap-2">
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
              restrictToWindowEdges,
            ]}
          >
            <SortableContext
              items={giftCardsDescription.map((giftCard) => giftCard._id)}
            >
              <div className="mt-2 grid grid-cols-2 gap-2">
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
      <WebAppPurchasesGiftListComponent
        purchasesGiftCards={
          restaurantContext?.restaurantData?.purchasesGiftCards
        }
      />

      {/* MODALE ajout / édition / suppression */}
      {isModalOpen && (
        <BottomSheetCreateGiftCardsComponent
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
