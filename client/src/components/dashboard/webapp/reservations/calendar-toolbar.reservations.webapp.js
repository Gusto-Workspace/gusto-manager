import { useContext, useMemo, useState } from "react";
import { useTranslation } from "next-i18next";
import { GlobalContext } from "@/contexts/global.context";

import {
  ChevronLeft,
  ChevronRight,
  Search,
  SlidersHorizontal,
  Plus,
  X,
  ChevronDown,
} from "lucide-react";

import BottomSheetChangeRestaurantComponent from "../_shared/bottom-sheet-change-restaurant.webapp.component";
import NotificationsDrawerComponent from "@/components/_shared/notifications/notifications-drawer.component";
import { NotificationSvg } from "@/components/_shared/_svgs/notification.svg";

export default function CalendarToolbarReservationsWebapp(props) {
  const { t } = useTranslation("reservations");
  const { restaurantContext } = useContext(GlobalContext);

  const [sheetOpen, setSheetOpen] = useState(false);
  const [openNotificationsDrawer, setOpenNotificationsDrawer] = useState(false);

  const unreadCount = restaurantContext?.unreadCounts?.total || 0;

  const monthYearLabel = props.capitalizeFirst(
    new Intl.DateTimeFormat("fr-FR", {
      month: "long",
      year: "numeric",
    }).format(props.currentMonth),
  );

  const goPrev = () =>
    props.setCurrentMonth(
      (m) => new Date(m.getFullYear(), m.getMonth() - 1, 1),
    );

  const goNext = () =>
    props.setCurrentMonth(
      (m) => new Date(m.getFullYear(), m.getMonth() + 1, 1),
    );

  const goToday = () => {
    props.setCurrentMonth(props.startOfMonth(new Date()));
    props.setSelectedDay(null);
  };

  const clearSearch = () => {
    props.setSearchTerm("");
    props.calendarSearchRef?.current?.focus?.();
  };

  const reservationsRestaurants = useMemo(() => {
    const list = restaurantContext?.restaurantsList || [];
    return list.filter((r) => r?.options?.reservations === true);
  }, [restaurantContext?.restaurantsList]);

  const canSwitchRestaurant = reservationsRestaurants.length > 1;

  const openSheet = () => {
    if (!canSwitchRestaurant) return;
    setSheetOpen(true);
  };

  const closeSheet = () => setSheetOpen(false);

  const currentName =
    restaurantContext?.restaurantData?.name || props.restaurantData?.name || "";

  return (
    <div className="relative">
      <BottomSheetChangeRestaurantComponent
        open={sheetOpen}
        onClose={closeSheet}
        restaurantContext={restaurantContext}
        currentName={currentName}
        t={t}
        optionKey="reservations"
        moduleLabel={t("titles.main", "Réservations")}
      />

      {/* ================= Toolbar ================= */}
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0 flex-1 flex items-center gap-2">
          <button
            type="button"
            onClick={openSheet}
            className={`min-w-0 flex-1 overflow-hidden inline-flex items-center gap-1 rounded-2xl border border-darkBlue/10 bg-white/70 px-3 py-2 transition ${
              canSwitchRestaurant
                ? "cursor-pointer hover:bg-darkBlue/5"
                : "cursor-default opacity-90"
            }`}
            disabled={!canSwitchRestaurant}
            aria-label={
              canSwitchRestaurant ? "Changer de restaurant" : "Restaurant"
            }
            title={currentName}
          >
            <span className="flex-1 text-left truncate whitespace-nowrap text-lg font-semibold text-darkBlue">
              {currentName}
            </span>

            {canSwitchRestaurant ? (
              <ChevronDown className="size-4 text-darkBlue/50 shrink-0" />
            ) : null}
          </button>
        </div>

        <div className="shrink-0 flex items-center gap-1">
          <div className="relative pl-1">
            <div className="relative">
              <button
                className="bg-blue p-3 rounded-full bg-opacity-40"
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
            </div>

            <NotificationsDrawerComponent
              open={openNotificationsDrawer}
              onClose={() => setOpenNotificationsDrawer(false)}
              notifications={restaurantContext?.notifications}
              nextCursor={restaurantContext?.notificationsNextCursor}
              loading={restaurantContext?.notificationsLoading}
              fetchNotifications={restaurantContext?.fetchNotifications}
              markNotificationRead={restaurantContext?.markNotificationRead}
              markAllRead={restaurantContext?.markAllRead}
              role={restaurantContext?.userConnected?.role}
              lastNotificationsSyncRef={
                restaurantContext?.lastNotificationsSyncRef
              }
              modulesFilter="reservations"
            />
          </div>

          <button
            onClick={props.handleParametersClick}
            className="inline-flex items-center justify-center rounded-full border border-darkBlue/10 bg-white/70 hover:bg-darkBlue/5 transition p-4"
            aria-label={t("buttons.parameters")}
            title={t("buttons.parameters")}
          >
            <SlidersHorizontal className="size-4 text-darkBlue/70" />
          </button>

          <button
            onClick={props.handleAddClick}
            className="inline-flex items-center justify-center rounded-full bg-blue text-white shadow-sm hover:bg-blue/90 active:scale-[0.98] transition p-4"
            aria-label={t("buttons.add")}
            title={t("buttons.add")}
          >
            <Plus className="size-4" />
          </button>
        </div>
      </div>

      {/* Month controls */}
      <div className="mt-3 flex items-center gap-2">
        <button
          onClick={goPrev}
          className="shrink-0 inline-flex items-center justify-center rounded-2xl border border-darkBlue/10 bg-white/70 hover:bg-darkBlue/5 transition p-3"
          aria-label={t("calendar.prev", "Mois précédent")}
          title={t("calendar.prev", "Mois précédent")}
        >
          <ChevronLeft className="size-5 text-darkBlue/70" />
        </button>

        <button
          onClick={goToday}
          className="flex-1 h-12 inline-flex items-center justify-center rounded-2xl border border-darkBlue/10 bg-white/70 text-darkBlue font-semibold text-sm"
        >
          {monthYearLabel}
        </button>

        <button
          onClick={goNext}
          className="shrink-0 inline-flex items-center justify-center rounded-2xl border border-darkBlue/10 bg-white/70 hover:bg-darkBlue/5 transition p-3"
          aria-label={t("calendar.next", "Mois suivant")}
          title={t("calendar.next", "Mois suivant")}
        >
          <ChevronRight className="size-5 text-darkBlue/70" />
        </button>
      </div>

      {/* Search */}
      <div className="mt-3 relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-darkBlue/40" />
        <input
          ref={props.calendarSearchRef}
          onFocus={() => props.setIsKeyboardOpen(true)}
          onBlur={() => props.setIsKeyboardOpen(false)}
          type="text"
          inputMode="search"
          placeholder={t(
            "filters.search.placeholder",
            "Rechercher nom, email, tel, code…",
          )}
          value={props.searchTerm}
          onChange={props.handleSearchChangeCalendar}
          className={`h-12 w-full rounded-2xl border border-darkBlue/10 bg-white/70 ${
            props.searchTerm ? "pr-12" : "pr-4"
          } pl-9 text-base`}
        />
        {props.searchTerm && (
          <button
            onClick={clearSearch}
            className="absolute right-2 top-1/2 -translate-y-1/2 inline-flex items-center justify-center size-9 rounded-2xl border border-darkBlue/10 bg-white hover:bg-darkBlue/5 transition"
            aria-label={t("buttons.clear", "Effacer")}
            title={t("buttons.clear", "Effacer")}
          >
            <X className="size-4 text-darkBlue/60" />
          </button>
        )}
      </div>
    </div>
  );
}
