import { useEffect, useState } from "react";
import axios from "axios";
import { CalendarDays, Pencil, Plus } from "lucide-react";
import frenchPlanning from "../../../../public/locales/fr/planning.json";
import { LeaveForm } from "../employees/days-off.employees.component";
import { leaveDateLabel, leaveDuration, leavePeriod, leaveStatuses, requestCreationTime } from "../employees/leave-requests.utils.mjs";
import { ClockDialog } from "../time-clock/register-controls.time-clock.component";
import { getAuthConfig } from "../time-clock/time-clock.utils";

const button = "inline-flex min-h-10 items-center justify-center gap-2 rounded-lg border border-darkBlue/15 bg-white px-3 text-sm font-semibold hover:bg-lightGrey disabled:opacity-50";
const primary = "inline-flex min-h-10 items-center justify-center gap-2 rounded-lg bg-darkBlue px-3 text-sm font-semibold text-white disabled:opacity-50";
const categoryLabel = (key) => frenchPlanning.absenceTypes[key] || "Non précisé";

export default function DaysOffMySpaceComponent({ employeeId, restaurantId }) {
  const root = `${process.env.NEXT_PUBLIC_API_URL}/restaurants/${restaurantId}/employees/${employeeId}/leave-requests`;
  const [requests, setRequests] = useState(null);
  const [revision, setRevision] = useState(0);
  const [dialog, setDialog] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const person = { id: String(employeeId), name: "Vous", shifts: [] };

  useEffect(() => {
    const controller = new AbortController();
    setError("");
    axios.get(root, getAuthConfig({ signal: controller.signal }))
      .then(({ data }) => { if (!controller.signal.aborted) setRequests(data || []); })
      .catch(() => { if (!controller.signal.aborted) setError("Impossible de charger vos demandes de congé."); });
    return () => controller.abort();
  }, [root, revision]);

  useEffect(() => {
    function refresh(event) {
      if (event.detail?.restaurantId && String(event.detail.restaurantId) !== String(restaurantId)) return;
      setRevision((value) => value + 1);
    }
    window.addEventListener("leaveRequestAdded", refresh);
    return () => window.removeEventListener("leaveRequestAdded", refresh);
  }, [restaurantId]);

  useEffect(() => {
    function open(event) {
      if (String(event.detail?.restaurantId) === String(restaurantId) &&
          String(event.detail?.employeeId) === String(employeeId)) {
        setDialog({ kind: "form", mode: "request" });
      }
    }
    window.addEventListener("openLeaveRequest", open);
    return () => window.removeEventListener("openLeaveRequest", open);
  }, [restaurantId, employeeId]);

  async function cancel() {
    if (!dialog?.request || busy) return;
    setBusy(true);
    setError("");
    try {
      const { data } = await axios.put(`${root}/${dialog.request._id}`, { status: "canceled" }, getAuthConfig());
      setRequests((current) => (current || []).map((item) => item._id === data.leaveRequest._id ? data.leaveRequest : item));
      setDialog(null);
    } catch (failure) {
      setError(failure.response?.data?.message || "Impossible d’annuler cette demande.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section id="my-leave-requests" className="grid min-w-0 scroll-mt-4 gap-3">
      <header className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="flex items-center gap-2 text-lg font-semibold"><CalendarDays size={20} aria-hidden="true" /> Mes demandes de congé</h2>
        <button type="button" className={primary} onClick={() => setDialog({ kind: "form", mode: "request" })}><Plus size={17} aria-hidden="true" /> Nouvelle demande</button>
      </header>
      {!dialog && error && <div role="alert" className="flex flex-wrap items-center gap-2 text-sm text-[#943d34]">{error}
        <button type="button" className={button} onClick={() => setRevision((value) => value + 1)}>Réessayer</button>
      </div>}
      {!requests && !error && <p role="status" className="text-sm text-darkBlue/65">Chargement des demandes…</p>}
      {requests && !requests.length && <p className="rounded-xl border border-darkBlue/10 bg-white p-4 text-sm text-darkBlue/70">Vous n’avez aucune demande de congé pour ce restaurant.</p>}
      {requests?.length > 0 && <ul className="divide-y divide-darkBlue/10 rounded-xl border border-darkBlue/10 bg-white">
        {[...requests].sort((a, b) => requestCreationTime(b) - requestCreationTime(a)).map((request) => {
          const recentDecision = [...(request.history || [])].reverse().find(({ action }) => action === "decision");
          return <li key={request._id} className="flex flex-wrap items-start justify-between gap-3 p-4">
            <div className="min-w-0 text-sm">
              <p className="font-semibold">{categoryLabel(request.absenceType)} · {leaveStatuses[request.status] || "—"}</p>
              <p className="mt-1 text-darkBlue/75">{leavePeriod(request)} · {leaveDuration(request)}</p>
              {request.note && <p className="mt-1 whitespace-pre-wrap break-words">{request.note}</p>}
              {recentDecision && <p className="mt-1 whitespace-pre-wrap break-words text-darkBlue/75">
                {[leaveDateLabel(recentDecision.at), recentDecision.actor?.name, recentDecision.note].filter(Boolean).join(" · ")}
              </p>}
            </div>
            {request.status === "pending" && <div className="flex flex-wrap gap-2">
              <button type="button" className={button} onClick={() => setDialog({ kind: "form", mode: "request", request, person })}>
                <Pencil size={15} aria-hidden="true" /> Modifier
              </button>
              <button type="button" className={button} onClick={() => { setError(""); setDialog({ kind: "cancel", request }); }}>Annuler la demande</button>
            </div>}
          </li>;
        })}
      </ul>}
      {dialog?.kind === "form" && <LeaveForm entry={dialog} people={[person]} categoryLabel={categoryLabel}
        categories={Object.keys(frenchPlanning.absenceTypes)} selectedEmployeeId={person.id} personal endpoint={() => root}
        onSaved={(_id, data) => {
          if (Array.isArray(data)) setRequests(data);
          else if (data.leaveRequest) setRequests((current) => (current || []).map((item) => item._id === data.leaveRequest._id ? data.leaveRequest : item));
          setDialog(null);
        }} onClose={() => setDialog(null)} />}
      {dialog?.kind === "cancel" && <ClockDialog title="Annuler la demande" onClose={() => { if (!busy) setDialog(null); }}>
        <div className="grid gap-3">
          <p className="text-sm">Confirmer l’annulation de la demande du {leavePeriod(dialog.request)} ?</p>
          {error && <p role="alert" className="text-sm text-[#943d34]">{error}</p>}
          <div className="flex flex-wrap justify-end gap-2">
            <button type="button" className={button} disabled={busy} onClick={() => { setError(""); setDialog(null); }}>Retour</button>
            <button type="button" className={primary} disabled={busy} onClick={cancel}>{busy ? "Annulation…" : "Confirmer"}</button>
          </div>
        </div>
      </ClockDialog>}
    </section>
  );
}
