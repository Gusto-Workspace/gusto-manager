import { useEffect, useState } from "react";
import { useRouter } from "next/router";

// AXIOS
import axios from "axios";

// JWT
import { jwtDecode } from "jwt-decode";

export default function RestaurantContext() {
  const router = useRouter();
  const [restaurantData, setRestaurantData] = useState(null);
  const [restaurantsList, setRestaurantsList] = useState([]);
  const [dataLoading, setDataLoading] = useState(true);
  const [closeEditing, setCloseEditing] = useState(false);
  const [isAuth, setIsAuth] = useState(false);

  const [autoDeletingReservations, setAutoDeletingReservations] = useState([]);

  function handleInvalidToken() {
    setRestaurantsList([]);
    localStorage.removeItem("token");
    router.push("/login");
  }

  function fetchRestaurantData(token, restaurantId) {
    setDataLoading(true);

    axios
      .get(
        `${process.env.NEXT_PUBLIC_API_URL}/owner/restaurants/${restaurantId}`,
        {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        }
      )
      .then((response) => {
        setRestaurantData(response.data.restaurant);
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
          {
            headers: {
              Authorization: `Bearer ${token}`,
            },
          }
        )
        .then((response) => {
          const { token: updatedToken } = response.data;
          localStorage.setItem("token", updatedToken);
          fetchRestaurantData(updatedToken, restaurantId);
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

  useEffect(() => {
    if (!restaurantData) return;

    const deletionDurationMinutes =
      restaurantData?.reservations?.parameters?.deletion_duration_minutes;
    if (!deletionDurationMinutes) return;

    // Fonction de vérification des réservations expirées
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

    // Exécute immédiatement la vérification
    checkExpiredReservations();

    // Puis planifie la vérification à intervalle (ici 30s)
    const intervalId = setInterval(checkExpiredReservations, 30000);

    return () => clearInterval(intervalId);
  }, [restaurantData]);

  function autoDeleteReservation(reservation) {
    // Évite la suppression multiple pour une même réservation
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
        setRestaurantData(response.data.restaurant);
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

  function logout() {
    localStorage.removeItem("token");
    setRestaurantData(null);
    setRestaurantsList([]);
    setIsAuth(false);
    router.replace("/login");
  }

  useEffect(() => {
    const { pathname } = router;

    if (!pathname.includes("/admin")) {
      fetchRestaurantsList();
    }
  }, []);

  return {
    restaurantData,
    setRestaurantData,
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
  };
}
