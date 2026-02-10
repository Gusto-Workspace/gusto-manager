import { useEffect, useRef, useState, useCallback } from "react";
import { useRouter } from "next/router";

// AXIOS
import axios from "axios";

// JWT
import { jwtDecode } from "jwt-decode";

export default function RestaurantContext() {
  const router = useRouter();

  const [restaurantData, setRestaurantData] = useState(null);
  const [userConnected, setUserConnected] = useState(null);
  const [restaurantsList, setRestaurantsList] = useState([]);
  const [dataLoading, setDataLoading] = useState(true);
  const [closeEditing, setCloseEditing] = useState(false);
  const [isAuth, setIsAuth] = useState(false);

  const [autoDeletingReservations, setAutoDeletingReservations] = useState([]);
  const [autoUpdatingReservations, setAutoUpdatingReservations] = useState([]);

  const [unreadCounts, setUnreadCounts] = useState({
    total: 0,
    byModule: { reservations: 0, gift_cards: 0, employees: 0 },
  });

  // ✅ Liste de notifications (pour le drawer)
  const [notifications, setNotifications] = useState([]);
  const [notificationsNextCursor, setNotificationsNextCursor] = useState(null);
  const [notificationsLoading, setNotificationsLoading] = useState(false);

  // ✅ si tu veux garder tes variables existantes (compat UI)
  const newReservationsCount = unreadCounts.byModule.reservations || 0;
  const newGiftPurchasesCount = unreadCounts.byModule.gift_cards || 0;
  const newLeaveRequestsCount = unreadCounts.byModule.employees || 0;

  const initialReservationsLoadedRef = useRef(false);
  const hasFetchedDashboardDataRef = useRef(false);
  const sseRef = useRef(null);
  const currentPathRef = useRef("");

  useEffect(() => {
    currentPathRef.current = router.pathname || "";
  }, [router.pathname]);

  // ---------------------------
  // Notifications helpers (NEW)
  // ---------------------------

  const fetchNotifications = useCallback(
    async ({
      module = null,
      unreadOnly = false,
      limit = 30,
      cursor = null,
      reset = true,
    } = {}) => {
      const token =
        typeof window !== "undefined" ? localStorage.getItem("token") : null;
      const rid = restaurantData?._id;
      if (!token || !rid) return;

      if (reset) setNotificationsNextCursor(null);

      setNotificationsLoading(true);

      try {
        const { data } = await axios.get(
          `${process.env.NEXT_PUBLIC_API_URL}/restaurants/${rid}/notifications`,
          {
            headers: { Authorization: `Bearer ${token}` },
            params: {
              limit,
              unreadOnly: unreadOnly ? "true" : "false",
              ...(module ? { module } : {}),
              ...(cursor ? { cursor } : {}),
            },
          },
        );

        const items = Array.isArray(data?.notifications)
          ? data.notifications
          : [];
        const next = data?.nextCursor ?? null;

        setNotificationsNextCursor(next);

        setNotifications((prev) => {
          if (reset) return items;

          const map = new Map(prev.map((n) => [String(n._id), n]));
          for (const n of items) map.set(String(n._id), n);

          return Array.from(map.values()).sort(
            (a, b) => new Date(b.createdAt) - new Date(a.createdAt),
          );
        });
      } catch (e) {
        console.warn("Failed to fetch notifications list", e);
      } finally {
        setNotificationsLoading(false);
      }
    },
    [restaurantData?._id],
  );

  async function fetchUnreadCounts(token, rid) {
    if (!token || !rid) return;

    try {
      const { data } = await axios.get(
        `${process.env.NEXT_PUBLIC_API_URL}/restaurants/${rid}/notifications/unread-counts`,
        { headers: { Authorization: `Bearer ${token}` } },
      );

      // attendu : { total, byModule: { reservations, gift_cards, employees } }
      setUnreadCounts({
        total: data?.total ?? 0,
        byModule: {
          reservations: data?.byModule?.reservations ?? 0,
          gift_cards: data?.byModule?.gift_cards ?? 0,
          employees: data?.byModule?.employees ?? 0,
        },
      });
    } catch (e) {
      console.warn("Failed to fetch unread notifications counts", e);
      // en cas d'erreur -> on garde l'état précédent
    }
  }

  function bumpUnreadLocal(moduleKey) {
    if (!moduleKey) return;

    setUnreadCounts((prev) => {
      const nextBy = {
        ...(prev?.byModule || { reservations: 0, gift_cards: 0, employees: 0 }),
      };
      nextBy[moduleKey] = (nextBy[moduleKey] || 0) + 1;

      const total =
        (nextBy.reservations || 0) +
        (nextBy.gift_cards || 0) +
        (nextBy.employees || 0);

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

        await fetchUnreadCounts(token, rid);
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

        await fetchUnreadCounts(token, rid);
      } catch (e) {
        console.warn("Failed to mark all notifications read", e);
      }
    },
    [restaurantData?._id],
  );

  // --------------------------------------------------------
  // SSE: keep real-time injections + NEW notification events
  // --------------------------------------------------------
  useEffect(() => {
    const restaurantId = restaurantData?._id;
    const role = userConnected?.role;

    if (!restaurantId || !role) return;

    // Fermer ancienne connexion si existante
    if (sseRef.current) {
      sseRef.current.close();
      sseRef.current = null;
    }

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

        // ——— CONGÉS (création) ———
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

        // ——— RÉSERVATIONS (création) ———
        if (payload.type === "reservation_created" && payload.reservation) {
          const r = payload.reservation;

          setRestaurantData((prev) => {
            if (!prev) return prev;
            const list = prev?.reservations?.list || [];
            const exists = list.some((x) => String(x._id) === String(r._id));
            if (exists) return prev;
            return {
              ...prev,
              reservations: {
                ...prev.reservations,
                list: [r, ...list],
              },
            };
          });
        }

        // ——— RÉSERVATIONS (mise à jour statut) ———

        if (payload.type === "reservation_updated" && payload.reservation) {
          const r = payload.reservation;

          setRestaurantData((prev) => {
            if (!prev) return prev;

            const list = prev?.reservations?.list || [];
            const id = String(r._id);

            const nextList = list.map((x) => (String(x._id) === id ? r : x));

            return {
              ...prev,
              reservations: {
                ...prev.reservations,
                list: nextList,
              },
            };
          });
        }

        // ——— RÉSERVATIONS (suppression) ———
        if (payload.type === "reservation_deleted" && payload.reservationId) {
          const deletedId = String(payload.reservationId);

          setRestaurantData((prev) => {
            if (!prev) return prev;
            const list = prev?.reservations?.list || [];
            return {
              ...prev,
              reservations: {
                ...prev.reservations,
                list: list.filter((x) => String(x._id) !== deletedId),
              },
            };
          });
        }

        // ——— CARTES CADEAUX (temps réel, inchangé) ———
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
      } catch (e) {
        console.warn("Bad SSE payload", e);
      }
    };

    es.onerror = () => {
      // le navigateur va réessayer automatiquement
    };

    return () => {
      es.close();
      sseRef.current = null;
    };
  }, [restaurantData?._id, userConnected?.role]); // ok

  // ---------------------------
  // Misc helpers
  // ---------------------------

  function inferRequiredModuleFromPath(pathname = "") {
    if (pathname.startsWith("/dashboard/webapp/reservations"))
      return "reservations";
    if (pathname.startsWith("/dashboard/webapp/gift-cards"))
      return "gift_cards";
    return null;
  }

  function handleInvalidToken() {
    setRestaurantsList([]);
    setRestaurantData(null);
    setUserConnected(null);
    setNotifications([]);
    setNotificationsNextCursor(null);
    setNotificationsLoading(false);
    setIsAuth(false);

    // ✅ stop le loader (sinon splash infini)
    setDataLoading(false);

    localStorage.removeItem("token");

    // ✅ reset counts
    setUnreadCounts({
      total: 0,
      byModule: { reservations: 0, gift_cards: 0, employees: 0 },
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
  function fetchRestaurantData(token, restaurantId) {
    setDataLoading(true);

    axios
      .get(
        `${process.env.NEXT_PUBLIC_API_URL}/owner/restaurants/${restaurantId}`,
        { headers: { Authorization: `Bearer ${token}` } },
      )
      .then(async (response) => {
        const restaurant = response.data.restaurant;
        const rid = String(restaurant._id);

        let role = null;
        try {
          role = jwtDecode(token)?.role || null;
        } catch {}

        setNotifications([]);
        setNotificationsNextCursor(null);
        setNotificationsLoading(false);

        setRestaurantData(restaurant);

        // ✅ NEW: counts depuis l'API (owner)
        if (role === "owner") {
          await fetchUnreadCounts(token, rid);
        } else {
          // employés: pas de pastilles
          setUnreadCounts({
            total: 0,
            byModule: { reservations: 0, gift_cards: 0, employees: 0 },
          });
        }

        setDataLoading(false);
      })
      .catch((error) => {
        if (error.response?.status === 403) handleInvalidToken();
        else {
          console.error(
            "Erreur lors de la récupération des données du restaurant:",
            error,
          );
          setDataLoading(false);
        }
      });
  }

  function fetchRestaurantsList() {
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

    setDataLoading(true);

    // ----- OWNER -----
    if (role === "owner") {
      axios
        .get(`${process.env.NEXT_PUBLIC_API_URL}/owner/restaurants`, {
          headers: { Authorization: `Bearer ${token}` },
          params: { ownerId: decodedToken.id },
        })
        .then((response) => {
          const restaurants = response.data.restaurants || [];
          setRestaurantsList(restaurants);

          if (!restaurants.length) {
            setRestaurantData(null);
            setDataLoading(false);
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

          fetchRestaurantData(token, selectedRestaurantId);
          setIsAuth(true);
        })
        .catch((error) => {
          if (error.response?.status === 403) {
            handleInvalidToken();
          } else {
            console.error(
              "Erreur lors de la récupération des restaurants (owner):",
              error,
            );
            setDataLoading(false);
          }
        });

      return;
    }

    // ----- EMPLOYEE -----
    if (role === "employee") {
      axios
        .get(`${process.env.NEXT_PUBLIC_API_URL}/employees/me`, {
          headers: { Authorization: `Bearer ${token}` },
        })
        .then(async (res) => {
          const { restaurant, restaurants } = res.data;

          setRestaurantsList(restaurants || []);
          setRestaurantData(restaurant || null);

          // ✅ notifications counts aussi pour employee
          if (restaurant?._id) {
            await fetchUnreadCounts(token, String(restaurant._id));
          } else {
            setUnreadCounts({
              total: 0,
              byModule: { reservations: 0, gift_cards: 0, employees: 0 },
            });
          }

          // ✅ reset liste notifs (propre)
          setNotifications([]);
          setNotificationsNextCursor(null);
          setNotificationsLoading(false);

          setIsAuth(true);
          setDataLoading(false);
        })
        .catch((error) => {
          if (error.response?.status === 403) {
            handleInvalidToken();
          } else {
            console.error(
              "Erreur lors de la récupération des restaurants (employee):",
              error,
            );
            setDataLoading(false);
          }
        });

      return;
    }

    console.warn("Unknown role in token:", role);
    handleInvalidToken();
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

    setDataLoading(true);
    setCloseEditing(true);

    // ----- OWNER -----
    if (role === "owner") {
      axios
        .post(
          `${process.env.NEXT_PUBLIC_API_URL}/owner/change-restaurant`,
          { restaurantId },
          { headers: { Authorization: `Bearer ${token}` } },
        )
        .then((response) => {
          const { token: updatedToken } = response.data;
          localStorage.setItem("token", updatedToken);
          fetchRestaurantData(updatedToken, restaurantId);
          initialReservationsLoadedRef.current = false;
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
        });
      return;
    }

    // ----- EMPLOYEE -----
    if (role === "employee") {
      axios
        .post(
          `${process.env.NEXT_PUBLIC_API_URL}/employees/change-restaurant`,
          { restaurantId },
          { headers: { Authorization: `Bearer ${token}` } },
        )
        .then((response) => {
          const { token: updatedToken } = response.data;
          localStorage.setItem("token", updatedToken);

          axios
            .get(`${process.env.NEXT_PUBLIC_API_URL}/employees/me`, {
              headers: { Authorization: `Bearer ${updatedToken}` },
            })
            .then(async (res) => {
              const { restaurant, restaurants } = res.data;
              setRestaurantsList(restaurants || []);
              setRestaurantData(restaurant || null);

              // ✅ reset drawer list
              setNotifications([]);
              setNotificationsNextCursor(null);
              setNotificationsLoading(false);

              // ✅ refresh counts for new restaurant
              if (restaurant?._id) {
                await fetchUnreadCounts(updatedToken, String(restaurant._id));
              } else {
                setUnreadCounts({
                  total: 0,
                  byModule: { reservations: 0, gift_cards: 0, employees: 0 },
                });
              }

              setDataLoading(false);
              setCloseEditing(false);
            })
            .catch((err) => {
              console.error(
                "Erreur lors de la récupération des données employé après changement de resto:",
                err,
              );
              setDataLoading(false);
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
        });
      return;
    }

    setDataLoading(false);
    setCloseEditing(false);
  }

  function refetchCurrentRestaurant() {
    const token = localStorage.getItem("token");
    const rid = restaurantData?._id;

    if (!token || !rid) return;

    const path = typeof window !== "undefined" ? window.location.pathname : "";
    if (!path.startsWith("/dashboard")) return;
    if (path.startsWith("/dashboard/login")) return;

    fetchRestaurantData(token, rid);
  }

  function getDeletionMinutes(parameters) {
    const enabled = parameters?.deletion_duration === true;

    // Si le switch est ON → on utilise la durée configurée
    if (enabled) {
      const n = Number(parameters?.deletion_duration_minutes || 1440);
      return Number.isFinite(n) && n > 0 ? n : 1440;
    }

    // Si le switch est OFF → suppression auto quand même à 24h
    return 1440;
  }

  // ------------------------------------------------------------
  // Auto reservation updates
  // ------------------------------------------------------------
  useEffect(() => {
    if (!restaurantData) return;

    const parameters = restaurantData?.reservations?.parameters || {};
    const deletionDurationMinutes = getDeletionMinutes(parameters);

    const checkExpiredReservations = () => {
      const now = new Date();
      const reservations = restaurantData.reservations.list || [];
      reservations.forEach((reservation) => {
        if (reservation.status === "Finished" && reservation.finishedAt) {
          const finishedAt = new Date(reservation.finishedAt);
          const deletionThreshold = new Date(
            finishedAt.getTime() + deletionDurationMinutes * 60000,
          );
          if (now >= deletionThreshold) autoDeleteReservation(reservation);
        }
      });
    };

    checkExpiredReservations();
    const intervalId = setInterval(checkExpiredReservations, 30000);
    return () => clearInterval(intervalId);
  }, [
    restaurantData?._id,
    restaurantData?.reservations?.list,
    restaurantData?.reservations?.parameters?.deletion_duration,
    restaurantData?.reservations?.parameters?.deletion_duration_minutes,
  ]);

  useEffect(() => {
    if (!restaurantData) return;

    const DELETE_MINUTES = 10;
    const STATUS_TO_DATE_FIELD = {
      Canceled: "canceledAt",
      Rejected: "rejectedAt",
    };

    const checkAutoDeleteShortLived = () => {
      const now = new Date();
      const reservations = restaurantData?.reservations?.list || [];

      reservations.forEach((r) => {
        const dateField = STATUS_TO_DATE_FIELD[r.status];
        if (!dateField) return;

        const baseRaw = r?.[dateField];
        const base = baseRaw ? new Date(baseRaw) : null;
        if (!base || Number.isNaN(base.getTime())) return;

        const threshold = new Date(base.getTime() + DELETE_MINUTES * 60000);
        if (now >= threshold) autoDeleteReservation(r);
      });
    };

    checkAutoDeleteShortLived();
    const id = setInterval(checkAutoDeleteShortLived, 30000);
    return () => clearInterval(id);
  }, [restaurantData?._id, restaurantData?.reservations?.list]);

  useEffect(() => {
    if (!restaurantData) return;

    const checkLateReservations = () => {
      const now = new Date();
      const gracePeriod = 5 * 60000;
      const reservations = restaurantData.reservations.list || [];

      reservations.forEach((reservation) => {
        if (reservation.status === "Confirmed") {
          const reservationDate = new Date(reservation.reservationDate);
          const [hours, minutes] = reservation.reservationTime.split(":");
          reservationDate.setHours(
            parseInt(hours, 10),
            parseInt(minutes, 10),
            0,
            0,
          );

          const reservationDateWithGrace = new Date(
            reservationDate.getTime() + gracePeriod,
          );

          if (now >= reservationDateWithGrace) autoUpdateToLate(reservation);
        }
      });
    };

    checkLateReservations();
    const updateIntervalId = setInterval(checkLateReservations, 30000);
    return () => clearInterval(updateIntervalId);
  }, [restaurantData?._id, restaurantData?.reservations?.list]);

  function getServiceBucketFromTime(reservationTime) {
    const [hh = "0"] = String(reservationTime || "00:00").split(":");
    return Number(hh) < 16 ? "lunch" : "dinner";
  }

  function getOccupancyMinutesFromRestaurant(restaurantData, reservationTime) {
    const p = restaurantData?.reservations?.parameters || {};
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
      restaurantData?.reservations?.parameters?.auto_finish_reservations;
    if (!autoFinishEnabled) return;

    const checkAutoFinishReservations = () => {
      const now = new Date();
      const reservations = restaurantData.reservations.list || [];

      reservations.forEach((reservation) => {
        if (reservation.status !== "Active") return;

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

        if (now >= finishThreshold) autoUpdateToFinished(reservation);
      });
    };

    checkAutoFinishReservations();
    const intervalId = setInterval(checkAutoFinishReservations, 30000);
    return () => clearInterval(intervalId);
  }, [
    restaurantData?._id,
    restaurantData?.reservations?.list,
    restaurantData?.reservations?.parameters?.auto_finish_reservations,
    restaurantData?.reservations?.parameters?.table_occupancy_lunch_minutes,
    restaurantData?.reservations?.parameters?.table_occupancy_dinner_minutes,
  ]);

  function autoUpdateToFinished(reservation) {
    const id = String(reservation._id);

    if (autoUpdatingReservations.includes(id)) return;
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
      .then((response) => {
        setRestaurantData((prevData) => ({
          ...prevData,
          reservations: {
            ...prevData.reservations,
            list: response.data.restaurant.reservations.list,
          },
        }));
      })
      .catch((error) => {
        console.error("Error auto-updating reservation to Finished:", error);
      })
      .finally(() => {
        setAutoUpdatingReservations((prev) => prev.filter((x) => x !== id));
      });
  }

  function autoUpdateToLate(reservation) {
    const id = String(reservation._id);

    if (autoUpdatingReservations.includes(id)) return;
    setAutoUpdatingReservations((prev) => [...prev, id]);

    const token = localStorage.getItem("token");
    axios
      .put(
        `${process.env.NEXT_PUBLIC_API_URL}/restaurants/${restaurantData._id}/reservations/${reservation._id}/status`,
        { status: "Late" },
        {
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
          },
        },
      )
      .then((response) => {
        setRestaurantData((prevData) => ({
          ...prevData,
          reservations: {
            ...prevData.reservations,
            list: response.data.restaurant.reservations.list,
          },
        }));
      })
      .catch((error) => {
        console.error("Error auto-updating reservation to Late:", error);
      })
      .finally(() => {
        setAutoUpdatingReservations((prev) => prev.filter((x) => x !== id));
      });
  }

  function autoDeleteReservation(reservation) {
    const id = String(reservation._id);

    if (autoDeletingReservations.includes(id)) return;
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
      .then((response) => {
        setRestaurantData((prevData) => ({
          ...prevData,
          reservations: {
            ...prevData.reservations,
            list: response.data.restaurant.reservations.list,
          },
        }));
      })
      .catch((error) => {
        console.error("Error auto-deleting reservation:", error);
      })
      .finally(() => {
        setAutoDeletingReservations((prev) => prev.filter((x) => x !== id)); // ✅
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
      byModule: { reservations: 0, gift_cards: 0, employees: 0 },
    });

    setRestaurantData(null);
    setRestaurantsList([]);
    setNotifications([]);
    setNotificationsNextCursor(null);
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
    userConnected,
    setUserConnected,
    restaurantsList,
    dataLoading,
    setRestaurantsList,
    handleRestaurantSelect,
    fetchRestaurantsList,
    fetchRestaurantData,
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
    notificationsLoading,
    fetchNotifications,

    markNotificationRead,
    markAllRead,

    refetchCurrentRestaurant,
  };
}
