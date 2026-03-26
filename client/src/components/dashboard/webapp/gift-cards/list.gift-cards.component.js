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
import { NotificationSvg } from "@/components/_shared/_svgs/notification.svg";
import { ChevronDown, Menu, Plus } from "lucide-react";

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
import WebAppPurchasesGiftListComponent from "./purshases-gift-list.gift-cards.component";
import CardGiftsComponent from "./card.gift-cards.component";
import CreateDrawerGiftCardsComponent from "../../../_shared/gift-cards/create-drawer.gift-cards.component";

import BottomSheetChangeRestaurantComponent from "../_shared/bottom-sheet-change-restaurant.webapp";
import NotificationsDrawerComponent from "@/components/_shared/notifications/notifications-drawer.component";
import SidebarReservationsWebapp from "../_shared/sidebar.webapp";

export default function WebAppListGiftCardsComponent(props) {
  const { t } = useTranslation("gifts");
  const { restaurantContext } = useContext(GlobalContext);
  const router = useRouter();
  const { locale } = router;
  const currencySymbol = locale === "fr" ? "€" : "$";
  const view = props?.view || "purchases";

  // ----- Initialisation giftCards depuis le contexte pour éviter le flash -----
  const initialCards = restaurantContext?.restaurantData?.giftCards || [];

  // ✅ BottomSheet change restaurant
  const [changeRestaurantOpen, setChangeRestaurantOpen] = useState(false);
  const [openNotificationsDrawer, setOpenNotificationsDrawer] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);

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
  const unreadCount =
    restaurantContext?.unreadCounts?.byModule?.gift_cards || 0;
  const isCatalogOnly = view === "catalog";
  const isPurchasesOnly = view === "purchases";
  const showCatalog = view === "catalog" || view === "all";
  const showPurchases = view === "purchases" || view === "all";

  const openChangeRestaurant = () => {
    if (!canSwitchRestaurant) return;
    setChangeRestaurantOpen(true);
  };

  const closeChangeRestaurant = () => setChangeRestaurantOpen(false);
  const openSidebar = () => setSidebarOpen(true);
  const closeSidebar = () => setSidebarOpen(false);

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
      <SidebarReservationsWebapp
        open={sidebarOpen}
        onClose={closeSidebar}
        title={t?.("titles.main", "Cartes cadeaux")}
        module="gift_cards"
      />

      {/* ✅ Change restaurant bottom sheet (même comportement que réservations) */}
      <BottomSheetChangeRestaurantComponent
        open={changeRestaurantOpen}
        onClose={closeChangeRestaurant}
        restaurantContext={restaurantContext}
        currentName={currentName}
        t={t}
        optionKey="gift_card"
        moduleLabel={t?.("titles.main", "Cartes cadeaux")}
      />

      {/* Header page */}
      <div className="flex items-center justify-between gap-3">
        <div className="h-[50px] min-w-0 flex-1 flex items-center gap-2">
          <button
            type="button"
            onClick={openSidebar}
            className="shrink-0 inline-flex items-center justify-center rounded-full border border-darkBlue/10 bg-white/50 transition p-3"
            aria-label="Ouvrir le menu"
            title="Menu"
          >
            <Menu className="size-5 text-darkBlue/70" />
          </button>

          {isCatalogOnly ? (
            <h1 className="flex-1 min-w-0 text-xl font-semibold text-darkBlue truncate">
              Liste des cartes cadeaux
            </h1>
          ) : (
            <button
              type="button"
              onClick={openChangeRestaurant}
              className={`min-w-0 flex-1 overflow-hidden inline-flex items-center gap-2 rounded-2xl border border-darkBlue/10 bg-white/70 px-3 py-2 transition ${
                canSwitchRestaurant
                  ? "cursor-pointer hover:bg-darkBlue/5"
                  : "cursor-default opacity-90"
              }`}
              disabled={!canSwitchRestaurant}
              aria-label={
                canSwitchRestaurant ? "Changer de restaurant" : "Restaurant"
              }
              title={canSwitchRestaurant ? "Changer de restaurant" : undefined}
            >
              <span className="flex-1 truncate text-left text-lg font-semibold text-darkBlue">
                {currentName}
              </span>
              {canSwitchRestaurant ? (
                <ChevronDown className="size-4 text-darkBlue/50 shrink-0" />
              ) : null}
            </button>
          )}
        </div>

        <div className="shrink-0 flex items-center gap-1">
          {!isCatalogOnly ? (
            <div className="relative">
              <button
                className="bg-blue p-2.5 rounded-full bg-opacity-40 active:scale-[0.98] transition"
                onClick={() => setOpenNotificationsDrawer(true)}
                aria-label="Ouvrir les notifications"
                title="Notifications"
              >
                <NotificationSvg width={25} height={25} fillColor="#4583FF" />
              </button>

              {unreadCount > 0 && (
                <span className="absolute top-1 right-1 inline-flex items-center justify-center px-1 py-0.5 text-xs font-bold leading-none text-white transform translate-x-1/2 -translate-y-1/2 bg-red rounded-full">
                  {unreadCount}
                </span>
              )}

              <NotificationsDrawerComponent
                open={openNotificationsDrawer}
                onClose={() => setOpenNotificationsDrawer(false)}
                notifications={restaurantContext?.notifications}
                nextCursor={
                  restaurantContext?.notificationsNextCursorByModule
                    ?.gift_cards ?? null
                }
                loading={restaurantContext?.notificationsLoading}
                fetchNotifications={restaurantContext?.fetchNotifications}
                markNotificationRead={restaurantContext?.markNotificationRead}
                markAllRead={restaurantContext?.markAllRead}
                role={restaurantContext?.userConnected?.role}
                lastNotificationsSyncRef={
                  restaurantContext?.lastNotificationsSyncRef
                }
                modulesFilter="gift_cards"
              />
            </div>
          ) : null}

          {!isPurchasesOnly ? (
            <button
              type="button"
              onClick={() => {
                setEditingGift(null);
                setIsDeleting(false);
                setIsModalOpen(true);
              }}
              className="inline-flex items-center justify-center rounded-full bg-blue text-white shadow-sm hover:bg-blue/90 active:scale-[0.98] transition p-3.5"
              aria-label={t("buttons.addGift")}
              title={t("buttons.addGift")}
            >
              <Plus className="size-4" />
            </button>
          ) : null}
        </div>
      </div>

      {/* Cartes montant fixe */}
      {showCatalog && giftCardsValue?.length > 0 && (
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

              restrictToParentElement,
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
      {showCatalog && giftCardsDescription?.length > 0 && (
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
      {showPurchases ? (
        <WebAppPurchasesGiftListComponent
          purchasesGiftCards={
            restaurantContext?.restaurantData?.purchasesGiftCards
          }
        />
      ) : null}

      {/* MODALE ajout / édition / suppression */}
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
