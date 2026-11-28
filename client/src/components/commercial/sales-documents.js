import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/router";
import { ClipboardList, FileDown, FilePlus, FileSignature, ReceiptText, X } from "lucide-react";
import SimpleSkeleton from "@/components/_shared/skeleton/simple-skeleton.component";
import { adminCommercialApi, commercialApi, sellerPath } from "./commercial-api";
import { CommercialBadge, CommercialDocumentList, CommercialEmpty, CommercialHeader, CommercialSearch, CommercialSubheading, DocumentStatus, commercialDocumentKinds, commercialDocumentState, commercialPanel, commercialSecondary } from "./commercial-ui";

const moduleLabels = { reservations: "Réservations", gift_cards: "Cartes cadeaux", take_away: "Vente à emporter", employees: "Gestion du personnel" };
const states = {
  QUOTE: { DRAFT: "Brouillon", SENT: "Envoyé" },
  INVOICE: { DRAFT: "Brouillon", SENT: "Envoyée", PAID: "Payée", CANCELLED: "Annulée" },
  CONTRACT: { DRAFT: "Brouillon", SENT: "Envoyé", SIGNED: "Signé" },
};
const titles = {
  QUOTE: ["Mes devis", "Nouveau devis", "Aucun devis"],
  INVOICE: ["Mes factures", "Nouvelle facture", "Aucune facture"],
  CONTRACT: ["Mes contrats", "Nouveau contrat", "Aucun contrat"],
};
const money = new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR" });
const amount = (value) => money.format(value / 100);
const dateLabel = (date) => date && new Date(date).toLocaleDateString("fr-FR", { timeZone: "Europe/Paris" });

function DocumentEditor({ type, initial, offers, initialProspectId, adminProspect, onSave, onClose }) {
  const router = useRouter();
  const [doc, setDoc] = useState(initial);
  const [prospectSearch, setProspectSearch] = useState("");
  const [prospects, setProspects] = useState([]);
  const [selectedProspect, setSelectedProspect] = useState(initialProspectId || "");
  const [offerId, setOfferId] = useState(initial?.offerConditions?.offerId || "");
  const [included, setIncluded] = useState(initial?.offerConditions?.selections?.includedModule || "");
  const [options, setOptions] = useState(() => initial?.offerConditions?.selections || {
    extraModules: [], sms: false, tabletQuantity: 0, terminalQuantity: 0,
  });
  const [pdf, setPdf] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const proposal = type === "QUOTE";
  const invoice = type === "INVOICE";
  const converted = Boolean(doc?.sourceQuoteId || doc?.sourceContractId);
  const locked = doc && (doc.status !== "DRAFT" || (!invoice && converted) || ["PREPARING", "HANDOFF", "UNCERTAIN"].includes(doc.deliveryState));
  const offer = invoice ? doc?.offerConditions : offers.find((item) => item._id === offerId);
  const giftCardsOffered = offer?.kind === "FETES_2026";
  const allowed = Object.keys(moduleLabels).filter((key) => !(giftCardsOffered && key === "gift_cards"));
  const extras = options.extraModules.filter((key) => allowed.includes(key) && key !== included);
  const quantity = (value) => Number(value || 0);
  const validQuantities = [options.tabletQuantity, options.terminalQuantity]
    .map(quantity).every((value) => Number.isSafeInteger(value) && value >= 0 && value <= 10);
  const monthly = !invoice && offer && validQuantities ? offer.monthlyCents + extras.length * offer.extraModuleCents +
    (options.sms ? offer.smsCents : 0) + quantity(options.tabletQuantity) * offer.tabletCents +
    quantity(options.terminalQuantity) * offer.terminalCents : null;

  useEffect(() => {
    if (doc || adminProspect) return;
    const controller = new AbortController();
    const timeout = window.setTimeout(async () => {
      try {
        const result = await commercialApi(`/prospects?q=${encodeURIComponent(prospectSearch)}`, { signal: controller.signal });
        let items = result.prospects;
        if (initialProspectId && !prospectSearch && !items.some(({ _id }) => _id === initialProspectId)) {
          const data = await commercialApi(`/prospects/${initialProspectId}`, { signal: controller.signal });
          items = [data.prospect, ...items];
        }
        setProspects(items.filter((item) => !item.opposedAt && !item.archivedAt));
      } catch (err) {
        if (!controller.signal.aborted) setError(err.message);
      }
    }, 150);
    return () => { window.clearTimeout(timeout); controller.abort(); };
  }, [doc, prospectSearch, initialProspectId, adminProspect]);

  useEffect(() => () => { if (pdf) URL.revokeObjectURL(pdf); }, [pdf]);

  useEffect(() => {
    if (proposal || doc?.status !== "SENT") return;
    let controller;
    const refresh = () => {
      controller?.abort();
      controller = new AbortController();
      const { signal } = controller;
      commercialApi(`/documents/${doc._id}`, { signal }).then(({ document }) => {
        if (document.status !== doc.status || document.signatureStatus !== doc.signatureStatus ||
            document.setupInvoice?.paidAt !== doc.setupInvoice?.paidAt ||
            document.setupInvoice?.cancelledAt !== doc.setupInvoice?.cancelledAt) {
          setDoc(document);
          setPdf("");
          onSave();
        }
      }).catch((err) => { if (!signal.aborted) setError(err.message); });
    };
    window.addEventListener("focus", refresh);
    return () => { window.removeEventListener("focus", refresh); controller?.abort(); };
  }, [proposal, doc?._id, doc?.status, doc?.signatureStatus, doc?.setupInvoice?.paidAt, doc?.setupInvoice?.cancelledAt, onSave]);

  async function run(work) {
    setBusy(true);
    setError("");
    setMessage("");
    try {
      await work();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  function save(event) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const body = {
      ...(!invoice && { offerId, choices: {
        includedModule: included, extraModules: extras,
        sms: options.sms, tabletQuantity: quantity(options.tabletQuantity), terminalQuantity: quantity(options.terminalQuantity),
      } }),
      ...(!doc && { type, prospectId: adminProspect?._id || form.get("prospectId") }),
    };
    run(async () => {
      const data = adminProspect
        ? await adminCommercialApi(`/documents?salesOwnerId=${adminProspect.salesOwnerId}`, { method: "POST", body })
        : await commercialApi(doc ? `/documents/${doc._id}` : "/documents", { method: doc ? "PATCH" : "POST", body });
      setDoc(data.document);
      setMessage("Brouillon enregistré.");
      setPdf("");
      onSave();
    });
  }

  function send() {
    setConfirm(false);
    run(async () => {
      try {
        const result = await commercialApi(`/documents/${doc._id}/${type === "CONTRACT" ? "send-for-signature" : "send"}`, { method: "POST" });
        setMessage(result.message);
      } finally {
        const data = await commercialApi(`/documents/${doc._id}`);
        setDoc(data.document);
        onSave();
      }
    });
  }

  function resend() {
    setConfirm(false);
    run(async () => {
      const action = type === "CONTRACT" && doc.status === "SENT" ? "signature-request/resend" : "resend";
      try {
        setMessage((await commercialApi(`/documents/${doc._id}/${action}`, { method: "POST" })).message);
      } finally {
        setDoc((await commercialApi(`/documents/${doc._id}`)).document);
        onSave();
      }
    });
  }

  function preview() {
    run(async () => {
      const file = await commercialApi(`/documents/${doc._id}/pdf/preview`, { responseType: "blob" });
      setPdf(URL.createObjectURL(file));
    });
  }

  function convert(target) {
    run(async () => {
      const source = proposal ? { sourceQuoteId: doc._id } : { sourceContractId: doc._id };
      const { document } = await commercialApi("/documents", { method: "POST", body: { type: target, ...source } });
      await router.push(`${sellerPath}/${commercialDocumentKinds[target].tab}?document=${document._id}`);
    });
  }

  const choices = doc?.offerConditions?.selections || {};
  return <section className={`${commercialPanel} grid gap-4 p-4 midTablet:p-6`}>
    <header className="rounded-2xl bg-[#f6f3ff] p-4">
      <CommercialSubheading title={doc?.docNumber || titles[type][1]} icon={type === "CONTRACT" ? FileSignature : ReceiptText}
        description={doc?.party.restaurantName || (adminProspect ? adminProspect.restaurantName : undefined)}
        action={<button type="button" onClick={onClose} className={commercialSecondary}><X size={16} aria-hidden="true" />Fermer</button>} />
      {doc && <div className="mt-2"><DocumentStatus state={commercialDocumentState(doc)} /></div>}
      {invoice && doc?.deliveryState === "UNCERTAIN" && <p className="mt-2 text-sm text-amber-900">Livraison à vérifier</p>}
    </header>
    {error && <p role="alert" className="text-sm text-red">{error}</p>}
    {message && <p role="status" className="text-sm">{message}</p>}
    {!locked && <form onSubmit={save} className="grid min-w-0 items-start gap-4 desktop:grid-cols-[minmax(0,1.6fr)_minmax(230px,1fr)]">
      <div className="grid min-w-0 gap-4">
      {!doc && <fieldset className="grid min-w-0 gap-2.5 rounded-2xl border border-darkBlue/10 p-3 midTablet:grid-cols-2 midTablet:p-4">
        <legend className="px-2 text-sm font-bold">Établissement</legend>
        {adminProspect ? <p className="text-sm">{adminProspect.restaurantName} · {adminProspect.salesOwnerName}</p> : <>
        <CommercialSearch label="Rechercher dans mes prospects" value={prospectSearch} onChange={setProspectSearch} />
        <label className="grid min-w-0 gap-1 text-sm">Prospect<select name="prospectId" value={selectedProspect} onChange={(event) => setSelectedProspect(event.target.value)} required className="input-commercial">
          <option value="">Sélectionner un prospect</option>
          {prospects.map((item) => <option key={item._id} value={item._id}>{item.restaurantName} · {item.city}</option>)}
        </select></label>
      </>}</fieldset>}
      <fieldset className="grid min-w-0 gap-3 rounded-2xl border border-darkBlue/10 p-3 midTablet:p-4">
      <legend className="px-2 text-sm font-bold">Offre et prestations</legend>
      {invoice ? <p className="text-sm">Les conditions du contrat initial signé s’appliquent.</p> : <label className="grid min-w-0 gap-1 text-sm">Offre<select value={offerId} onChange={(event) => { setOfferId(event.target.value); setIncluded(""); }}
        required className="input-commercial">
        <option value="">Sélectionner une offre publiée</option>
        {offers.map((item) => <option key={item._id} value={item._id}>{item.title} · v{item.version} · {amount(item.monthlyCents)}/mois</option>)}
      </select></label>}
      {offer && !invoice && <div key={offerId} className="grid min-w-0 gap-4">
        <label className="grid gap-1 text-sm">Module inclus<select value={included} onChange={(event) => {
          const next = event.target.value;
          setIncluded(next);
          setOptions((current) => ({ ...current, extraModules: current.extraModules.filter((key) => key !== next) }));
        }} className="input-commercial" required>
          <option value="">Choisir le module inclus</option>{allowed.map((key) => <option key={key} value={key}>{moduleLabels[key]}</option>)}
        </select></label>
        {giftCardsOffered && <label className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-sm font-medium text-[#4d399e]">
          <input type="checkbox" checked disabled className="size-4 shrink-0" />
          {moduleLabels.gift_cards} (offert)
          <span className="text-xs font-normal text-darkBlue/70">pendant 24 mois</span>
        </label>}
        <details className="rounded-xl border border-darkBlue/10 bg-[#faf9fd] p-3" open={choices.extraModules?.length || choices.sms || choices.tabletQuantity || choices.terminalQuantity ? true : undefined}>
          <summary className="cursor-pointer text-sm font-semibold">Modules et équipements en option</summary>
        <fieldset className="mt-3 grid gap-2">
          <legend className="mb-2 text-sm">Modules supplémentaires, {amount(offer.extraModuleCents)} par mois chacun</legend>
          {allowed.filter((key) => key !== included).map((key) => <label key={key} className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={extras.includes(key)} onChange={(event) => {
              const checked = event.target.checked;
              setOptions((current) => ({ ...current, extraModules: checked
                ? [...current.extraModules, key] : current.extraModules.filter((module) => module !== key) }));
            }} />{moduleLabels[key]}
          </label>)}
        </fieldset>
        <label className="mt-3 flex items-center gap-2 text-sm"><input type="checkbox" checked={options.sms}
          onChange={(event) => setOptions({ ...options, sms: event.target.checked })} /> Rappels SMS · {amount(offer.smsCents)}/mois</label>
        <div className="mt-3 grid gap-3 tablet:grid-cols-2">
          {[["tabletQuantity", "Tablettes", offer.tabletCents], ["terminalQuantity", "Matériels de pointage", offer.terminalCents]].map(([key, label, price]) =>
            <label key={key} className="grid gap-2 text-sm"><span>{label} · {amount(price)}/mois</span>
              <input type="number" min="0" max="10" value={options[key]} onChange={(event) => setOptions({ ...options, [key]: event.target.value })} className="input-commercial" />
            </label>)}
        </div>
        </details>
      </div>}
      </fieldset>
      </div>
      <aside className="grid min-w-0 gap-3 rounded-2xl border border-violet/15 bg-[#f5f1ff] p-4 desktop:sticky desktop:top-4">
        <CommercialSubheading title="Récapitulatif" icon={ClipboardList} />
        {invoice && offer ? <>
          <p className="text-sm">Frais de mise en service <strong className="ml-1 text-lg tabular-nums">{amount(offer.setupCents)}</strong></p>
          <p className="text-sm">Règlement par virement sur les coordonnées figurant sur la facture.</p>
        </> : offer ? <>
          <p className="break-words font-semibold">{offer.title} <CommercialBadge tone="accent">Version {offer.version}</CommercialBadge></p>
          <dl className="grid gap-2 border-y border-violet/10 py-3 text-sm">
            <div className="flex flex-wrap justify-between gap-1"><dt>Abonnement de base</dt><dd className="font-bold">{amount(offer.monthlyCents)}/mois</dd></div>
            {extras.map((key) => <div key={key} className="flex flex-wrap justify-between gap-1"><dt>{moduleLabels[key]}</dt><dd>{amount(offer.extraModuleCents)}/mois</dd></div>)}
            {options.sms && <div className="flex flex-wrap justify-between gap-1"><dt>Rappels SMS</dt><dd>{amount(offer.smsCents)}/mois</dd></div>}
            {quantity(options.tabletQuantity) > 0 && <div className="flex flex-wrap justify-between gap-1"><dt>Tablettes × {options.tabletQuantity}</dt><dd>{amount(quantity(options.tabletQuantity) * offer.tabletCents)}/mois</dd></div>}
            {quantity(options.terminalQuantity) > 0 && <div className="flex flex-wrap justify-between gap-1"><dt>Matériels de pointage × {options.terminalQuantity}</dt><dd>{amount(quantity(options.terminalQuantity) * offer.terminalCents)}/mois</dd></div>}
            <div className="flex flex-wrap justify-between gap-1"><dt>Mise en service</dt><dd className="font-bold">{amount(offer.setupCents)}</dd></div>
            <div className="flex flex-wrap justify-between gap-1"><dt>Engagement</dt><dd className="font-bold">24 mois</dd></div>
            {included && <div className="flex flex-wrap justify-between gap-1"><dt>Module inclus</dt><dd className="font-bold">{moduleLabels[included]}</dd></div>}
          </dl>
          {monthly !== null && <p className="text-sm" aria-live="polite">Total mensuel <strong className="ml-1 text-lg tabular-nums">{amount(monthly)}</strong></p>}
          {offer.smsLabel && <p className="text-xs text-darkBlue/70">{offer.smsLabel}</p>}
          {offer.postPromotionTerms && <p className="text-xs text-darkBlue/70">{offer.postPromotionTerms}</p>}
          {offer.bankFeeScope && <p className="text-xs text-darkBlue/70">Frais perçus par l’intermédiaire bancaire · 1,5 % + 0,25 € par transaction concernée. {offer.bankFeeScope}.</p>}
        </> : <p className="text-sm text-darkBlue/75">Choisissez une offre pour voir ses conditions.</p>}
        <button type="submit" disabled={busy || !offer || (invoice ? !offer.setupCents : !included || !validQuantities)} className="button-commercial justify-self-start">
          {invoice && converted ? "Actualiser les coordonnées" : "Enregistrer le brouillon"}
        </button>
      </aside>
    </form>}
    {doc?.offerConditions && !invoice && <dl className="grid gap-2 rounded-2xl border border-violet/15 bg-[#f5f1ff] p-4 text-sm mobile:grid-cols-3">
      <div><dt>Montant mensuel enregistré</dt><dd className="font-bold">{amount(doc.offerConditions.monthlyCents)}</dd></div>
      <div><dt>Mise en service</dt><dd className="font-semibold">{amount(doc.offerConditions.setupCents)}</dd></div>
      <div><dt>Engagement</dt><dd className="font-semibold">{doc.offerConditions.engagementMonths} mois</dd></div>
    </dl>}
    {doc?.setupInvoice && <dl className="grid gap-2 rounded-2xl border border-violet/15 bg-[#f5f1ff] p-4 text-sm mobile:grid-cols-3">
      <div><dt>Frais de mise en service</dt><dd className="font-bold">{amount(doc.offerConditions.setupCents)}</dd></div>
      {doc.setupInvoice.paidAt && <div><dt>Date du règlement</dt><dd className="font-semibold">{dateLabel(doc.setupInvoice.paidAt)}</dd></div>}
    </dl>}
    {doc && <div className="flex flex-wrap gap-2">
      <button type="button" onClick={preview} disabled={busy} className={commercialSecondary}><FileDown size={17} aria-hidden="true" />Prévisualiser le PDF</button>
      {doc.status === "DRAFT" && !["PREPARING", "HANDOFF", "UNCERTAIN"].includes(doc.deliveryState) &&
        <button type="button" onClick={() => setConfirm(true)} disabled={busy} className="button-commercial">{type === "CONTRACT" ? "Envoyer pour signature" : invoice ? "Envoyer la facture" : "Envoyer le devis"}</button>}
      {["SENT", "SIGNED"].includes(doc.status) && !doc.setupInvoice?.cancelledAt && !["PREPARING", "HANDOFF", "UNCERTAIN"].includes(doc.deliveryState) &&
        <button type="button" onClick={() => setConfirm("resend")} disabled={busy} className={commercialSecondary}>
          {type === "CONTRACT" && doc.status === "SENT" ? "Renvoyer le lien de signature" : "Renvoyer le document"}
        </button>}
      {proposal && !["PREPARING", "HANDOFF", "UNCERTAIN"].includes(doc.deliveryState) &&
        <button type="button" onClick={() => convert("CONTRACT")} disabled={busy} className={commercialSecondary}>Créer le contrat</button>}
      {type === "CONTRACT" && doc.canInvoice &&
        <button type="button" onClick={() => convert("INVOICE")} disabled={busy} className={commercialSecondary}>Créer la facture</button>}
    </div>}
    {confirm && <div className="flex flex-wrap gap-2 rounded-xl bg-lightGrey p-3">
      <p className="basis-full break-all text-sm">{confirm === "resend" ? "Confirmer le renvoi" : "Confirmer l’envoi"} à {doc.party.email} ?</p>
      <button type="button" onClick={() => setConfirm(false)} className="rounded-xl px-3 py-2 text-sm">Annuler</button>
      <button type="button" onClick={confirm === "resend" ? resend : send} className="button-commercial">Confirmer l’envoi</button>
    </div>}
    {pdf && <div className="grid gap-2">
      <a href={pdf} download={`${doc.docNumber}.pdf`} className="justify-self-start rounded-xl border border-darkBlue/15 px-3 py-2 text-sm text-blue">Télécharger le PDF</a>
      <iframe src={pdf} title={`PDF ${doc.docNumber}`} className="h-[60vh] w-full rounded-xl border border-darkBlue/10" />
    </div>}
  </section>;
}

export function AdminProspectDraft({ type, prospect, onSaved, onClose }) {
  const [offers, setOffers] = useState(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (type === "INVOICE") return;
    const controller = new AbortController();
    adminCommercialApi("/documents/offers", { signal: controller.signal }).then(({ offers }) => setOffers(offers))
      .catch((err) => { if (!controller.signal.aborted) setError(err.message); });
    return () => controller.abort();
  }, [type]);
  if (type === "INVOICE") return <div className="grid gap-2 rounded-xl bg-lightGrey p-3 text-sm">
    <p>La facture reprendra les frais du contrat initial signé.</p>
    {error && <p role="alert" className="text-red">{error}</p>}
    <div className="flex flex-wrap gap-2">
      <button type="button" className="button-commercial" disabled={busy} onClick={async () => {
        setBusy(true);
        setError("");
        try {
          await adminCommercialApi(`/documents?salesOwnerId=${prospect.salesOwnerId}`, {
            method: "POST", body: { type, prospectId: prospect._id },
          });
          onSaved();
        } catch (failure) {
          setError(failure.message);
        } finally {
          setBusy(false);
        }
      }}>Confirmer le brouillon</button>
      <button type="button" className={commercialSecondary} onClick={onClose} disabled={busy}>Annuler</button>
    </div>
  </div>;
  if (error || offers?.length === 0) return <div className="rounded-xl bg-lightGrey p-3 text-sm">
    <p role={error ? "alert" : "status"}>{error || "Aucune offre n’est actuellement disponible pour un nouveau document."}</p>
    <button type="button" className="mt-2 text-blue" onClick={onClose}>Fermer le brouillon</button>
  </div>;
  return offers ? <DocumentEditor type={type} adminProspect={prospect} offers={offers} onClose={onClose} onSave={onSaved} /> : <SimpleSkeleton />;
}

export default function SalesDocuments({ type }) {
  const router = useRouter();
  const [data, setData] = useState(null);
  const [offers, setOffers] = useState(null);
  const [offerError, setOfferError] = useState("");
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("");
  const [page, setPage] = useState(1);
  const [version, setVersion] = useState(0);
  const [selected, setSelected] = useState(null);
  const [error, setError] = useState("");
  const refreshList = useCallback(() => setVersion((revision) => revision + 1), []);
  const invoice = type === "INVOICE";
  const documentId = typeof router.query.document === "string" ? router.query.document : "";
  const prospectId = typeof router.query.prospect === "string" ? router.query.prospect : "";
  const create = router.query.create === "1";
  const requestedStatus = router.query.signature === "pending" && type === "CONTRACT" ? "PENDING" :
    typeof router.query.status === "string" && Object.hasOwn(states[type], router.query.status) ? router.query.status : "";

  useEffect(() => {
    if (create && !invoice) setSelected({ key: `new-${prospectId}` });
  }, [create, invoice, prospectId]);

  useEffect(() => { setStatus(requestedStatus); setPage(1); }, [requestedStatus]);

  useEffect(() => {
    if (invoice) return;
    const controller = new AbortController();
    commercialApi("/offers", { signal: controller.signal }).then((data) => setOffers(data.offers))
      .catch((error) => { if (!controller.signal.aborted) setOfferError(error.message); });
    return () => controller.abort();
  }, [invoice]);

  useEffect(() => {
    const controller = new AbortController();
    const params = new URLSearchParams({ type, q: search, page, ...(prospectId && { prospectId }),
      ...(status === "PENDING" ? { signature: "pending" } : status && { status }),
    });
    const timeout = window.setTimeout(() => commercialApi(`/documents?${params}`, { signal: controller.signal })
      .then(setData).catch((error) => { if (!controller.signal.aborted) setError(error.message); }), 150);
    return () => { window.clearTimeout(timeout); controller.abort(); };
  }, [page, type, search, version, prospectId, status]);

  useEffect(() => {
    if (!documentId) return;
    const controller = new AbortController();
    commercialApi(`/documents/${documentId}`, { signal: controller.signal }).then((data) => {
      if (data.document.type === type) setSelected({ key: data.document._id, doc: data.document });
    }).catch((error) => { if (!controller.signal.aborted) setError(error.message); });
    return () => controller.abort();
  }, [documentId, type]);

  return <div className="grid min-w-0 gap-4">
    <CommercialHeader title={titles[type][0]}
      action={!invoice && <button type="button" aria-label={titles[type][1]} disabled={!offers?.length}
        onClick={() => setSelected({ key: "new" })} className="button-commercial inline-flex items-center gap-2">
        <FilePlus size={17} aria-hidden="true" /><span className="commercial-header-action-label">{titles[type][1]}</span>
      </button>} />
    {invoice && <p className="text-sm text-darkBlue/70">Créez la facture depuis le contrat initial signé.</p>}
    {!invoice && offers === null && !offerError && <p role="status" className="text-sm text-darkBlue/70">Chargement des offres…</p>}
    {!invoice && offers?.length === 0 && <p className="text-sm text-darkBlue/70">Aucune offre n’est actuellement disponible pour un nouveau document.</p>}
    {offerError && <p role="alert" className="text-sm text-red">{offerError}</p>}
    {error && <p role="alert" className="text-sm text-red">{error}</p>}
    {selected && (invoice || offers) && <DocumentEditor key={selected.key} type={type} initial={selected.doc} initialProspectId={prospectId} offers={offers || []}
      onClose={() => setSelected(null)} onSave={refreshList} />}
    <div className={`${commercialPanel} flex flex-wrap items-end gap-3 p-3 midTablet:p-4`}>
      <CommercialSearch label="Rechercher un document" value={search} onChange={(value) => { setPage(1); setSearch(value); }} className="basis-full midTablet:max-w-xl midTablet:flex-1" />
      <label className="grid min-w-0 max-w-full gap-1 text-sm">Statut
        <select className="input-commercial" value={status} onChange={(event) => { setStatus(event.target.value); setPage(1); }}>
          <option value="">Tous les statuts</option>{Object.entries(states[type]).map(([key, label]) => <option key={key} value={key}>{label}</option>)}
          {type === "CONTRACT" && <option value="PENDING">En attente de signature</option>}
        </select>
      </label>
    </div>
    {!data && !error && <SimpleSkeleton />}
    {data && <section className={`${commercialPanel} overflow-hidden`}>
      <CommercialDocumentList onOpen={async ({ doc }) => {
        try {
          const selected = doc.type === "CONTRACT" && doc.status === "SIGNED"
            ? (await commercialApi(`/documents/${doc._id}`)).document : doc;
          setSelected({ key: selected._id, doc: selected });
        } catch (failure) {
          setError(failure.message);
        }
      }}
        empty={<CommercialEmpty icon={type === "CONTRACT" ? FileSignature : ReceiptText} title={search || status ? "Aucun document pour ces filtres" : titles[type][2]} />}
        rows={data.documents.map((doc) => ({
          id: doc._id, doc, name: doc.party.restaurantName, number: doc.docNumber, date: dateLabel(doc.createdAt),
          price: doc.offerConditions && (invoice ? amount(doc.offerConditions.setupCents) : `${amount(doc.offerConditions.monthlyCents)}/mois`),
          setup: !invoice && doc.offerConditions && `${amount(doc.offerConditions.setupCents)} de mise en service`,
          status: commercialDocumentState(doc), progressDate: dateLabel(doc.setupInvoice?.paidAt || doc.setupInvoice?.cancelledAt || doc.signedAt || doc.firstSentAt),
          deliveryUncertain: doc.type === "INVOICE" && doc.deliveryState === "UNCERTAIN",
        }))} />
      {data.total > data.limit && <div className="flex justify-between gap-2 px-4 py-3 text-sm">
        <button type="button" onClick={() => setPage(page - 1)} disabled={page <= 1} className="text-blue disabled:opacity-40">Précédent</button>
        <span>Page {page}</span>
        <button type="button" onClick={() => setPage(page + 1)} disabled={page * data.limit >= data.total} className="text-blue disabled:opacity-40">Suivant</button>
      </div>}
    </section>}
  </div>;
}
