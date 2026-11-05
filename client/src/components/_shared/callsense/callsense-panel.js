import { useContext, useEffect, useRef, useState } from "react";
import { useRouter } from "next/router";
import axios from "axios";
import { GlobalContext } from "@/contexts/global.context";

const labels = { incoming: "Appel entrant", initiated: "Appel entrant", ringing: "Sonnerie", answered: "En communication", completed: "Terminé", missed: "Manqué ou échoué" };

function mergeCall(list, call) {
  const old = list.find((item) => item.id === call.id);
  if (old && new Date(old.updatedAt) > new Date(call.updatedAt)) return list;
  const rank = { incoming: 0, initiated: 1, ringing: 2, answered: 3, completed: 4, missed: 4 };
  if (old && (rank[old.status] || 0) > (rank[call.status] || 0)) return list;
  return [call, ...list.filter((item) => item.id !== call.id)].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
}

export default function CallSensePanel() {
  const router = useRouter();
  const { restaurantContext: context } = useContext(GlobalContext);
  const rid = context.restaurantData?._id;
  const [calls, setCalls] = useState([]);
  const [dismissed, setDismissed] = useState({});
  const [history, setHistory] = useState(false);
  const [allowed, setAllowed] = useState(false);
  const [popupIds, setPopupIds] = useState({});
  const [now, setNow] = useState(Date.now());
  const restaurantRef = useRef(rid);
  restaurantRef.current = rid;
  const inDashboard = router.pathname.startsWith("/dashboard") && !router.pathname.startsWith("/dashboard/admin") && !router.pathname.startsWith("/dashboard/login");

  useEffect(() => { setCalls([]); setDismissed({}); setPopupIds({}); setHistory(false); setAllowed(false); }, [rid]);
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);
  useEffect(() => {
    if (!rid || !context.isAuth || !inDashboard) return;
    let cancelled = false;
    axios.get(`${process.env.NEXT_PUBLIC_API_URL}/restaurants/${rid}/callsense/calls`)
      .then(({ data }) => {
        if (cancelled || String(restaurantRef.current) !== String(rid)) return;
        setAllowed(Boolean(data.enabled || data.calls?.length));
        setCalls((previous) => (data.calls || []).reduce(mergeCall, previous));
        setPopupIds((previous) => {
          const next = { ...previous };
          for (const call of data.calls || []) {
            if (!["completed", "missed"].includes(call.status) && Date.now() - new Date(call.createdAt).getTime() < 3600000) next[call.id] = true;
          }
          return next;
        });
      }).catch(() => { if (!cancelled) setAllowed(false); });
    return () => { cancelled = true; };
  }, [rid, context.isAuth, context.callSenseReconnect, inDashboard]);

  useEffect(() => {
    const events = Object.values(context.callSenseEvents || {}).filter((call) => String(call.restaurantId) === String(rid));
    if (!events.length) return;
    setAllowed(true);
    setCalls((previous) => events.reduce(mergeCall, previous));
    setPopupIds((previous) => ({ ...previous, ...Object.fromEntries(events.map((call) => [call.id, true])) }));
  }, [context.callSenseEvents, rid]);

  const requestedId = typeof router.query.callId === "string" ? router.query.callId : "";
  useEffect(() => {
    if (!rid || !requestedId || !context.isAuth) return;
    let cancelled = false;
    axios.get(`${process.env.NEXT_PUBLIC_API_URL}/restaurants/${rid}/callsense/calls`, { params: { callId: requestedId } })
      .then(({ data }) => {
        if (cancelled || String(restaurantRef.current) !== String(rid)) return;
        if (data.calls?.[0]) { setAllowed(true); setCalls((old) => mergeCall(old, data.calls[0])); setDismissed((old) => ({ ...old, [requestedId]: false })); }
      }).catch(() => {});
    return () => { cancelled = true; };
  }, [rid, requestedId, context.isAuth]);

  if (!inDashboard || !allowed) return null;
  const visible = calls.filter((call) => !dismissed[call.id] && (call.id === requestedId || popupIds[call.id]));
  const items = history ? calls : visible;
  return <aside className="fixed bottom-4 right-4 z-[100] w-[min(24rem,calc(100vw-2rem))] text-darkBlue" aria-label="CallSense">
    <button className="mb-2 rounded-full bg-darkBlue px-4 py-2 text-white shadow-lg" onClick={() => setHistory((value) => !value)}>{history ? "Fermer l’historique" : "Historique des appels"}</button>
    <div className="flex max-h-[65vh] flex-col gap-2 overflow-y-auto">
      {history && items.length === 0 && <div className="rounded-xl bg-white p-4 shadow-lg">Aucun appel.</div>}
      {items.map((call) => <article key={call.id} className="rounded-xl bg-white p-4 shadow-lg">
        <div className="flex justify-between gap-4"><strong>{labels[call.status] || "Appel"}</strong><button aria-label="Fermer" onClick={() => { setDismissed((old) => ({ ...old, [call.id]: true })); if (history) setHistory(false); }}>✕</button></div>
        <p>{call.match === "ambiguous" ? "Correspondances multiples" : call.customerName || "Client inconnu"}</p>
        <p>{call.from || "Numéro masqué"}</p>
        <p className="text-sm">{new Date(call.createdAt).toLocaleString("fr-FR")} {call.duration != null ? `• ${call.duration} s` : call.status === "answered" && call.answeredAt ? `• ${Math.max(0, Math.floor((now - new Date(call.answeredAt).getTime()) / 1000))} s` : ""} {call.outcome ? `• ${call.outcome}` : ""}</p>
        {history && <p className="break-all text-xs">{call.callSid}{call.childCallSid ? ` / ${call.childCallSid}` : ""}</p>}
        {call.customerId && <a className="text-sm underline" href={`/dashboard/customers?customerId=${encodeURIComponent(call.customerId)}`}>Voir la fiche client</a>}
      </article>)}
    </div>
  </aside>;
}
