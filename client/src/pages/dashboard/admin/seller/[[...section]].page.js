import Head from "next/head";
import Link from "next/link";
import { useContext, useEffect, useRef, useState } from "react";
import { useRouter } from "next/router";
import axios from "axios";
import { serverSideTranslations } from "next-i18next/serverSideTranslations";
import { GlobalContext } from "@/contexts/global.context";
import NavAdminComponent from "@/components/dashboard/admin/_shared/nav/nav.admin.component";
import CommercialAccountsAdmin, { AccountEditor, CommercialAccountStatus, commercialAdminAccountPath, commercialAdminRoot as root } from "@/components/dashboard/admin/commerciaux/accounts.admin.component";
import OffersAdmin from "@/components/dashboard/admin/commerciaux/offers.admin.component";
import ProspectsBoard from "@/components/commercial/prospects-board";
import CommercialCalendar from "@/components/commercial/commercial-calendar";
import { CommercialHeader } from "@/components/commercial/commercial-ui";
import { AdminSalesDocuments, SalesCommissions, SalesDashboard } from "@/components/commercial/sales-pilotage";
import { getAdminAuthConfig } from "@/components/dashboard/admin/_shared/utils/admin-auth.utils";
import SalesResources from "@/components/commercial/sales-resources";
import SimpleSkeleton from "@/components/_shared/skeleton/simple-skeleton.component";

const sections = {
  overview: "Vue d’ensemble", accounts: "Commerciaux", prospects: "Prospects", calendar: "Calendrier", documents: "Documents",
  commissions: "Commissions", offers: "Offres et tarifs",
  resources: "Ressources",
};
const accountSections = { overview: "Vue d’ensemble", prospects: "Prospects", calendar: "Calendrier", quotes: "Devis", invoices: "Factures", contracts: "Contrats", commissions: "Commissions", information: "Informations" };
function SectionNav({ section, links, base, label }) {
  const router = useRouter();
  const href = (key) => key === "overview" ? base : `${base}/${key}`;
  const nav = useRef(null);
  useEffect(() => {
    function revealCurrentTab() {
      const container = nav.current;
      const current = container?.querySelector('[aria-current="page"]');
      if (!current) return;
      const bounds = container.getBoundingClientRect();
      const selected = current.getBoundingClientRect();
      if (selected.right > bounds.right) container.scrollLeft += selected.right - bounds.right;
      if (selected.left < bounds.left) container.scrollLeft -= bounds.left - selected.left;
    }
    revealCurrentTab();
    window.addEventListener("resize", revealCurrentTab);
    return () => window.removeEventListener("resize", revealCurrentTab);
  }, [section]);
  return <><label className="grid gap-1 text-sm font-semibold midTablet:hidden">{label}
    <select value={section} onChange={(event) => router.push(href(event.target.value))} className="input-commercial">
      {Object.entries(links).map(([key, title]) => <option key={key} value={key}>{title}</option>)}
    </select>
  </label><nav ref={nav} aria-label={label} className="commercial-tabs hidden min-w-0 overflow-x-auto border-b border-darkBlue/10 midTablet:block">
    <ul className="flex w-max min-w-full gap-4 whitespace-nowrap midTablet:gap-6">
      {Object.entries(links).map(([key, title]) => {
        const current = section === key;
        return <li key={key}><Link href={href(key)}
          aria-current={current ? "page" : undefined}
          className={`inline-flex min-h-11 items-center border-b-2 px-1.5 py-2 text-sm font-semibold transition-colors focus-visible:outline-violet ${current ? "border-violet text-[#4d399e]" : "border-[#0000] text-darkBlue/70 hover:text-darkBlue"}`}>
          {title}
        </Link></li>;
      })}
    </ul>
  </nav></>;
}

function CommercialAccountPage({ accountId, section, prospectId, canCreateRestaurant, accounts, invalidateSelection }) {
  const [profile, setProfile] = useState(null);
  const [error, setError] = useState("");
  const base = commercialAdminAccountPath(accountId);
  useEffect(() => {
    const controller = new AbortController();
    axios.get(`${process.env.NEXT_PUBLIC_API_URL}/admin/commerciaux/${accountId}`, getAdminAuthConfig({ signal: controller.signal }))
      .then(({ data }) => setProfile(data))
      .catch((err) => { if (!controller.signal.aborted) setError(err.response?.data?.message || "Impossible de charger ce commercial."); });
    return () => controller.abort();
  }, [accountId]);
  const title = profile ? `${profile.account.firstName} ${profile.account.lastName}` : "";
  const header = {
    title, back: `${root}/accounts`, backLabel: "Retour aux commerciaux", mobileBackText: "Tous les commerciaux",
    status: profile && <CommercialAccountStatus status={profile.account.status} />,
    navigation: <SectionNav section={section} links={accountSections} base={base} label="Fiche du commercial" />,
  };
  return <>
    {error && <><Link href={`${root}/accounts`} className="flex min-h-11 items-center pl-14 text-violet tablet:pl-0">Retour aux commerciaux</Link><p role="alert" className="text-red">{error}</p></>}
    {!profile && !error && <SimpleSkeleton />}
    {profile && <>
      {section === "overview" && <SalesDashboard header={header} isAdmin fixedAccountId={accountId} accountPath={base} canCreateRestaurant={canCreateRestaurant} accounts={accounts} />}
      {section === "prospects" && <ProspectsBoard header={header} isAdmin fixedAccountId={accountId} accountPath={base} initialProspectId={prospectId} />}
      {section === "calendar" && <CommercialCalendar header={header} isAdmin fixedAccountId={accountId} accountPath={base} />}
      {section === "quotes" && <AdminSalesDocuments header={header} key="quote" fixedAccountId={accountId} fixedType="QUOTE" prospectId={prospectId} />}
      {section === "invoices" && <AdminSalesDocuments header={header} key="invoice" fixedAccountId={accountId} fixedType="INVOICE" prospectId={prospectId} />}
      {section === "contracts" && <AdminSalesDocuments header={header} key="contract" fixedAccountId={accountId} fixedType="CONTRACT" prospectId={prospectId} />}
      {section === "commissions" && <SalesCommissions header={header} isAdmin fixedAccountId={accountId} accounts={accounts} />}
      {section === "information" && <>
        <CommercialHeader {...header} />
        <AccountEditor selected={profile.account} invitationReady={profile.invitationReady}
          onSaved={(account) => {
            invalidateSelection();
            setProfile((current) => ({ ...current, account }));
          }} />
      </>}
    </>}
  </>;
}

export default function CommercialsAdminPage({ section, accountId }) {
  const { adminContext } = useContext(GlobalContext);
  const router = useRouter();
  const [accounts, setAccounts] = useState([]);
  const [error, setError] = useState("");
  const needsAccounts = ["overview", "commissions"].includes(section) || (!accountId && ["documents", "calendar"].includes(section));
  const prospectId = typeof router.query.prospectId === "string" && /^[0-9a-f]{24}$/i.test(router.query.prospectId) ? router.query.prospectId : "";
  useEffect(() => {
    if (!adminContext.isAuth || !needsAccounts) return;
    let mounted = true;
    adminContext.loadCommercialSelection(section === "overview" && !accountId).then((result) => {
      if (mounted) { setAccounts(result); setError(""); }
    }).catch(() => { if (mounted) setError("Impossible de charger le filtre des commerciaux."); });
    return () => { mounted = false; };
  }, [adminContext.isAuth, adminContext.selectionRevision, needsAccounts, section, accountId]);
  if (!adminContext.isAuth) return null;
  const header = { navigation: <SectionNav section={section} links={sections} base={root} label="Sections commerciales" /> };
  return <>
    <Head><title>Commerciaux · Gusto Manager</title></Head>
    <div className="flex">
      <NavAdminComponent />
      <main className={`commercial-workspace flex min-h-screen min-w-0 flex-1 flex-col gap-4 p-4 text-darkBlue tablet:ml-[88px] tablet:p-6 ${accountId ? "" : "pt-20"}`}>
        {accountId ? <CommercialAccountPage key={accountId} accountId={accountId} section={section} prospectId={prospectId} canCreateRestaurant={adminContext.canManageClients}
          accounts={accounts} invalidateSelection={adminContext.invalidateCommercialSelection} /> : <>
        {section === "overview" && <SalesDashboard header={header} isAdmin accounts={accounts} canCreateRestaurant={adminContext.canManageClients} />}
        {section === "accounts" && <CommercialAccountsAdmin header={header} onAccountCreated={adminContext.invalidateCommercialSelection} />}
        {section === "prospects" && <ProspectsBoard header={header} isAdmin canInitialize={adminContext.canManageClients} initialProspectId={prospectId} />}
        {section === "calendar" && <CommercialCalendar header={header} isAdmin accounts={accounts} />}
        {section === "documents" && <AdminSalesDocuments header={header} key={prospectId} accounts={accounts} prospectId={prospectId} />}
        {section === "commissions" && <SalesCommissions header={header} isAdmin accounts={accounts} />}
        {section === "offers" && <OffersAdmin header={header} />}
        {section === "resources" && <SalesResources header={header} isAdmin />}
        {error && <p role="alert" className="text-red">{error}</p>}
        </>}
      </main>
    </div>
  </>;
}

export async function getServerSideProps({ locale, params }) {
  const [rootSection = "overview", id, tab = "overview", ...rest] = params?.section || [];
  const accountId = rootSection === "accounts" && id ? id : null;
  if (rest.length || (accountId ? !/^[0-9a-f]{24}$/i.test(accountId) || !Object.hasOwn(accountSections, tab) : id || !Object.hasOwn(sections, rootSection))) return { notFound: true };
  return { props: { accountId, section: accountId ? tab : rootSection, ...(await serverSideTranslations(locale, ["common", "admin", "commercial"])) } };
}
