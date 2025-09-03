import { useEffect, useRef, useState } from "react";
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

  const [newReservationsCount, setNewReservationsCount] = useState(0);
  const [newLeaveRequestsCount, setNewLeaveRequestsCount] = useState(0);

  const initialReservationsLoadedRef = useRef(false);
  const hasFetchedDashboardDataRef = useRef(false);

  const sseRef = useRef(null);

  const NOTIF_KEY = (rid) => `gm:notifs:${rid}`;

  function readNotifCounts(rid) {
    try {
      const raw = localStorage.getItem(NOTIF_KEY(rid));
      if (!raw) return { leave: 0, res: 0 };
      const obj = JSON.parse(raw);
      return {
        leave: Number(obj.leave) || 0,
        res: Number(obj.res) || 0,
      };
    } catch {
      return { leave: 0, res: 0 };
    }
  }

  function writeNotifCounts(rid, counts) {
    try {
      localStorage.setItem(NOTIF_KEY(rid), JSON.stringify(counts));
    } catch {}
  }

  function clearNotifCounts(rid) {
    try {
      localStorage.removeItem(NOTIF_KEY(rid));
    } catch {}
  }

  useEffect(() => {
    const restaurantId = restaurantData?._id;
    if (!restaurantId) return;

    if (userConnected?.role !== "owner") {
      // s'assure qu'aucune SSE n'est ouverte et pas de compteur pour employé
      if (sseRef.current) {
        sseRef.current.close();
        sseRef.current = null;
      }
      setNewLeaveRequestsCount(0);
      setNewReservationsCount(0);
      return;
    }

    const persisted = readNotifCounts(restaurantId);
    setNewLeaveRequestsCount(persisted.leave);
    setNewReservationsCount(persisted.res);

    // ferme une ancienne connexion si on change de resto
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
        if (payload.type === "leave_request_created") {
          // 1) incrémente le compteur
          setNewLeaveRequestsCount((c) => {
            const next = c + 1;
            const rid = restaurantData?._id;
            if (rid) {
              const counts = readNotifCounts(rid);
              writeNotifCounts(rid, { ...counts, leave: next });
            }
            return next;
          });

          // 2) *** mettre à jour la liste locale des demandes ***
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
                  (r) => String(r._id) === String(lr._id)
                );
                if (already) return e;
                return { ...e, leaveRequests: [...existing, lr] };
              }),
            };
          });
        }
      } catch (e) {
        console.warn("Bad SSE payload", e);
      }
    };

    es.onerror = () => {
      // le navigateur va réessayer automatiquement; rien à faire
    };

    return () => {
      es.close();
      sseRef.current = null;
    };
  }, [restaurantData?._id, userConnected?.role]);

  function handleInvalidToken() {
    setRestaurantsList([]);
    localStorage.removeItem("token");
    router.push("/dashboard/login");
  }

  function fetchRestaurantData(token, restaurantId) {
    setDataLoading(true);
    axios
      .get(
        `${process.env.NEXT_PUBLIC_API_URL}/owner/restaurants/${restaurantId}`,
        {
          headers: { Authorization: `Bearer ${token}` },
        }
      )
      .then(async (response) => {
        const restaurant = response.data.restaurant;
        const rid = String(restaurant._id);

        let role = null;
        try {
          role = jwtDecode(token)?.role || null;
        } catch {}

        if (role === "owner") {
          const lastCheck = restaurant.lastNotificationCheck;

          // Réservations depuis lastCheck
          const newCount = restaurant.reservations.list.filter(
            (r) => !r.manual && new Date(r.createdAt) > new Date(lastCheck)
          ).length;
          setNewReservationsCount(newCount);
          writeNotifCounts(rid, { ...readNotifCounts(rid), res: newCount });

          // Backfill congés ratés pendant la déconnexion
          try {
            const { data } = await axios.get(
              `${process.env.NEXT_PUBLIC_API_URL}/restaurants/${rid}/leave-requests/unread-count`,
              {
                params: { since: lastCheck },
                headers: { Authorization: `Bearer ${token}` },
              }
            );
            const unreadLeaves = data?.unreadLeaveRequests || 0;
            setNewLeaveRequestsCount(unreadLeaves);
            writeNotifCounts(rid, {
              ...readNotifCounts(rid),
              leave: unreadLeaves,
            });
          } catch (e) {
            console.warn("Failed to fetch unread leave-requests count", e);
          }
        } else {
          // Employé : pas de compteurs ni persistance
          setNewReservationsCount(0);
          setNewLeaveRequestsCount(0);
          writeNotifCounts(rid, { leave: 0, res: 0 });
        }

        setRestaurantData(restaurant);
        setDataLoading(false);
      })
      .catch((error) => {
        if (error.response?.status === 403) handleInvalidToken();
        else {
          console.error(
            "Erreur lors de la récupération des données du restaurant:",
            error
          );
          setDataLoading(false);
        }
      });
  }

  function fetchRestaurantsList() {
    const token = localStorage.getItem("token");

    if (!token) {
      handleInvalidToken();
    } else {
      try {
        const decodedToken = jwtDecode(token);

        if (!decodedToken.id) {
          throw new Error("Invalid token: ownerId is missing");
        }

        setDataLoading(true);

        axios
          .get(`${process.env.NEXT_PUBLIC_API_URL}/owner/restaurants`, {
            headers: {
              Authorization: `Bearer ${token}`,
            },
            params: {
              ownerId: decodedToken.id,
            },
          })
          .then((response) => {
            setRestaurantsList(response.data.restaurants);

            const selectedRestaurantId =
              decodedToken.restaurantId || response.data.restaurants[0]._id;

            fetchRestaurantData(token, selectedRestaurantId);
            setIsAuth(true);
          })
          .catch((error) => {
            if (error.response?.status === 403) {
              handleInvalidToken();
            } else {
              console.error(
                "Erreur lors de la récupération des restaurants:",
                error
              );
              setDataLoading(false);
            }
          });
      } catch (error) {
        console.error("Invalid token:", error);
        handleInvalidToken();
      }
    }
  }

  function handleRestaurantSelect(restaurantId) {
    const token = localStorage.getItem("token");
    if (token) {
      setDataLoading(true);
      setCloseEditing(true);
      axios
        .post(
          `${process.env.NEXT_PUBLIC_API_URL}/owner/change-restaurant`,
          { restaurantId },
          { headers: { Authorization: `Bearer ${token}` } }
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
            console.error("Erreur lors de la sélection du restaurant:", error);
            setDataLoading(false);
            setCloseEditing(false);
          }
        });
    }
  }

  // Fonction pour mettre à jour le champ lastNotificationCheck dans la BDD
  function updateLastNotificationCheck() {
    if (userConnected?.role !== "owner") return;
    if (!restaurantData?._id) return;
    const token = localStorage.getItem("token");
    axios
      .put(
        `${process.env.NEXT_PUBLIC_API_URL}/restaurants/${restaurantData._id}/notification-check`,
        {},
        {
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
          },
        }
      )
      .catch((error) => {
        console.error("Error updating lastNotificationCheck:", error);
      });
  }

  // VERIFICATION DES RESERVATIONS TERMINEES A SUPPRIMER
  useEffect(() => {
    if (!restaurantData) return;

    const deletionDurationMinutes =
      restaurantData?.reservations?.parameters?.deletion_duration_minutes;
    if (!deletionDurationMinutes) return;

    const checkExpiredReservations = () => {
      const now = new Date();
      const reservations = restaurantData.reservations.list || [];
      reservations.forEach((reservation) => {
        if (reservation.status === "Finished" && reservation.finishedAt) {
          const finishedAt = new Date(reservation.finishedAt);
          const deletionThreshold = new Date(
            finishedAt.getTime() + deletionDurationMinutes * 60000
          );
          if (now >= deletionThreshold) {
            autoDeleteReservation(reservation);
          }
        }
      });
    };

    checkExpiredReservations();

    const intervalId = setInterval(checkExpiredReservations, 30000);

    return () => clearInterval(intervalId);
  }, [restaurantData]);

  // VERIFICATION DES RESERVATIONS EN RETARD
  useEffect(() => {
    if (!restaurantData) return;

    const checkLateReservations = () => {
      const now = new Date();
      const gracePeriod = 5 * 60000; // 5 minutes de marge
      const reservations = restaurantData.reservations.list || [];
      reservations.forEach((reservation) => {
        if (reservation.status === "Confirmed") {
          const reservationDate = new Date(reservation.reservationDate);
          const [hours, minutes] = reservation.reservationTime.split(":");
          reservationDate.setHours(
            parseInt(hours, 10),
            parseInt(minutes, 10),
            0,
            0
          );

          // On ajoute la marge de 5 minutes à la date de réservation
          const reservationDateWithGrace = new Date(
            reservationDate.getTime() + gracePeriod
          );

          if (now >= reservationDateWithGrace) {
            autoUpdateToLate(reservation);
          }
        }
      });
    };

    checkLateReservations();
    const updateIntervalId = setInterval(checkLateReservations, 30000);
    return () => clearInterval(updateIntervalId);
  }, [restaurantData]);

  // VERIFICATION DES RESERVATIONS EN COURS A PASSER EN FINISHED SI LE PARAMETER EST TRUE
  useEffect(() => {
    if (!restaurantData) return;

    const reservationDurationEnabled =
      restaurantData?.reservations?.parameters?.reservation_duration;
    if (!reservationDurationEnabled) return;

    const reservationDurationMinutes =
      restaurantData?.reservations?.parameters?.reservation_duration_minutes;
    if (!reservationDurationMinutes) return;

    const checkAutoFinishReservations = () => {
      const now = new Date();
      const reservations = restaurantData.reservations.list || [];
      reservations.forEach((reservation) => {
        if (reservation.status === "Active") {
          const reservationStart = new Date(reservation.reservationDate);
          const [hours, minutes] = reservation.reservationTime.split(":");
          reservationStart.setHours(
            parseInt(hours, 10),
            parseInt(minutes, 10),
            0,
            0
          );

          const finishThreshold = new Date(
            reservationStart.getTime() + reservationDurationMinutes * 60000
          );

          if (now >= finishThreshold) {
            autoUpdateToFinished(reservation);
          }
        }
      });
    };

    checkAutoFinishReservations();
    const intervalId = setInterval(checkAutoFinishReservations, 30000);
    return () => clearInterval(intervalId);
  }, [restaurantData]);

  // FONCTION POUR CHANGER LE STATUS D'UNE RESERVATION A FINISHED
  function autoUpdateToFinished(reservation) {
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
        }
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
      });
  }

  // FONCTION POUR CHANGER LE STATUS D'UNE RESERVATION A "LATE"
  function autoUpdateToLate(reservation) {
    if (autoUpdatingReservations.includes(reservation._id)) return;
    setAutoUpdatingReservations((prev) => [...prev, reservation._id]);

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
        }
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
        setAutoUpdatingReservations((prev) =>
          prev.filter((id) => id !== reservation._id)
        );
      });
  }

  // FONCTION POUR SUPPRIMER UNE RESERVATION TERMINEE
  function autoDeleteReservation(reservation) {
    if (autoDeletingReservations.includes(reservation._id)) return;
    setAutoDeletingReservations((prev) => [...prev, reservation._id]);

    const token = localStorage.getItem("token");
    axios
      .delete(
        `${process.env.NEXT_PUBLIC_API_URL}/restaurants/${restaurantData._id}/reservations/${reservation._id}`,
        {
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
          },
        }
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
        setAutoDeletingReservations((prev) =>
          prev.filter((id) => id !== reservation._id)
        );
      });
  }

  const resetNewReservationsCount = () => {
    setNewReservationsCount(0);
    const rid = restaurantData?._id;
    if (rid) {
      const counts = readNotifCounts(rid);
      writeNotifCounts(rid, { ...counts, res: 0 });
    }
  };

  const resetNewLeaveRequestsCount = () => {
    setNewLeaveRequestsCount(0);
    const rid = restaurantData?._id;
    if (rid) {
      const counts = readNotifCounts(rid);
      writeNotifCounts(rid, { ...counts, leave: 0 });
    }
  };

  // RECUPERATION DES RÉSERVATIONS TOUTES LES 30s AVEC DÉTECTION DES NOUVELLES RÉSERVATIONS
  useEffect(() => {
    if (!restaurantData?._id || userConnected?.role !== "owner") return;

    const fetchReservations = () => {
      const token = localStorage.getItem("token");
      axios
        .get(
          `${process.env.NEXT_PUBLIC_API_URL}/restaurants/${restaurantData._id}/reservations`,
          {
            headers: { Authorization: `Bearer ${token}` },
          }
        )
        .then((response) => {
          setRestaurantData((prevData) => {
            const previousList = prevData?.reservations?.list || [];
            const fetchedReservations = response.data.reservations;
            if (!initialReservationsLoadedRef.current) {
              initialReservationsLoadedRef.current = true;
            } else {
              const previousIds = new Set(previousList.map((r) => r._id));
              const newReservations = fetchedReservations.filter(
                (r) => !r.manual && !previousIds.has(r._id)
              );
              if (newReservations.length > 0) {
                setNewReservationsCount((prevCount) => {
                  const next = prevCount + newReservations.length;
                  const rid = restaurantData?._id;
                  if (rid) {
                    const counts = readNotifCounts(rid);
                    writeNotifCounts(rid, { ...counts, res: next });
                  }
                  return next;
                });
              }
            }
            return {
              ...prevData,
              reservations: {
                ...prevData.reservations,
                list: fetchedReservations,
              },
            };
          });
        })
        .catch((error) => {
          console.error("Error fetching reservations:", error);
        });
    };

    fetchReservations();
    const intervalId = setInterval(fetchReservations, 30000);
    return () => clearInterval(intervalId);
  }, [restaurantData?._id, userConnected?.role]);

  function logout() {
    localStorage.removeItem("token");
    if (restaurantData?._id) {
      try {
        clearNotifCounts(restaurantData._id);
      } catch (e) {
        console.warn("clearNotifCounts failed", e);
      }
    }
    if (sseRef.current) {
      sseRef.current.close();
      sseRef.current = null;
    }
    setRestaurantData(null);
    setRestaurantsList([]);
    setIsAuth(false);
    router.replace("/dashboard/login");
  }

  useEffect(() => {
    const handleRouteChangeComplete = (url) => {
      if (
        url.startsWith("/dashboard") &&
        !url.startsWith("/dashboard/admin") &&
        !hasFetchedDashboardDataRef.current
      ) {
        fetchRestaurantsList();
        hasFetchedDashboardDataRef.current = true;
      }
    };

    router.events.on("routeChangeComplete", handleRouteChangeComplete);
    return () => {
      router.events.off("routeChangeComplete", handleRouteChangeComplete);
    };
  }, [router.events]);

  // Au montage initial, si l'URL courante est déjà /dashboard, lance le fetch
  useEffect(() => {
    const path = router.pathname;

    if (
      path.startsWith("/dashboard") &&
      !path.startsWith("/dashboard/admin") &&
      !hasFetchedDashboardDataRef.current
    ) {
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

  // Reset auto des notifs de congés quand on visite la page des congés
  useEffect(() => {
    if (userConnected?.role !== "owner") return;
    const path = router.pathname || "";
    if (path.startsWith("/dashboard/employees/planning/days-off")) {
      resetNewLeaveRequestsCount();
      if ((newReservationsCount || 0) === 0) {
        updateLastNotificationCheck();
      }
    }
  }, [router.pathname, newReservationsCount, userConnected?.role]);

  return {
    restaurantData,
    setRestaurantData,
    userConnected,
    restaurantsList,
    dataLoading,
    setRestaurantsList,
    handleRestaurantSelect,
    fetchRestaurantsList,
    fetchRestaurantData,
    updateLastNotificationCheck,
    logout,
    setCloseEditing,
    closeEditing,
    isAuth,
    setIsAuth,
    newReservationsCount,
    resetNewReservationsCount,
    newLeaveRequestsCount,
    resetNewLeaveRequestsCount,
  };
}
