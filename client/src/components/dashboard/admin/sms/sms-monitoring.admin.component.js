import { useEffect, useState } from "react";
import axios from "axios";
import { Loader2, Pencil, RefreshCw, X } from "lucide-react";
import EditDestinationPolicyAdminComponent from "./edit-destination-policy.admin.component";
import EditSenderIdAdminComponent from "./edit-sender-id.admin.component";
import SenderStatusModalAdminComponent from "./sender-status-modal.admin.component";
import {
  formatSmsBillingStatus,
  formatSmsConsumedCredits,
  formatSmsDiagnostic,
  formatSmsJobStatus,
  formatSmsTrackingDate,
  getSmsJobTracking,
} from "./sms-job-labels.admin.utils";

function SmsJobTracking({ job }) {
  const timeZone = job.restaurantTimezone || "Europe/Paris";
  const tracking = getSmsJobTracking(job);

  if (!tracking) return <span className="text-darkBlue/45">—</span>;

  return (
    <p className="min-w-48 whitespace-nowrap text-[11px] leading-snug text-darkBlue/80">
      <span className="font-medium text-darkBlue/55">{tracking.label} :</span>{" "}
      {formatSmsTrackingDate(tracking.value, timeZone)}
    </p>
  );
}

export default function SmsMonitoringAdminComponent() {
  const [data, setData] = useState({ jobs: [], usage: [], policies: [], senders: [] });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [editingPolicy, setEditingPolicy] = useState(null);
  const [updatingSender, setUpdatingSender] = useState("");
  const [senderError, setSenderError] = useState("");
  const [senderAction, setSenderAction] = useState(null);
  const [editingSender, setEditingSender] = useState(null);
  const [verifyingSender, setVerifyingSender] = useState("");
  const [senderFeedback, setSenderFeedback] = useState(null);

  const pendingSenders = data.senders.filter(
    (sender) => sender.value && sender.status === "pending",
  );

  async function load() {
    setLoading(true);
    setError("");
    setSenderError("");
    setSenderFeedback(null);
    try {
      const token = localStorage.getItem("admin-token");
      const config = { headers: { Authorization: `Bearer ${token}` } };
      const [jobs, usage, policies, senders] = await Promise.all([
        axios.get(`${process.env.NEXT_PUBLIC_API_URL}/admin/sms/jobs`, config),
        axios.get(`${process.env.NEXT_PUBLIC_API_URL}/admin/sms/usage`, config),
        axios.get(`${process.env.NEXT_PUBLIC_API_URL}/admin/sms/destination-policies`, config),
        axios.get(`${process.env.NEXT_PUBLIC_API_URL}/admin/sms/senders`, config),
      ]);
      setData({ jobs: jobs.data.jobs || [], usage: usage.data.usage || [], policies: policies.data.policies || [], senders: senders.data.senders || [] });
    } catch (requestError) {
      setError(requestError?.response?.data?.message || "Impossible de charger le suivi SMS.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []);

  function openSenderAction(sender, status) {
    setSenderError("");
    setSenderAction({ sender, status });
  }

  function applySenderResult(restaurantId, result) {
    if (!result?.sender) return;
    setData((current) => ({
      ...current,
      senders: current.senders.map((sender) =>
        String(sender.restaurantId) === String(restaurantId)
          ? { ...sender, ...result.sender }
          : sender,
      ),
    }));
    setSenderFeedback(
      result.verification?.status === "unavailable"
        ? {
            type: "warning",
            message:
              result.verification.message ||
              "Sender ID enregistré, mais la vérification smsmode n’a pas pu être effectuée.",
          }
        : null,
    );
  }

  function closeSenderAction() {
    if (updatingSender) return;
    setSenderError("");
    setSenderAction(null);
  }

  async function updateSenderStatus() {
    if (!senderAction?.sender || !senderAction?.status) return;
    const { sender, status } = senderAction;

    setUpdatingSender(`${sender.restaurantId}:${status}`);
    setSenderError("");
    try {
      const token = localStorage.getItem("admin-token");
      const { data: result } = await axios.put(
        `${process.env.NEXT_PUBLIC_API_URL}/admin/restaurants/${sender.restaurantId}/sms-sender`,
        { status },
        { headers: { Authorization: `Bearer ${token}` } },
      );
      applySenderResult(sender.restaurantId, result);
      setSenderAction(null);
    } catch (requestError) {
      setSenderError(
        requestError?.response?.data?.message ||
          "Impossible de mettre à jour le Sender ID.",
      );
    } finally {
      setUpdatingSender("");
    }
  }

  async function verifySender(sender) {
    setVerifyingSender(String(sender.restaurantId));
    setSenderFeedback(null);
    try {
      const token = localStorage.getItem("admin-token");
      const { data: result } = await axios.post(
        `${process.env.NEXT_PUBLIC_API_URL}/admin/restaurants/${sender.restaurantId}/sms-sender/verify`,
        {},
        { headers: { Authorization: `Bearer ${token}` } },
      );
      applySenderResult(sender.restaurantId, result);
    } catch (requestError) {
      setSenderFeedback({
        type: "error",
        message:
          requestError?.response?.data?.message ||
          "Impossible de vérifier le Sender ID chez smsmode.",
      });
    } finally {
      setVerifyingSender("");
    }
  }

  return (
    <section className="grid gap-6">
      <div className="flex items-center justify-between"><div><h1 className="text-2xl font-semibold">Rappels SMS</h1><p className="text-sm text-darkBlue/60">Suivi opérationnel, consommation et politiques pays.</p></div><button type="button" onClick={load} className="inline-flex items-center gap-2 rounded-xl border border-darkBlue/15 bg-white px-4 py-2 text-sm"><RefreshCw className="size-4" />Actualiser</button></div>
      {loading ? <Loader2 className="size-5 animate-spin" /> : error ? <p className="text-red-600">{error}</p> : (
        <>
          <div className="grid gap-3 midTablet:grid-cols-2 desktop:grid-cols-3"><div className="rounded-2xl bg-white p-4"><span className="text-sm text-darkBlue/55">Jobs visibles</span><strong className="block text-2xl">{data.jobs.length}</strong></div><div className="rounded-2xl bg-white p-4"><span className="text-sm text-darkBlue/55">En attente de vérification</span><strong className="block text-2xl">{data.jobs.filter((job) => job.status === "uncertain").length}</strong></div><div className="rounded-2xl bg-white p-4"><span className="text-sm text-darkBlue/55">Sender IDs à traiter</span><strong className="block text-2xl">{pendingSenders.length}</strong></div></div>
          <div className="overflow-x-auto rounded-2xl bg-white p-4">
            <h2 className="mb-3 font-semibold">Jobs récents</h2>
            <table className="min-w-full text-left text-xs">
              <thead>
                <tr className="border-b">
                  <th className="p-2">État</th>
                  <th className="p-2">Restaurant</th>
                  <th className="p-2">Suivi</th>
                  <th className="p-2">Pays</th>
                  <th className="p-2">Crédits</th>
                  <th className="p-2">Facturation</th>
                  <th className="p-2">Provider ID</th>
                  <th className="p-2">Diagnostic</th>
                </tr>
              </thead>
              <tbody>
                {data.jobs.map((job) => (
                  <tr key={job._id} className="border-b border-darkBlue/5">
                    <td className="p-2 font-medium">
                      {formatSmsJobStatus(job.status)}
                    </td>
                    <td className="p-2">
                      {job.restaurantName || "Restaurant supprimé"}
                    </td>
                    <td className="p-2 align-top">
                      <SmsJobTracking job={job} />
                    </td>
                    <td className="p-2">{job.destinationCountry || "-"}</td>
                    <td className="p-2">{formatSmsConsumedCredits(job)}</td>
                    <td className="p-2">
                      {formatSmsBillingStatus(job.stripeUsageState)}
                    </td>
                    <td className="p-2">{job.providerMessageId || "-"}</td>
                    <td className="p-2">
                      {formatSmsDiagnostic(
                        job.skipReason || job.failureReason || job.failureCode,
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="overflow-x-auto rounded-2xl bg-white p-4"><h2 className="mb-3 font-semibold">Consommation par période</h2><table className="min-w-full text-left text-xs"><thead><tr className="border-b"><th className="p-2">Restaurant</th><th className="p-2">Période</th><th className="p-2">Crédits en cours</th><th className="p-2">Consommés</th><th className="p-2">Inclus</th><th className="p-2">Dépassement</th></tr></thead><tbody>{data.usage.map((period) => <tr key={period._id} className="border-b border-darkBlue/5"><td className="p-2">{period.restaurantName || "Restaurant supprimé"}</td><td className="p-2">{new Date(period.periodStart).toLocaleDateString("fr-FR")} – {new Date(period.periodEnd).toLocaleDateString("fr-FR")}</td><td className="p-2">{period.reservedCredits}</td><td className="p-2">{period.consumedCredits}</td><td className="p-2">{period.includedCreditsConsumed}/{period.includedCredits}</td><td className="p-2">{period.overageCredits} · {Number(period.overageAmount || 0).toFixed(2)} €</td></tr>)}</tbody></table></div>
          <div className="overflow-x-auto rounded-2xl bg-white p-4">
            <h2 className="mb-3 font-semibold">Sender IDs</h2>
            {senderFeedback ? (
              <p
                className={`mb-3 rounded-xl border px-3 py-2 text-sm ${
                  senderFeedback.type === "error"
                    ? "border-red/20 bg-red/10 text-red"
                    : "border-orange/20 bg-orange/10 text-darkBlue/70"
                }`}
              >
                {senderFeedback.message}
              </p>
            ) : null}
            {data.senders.length ? (
              <table className="min-w-full text-left text-xs">
                <thead>
                  <tr className="border-b">
                    <th className="p-2">Restaurant</th>
                    <th className="p-2">Sender ID</th>
                    <th className="p-2">Statut</th>
                    <th className="p-2 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {data.senders.map((sender) => {
                    const isRejecting =
                      updatingSender === `${sender.restaurantId}:rejected`;
                    const isVerifying =
                      verifyingSender === String(sender.restaurantId);
                    const isUpdating = isRejecting || isVerifying;
                    const configured = Boolean(sender.value);
                    const isPending = configured && sender.status === "pending";
                    const statusLabel = !configured
                      ? "Non configuré"
                      : sender.status === "approved"
                        ? "Approuvé"
                        : sender.status === "rejected"
                          ? "Rejeté"
                          : "À créer chez smsmode";
                    return (
                      <tr
                        key={sender.restaurantId}
                        className="border-b border-darkBlue/5"
                      >
                        <td className="p-2">{sender.restaurantName}</td>
                        <td className="p-2 font-medium">{sender.value || "—"}</td>
                        <td className="p-2">
                          <span>{statusLabel}</span>
                          {isPending ? (
                            <span className="mt-1 block max-w-56 text-[11px] text-darkBlue/50">
                              Ce Sender ID n’est pas encore disponible chez
                              smsmode.
                            </span>
                          ) : null}
                        </td>
                        <td className="p-2">
                          <div className="flex flex-wrap justify-end gap-2">
                            <button
                              type="button"
                              disabled={isUpdating}
                              onClick={() => setEditingSender(sender)}
                              className="inline-flex items-center gap-1 rounded-lg border border-darkBlue/15 px-2.5 py-1.5 font-medium hover:bg-darkBlue/5 disabled:opacity-50"
                            >
                              <Pencil className="size-3.5" />
                              {configured ? "Modifier" : "Configurer"}
                            </button>
                            {isPending ? (
                              <>
                                <button
                                  type="button"
                                  disabled={isUpdating}
                                  onClick={() => verifySender(sender)}
                                  className="inline-flex items-center gap-1 rounded-lg border border-blue/25 px-2.5 py-1.5 font-medium text-blue hover:bg-blue/10 disabled:cursor-wait disabled:opacity-50"
                                >
                                  <RefreshCw
                                    className={`size-3.5 ${isVerifying ? "animate-spin" : ""}`}
                                  />
                                  Vérifier chez smsmode
                                </button>
                                <button
                                  type="button"
                                  disabled={isUpdating}
                                  onClick={() =>
                                    openSenderAction(sender, "rejected")
                                  }
                                  className="inline-flex items-center gap-1 rounded-lg border border-red/25 px-2.5 py-1.5 font-medium text-red hover:bg-red/10 disabled:cursor-wait disabled:opacity-50"
                                >
                                  {isRejecting ? (
                                    <Loader2 className="size-3.5 animate-spin" />
                                  ) : (
                                    <X className="size-3.5" />
                                  )}
                                  Rejeter
                                </button>
                              </>
                            ) : null}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            ) : (
              <p className="text-sm text-darkBlue/55">
                Aucun Sender ID connu.
              </p>
            )}
          </div>
          <div className="overflow-x-auto rounded-2xl bg-white p-4"><h2 className="mb-3 font-semibold">Politiques destinations</h2><table className="min-w-full text-left text-xs"><thead><tr className="border-b"><th className="p-2">Pays</th><th className="p-2">Active</th><th className="p-2">Sender</th><th className="p-2">Crédits</th><th className="p-2">Tarif HT</th><th className="p-2">Revue</th><th className="p-2 text-right">Action</th></tr></thead><tbody>{data.policies.map((policy) => <tr key={policy._id} className="border-b border-darkBlue/5"><td className="p-2 font-medium">{policy.country}</td><td className="p-2">{policy.enabled ? "Oui" : "Non"}</td><td className="p-2">{policy.senderMode}</td><td className="p-2">{policy.billingCredits}</td><td className="p-2">{policy.providerRateHt}</td><td className="p-2">{policy.lastReviewedAt ? new Date(policy.lastReviewedAt).toLocaleDateString("fr-FR") : "-"}</td><td className="p-2 text-right"><button type="button" onClick={() => setEditingPolicy(policy)} className="inline-flex items-center gap-1 rounded-lg border border-darkBlue/15 px-2.5 py-1.5 font-medium hover:bg-darkBlue/5"><Pencil className="size-3.5" />Modifier</button></td></tr>)}</tbody></table></div>
        </>
      )}
      {editingPolicy ? <EditDestinationPolicyAdminComponent policy={editingPolicy} onClose={() => setEditingPolicy(null)} onSaved={async () => { await load(); setEditingPolicy(null); }} /> : null}
      {editingSender ? <EditSenderIdAdminComponent sender={editingSender} onClose={() => setEditingSender(null)} onSaved={async (result) => { applySenderResult(editingSender.restaurantId, result); setEditingSender(null); }} /> : null}
      <SenderStatusModalAdminComponent
        action={senderAction}
        error={senderError}
        loading={Boolean(updatingSender)}
        onClose={closeSenderAction}
        onConfirm={updateSenderStatus}
      />
    </section>
  );
}
