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

  const initialReservationsLoadedRef = useRef(false);
  const hasFetchedDashboardDataRef = useRef(false);

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
      .then((response) => {
        const restaurant = response.data.restaurant;

        const lastCheck = restaurant.lastNotificationCheck;
        const newCount = restaurant.reservations.list.filter(
          (r) => !r.manual && new Date(r.createdAt) > new Date(lastCheck)
        ).length;
        setNewReservationsCount(newCount);
        setRestaurantData(restaurant);
        setDataLoading(false);
      })
      .catch((error) => {
        if (error.response?.status === 403) {
          handleInvalidToken();
        } else {
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
          // Lors du changement de restaurant, on réinitialise le compteur et on réinitialise le flag de premier chargement
          setNewReservationsCount(0);
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

  function resetNewReservationsCount() {
    setNewReservationsCount(0);
  }

  // RECUPERATION DES RÉSERVATIONS TOUTES LES 30s AVEC DÉTECTION DES NOUVELLES RÉSERVATIONS
  useEffect(() => {
    if (!restaurantData?._id) return;

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
                setNewReservationsCount(
                  (prevCount) => prevCount + newReservations.length
                );
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
  }, [restaurantData?._id]);

  function logout() {
    localStorage.removeItem("token");
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
  };
}
