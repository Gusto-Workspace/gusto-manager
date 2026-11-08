import { useRouter } from "next/router";
import Link from "next/link";
import { useCallback, useContext, useEffect, useRef, useState } from "react";
import { CalendarPlus, Phone, PhoneIncoming, X } from "lucide-react";
import { GlobalContext } from "@/contexts/global.context";
import { useCallSense } from "./callsense-context";
import { shouldHighlightCall } from "./callsense-read-state";

const statuses = {
  incoming: ["Appel entrant", "text-blue bg-blue/10"],
  initiated: ["Appel entrant", "text-blue bg-blue/10"],
  ringing: ["Sonnerie", "text-blue bg-blue/10"],
  answered: ["En communication", "text-green bg-green/10"],
  completed: ["Terminé", "text-darkBlue/60 bg-darkBlue/5"],
  missed: ["Appel manqué", "text-red bg-red/10"],
  failed: ["Échec de l’appel", "text-red bg-red/10"],
  busy: ["Ligne occupée", "text-red bg-red/10"],
  canceled: ["Appel interrompu", "text-darkBlue/60 bg-darkBlue/5"],
};

function CallActions({ call, webapp }) {
  const { restaurantContext } = useContext(GlobalContext);
  const restaurant = restaurantContext.restaurantData;
  const user = restaurantContext.userConnected;
  const employee = restaurant?.employees?.find((item) => String(item?._id) === String(user?.id));
  const profile = employee?.restaurantProfiles?.find((item) => String(item?.restaurant?._id || item?.restaurant) === String(restaurant?._id));
  const owner = user?.role === "owner";
  const canReserve = restaurant?.options?.reservations === true && (owner || profile?.options?.reservations === true);
  const canSeeCustomer = restaurant?.options?.customers === true && (owner || profile?.options?.customers === true);
  const base = webapp ? "/dashboard/webapp/reservations" : "/dashboard";
  const reservation = webapp ? `${base}/add` : `${base}/reservations/add`;
  return <div className="mt-3 flex flex-wrap gap-2 text-xs font-semibold">
    {canReserve && <Link href={`${reservation}?fromCall=${encodeURIComponent(call.id)}`} className="inline-flex items-center gap-1 rounded-xl bg-blue/10 px-3 py-2 text-blue"><CalendarPlus className="size-4" />Créer une réservation</Link>}
    {call.customerId && canSeeCustomer && <Link href={`${base}/customers?customerId=${encodeURIComponent(call.customerId)}`} className="rounded-xl border border-darkBlue/10 bg-white px-3 py-2 text-darkBlue/80">Voir la fiche client</Link>}
  </div>;
}

export function CallCard({ call, webapp = false, onDismiss, highlight = false }) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    if (call.status !== "answered") return;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [call.status]);
  const [label, colors] = statuses[call.status] || statuses.incoming;
  const seconds = Number.isFinite(call.duration) ? call.duration : call.status === "answered" && call.answeredAt ? Math.max(0, Math.floor((now - new Date(call.answeredAt).getTime()) / 1000)) : null;
  const duration = seconds == null ? null : `${Math.floor(seconds / 60)} min ${String(seconds % 60).padStart(2, "0")} s`;
  return <article className={`relative rounded-2xl border p-4 shadow-sm ${highlight ? "border-blue/20 bg-blue/5" : "border-darkBlue/10 bg-white"}`}>
    {highlight && <span role="img" aria-label="Appel récent" className="absolute -right-[1.25px] -top-[1.25px] size-2.5 rounded-full bg-blue" />}
    {onDismiss && <button onClick={onDismiss} aria-label="Fermer la notification d’appel" className="absolute right-3 top-3 rounded-full p-1 text-darkBlue/50"><X className="size-4" /></button>}
    <div className="flex items-start gap-3">
      <span className={`inline-flex size-10 shrink-0 items-center justify-center rounded-xl ${colors}`}><PhoneIncoming className="size-5" /></span>
      <div className="min-w-0 flex-1">
        <p className="truncate font-semibold text-darkBlue">{call.match === "ambiguous" ? "Correspondances multiples" : call.customerName || "Client inconnu"}</p>
        <p className="mt-0.5 break-all text-sm text-darkBlue/70">{call.from && /^\+[1-9]\d{1,14}$/.test(call.from) ? <a href={`tel:${call.from}`} aria-label={`Appeler ${call.from}`} className="underline decoration-darkBlue/30 underline-offset-2">{call.from}</a> : call.from || "Numéro masqué"}</p>
      </div>
      <div className={`flex max-w-[48%] shrink-0 flex-col items-end gap-1 text-right text-xs ${onDismiss ? "pr-6" : ""}`}>
        <span className={`rounded-full px-2 py-1 font-semibold ${colors}`}>{label}</span>
        <span className="text-darkBlue/50">{new Date(call.createdAt).toLocaleString("fr-FR", { dateStyle: "medium", timeStyle: "short" })}</span>
        {duration && <span className="text-darkBlue/50">{duration}</span>}
      </div>
    </div>
    <CallActions call={call} webapp={webapp} />
  </article>;
}

const FINAL_CALL_STATUSES = new Set(["completed", "missed", "failed", "busy", "canceled"]);
const POPUP_CLOSE_DELAY_MS = 5000;
const POPUP_SLIDE_DURATION_MS = 300;

function CallPopup({ call, webapp, onDismiss }) {
  const [visible, setVisible] = useState(false);
  const closeTimer = useRef(null);
  const closing = useRef(false);
  const dismissRef = useRef(onDismiss);
  dismissRef.current = onDismiss;

  const closeWithAnimation = useCallback(() => {
    if (closing.current) return;
    closing.current = true;
    setVisible(false);
    closeTimer.current = setTimeout(() => dismissRef.current(), POPUP_SLIDE_DURATION_MS);
  }, []);

  useEffect(() => {
    const frame = requestAnimationFrame(() => {
      if (!closing.current) setVisible(true);
    });
    return () => {
      cancelAnimationFrame(frame);
      clearTimeout(closeTimer.current);
    };
  }, []);

  useEffect(() => {
    if (!FINAL_CALL_STATUSES.has(call.status)) return;
    const timer = setTimeout(closeWithAnimation, POPUP_CLOSE_DELAY_MS);
    return () => clearTimeout(timer);
  }, [call.status, closeWithAnimation]);

  return <div className={`transform transition-all duration-300 ease-out motion-reduce:transition-none ${visible ? "translate-x-0 translate-y-0 opacity-100" : webapp ? "translate-y-full opacity-0" : "translate-x-full opacity-0"}`}>
    <CallCard call={call} webapp={webapp} onDismiss={closeWithAnimation} />
  </div>;
}

export function CallSenseHistory({ webapp = false }) {
  const state = useCallSense();
  if (!state) return null;
  return <div className="flex flex-col gap-3">
    {state.error && <div role="alert" className="rounded-2xl bg-red/10 p-4 text-sm text-red">{state.error} <button onClick={state.reload} className="underline">Réessayer</button></div>}
    {state.loading && state.calls.length === 0 && <p className="p-5 text-sm text-darkBlue/50">Chargement des appels…</p>}
    {!state.loading && !state.error && state.calls.length === 0 && <div className="rounded-2xl border border-dashed border-darkBlue/20 bg-white/60 px-5 py-10 text-center"><Phone className="mx-auto mb-3 size-6 text-darkBlue/30" /><p className="font-semibold">Aucun appel pour le moment</p><p className="mt-1 text-sm text-darkBlue/50">Les prochains appels apparaîtront ici.</p></div>}
    {state.calls.map((call) => <CallCard key={call.id} call={call} webapp={webapp} highlight={shouldHighlightCall(call, state)} />)}
    {state.cursor && <button disabled={state.loading} onClick={state.loadMore} className="rounded-xl border border-darkBlue/10 bg-white p-3 text-sm font-semibold disabled:opacity-50">{state.loading ? "Chargement…" : "Voir plus"}</button>}
  </div>;
}

export function CallSenseHeaderButton() {
  const state = useCallSense();
  if (!state?.enabled) return null;
  return <div className="relative pl-1.5"><button className="rounded-lg bg-blue bg-opacity-40 p-3" onClick={state.openHistory} aria-label={state.unreadMissedCount ? `Ouvrir les appels, ${state.unreadMissedCount} appels non lus` : "Ouvrir les appels"} title="Téléphone"><Phone size={25} color="#4583FF" /></button>{state.unreadMissedCount > 0 && <span className="absolute right-0 top-0 inline-flex translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full bg-red px-1 py-0.5 text-xs font-bold leading-none text-white">{state.unreadMissedCount}</span>}</div>;
}

function CallSenseDrawer({ open, onClose }) {
  const [visible, setVisible] = useState(false);
  const [dragY, setDragY] = useState(0);
  const panelRef = useRef(null);
  const closeRef = useRef(onClose);
  const timerRef = useRef(null);
  const dragRef = useRef(null);
  closeRef.current = onClose;

  const closeWithAnimation = () => {
    if (timerRef.current) return;
    setVisible(false);
    setDragY(0);
    timerRef.current = setTimeout(() => {
      timerRef.current = null;
      closeRef.current?.();
    }, 280);
  };

  useEffect(() => {
    if (!open) return;
    const bodyOverflow = document.body.style.overflow;
    const htmlOverflow = document.documentElement.style.overflow;
    document.body.style.overflow = "hidden";
    document.documentElement.style.overflow = "hidden";
    setVisible(false);
    setDragY(0);
    const frame = requestAnimationFrame(() => setVisible(true));
    const onKeyDown = (event) => { if (event.key === "Escape") closeWithAnimation(); };
    document.addEventListener("keydown", onKeyDown);
    return () => {
      cancelAnimationFrame(frame);
      clearTimeout(timerRef.current);
      timerRef.current = null;
      document.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = bodyOverflow;
      document.documentElement.style.overflow = htmlOverflow;
    };
  }, [open]);

  if (!open) return null;
  const onPointerDown = (event) => {
    if (window.matchMedia("(min-width: 768px)").matches || (event.pointerType === "mouse" && event.button !== 0)) return;
    dragRef.current = { y: event.clientY, time: performance.now() };
    event.currentTarget.setPointerCapture?.(event.pointerId);
  };
  const onPointerMove = (event) => {
    if (dragRef.current) setDragY(Math.max(0, event.clientY - dragRef.current.y));
  };
  const onPointerUp = (event) => {
    if (!dragRef.current) return;
    const distance = Math.max(0, event.clientY - dragRef.current.y);
    const velocity = distance / Math.max(1, performance.now() - dragRef.current.time);
    const threshold = Math.max(90, (panelRef.current?.getBoundingClientRect().height || 720) * 0.25);
    dragRef.current = null;
    if (distance >= threshold || velocity >= 0.6) closeWithAnimation();
    else setDragY(0);
  };

  return <div className="fixed inset-0 z-[999]" role="dialog" aria-modal="true" aria-label="Historique des appels">
    <div className={`absolute inset-0 bg-darkBlue/30 transition-opacity duration-200 ${visible ? "opacity-100" : "opacity-0"}`} style={{ opacity: visible ? 1 - Math.min(1, dragY / Math.max(240, panelRef.current?.offsetHeight || 720)) : 0 }} onClick={closeWithAnimation} />
    <div ref={panelRef} className={`absolute bottom-0 left-0 right-0 z-[1] flex min-h-[40vh] max-h-[86vh] w-full flex-col overflow-hidden rounded-t-3xl bg-white shadow-[0_25px_80px_rgba(19,30,54,0.25)] transition-transform duration-300 ease-out will-change-transform tablet:bottom-0 tablet:left-auto tablet:right-0 tablet:top-0 tablet:h-full tablet:max-h-[100vh] tablet:w-[420px] tablet:rounded-none ${visible ? "translate-y-0 tablet:translate-x-0" : "translate-y-full tablet:translate-y-0 tablet:translate-x-full"}`} style={dragY ? { transform: `translateY(${dragY}px)`, transition: "none" } : undefined}>
      <div className="cursor-grab touch-none tablet:hidden" onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={onPointerUp} onPointerCancel={onPointerUp}><div className="flex justify-center py-3"><div className="h-1.5 w-12 rounded-full bg-darkBlue/20" /></div></div>
      <div className="sticky top-0 z-10 flex items-center justify-between gap-3 border-b border-black/10 bg-white/70 px-4 pb-3 midTablet:py-3"><div><p className="font-bold text-darkBlue">Téléphone</p><p className="text-xs text-darkBlue/50">Appels et historique</p></div><button aria-label="Fermer" onClick={closeWithAnimation} className="inline-flex items-center justify-center rounded-full border border-darkBlue/10 bg-white p-2 hover:bg-darkBlue/5"><X className="size-4 text-darkBlue/70" /></button></div>
      <div className="flex-1 overflow-y-auto bg-lightGrey p-4"><CallSenseHistory /></div>
    </div>
  </div>;
}

export default function CallSensePanel() {
  const state = useCallSense();
  const router = useRouter();
  if (!state?.enabled) return null;
  const webapp = router.pathname.startsWith("/dashboard/webapp/reservations");
  const otherWebapp = router.pathname.startsWith("/dashboard/webapp/") && !webapp;
  const visible = state.calls.filter((call) => state.popups[call.id] && !state.dismissed[call.id]);
  return <>
    <CallSenseDrawer open={state.open} onClose={state.closeHistory} />
    {!otherWebapp && visible.length > 0 && <aside aria-label="Appels en cours" className={`fixed z-[100] flex max-h-[55dvh] w-[min(25rem,calc(100vw-2rem))] flex-col gap-2 overflow-y-auto ${webapp ? "bottom-[max(1rem,env(safe-area-inset-bottom))] left-1/2 -translate-x-1/2" : "bottom-4 right-4"}`}>{visible.map((call) => <CallPopup key={call.id} call={call} webapp={webapp} onDismiss={() => state.dismiss(call.id)} />)}</aside>}
  </>;
}
