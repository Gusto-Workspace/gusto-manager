import {
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import axios from "axios";
import { useRouter } from "next/router";
import {
  CalendarDays,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Filter,
  Menu,
  Plus,
  Search,
  X,
} from "lucide-react";

import { GlobalContext } from "@/contexts/global.context";
import { NotificationSvg } from "@/components/_shared/_svgs/notification.svg";
import NotificationsDrawerComponent from "@/components/_shared/notifications/notifications-drawer.component";
import ReservationsPeriodLoadingComponent from "@/components/_shared/reservations/reservations-period-loading.component";
import BottomSheetChangeRestaurantComponent from "../_shared/bottom-sheet-change-restaurant.webapp";
import SidebarReservationsWebapp from "../_shared/sidebar.webapp";
import {
  STATUS_LABELS,
  STATUS_ORDER,
  buildMonthGrid,
  normalizeForMatch,
  toDateKey,
  todayKey,
} from "../../take-away/take-away.utils";
import TakeAwayOrderCardWebapp from "./order-card.take-away.webapp";
import TakeAwayOrderDrawerWebapp from "./order-drawer.take-away.webapp";
import CalendarMonthTakeAwayComponent from "../../take-away/calendar-month.take-away.component";
import TakeAwayDateBlockToggle from "../../take-away/date-block-toggle.take-away.component";

function startOfMonth(date) {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

function endOfMonth(date) {
  return new Date(date.getFullYear(), date.getMonth() + 1, 0);
}

function capitalizeFirst(value) {
  const string = String(value || "");
  return string ? string.charAt(0).toUpperCase() + string.slice(1) : string;
}

function isDateKey(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(value || ""))) return false;
  const [year, month, day] = String(value).split("-").map(Number);
  const date = new Date(year, month - 1, day, 12, 0, 0, 0);
  return (
    date.getFullYear() === year &&
    date.getMonth() === month - 1 &&
    date.getDate() === day
  );
}

function dateFromKey(value) {
  if (!isDateKey(value)) return null;
  const [year, month, day] = value.split("-").map(Number);
  return new Date(year, month - 1, day, 12, 0, 0, 0);
}

function getErrorMessage(error, fallback) {
  const status = error?.response?.status;
  if (status === 401 || status === 403) {
    return "Vous n’avez pas accès aux commandes à emporter de ce restaurant.";
  }
  if (status === 404)
    return "Cette commande n’existe plus ou est inaccessible.";
  if (status === 409) {
    return "Cette action n’est plus possible. La commande a été actualisée.";
  }
  return fallback;
}

export default function ListTakeAwayWebapp() {
  const router = useRouter();
  const { restaurantContext } = useContext(GlobalContext);
  const restaurant = restaurantContext.restaurantData;
  const restaurantId = restaurant?._id ? String(restaurant._id) : "";
  const ensureTakeAwayOrdersMonth = restaurantContext.ensureTakeAwayOrdersMonth;
  const getCachedTakeAwayOrdersMonth =
    restaurantContext.getCachedTakeAwayOrdersMonth;
  const applyTakeAwayOrderUpdate = restaurantContext.applyTakeAwayOrderUpdate;
  const focusedOrderId =
    typeof router.query.orderId === "string" ? router.query.orderId : "";
  const focusedNotificationId =
    typeof router.query.notificationId === "string"
      ? router.query.notificationId
      : "";

  const [currentMonth, setCurrentMonth] = useState(() =>
    startOfMonth(new Date()),
  );
  const [selectedDayKey, setSelectedDayKey] = useState("");
  const [initialOrdersLoading, setInitialOrdersLoading] = useState(
    () =>
      !Array.isArray(
        getCachedTakeAwayOrdersMonth?.(startOfMonth(new Date()), restaurantId),
      ),
  );
  const [processing, setProcessing] = useState(false);
  const [pageMessage, setPageMessage] = useState("");
  const [drawerError, setDrawerError] = useState("");
  const [searchTerm, setSearchTerm] = useState("");
  const [activeStatus, setActiveStatus] = useState("all");
  const [selectedOrder, setSelectedOrder] = useState(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [restaurantSheetOpen, setRestaurantSheetOpen] = useState(false);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [blockSaving, setBlockSaving] = useState(false);
  const [blockError, setBlockError] = useState("");
  const autoMarkedNotificationRef = useRef("");
  const markNotificationRead = restaurantContext.markNotificationRead;

  const request = useCallback(async (config) => {
    const token = localStorage.getItem("token");
    return axios({
      ...config,
      headers: {
        ...(config.headers || {}),
        Authorization: `Bearer ${token}`,
      },
    });
  }, []);

  const replaceDay = useCallback(
    (dayKey, { keepFocusedOrder = false } = {}) => {
      if (!isDateKey(dayKey)) return;
      setSelectedDayKey(dayKey);
      setActiveStatus("all");

      if (!router.isReady) return;
      const nextQuery = { ...router.query, day: dayKey };
      if (!keepFocusedOrder) {
        delete nextQuery.orderId;
        delete nextQuery.notificationId;
        setDrawerOpen(false);
        setSelectedOrder(null);
      }
      router.replace(
        { pathname: router.pathname, query: nextQuery },
        undefined,
        { shallow: true, scroll: false },
      );
    },
    [router],
  );

  const backToMonth = useCallback(() => {
    setSelectedDayKey("");
    setActiveStatus("all");
    setDrawerOpen(false);
    setSelectedOrder(null);
    if (!router.isReady) return;
    const nextQuery = { ...router.query };
    delete nextQuery.day;
    delete nextQuery.orderId;
    delete nextQuery.notificationId;
    router.replace({ pathname: router.pathname, query: nextQuery }, undefined, {
      shallow: true,
      scroll: false,
    });
  }, [router]);

  useEffect(() => {
    if (!router.isReady) return;
    const queryDay = Array.isArray(router.query.day)
      ? router.query.day[0]
      : router.query.day;
    if (isDateKey(queryDay)) {
      setSelectedDayKey(queryDay);
      const queryDate = dateFromKey(queryDay);
      if (queryDate) setCurrentMonth(startOfMonth(queryDate));
      return;
    }
    if (!focusedOrderId) setSelectedDayKey("");
  }, [focusedOrderId, router.isReady, router.query.day]);

  useEffect(() => {
    if (!restaurantId) return undefined;
    let cancelled = false;
    const cached = getCachedTakeAwayOrdersMonth?.(currentMonth, restaurantId);
    setInitialOrdersLoading(!Array.isArray(cached));
    setPageMessage("");

    Promise.resolve(
      ensureTakeAwayOrdersMonth?.(currentMonth, {
        restaurantId,
        prefetchAdjacent: true,
      }),
    )
      .then((result) => {
        if (cancelled) return;
        if (!Array.isArray(result)) {
          setPageMessage(
            "Impossible de charger les commandes. Réessayez dans un instant.",
          );
        }
      })
      .finally(() => {
        if (!cancelled) setInitialOrdersLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [
    currentMonth,
    ensureTakeAwayOrdersMonth,
    getCachedTakeAwayOrdersMonth,
    restaurantId,
  ]);

  useEffect(() => {
    if (!router.isReady || !restaurantId || !focusedOrderId) return undefined;
    let cancelled = false;

    request({
      method: "get",
      url: `${process.env.NEXT_PUBLIC_API_URL}/restaurants/${restaurantId}/take-away/orders/${focusedOrderId}`,
    })
      .then(({ data }) => {
        if (cancelled || !data?.order) return;
        const order = data.order;
        const orderDayKey = toDateKey(order.scheduledFor);
        if (orderDayKey && orderDayKey !== selectedDayKey) {
          replaceDay(orderDayKey, { keepFocusedOrder: true });
        }
        applyTakeAwayOrderUpdate?.(order);
        setSelectedOrder(order);
        setDrawerError("");
        setDrawerOpen(true);
      })
      .catch((error) => {
        if (cancelled) return;
        setDrawerOpen(false);
        setSelectedOrder(null);
        setPageMessage(
          getErrorMessage(
            error,
            "Cette commande est introuvable ou a été supprimée.",
          ),
        );
        const nextQuery = { ...router.query };
        delete nextQuery.orderId;
        delete nextQuery.notificationId;
        router.replace(
          { pathname: router.pathname, query: nextQuery },
          undefined,
          { shallow: true, scroll: false },
        );
      });

    return () => {
      cancelled = true;
    };
  }, [
    focusedOrderId,
    applyTakeAwayOrderUpdate,
    replaceDay,
    request,
    restaurantId,
    router,
    selectedDayKey,
  ]);

  useEffect(() => {
    if (!focusedNotificationId) {
      autoMarkedNotificationRef.current = "";
      return;
    }
    if (autoMarkedNotificationRef.current === focusedNotificationId) return;
    if (typeof markNotificationRead !== "function") return;

    autoMarkedNotificationRef.current = focusedNotificationId;
    Promise.resolve(markNotificationRead(focusedNotificationId)).catch(() => {
      autoMarkedNotificationRef.current = "";
    });
  }, [focusedNotificationId, markNotificationRead]);

  const cachedOrders = getCachedTakeAwayOrdersMonth?.(
    currentMonth,
    restaurantId,
  );
  const ordersSource = Array.isArray(cachedOrders)
    ? cachedOrders
    : restaurantContext.takeAwayOrdersList || [];
  const currentMonthFrom = toDateKey(startOfMonth(currentMonth));
  const currentMonthTo = toDateKey(endOfMonth(currentMonth));
  const orders = ordersSource.filter((order) => {
    const key = toDateKey(order.scheduledFor);
    return key >= currentMonthFrom && key <= currentMonthTo;
  });

  const filteredOrders = useMemo(() => {
    const query = normalizeForMatch(searchTerm);
    return orders
      .filter((order) => {
        if (activeStatus !== "all" && order.status !== activeStatus)
          return false;
        if (!query) return true;
        return normalizeForMatch(
          `${order.orderNumber} ${order.customerFirstName} ${order.customerLastName} ${order.customerPhone} ${order.customerEmail}`,
        ).includes(query);
      })
      .sort((a, b) => new Date(a.scheduledFor) - new Date(b.scheduledFor));
  }, [activeStatus, orders, searchTerm]);

  const monthGridDays = useMemo(
    () => buildMonthGrid(currentMonth, filteredOrders, ""),
    [currentMonth, filteredOrders],
  );

  const displayedOrders = useMemo(() => {
    if (!selectedDayKey) return [];
    return filteredOrders.filter(
      (order) => toDateKey(order.scheduledFor) === selectedDayKey,
    );
  }, [filteredOrders, selectedDayKey]);

  const displayedOrdersByTime = useMemo(() => {
    const groups = new Map();
    displayedOrders.forEach((order) => {
      const time = new Date(order.scheduledFor).toLocaleTimeString("fr-FR", {
        hour: "2-digit",
        minute: "2-digit",
      });
      if (!groups.has(time)) groups.set(time, []);
      groups.get(time).push(order);
    });
    return Array.from(groups.entries());
  }, [displayedOrders]);

  useEffect(() => {
    if (!selectedOrder?._id) return;
    const updatedOrder = orders.find(
      (order) => String(order._id) === String(selectedOrder._id),
    );
    if (updatedOrder && updatedOrder !== selectedOrder) {
      setSelectedOrder(updatedOrder);
    }
  }, [orders, selectedOrder]);

  const statusCounts = useMemo(() => {
    const counts = { all: 0 };
    orders.forEach((order) => {
      if (selectedDayKey && toDateKey(order.scheduledFor) !== selectedDayKey) {
        return;
      }
      counts.all += 1;
      counts[order.status] = (counts[order.status] || 0) + 1;
    });
    return counts;
  }, [orders, selectedDayKey]);

  const selectedDate = dateFromKey(selectedDayKey);
  const selectedDateLabel = selectedDate
    ? new Intl.DateTimeFormat("fr-FR", {
        weekday: "short",
        day: "2-digit",
        month: "short",
        year: "numeric",
      }).format(selectedDate)
    : "Aujourd’hui";
  const monthYearLabel = capitalizeFirst(
    new Intl.DateTimeFormat("fr-FR", {
      month: "long",
      year: "numeric",
    }).format(currentMonth),
  );
  const currentName = restaurant?.name || "Vente à emporter";
  const takeAwayRestaurants = (restaurantContext.restaurantsList || []).filter(
    (candidate) => candidate?.options?.take_away === true,
  );
  const canSwitchRestaurant = takeAwayRestaurants.length > 1;
  const unreadCount = restaurantContext?.unreadCounts?.byModule?.take_away || 0;
  const blockDateKey = selectedDayKey || todayKey();
  const dateBlocked = (
    restaurant?.takeAwaySettings?.blockedDates || []
  ).includes(blockDateKey);

  async function toggleDateBlocked(blocked) {
    if (!restaurantId || !blockDateKey || blockSaving) return;
    setBlockSaving(true);
    setBlockError("");
    try {
      const { data } = await request({
        method: "put",
        url: `${process.env.NEXT_PUBLIC_API_URL}/restaurants/${restaurantId}/take-away/blocked-dates/${blockDateKey}`,
        data: { blocked },
      });
      if (data?.restaurant) {
        restaurantContext.setRestaurantData(data.restaurant);
      }
    } catch (error) {
      setBlockError(
        getErrorMessage(
          error,
          "Impossible de modifier le blocage des commandes en ligne.",
        ),
      );
    } finally {
      setBlockSaving(false);
    }
  }

  async function updateOrderStatus(order, status) {
    setProcessing(true);
    setDrawerError("");
    try {
      const { data } = await request({
        method: "patch",
        url: `${process.env.NEXT_PUBLIC_API_URL}/restaurants/${restaurantId}/take-away/orders/${order._id}/status`,
        data: { status },
      });
      const updatedOrder = data?.order;
      if (!updatedOrder) throw new Error("Missing order");
      applyTakeAwayOrderUpdate?.(updatedOrder);
      setSelectedOrder(updatedOrder);
      return true;
    } catch (error) {
      setDrawerError(
        getErrorMessage(error, "Le changement de statut a échoué. Réessayez."),
      );
      if ([404, 409].includes(error?.response?.status)) {
        ensureTakeAwayOrdersMonth?.(currentMonth, {
          restaurantId,
          force: true,
          prefetchAdjacent: false,
        });
      }
      return false;
    } finally {
      setProcessing(false);
    }
  }

  function closeDrawer() {
    setDrawerOpen(false);
    setDrawerError("");
    if (!focusedOrderId) return;
    const nextQuery = { ...router.query };
    delete nextQuery.orderId;
    delete nextQuery.notificationId;
    router.replace({ pathname: router.pathname, query: nextQuery }, undefined, {
      shallow: true,
      scroll: false,
    });
  }

  return (
    <section className="flex flex-col gap-6">
      <SidebarReservationsWebapp
        open={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
        title="Vente à emporter"
        module="take_away"
      />

      <BottomSheetChangeRestaurantComponent
        open={restaurantSheetOpen}
        onClose={() => setRestaurantSheetOpen(false)}
        restaurantContext={restaurantContext}
        currentName={currentName}
        optionKey="take_away"
        moduleLabel="Vente à emporter"
      />

      {selectedDayKey ? (
        <div className="flex h-[50px] items-center justify-between gap-2">
          <div className="flex min-w-0 flex-1 items-center gap-3">
            <button
              type="button"
              onClick={backToMonth}
              className="inline-flex shrink-0 items-center justify-center rounded-full border border-darkBlue/10 bg-white/70 p-3 transition active:scale-[0.98]"
              aria-label="Retour au calendrier"
              title="Retour au calendrier"
            >
              <ChevronLeft className="size-5 text-darkBlue/70" />
            </button>
            <div className="min-w-0 flex-1">
              <p className="truncate text-lg font-semibold text-darkBlue midTablet:text-xl">
                Vente à emporter
              </p>
              <p className="truncate text-sm text-darkBlue/50">
                {selectedDateLabel}
              </p>
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-1">
            <button
              type="button"
              onClick={() =>
                router.push(
                  `/dashboard/webapp/take-away/add?day=${selectedDayKey}`,
                )
              }
              className="inline-flex items-center justify-center rounded-full bg-blue p-3.5 text-white shadow-sm transition active:scale-[0.98]"
              aria-label="Créer une commande"
              title="Créer une commande"
            >
              <Plus className="size-4" />
            </button>
          </div>
        </div>
      ) : (
        <div className="flex h-[50px] items-center justify-between gap-3">
          <div className="flex min-w-0 flex-1 items-center gap-2">
            <button
              type="button"
              onClick={() => setSidebarOpen(true)}
              className="shrink-0 inline-flex items-center justify-center rounded-full border border-darkBlue/10 bg-white/50 transition p-3"
              aria-label="Ouvrir le menu"
              title="Menu"
            >
              <Menu className="size-5 text-darkBlue/70" />
            </button>
            <button
              type="button"
              onClick={() =>
                canSwitchRestaurant && setRestaurantSheetOpen(true)
              }
              disabled={!canSwitchRestaurant}
              className={`min-w-0 flex-1 overflow-hidden inline-flex items-center gap-1 rounded-2xl border border-darkBlue/10 bg-white/70 px-3 py-2 transition ${
                canSwitchRestaurant
                  ? "cursor-pointer"
                  : "cursor-default opacity-90"
              }`}
              aria-label={
                canSwitchRestaurant ? "Changer de restaurant" : "Restaurant"
              }
            >
              <span className="flex-1 truncate whitespace-nowrap text-left text-lg font-semibold text-darkBlue">
                {currentName}
              </span>
              {canSwitchRestaurant ? (
                <ChevronDown className="size-4 shrink-0 text-darkBlue/50" />
              ) : null}
            </button>
          </div>
          <div className="shrink-0 flex items-center gap-1">
            <div className="relative pl-1">
              <div className="relative">
                <button
                  type="button"
                  onClick={() => setNotificationsOpen(true)}
                  className="bg-blue p-2.5 rounded-full bg-opacity-40 active:scale-[0.98] transition"
                  aria-label="Ouvrir les notifications"
                  title="Notifications"
                >
                  <NotificationSvg width={25} height={25} fillColor="#4583FF" />
                </button>
                {unreadCount > 0 ? (
                  <span className="absolute top-1 right-1 inline-flex items-center justify-center px-1 py-0.5 text-xs font-bold leading-none text-white transform translate-x-1/2 -translate-y-1/2 bg-red rounded-full">
                    {unreadCount}
                  </span>
                ) : null}
              </div>
            </div>
            <button
              type="button"
              onClick={() => router.push("/dashboard/webapp/take-away/add")}
              className="inline-flex items-center justify-center rounded-full bg-blue p-3.5 text-white shadow-sm transition active:scale-[0.98]"
              aria-label="Créer une commande"
              title="Créer une commande"
            >
              <Plus className="size-4" />
            </button>
          </div>
        </div>
      )}

      <NotificationsDrawerComponent
        open={notificationsOpen}
        onClose={() => setNotificationsOpen(false)}
        notifications={restaurantContext.notifications}
        nextCursor={
          restaurantContext.notificationsNextCursorByModule?.take_away ?? null
        }
        loading={restaurantContext.notificationsLoading}
        fetchNotifications={restaurantContext.fetchNotifications}
        markNotificationRead={restaurantContext.markNotificationRead}
        markAllRead={restaurantContext.markAllRead}
        role={restaurantContext.userConnected?.role}
        lastNotificationsSyncRef={restaurantContext.lastNotificationsSyncRef}
        modulesFilter="take_away"
      />

      <div className="-mt-3">
        {!selectedDayKey ? (
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() =>
                setCurrentMonth(
                  (month) =>
                    new Date(month.getFullYear(), month.getMonth() - 1, 1),
                )
              }
              className="inline-flex h-[42px] shrink-0 items-center justify-center rounded-2xl border border-darkBlue/10 bg-white/70 px-3 transition"
              aria-label="Mois précédent"
            >
              <ChevronLeft className="size-5 text-darkBlue/70" />
            </button>

            <button
              type="button"
              onClick={() => setCurrentMonth(startOfMonth(new Date()))}
              className="flex h-[42px] min-w-0 flex-1 items-center justify-center rounded-2xl border border-darkBlue/10 bg-white/70 px-2 text-sm font-semibold text-darkBlue"
              title="Aujourd’hui"
            >
              <span className="truncate">{monthYearLabel}</span>
            </button>

            <button
              type="button"
              onClick={() =>
                setCurrentMonth(
                  (month) =>
                    new Date(month.getFullYear(), month.getMonth() + 1, 1),
                )
              }
              className="inline-flex h-[42px] shrink-0 items-center justify-center rounded-2xl border border-darkBlue/10 bg-white/70 px-3 transition"
              aria-label="Mois suivant"
            >
              <ChevronRight className="size-5 text-darkBlue/70" />
            </button>

            <TakeAwayDateBlockToggle
              active={dateBlocked}
              saving={blockSaving}
              onToggle={toggleDateBlocked}
              dateLabel="aujourd’hui"
            />
          </div>
        ) : null}

        <div
          className={
            selectedDayKey
              ? "grid grid-cols-2 gap-2 midTablet:grid-cols-[minmax(0,1fr)_minmax(180px,220px)]"
              : "mt-2 grid grid-cols-[minmax(0,1fr)_minmax(128px,0.6fr)] gap-1"
          }
        >
          <div
            className={`relative min-w-0 ${selectedDayKey ? "col-span-2 midTablet:col-span-1" : ""}`}
          >
            <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-darkBlue/40" />
            <input
              type="search"
              inputMode="search"
              value={searchTerm}
              onChange={(event) => setSearchTerm(event.target.value)}
              placeholder="Rechercher…"
              className={`${selectedDayKey ? "h-11" : "h-[42px]"} w-full rounded-2xl border border-darkBlue/10 bg-white/70 pl-9 pr-9 text-base text-darkBlue outline-none focus:ring-2 focus:ring-blue/20`}
            />
            {searchTerm ? (
              <button
                type="button"
                onClick={() => setSearchTerm("")}
                className="absolute right-1.5 top-1/2 inline-flex size-8 -translate-y-1/2 items-center justify-center rounded-xl"
                aria-label="Effacer"
              >
                <X className="size-4 text-darkBlue/50" />
              </button>
            ) : null}
          </div>

          <div
            className={`relative flex ${selectedDayKey ? "h-11" : "h-[42px]"} items-center gap-2 rounded-2xl border border-darkBlue/10 bg-white/70 px-3`}
          >
            <Filter className="size-4 shrink-0 text-darkBlue/40" />
            <select
              value={activeStatus}
              onChange={(event) => setActiveStatus(event.target.value)}
              className="min-w-0 flex-1 appearance-none bg-transparent text-sm text-darkBlue outline-none"
              aria-label="Filtrer par statut"
            >
              <option value="all">Tous ({statusCounts.all || 0})</option>
              {STATUS_ORDER.map((status) => (
                <option key={status} value={status}>
                  {STATUS_LABELS[status]} ({statusCounts[status] || 0})
                </option>
              ))}
            </select>
            <ChevronDown className="pointer-events-none size-4 shrink-0 text-darkBlue/40" />
          </div>
        </div>
      </div>

      {blockError ? (
        <p className="rounded-2xl border border-red/20 bg-red/5 px-4 py-3 text-sm text-red">
          {blockError}
        </p>
      ) : null}

      {pageMessage ? (
        <div
          role="alert"
          className="rounded-2xl border border-red/20 bg-red/5 px-4 py-3 text-sm text-darkBlue/75"
        >
          {pageMessage}
        </div>
      ) : null}

      {initialOrdersLoading ? (
        <ReservationsPeriodLoadingComponent />
      ) : !selectedDayKey ? (
        <CalendarMonthTakeAwayComponent
          monthGridDays={monthGridDays}
          selectedDay={null}
          setSelectedDay={(date) => replaceDay(toDateKey(date))}
          blockedDates={restaurant?.takeAwaySettings?.blockedDates || []}
        />
      ) : !displayedOrders.length ? (
        <div className="flex min-h-48 flex-col items-center justify-center rounded-3xl border border-dashed border-darkBlue/15 bg-white/45 px-6 text-center">
          <CalendarDays className="size-8 text-darkBlue/30" />
          <p className="mt-3 font-semibold text-darkBlue">
            Aucune commande ce jour
          </p>
          <p className="mt-1 text-sm text-darkBlue/50">
            Les nouvelles commandes apparaîtront ici automatiquement.
          </p>
        </div>
      ) : (
        <div className="flex flex-col gap-6">
          {displayedOrdersByTime.map(([time, slotOrders]) => (
            <section key={time} className="flex flex-col gap-3">
              <div className="relative flex items-center gap-3">
                <div className="h-px flex-1 bg-darkBlue/10" />
                <div className="inline-flex items-center gap-2 rounded-full border border-darkBlue/10 bg-white px-4 py-1.5 shadow-sm">
                  <span className="text-sm font-semibold tracking-wide text-darkBlue">
                    {time}
                  </span>
                  <span className="h-4 w-px bg-darkBlue/10" />
                  <span className="text-xs font-semibold text-darkBlue/60">
                    {slotOrders.length} commande
                    {slotOrders.length > 1 ? "s" : ""}
                  </span>
                </div>
                <div className="h-px flex-1 bg-darkBlue/10" />
              </div>

              <ul className="flex flex-col gap-2">
                {slotOrders.map((order) => (
                  <TakeAwayOrderCardWebapp
                    key={order._id}
                    order={order}
                    onOpenDetails={(nextOrder) => {
                      setSelectedOrder(nextOrder);
                      setDrawerError("");
                      setDrawerOpen(true);
                    }}
                  />
                ))}
              </ul>
            </section>
          ))}
        </div>
      )}

      <TakeAwayOrderDrawerWebapp
        open={drawerOpen}
        order={selectedOrder}
        onClose={closeDrawer}
        onAction={updateOrderStatus}
        processing={processing}
        errorMessage={drawerError}
      />
    </section>
  );
}
