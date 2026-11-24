import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import axios from "axios";
import { isEmployeeDashboardRouteAllowed } from "../../../_assets/utils/dashboard-access";
import { useRouter } from "next/router";
import { GlobalContext } from "@/contexts/global.context";
import { markCallsRead, mergeCalls } from "./callsense-read-state";

const CallSenseContext = createContext(null);
export const useCallSense = () => useContext(CallSenseContext);
function comparablePhone(value) {
  const phone = String(value || "").replace(/[^\d+]/g, "");
  if (/^0[1-9]\d{8}$/.test(phone)) return `+33${phone.slice(1)}`;
  if (/^00\d+$/.test(phone)) return `+${phone.slice(2)}`;
  return phone;
}

export function CallSenseProvider({ children }) {
  const { restaurantContext: context } = useContext(GlobalContext);
  const router = useRouter();
  const user = context.userConnected;
  const restaurant = context.restaurantData;
  const activeRestaurant = user?.restaurantId && String(user.restaurantId) === String(restaurant?._id);
  const authorized = user?.role === "owner" || (user?.role === "employee" && activeRestaurant &&
    isEmployeeDashboardRouteAllowed("/dashboard/customers", { restaurantData: restaurant, userConnected: user }));
  const rid = context.isAuth && !context.dataLoading && authorized && router.pathname !== "/dashboard/my-space"
    ? restaurant?._id : null;
  const ridRef = useRef(rid);
  ridRef.current = rid;
  const [calls, setCalls] = useState({});
  const [enabled, setEnabled] = useState(false);
  const [testMode, setTestMode] = useState(false);
  const [availabilityRestaurantId, setAvailabilityRestaurantId] = useState(null);
  const [cursor, setCursor] = useState(null);
  const cursorRef = useRef(null);
  const cursorInitialized = useRef(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [open, setOpen] = useState(false);
  const [popups, setPopups] = useState({});
  const [dismissed, setDismissed] = useState({});
  const [unreadMissedCount, setUnreadMissedCount] = useState(0);
  const [highlightIds, setHighlightIds] = useState([]);
  const [highlightReadAt, setHighlightReadAt] = useState(null);
  const callsRef = useRef(calls);
  callsRef.current = calls;
  const identityRequest = useRef(0);
  const identityPhones = useRef(new Set());
  const identityVersions = useRef(new Map());
  const historySession = useRef(0);
  const historyOpen = useRef(false);
  const readThroughRef = useRef(null);
  const unreadRequestId = useRef(0);
  const inScope = router.pathname.startsWith("/dashboard") && !router.pathname.startsWith("/dashboard/admin") && !router.pathname.startsWith("/dashboard/login");

  useEffect(() => { identityRequest.current += 1; identityPhones.current.clear(); identityVersions.current.clear(); setCalls({}); setEnabled(false); setTestMode(false); setCursor(null); cursorRef.current = null; cursorInitialized.current = false; setPopups({}); setDismissed({}); setOpen(false); setError(""); unreadRequestId.current += 1; setUnreadMissedCount(0); historySession.current += 1; historyOpen.current = false; readThroughRef.current = null; setHighlightIds([]); setHighlightReadAt(null); }, [rid]);
  const resolveIdentities = useCallback(async (items, onlyThese = false) => {
    if (!rid || !context.isAuth || !inScope) return;
    const sequence = ++identityRequest.current;
    for (const call of items) if (call.from) identityPhones.current.add(call.from);
    const phones = onlyThese ? [...new Set(items.map(call => call.from).filter(Boolean))] : [...identityPhones.current];
    if (!phones.length) return;
    for (const phone of phones) identityVersions.current.set(phone, sequence);
    try {
      const responses = await Promise.all(Array.from({ length: Math.ceil(phones.length / 100) }, (_, index) => axios.post(`${process.env.NEXT_PUBLIC_API_URL}/restaurants/${rid}/callsense/customer-identities`, { phones: phones.slice(index * 100, index * 100 + 100) })));
      if (String(ridRef.current) !== String(rid)) return;
      const identities = Object.assign({}, ...responses.map(response => response.data.identities || {}));
      setCalls(previous => Object.fromEntries(Object.entries(previous).map(([id, call]) => [id, identities[call.from] && identityVersions.current.get(call.from) === sequence ? { ...call, ...identities[call.from] } : call])));
    } catch (_) { /* Identités indisponibles : ne jamais réutiliser un ancien rattachement. */ }
  }, [rid, context.isAuth, inScope]);
  const refreshUnreadMissed = useCallback(async () => {
    if (!rid || !context.isAuth || !inScope) return;
    const requestId = ++unreadRequestId.current;
    try {
      const { data } = await axios.get(`${process.env.NEXT_PUBLIC_API_URL}/restaurants/${rid}/callsense/unread-missed-count`);
      if (requestId === unreadRequestId.current && String(ridRef.current) === String(rid)) setUnreadMissedCount(Math.max(0, Number(data.count) || 0));
    } catch (error) {
      if (error?.response?.status === 403 && requestId === unreadRequestId.current) setUnreadMissedCount(0);
    }
  }, [rid, context.isAuth, inScope]);
  useEffect(() => {
    if (!rid || !context.isAuth || !inScope) return;
    const timer = setTimeout(refreshUnreadMissed, 75);
    return () => clearTimeout(timer);
  }, [rid, context.isAuth, inScope, context.callSenseReconnect, context.callSenseCountRevision, refreshUnreadMissed]);
  const markAllRead = useCallback(async (session = null) => {
    if (!rid || !context.isAuth || !inScope) return;
    try {
      const { data } = await axios.post(`${process.env.NEXT_PUBLIC_API_URL}/restaurants/${rid}/callsense/read-missed`);
      if (String(ridRef.current) !== String(rid)) return;
      if (!readThroughRef.current || new Date(data.readAt) > new Date(readThroughRef.current)) readThroughRef.current = data.readAt;
      setCalls((previous) => markCallsRead(previous, { type: "callsense_missed_read", readAt: data.readAt }));
      if (session !== null && historyOpen.current && historySession.current === session) setHighlightReadAt(data.readAt);
      refreshUnreadMissed();
    } catch (_) { if (String(ridRef.current) === String(rid)) setError("Impossible de marquer les appels comme lus."); }
  }, [rid, context.isAuth, inScope, refreshUnreadMissed]);
  const openHistory = useCallback(() => {
    const session = ++historySession.current;
    historyOpen.current = true;
    setHighlightReadAt(null);
    setHighlightIds(Object.values(callsRef.current).filter((call) => ["missed", "busy"].includes(call.status) && !call.read).map((call) => call.id));
    setOpen(true);
    markAllRead(session);
  }, [markAllRead]);
  const closeHistory = useCallback(() => {
    historyOpen.current = false;
    historySession.current += 1;
    setOpen(false);
    setHighlightIds([]);
    setHighlightReadAt(null);
    markAllRead();
  }, [markAllRead]);
  useEffect(() => {
    const events = Object.values(context.callSenseReadEvent || {}).filter((event) => String(event.restaurantId) === String(rid));
    if (events.length) {
      for (const event of events) if (event.readAt && (!readThroughRef.current || new Date(event.readAt) > new Date(readThroughRef.current))) readThroughRef.current = event.readAt;
      setCalls((previous) => events.reduce(markCallsRead, previous));
    }
  }, [context.callSenseReadEvent, rid]);
  const load = useCallback(async (nextCursor, { active = false, first = false, callId = null } = {}) => {
    if (!rid || !context.isAuth || !inScope) return;
    if (!active && !callId) setLoading(true);
    try {
      const { data } = await axios.get(`${process.env.NEXT_PUBLIC_API_URL}/restaurants/${rid}/callsense/calls`, { params: { ...(nextCursor ? { cursor: nextCursor } : {}), ...(active ? { active: "true" } : {}), ...(callId ? { callId } : {}) } });
      if (String(ridRef.current) !== String(rid)) return;
      setEnabled(Boolean(data.enabled));
      setTestMode(Boolean(data.testMode));
      setAvailabilityRestaurantId(String(rid));
      const incoming = (data.calls || []).map(call => ({ ...call, match: "unknown", customerId: null, customerName: "", customerFirstName: "", customerLastName: "" }));
      setCalls((previous) => mergeCalls(previous, incoming, readThroughRef.current));
      resolveIdentities([...Object.values(callsRef.current), ...incoming]);
      if (active) setPopups((previous) => ({ ...previous, ...Object.fromEntries((data.calls || []).map((call) => [call.id, true])) }));
      if (callId && data.calls?.length) { setPopups((previous) => ({ ...previous, [callId]: true })); setDismissed((previous) => ({ ...previous, [callId]: false })); }
      if (!active && !callId && (!first || !cursorInitialized.current)) { cursorInitialized.current = true; cursorRef.current = data.nextCursor; setCursor(data.nextCursor); }
      setError("");
    } catch (err) {
      if (String(ridRef.current) !== String(rid)) return;
      if (err?.response?.status === 403) { setEnabled(false); setTestMode(false); setCalls({}); }
      else setError("Impossible de charger les appels. Réessayez.");
    } finally { if (!active && !callId && String(ridRef.current) === String(rid)) setLoading(false); }
  }, [rid, context.isAuth, inScope, resolveIdentities]);

  useEffect(() => { if (rid && context.isAuth && inScope) { load(null, { first: true }); load(null, { active: true }); } }, [rid, context.isAuth, context.callSenseReconnect, inScope, load]);
  useEffect(() => {
    if (!rid || !context.isAuth || !inScope) return;
    const refresh = () => { if (document.visibilityState !== "hidden") { load(null, { first: true }); load(null, { active: true }); refreshUnreadMissed(); } };
    window.addEventListener("pageshow", refresh);
    document.addEventListener("visibilitychange", refresh);
    return () => { window.removeEventListener("pageshow", refresh); document.removeEventListener("visibilitychange", refresh); };
  }, [rid, context.isAuth, inScope, load, refreshUnreadMissed]);
  useEffect(() => {
    const events = Object.values(context.callSenseEvents || {}).filter((call) => String(call.restaurantId) === String(rid));
    if (!events.length) return;
    const safeEvents = events.map(call => ({ ...call, match: "unknown", customerId: null, customerName: "", customerFirstName: "", customerLastName: "" }));
    setCalls((previous) => mergeCalls(previous, safeEvents, readThroughRef.current));
    resolveIdentities([...Object.values(callsRef.current), ...safeEvents]);
    if (historyOpen.current) setHighlightIds((previous) => Array.from(new Set([...previous, ...events.filter((call) => ["missed", "busy"].includes(call.status) && !call.read && !callsRef.current[call.id]?.readAt).map((call) => call.id)])));
    setPopups((previous) => ({ ...previous, ...Object.fromEntries(events.map((call) => [call.id, true])) }));
    if (router.pathname.startsWith("/dashboard/webapp/reservations") && typeof navigator !== "undefined" && navigator.serviceWorker) {
      const answered = events.filter((call) => call.status === "answered" || call.status === "completed");
      if (answered.length) navigator.serviceWorker.getRegistrations().then((registrations) => Promise.all(registrations.filter((registration) => registration.scope.includes("/dashboard/webapp/reservations")).map(async (registration) => {
        for (const call of answered) {
          const notifications = await registration.getNotifications({ tag: `callsense:${call.id}` });
          notifications.forEach((notification) => notification.close());
        }
      }))).catch(() => {});
    }
  }, [context.callSenseEvents, rid, router.pathname, resolveIdentities]);
  useEffect(() => {
    const change = context.callSenseIdentityChange;
    if (!change || String(change.restaurantId) !== String(rid)) return;
    const changed = new Set(change.phones || []);
    const loaded = Object.values(callsRef.current).filter(call => changed.has(comparablePhone(call.from)));
    if (!loaded.length) return;
    setCalls(previous => Object.fromEntries(Object.entries(previous).map(([id, call]) => [id, changed.has(comparablePhone(call.from)) ? { ...call, match: "unknown", customerId: null, customerName: "", customerFirstName: "", customerLastName: "" } : call])));
    resolveIdentities(loaded, true);
  }, [context.callSenseIdentityChange, rid, resolveIdentities]);
  const requestedId = typeof router.query.callId === "string" ? router.query.callId : "";
  useEffect(() => { if (requestedId && rid && context.isAuth && inScope) load(null, { callId: requestedId }); }, [requestedId, rid, context.isAuth, inScope, load]);
  const items = Object.values(calls).filter((call) => String(call.restaurantId) === String(rid)).sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt) || String(b.id).localeCompare(String(a.id)));
  return <CallSenseContext.Provider value={{ enabled: Boolean(rid && enabled), testMode: Boolean(rid && testMode), available: Boolean(rid && (enabled || testMode)), availabilityRestaurantId: rid && availabilityRestaurantId, calls: items, highlightIds, highlightReadAt, popups, dismissed, dismiss: (id) => setDismissed((old) => ({ ...old, [id]: true })), unreadMissedCount, open, openHistory, closeHistory, loading, error, cursor, loadMore: () => cursor && load(cursor), reload: () => load(null, { first: true }) }}>{children}</CallSenseContext.Provider>;
}
