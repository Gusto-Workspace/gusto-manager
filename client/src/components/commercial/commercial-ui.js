import Link from "next/link";
import { createContext, useContext } from "react";
import { ArrowLeft, ChevronRight, Search } from "lucide-react";

export const commercialPanel = "commercial-panel min-w-0 rounded-2xl border border-darkBlue/10 bg-white";
export const commercialSecondary = "secondary-commercial inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-darkBlue/15 bg-white px-3.5 py-2 text-sm font-semibold text-darkBlue";
export const CommercialHeaderAccount = createContext(null);

export function CommercialAvatar({ name, large = false }) {
  const initials = name.trim().split(/\s+/).slice(0, 2).map((part) => part[0]?.toLocaleUpperCase()).join("");
  return <span aria-hidden="true" className={`grid shrink-0 place-items-center rounded-2xl bg-violet/10 font-bold tracking-tight text-[#4d399e] ${large ? "size-12 text-lg midTablet:size-16 midTablet:text-2xl" : "size-10 text-sm"}`}>{initials}</span>;
}

export function CommercialHeader({ title, action, navigation, back, backLabel, mobileBackText, status, description }) {
  const account = useContext(CommercialHeaderAccount);
  return <>
    <header className={`commercial-page-header grid min-w-0 grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-2.5 rounded-2xl border border-darkBlue/10 p-3 tablet:gap-x-5 tablet:px-5 tablet:py-4 ${account ? "commercial-seller-header" : ""} ${mobileBackText ? "max-tablet:pl-[4.4rem]" : ""}`}>
      <div className="flex min-w-0 items-center gap-2.5">
        {back && <Link href={back} aria-label={backLabel} title={backLabel}
          className={`size-10 shrink-0 place-items-center rounded-xl border border-darkBlue/15 bg-white text-darkBlue/80 transition-colors hover:bg-violet/10 hover:text-violet focus-visible:outline-violet ${mobileBackText ? "hidden tablet:grid" : "grid"}`}>
          <ArrowLeft size={18} aria-hidden="true" />
        </Link>}
        <div className="min-w-0">
          <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 tablet:gap-x-3">
            <h1 className={`break-words text-[clamp(1.45rem,2.2vw,1.8rem)] font-bold leading-tight tracking-[-0.03em] text-darkBlue ${mobileBackText ? "max-tablet:text-[1.2rem]" : ""}`}>{title}</h1>
            {status}
          </div>
          {description && <p className="mt-1 text-sm text-darkBlue/70">{description}</p>}
          {back && mobileBackText && <Link href={back}
            className="relative mt-0.5 block w-fit text-xs font-semibold leading-4 text-[#4d399e] underline decoration-violet/45 underline-offset-2 before:absolute before:-inset-1 before:content-[''] tablet:hidden">
            {mobileBackText}
          </Link>}
        </div>
      </div>
      {action && <div className="col-start-2 row-start-1 flex min-w-0 flex-wrap items-center justify-end gap-2">{action}</div>}
      {account && <Link href="/dashboard/seller/account" aria-label={`Bonjour, ${account.firstName}. Mon compte`}
        className="col-start-3 row-start-1 hidden min-h-11 items-center gap-2 rounded-xl border border-darkBlue/10 bg-white/75 px-3 text-sm font-semibold hover:text-violet tablet:flex">
        <span className="max-w-[8.5rem] truncate tablet:max-w-[14rem]">Bonjour, {account.firstName}</span>
        <ChevronRight size={16} aria-hidden="true" />
      </Link>}
    </header>
    {navigation}
  </>;
}

export function CommercialSubheading({ title, description, icon: Icon, action }) {
  return <div className="flex flex-wrap items-start justify-between gap-3">
    <div className="flex min-w-0 items-start gap-2.5">
      {Icon && <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-violet/10 text-[#4d399e]"><Icon size={18} aria-hidden="true" /></span>}
      <div className="min-w-0">
        <h2 className="break-words text-[1.05rem] font-bold leading-snug text-darkBlue">{title}</h2>
        {description && <p className="mt-0.5 text-sm leading-snug text-darkBlue/70">{description}</p>}
      </div>
    </div>
    {action}
  </div>;
}

export function CommercialEmpty({ icon: Icon, title, description }) {
  return <div className="grid justify-items-center gap-1.5 px-5 py-8 text-center">
    {Icon && <span className="mb-1 grid size-11 place-items-center rounded-2xl bg-violet/10 text-[#4d399e]"><Icon size={20} aria-hidden="true" /></span>}
    <p className="text-sm font-semibold">{title}</p>
    {description && <p className="max-w-md text-sm text-darkBlue/70">{description}</p>}
  </div>;
}

export function CommercialSearch({ label, value, onChange, className = "" }) {
  return <label className={`relative block min-w-0 ${className}`}>
    <span className="sr-only">{label}</span>
    <Search size={17} aria-hidden="true" className="pointer-events-none absolute left-3 top-3.5 text-darkBlue/55" />
    <input type="search" placeholder={label} value={value} onChange={(event) => onChange(event.target.value)} className="input-commercial w-full !pl-10" />
  </label>;
}

const tones = {
  neutral: "bg-[#eef0f6] text-[#46516a]",
  info: "bg-[#eaf0fc] text-[#244b95]",
  accent: "bg-[#efeafb] text-[#4d399e]",
  success: "bg-[#e3f4e9] text-[#205d3d]",
  warning: "bg-[#fff1d6] text-[#805014]",
  danger: "bg-[#fce9e7] text-[#972e27]",
};

export function CommercialBadge({ children, tone = "neutral", title }) {
  return <span title={title} className={`inline-flex max-w-full items-center justify-center rounded-full px-2.5 py-1 text-center text-xs font-semibold leading-snug ${tones[tone]}`}>
    {children}
  </span>;
}

const documentState = {
  DRAFT: ["Brouillon", "neutral"], SENT: ["Envoyé", "info"], SIGNED: ["Signé", "success"],
  INVOICE_SENT: ["Envoyée", "info"],
  PAID: ["Payée", "success"], CANCELLED: ["Annulée", "neutral"],
  PENDING: ["En attente de signature", "warning"], SIGNING: ["Signature en cours", "accent"],
  EXPIRED: ["Lien expiré", "danger"], REVOKED: ["Lien révoqué", "danger"],
  UNCERTAIN: ["Livraison à vérifier", "warning"],
};

export function DocumentStatus({ state }) {
  const [label, tone] = documentState[state] || [state || "—", "neutral"];
  return <CommercialBadge tone={tone}>{label}</CommercialBadge>;
}

export const commercialDocumentKinds = {
  QUOTE: { label: "Devis", tab: "quotes" },
  INVOICE: { label: "Facture", tab: "invoices" },
  CONTRACT: { label: "Contrat", tab: "contracts" },
};

export function commercialDocumentState(doc) {
  if (doc.setupInvoice?.cancelledAt) return "CANCELLED";
  if (doc.setupInvoice?.paidAt) return "PAID";
  if (doc.type === "INVOICE") return doc.status === "SENT" ? "INVOICE_SENT" : "DRAFT";
  if ((doc.deliveryState || doc.commercialDelivery?.state) === "UNCERTAIN") return "UNCERTAIN";
  if (doc.status === "SIGNED") return "SIGNED";
  if (doc.signatureRequest?.status === "PENDING" && new Date(doc.signatureRequest.expiresAt) <= new Date()) return "EXPIRED";
  return doc.signatureStatus || doc.signatureRequest?.status || doc.status;
}

export function CommercialDocumentList({ rows, empty, onOpen, showType = false }) {
  if (!rows.length) return empty;
  return <table className="commercial-table w-full table-fixed text-left text-sm">
    <thead><tr>
      <th scope="col" className="w-[48%] midTablet:w-[36%]">Document</th>
      <th scope="col" className="hidden midTablet:table-cell">Date</th>
      <th scope="col" className="hidden mobile:table-cell">Tarif</th>
      <th scope="col" className="text-center">Statut</th>
    </tr></thead>
    <tbody>{rows.map((row) => {
      const content = <><span className="font-semibold">{row.name}</span><span className="block text-xs text-darkBlue/65">{showType ? `${row.typeLabel} · ` : ""}{row.number}</span></>;
      return <tr key={row.id}>
        <td className="break-words">
          <button type="button" onClick={() => onOpen(row)} className="block text-left text-[#38539b] hover:underline">{content}</button>
          <span className="mt-0.5 block text-xs text-darkBlue/65 midTablet:hidden">{row.date}</span>
          <span className="mt-0.5 block text-xs text-darkBlue/70 mobile:hidden">{row.price}</span>
        </td>
        <td className="hidden text-darkBlue/70 midTablet:table-cell">{row.date}</td>
        <td className="hidden break-words mobile:table-cell">{row.price}{row.setup && <span className="block text-xs text-darkBlue/70">{row.setup}</span>}</td>
        <td><div className="grid justify-items-center gap-1 text-center">
          <DocumentStatus state={row.status} />
          {row.deliveryUncertain && <span className="text-xs text-amber-900">Livraison à vérifier</span>}
          {row.progressDate && <span className="text-xs tabular-nums text-darkBlue/65">{row.progressDate}</span>}
        </div></td>
      </tr>;
    })}</tbody>
  </table>;
}
