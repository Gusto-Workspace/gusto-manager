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

  const [dataLoading, setDataLoading] = useState(false);
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

        setDataLoading(true);

        axios
          .get(`${process.env.NEXT_PUBLIC_API_URL}/admin/owners`, {
            headers: {
              Authorization: `Bearer ${token}`,
            },
          })
          .then((response) => {
            setOwnersList(response.data.owners);
            setIsAuth(true);
          })
          .catch((error) => {
            console.error(
              "Erreur lors de la récupération des restaurants:",
              error
            );
            localStorage.removeItem("token");
            router.push("/login");
          });
      } catch (error) {
        console.error("Invalid token:", error);
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
      })
      .catch((error) => {
        console.error("Erreur lors de la récupération des abonnements:", error);
      });
  }

  function logout() {
    localStorage.removeItem("admin-token");
    setOwnersList([]);
    setIsAuth(false);
    router.replace("/admin/login");
  }

  useEffect(() => {
    const { pathname } = router;

    if (pathname.includes("/admin")) {
      fetchOwnersList();
      fetchSubscriptionsList();
    }
  }, []);

  return {
    ownersList,
    setOwnersList,
    dataLoading,
    setDataLoading,
    fetchOwnersList,
    fetchSubscriptionsList,
    subscriptionsList,
    isAuth,
    logout,
  };
}
