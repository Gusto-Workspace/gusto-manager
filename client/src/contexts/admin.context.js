import { useEffect, useState } from "react";
import { useRouter } from "next/router";

// AXIOS
import axios from "axios";

// JWT
import { jwtDecode } from "jwt-decode";

export default function AdminContext() {
  const router = useRouter();

  const [ownersList, setOwnersList] = useState([]);
  const [subscriptionsList, setSubscriptionsList] = useState([]);
  const [restaurantsList, setRestaurantsList] = useState([]);
  const [ownersSubscriptionsList, setOwnersSubscriptionsList] = useState([]);

  const [ownersLoading, setOwnersLoading] = useState(true);
  const [subscriptionsLoading, setSubscriptionsLoading] = useState(true);
  const [restaurantsLoading, setRestaurantsLoading] = useState(true);
  const [ownersSubscriptionsLoading, setOwnersSubscriptionsLoading] =
    useState(true);

  const [isAuth, setIsAuth] = useState(false);

  function fetchOwnersList() {
    const token = localStorage.getItem("admin-token");

    if (!token) {
      router.push("/admin/login");
    } else {
      try {
        const decodedToken = jwtDecode(token);

        if (!decodedToken.id) {
          throw new Error("Invalid token: ownerId is missing");
        }

        axios
          .get(`${process.env.NEXT_PUBLIC_API_URL}/admin/owners`, {
            headers: {
              Authorization: `Bearer ${token}`,
            },
          })
          .then((response) => {
            setOwnersList(response.data.owners);
            setOwnersLoading(false);
            setIsAuth(true);
          })
          .catch((error) => {
            console.error(
              "Erreur lors de la récupération des restaurants:",
              error
            );
            setOwnersLoading(false);
            localStorage.removeItem("token");
            router.push("/login");
          });
      } catch (error) {
        setOwnersLoading(false);
        localStorage.removeItem("token");
        router.push("/admin/login");
      }
    }
  }

  function fetchSubscriptionsList() {
    axios
      .get(`${process.env.NEXT_PUBLIC_API_URL}/admin/subscriptions`)
      .then((response) => {
        setSubscriptionsList(response.data.products);
        setSubscriptionsLoading(false);
      })
      .catch((error) => {
        console.error("Erreur lors de la récupération des abonnements:", error);
        setSubscriptionsLoading(false);
      });
  }

  function fetchRestaurantsList() {
    const token = localStorage.getItem("admin-token");

    if (!token) {
      router.push("/admin/login");
    } else {
      axios
        .get(`${process.env.NEXT_PUBLIC_API_URL}/admin/restaurants`, {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        })
        .then((response) => {
          setRestaurantsList(response.data.restaurants);
          setRestaurantsLoading(false);
        })
        .catch((error) => {
          if (error.response && error.response.status === 403) {
            localStorage.removeItem("admin-token");
            router.push("/admin/login");
          } else {
            console.error(
              "Erreur lors de la récupération des restaurants:",
              error
            );
            setRestaurantsLoading(false);
          }
        });
    }
  }

  function fetchOwnersSubscriptionsList() {
    const token = localStorage.getItem("admin-token");

    if (!token) {
      router.push("/admin/login");
    } else {
      axios
        .get(`${process.env.NEXT_PUBLIC_API_URL}/admin/all-subscriptions`, {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        })
        .then((response) => {
          setOwnersSubscriptionsList(response.data.subscriptions);
          setOwnersSubscriptionsLoading(false);
        })
        .catch((error) => {
          if (error.response && error.response.status === 403) {
            localStorage.removeItem("admin-token");
            router.push("/admin/login");
          } else {
            console.error(
              "Erreur lors de la récupération des abonnements des propriétaires:",
              error
            );
            setOwnersSubscriptionsLoading(false);
          }
        });
    }
  }

  function logout() {
    localStorage.removeItem("admin-token");
    setOwnersList([]);
    setSubscriptionsList([]);
    setRestaurantsList([]);
    setIsAuth(false);
    router.replace("/admin/login");
  }

  useEffect(() => {
    const { pathname } = router;

    if (pathname.includes("/admin")) {
      fetchOwnersList();
      fetchSubscriptionsList();
      fetchRestaurantsList();
      fetchOwnersSubscriptionsList();
    }
  }, []);

  return {
    fetchOwnersList,
    setOwnersList,
    ownersList,
    ownersLoading,
    fetchSubscriptionsList,
    subscriptionsList,
    subscriptionsLoading,
    fetchRestaurantsList,
    setRestaurantsList,
    restaurantsList,
    restaurantsLoading,
    fetchOwnersSubscriptionsList,
    setOwnersSubscriptionsList,
    ownersSubscriptionsList,
    ownersSubscriptionsLoading,
    setIsAuth,
    isAuth,
    logout,
  };
}
