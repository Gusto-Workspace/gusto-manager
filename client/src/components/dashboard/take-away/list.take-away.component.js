import { useContext, useEffect, useMemo, useRef, useState } from "react";
import axios from "axios";
import {
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  Search,
  Settings,
  ShoppingBag,
  X,
} from "lucide-react";
import { useRouter } from "next/router";

import { GlobalContext } from "@/contexts/global.context";
import TakeAwayHeaderComponent, {
  AddOrderAction,
} from "./header.take-away.component";
import ManualTakeAwayOrderComponent from "./manual-order.take-away.component";
import CalendarMonthTakeAwayComponent from "./calendar-month.take-away.component";
import TakeAwayOrderCardComponent from "./order-card.take-away.component";
import TakeAwayOrderDrawerComponent from "./order-drawer.take-away.component";
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

function capitalizeFirst(value) {
  const s = String(value || "");
  return s ? s.charAt(0).toUpperCase() + s.slice(1) : s;
}

export default function ListTakeAwayComponent() {
  const router = useRouter();
  const { restaurantContext } = useContext(GlobalContext);
  const restaurant = restaurantContext.restaurantData;
  const restaurantId = restaurant?._id;
  const token =
    typeof window !== "undefined" ? localStorage.getItem("token") : null;

  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [currentMonth, setCurrentMonth] = useState(startOfMonth(new Date()));
  const [selectedDay, setSelectedDay] = useState(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [activeStatus, setActiveStatus] = useState("all");
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [selectedOrder, setSelectedOrder] = useState(null);
  const [drawerError, setDrawerError] = useState("");
  const calendarSearchRef = useRef(null);

  const catalog = Array.isArray(restaurant?.takeAwayCatalog)
    ? restaurant.takeAwayCatalog
    : [];
  const deliveryZones = Array.isArray(
    restaurant?.takeAwaySettings?.deliveryZones,
  )
    ? restaurant.takeAwaySettings.deliveryZones
    : [];

  async function request(config) {
    return axios({
      ...config,
      headers: {
        ...(config.headers || {}),
        Authorization: `Bearer ${token}`,
      },
    });
  }

  async function fetchOrders() {
    if (!restaurantId || !token) return;
    setLoading(true);
    try {
      const { data } = await request({
        method: "get",
        url: `${process.env.NEXT_PUBLIC_API_URL}/restaurants/${restaurantId}/take-away/orders`,
        params: { limit: 500 },
      });
      setOrders(Array.isArray(data.orders) ? data.orders : []);
    } catch (error) {
      console.error(error);
      setMessage("Impossible de charger les commandes.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    fetchOrders();
  }, [restaurantId]);

  useEffect(() => {
    if (!restaurantId) return undefined;
    const url = `${process.env.NEXT_PUBLIC_API_URL}/events/${restaurantId}`;
    const es = new EventSource(url);
    es.onmessage = (event) => {
      try {
        const payload = JSON.parse(event.data);
        if (
          (payload.type === "takeaway_order_created" ||
            payload.type === "takeaway_order_updated") &&
          payload.order
        ) {
          setOrders((prev) => {
            const list = Array.isArray(prev) ? prev : [];
            const id = String(payload.order._id);
            const exists = list.some((order) => String(order._id) === id);
            if (!exists) return [payload.order, ...list];
            return list.map((order) =>
              String(order._id) === id ? payload.order : order,
            );
          });
          setSelectedOrder((prev) =>
            prev && String(prev._id) === String(payload.order._id)
              ? payload.order
              : prev,
          );
        }
      } catch {}
    };
    return () => es.close();
  }, [restaurantId]);

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
    const counts = { all: selectedDayOrders.length };
    selectedDayOrders.forEach((order) => {
      counts[order.status] = (counts[order.status] || 0) + 1;
    });
    return counts;
  }, [selectedDayOrders]);

  const { orderedTimes, byTime } = useMemo(() => {
    const map = {};
    selectedDayOrders.forEach((order) => {
      const time = formatTime(order.scheduledFor);
      if (!map[time]) map[time] = [];
      map[time].push(order);
    });
    return { orderedTimes: Object.keys(map).sort(), byTime: map };
  }, [selectedDayOrders]);

  async function createManualOrder(payload) {
    setLoading(true);
    setMessage("");
    try {
      const scheduledFor = new Date(
        `${payload.date}T${payload.time}:00`,
      ).toISOString();
      const { data } = await request({
        method: "post",
        url: `${process.env.NEXT_PUBLIC_API_URL}/restaurants/${restaurantId}/take-away/orders`,
        data: {
          ...payload,
          scheduledFor,
          slotId: `${payload.date}-${payload.time}`,
          paymentMethod: "on_site",
        },
      });
      setOrders((prev) => [data.order, ...prev]);
      setSelectedDay(new Date(scheduledFor));
      setMessage("Commande manuelle créée.");
      return true;
    } catch (error) {
      console.error(error);
      setMessage(error?.response?.data?.message || "Création impossible.");
      return false;
    } finally {
      setLoading(false);
    }
  }

  async function updateOrderStatus(order, status) {
    setLoading(true);
    setDrawerError("");
    try {
      const { data } = await request({
        method: "patch",
        url: `${process.env.NEXT_PUBLIC_API_URL}/restaurants/${restaurantId}/take-away/orders/${order._id}/status`,
        data: { status },
      });
      setOrders((prev) =>
        prev.map((current) =>
          String(current._id) === String(order._id) ? data.order : current,
        ),
      );
      setSelectedOrder(data.order);
    } catch (error) {
      console.error(error);
      setDrawerError("Changement de statut impossible.");
    } finally {
      setLoading(false);
    }
  }

  function openDetails(order) {
    setSelectedOrder(order);
    setDrawerError("");
    setDetailsOpen(true);
  }

  const monthYearLabel = capitalizeFirst(
    new Intl.DateTimeFormat("fr-FR", {
      month: "long",
      year: "numeric",
    }).format(currentMonth),
  );

  const actions = (
    <>
      <button
        type="button"
        onClick={() => router.push("/dashboard/take-away/catalog")}
        className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-darkBlue/10 bg-white/70 transition hover:bg-darkBlue/5"
        aria-label="Catalogue"
        title="Catalogue"
      >
        <ShoppingBag className="size-4 text-darkBlue/70" />
      </button>
      <button
        type="button"
        onClick={() => router.push("/dashboard/take-away/parameters")}
        className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-darkBlue/10 bg-white/70 transition hover:bg-darkBlue/5"
        aria-label="Paramètres"
        title="Paramètres"
      >
        <Settings className="size-4 text-darkBlue/70" />
      </button>
      <AddOrderAction onClick={() => setSelectedDay(new Date())} />
    </>
  );

  return (
    <section className="flex flex-col gap-6">
      <TakeAwayHeaderComponent subtitle="Calendrier" actions={actions} />

      {message && (
        <div className="rounded-2xl border border-darkBlue/10 bg-white/70 px-4 py-3 text-sm text-darkBlue">
          {message}
        </div>
      )}

      <div className="grid gap-5 xl:grid-cols-[1fr_430px]">
        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <div className="flex items-start justify-between gap-3">
              <div className="flex min-w-0 flex-1 items-center gap-1">
                <button
                  type="button"
                  onClick={() =>
                    setCurrentMonth(
                      (month) =>
                        new Date(month.getFullYear(), month.getMonth() - 1, 1),
                    )
                  }
                  className="inline-flex h-10 shrink-0 items-center justify-center rounded-2xl border border-darkBlue/10 bg-white/70 px-2 transition hover:bg-darkBlue/5"
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
                  className="inline-flex h-10 shrink-0 items-center justify-center rounded-2xl border border-darkBlue/10 bg-white/70 px-2 transition hover:bg-darkBlue/5"
                >
                  <ChevronRight className="size-5 text-darkBlue/70" />
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setCurrentMonth(startOfMonth(new Date()));
                    setSelectedDay(null);
                  }}
                  className="inline-flex h-10 shrink-0 items-center justify-center rounded-2xl border border-darkBlue/10 bg-white/70 px-2 transition hover:bg-darkBlue/5"
                >
                  <CalendarDays className="size-5 text-darkBlue/70" />
                </button>
              </div>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-2">
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
                    className="absolute right-2 top-1/2 inline-flex size-6 -translate-y-1/2 items-center justify-center rounded-2xl border border-darkBlue/10 bg-white transition hover:bg-darkBlue/5"
                  >
                    <X className="size-4 text-darkBlue/60" />
                  </button>
                ) : null}
              </div>

              <select
                value={activeStatus}
                onChange={(e) => setActiveStatus(e.target.value)}
                className="h-10 rounded-2xl border border-darkBlue/10 bg-white px-3 text-sm font-semibold text-darkBlue outline-none"
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

          {!selectedDay ? (
            <CalendarMonthTakeAwayComponent
              monthGridDays={monthGridDays}
              selectedDay={selectedDay}
              setSelectedDay={setSelectedDay}
            />
          ) : (
            <div className="flex flex-col gap-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <button
                  type="button"
                  onClick={() => setSelectedDay(null)}
                  className="inline-flex h-10 items-center rounded-xl border border-darkBlue/10 bg-white px-3 text-sm font-semibold text-darkBlue hover:bg-darkBlue/5"
                >
                  Retour au calendrier
                </button>
                <div className="text-sm font-semibold text-darkBlue/60">
                  {selectedDay.toLocaleDateString("fr-FR", {
                    weekday: "long",
                    day: "2-digit",
                    month: "long",
                    year: "numeric",
                  })}
                </div>
              </div>

              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => setActiveStatus("all")}
                  className={`h-9 rounded-full border px-3 text-xs font-semibold ${
                    activeStatus === "all"
                      ? "border-blue bg-blue text-white"
                      : "border-darkBlue/10 bg-white text-darkBlue"
                  }`}
                >
                  Toutes ({dayStatusCounts.all || 0})
                </button>
                {STATUS_ORDER.map((status) => (
                  <button
                    key={status}
                    type="button"
                    onClick={() => setActiveStatus(status)}
                    className={`h-9 rounded-full border px-3 text-xs font-semibold ${
                      activeStatus === status
                        ? "border-blue bg-blue text-white"
                        : "border-darkBlue/10 bg-white text-darkBlue"
                    }`}
                  >
                    {STATUS_LABELS[status]} ({dayStatusCounts[status] || 0})
                  </button>
                ))}
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

        <ManualTakeAwayOrderComponent
          catalog={catalog}
          deliveryZones={deliveryZones}
          loading={loading}
          onCreate={createManualOrder}
        />
      </div>

      <TakeAwayOrderDrawerComponent
        open={detailsOpen}
        order={selectedOrder}
        onClose={() => setDetailsOpen(false)}
        onAction={updateOrderStatus}
        loading={loading}
        errorMessage={drawerError}
      />
    </section>
  );
}
