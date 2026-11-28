import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/router";
import axios from "axios";
import { jwtDecode } from "jwt-decode";
import { getAdminAuthConfig, getAdminToken } from "@/components/dashboard/admin/_shared/utils/admin-auth.utils";

const root = "/dashboard/admin";
const login = `${root}/login`;
const api = `${process.env.NEXT_PUBLIC_API_URL}/admin`;
const endpoints = {
  owners: ["/owners", "owners"],
  subscriptions: ["/subscriptions", "products"],
  restaurants: ["/restaurants", "restaurants"],
  ownersSubscriptions: ["/all-subscriptions", "subscriptions"],
  documents: ["/documents", "documents"],
  dashboard: ["/dashboard"],
};
const defaultPagination = { page: 1, limit: 20, total: 0, totalPages: 1, hasPrevPage: false, hasNextPage: false };
const emptyLists = Object.fromEntries(Object.keys(endpoints).map((key) => [key, { items: key === "dashboard" ? null : [], loading: true }]));
const invalidSession = (error) => [401, 403].includes(error.response?.status);

function pageLists(page) {
  if (!page) return ["dashboard"];
  if (page === "/owners") return ["owners"];
  if (page === "/restaurants") return ["owners", "restaurants"];
  if (page === "/subscriptions") return ["ownersSubscriptions"];
  if (page === "/subscriptions/add") return ["owners", "subscriptions", "restaurants"];
  if (page.startsWith("/subscriptions/edit")) return ["subscriptions"];
  if (page.startsWith("/subscriptions/change-payer")) return ["owners"];
  if (page === "/documents") return ["documents"];
  if (page === "/documents/add") return ["restaurants"];
  if (page.endsWith("/sign")) return [];
  if (page.startsWith("/documents/add/")) return ["restaurants", "subscriptions"];
  return [];
}

function sessionRole(token) {
  try {
    const decoded = jwtDecode(token);
    if (["admin", "super-admin"].includes(decoded?.role) &&
        decoded.aud === "gusto-manager:admin" && decoded.iss === "gusto-manager" &&
        Number.isSafeInteger(decoded.sessionVersion) && decoded.sessionVersion >= 0) return decoded.role;
  } catch {}
  return null;
}

export default function AdminContext() {
  const router = useRouter();
  const cache = useRef(null);
  const [session, setSession] = useState({ role: null, status: "checking" });
  const [retry, setRetry] = useState(0);
  const [lists, setLists] = useState(emptyLists);
  const [pagination, setPagination] = useState(defaultPagination);
  const [selectionRevision, setSelectionRevision] = useState(0);
  const isAuth = session.status === "authenticated";
  const adminRole = session.role;
  const page = router.pathname.slice(root.length);
  const protectedPage = (router.pathname === root || router.pathname.startsWith(`${root}/`)) &&
    page !== "/login" && !page.startsWith("/login/");

  function reset() {
    cache.current?.controller.abort();
    cache.current = null;
    setLists(emptyLists);
    setPagination(defaultPagination);
    setSession({ role: null, status: "checking" });
  }

  function logout() {
    localStorage.removeItem("admin-token");
    reset();
    router.replace(login);
  }

  useEffect(() => {
    function storageChanged(event) {
      if (event.key === "admin-token" || event.key === null) {
        reset();
        setRetry((value) => value + 1);
      }
    }
    window.addEventListener("storage", storageChanged);
    return () => {
      window.removeEventListener("storage", storageChanged);
      cache.current?.controller.abort();
      cache.current = null;
    };
  }, []);

  useEffect(() => {
    if (!protectedPage) return;
    const token = getAdminToken();
    if (cache.current?.token === token && cache.current?.verified) return;
    reset();
    const role = sessionRole(token);
    if (!role) {
      logout();
      return;
    }
    const controller = new AbortController();
    const current = { token, controller, loaded: new Set(), pending: new Map() };
    cache.current = current;
    axios.get(`${api}/commerciaux/session`, getAdminAuthConfig({ signal: controller.signal }))
      .then(() => {
        if (cache.current !== current) return;
        current.verified = true;
        setSession({ role, status: "authenticated" });
      })
      .catch((error) => {
        if (controller.signal.aborted || cache.current !== current) return;
        if (invalidSession(error)) logout();
        else setSession({ role: null, status: "unavailable" });
      });
    return () => { if (!current.verified) controller.abort(); };
  }, [protectedPage, retry]);

  function updateList(key, patch) {
    setLists((previous) => ({ ...previous, [key]: { ...previous[key], ...patch } }));
  }

  function setItems(key, items) {
    setLists((previous) => ({ ...previous, [key]: { ...previous[key],
      items: typeof items === "function" ? items(previous[key].items) : items,
    } }));
  }

  function loadList(key, { force = false, params } = {}) {
    const current = cache.current;
    if (!current?.verified || current.token !== getAdminToken()) return;
    const queryKey = JSON.stringify(params || {});
    if (current.pending.get(key)?.queryKey === queryKey && !force) return;
    if (!force && current.loaded.has(key)) return;
    const request = { queryKey };
    current.pending.set(key, request);
    const active = () => cache.current === current && current.token === getAdminToken() && current.pending.get(key) === request;
    updateList(key, { loading: true, error: "" });
    const [path, field] = endpoints[key];
    return axios.get(api + path, getAdminAuthConfig({ params, signal: current.controller.signal }))
      .then(({ data }) => {
        if (!active()) return;
        current.loaded.add(key);
        const items = field ? data[field] || [] : data;
        updateList(key, { items, loading: false });
        if (key === "ownersSubscriptions") setPagination(data.pagination || { ...defaultPagination, ...params, total: items.length });
        return items;
      })
      .catch((error) => {
        if (!active()) return;
        if (invalidSession(error)) logout();
        else updateList(key, { loading: false, error: error.response?.data?.message || "Chargement momentanément indisponible." });
      })
      .finally(() => { if (active()) current.pending.delete(key); });
  }

  function loadCommercialSelection(overview) {
    const current = cache.current;
    if (!current?.verified || current.token !== getAdminToken()) return Promise.resolve([]);
    const selection = current.selection ||= {};
    const active = () => cache.current === current && current.selection === selection;
    const read = (page, withPerformance) => axios.get(`${api}/commerciaux`, getAdminAuthConfig({
      params: { page, view: "selection", ...(withPerformance && { performance: "overview" }) }, signal: current.controller.signal,
    })).then(({ data }) => data);
    if (!selection.chains) {
      selection.chains = (async () => {
        const first = await read(1, overview);
        const items = [...first.accounts];
        for (let page = 2, count = first.accounts.length; count && items.length < first.total; page += 1) {
          const { accounts } = await read(page, false);
          count = accounts.length;
          items.push(...accounts);
        }
        if (overview) selection.performance = Promise.resolve(first.accounts);
        return items;
      })().catch((error) => {
        if (active()) current.selection = null;
        throw error;
      });
    }
    return selection.chains.then(async (items) => {
      if (!active()) return [];
      if (!overview) return items;
      selection.performance ||= read(1, true).then(({ accounts }) => accounts).catch((error) => {
        selection.performance = null;
        throw error;
      });
      const first = await selection.performance;
      return active() ? [...first, ...items.slice(first.length)] : [];
    });
  }

  function invalidateCommercialSelection() {
    if (cache.current) cache.current.selection = null;
    setSelectionRevision((value) => value + 1);
  }

  useEffect(() => {
    if (protectedPage && isAuth) {
      for (const key of pageLists(page)) loadList(key);
    }
  }, [protectedPage, isAuth, page]);

  return {
    fetchOwnersList: () => loadList("owners", { force: true }),
    setOwnersList: (items) => setItems("owners", items),
    ownersList: lists.owners.items, ownersLoading: lists.owners.loading,
    subscriptionsList: lists.subscriptions.items, subscriptionsLoading: lists.subscriptions.loading,
    fetchRestaurantsList: () => loadList("restaurants", { force: true }),
    setRestaurantsList: (items) => setItems("restaurants", items),
    restaurantsList: lists.restaurants.items, restaurantsLoading: lists.restaurants.loading,
    fetchOwnersSubscriptionsList: (options = {}) => loadList("ownersSubscriptions", { force: true,
      params: { page: options.page || pagination.page, limit: options.limit || pagination.limit } }),
    setOwnersSubscriptionsList: (items) => setItems("ownersSubscriptions", items),
    ownersSubscriptionsList: lists.ownersSubscriptions.items, ownersSubscriptionsLoading: lists.ownersSubscriptions.loading,
    ownersSubscriptionsPagination: pagination,
    dashboardData: lists.dashboard.items, dashboardLoading: lists.dashboard.loading, dashboardError: lists.dashboard.error,
    documentsList: lists.documents.items, documentsLoading: lists.documents.loading,
    setDocumentsList: (items) => setItems("documents", items),
    loadCommercialSelection, invalidateCommercialSelection, selectionRevision,
    adminRole, canManageClients: adminRole === "super-admin",
    isAuth, protectedPage, sessionUnavailable: session.status === "unavailable",
    retrySession: () => setRetry((value) => value + 1),
    logout,
  };
}
