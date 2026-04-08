import { useEffect, useState } from "react";
import { useRouter } from "next/router";

// AXIOS
import axios from "axios";

// JWT
import { jwtDecode } from "jwt-decode";
import { getAdminAuthConfig } from "@/components/dashboard/admin/_shared/utils/admin-auth.utils";

export default function AdminContext() {
  const router = useRouter();

  const [ownersList, setOwnersList] = useState([]);
  const [subscriptionsList, setSubscriptionsList] = useState([]);
  const [restaurantsList, setRestaurantsList] = useState([]);
  const [ownersSubscriptionsList, setOwnersSubscriptionsList] = useState([]);
  const [ownersSubscriptionsPagination, setOwnersSubscriptionsPagination] =
    useState({
      page: 1,
      limit: 20,
      total: 0,
      totalPages: 1,
      hasPrevPage: false,
      hasNextPage: false,
    });
  const [ownersLoading, setOwnersLoading] = useState(true);
  const [subscriptionsLoading, setSubscriptionsLoading] = useState(true);
  const [restaurantsLoading, setRestaurantsLoading] = useState(true);
  const [ownersSubscriptionsLoading, setOwnersSubscriptionsLoading] =
    useState(true);
  const [documentsList, setDocumentsList] = useState([]);
  const [documentsLoading, setDocumentsLoading] = useState(true);
  const [dashboardData, setDashboardData] = useState(null);
  const [dashboardLoading, setDashboardLoading] = useState(false);
  const [dashboardError, setDashboardError] = useState("");

  const [isAuth, setIsAuth] = useState(false);

  const [adminRole, setAdminRole] = useState(null);
  const isAdmin = adminRole === "admin";

  function fetchOwnersList() {
    const token = localStorage.getItem("admin-token");

    if (!token) {
      router.push("/dashboard/admin/login");
    } else {
      setOwnersLoading(true);
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
              error,
            );
            setOwnersLoading(false);
            localStorage.removeItem("admin-token");
            router.push("/dashboard/admin/login");
          });
      } catch (error) {
        setOwnersLoading(false);
        localStorage.removeItem("admin-token");
        router.push("/dashboard/admin/login");
      }
    }
  }

  function fetchSubscriptionsList() {
    const token = localStorage.getItem("admin-token");

    if (!token) {
      router.push("/dashboard/admin/login");
      return;
    }

    setSubscriptionsLoading(true);

    axios
      .get(
        `${process.env.NEXT_PUBLIC_API_URL}/admin/subscriptions`,
        getAdminAuthConfig(),
      )
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
      router.push("/dashboard/admin/login");
    } else {
      setRestaurantsLoading(true);
      axios
        .get(
          `${process.env.NEXT_PUBLIC_API_URL}/admin/restaurants`,
          getAdminAuthConfig(),
        )
        .then((response) => {
          setRestaurantsList(response.data.restaurants);
          setRestaurantsLoading(false);
        })
        .catch((error) => {
          if (error.response && error.response.status === 403) {
            localStorage.removeItem("admin-token");
            router.push("/dashboard/admin/login");
          } else {
            console.error(
              "Erreur lors de la récupération des restaurants:",
              error,
            );
            setRestaurantsLoading(false);
          }
        });
    }
  }

  function fetchOwnersSubscriptionsList(options = {}) {
    const token = localStorage.getItem("admin-token");
    const page = Number(options?.page || ownersSubscriptionsPagination.page || 1);
    const limit = Number(
      options?.limit || ownersSubscriptionsPagination.limit || 20,
    );

    if (!token) {
      router.push("/dashboard/admin/login");
    } else {
      setOwnersSubscriptionsLoading(true);
      axios
        .get(
          `${process.env.NEXT_PUBLIC_API_URL}/admin/all-subscriptions`,
          getAdminAuthConfig({
            params: { page, limit },
          }),
        )
        .then((response) => {
          setOwnersSubscriptionsList(response.data.subscriptions);
          setOwnersSubscriptionsPagination(
            response.data.pagination || {
              page,
              limit,
              total: response.data.subscriptions?.length || 0,
              totalPages: 1,
              hasPrevPage: false,
              hasNextPage: false,
            },
          );
          setOwnersSubscriptionsLoading(false);
        })
        .catch((error) => {
          if (error.response && error.response.status === 403) {
            localStorage.removeItem("admin-token");
            router.push("/dashboard/admin/login");
          } else {
            console.error(
              "Erreur lors de la récupération des abonnements des propriétaires:",
              error,
            );
            setOwnersSubscriptionsLoading(false);
          }
        });
    }
  }

  async function fetchDocumentsList() {
    if (typeof window === "undefined") return;

    setDocumentsLoading(true);

    const token = localStorage.getItem("admin-token");
    if (!token) {
      setDocumentsLoading(false);
      router.push("/dashboard/admin/login");
      return;
    }

    try {
      const response = await axios.get(
        `${process.env.NEXT_PUBLIC_API_URL}/admin/documents`,
        getAdminAuthConfig(),
      );

      setDocumentsList(response.data.documents);
    } catch (error) {
      if (error?.response?.status === 403) {
        localStorage.removeItem("admin-token");
        router.push("/dashboard/admin/login");
      } else {
        console.error("Erreur récupération documents:", error);
      }
    } finally {
      setDocumentsLoading(false);
    }
  }

  async function fetchDashboard(options = {}) {
    const token = localStorage.getItem("admin-token");
    const force = options?.force === true;

    if (!token) {
      router.push("/dashboard/admin/login");
      return null;
    }

    if (!force && dashboardData) {
      setDashboardLoading(false);
      return dashboardData;
    }

    setDashboardLoading(true);
    setDashboardError("");

    try {
      const response = await axios.get(
        `${process.env.NEXT_PUBLIC_API_URL}/admin/dashboard`,
        getAdminAuthConfig(),
      );

      const nextData = response.data || null;
      setDashboardData(nextData);
      return nextData;
    } catch (error) {
      if (error?.response?.status === 403) {
        localStorage.removeItem("admin-token");
        router.push("/dashboard/admin/login");
        return null;
      }

      const message =
        error?.response?.data?.message ||
        "Erreur lors du chargement du dashboard admin.";
      setDashboardError(message);
      return null;
    } finally {
      setDashboardLoading(false);
    }
  }

  function syncAdminFromToken() {
    if (typeof window === "undefined") return null;

    const token = localStorage.getItem("admin-token");
    if (!token) {
      setAdminRole(null);
      return null;
    }

    try {
      const decoded = jwtDecode(token);
      const role = decoded?.role || null;
      setAdminRole(role);
      return role;
    } catch (e) {
      localStorage.removeItem("admin-token");
      setAdminRole(null);
      return null;
    }
  }

  function logout() {
    localStorage.removeItem("admin-token");
    setAdminRole(null);
    setOwnersList([]);
    setSubscriptionsList([]);
    setRestaurantsList([]);
    setIsAuth(false);
    router.replace("/dashboard/admin/login");
  }

  useEffect(() => {
    const { pathname } = router;

    if (pathname.includes("/dashboard/admin")) {
      syncAdminFromToken();
      fetchOwnersList();
      fetchSubscriptionsList();
      fetchRestaurantsList();
      fetchOwnersSubscriptionsList();
      fetchDocumentsList();
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
    ownersSubscriptionsPagination,
    fetchDashboard,
    dashboardData,
    dashboardLoading,
    dashboardError,
    fetchDocumentsList,
    documentsList,
    setDocumentsList,
    documentsLoading,
    setIsAuth,
    adminRole,
    isAdmin,
    syncAdminFromToken,
    isAuth,
    logout,
  };
}
