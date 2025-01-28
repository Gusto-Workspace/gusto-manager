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

  function handleInvalidToken() {
    setRestaurantsList([])
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
