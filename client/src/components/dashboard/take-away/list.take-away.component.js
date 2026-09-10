import {
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import axios from "axios";
import {
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  Filter,
  Search,
  Settings,
  ShoppingBag,
  X,
} from "lucide-react";
import { useRouter } from "next/router";

import { GlobalContext } from "@/contexts/global.context";
import CatalogHeaderDashboardComponent from "../_shared/catalog-header.dashboard.component";
import TakeAwayHeaderComponent, {
  AddOrderAction,
} from "./header.take-away.component";
import CalendarMonthTakeAwayComponent from "./calendar-month.take-away.component";
import TakeAwayOrderCardComponent from "./order-card.take-away.component";
import TakeAwayOrderDrawerComponent from "./order-drawer.take-away.component";
import TakeAwayDateBlockToggle from "./date-block-toggle.take-away.component";
import { EmptyState } from "./form.take-away.component";
import {
  STATUS_LABELS,
  STATUS_ORDER,
  buildMonthGrid,
  formatTime,
  normalizeForMatch,
  toDateKey,
} from "./take-away.utils";

function startOfMonth(date) {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

function endOfMonth(date) {
  return new Date(date.getFullYear(), date.getMonth() + 1, 0);
}

function capitalizeFirst(value) {
  const s = String(value || "");
  return s ? s.charAt(0).toUpperCase() + s.slice(1) : s;
}

export default function ListTakeAwayComponent() {
  const router = useRouter();
  const { restaurantContext } = useContext(GlobalContext);
  const restaurant = restaurantContext.restaurantData;
  const restaurantId = restaurant?._id ? String(restaurant._id) : "";
  const ensureTakeAwayOrdersMonth = restaurantContext.ensureTakeAwayOrdersMonth;
  const getCachedTakeAwayOrdersMonth =
    restaurantContext.getCachedTakeAwayOrdersMonth;
  const applyTakeAwayOrderUpdate = restaurantContext.applyTakeAwayOrderUpdate;
  const selectedDayKey =
    typeof router.query.day === "string" ? router.query.day : null;
  const focusedOrderId =
    typeof router.query.orderId === "string" ? router.query.orderId : null;
  const token =
    typeof window !== "undefined" ? localStorage.getItem("token") : null;

  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [currentMonth, setCurrentMonth] = useState(startOfMonth(new Date()));
  const [selectedDay, setSelectedDay] = useState(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [activeStatus, setActiveStatus] = useState("all");
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [selectedOrder, setSelectedOrder] = useState(null);
  const [drawerError, setDrawerError] = useState("");
  const [blockSaving, setBlockSaving] = useState(false);
  const [blockError, setBlockError] = useState("");
  const calendarSearchRef = useRef(null);
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

  const request = useCallback(
    async (config) =>
      axios({
        ...config,
        headers: {
          ...(config.headers || {}),
          Authorization: `Bearer ${token}`,
        },
      }),
    [token],
  );

  useEffect(() => {
    if (!restaurantId) return undefined;
    let cancelled = false;
    setMessage("");

    Promise.resolve(
      ensureTakeAwayOrdersMonth?.(currentMonth, {
        restaurantId,
        prefetchAdjacent: true,
      }),
    ).then((result) => {
      if (!cancelled && !Array.isArray(result)) {
        setMessage("Impossible de charger les commandes.");
      }
    });

    return () => {
      cancelled = true;
    };
  }, [currentMonth, ensureTakeAwayOrdersMonth, restaurantId]);

  useEffect(() => {
    if (!selectedDayKey) {
      setSelectedDay(null);
      return;
    }
    const [year, month, day] = selectedDayKey.split("-").map(Number);
    if (!year || !month || !day) return;
    const nextDay = new Date(year, month - 1, day, 12, 0, 0, 0);
    setCurrentMonth(startOfMonth(nextDay));
    setSelectedDay(nextDay);
  }, [selectedDayKey]);

  useEffect(() => {
    if (!router.isReady || !restaurantId || !token || !focusedOrderId) return;
    let cancelled = false;

    request({
      method: "get",
      url: `${process.env.NEXT_PUBLIC_API_URL}/restaurants/${restaurantId}/take-away/orders/${focusedOrderId}`,
    })
      .then(({ data }) => {
        if (cancelled || !data?.order) return;
        const order = data.order;
        const orderDay = new Date(order.scheduledFor);
        if (!Number.isNaN(orderDay.getTime())) {
          setCurrentMonth(startOfMonth(orderDay));
          setSelectedDay(orderDay);
        }
        applyTakeAwayOrderUpdate?.(order, restaurantId);
        setSelectedOrder(order);
        setDrawerError("");
        setDetailsOpen(true);
      })
      .catch((error) => {
        if (cancelled) return;
        console.error(error);
        setDetailsOpen(false);
        setSelectedOrder(null);
        setMessage(
          error?.response?.status === 403
            ? "Vous n’avez pas accès à cette commande."
            : "Commande introuvable ou supprimée.",
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
    applyTakeAwayOrderUpdate,
    focusedOrderId,
    request,
    restaurantId,
    router,
    router.isReady,
    token,
  ]);

  useEffect(() => {
    if (!selectedOrder?._id) return;
    const updatedOrder = orders.find(
      (order) => String(order._id) === String(selectedOrder._id),
    );
    if (updatedOrder && updatedOrder !== selectedOrder) {
      setSelectedOrder(updatedOrder);
    }
  }, [orders, selectedOrder]);

  const filteredOrders = useMemo(() => {
    const q = normalizeForMatch(searchTerm);
    return orders.filter((order) => {
      if (activeStatus !== "all" && order.status !== activeStatus) return false;
      if (!q) return true;
      return normalizeForMatch(
        `${order.orderNumber} ${order.customerFirstName} ${order.customerLastName} ${order.customerPhone} ${order.customerEmail}`,
      ).includes(q);
    });
  }, [activeStatus, orders, searchTerm]);

  const monthGridDays = useMemo(
    () => buildMonthGrid(currentMonth, filteredOrders, ""),
    [currentMonth, filteredOrders],
  );

  const selectedDayOrders = useMemo(() => {
    if (!selectedDay) return [];
    const key = toDateKey(selectedDay);
    return filteredOrders
      .filter((order) => toDateKey(order.scheduledFor) === key)
      .sort((a, b) => new Date(a.scheduledFor) - new Date(b.scheduledFor));
  }, [filteredOrders, selectedDay]);

  const dayStatusCounts = useMemo(() => {
    if (!selectedDay) return { all: 0 };
    const key = toDateKey(selectedDay);
    const q = normalizeForMatch(searchTerm);
    const counts = { all: 0 };
    orders.forEach((order) => {
      if (toDateKey(order.scheduledFor) !== key) return;
      if (
        q &&
        !normalizeForMatch(
          `${order.orderNumber} ${order.customerFirstName} ${order.customerLastName} ${order.customerPhone} ${order.customerEmail}`,
        ).includes(q)
      ) {
        return;
      }
      counts.all += 1;
      counts[order.status] = (counts[order.status] || 0) + 1;
    });
    return counts;
  }, [orders, searchTerm, selectedDay]);

  const { orderedTimes, byTime } = useMemo(() => {
    const map = {};
    selectedDayOrders.forEach((order) => {
      const time = formatTime(order.scheduledFor);
      if (!map[time]) map[time] = [];
      map[time].push(order);
    });
    return { orderedTimes: Object.keys(map).sort(), byTime: map };
  }, [selectedDayOrders]);

  async function updateOrderStatus(order, status) {
    setLoading(true);
    setDrawerError("");
    try {
      const { data } = await request({
        method: "patch",
        url: `${process.env.NEXT_PUBLIC_API_URL}/restaurants/${restaurantId}/take-away/orders/${order._id}/status`,
        data: { status },
      });
      applyTakeAwayOrderUpdate?.(data.order, restaurantId);
      setSelectedOrder(data.order);
      return true;
    } catch (error) {
      console.error(error);
      setDrawerError("Changement de statut impossible.");
      return false;
    } finally {
      setLoading(false);
    }
  }

  function openDetails(order) {
    setSelectedOrder(order);
    setDrawerError("");
    setDetailsOpen(true);
  }

  function closeDetails() {
    setDetailsOpen(false);
    if (!focusedOrderId) return;
    const nextQuery = { ...router.query };
    delete nextQuery.orderId;
    delete nextQuery.notificationId;
    router.replace({ pathname: router.pathname, query: nextQuery }, undefined, {
      shallow: true,
      scroll: false,
    });
  }

  const monthYearLabel = capitalizeFirst(
    new Intl.DateTimeFormat("fr-FR", {
      month: "long",
      year: "numeric",
    }).format(currentMonth),
  );
  const selectedDayLabel = selectedDay
    ? selectedDay.toLocaleDateString("fr-FR", {
        weekday: "short",
        day: "2-digit",
        month: "short",
        year: "numeric",
      })
    : "Calendrier";
  const blockDateKey = toDateKey(selectedDay || new Date());
  const dateBlocked = (
    restaurant?.takeAwaySettings?.blockedDates || []
  ).includes(blockDateKey);

  async function toggleDateBlocked(blocked) {
    if (!restaurantId || blockSaving) return;
    setBlockSaving(true);
    setBlockError("");
    try {
      const { data } = await request({
        method: "put",
        url: `${process.env.NEXT_PUBLIC_API_URL}/restaurants/${restaurantId}/take-away/blocked-dates/${blockDateKey}`,
        data: { blocked },
      });
      if (data?.restaurant)
        restaurantContext.setRestaurantData(data.restaurant);
    } catch (error) {
      setBlockError(
        error?.response?.data?.message ||
          "Impossible de modifier le blocage des commandes en ligne.",
      );
    } finally {
      setBlockSaving(false);
    }
  }

  const sharedActions = (
    <>
      <button
        type="button"
        onClick={() => router.push("/dashboard/take-away/catalog")}
        className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-darkBlue/10 bg-white/70 transition canHover:hover:bg-darkBlue/5"
        aria-label="Catalogue"
        title="Catalogue"
      >
        <ShoppingBag className="size-4 text-darkBlue/70" />
      </button>
      <button
        type="button"
        onClick={() => router.push("/dashboard/take-away/parameters")}
        className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-darkBlue/10 bg-white/70 transition canHover:hover:bg-darkBlue/5"
        aria-label="Paramètres"
        title="Paramètres"
      >
        <Settings className="size-4 text-darkBlue/70" />
      </button>
      <AddOrderAction onClick={() => router.push("/dashboard/take-away/add")} />
    </>
  );

  const monthActions = (
    <>
      <TakeAwayDateBlockToggle
        active={dateBlocked}
        saving={blockSaving}
        onToggle={toggleDateBlocked}
        dateLabel="aujourd’hui"
        roundedClassName="rounded-full"
        heightClassName="h-10"
      />
      {sharedActions}
    </>
  );

  const selectedDayActions = (
    <>
      <TakeAwayDateBlockToggle
        active={dateBlocked}
        saving={blockSaving}
        onToggle={toggleDateBlocked}
        dateLabel="cette date"
        roundedClassName="rounded-full"
        heightClassName="h-10"
      />
      {sharedActions}
    </>
  );

  function selectCalendarDay(date) {
    const key = toDateKey(date);
    router.push(
      {
        pathname: router.pathname,
        query: { ...router.query, day: key },
      },
      undefined,
      { shallow: true, scroll: false },
    );
  }

  function backToCalendar() {
    const nextQuery = { ...router.query };
    delete nextQuery.day;
    setSelectedDay(null);
    router.push(
      {
        pathname: router.pathname,
        query: nextQuery,
      },
      undefined,
      { shallow: true, scroll: false },
    );
  }

  return (
    <section className="flex flex-col gap-6">
      <hr className="hidden opacity-20 midTablet:block" />

      {selectedDay ? (
        <CatalogHeaderDashboardComponent
          title="Vente à emporter"
          subtitle={selectedDayLabel}
          onBack={backToCalendar}
          backLabel="Retour au calendrier"
          actions={selectedDayActions}
        />
      ) : (
        <TakeAwayHeaderComponent
          subtitle="Calendrier"
          actions={monthActions}
          hideDivider
        />
      )}

      {message && (
        <div className="rounded-2xl border border-darkBlue/10 bg-white/70 px-4 py-3 text-sm text-darkBlue">
          {message}
        </div>
      )}

      {blockError ? (
        <div className="rounded-2xl border border-red/20 bg-red/10 px-4 py-3 text-sm text-red">
          {blockError}
        </div>
      ) : null}

      <div className="-mt-4 flex flex-col gap-4">
        {!selectedDay ? (
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex min-w-0 flex-1 items-center gap-1">
              <button
                type="button"
                onClick={() =>
                  setCurrentMonth(
                    (month) =>
                      new Date(month.getFullYear(), month.getMonth() - 1, 1),
                  )
                }
                className="inline-flex h-10 shrink-0 items-center justify-center rounded-2xl border border-darkBlue/10 bg-white/70 px-2 transition canHover:hover:bg-darkBlue/5"
                aria-label="Mois précédent"
                title="Mois précédent"
              >
                <ChevronLeft className="size-5 text-darkBlue/70" />
              </button>
              <div className="inline-flex h-[42px] flex-1 items-center justify-center rounded-2xl border border-darkBlue/10 bg-white/70 text-sm font-semibold text-darkBlue">
                {monthYearLabel}
              </div>
              <button
                type="button"
                onClick={() =>
                  setCurrentMonth(
                    (month) =>
                      new Date(month.getFullYear(), month.getMonth() + 1, 1),
                  )
                }
                className="inline-flex h-10 shrink-0 items-center justify-center rounded-2xl border border-darkBlue/10 bg-white/70 px-2 transition canHover:hover:bg-darkBlue/5"
                aria-label="Mois suivant"
                title="Mois suivant"
              >
                <ChevronRight className="size-5 text-darkBlue/70" />
              </button>
              <button
                type="button"
                onClick={() => {
                  setCurrentMonth(startOfMonth(new Date()));
                  backToCalendar();
                }}
                className="inline-flex h-10 shrink-0 items-center justify-center rounded-2xl border border-darkBlue/10 bg-white/70 px-2 transition canHover:hover:bg-darkBlue/5"
                aria-label="Aujourd’hui"
                title="Aujourd’hui"
              >
                <CalendarDays className="size-5 text-darkBlue/70" />
              </button>
            </div>

            <div className="relative flex w-full items-center gap-2 rounded-2xl border border-darkBlue/10 bg-white px-3 py-2 shadow-sm tablet:w-[320px]">
              <Search className="size-4 text-darkBlue/40" />
              <input
                ref={calendarSearchRef}
                type="text"
                inputMode="search"
                placeholder="Rechercher (nom, email, téléphone)…"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full bg-white text-sm text-darkBlue outline-none placeholder:text-darkBlue/40"
              />
              {searchTerm ? (
                <button
                  type="button"
                  onClick={() => setSearchTerm("")}
                  className="absolute right-2 top-1/2 inline-flex size-6 -translate-y-1/2 items-center justify-center rounded-2xl border border-darkBlue/10 bg-white transition canHover:hover:bg-darkBlue/5"
                  aria-label="Effacer"
                  title="Effacer"
                >
                  <X className="size-4 text-darkBlue/60" />
                </button>
              ) : null}
            </div>

            <div className="flex h-10 items-center gap-2 rounded-2xl border border-darkBlue/10 bg-white px-3 shadow-sm">
              <Filter className="size-4 text-darkBlue/40" />
              <select
                value={activeStatus}
                onChange={(e) => setActiveStatus(e.target.value)}
                className="bg-white text-sm font-semibold text-darkBlue outline-none"
              >
                <option value="all">Tous les statuts</option>
                {STATUS_ORDER.map((status) => (
                  <option key={status} value={status}>
                    {STATUS_LABELS[status]}
                  </option>
                ))}
              </select>
            </div>
          </div>
        ) : null}

        {!selectedDay ? (
          <CalendarMonthTakeAwayComponent
            monthGridDays={monthGridDays}
            selectedDay={selectedDay}
            setSelectedDay={selectCalendarDay}
            blockedDates={restaurant?.takeAwaySettings?.blockedDates || []}
          />
        ) : (
          <div className="flex flex-col gap-4">
            <div className="flex flex-col gap-2 midTablet:flex-row midTablet:items-center midTablet:justify-end">
              <div className="relative flex w-full items-center gap-2 rounded-2xl border border-darkBlue/10 bg-white px-3 py-2 shadow-sm midTablet:w-[320px]">
                <Search className="size-4 text-darkBlue/40" />
                <input
                  type="text"
                  inputMode="search"
                  placeholder="Rechercher (nom, email, téléphone)…"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="w-full bg-white text-sm text-darkBlue outline-none placeholder:text-darkBlue/40"
                />
                {searchTerm ? (
                  <button
                    type="button"
                    onClick={() => setSearchTerm("")}
                    className="absolute right-2 top-1/2 inline-flex size-6 -translate-y-1/2 items-center justify-center rounded-xl border border-darkBlue/10 bg-white transition canHover:hover:bg-darkBlue/5"
                    aria-label="Effacer"
                  >
                    <X className="size-4 text-darkBlue/60" />
                  </button>
                ) : null}
              </div>

              <div className="flex items-center gap-2 rounded-2xl border border-darkBlue/10 bg-white px-3 py-2 shadow-sm">
                <Filter className="size-4 text-darkBlue/40" />
                <select
                  value={activeStatus}
                  onChange={(e) => setActiveStatus(e.target.value)}
                  className="w-full bg-white text-sm text-darkBlue outline-none"
                >
                  <option value="all">
                    Tous les statuts ({dayStatusCounts.all || 0})
                  </option>
                  {STATUS_ORDER.map((status) => (
                    <option key={status} value={status}>
                      {`${STATUS_LABELS[status]} (${dayStatusCounts[status] || 0})`}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {!selectedDayOrders.length ? (
              <EmptyState text="Aucune commande à emporter ce jour." />
            ) : (
              <div className="flex flex-col gap-6">
                {orderedTimes.map((time) => (
                  <div key={time} className="flex flex-col gap-3">
                    <div className="relative flex items-center gap-3">
                      <div className="h-px flex-1 bg-darkBlue/10" />
                      <div className="inline-flex items-center gap-2 rounded-full border border-darkBlue/10 bg-white px-4 py-1.5 shadow-sm">
                        <span className="text-sm font-semibold tracking-wide text-darkBlue">
                          {time}
                        </span>
                        <span className="h-4 w-px bg-darkBlue/10" />
                        <span className="text-xs text-darkBlue/60">
                          {byTime[time].length}
                        </span>
                      </div>
                      <div className="h-px flex-1 bg-darkBlue/10" />
                    </div>

                    <ul className="flex flex-col gap-2 midTablet:grid midTablet:grid-cols-2 desktop:grid-cols-3">
                      {byTime[time].map((order) => (
                        <TakeAwayOrderCardComponent
                          key={order._id}
                          order={order}
                          onOpenDetails={openDetails}
                          columnLayout
                        />
                      ))}
                    </ul>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      <TakeAwayOrderDrawerComponent
        open={detailsOpen}
        order={selectedOrder}
        onClose={closeDetails}
        onAction={updateOrderStatus}
        loading={loading}
        errorMessage={drawerError}
      />
    </section>
  );
}
