import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import dynamic from "next/dynamic";
import { useRouter } from "next/router";
import axios from "axios";
import { ArrowUpRight, BadgeEuro, CalendarClock, ChartNoAxesCombined, ChevronDown, CircleAlert, ClipboardList, FileCheck, FileDown, Files, History, Plus, Store, Users } from "lucide-react";
import { useTranslation } from "next-i18next";
import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { MetricCard } from "@/components/dashboard/admin/dashboard/dashboard.admin.component";
import { parisPlanningDateKey } from "@/components/dashboard/employees/planning-grid.utils.mjs";
import SimpleSkeleton from "@/components/_shared/skeleton/simple-skeleton.component";
import { getAdminAuthConfig } from "@/components/dashboard/admin/_shared/utils/admin-auth.utils";
import { adminCommercialApi as adminRequest, commercialApi, sellerPath } from "./commercial-api";
import { calendarDateLabel, calendarTypes } from "./commercial-calendar";
import { stageLabels } from "./prospects-board";
import { CommercialBadge, CommercialDocumentList, CommercialEmpty, CommercialHeader, CommercialSubheading, commercialDocumentKinds, commercialDocumentState, commercialPanel, commercialSecondary } from "./commercial-ui";
import InvoiceSettlement from "./invoice-settlement";

const DetailsDocumentAdminPage = dynamic(() => import("@/components/dashboard/admin/documents/details.documents.admin.component"), {
  ssr: false, loading: () => <SimpleSkeleton />,
});

const money = new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR" });
const specialCommissionLabels = { CONTESTED: "Contestée", CANCELLED: "Annulée" };
const commissionDescriptions = {
  WAITING_CUSTOMER_PAYMENT: "Contrat signé. Les frais de mise en service restent à encaisser.",
  TO_PAY: "Les frais de mise en service sont réglés. Le paiement de la commission reste à effectuer.",
  PAID: "Règlement effectué et enregistré dans Gusto Manager.",
};
const amount = (cents) => money.format(cents / 100);
const day = (value) => value ? new Date(value).toLocaleDateString("fr-FR", { timeZone: "Europe/Paris" }) : "—";
const today = () => new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Paris" }).format(new Date());

function commissionLabels(t, isAdmin) {
  return {
    WAITING_CUSTOMER_PAYMENT: t("commissions.waitingCustomerPayment"),
    TO_PAY: t(isAdmin ? "commissions.toPay" : "commissions.toReceive"),
    PAID: t("commissions.paid"),
    ...specialCommissionLabels,
  };
}

function FilterBar({ accounts, fixed, value, onChange, dates = true }) {
  const setField = (key) => (event) => onChange({ ...value, [key]: event.target.value });
  return <div className="flex flex-wrap gap-3">
    {dates && <>
      <label className="grid gap-1 text-sm">Du<input type="date" value={value.from || ""} onChange={setField("from")} className="input-commercial" /></label>
      <label className="grid gap-1 text-sm">Au<input type="date" value={value.to || ""} onChange={setField("to")} className="input-commercial" /></label>
    </>}
    {!fixed && accounts.length > 0 && <label className="grid gap-1 text-sm">Commercial
      <select value={value.salesOwnerId || ""} onChange={setField("salesOwnerId")} className="input-commercial">
        <option value="">Tous les commerciaux</option>
        {accounts.map(({ _id, firstName, lastName }) => <option key={_id} value={_id}>{firstName} {lastName}</option>)}
      </select>
    </label>}
  </div>;
}

function queryParams(fields) {
  return new URLSearchParams(Object.entries(fields).filter(([, value]) => value !== "" && value != null)).toString();
}

const fieldDate = (date) => date.toISOString().slice(0, 10);
const dateTime = (date) => new Date(date).toLocaleString("fr-FR", { timeZone: "Europe/Paris", dateStyle: "short", timeStyle: "short" });
const panel = `${commercialPanel} p-4 midTablet:p-5`;
const commissionTones = { WAITING_CUSTOMER_PAYMENT: "warning", TO_PAY: "info", PAID: "success", CONTESTED: "danger", CANCELLED: "neutral" };

function quickPeriod(preset) {
  const to = today();
  const [year, month] = to.split("-").map(Number);
  if (preset === "previous") return { from: fieldDate(new Date(Date.UTC(year, month - 2, 1))), to: fieldDate(new Date(Date.UTC(year, month - 1, 0))) };
  return { from: preset === "year" ? `${year}-01-01` : `${to.slice(0, 7)}-01`, to };
}

function DashboardPeriod({ period, onChange }) {
  const { t } = useTranslation("commercial");
  const [preset, setPreset] = useState("current");
  const [draft, setDraft] = useState(period);
  const options = ["current", "previous", "year", "custom"];
  return <form className="flex flex-wrap items-end gap-3" onSubmit={(event) => {
    event.preventDefault();
    if (preset === "custom") onChange(draft);
  }}>
    <label className="grid gap-1 text-sm font-medium">{t("period.label")}
      <select value={preset} className="input-commercial" onChange={(event) => {
        const next = event.target.value;
        setPreset(next);
        if (next === "custom") setDraft(period);
        else onChange(quickPeriod(next));
      }}>
        {options.map((option) => <option key={option} value={option}>{t(`period.${option}`)}</option>)}
      </select>
    </label>
    {preset !== "custom" && <p className="py-2.5 text-sm text-darkBlue/75">{day(`${period.from}T12:00:00Z`)} – {day(`${period.to}T12:00:00Z`)}</p>}
    {preset === "custom" && ["from", "to"].map((field) => <label key={field} className="grid min-w-0 gap-1 text-sm font-medium">{t(`period.${field}`)}
      <input type="date" value={draft[field]} required
        min={field === "to" ? draft.from : undefined} className="input-commercial"
        onChange={(event) => setDraft((current) => ({ ...current, [field]: event.target.value }))} />
    </label>)}
    {preset === "custom" && <button type="submit" className="button-commercial">{t("period.apply")}</button>}
  </form>;
}

function Pipeline({ data }) {
  const rows = Object.entries(stageLabels)
    .map(([stage, label]) => ({ label, count: data.prospectsByStage?.[stage] || 0 })).filter(({ count }) => count);
  return <section className={panel}>
    <CommercialSubheading icon={ChartNoAxesCombined} title="Répartition des prospects" description={`${data.totalProspects} prospect${data.totalProspects === 1 ? "" : "s"} hors archives, par statut actuel.`} />
    {rows.length ? <>
      <div className="mt-2" style={{ height: Math.max(108, rows.length * 30 + 32) }}>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart layout="vertical" data={rows} margin={{ left: 4, right: 10, top: 0, bottom: 0 }}>
            <CartesianGrid stroke="#ebe7f4" strokeDasharray="4 4" horizontal={false} />
            <XAxis type="number" allowDecimals={false} tickLine={false} axisLine={false} tick={{ fontSize: 12, fill: "#46516a" }} />
            <YAxis type="category" dataKey="label" width={113} tickLine={false} axisLine={false} tick={{ fontSize: 11, fill: "#35415d" }} />
            <Tooltip formatter={(value) => [value, "Prospects"]} cursor={{ fill: "#f7f3ff" }} contentStyle={{ borderRadius: 12 }} />
            <Bar dataKey="count" fill="#6954c7" radius={[0, 7, 7, 0]} maxBarSize={19} />
          </BarChart>
        </ResponsiveContainer>
      </div>
      <ul className="sr-only">{rows.map(({ label, count }) => <li key={label}>{label} · {count}</li>)}</ul>
    </> : <p className="mt-4 rounded-xl bg-lightGrey/65 p-3 text-sm text-darkBlue/65">Les statuts s’afficheront dès qu’un prospect sera ajouté.</p>}
  </section>;
}

function ActivityChart({ rows }) {
  const label = (value) => value.length === 7 ? value.split("-").reverse().join("/") : value.slice(5).split("-").reverse().join("/");
  return <section className={panel}>
    <CommercialSubheading icon={ChartNoAxesCombined} title="Évolution de l’activité" />
    {rows.some(({ quotes, contracts, sales }) => quotes || contracts || sales) ? <div className="mt-4 h-56">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={rows} margin={{ top: 4, left: 0, right: 4 }}>
          <CartesianGrid vertical={false} stroke="#e7e5ee" strokeDasharray="4 4" />
          <XAxis dataKey="period" tickFormatter={label} minTickGap={24} tick={{ fontSize: 11 }} tickLine={false} />
          <YAxis allowDecimals={false} width={24} tick={{ fontSize: 11 }} tickLine={false} axisLine={false} />
          <Tooltip labelFormatter={label} contentStyle={{ borderRadius: 12 }} />
          <Legend wrapperStyle={{ fontSize: 12 }} />
          <Bar dataKey="quotes" name="Devis envoyés" fill="#6853c9" maxBarSize={24} radius={[3, 3, 0, 0]} />
          <Bar dataKey="contracts" name="Contrats signés" fill="#397dec" maxBarSize={24} radius={[3, 3, 0, 0]} />
          <Bar dataKey="sales" name="Clients acquis" fill="#25825e" maxBarSize={24} radius={[3, 3, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div> : <p className="mt-3 text-sm text-darkBlue/70">Aucun devis envoyé, contrat signé ou client acquis sur cette période.</p>}
  </section>;
}

function CommissionSummary({ data, isAdmin, href, onFilter, currentStatus }) {
  const { t } = useTranslation("commercial");
  const statuses = commissionLabels(t, isAdmin);
  const labels = [
    [data.pending, "WAITING_CUSTOMER_PAYMENT", "Frais de mise en service à encaisser"],
    [data.toPay, "TO_PAY", "Frais de mise en service encaissés"],
    [data.paid, "PAID", onFilter ? "Commissions réglées" : "Règlements enregistrés sur la période"],
  ];
  return <section className={panel}>
    <CommercialSubheading title={onFilter ? "Synthèse des commissions" : isAdmin ? "Commissions" : "Mes commissions"} icon={BadgeEuro}
      action={href && <Link href={href} className="inline-flex items-center gap-1 text-sm font-semibold text-[#4d399e] hover:underline">Voir les commissions <ArrowUpRight size={15} aria-hidden="true" /></Link>} />
    <dl className="mt-4 grid min-w-0 gap-2 midTablet:grid-cols-3">
      {labels.map(([values, key, note]) => {
        const stage = values || { count: 0, amountCents: 0 };
        return <div key={key} className="rounded-xl border border-darkBlue/10 bg-[#faf9fd] p-3">
        <dt>{onFilter ? <button type="button" aria-pressed={currentStatus === key} onClick={() => onFilter(currentStatus === key ? "" : key)} className="text-left hover:underline">
          <CommercialBadge tone={commissionTones[key]}>{statuses[key]}</CommercialBadge>
        </button> : <CommercialBadge tone={commissionTones[key]}>{statuses[key]}</CommercialBadge>}</dt>
        <dd className="mt-2 break-words text-xl font-bold tracking-tight tabular-nums">{amount(stage.amountCents)}</dd>
        <dd className="text-xs text-darkBlue/70">{stage.count} commission{stage.count === 1 ? "" : "s"} · {note}</dd>
      </div>;
      })}
    </dl>
  </section>;
}

function DashboardLink({ href, label, value }) {
  return <Link href={href} className="flex min-h-11 items-center justify-between gap-2 rounded-xl border border-darkBlue/10 bg-white px-3 py-2 text-sm hover:border-violet/35 hover:bg-[#f9f6ff]">
    <span className="min-w-0 font-semibold">{label}</span>
    <span className="flex shrink-0 items-center gap-2 text-[#4d399e]"><strong className="tabular-nums">{value}</strong><ArrowUpRight size={15} aria-hidden="true" /></span>
  </Link>;
}

export function SalesDashboard({ header, isAdmin = false, accounts = [], fixedAccountId = "", accountPath = "", canCreateRestaurant = false }) {
  const [period, setPeriod] = useState(() => quickPeriod("current"));
  const [filter, setFilter] = useState({ salesOwnerId: fixedAccountId });
  const [data, setData] = useState(null);
  const [error, setError] = useState("");
  const [refresh, setRefresh] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    setData(null);
    const search = queryParams({ ...period, ...filter });
    const request = isAdmin ? adminRequest(`/pilotage/dashboard?${search}`, { signal: controller.signal }) :
      commercialApi(`/dashboard?${search}`, { signal: controller.signal });
    request.then((result) => { setData(result); setError(""); }).catch((err) => {
      if (!controller.signal.aborted) { setError(err.message); setData(null); }
    });
    return () => controller.abort();
  }, [isAdmin, period, filter, refresh]);

  const base = accountPath || (isAdmin ? "/dashboard/admin/seller" : sellerPath);
  const portfolioHref = (tab, params) => `${base}/${tab}?${queryParams({
    ...params, ...(isAdmin && !fixedAccountId && { salesOwnerId: filter.salesOwnerId }),
  })}`;
  const prospectHref = (item) => `${base}/prospects?prospectId=${item._id}`;
  const calendarHref = (item) => `${base}/calendar?${queryParams({
    date: parisPlanningDateKey(new Date(item.startsAt)), event: item.eventId || item._id,
  })}`;
  const documentHref = (item) => isAdmin && !accountPath ? `/dashboard/admin/documents/add/${item._id}` :
    `${base}/${commercialDocumentKinds[item.type].tab}?document=${item._id}`;
  const groups = data && [
    ["Relances en retard", data.nextActions.overdue, "text-[#972e27]"],
    ["Relances du jour", data.nextActions.dueToday, "text-[#805014]"],
    ["Rendez-vous à venir", data.nextActions.appointments],
    ["Relances à venir", data.nextActions.followUps],
    ["Démonstrations à venir", data.upcomingDemos],
    ["Liens de signature expirés", data.nextActions.expiredContracts],
  ];
  return <section className="grid min-w-0 gap-4">
    <CommercialHeader title={isAdmin ? "Pilotage commercial" : "Tableau de bord"}
      action={<Link href={`${base}/calendar?create=1`} aria-label="Planifier un événement" className="button-commercial inline-flex items-center gap-2">
        <Plus size={17} aria-hidden="true" /><span className="commercial-header-action-label mobile:hidden">Planifier</span>
        <span className="commercial-header-action-label hidden mobile:inline">Planifier un événement</span>
      </Link>} {...header} />
    <div className={`${commercialPanel} flex flex-wrap items-end gap-3 p-3 midTablet:px-4`}>
      <DashboardPeriod period={period} onChange={setPeriod} />
      <FilterBar accounts={accounts} fixed={Boolean(fixedAccountId)} dates={false} value={filter} onChange={setFilter} />
    </div>
    {isAdmin && <section className="grid gap-3" aria-labelledby="commercial-admin-actions">
      <h2 id="commercial-admin-actions" className="text-lg font-bold">Prochaines actions administratives</h2>
      <div className="grid min-w-0 items-start gap-3 desktop:grid-cols-2 min-[1600px]:grid-cols-3">
        {Object.keys(adminQueues).map((queue) => <SalesQueue key={`${queue}:${filter.salesOwnerId}`} queue={queue}
          owner={filter.salesOwnerId} refresh={refresh} canCreateRestaurant={canCreateRestaurant} accounts={accounts}
          onSaved={() => setRefresh((value) => value + 1)} />)}
      </div>
    </section>}
    {error && <p role="alert" className="rounded-xl bg-red/10 p-3 text-sm text-red">{error}</p>}
    {!data && !error && <SimpleSkeleton />}
    {data && <>
      <div className="grid auto-rows-fr grid-cols-2 gap-2.5 desktop:grid-cols-4">
        <MetricCard compact icon={Users} title="Prospects en cours" value={data.open} hint="Actuellement en prospection" />
        <MetricCard compact icon={CalendarClock} title="Rendez-vous à venir" value={data.appointments} hint="Rendez-vous programmés" />
        <MetricCard compact icon={FileCheck} title="Devis envoyés" value={data.quotesSent} hint="Sur la période sélectionnée" />
        <MetricCard compact icon={Store} title="Clients acquis" value={data.acquired} hint="Sur la période sélectionnée" />
      </div>
      <div className="grid min-w-0 items-start gap-4 desktop:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)]">
        <div className="grid min-w-0 content-start gap-4">
          <section className={panel}>
            <CommercialSubheading icon={CalendarClock} title={isAdmin ? "Prochaines actions" : "Aujourd’hui et à venir"}
              description={isAdmin ? "Les actions planifiées dans le périmètre sélectionné." : "Les relances à traiter et les prochains rendez-vous."} />
            <div className="mt-3 grid gap-3">
              {groups.filter(([, items], index) => index < 3 || items.length).map(([label, items, color]) => <div key={label} className="rounded-xl border border-darkBlue/10 bg-[#fbfaff] p-3">
                <h3 className={`text-sm font-bold ${color || ""}`}>{label}</h3>
                {items.length ? <ul className="divide-y divide-darkBlue/10 text-sm">
                  {items.map((item) => {
                    const contract = item.signatureRequest;
                    const date = contract?.expiresAt || item.startsAt;
                    return <li key={item.eventId || item._id} className="flex flex-wrap items-baseline justify-between gap-2 py-2">
                      <Link href={contract ? documentHref({ ...item, type: "CONTRACT" }) : calendarHref(item)} className="min-w-0 break-words font-medium text-[#38539b] hover:underline">{item.title || item.restaurantName || item.party?.restaurantName || label}</Link>
                      <time dateTime={date} className="text-xs text-darkBlue/65">{calendarDateLabel(date, item.allDay)}</time>
                    </li>;
                  })}
                </ul> : <p className="mt-1 text-xs text-darkBlue/60">Aucune</p>}
              </div>)}
            </div>
          </section>
          <ActivityChart rows={data.activity || []} />
        </div>
        <div className="grid min-w-0 content-start gap-4">
          <section className={panel}>
            <CommercialSubheading icon={ClipboardList} title="Dossiers à suivre" />
            <div className="mt-3 grid gap-2">
              <DashboardLink href={portfolioHref("prospects", { stage: "INTERESTED" })} label="Prospects intéressés" value={data.prospectsByStage.INTERESTED || 0} />
              <DashboardLink href={portfolioHref("prospects", { stage: "NEGOTIATION" })} label="Prospects en négociation" value={data.prospectsByStage.NEGOTIATION || 0} />
              <DashboardLink href={portfolioHref(isAdmin && !accountPath ? "documents" : "quotes", { type: "QUOTE", status: "DRAFT" })} label="Devis en brouillon" value={data.quoteDrafts} />
              <DashboardLink href={portfolioHref(isAdmin && !accountPath ? "documents" : "contracts", { type: "CONTRACT", signature: "pending" })} label="Contrats en attente de signature" value={data.pendingContracts} />
              <DashboardLink href={portfolioHref(isAdmin && !accountPath ? "documents" : "invoices", { type: "INVOICE", status: "SENT" })} label="Factures à encaisser" value={data.invoicesUnpaid} />
              <p className="px-1 text-sm text-darkBlue/70">{data.invoicesSent} facture(s) envoyée(s) sur la période</p>
            </div>
          </section>
          <CommissionSummary data={data} isAdmin={isAdmin} href={`${base}/commissions`} />
          <section className={panel}>
            <CommercialSubheading icon={ChartNoAxesCombined} title="Résultats sur la période" />
            <dl className="mt-3 grid gap-3 mobile:grid-cols-2">
              <div><dt className="text-sm text-darkBlue/70">Démonstrations réalisées</dt><dd className="text-lg font-semibold">{data.demos}</dd></div>
              <div><dt className="text-sm text-darkBlue/70">Rendez-vous réalisés</dt><dd className="text-lg font-semibold">{data.completedAppointments}</dd></div>
              <div><dt className="text-sm text-darkBlue/70">Taux de conversion</dt><dd className="text-lg font-semibold">{Math.round(data.conversion.rate * 1000) / 10} %</dd>
                <dd className="text-xs text-darkBlue/65">{data.conversion.converted} devenu{data.conversion.converted === 1 ? " client" : "s clients"} parmi {data.conversion.cohort} prospect{data.conversion.cohort === 1 ? " créé" : "s créés"} sur la période</dd>
              </div>
            </dl>
          </section>
          {isAdmin && !accountPath && <section className={panel}>
            <CommercialSubheading icon={CircleAlert} title="Dossiers à contrôler" />
            <ul className="mt-2 grid gap-2 text-sm">
                <li><Link className="text-blue hover:underline" href={`${base}/prospects#conflicts`}>{data.unresolvedConflicts ?? 0} dossier{data.unresolvedConflicts === 1 ? "" : "s"} à arbitrer</Link></li>
                <li><Link className="text-blue hover:underline" href={`${base}/documents?review=delivery`}>{data.deliveryReviews} livraison{data.deliveryReviews === 1 ? "" : "s"} à vérifier</Link></li>
                <li><Link className="text-blue hover:underline" href={`${base}/accounts`}>Voir les résultats des commerciaux · {data.commercials} actif{data.commercials === 1 ? "" : "s"}</Link></li>
            </ul>
          </section>}
        </div>
      </div>
      {isAdmin && !accountPath && !filter.salesOwnerId && accounts.some(({ performance }) => performance) && <section className={panel}>
        <CommercialSubheading icon={Users} title="Activité de l’équipe" description="Depuis le début du mois"
          action={<Link href={`${base}/accounts`} className="text-sm font-semibold text-blue hover:underline">Tous les commerciaux</Link>} />
        <ul className="mt-2 divide-y divide-darkBlue/10">
          {accounts.slice(0, 6).map(({ _id, firstName, lastName, performance }) => performance && <li key={_id} className="grid gap-1 py-3 text-sm midTablet:grid-cols-[minmax(0,1fr)_minmax(0,2fr)]">
            <Link href={`${base}/accounts/${_id}`} className="font-semibold text-[#38539b] hover:underline">{firstName} {lastName}</Link>
            <span className="text-darkBlue/70">{performance.prospects} prospect(s) · {performance.quotesSent} devis envoyé(s) · {performance.acquired} client(s) acquis</span>
          </li>)}
        </ul>
      </section>}
      <div className="grid min-w-0 items-start gap-4 desktop:grid-cols-2">
        <Pipeline data={data} />
        <section className={panel}>
          <CommercialSubheading icon={History} title="Activité récente" />
          <ul className="commercial-timeline mt-2 text-sm">
            {[...data.recentProspects.map((item) => ({ ...item, label: item.restaurantName, kind: "Prospect", href: prospectHref(item) })),
              ...data.recentEvents.map((item) => ({ ...item, label: item.title || calendarTypes[item.type],
                kind: item.state === "COMPLETED" ? "Événement réalisé" : "Événement annulé", href: calendarHref(item) })),
              ...data.recentDocuments.map((item) => ({ ...item, label: item.party.restaurantName, kind: commercialDocumentKinds[item.type].label, href: documentHref(item) }))]
              .sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt))).slice(0, 7).map((item) => <li key={item._id} className="commercial-timeline-item flex flex-wrap items-baseline justify-between gap-2 py-2">
                <Link href={item.href} className="min-w-0 break-words hover:text-blue hover:underline">{item.kind} · {item.label}</Link>
                <time dateTime={item.updatedAt} className="text-xs text-darkBlue/65">{dateTime(item.updatedAt)}</time>
              </li>)}
            {!data.recentProspects.length && !data.recentDocuments.length && !data.recentEvents.length && <li className="py-2 text-darkBlue/65">Aucune activité récente.</li>}
          </ul>
        </section>
      </div>
    </>}
  </section>;
}

function Pagination({ data, page, setPage }) {
  if (!data || data.total <= data.limit) return null;
  return <div className="flex justify-between gap-2 pt-3 text-sm">
    <button type="button" onClick={() => setPage(page - 1)} disabled={page <= 1} className="text-blue disabled:opacity-40">Précédent</button>
    <span>Page {page}</span><button type="button" onClick={() => setPage(page + 1)} disabled={page * data.limit >= data.total} className="text-blue disabled:opacity-40">Suivant</button>
  </div>;
}

const adminQueues = {
  restaurants: { title: "Restaurants à créer", icon: Store },
  invoices: { title: "Factures à encaisser", icon: FileCheck },
  payments: { title: "Commissions à payer", icon: BadgeEuro },
};

function adminInvoiceHref(invoice) {
  return `/dashboard/admin/seller/documents?${queryParams({ document: invoice.id, type: "INVOICE", salesOwnerId: invoice.owner })}`;
}

function SalesQueue({ queue, owner, refresh, onSaved, canCreateRestaurant, accounts }) {
  const [data, setData] = useState(null);
  const [page, setPage] = useState(1);
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const { title, icon } = adminQueues[queue];
  const restaurants = queue === "restaurants";
  const base = "/dashboard/admin/seller";
  useEffect(() => {
    const controller = new AbortController();
    adminRequest(`/pilotage/actions/${queue}?${queryParams({ page, salesOwnerId: owner })}`, { signal: controller.signal })
      .then((result) => {
        if (!result.rows.length && page > 1) setPage(page - 1);
        setData(result);
        setError("");
      }).catch((err) => { if (!controller.signal.aborted) setError(err.message); });
    return () => controller.abort();
  }, [queue, page, owner, refresh]);

  async function completeRestaurant(id) {
    setBusy(true);
    setError("");
    try {
      await adminRequest(`/pilotage/restaurants/${id}/complete?${queryParams({ salesOwnerId: owner })}`, { method: "POST" });
      setConfirm("");
      onSaved();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function downloadInvoice(invoice) {
    setError("");
    try {
      const { data } = await axios.get(`${process.env.NEXT_PUBLIC_API_URL}/admin/documents/${invoice.id}/pdf/preview`,
        getAdminAuthConfig({ params: { salesOwnerId: invoice.owner, commercialType: "INVOICE" }, responseType: "blob" }));
      const href = URL.createObjectURL(data);
      const link = document.createElement("a");
      link.href = href;
      link.download = `${invoice.number}.pdf`;
      link.click();
      setTimeout(() => URL.revokeObjectURL(href), 1000);
    } catch {
      setError("Le PDF de la facture est momentanément indisponible.");
    }
  }

  return <section className={`${panel}${restaurants ? " desktop:col-span-2 min-[1600px]:col-span-1" : ""}`}>
    <CommercialSubheading icon={icon} title={title} action={data && <CommercialBadge tone="accent">{data.total}</CommercialBadge>} />
    {error && <p role="alert" className="mt-3 text-sm text-red">{error}</p>}
    {!data && !error && <p role="status" className="mt-3 text-sm text-darkBlue/70">Chargement…</p>}
    {data && !data.total && <p className="mt-3 text-sm text-darkBlue/70">Aucun dossier en attente.</p>}
    <ul className="mt-2 divide-y divide-darkBlue/10">
      {data?.rows.map((row) => <li key={row._id} className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-2 gap-y-2 py-2 mobile:gap-x-3">
        <div className="col-start-1 row-start-1 min-w-0">
          <Link href={`${base}/prospects?prospectId=${row.prospectId}`} className="break-words text-sm font-semibold text-[#38539b] hover:underline">{row.restaurantName}</Link>
          <p className="mt-0.5 text-xs text-darkBlue/70">
            {[row.city, row.seller.map(({ firstName, lastName }) => `${firstName} ${lastName}`).join(", "),
              row.invoice?.paidAt ? `Facture réglée le ${day(row.invoice.paidAt)}` :
                row.invoice?.issuedAt ? `Facturée le ${day(row.invoice.issuedAt)}` : `Signé le ${day(row.signedAt)}`].filter(Boolean).join(" · ")}
          </p>
          <div className="mt-0.5 flex flex-wrap items-center gap-x-2.5 text-xs font-medium text-[#38539b]">
            {row.contractOwnerId && <Link href={`${base}/documents?${queryParams({
              document: row.contractId, type: "CONTRACT", salesOwnerId: row.contractOwnerId,
            })}`} className="py-1 hover:underline">Contrat signé</Link>}
            {row.invoice?.owner && <span className="inline-flex min-w-0 items-center gap-1.5">
              <Link href={adminInvoiceHref(row.invoice)} className="min-w-0 break-words py-1 hover:underline">{row.invoice.number}</Link>
              <button type="button" onClick={() => downloadInvoice(row.invoice)} title="PDF de la facture"
                aria-label={`Télécharger le PDF de la facture ${row.invoice.number}`}
                className="flex size-7 shrink-0 items-center justify-center rounded-md hover:bg-violet/10"><FileDown size={16} aria-hidden="true" /></button>
            </span>}
          </div>
        </div>
        {restaurants && <div className="commercial-queue-action max-w-[9rem] mobile:max-w-none">
          <span className="text-xs text-darkBlue/70">{row.paidAt ? "Encaissée" : "Non encaissée"} · {row.reviewedAt ? "Pièces vérifiées" : "Pièces à vérifier"}</span>
          {row.restaurantMatchCount > 1 && <span className="text-xs text-red">Plusieurs établissements correspondent.</span>}
          {canCreateRestaurant && row.paidAt && row.reviewedAt && row.restaurantMatchCount === 0 && <Link href="/dashboard/admin/restaurants?create=1" className="min-h-9 content-center px-2 text-center text-xs font-semibold text-[#38539b] hover:underline">Créer le restaurant</Link>}
          {row.paidAt && row.reviewedAt && row.restaurantId &&
            <button type="button" aria-expanded={confirm === row._id} onClick={() => setConfirm(row._id)} className="commercial-queue-button">Confirmer l’association</button>}
        </div>}
        {queue === "invoices" && <InvoiceSettlement invoice={row.invoice} inQueue onSaved={onSaved} />}
        {queue === "payments" && <CommissionActions row={row} fixedAccountId={owner} accounts={accounts}
          onlyAction={row.commission.reconciliationRequiredAt && !row.commission.reconciledAt ? "reconcile" : "pay"} onSaved={onSaved} />}
        {restaurants && confirm === row._id && <div className="col-span-full grid gap-2 rounded-xl bg-lightGrey p-3 text-sm">
          <p>Confirmez que le restaurant a été créé dans Gusto Manager.</p>
          <div className="flex flex-wrap gap-2">
            <button type="button" disabled={busy} onClick={() => completeRestaurant(row._id)} className="button-commercial">Confirmer</button>
            <button type="button" disabled={busy} onClick={() => setConfirm("")} className={commercialSecondary}>Fermer</button>
          </div>
        </div>}
      </li>)}
    </ul>
    <Pagination data={data} page={page} setPage={setPage} />
  </section>;
}

function CommissionActions({ row, onSaved, fixedAccountId, onlyAction, accounts }) {
  const [error, setError] = useState("");
  const [action, setAction] = useState("");
  const [busy, setBusy] = useState(false);
  const scope = fixedAccountId ? `?${queryParams({ salesOwnerId: fixedAccountId })}` : "";
  const awaitingReview = row.commission.reconciliationRequiredAt && !row.commission.reconciledAt;
  const assignment = !row.commission.paidAt && row.commission.assignmentCandidates?.length > 0;
  const possible = [
    ...(row.commission.status === "TO_PAY" && !awaitingReview ? [["pay", "Marquer comme payée"]] : []),
    ...(row.commission.status === "CONTESTED" ? [["restore", "Lever la contestation"]] : []),
    ...(!["CONTESTED", "CANCELLED"].includes(row.commission.status) ? [["contest", "Contester"]] : []),
    ...(row.commission.status !== "CANCELLED" ? [["cancel", "Annuler la vente"]] : []),
    ...(awaitingReview ? [["reconcile", "Documenter l’arbitrage"]] : []),
  ].filter(([value]) => !onlyAction || onlyAction === value);
  async function update(event, proof = false) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setError("");
    setBusy(true);
    try {
      await adminRequest(`/pilotage/commissions/${row._id}/${proof ? "proof" : "status"}${scope}`, {
        method: "POST", body: proof ? form : { ...Object.fromEntries(form), action },
      });
      setAction("");
      onSaved();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }
  async function download() {
    try {
      const file = await adminRequest(`/pilotage/commissions/${row._id}/proof${scope}`, { responseType: "blob" });
      const href = URL.createObjectURL(file);
      const link = document.createElement("a"); link.href = href; link.download = "justificatif"; link.click();
      setTimeout(() => URL.revokeObjectURL(href), 1000);
    } catch (error) {
      setError(error.message);
    }
  }
  return <div className={onlyAction ? "contents" : "mt-3 grid gap-3 border-t border-darkBlue/10 pt-3"}>
    {!onlyAction && row.commission.reconciliationRequiredAt && !row.commission.reconciledAt &&
      <p className="text-sm font-semibold text-red">{assignment ? "Réattribution avant signature. Bénéficiaire à arbitrer." : "Encaissement corrigé après le règlement de la commission. Arbitrage à documenter."}</p>}
    <div className={onlyAction ? "commercial-queue-action" : "flex flex-wrap gap-2"}>
      {onlyAction && <strong className="whitespace-nowrap text-sm tabular-nums">{amount(row.commission.amountCents)}</strong>}
      {possible.map(([value, label]) => <button type="button" aria-expanded={action === value} onClick={() => setAction(value)} key={value}
        className={onlyAction ? "commercial-queue-button" : "rounded-lg border border-darkBlue/15 px-3 py-1.5 text-sm"}>{label}</button>)}
    </div>
    {action && <form onSubmit={update} className="col-span-full grid gap-2 rounded-xl bg-lightGrey p-3 text-sm">
      {action === "reconcile" && assignment && <label className="grid gap-1">Bénéficiaire de la commission
        <select name="beneficiaryId" required defaultValue="" className="input-commercial">
          <option value="">Sélectionner</option>
          {accounts.filter(({ _id }) => row.commission.assignmentCandidates.includes(_id)).map(({ _id, firstName, lastName }) =>
            <option key={_id} value={_id}>{firstName} {lastName}</option>)}
        </select>
      </label>}
      {action === "cancel" && row.commission.paidAt && <p>Le règlement enregistré restera dans l’historique.</p>}
      {action === "pay" && <div className={`grid gap-2 ${onlyAction ? "mobile:grid-cols-2" : "tablet:grid-cols-2"}`}>
        <label className="grid min-w-0 gap-1">Date du règlement<input type="date" name="paidOn" defaultValue={today()} max={today()} required className="input-commercial" /></label>
        <label className="grid min-w-0 gap-1">Référence (facultative)<input name="reference" maxLength={180} className="input-commercial" /></label>
      </div>}
      {["contest", "cancel", "restore", "reconcile"].includes(action) &&
        <label className="grid gap-1">Motif<input name="note" maxLength={500} required className="input-commercial" /></label>}
      <div className="flex flex-wrap gap-2">
        <button type="submit" disabled={busy} className="button-commercial">Confirmer</button>
        <button type="button" disabled={busy} onClick={() => setAction("")} className={commercialSecondary}>Fermer</button>
      </div>
    </form>}
    {!onlyAction && row.commission.paidAt && <form onSubmit={(event) => update(event, true)} className="grid gap-2 text-sm">
      <label className="grid gap-1">Justificatif privé<input type="file" name="proof" accept="application/pdf,image/jpeg,image/png,image/webp,image/gif" className="input-commercial" required /></label>
      <div className="flex flex-wrap gap-2"><button type="submit" className="button-commercial" disabled={busy}>Joindre</button>
        {row.hasProof && <button type="button" onClick={download} className="rounded-lg px-3 py-2 text-blue">Télécharger le justificatif</button>}</div>
    </form>}
    {error && <p className="col-span-full text-sm text-red" role="alert">{error}</p>}
    {!onlyAction && <ul className="text-sm text-darkBlue/70">{row.activity?.map((event, index) => <li className="py-1" key={index}>
      {day(event.at)} · {({ SIGNED: "Signature", CUSTOMER_PAID: "Frais client encaissés", CUSTOMER_PAYMENT_REVERSED: "Encaissement client corrigé", RESTAURANT_CREATED: "Création du restaurant confirmée", PAY: "Règlement",
        CONTEST: "Contestation", CANCEL: "Annulation", RESTORE: "Contestation levée", RECONCILE: "Arbitrage documenté", ASSIGNMENT_REVIEW: "Réattribution avant signature à examiner",
        PROOF_UPLOADED: "Justificatif joint" })[event.action] || event.action} {event.note && `· ${event.note}`}
    </li>)}</ul>}
  </div>;
}

export function SalesCommissions({ header, isAdmin = false, accounts = [], fixedAccountId = "" }) {
  const { query } = useRouter();
  const { t } = useTranslation("commercial");
  const stateLabels = commissionLabels(t, isAdmin);
  const [data, setData] = useState(null);
  const [filter, setFilter] = useState({ salesOwnerId: fixedAccountId });
  const [status, setStatus] = useState(() => typeof query.status === "string" && Object.hasOwn(stateLabels, query.status) ? query.status : "");
  const [page, setPage] = useState(1);
  const [error, setError] = useState("");
  const [revision, setRevision] = useState(0);
  const refresh = useCallback(() => setRevision((current) => current + 1), []);
  const requestedStatus = typeof query.status === "string" && Object.hasOwn(stateLabels, query.status) ? query.status : "";
  useEffect(() => { setStatus(requestedStatus); setPage(1); }, [requestedStatus]);
  const selectStatus = (value) => { setStatus(value); setPage(1); };
  useEffect(() => {
    const controller = new AbortController();
    const search = queryParams({ ...filter, page, status, summary: "true" });
    const request = isAdmin ? adminRequest(`/pilotage/commissions?${search}`, { signal: controller.signal }) :
      commercialApi(`/commissions?${search}`, { signal: controller.signal });
    request.then((data) => { setData(data); setError(""); }).catch((error) => { if (!controller.signal.aborted) setError(error.message); });
    return () => controller.abort();
  }, [filter, status, page, revision, isAdmin]);
  return <section className="grid min-w-0 gap-4">
    <CommercialHeader title={isAdmin ? "Commissions" : "Mes commissions"} {...header} />
    {isAdmin && data?.commissions.some(({ commission }) => commission.reconciliationRequiredAt && !commission.reconciledAt) &&
      <p role="status" className="rounded-xl bg-amber-50 p-3 text-sm text-amber-900">Certains encaissements corrigés nécessitent un arbitrage. Ouvrez les commissions signalées.</p>}
    {data?.summary && <CommissionSummary isAdmin={isAdmin} currentStatus={status} onFilter={selectStatus}
      data={{ pending: data.summary.WAITING_CUSTOMER_PAYMENT, toPay: data.summary.TO_PAY, paid: data.summary.PAID }} />}
    <div className={`${commercialPanel} flex flex-wrap items-end gap-3 p-3 midTablet:p-4`}>
      <FilterBar accounts={accounts} fixed={Boolean(fixedAccountId)} value={filter} onChange={(value) => { setPage(1); setFilter(value); }} />
      <label className="grid min-w-0 max-w-full gap-1 text-sm">Statut<select value={status} onChange={(event) => selectStatus(event.target.value)} className="input-commercial">
        <option value="">Tous les statuts</option>{Object.entries(stateLabels).map(([key, label]) => <option key={key} value={key}>{label}</option>)}
      </select></label>
    </div>
    {error && <p role="alert" className="text-red">{error}</p>}
    {!data && !error && <SimpleSkeleton />}
    {data && <ul className={`${commercialPanel} divide-y divide-darkBlue/10 overflow-hidden`} aria-label="Historique des commissions">
      {!data.commissions.length && <li><CommercialEmpty icon={BadgeEuro} title="Aucune commission pour cette sélection" /></li>}
      {data.commissions.map((row) => {
        const beneficiary = accounts.find((account) => account._id === row.beneficiaryId);
        return <li key={row._id}>
          <details className="group">
            <summary className="grid min-w-0 cursor-pointer list-none grid-cols-[minmax(0,1fr)_auto] items-center gap-2 p-4 hover:bg-[#f9f6ff] midTablet:grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)_9rem] [&::-webkit-details-marker]:hidden">
              <span className="min-w-0 break-words"><strong>{row.restaurantName}</strong>
                {isAdmin && row.commission.reconciliationRequiredAt && !row.commission.reconciledAt &&
                  <span className="ml-2 text-xs font-semibold text-amber-900">Arbitrage requis</span>}
                <span className="mt-1 block text-xs text-darkBlue/70">{day(row.signedAt)}{beneficiary && ` · ${beneficiary.firstName} ${beneficiary.lastName}`}</span>
              </span>
              <span className="order-3 col-span-2 midTablet:order-none midTablet:col-span-1 midTablet:justify-self-center"><CommercialBadge tone={commissionTones[row.commission.status]} title={commissionDescriptions[row.commission.status]}>{stateLabels[row.commission.status]}</CommercialBadge></span>
              <span className="flex items-center justify-self-end gap-1.5 font-bold tabular-nums midTablet:gap-3">{amount(row.commission.amountCents)}<ChevronDown size={17} className="shrink-0 text-violet transition group-open:rotate-180" aria-hidden="true" /></span>
            </summary>
            <div className="border-t border-darkBlue/10 bg-[#fbfaff] p-4">
            <dl className="grid gap-2 text-sm [&_dt]:text-darkBlue/70 [&_dd]:font-semibold midTablet:grid-cols-2">
              <div><dt>Contrat</dt><dd>{row.contractNumber}</dd></div><div><dt>Date de signature</dt><dd>{day(row.signedAt)}</dd></div>
              {row.invoice && <div><dt>Facture de mise en service</dt><dd>
                <Link href={isAdmin ? adminInvoiceHref(row.invoice) : `${sellerPath}/invoices?document=${row.invoice.id}`} className="text-blue hover:underline">{row.invoice.number}</Link>
                {row.invoice.paidAt && ` · payée le ${day(row.invoice.paidAt)}`}
              </dd></div>}
              {row.commission.paidAt && <>
                <div><dt>Règlement</dt><dd>{day(row.commission.paidAt)}</dd></div>
                {isAdmin && row.commission.paymentReference && <div><dt>Référence</dt><dd className="break-all">{row.commission.paymentReference}</dd></div>}
              </>}
            </dl>
            {isAdmin && <CommissionActions row={row} onSaved={refresh} fixedAccountId={fixedAccountId} accounts={accounts} />}
            </div>
          </details>
        </li>;
      })}
    </ul>}
    <Pagination data={data} page={page} setPage={setPage} />
  </section>;
}

const documentLabels = { DRAFT: "Brouillon", SENT: "Envoyé", SIGNED: "Signé", PAID: "Facture payée", CANCELLED: "Facture annulée" };
export function AdminSalesDocuments({ header, accounts = [], fixedAccountId = "", fixedType = "", prospectId = "" }) {
  const router = useRouter();
  const [filter, setFilter] = useState({ salesOwnerId: fixedAccountId });
  const [type, setType] = useState("");
  const [status, setStatus] = useState("");
  const [selected, setSelected] = useState(null);
  const [revision, setRevision] = useState(0);
  const [review, setReview] = useState(() => router.query.review === "delivery");
  const [data, setData] = useState(null);
  const [page, setPage] = useState(1);
  const [error, setError] = useState("");
  const queryType = Object.hasOwn(commercialDocumentKinds, router.query.type) ? router.query.type : "";
  const queryStatus = typeof router.query.status === "string" && Object.hasOwn(documentLabels, router.query.status) ? router.query.status : "";
  const querySignature = router.query.signature === "pending";
  const queryOwner = typeof router.query.salesOwnerId === "string" && /^[0-9a-f]{24}$/i.test(router.query.salesOwnerId) ? router.query.salesOwnerId : "";
  const detailOwner = fixedAccountId || queryOwner;
  const detailType = fixedType || queryType;
  const requestedDoc = detailOwner && detailType && typeof router.query.document === "string" && /^[0-9a-f]{24}$/i.test(router.query.document)
    ? router.query.document : "";
  const active = selected || (requestedDoc && { id: requestedDoc, owner: detailOwner, type: detailType });
  const [pending, setPending] = useState(querySignature);
  useEffect(() => { setType(queryType); setStatus(queryStatus); setPending(querySignature); setPage(1); }, [queryType, queryStatus, querySignature]);
  useEffect(() => { setFilter({ salesOwnerId: fixedAccountId || queryOwner }); setPage(1); }, [fixedAccountId, queryOwner]);
  useEffect(() => {
    const controller = new AbortController();
    adminRequest(`/pilotage/documents?${queryParams({ ...filter, page, type: fixedType || type, status, signature: pending ? "pending" : "", prospectId, review: review ? "delivery" : "" })}`, { signal: controller.signal })
      .then((data) => { setData(data); setError(""); }).catch((error) => { if (!controller.signal.aborted) setError(error.message); });
    return () => controller.abort();
  }, [filter, fixedType, type, status, page, prospectId, revision, review, pending]);
  const top = <CommercialHeader title={fixedType ? { QUOTE: "Devis", INVOICE: "Factures", CONTRACT: "Contrats" }[fixedType] : "Documents commerciaux"} {...header} />;
  if (active) return <section className="grid min-w-0 gap-4">{top}<div className={`${panel} overflow-x-auto`}>
    <DetailsDocumentAdminPage key={active.id} documentId={active.id} salesOwnerId={active.owner} commercialType={active.type}
    onBack={() => {
      if (requestedDoc) {
        const tabPath = router.asPath.split("?")[0];
        router.replace(prospectId ? `${tabPath}?${queryParams({ prospectId })}` : tabPath, undefined, { shallow: true });
      }
      setSelected(null);
      setRevision((value) => value + 1);
    }} /></div></section>;
  return <section className="grid min-w-0 gap-4">
    {top}
    <div className={`${commercialPanel} flex flex-wrap items-end gap-3 p-3 midTablet:p-4`}>
      <FilterBar fixed={Boolean(fixedAccountId)} accounts={accounts} dates={false} value={filter} onChange={(value) => { setFilter(value); setPage(1); }} />
      {!fixedType && <label className="grid gap-1 text-sm">Type<select className="input-commercial" value={type} onChange={(event) => { setType(event.target.value); setPage(1); }}>
        <option value="">Tous les types</option><option value="QUOTE">Devis</option><option value="INVOICE">Factures</option><option value="CONTRACT">Contrats</option>
      </select></label>}
      <label className="grid min-w-0 max-w-full gap-1 text-sm">Statut<select className="input-commercial" value={pending ? "PENDING" : status}
        onChange={(event) => { setPending(event.target.value === "PENDING"); setStatus(event.target.value === "PENDING" ? "" : event.target.value); setPage(1); }}>
        <option value="">Tous les statuts</option>{Object.entries(documentLabels)
          .filter(([value]) => !fixedType || ["DRAFT", "SENT"].includes(value) ||
            (fixedType === "INVOICE" && value !== "SIGNED") || (fixedType === "CONTRACT" && value === "SIGNED"))
          .map(([value, label]) => <option key={value} value={value}>{fixedType === "INVOICE" && value === "SENT" ? "Envoyée" : label}</option>)}
        {(!fixedType || fixedType === "CONTRACT") && <option value="PENDING">En attente de signature</option>}
      </select></label>
      {!fixedType && <label className="flex items-center gap-2 self-end py-2 text-sm"><input type="checkbox" checked={review} onChange={(event) => { setPage(1); setReview(event.target.checked); }} />Livraisons à vérifier</label>}
    </div>
    {error && <p role="alert" className="text-red">{error}</p>}
    {!data && !error && <SimpleSkeleton />}
    {data && <div className={`${commercialPanel} overflow-hidden`}>
      <CommercialDocumentList showType={!fixedType} onOpen={(row) => setSelected(row)}
        empty={<CommercialEmpty icon={Files} title="Aucun document pour cette sélection" />}
        rows={data.documents.map((doc) => ({
          id: doc._id, owner: doc.salesOwnerId, type: doc.type, typeLabel: commercialDocumentKinds[doc.type].label,
          name: doc.party.restaurantName, number: doc.docNumber, date: day(doc.createdAt),
          price: doc.offerConditions && (doc.type === "INVOICE" ? amount(doc.offerConditions.setupCents) : `${amount(doc.offerConditions.monthlyCents)}/mois`),
          setup: doc.type !== "INVOICE" && doc.offerConditions && `${amount(doc.offerConditions.setupCents)} de mise en service`,
          status: commercialDocumentState(doc),
          deliveryUncertain: doc.type === "INVOICE" && doc.commercialDelivery?.state === "UNCERTAIN",
          progressDate: day(doc.setupInvoice?.paidAt || doc.setupInvoice?.cancelledAt || doc.signature?.signedAt || doc.firstSentAt),
        }))} />
    </div>}
    <Pagination data={data} page={page} setPage={setPage} />
  </section>;
}

