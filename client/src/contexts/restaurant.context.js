import { useEffect, useRef, useState, useCallback } from "react";
import { useRouter } from "next/router";

// AXIOS
import axios from "axios";

// JWT
import { jwtDecode } from "jwt-decode";

import {
  beginFrontendLoad,
  completeFrontendAutomationMutation,
  finishFrontendAutomationScan,
  markFrontendDataLoadingFalse,
  markFrontendLoadPhase,
  measureFrontendRequest,
  recordFrontendAutomationCandidate,
  recordFrontendAutomationError,
  recordFrontendAutomationMutation,
  recordFrontendAutomationRefetch,
  startFrontendAutomationRun,
} from "@/_assets/utils/perf-diagnostics.client";

const DEFAULT_RESERVATION_DELETION_MINUTES = 6 * 30 * 24 * 60;

const EMPTY_UNREAD_BY_MODULE = {
  reservations: 0,
  gift_cards: 0,
  employees: 0,
  take_away: 0,
};

function countUnreadTotal(byModule = {}) {
  return Object.values(byModule).reduce(
    (total, value) => total + (Number(value) || 0),
    0,
  );
}

function normalizePerfContext(value, fallbackReason = "unknown") {
  if (typeof value === "string") {
    return { reason: value || fallbackReason, loadId: null };
  }

  return {
    reason: value?.reason || fallbackReason,
    loadId: value?.loadId || null,
  };
}

function mergeRealtimeReservation(prevReservation, nextReservation) {
  if (!prevReservation) return nextReservation;
  if (!nextReservation) return prevReservation;

  return {
    ...prevReservation,
    ...nextReservation,
    customerName: nextReservation.customerName || prevReservation.customerName,
    customerSummary:
      nextReservation.customerSummary || prevReservation.customerSummary,
  };
}

export default function RestaurantContext() {
  const router = useRouter();

  const [restaurantData, setRestaurantData] = useState(null);
  const [reservationsList, setReservationsList] = useState([]);
  const [userConnected, setUserConnected] = useState(null);
  const [restaurantsList, setRestaurantsList] = useState([]);
  const [dataLoading, setDataLoading] = useState(true);
  const [closeEditing, setCloseEditing] = useState(false);
  const [isAuth, setIsAuth] = useState(false);

  const [autoDeletingReservations, setAutoDeletingReservations] = useState([]);
  const [autoUpdatingReservations, setAutoUpdatingReservations] = useState([]);

  const [unreadCounts, setUnreadCounts] = useState({
    total: 0,
    byModule: EMPTY_UNREAD_BY_MODULE,
  });

  // ✅ Liste de notifications (pour le drawer)
  const [notifications, setNotifications] = useState([]);
  const [notificationsNextCursor, setNotificationsNextCursor] = useState(null);
  const [notificationsNextCursorByModule, setNotificationsNextCursorByModule] =
    useState({
      all: null,
      reservations: null,
      gift_cards: null,
      employees: null,
      take_away: null,
    });
  const [notificationsLoading, setNotificationsLoading] = useState(false);
  const lastNotificationsSyncRef = useRef(0);

  // ✅ si tu veux garder tes variables existantes (compat UI)
  const newReservationsCount = unreadCounts.byModule.reservations || 0;
  const newGiftPurchasesCount = unreadCounts.byModule.gift_cards || 0;
  const newLeaveRequestsCount = unreadCounts.byModule.employees || 0;

  const hasFetchedDashboardDataRef = useRef(false);
  const sseRef = useRef(null);
  const currentPathRef = useRef("");
  const customersCacheRef = useRef(new Map());

  useEffect(() => {
    currentPathRef.current = router.pathname || "";
  }, [router.pathname]);

  // ---------------------------
  // Notifications helpers (NEW)
  // ---------------------------

  const fetchNotifications = useCallback(
    async ({
      restaurantId = null,
      module = null,
      unreadOnly = false,
      limit = 30,
      cursor = null,
      reset = true,
      reason = "unknown",
      loadId = null,
    } = {}) => {
      const token =
        typeof window !== "undefined" ? localStorage.getItem("token") : null;
      const rid = restaurantId || restaurantData?._id;

      if (!token || !rid) return;

      const nextCursorKey = module || "all";

      if (reset) {
        if (!module) setNotificationsNextCursor(null);
        setNotificationsNextCursorByModule((prev) => ({
          ...prev,
          [nextCursorKey]: null,
        }));
      }

      setNotificationsLoading(true);

      try {
        const requestUrl = `${process.env.NEXT_PUBLIC_API_URL}/restaurants/${rid}/notifications`;
        const { data } = await measureFrontendRequest({
          name: "notifications",
          kind: "notifications",
          requestUrl,
          loadId,
          reason,
          restaurantId: String(rid),
          request: () =>
            axios.get(requestUrl, {
              headers: { Authorization: `Bearer ${token}` },
              params: {
                limit,
                unreadOnly: unreadOnly ? "true" : "false",
                ...(module ? { module } : {}),
                ...(cursor ? { cursor } : {}),
              },
            }),
        });

        const items = Array.isArray(data?.notifications)
          ? data.notifications
          : [];
        const next = data?.nextCursor ?? null;

        if (!module) setNotificationsNextCursor(next);
        setNotificationsNextCursorByModule((prev) => ({
          ...prev,
          [nextCursorKey]: next,
        }));

        setNotifications((prev) => {
          if (reset) return items;

          const map = new Map(prev.map((n) => [String(n._id), n]));
          for (const n of items) map.set(String(n._id), n);

          return Array.from(map.values()).sort(
            (a, b) => new Date(b.createdAt) - new Date(a.createdAt),
          );
        });

        lastNotificationsSyncRef.current = Date.now();
      } catch (e) {
        console.warn("Failed to fetch notifications list", e);
      } finally {
        setNotificationsLoading(false);
      }
    },
    [restaurantData?._id],
  );

  async function fetchUnreadCounts(token, rid, diagnostics = {}) {
    if (!token || !rid) return;

    const { reason, loadId } = normalizePerfContext(diagnostics);
    const requestUrl = `${process.env.NEXT_PUBLIC_API_URL}/restaurants/${rid}/notifications/unread-counts`;

    markFrontendLoadPhase(loadId, "unread_counts_start", {
      reason,
      restaurantId: String(rid),
    });

    try {
      const { data } = await measureFrontendRequest({
        name: "unread_counts",
        kind: "unread",
        requestUrl,
        loadId,
        reason,
        restaurantId: String(rid),
        request: () =>
          axios.get(requestUrl, {
            headers: { Authorization: `Bearer ${token}` },
          }),
      });

      // attendu : { total, byModule: { reservations, gift_cards, employees } }
      setUnreadCounts({
        total: data?.total ?? 0,
        byModule: {
          reservations: data?.byModule?.reservations ?? 0,
          gift_cards: data?.byModule?.gift_cards ?? 0,
          employees: data?.byModule?.employees ?? 0,
          take_away: data?.byModule?.take_away ?? 0,
        },
      });
      markFrontendLoadPhase(loadId, "unread_counts_end", {
        reason,
        restaurantId: String(rid),
      });
    } catch (e) {
      markFrontendLoadPhase(loadId, "unread_counts_error", {
        reason,
        restaurantId: String(rid),
        status: e?.response?.status ?? null,
      });
      console.warn("Failed to fetch unread notifications counts", e);
      // en cas d'erreur -> on garde l'état précédent
    }
  }

  function bumpUnreadLocal(moduleKey) {
    if (!moduleKey) return;

    setUnreadCounts((prev) => {
      const nextBy = {
        ...EMPTY_UNREAD_BY_MODULE,
        ...(prev?.byModule || {}),
      };
      nextBy[moduleKey] = (nextBy[moduleKey] || 0) + 1;

      const total = countUnreadTotal(nextBy);

      return { total, byModule: nextBy };
    });
  }

  const markNotificationRead = useCallback(
    async (notifId) => {
      const token =
        typeof window !== "undefined" ? localStorage.getItem("token") : null;
      const rid = restaurantData?._id;
      if (!token || !rid || !notifId) return;

      try {
        const { data } = await axios.post(
          `${process.env.NEXT_PUBLIC_API_URL}/restaurants/${rid}/notifications/${notifId}/read`,
          {},
          { headers: { Authorization: `Bearer ${token}` } },
        );

        const updated = data?.notification;

        setNotifications((prev) =>
          prev.map((n) =>
            String(n._id) === String(notifId)
              ? updated
                ? updated
                : { ...n, read: true, readAt: new Date() }
              : n,
          ),
        );
      } catch (e) {
        console.warn("Failed to mark notification read", e);
      }
    },
    [restaurantData?._id],
  );

  const markAllRead = useCallback(
    async (module = null) => {
      const token =
        typeof window !== "undefined" ? localStorage.getItem("token") : null;
      const rid = restaurantData?._id;
      if (!token || !rid) return;

      try {
        await axios.post(
          `${process.env.NEXT_PUBLIC_API_URL}/restaurants/${rid}/notifications/read-all`,
          {},
          {
            headers: { Authorization: `Bearer ${token}` },
            params: module ? { module } : {},
          },
        );

        setNotifications((prev) =>
          prev.map((n) => {
            if (n.read) return n;
            if (module && n.module !== module) return n;
            return { ...n, read: true, readAt: n.readAt || new Date() };
          }),
        );
      } catch (e) {
        console.warn("Failed to mark all notifications read", e);
      }
    },
    [restaurantData?._id],
  );

  const fetchReservationsList = useCallback(
    async (tokenOverride = null, restaurantId = null, diagnostics = {}) => {
      const { reason, loadId } = normalizePerfContext(diagnostics);
      const token =
        tokenOverride ||
        (typeof window !== "undefined" ? localStorage.getItem("token") : null);
      const rid = restaurantId || restaurantData?._id;

      if (!token || !rid) {
        setReservationsList([]);
        markFrontendLoadPhase(loadId, "reservations_skipped", {
          reason,
          restaurantId: rid ? String(rid) : null,
        });
        return [];
      }

      const requestUrl = `${process.env.NEXT_PUBLIC_API_URL}/restaurants/${rid}/reservations`;
      markFrontendLoadPhase(loadId, "reservations_start", {
        reason,
        restaurantId: String(rid),
      });

      try {
        const { data } = await measureFrontendRequest({
          name: "manager_reservations",
          kind: "reservations",
          requestUrl,
          loadId,
          reason,
          restaurantId: String(rid),
          request: () =>
            axios.get(requestUrl, {
              headers: { Authorization: `Bearer ${token}` },
            }),
        });

        const reservations = Array.isArray(data?.reservations)
          ? data.reservations
          : [];

        setReservationsList(reservations);
        markFrontendLoadPhase(loadId, "reservations_end", {
          reason,
          restaurantId: String(rid),
          reservationCount: reservations.length,
        });
        return reservations;
      } catch (e) {
        markFrontendLoadPhase(loadId, "reservations_error", {
          reason,
          restaurantId: String(rid),
          status: e?.response?.status ?? null,
        });
        console.warn("Failed to fetch reservations list", e);
        return null;
      }
    },
    [restaurantData?._id],
  );

  const refreshReservationsList = useCallback(
    async (
      restaurantId = null,
      tokenOverride = null,
      diagnostics = "manual",
    ) => {
      const reservations = await fetchReservationsList(
        tokenOverride,
        restaurantId,
        diagnostics,
      );

      if (reservations) customersCacheRef.current.clear();
      return reservations;
    },
    [fetchReservationsList],
  );

  const syncRestaurantReservations = useCallback(
    async (restaurant, tokenOverride = null, diagnostics = {}) => {
      const rid = restaurant?._id ? String(restaurant._id) : null;
      const hasReservationsModule = restaurant?.options?.reservations === true;

      if (!rid || !hasReservationsModule) {
        setReservationsList([]);
        return [];
      }

      return (
        (await fetchReservationsList(tokenOverride, rid, diagnostics)) || []
      );
    },
    [fetchReservationsList],
  );

  const reconnectRealtime = useCallback(() => {
    if (sseRef.current) {
      try {
        sseRef.current.close();
      } catch {}
      sseRef.current = null;
    }

    const restaurantId = restaurantData?._id;
    const role = userConnected?.role;

    if (!restaurantId || !role) return;

    const url = `${process.env.NEXT_PUBLIC_API_URL}/events/${restaurantId}`;
    const es = new EventSource(url, { withCredentials: false });
    sseRef.current = es;

    es.onmessage = (evt) => {
      try {
        const payload = JSON.parse(evt.data);

        if (payload.type === "notification_created" && payload.notification) {
          const n = payload.notification;

          bumpUnreadLocal(n.module);

          setNotifications((prev) => {
            const id = String(n._id);
            if (prev.some((x) => String(x._id) === id)) return prev;
            return [n, ...prev].slice(0, 60);
          });
        }

        if (payload.type === "leave_request_created") {
          setRestaurantData((prev) => {
            if (!prev) return prev;
            const empId = String(payload.employeeId);
            const lr = payload.leaveRequest;
            return {
              ...prev,
              employees: (prev.employees || []).map((e) => {
                if (String(e._id) !== empId) return e;
                const existing = e.leaveRequests || [];
                const already = existing.some(
                  (r) => String(r._id) === String(lr._id),
                );
                if (already) return e;
                return { ...e, leaveRequests: [...existing, lr] };
              }),
            };
          });
        }

        if (payload.type === "leave_request_updated") {
          setRestaurantData((prev) => {
            if (!prev) return prev;

            const employeeId = String(payload.employeeId || "");
            const leaveRequest = payload.leaveRequest;
            const nextShifts = Array.isArray(payload.shifts)
              ? payload.shifts
              : null;

            return {
              ...prev,
              employees: (prev.employees || []).map((employee) => {
                if (String(employee?._id) !== employeeId) {
                  return employee;
                }

                const currentLeaveRequests = Array.isArray(employee.leaveRequests)
                  ? employee.leaveRequests
                  : [];
                const hasLeaveRequest = currentLeaveRequests.some(
                  (request) =>
                    String(request?._id) === String(leaveRequest?._id),
                );

                return {
                  ...employee,
                  leaveRequests: hasLeaveRequest
                    ? currentLeaveRequests.map((request) =>
                        String(request?._id) === String(leaveRequest?._id)
                          ? { ...request, ...leaveRequest }
                          : request,
                      )
                    : leaveRequest
                      ? [...currentLeaveRequests, leaveRequest]
                      : currentLeaveRequests,
                  shifts: nextShifts || employee.shifts || [],
                };
              }),
            };
          });
        }

        if (payload.type === "leave_request_deleted") {
          setRestaurantData((prev) => {
            if (!prev) return prev;

            const employeeId = String(payload.employeeId || "");
            const leaveRequestId = String(payload.leaveRequestId || "");
            const nextShifts = Array.isArray(payload.shifts)
              ? payload.shifts
              : null;

            return {
              ...prev,
              employees: (prev.employees || []).map((employee) => {
                if (String(employee?._id) !== employeeId) {
                  return employee;
                }

                return {
                  ...employee,
                  leaveRequests: (employee.leaveRequests || []).filter(
                    (request) => String(request?._id) !== leaveRequestId,
                  ),
                  shifts: nextShifts || employee.shifts || [],
                };
              }),
            };
          });
        }

        if (payload.type === "employee_updated" && payload.employee) {
          const nextEmployee = payload.employee;
          const employeeId = String(nextEmployee?._id || "");

          if (employeeId) {
            setRestaurantData((prev) => {
              if (!prev) return prev;

              const employees = Array.isArray(prev.employees)
                ? prev.employees
                : [];

              if (
                !employees.some(
                  (employee) => String(employee?._id) === employeeId,
                )
              ) {
                return prev;
              }

              return {
                ...prev,
                employees: employees.map((employee) =>
                  String(employee?._id) === employeeId
                    ? nextEmployee
                    : employee,
                ),
              };
            });

            setUserConnected((prev) => {
              if (!prev || String(prev.id) !== employeeId) return prev;
              return {
                ...prev,
                firstname:
                  nextEmployee.firstname !== undefined
                    ? nextEmployee.firstname
                    : prev.firstname,
                lastname:
                  nextEmployee.lastname !== undefined
                    ? nextEmployee.lastname
                    : prev.lastname,
                email:
                  nextEmployee.email !== undefined
                    ? nextEmployee.email
                    : prev.email,
                phone:
                  nextEmployee.phone !== undefined
                    ? nextEmployee.phone
                    : prev.phone,
                profilePictureUrl:
                  nextEmployee?.profilePicture?.url || prev.profilePictureUrl,
              };
            });
          }
        }

        if (payload.type === "reservation_created" && payload.reservation) {
          const r = payload.reservation;

          customersCacheRef.current.clear();

          setReservationsList((prev) => {
            const list = Array.isArray(prev) ? prev : [];
            const exists = list.some((x) => String(x?._id) === String(r._id));
            if (exists) {
              return list.map((x) =>
                String(x?._id) === String(r._id)
                  ? mergeRealtimeReservation(x, r)
                  : x,
              );
            }
            return [r, ...list];
          });
        }

        if (payload.type === "reservation_updated" && payload.reservation) {
          const r = payload.reservation;

          customersCacheRef.current.clear();

          setReservationsList((prev) => {
            const list = Array.isArray(prev) ? prev : [];
            const id = String(r._id);
            const nextList = list.map((x) =>
              String(x._id) === id ? mergeRealtimeReservation(x, r) : x,
            );
            return nextList;
          });
        }

        if (payload.type === "reservation_deleted" && payload.reservationId) {
          const deletedId = String(payload.reservationId);

          customersCacheRef.current.clear();

          setReservationsList((prev) =>
            (Array.isArray(prev) ? prev : []).filter(
              (x) => String(x?._id) !== deletedId,
            ),
          );
        }

        if (payload.type === "giftcard_purchased" && payload.purchase) {
          setRestaurantData((prev) => {
            if (!prev) return prev;
            const list = prev.purchasesGiftCards || [];
            const id = String(payload.purchase._id);
            const exists = list.some((x) => String(x._id) === id);
            if (exists) return prev;
            return { ...prev, purchasesGiftCards: [...list, payload.purchase] };
          });
        }

        if (payload.type === "notification_read") {
          const id = String(payload.notificationId);
          const moduleKey = payload.module;

          setNotifications((prev) =>
            prev.map((n) =>
              String(n._id) === id
                ? { ...n, read: true, readAt: new Date() }
                : n,
            ),
          );

          setUnreadCounts((prev) => {
            const nextBy = { ...EMPTY_UNREAD_BY_MODULE, ...prev.byModule };
            if (moduleKey && nextBy[moduleKey] > 0) nextBy[moduleKey] -= 1;

            const total = countUnreadTotal(nextBy);
            return { total, byModule: nextBy };
          });
        }

        if (payload.type === "notifications_read_all") {
          const mod = payload.module;

          setNotifications((prev) =>
            prev.map((n) =>
              !n.read && (!mod || n.module === mod)
                ? { ...n, read: true, readAt: new Date() }
                : n,
            ),
          );

          setUnreadCounts((prev) => {
            if (!mod) {
              return {
                total: 0,
                byModule: EMPTY_UNREAD_BY_MODULE,
              };
            }
            const nextBy = {
              ...EMPTY_UNREAD_BY_MODULE,
              ...prev.byModule,
              [mod]: 0,
            };
            const total = countUnreadTotal(nextBy);
            return { total, byModule: nextBy };
          });
        }
      } catch (e) {
        console.warn("Bad SSE payload", e);
      }
    };

    es.onerror = () => {
      // le navigateur va réessayer automatiquement
    };
  }, [restaurantData?._id, userConnected?.role]);

  // --------------------------------------------------------
  // SSE: keep real-time injections + NEW notification events
  // --------------------------------------------------------

  useEffect(() => {
    reconnectRealtime();

    return () => {
      if (sseRef.current) {
        try {
          sseRef.current.close();
        } catch {}
        sseRef.current = null;
      }
    };
  }, [reconnectRealtime]);

  // ---------------------------
  // Misc helpers
  // ---------------------------

  function inferRequiredModuleFromPath(pathname = "") {
    if (pathname.startsWith("/dashboard/webapp/reservations"))
      return "reservations";
    if (pathname.startsWith("/dashboard/webapp/gift-cards"))
      return "gift_cards";
    if (pathname.startsWith("/dashboard/webapp/time-clock")) return "employees";
    return null;
  }

  function buildCustomersCacheKey({
    rid,
    page,
    limit,
    query,
    tag,
    source,
    showSourceFilter,
  }) {
    return JSON.stringify({
      rid: String(rid || ""),
      page: Number(page || 1),
      limit: Number(limit || 30),
      query: String(query || ""),
      tag: String(tag || "all"),
      source: showSourceFilter ? String(source || "all") : "all",
    });
  }

  function invalidateCustomersCache(rid) {
    const id = String(rid || "");
    if (!id) return;

    for (const k of customersCacheRef.current.keys()) {
      try {
        const obj = JSON.parse(k);
        if (String(obj.rid) === id) customersCacheRef.current.delete(k);
      } catch {}
    }
  }

  function pruneCustomersCache(max = 50) {
    const map = customersCacheRef.current;
    if (map.size <= max) return;

    // supprime les plus vieux (ts le plus petit)
    const entries = Array.from(map.entries()).sort(
      (a, b) => (a[1]?.ts || 0) - (b[1]?.ts || 0),
    );
    const toRemove = entries.slice(0, Math.max(0, map.size - max));
    for (const [k] of toRemove) map.delete(k);
  }

  const fetchCustomersCached = useCallback(
    async ({
      rid,
      page = 1,
      limit = 30,
      query = "",
      tag = "all",
      source = "all",
      showSourceFilter = false,
      ttlMs = 60_000,
      force = false,
    } = {}) => {
      const token =
        typeof window !== "undefined" ? localStorage.getItem("token") : null;
      if (!token || !rid) return null;

      const key = buildCustomersCacheKey({
        rid,
        page,
        limit,
        query,
        tag,
        source,
        showSourceFilter,
      });

      const now = Date.now();
      const cached = customersCacheRef.current.get(key);

      if (!force && cached && now - cached.ts < ttlMs) {
        return cached.data; // ✅ cache hit
      }

      const { data } = await axios.get(
        `${process.env.NEXT_PUBLIC_API_URL}/restaurants/${rid}/customers`,
        {
          headers: { Authorization: `Bearer ${token}` },
          params: {
            page,
            limit,
            ...(query ? { query } : {}),
            ...(tag && tag !== "all" ? { tag } : {}),
            ...(showSourceFilter && source !== "all" ? { source } : {}),
          },
        },
      );

      customersCacheRef.current.set(key, { ts: now, data });
      pruneCustomersCache(50);
      return data;
    },
    [],
  );

  // ✅ peek synchro (évite skeleton si cache hit)
  function peekCustomersCache({
    rid,
    page = 1,
    limit = 30,
    query = "",
    tag = "all",
    source = "all",
    showSourceFilter = false,
    ttlMs = 60_000,
  } = {}) {
    if (!rid) return null;

    const key = buildCustomersCacheKey({
      rid,
      page,
      limit,
      query,
      tag,
      source,
      showSourceFilter,
    });

    const cached = customersCacheRef.current.get(key);
    if (!cached) return null;

    const now = Date.now();
    if (now - cached.ts >= ttlMs) return null;

    return cached.data;
  }

  function handleInvalidToken() {
    setRestaurantsList([]);
    setRestaurantData(null);
    setReservationsList([]);
    setUserConnected(null);
    setNotifications([]);
    setNotificationsNextCursor(null);
    setNotificationsNextCursorByModule({
      all: null,
      reservations: null,
      gift_cards: null,
      employees: null,
      take_away: null,
    });
    setNotificationsLoading(false);
    setIsAuth(false);

    // ✅ stop le loader (sinon splash infini)
    setDataLoading(false);

    localStorage.removeItem("token");

    // ✅ reset counts
    setUnreadCounts({
      total: 0,
      byModule: EMPTY_UNREAD_BY_MODULE,
    });

    const path = typeof window !== "undefined" ? window.location.pathname : "";

    if (path.startsWith("/dashboard/login")) {
      router.replace("/dashboard/login");
      return;
    }

    const returnTo =
      typeof window !== "undefined"
        ? window.location.pathname +
          window.location.search +
          window.location.hash
        : "/dashboard";

    router.replace(`/dashboard/login?redirect=${encodeURIComponent(returnTo)}`);
  }

  // ---------------------------
  // Fetch restaurant data
  // ---------------------------
  async function fetchRestaurantData(token, restaurantId, diagnostics = {}) {
    const perfContext = normalizePerfContext(diagnostics);
    const reason = perfContext.reason;
    const loadId =
      perfContext.loadId || beginFrontendLoad(reason, restaurantId || null);

    setDataLoading(true);
    markFrontendLoadPhase(loadId, "data_loading_true", {
      reason,
      restaurantId: restaurantId ? String(restaurantId) : null,
    });

    let role = null;
    try {
      role = jwtDecode(token)?.role || null;
    } catch {}

    try {
      setNotifications([]);
      setNotificationsNextCursor(null);
      setNotificationsNextCursorByModule({
        all: null,
        reservations: null,
        gift_cards: null,
        employees: null,
        take_away: null,
      });
      setNotificationsLoading(false);

      if (role === "employee") {
        const requestUrl = `${process.env.NEXT_PUBLIC_API_URL}/employees/me`;
        markFrontendLoadPhase(loadId, "restaurant_data_start", {
          reason,
          restaurantId: restaurantId ? String(restaurantId) : null,
          role,
        });
        const response = await measureFrontendRequest({
          name: "employee_restaurant_data",
          kind: "restaurant",
          requestUrl,
          loadId,
          reason,
          restaurantId: restaurantId ? String(restaurantId) : null,
          request: () =>
            axios.get(requestUrl, {
              headers: { Authorization: `Bearer ${token}` },
            }),
        });

        const { restaurant, restaurants } = response.data || {};
        const rid = restaurant?._id ? String(restaurant._id) : null;
        markFrontendLoadPhase(loadId, "restaurant_data_end", {
          reason,
          restaurantId: rid,
          role,
        });
        setRestaurantsList(restaurants || []);
        setRestaurantData(restaurant || null);
        await syncRestaurantReservations(restaurant, token, {
          reason,
          loadId,
        });

        if (restaurant?._id) {
          await fetchUnreadCounts(token, rid, { reason, loadId });
        } else {
          setUnreadCounts({
            total: 0,
            byModule: EMPTY_UNREAD_BY_MODULE,
          });
        }

        return;
      }

      const requestUrl = `${process.env.NEXT_PUBLIC_API_URL}/owner/restaurants/${restaurantId}`;
      markFrontendLoadPhase(loadId, "restaurant_data_start", {
        reason,
        restaurantId: String(restaurantId),
        role,
      });
      const response = await measureFrontendRequest({
        name: "owner_restaurant_data",
        kind: "restaurant",
        requestUrl,
        loadId,
        reason,
        restaurantId: String(restaurantId),
        request: () =>
          axios.get(requestUrl, {
            headers: { Authorization: `Bearer ${token}` },
          }),
      });

      const restaurant = response.data.restaurant;
      const rid = String(restaurant._id);

      markFrontendLoadPhase(loadId, "restaurant_data_end", {
        reason,
        restaurantId: rid,
        role,
      });
      setRestaurantData(restaurant);
      await syncRestaurantReservations(restaurant, token, { reason, loadId });

      if (role === "owner") {
        await fetchUnreadCounts(token, rid, { reason, loadId });
      } else {
        setUnreadCounts({
          total: 0,
          byModule: EMPTY_UNREAD_BY_MODULE,
        });
      }
    } catch (error) {
      if (error.response?.status === 403) {
        handleInvalidToken();
      } else {
        console.error(
          "Erreur lors de la récupération des données du restaurant:",
          error,
        );
      }
    } finally {
      setDataLoading(false);
      markFrontendDataLoadingFalse(loadId, {
        reason,
        restaurantId: restaurantId ? String(restaurantId) : null,
      });
    }
  }

  function fetchRestaurantsList(diagnostics = { reason: "bootstrap" }) {
    const token = localStorage.getItem("token");

    if (!token) {
      handleInvalidToken();
      return;
    }

    let decodedToken;
    try {
      decodedToken = jwtDecode(token);
    } catch (error) {
      console.error("Invalid token:", error);
      handleInvalidToken();
      return;
    }

    const role = decodedToken.role;
    if (!decodedToken.id || !role) {
      console.error("Invalid token payload:", decodedToken);
      handleInvalidToken();
      return;
    }

    const perfContext = normalizePerfContext(diagnostics, "bootstrap");
    const reason = perfContext.reason;
    const loadId =
      perfContext.loadId ||
      beginFrontendLoad(reason, decodedToken.restaurantId || null);

    setDataLoading(true);
    markFrontendLoadPhase(loadId, "data_loading_true", {
      reason,
      restaurantId: decodedToken.restaurantId || null,
    });

    // ----- OWNER -----
    if (role === "owner") {
      const requestUrl = `${process.env.NEXT_PUBLIC_API_URL}/owner/restaurants`;
      markFrontendLoadPhase(loadId, "restaurants_list_start", {
        reason,
        restaurantId: decodedToken.restaurantId || null,
      });
      measureFrontendRequest({
        name: "restaurants_list",
        kind: "restaurant",
        requestUrl,
        loadId,
        reason,
        restaurantId: decodedToken.restaurantId || null,
        request: () =>
          axios.get(requestUrl, {
            headers: { Authorization: `Bearer ${token}` },
            params: { ownerId: decodedToken.id },
          }),
      })
        .then((response) => {
          const restaurants = response.data.restaurants || [];
          markFrontendLoadPhase(loadId, "restaurants_list_end", {
            reason,
            restaurantId: decodedToken.restaurantId || null,
            restaurantCount: restaurants.length,
          });
          setRestaurantsList(restaurants);

          if (!restaurants.length) {
            setRestaurantData(null);
            setReservationsList([]);
            setDataLoading(false);
            markFrontendDataLoadingFalse(loadId, { reason });
            setIsAuth(true);
            return;
          }

          const requiredModule = inferRequiredModuleFromPath(router.pathname);

          let selectedRestaurantId = decodedToken.restaurantId;

          if (!selectedRestaurantId && requiredModule) {
            const eligible = restaurants.find(
              (r) => r?.options?.[requiredModule] === true,
            );
            if (eligible?._id) selectedRestaurantId = eligible._id;
          }

          if (!selectedRestaurantId) selectedRestaurantId = restaurants[0]._id;

          fetchRestaurantData(token, selectedRestaurantId, {
            reason,
            loadId,
          });
          setIsAuth(true);
        })
        .catch((error) => {
          markFrontendLoadPhase(loadId, "restaurants_list_error", {
            reason,
            restaurantId: decodedToken.restaurantId || null,
            status: error?.response?.status ?? null,
          });
          if (error.response?.status === 403) {
            handleInvalidToken();
          } else {
            console.error(
              "Erreur lors de la récupération des restaurants (owner):",
              error,
            );
            setDataLoading(false);
          }
          markFrontendDataLoadingFalse(loadId, { reason });
        });

      return;
    }

    // ----- EMPLOYEE -----
    if (role === "employee") {
      const requestUrl = `${process.env.NEXT_PUBLIC_API_URL}/employees/me`;
      markFrontendLoadPhase(loadId, "restaurants_list_start", {
        reason,
        restaurantId: decodedToken.restaurantId || null,
      });
      measureFrontendRequest({
        name: "employee_restaurants_list",
        kind: "restaurant",
        requestUrl,
        loadId,
        reason,
        restaurantId: decodedToken.restaurantId || null,
        request: () =>
          axios.get(requestUrl, {
            headers: { Authorization: `Bearer ${token}` },
          }),
      })
        .then(async (res) => {
          const { restaurant, restaurants } = res.data;
          const rid = restaurant?._id ? String(restaurant._id) : null;

          markFrontendLoadPhase(loadId, "restaurants_list_end", {
            reason,
            restaurantId: rid,
            restaurantCount: Array.isArray(restaurants)
              ? restaurants.length
              : 0,
          });

          setRestaurantsList(restaurants || []);
          setRestaurantData(restaurant || null);
          await syncRestaurantReservations(restaurant, token, {
            reason,
            loadId,
          });

          // ✅ notifications counts aussi pour employee
          if (restaurant?._id) {
            await fetchUnreadCounts(token, rid, { reason, loadId });
          } else {
            setUnreadCounts({
              total: 0,
              byModule: EMPTY_UNREAD_BY_MODULE,
            });
          }

          // ✅ reset liste notifs (propre)
          setNotifications([]);
          setNotificationsNextCursor(null);
          setNotificationsNextCursorByModule({
            all: null,
            reservations: null,
            gift_cards: null,
            employees: null,
            take_away: null,
          });
          setNotificationsLoading(false);

          setIsAuth(true);
          setDataLoading(false);
          markFrontendDataLoadingFalse(loadId, {
            reason,
            restaurantId: rid,
          });
        })
        .catch((error) => {
          markFrontendLoadPhase(loadId, "restaurants_list_error", {
            reason,
            restaurantId: decodedToken.restaurantId || null,
            status: error?.response?.status ?? null,
          });
          if (error.response?.status === 403) {
            handleInvalidToken();
          } else {
            console.error(
              "Erreur lors de la récupération des restaurants (employee):",
              error,
            );
            setDataLoading(false);
          }
          markFrontendDataLoadingFalse(loadId, { reason });
        });

      return;
    }

    console.warn("Unknown role in token:", role);
    handleInvalidToken();
    markFrontendDataLoadingFalse(loadId, { reason });
  }

  function handleRestaurantSelect(restaurantId) {
    const token = localStorage.getItem("token");
    if (!token) return;

    let decoded;
    try {
      decoded = jwtDecode(token);
    } catch (err) {
      console.error("Invalid token:", err);
      handleInvalidToken();
      return;
    }

    const role = decoded.role;
    const reason = "restaurant-change";
    const loadId = beginFrontendLoad(reason, String(restaurantId));

    setDataLoading(true);
    markFrontendLoadPhase(loadId, "data_loading_true", {
      reason,
      restaurantId: String(restaurantId),
    });
    setCloseEditing(true);
    customersCacheRef.current.clear();
    setReservationsList([]);

    // ----- OWNER -----
    if (role === "owner") {
      const requestUrl = `${process.env.NEXT_PUBLIC_API_URL}/owner/change-restaurant`;
      measureFrontendRequest({
        name: "owner_change_restaurant",
        requestUrl,
        loadId,
        reason,
        restaurantId: String(restaurantId),
        request: () =>
          axios.post(
            requestUrl,
            { restaurantId },
            { headers: { Authorization: `Bearer ${token}` } },
          ),
      })
        .then((response) => {
          const { token: updatedToken } = response.data;
          localStorage.setItem("token", updatedToken);
          fetchRestaurantData(updatedToken, restaurantId, { reason, loadId });
          setCloseEditing(false);
        })
        .catch((error) => {
          if (error.response?.status === 403) {
            handleInvalidToken();
          } else {
            console.error(
              "Erreur lors de la sélection du restaurant (owner):",
              error,
            );
            setDataLoading(false);
            setCloseEditing(false);
          }
          markFrontendDataLoadingFalse(loadId, {
            reason,
            restaurantId: String(restaurantId),
          });
        });
      return;
    }

    // ----- EMPLOYEE -----
    if (role === "employee") {
      const requestUrl = `${process.env.NEXT_PUBLIC_API_URL}/employees/change-restaurant`;
      measureFrontendRequest({
        name: "employee_change_restaurant",
        requestUrl,
        loadId,
        reason,
        restaurantId: String(restaurantId),
        request: () =>
          axios.post(
            requestUrl,
            { restaurantId },
            { headers: { Authorization: `Bearer ${token}` } },
          ),
      })
        .then((response) => {
          const { token: updatedToken } = response.data;
          localStorage.setItem("token", updatedToken);

          const employeeRequestUrl = `${process.env.NEXT_PUBLIC_API_URL}/employees/me`;
          measureFrontendRequest({
            name: "employee_restaurant_data",
            kind: "restaurant",
            requestUrl: employeeRequestUrl,
            loadId,
            reason,
            restaurantId: String(restaurantId),
            request: () =>
              axios.get(employeeRequestUrl, {
                headers: { Authorization: `Bearer ${updatedToken}` },
              }),
          })
            .then(async (res) => {
              const { restaurant, restaurants } = res.data;
              const rid = restaurant?._id
                ? String(restaurant._id)
                : String(restaurantId);
              setRestaurantsList(restaurants || []);
              setRestaurantData(restaurant || null);
              await syncRestaurantReservations(restaurant, updatedToken, {
                reason,
                loadId,
              });

              // ✅ reset drawer list
              setNotifications([]);
              setNotificationsNextCursor(null);
              setNotificationsNextCursorByModule({
                all: null,
                reservations: null,
                gift_cards: null,
                employees: null,
                take_away: null,
              });
              setNotificationsLoading(false);

              // ✅ refresh counts for new restaurant
              if (restaurant?._id) {
                await fetchUnreadCounts(updatedToken, rid, {
                  reason,
                  loadId,
                });
              } else {
                setUnreadCounts({
                  total: 0,
                  byModule: EMPTY_UNREAD_BY_MODULE,
                });
              }

              setDataLoading(false);
              markFrontendDataLoadingFalse(loadId, {
                reason,
                restaurantId: rid,
              });
              setCloseEditing(false);
            })
            .catch((err) => {
              console.error(
                "Erreur lors de la récupération des données employé après changement de resto:",
                err,
              );
              setDataLoading(false);
              markFrontendDataLoadingFalse(loadId, {
                reason,
                restaurantId: String(restaurantId),
              });
              setCloseEditing(false);
            });
        })
        .catch((error) => {
          if (error.response?.status === 403) {
            handleInvalidToken();
          } else {
            console.error(
              "Erreur lors de la sélection du restaurant (employee):",
              error,
            );
            setDataLoading(false);
            setCloseEditing(false);
          }
          markFrontendDataLoadingFalse(loadId, {
            reason,
            restaurantId: String(restaurantId),
          });
        });
      return;
    }

    setDataLoading(false);
    markFrontendDataLoadingFalse(loadId, {
      reason,
      restaurantId: String(restaurantId),
    });
    setCloseEditing(false);
  }

  async function refetchCurrentRestaurant({
    reconnectSSE = false,
    syncNotifications = true,
    reason = "manual",
  } = {}) {
    const token =
      typeof window !== "undefined" ? localStorage.getItem("token") : null;
    const rid = restaurantData?._id;

    if (!token || !rid) return;

    const path = typeof window !== "undefined" ? window.location.pathname : "";
    if (!path.startsWith("/dashboard")) return;
    if (path.startsWith("/dashboard/login")) return;

    let decoded = null;
    try {
      decoded = jwtDecode(token);
    } catch (err) {
      console.error("Invalid token during refetch:", err);
      handleInvalidToken();
      return;
    }

    const role = decoded?.role;
    const loadId = beginFrontendLoad(reason, String(rid));

    try {
      setDataLoading(true);
      markFrontendLoadPhase(loadId, "data_loading_true", {
        reason,
        restaurantId: String(rid),
      });

      if (role === "owner") {
        const requestUrl = `${process.env.NEXT_PUBLIC_API_URL}/owner/restaurants/${rid}`;
        markFrontendLoadPhase(loadId, "restaurant_data_start", {
          reason,
          restaurantId: String(rid),
          role,
        });
        const response = await measureFrontendRequest({
          name: "owner_restaurant_data",
          kind: "restaurant",
          requestUrl,
          loadId,
          reason,
          restaurantId: String(rid),
          request: () =>
            axios.get(requestUrl, {
              headers: { Authorization: `Bearer ${token}` },
            }),
        });

        const restaurant = response?.data?.restaurant || null;
        markFrontendLoadPhase(loadId, "restaurant_data_end", {
          reason,
          restaurantId: String(rid),
          role,
        });
        setRestaurantData(restaurant);
        await syncRestaurantReservations(restaurant, token, {
          reason,
          loadId,
        });

        if (restaurant?._id) {
          await fetchUnreadCounts(token, String(restaurant._id), {
            reason,
            loadId,
          });

          if (syncNotifications) {
            await fetchNotifications({
              restaurantId: String(restaurant._id),
              reset: true,
              reason,
              loadId,
            });
          }
        }
      } else if (role === "employee") {
        const requestUrl = `${process.env.NEXT_PUBLIC_API_URL}/employees/me`;
        markFrontendLoadPhase(loadId, "restaurant_data_start", {
          reason,
          restaurantId: String(rid),
          role,
        });
        const res = await measureFrontendRequest({
          name: "employee_restaurant_data",
          kind: "restaurant",
          requestUrl,
          loadId,
          reason,
          restaurantId: String(rid),
          request: () =>
            axios.get(requestUrl, {
              headers: { Authorization: `Bearer ${token}` },
            }),
        });

        const { restaurant, restaurants } = res.data || {};
        markFrontendLoadPhase(loadId, "restaurant_data_end", {
          reason,
          restaurantId: String(rid),
          role,
        });
        setRestaurantsList(restaurants || []);
        setRestaurantData(restaurant || null);
        await syncRestaurantReservations(restaurant, token, {
          reason,
          loadId,
        });

        if (restaurant?._id) {
          await fetchUnreadCounts(token, String(restaurant._id), {
            reason,
            loadId,
          });

          if (syncNotifications) {
            await fetchNotifications({
              restaurantId: String(restaurant._id),
              reset: true,
              reason,
              loadId,
            });
          }
        } else {
          setUnreadCounts({
            total: 0,
            byModule: EMPTY_UNREAD_BY_MODULE,
          });
        }
      }

      if (reconnectSSE) {
        reconnectRealtime();
      }
    } catch (error) {
      if (error.response?.status === 403) {
        handleInvalidToken();
      } else {
        console.error("Erreur lors du refetch du restaurant:", error);
      }
    } finally {
      setDataLoading(false);
      markFrontendDataLoadingFalse(loadId, {
        reason,
        restaurantId: String(rid),
      });
    }
  }

  async function resyncAfterForeground({
    hard = false,
    reason = "unknown",
  } = {}) {
    await refetchCurrentRestaurant({
      reconnectSSE: true,
      syncNotifications: true,
      reason,
    });

    if (!hard) return;
  }

  function getDeletionMinutes(parameters) {
    const enabled = parameters?.deletion_duration === true;

    // Si le switch est ON → on utilise la durée configurée
    if (enabled) {
      const n = Number(
        parameters?.deletion_duration_minutes ||
          DEFAULT_RESERVATION_DELETION_MINUTES,
      );
      return Number.isFinite(n) && n > 0
        ? n
        : DEFAULT_RESERVATION_DELETION_MINUTES;
    }

    // Si le switch est OFF → suppression auto avec le délai par défaut
    return DEFAULT_RESERVATION_DELETION_MINUTES;
  }

  // ------------------------------------------------------------
  // Auto reservation updates
  // ------------------------------------------------------------
  useEffect(() => {
    if (!restaurantData) return;

    const parameters = restaurantData?.reservationsSettings || {};
    const deletionDurationMinutes = getDeletionMinutes(parameters);

    const checkExpiredReservations = () => {
      const now = new Date();
      const reservations = reservationsList || [];
      const automationRun = startFrontendAutomationRun({
        type: "autoDelete",
        restaurantId: restaurantData?._id ? String(restaurantData._id) : null,
        reservationListLength: reservations.length,
      });
      const deletionBaseDateByStatus = {
        Finished: "finishedAt",
        Canceled: "canceledAt",
        Rejected: "rejectedAt",
        NoShow: "noShowAt",
      };

      reservations.forEach((reservation) => {
        const dateField = deletionBaseDateByStatus[reservation.status];
        if (!dateField) return;

        const baseRaw = reservation?.[dateField];
        const baseDate = baseRaw ? new Date(baseRaw) : null;
        if (!baseDate || Number.isNaN(baseDate.getTime())) return;

        const deletionThreshold = new Date(
          baseDate.getTime() + deletionDurationMinutes * 60000,
        );
        if (now >= deletionThreshold) {
          recordFrontendAutomationCandidate(automationRun);
          autoDeleteReservation(reservation, automationRun);
        }
      });

      finishFrontendAutomationScan(automationRun);
    };

    checkExpiredReservations();
    const intervalId = setInterval(checkExpiredReservations, 30000);
    return () => clearInterval(intervalId);
  }, [
    restaurantData?._id,
    reservationsList,
    restaurantData?.reservationsSettings?.deletion_duration,
    restaurantData?.reservationsSettings?.deletion_duration_minutes,
  ]);

  function getServiceBucketFromTime(reservationTime) {
    const [hh = "0"] = String(reservationTime || "00:00").split(":");
    return Number(hh) < 16 ? "lunch" : "dinner";
  }

  function getOccupancyMinutesFromRestaurant(restaurantData, reservationTime) {
    const p = restaurantData?.reservationsSettings || {};
    const bucket = getServiceBucketFromTime(reservationTime);

    const v =
      bucket === "lunch"
        ? p.table_occupancy_lunch_minutes
        : p.table_occupancy_dinner_minutes;

    const n = Number(v || 0);
    return Number.isFinite(n) && n > 0 ? n : 0;
  }

  useEffect(() => {
    if (!restaurantData) return;
    const autoFinishEnabled =
      restaurantData?.reservationsSettings?.auto_finish_reservations;
    if (!autoFinishEnabled) return;

    const checkAutoFinishReservations = () => {
      const now = new Date();
      const reservations = reservationsList || [];
      const automationRun = startFrontendAutomationRun({
        type: "autoFinish",
        restaurantId: restaurantData?._id ? String(restaurantData._id) : null,
        reservationListLength: reservations.length,
      });

      reservations.forEach((reservation) => {
        const canAutoFinish = ["Confirmed", "Active", "Late"].includes(
          reservation.status,
        );

        if (!canAutoFinish) return;

        const minutes = getOccupancyMinutesFromRestaurant(
          restaurantData,
          reservation.reservationTime,
        );

        // sécurité : si pas de durée définie, on ne fait rien
        if (!minutes) return;

        const reservationStart = new Date(reservation.reservationDate);
        const [hours, mins] = String(
          reservation.reservationTime || "00:00",
        ).split(":");
        reservationStart.setHours(
          parseInt(hours, 10),
          parseInt(mins, 10),
          0,
          0,
        );

        const finishThreshold = new Date(
          reservationStart.getTime() + minutes * 60000,
        );

        if (now >= finishThreshold) {
          recordFrontendAutomationCandidate(automationRun);
          autoUpdateToFinished(reservation, automationRun);
        }
      });

      finishFrontendAutomationScan(automationRun);
    };

    checkAutoFinishReservations();
    const intervalId = setInterval(checkAutoFinishReservations, 30000);
    return () => clearInterval(intervalId);
  }, [
    restaurantData?._id,
    reservationsList,
    restaurantData?.reservationsSettings?.auto_finish_reservations,
    restaurantData?.reservationsSettings?.table_occupancy_lunch_minutes,
    restaurantData?.reservationsSettings?.table_occupancy_dinner_minutes,
  ]);

  function autoUpdateToFinished(reservation, automationRun = null) {
    const id = String(reservation._id);

    if (autoUpdatingReservations.includes(id)) return;
    recordFrontendAutomationMutation(automationRun);
    setAutoUpdatingReservations((prev) => [...prev, id]);
    const token = localStorage.getItem("token");

    axios
      .put(
        `${process.env.NEXT_PUBLIC_API_URL}/restaurants/${restaurantData._id}/reservations/${reservation._id}/status`,
        { status: "Finished" },
        {
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
          },
        },
      )
      .then(async (response) => {
        const restaurant = response?.data?.restaurant || null;
        if (restaurant) setRestaurantData(restaurant);
        recordFrontendAutomationRefetch(automationRun);
        await fetchReservationsList(token, restaurantData?._id, "timer");
      })
      .catch((error) => {
        recordFrontendAutomationError(automationRun);
        console.error("Error auto-updating reservation to Finished:", error);
      })
      .finally(() => {
        setAutoUpdatingReservations((prev) => prev.filter((x) => x !== id));
        completeFrontendAutomationMutation(automationRun);
      });
  }

  function autoDeleteReservation(reservation, automationRun = null) {
    const id = String(reservation._id);

    if (autoDeletingReservations.includes(id)) return;
    recordFrontendAutomationMutation(automationRun);
    setAutoDeletingReservations((prev) => [...prev, id]);

    const token = localStorage.getItem("token");

    axios
      .delete(
        `${process.env.NEXT_PUBLIC_API_URL}/restaurants/${restaurantData._id}/reservations/${reservation._id}`,
        {
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
          },
        },
      )
      .then(async (response) => {
        const restaurant = response?.data?.restaurant || null;
        if (restaurant) setRestaurantData(restaurant);
        recordFrontendAutomationRefetch(automationRun);
        await fetchReservationsList(token, restaurantData?._id, "timer");
      })
      .catch((error) => {
        recordFrontendAutomationError(automationRun);
        if (error?.response?.status === 404) return;
        console.error("Error auto-deleting reservation:", error);
      })
      .finally(() => {
        setAutoDeletingReservations((prev) => prev.filter((x) => x !== id)); // ✅
        completeFrontendAutomationMutation(automationRun);
      });
  }

  function logout() {
    localStorage.removeItem("token");

    if (sseRef.current) {
      sseRef.current.close();
      sseRef.current = null;
    }

    setUnreadCounts({
      total: 0,
      byModule: EMPTY_UNREAD_BY_MODULE,
    });

    setRestaurantData(null);
    setReservationsList([]);
    setRestaurantsList([]);
    setNotifications([]);
    setNotificationsNextCursor(null);
    setNotificationsNextCursorByModule({
      all: null,
      reservations: null,
      gift_cards: null,
      employees: null,
      take_away: null,
    });
    setNotificationsLoading(false);
    setIsAuth(false);
    router.replace("/dashboard/login");
  }

  // ----------------------------------------
  // Bootstrap fetch on dashboard navigation
  // ----------------------------------------
  useEffect(() => {
    const handleRouteChangeComplete = (url) => {
      if (!url.startsWith("/dashboard")) return;
      if (url.startsWith("/dashboard/admin")) return;
      if (url.startsWith("/dashboard/login")) return;

      if (!hasFetchedDashboardDataRef.current) {
        fetchRestaurantsList();
        hasFetchedDashboardDataRef.current = true;
      }
    };

    router.events.on("routeChangeComplete", handleRouteChangeComplete);
    return () => {
      router.events.off("routeChangeComplete", handleRouteChangeComplete);
    };
  }, [router.events]);

  useEffect(() => {
    const path = router.pathname;

    if (!path.startsWith("/dashboard")) return;
    if (path.startsWith("/dashboard/admin")) return;
    if (path.startsWith("/dashboard/login")) return;

    if (!hasFetchedDashboardDataRef.current) {
      fetchRestaurantsList();
      hasFetchedDashboardDataRef.current = true;
    }
  }, [router.pathname]);

  useEffect(() => {
    const token = localStorage.getItem("token");
    if (!token) return;

    try {
      const decoded = jwtDecode(token);
      if (decoded) {
        setUserConnected(decoded);
        setIsAuth(true);
      }
    } catch (err) {
      console.error("Token invalide :", err);
      handleInvalidToken();
    }
  }, [router.pathname]);

  return {
    restaurantData,
    setRestaurantData,
    reservationsList,
    setReservationsList,
    userConnected,
    setUserConnected,
    restaurantsList,
    dataLoading,
    setDataLoading,
    setRestaurantsList,
    handleRestaurantSelect,
    fetchRestaurantsList,
    fetchRestaurantData,
    fetchReservationsList,
    refreshReservationsList,
    logout,
    setCloseEditing,
    closeEditing,
    isAuth,
    setIsAuth,
    newReservationsCount,
    newLeaveRequestsCount,
    newGiftPurchasesCount,
    unreadCounts,
    notifications,
    notificationsNextCursor,
    notificationsNextCursorByModule,
    notificationsLoading,
    fetchNotifications,
    lastNotificationsSyncRef,
    markNotificationRead,
    markAllRead,
    refetchCurrentRestaurant,
    reconnectRealtime,
    resyncAfterForeground,
    fetchCustomersCached,
    invalidateCustomersCache,
    peekCustomersCache,
  };
}
