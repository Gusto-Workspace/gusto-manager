import { useContext, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/router";
import axios from "axios";
import {
  ArrowLeft,
  Loader2,
  Save,
  FileDown,
  Send,
  Plus,
  Trash2,
  FileSignature,
  CheckCircle2,
} from "lucide-react";

import { GlobalContext } from "@/contexts/global.context";

function isQuoteOrInvoice(type) {
  return type === "QUOTE" || type === "INVOICE";
}

function euro(n) {
  const v = Number(n || 0);
  return v.toFixed(2).replace(".", ",");
}

function toNumberOrEmpty(v) {
  if (v === "" || v === null || v === undefined) return "";
  const n = Number(v);
  return Number.isNaN(n) ? "" : n;
}

function toSafeNumber(v, fallback = 0) {
  const n = Number(v);
  return Number.isNaN(n) ? fallback : n;
}

function computeTotals(lines, discountAmount) {
  const safeLines = (lines || []).map((l) => {
    const qty = toSafeNumber(l.qty, 1);
    const unitPrice = toSafeNumber(l.unitPrice, 0);
    const offered = Boolean(l.offered);
    const total = offered ? 0 : qty * unitPrice;
    return { ...l, qty, unitPrice: offered ? 0 : unitPrice, offered, total };
  });

  const subtotal = safeLines.reduce(
    (acc, l) => acc + (Number(l.total) || 0),
    0,
  );
  const disc = toSafeNumber(discountAmount, 0);
  const total = subtotal - disc;

  return { safeLines, subtotal, total };
}

// ✅ helpers token/admin headers
function getAdminToken() {
  if (typeof window === "undefined") return null;
  return localStorage.getItem("admin-token");
}
function authHeaders() {
  const token = getAdminToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
}
function axiosCfg() {
  return { headers: authHeaders() };
}

// ✅ fallback parser (si anciennes données subsistent)
function parseOldPriceLabelToNumber(priceLabel) {
  const s = (priceLabel || "").toString().replace(",", ".").toLowerCase();
  const m = s.match(/(\d+(\.\d+)?)/);
  if (!m) return 0;
  const n = Number(m[1]);
  return Number.isNaN(n) ? 0 : n;
}

export default function DetailsDocumentAdminPage(props) {
  const router = useRouter();
  const { adminContext } = useContext(GlobalContext);

  const [loading, setLoading] = useState(true);

  const [saving, setSaving] = useState(false);
  const [savedOk, setSavedOk] = useState(false);

  const [pdfLoading, setPdfLoading] = useState(false);
  const [sendLoading, setSendLoading] = useState(false);

  const [errorMsg, setErrorMsg] = useState("");

  const [doc, setDoc] = useState(null);

  // confirmation modal
  const [confirmSendOpen, setConfirmSendOpen] = useState(false);

  // form state
  const [party, setParty] = useState({
    restaurantName: "",
    address: "",
    ownerName: "",
    email: "",
    phone: "",
  });

  // Dates (devis/facture + contrat)
  const [issueDate, setIssueDate] = useState("");
  const [dueDate, setDueDate] = useState("");

  // ✅ Lignes (devis/facture + contrat)
  const [lines, setLines] = useState([
    { label: "", qty: 1, unitPrice: 0, offered: false },
  ]);

  // Remise (devis/facture uniquement)
  const [discountLabel, setDiscountLabel] = useState("");
  const [discountAmount, setDiscountAmount] = useState(0);

  // (legacy contrat — conservé en back-compat, mais UI n’affiche plus ces champs)
  const [websiteOffered, setWebsiteOffered] = useState(false);
  const [websitePriceLabel, setWebsitePriceLabel] = useState("");

  // ✅ subscription (name + monthly number)
  const [subscriptionName, setSubscriptionName] = useState("");
  const [subscriptionPriceMonthly, setSubscriptionPriceMonthly] = useState(0);

  const [engagementMonths, setEngagementMonths] = useState(12);

  // ✅ modules numeric
  const [modules, setModules] = useState([
    { name: "", offered: false, priceMonthly: 0 },
  ]);

  const totalsPreview = useMemo(() => {
    const { safeLines, subtotal, total } = computeTotals(lines, discountAmount);
    return { safeLines, subtotal, total };
  }, [lines, discountAmount]);

  useEffect(() => {
    if (!props.documentId) return;

    let cancelled = false;

    async function load() {
      setLoading(true);
      setErrorMsg("");

      const token = getAdminToken();
      if (!token) {
        setErrorMsg("Tu n'es pas connecté (token admin manquant).");
        setLoading(false);
        return;
      }

      try {
        const { data } = await axios.get(
          `${process.env.NEXT_PUBLIC_API_URL}/admin/documents/${props.documentId}`,
          axiosCfg(),
        );

        if (cancelled) return;

        const d = data?.document;
        setDoc(d);

        // party
        setParty({
          restaurantName: d?.party?.restaurantName || "",
          address: d?.party?.address || "",
          ownerName: d?.party?.ownerName || "",
          email: d?.party?.email || "",
          phone: d?.party?.phone || "",
        });

        // dates
        const toInputDate = (val) => {
          if (!val) return "";
          const dt = new Date(val);
          if (Number.isNaN(dt.getTime())) return "";
          const pad = (n) => String(n).padStart(2, "0");
          return `${dt.getFullYear()}-${pad(dt.getMonth() + 1)}-${pad(
            dt.getDate(),
          )}`;
        };

        setIssueDate(toInputDate(d.issueDate));
        setDueDate(toInputDate(d.dueDate));

        if (!d.issueDate) {
          const today = new Date();
          const pad = (n) => String(n).padStart(2, "0");
          const todayStr = `${today.getFullYear()}-${pad(
            today.getMonth() + 1,
          )}-${pad(today.getDate())}`;
          setIssueDate(todayStr);
        }

        // ✅ lines (devis/facture + contrat)
        const mappedLines =
          d.lines && d.lines.length > 0
            ? d.lines.map((l) => ({
                label: l.label || "",
                qty: l.qty ?? 1,
                unitPrice: l.unitPrice ?? 0,
                offered: Boolean(l.offered),
              }))
            : null;

        // ✅ back-compat: anciens contrats (website.*) -> créer une ligne
        const legacyWebsiteLine =
          d?.type === "CONTRACT" &&
          (!mappedLines || mappedLines.length === 0) &&
          (d?.website?.priceLabel || d?.website?.offered)
            ? [
                {
                  label: "Site vitrine",
                  qty: 1,
                  unitPrice: d?.website?.offered
                    ? 0
                    : parseOldPriceLabelToNumber(d?.website?.priceLabel || ""),
                  offered: Boolean(d?.website?.offered),
                },
              ]
            : null;

        setLines(
          mappedLines ||
            legacyWebsiteLine || [
              { label: "", qty: 1, unitPrice: 0, offered: false },
            ],
        );

        // remise
        setDiscountLabel(d?.totals?.discountLabel || "");
        setDiscountAmount(d?.totals?.discountAmount || 0);

        // ✅ subscription/modules numeric (avec fallback ancien format)
        const subName =
          d?.subscription?.name ??
          (d?.subscriptionLabel ? String(d.subscriptionLabel) : "");
        const subPrice =
          d?.subscription?.priceMonthly ??
          (d?.subscriptionLabel
            ? parseOldPriceLabelToNumber(d.subscriptionLabel)
            : 0);

        setSubscriptionName(subName || "");
        setSubscriptionPriceMonthly(subPrice ?? 0);

        setEngagementMonths(d?.engagementMonths ?? 12);

        setModules(
          d?.modules && d.modules.length > 0
            ? d.modules.map((m) => ({
                name: m.name || "",
                offered: Boolean(m.offered),
                priceMonthly:
                  m.priceMonthly ??
                  (m.priceLabel ? parseOldPriceLabelToNumber(m.priceLabel) : 0),
              }))
            : [{ name: "", offered: false, priceMonthly: 0 }],
        );

        // legacy contrat (on charge quand même si existant)
        setWebsiteOffered(Boolean(d?.website?.offered));
        setWebsitePriceLabel(d?.website?.priceLabel || "");
      } catch (err) {
        console.error(err);
        setErrorMsg("Impossible de charger le document.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [props.documentId]);

  const canSign = doc?.type === "CONTRACT" && doc?.status !== "SIGNED";
  const isLocked = doc?.status === "SENT" || doc?.status === "SIGNED";
  const canResend = doc?.status === "SENT";
  const sendBtnLabel = canResend ? "Renvoyer" : "Envoyer";
  const isDiscountActive = toSafeNumber(discountAmount, 0) > 0;

  function addLine() {
    setLines((prev) => [
      ...(prev || []),
      { label: "", qty: 1, unitPrice: 0, offered: false },
    ]);
  }
  function removeLine(i) {
    setLines((prev) => (prev || []).filter((_, idx) => idx !== i));
  }
  function updateLine(i, patch) {
    setLines((prev) =>
      (prev || []).map((l, idx) => (idx === i ? { ...l, ...patch } : l)),
    );
  }

  function addModule() {
    setModules((prev) => [
      ...(prev || []),
      { name: "", offered: false, priceMonthly: 0 },
    ]);
  }
  function removeModule(i) {
    setModules((prev) => (prev || []).filter((_, idx) => idx !== i));
  }
  function updateModule(i, patch) {
    setModules((prev) =>
      (prev || []).map((m, idx) => (idx === i ? { ...m, ...patch } : m)),
    );
  }

  async function handleSave() {
    if (!doc?._id) return false;

    const token = getAdminToken();
    if (!token) {
      setErrorMsg("Tu n'es pas connecté (token admin manquant).");
      return false;
    }

    setSaving(true);
    setErrorMsg("");
    setSavedOk(false);

    try {
      const payload = {
        party: {
          restaurantName: party.restaurantName,
          address: party.address,
          ownerName: party.ownerName,
          email: party.email,
          phone: party.phone,
        },
      };

      if (issueDate) payload.issueDate = new Date(issueDate).toISOString();
      if (dueDate) payload.dueDate = new Date(dueDate).toISOString();

      // ✅ lignes POUR TOUS les types (contrat inclus)
      payload.lines = (lines || []).map((l) => ({
        label: l.label,
        qty: toSafeNumber(l.qty, 1),
        unitPrice: l.offered ? 0 : toSafeNumber(l.unitPrice, 0),
        offered: Boolean(l.offered),
      }));

      // ✅ abonnement + modules (numeric) pour TOUS les types
      payload.subscription = {
        name: subscriptionName || "",
        priceMonthly: toSafeNumber(subscriptionPriceMonthly, 0),
      };

      payload.engagementMonths = Number(engagementMonths || 0);

      payload.modules = (modules || [])
        .filter((m) => (m.name || "").trim())
        .map((m) => ({
          name: m.name,
          offered: Boolean(m.offered),
          priceMonthly: m.offered ? 0 : toSafeNumber(m.priceMonthly, 0),
        }));

      // Remise uniquement devis/facture
      if (isQuoteOrInvoice(doc.type)) {
        payload.totals = {
          discountLabel: discountLabel || "",
          discountAmount: toSafeNumber(discountAmount, 0),
        };
      }

      // ✅ legacy: si tu veux garder website en cohérence (optionnel)
      // On recalcule un "website" depuis la 1ère ligne (utile pour anciens exports)
      if (doc.type === "CONTRACT") {
        const first = (lines || [])[0];
        payload.website = {
          offered: Boolean(first?.offered),
          priceLabel: first?.offered
            ? "Offert"
            : first?.unitPrice !== undefined
              ? `${toSafeNumber(first.unitPrice, 0)}€`
              : websitePriceLabel || "",
        };
      }

      const { data } = await axios.patch(
        `${process.env.NEXT_PUBLIC_API_URL}/admin/documents/${doc._id}`,
        payload,
        axiosCfg(),
      );

      setDoc(data.document);

      adminContext?.setDocumentsList?.((prev) => {
        const list = prev || [];
        const idx = list.findIndex((d) => d._id === data.document._id);

        if (idx === -1) {
          return [data.document, ...list];
        }

        const copy = [...list];
        copy[idx] = { ...copy[idx], ...data.document };
        return copy;
      });

      setSavedOk(true);
      setTimeout(() => setSavedOk(false), 1800);
      return true;
    } catch (err) {
      console.error(err);
      setErrorMsg("Erreur lors de l'enregistrement.");
      return false;
    } finally {
      setSaving(false);
    }
  }

  // ✅ PDF PREVIEW
  async function handlePreviewPdf() {
    if (!doc?._id) return;

    const token = getAdminToken();
    if (!token) {
      setErrorMsg("Tu n'es pas connecté (token admin manquant).");
      return;
    }

    setPdfLoading(true);
    setErrorMsg("");

    try {
      const res = await axios.get(
        `${process.env.NEXT_PUBLIC_API_URL}/admin/documents/${doc._id}/pdf/preview`,
        { ...axiosCfg(), responseType: "blob" },
      );

      const file = new Blob([res.data], { type: "application/pdf" });
      const url = window.URL.createObjectURL(file);
      window.open(url, "_blank", "noopener,noreferrer");
      setTimeout(() => window.URL.revokeObjectURL(url), 60_000);
    } catch (err) {
      console.error(err);
      setErrorMsg("Erreur lors de l’aperçu PDF.");
    } finally {
      setPdfLoading(false);
    }
  }

  async function handleSendConfirmed() {
    if (!doc?._id) return;

    const token = getAdminToken();
    if (!token) {
      setErrorMsg("Tu n'es pas connecté (token admin manquant).");
      return;
    }

    setSendLoading(true);
    setErrorMsg("");

    try {
      const endpoint =
        doc.status === "SENT"
          ? `${process.env.NEXT_PUBLIC_API_URL}/admin/documents/${doc._id}/resend`
          : `${process.env.NEXT_PUBLIC_API_URL}/admin/documents/${doc._id}/send`;

      const { data } = await axios.post(endpoint, {}, axiosCfg());

      // ✅ MAJ doc local
      setDoc((prev) => ({
        ...(prev || {}),
        status: data.status || prev?.status,
        pdf: data.pdf || prev?.pdf,
        sentAt: data.sentAt || new Date().toISOString(),
      }));

      // ✅ MAJ liste context
      adminContext?.setDocumentsList?.((prev) =>
        (prev || []).map((d) =>
          d._id === doc._id
            ? {
                ...d,
                ...(data.document || {}),
                status: data.status || d.status,
                pdf: data.pdf || d.pdf,
                sentAt: data.sentAt || new Date().toISOString(),
              }
            : d,
        ),
      );

      router.push("/dashboard/admin/documents");
    } catch (err) {
      console.error(err);
      setErrorMsg("Erreur lors de l'envoi email.");
      if (err?.response?.data?.message) setErrorMsg(err.response.data.message);
    } finally {
      setSendLoading(false);
    }
  }

  return (
    <section className="flex flex-col gap-4">
      {/* Top bar */}
      <div className="ml-16 mobile:ml-12 tablet:ml-0 px-4 pt-4 flex items-center justify-between gap-3">
        <button
          onClick={() => router.push("/dashboard/admin/documents")}
          className="inline-flex items-center gap-2 text-sm font-semibold text-darkBlue hover:underline"
        >
          <ArrowLeft className="size-4" />
          Retour
        </button>

        <div className="flex items-center gap-2">
          {canSign && (
            <button
              onClick={() =>
                router.push(`/dashboard/admin/documents/add/${doc?._id}/sign`)
              }
              className="inline-flex items-center gap-2 rounded-xl bg-blue px-3 py-2 text-white text-sm font-semibold shadow-sm hover:bg-blue/90"
            >
              <FileSignature className="size-4" />
              Signer
            </button>
          )}

          {!isLocked ? (
            <button
              onClick={handleSave}
              disabled={saving || loading}
              className="inline-flex items-center gap-2 rounded-xl border border-darkBlue/10 bg-white px-3 py-2 text-sm font-semibold text-darkBlue hover:bg-darkBlue/5 disabled:opacity-60"
            >
              {saving ? (
                <Loader2 className="size-4 animate-spin" />
              ) : savedOk ? (
                <CheckCircle2 className="size-4 text-green-600" />
              ) : (
                <Save className="size-4 text-darkBlue/60" />
              )}
              {saving
                ? "Enregistrement…"
                : savedOk
                  ? "Enregistré"
                  : "Enregistrer"}
            </button>
          ) : null}

          <button
            onClick={handlePreviewPdf}
            disabled={pdfLoading || loading}
            className="inline-flex items-center gap-2 rounded-xl border border-darkBlue/10 bg-white px-3 py-2 text-sm font-semibold text-darkBlue hover:bg-darkBlue/5 disabled:opacity-60"
          >
            {pdfLoading ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <FileDown className="size-4 text-darkBlue/60" />
            )}
            PDF
          </button>

          <button
            onClick={() => setConfirmSendOpen(true)}
            disabled={sendLoading || loading || doc?.status === "SIGNED"}
            className="inline-flex items-center gap-2 rounded-xl bg-blue px-3 py-2 text-white text-sm font-semibold shadow-sm hover:bg-blue/90 disabled:opacity-60"
          >
            {sendLoading ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <Send className="size-4" />
            )}
            {sendBtnLabel}
          </button>
        </div>
      </div>

      {/* Body */}
      <div className="">
        <div className="rounded-2xl bg-white/50 border border-darkBlue/10 shadow-sm p-5">
          {loading ? (
            <div className="flex flex-col gap-3">
              <div className="h-5 w-40 rounded bg-darkBlue/5" />
              <div className="h-10 rounded bg-darkBlue/5" />
              <div className="h-10 rounded bg-darkBlue/5" />
              <div className="h-10 rounded bg-darkBlue/5" />
            </div>
          ) : errorMsg ? (
            <div className="rounded-xl border border-red/20 bg-red/10 px-3 py-2 text-sm text-red">
              {errorMsg}
            </div>
          ) : (
            <>
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <h1 className="text-lg font-semibold text-darkBlue">
                    {doc?.type === "QUOTE"
                      ? "Devis"
                      : doc?.type === "INVOICE"
                        ? "Facture"
                        : "Contrat"}{" "}
                    <span className="text-darkBlue/50 font-medium">
                      {doc?.docNumber ? `• ${doc.docNumber}` : ""}
                    </span>
                  </h1>
                  <p className="text-sm text-darkBlue/60 mt-1">
                    Statut :{" "}
                    <span className="font-semibold">{doc?.status || "-"}</span>
                  </p>
                </div>
              </div>

              {/* Party */}
              <div className="mt-6">
                <h2 className="text-sm font-semibold text-darkBlue">Client</h2>

                <div className="mt-3 grid grid-cols-1 midTablet:grid-cols-2 gap-3">
                  <input
                    value={party.restaurantName}
                    disabled={isLocked}
                    onChange={(e) =>
                      setParty((p) => ({
                        ...p,
                        restaurantName: e.target.value,
                      }))
                    }
                    className="rounded-xl border border-darkBlue/10 bg-white px-3 py-2 text-sm"
                    placeholder="Nom du restaurant"
                  />
                  <input
                    value={party.ownerName}
                    disabled={isLocked}
                    onChange={(e) =>
                      setParty((p) => ({ ...p, ownerName: e.target.value }))
                    }
                    className="rounded-xl border border-darkBlue/10 bg-white px-3 py-2 text-sm"
                    placeholder="Nom du dirigeant"
                  />
                  <input
                    value={party.email}
                    disabled={isLocked}
                    onChange={(e) =>
                      setParty((p) => ({ ...p, email: e.target.value }))
                    }
                    className="rounded-xl border border-darkBlue/10 bg-white px-3 py-2 text-sm"
                    placeholder="Email"
                  />
                  <input
                    value={party.phone}
                    disabled={isLocked}
                    onChange={(e) =>
                      setParty((p) => ({ ...p, phone: e.target.value }))
                    }
                    className="rounded-xl border border-darkBlue/10 bg-white px-3 py-2 text-sm"
                    placeholder="Téléphone"
                  />
                  <input
                    value={party.address}
                    disabled={isLocked}
                    onChange={(e) =>
                      setParty((p) => ({ ...p, address: e.target.value }))
                    }
                    className="rounded-xl border border-darkBlue/10 bg-white px-3 py-2 text-sm midTablet:col-span-2"
                    placeholder="Adresse"
                  />
                </div>
              </div>

              {/* ✅ Dates */}
              <div className="mt-8">
                <h2 className="text-sm font-semibold text-darkBlue">
                  Détails{" "}
                  {doc?.type === "QUOTE"
                    ? "devis"
                    : doc?.type === "INVOICE"
                      ? "facture"
                      : "contrat"}
                </h2>

                <div className="mt-3 grid grid-cols-1 midTablet:grid-cols-2 gap-3">
                  <div className="flex flex-col gap-1">
                    <label className="text-xs text-darkBlue/60">Date</label>
                    <input
                      type="date"
                      disabled={isLocked}
                      value={issueDate}
                      onChange={(e) => setIssueDate(e.target.value)}
                      className="rounded-xl border border-darkBlue/10 bg-white px-3 py-2 text-sm"
                    />
                  </div>

                  {isQuoteOrInvoice(doc?.type) ? (
                    <div className="flex flex-col gap-1">
                      <label className="text-xs text-darkBlue/60">
                        Échéance
                      </label>
                      <input
                        type="date"
                        disabled={isLocked}
                        value={dueDate}
                        onChange={(e) => setDueDate(e.target.value)}
                        className="rounded-xl border border-darkBlue/10 bg-white px-3 py-2 text-sm"
                      />
                    </div>
                  ) : null}
                </div>

                {/* ✅ Lines (pour devis/facture ET contrat) */}
                <div className="mt-4 rounded-xl border border-darkBlue/10 bg-white p-3">
                  <div className="flex items-center justify-between gap-3">
                    <p className="text-sm font-semibold text-darkBlue">
                      Lignes
                    </p>
                    <button
                      onClick={addLine}
                      disabled={isLocked}
                      className="inline-flex items-center gap-2 rounded-xl border border-darkBlue/10 bg-white px-3 py-2 text-sm font-semibold text-darkBlue hover:bg-darkBlue/5 disabled:opacity-60"
                    >
                      <Plus className="size-4 text-darkBlue/60" />
                      Ajouter
                    </button>
                  </div>

                  <div className="hidden midTablet:grid mt-3 grid-cols-[1fr_110px_110px_140px_44px] gap-2 px-1">
                    <p className="text-xs text-darkBlue/60 font-semibold">
                      Description
                    </p>
                    <p className="text-xs text-darkBlue/60 font-semibold">
                      Quantité
                    </p>
                    <p className="text-xs text-darkBlue/60 font-semibold">
                      Offert
                    </p>
                    <p className="text-xs text-darkBlue/60 font-semibold">
                      Prix (€)
                    </p>
                    <span />
                  </div>

                  <div className="mt-2 flex flex-col gap-2">
                    {lines.map((l, i) => (
                      <div
                        key={i}
                        className="grid grid-cols-1 midTablet:grid-cols-[1fr_110px_110px_140px_44px] gap-2"
                      >
                        <input
                          value={l.label}
                          disabled={isLocked}
                          onChange={(e) =>
                            updateLine(i, { label: e.target.value })
                          }
                          className="rounded-xl border border-darkBlue/10 bg-white px-3 py-2 text-sm"
                          placeholder="Description"
                        />

                        <input
                          type="number"
                          min="1"
                          onWheel={(e) => e.currentTarget.blur()}
                          disabled={isLocked}
                          value={l.qty ?? ""}
                          onChange={(e) =>
                            updateLine(i, {
                              qty: toNumberOrEmpty(e.target.value),
                            })
                          }
                          className="rounded-xl border border-darkBlue/10 bg-white px-3 py-2 text-sm"
                          placeholder="Quantité"
                        />

                        <label className="inline-flex items-center justify-center gap-2 rounded-xl border border-darkBlue/10 bg-white px-3 py-2 text-sm text-darkBlue/80">
                          <input
                            type="checkbox"
                            disabled={isLocked}
                            checked={Boolean(l.offered)}
                            onChange={(e) =>
                              updateLine(i, {
                                offered: e.target.checked,
                                ...(e.target.checked ? { unitPrice: 0 } : {}),
                              })
                            }
                          />
                          Offert
                        </label>

                        <input
                          type="number"
                          step="0.01"
                          onWheel={(e) => e.currentTarget.blur()}
                          disabled={isLocked || l.offered}
                          value={l.unitPrice ?? ""}
                          onChange={(e) =>
                            updateLine(i, {
                              unitPrice: toNumberOrEmpty(e.target.value),
                            })
                          }
                          className="rounded-xl border border-darkBlue/10 bg-white px-3 py-2 text-sm"
                          placeholder="Prix (€)"
                        />

                        <button
                          onClick={() => removeLine(i)}
                          disabled={lines.length === 1 || isLocked}
                          className="inline-flex items-center justify-center rounded-xl border border-red/20 bg-red/10 hover:bg-red/15 transition disabled:opacity-60"
                          title="Supprimer"
                        >
                          <Trash2 className="size-4 text-red" />
                        </button>
                      </div>
                    ))}
                  </div>

                  {/* ✅ Discount + Totals UNIQUEMENT devis/facture */}
                  {isQuoteOrInvoice(doc?.type) ? (
                    <div className="mt-4 grid grid-cols-1 midTablet:grid-cols-2 gap-3">
                      <div className="rounded-xl border border-darkBlue/10 bg-white p-3">
                        <p className="text-sm font-semibold text-darkBlue">
                          Remise
                        </p>

                        <div className="mt-2 flex flex-col gap-2">
                          <div className="flex flex-col gap-1">
                            <label className="text-xs text-darkBlue/60">
                              Libellé
                            </label>
                            <input
                              value={discountLabel}
                              disabled={isLocked}
                              onChange={(e) => setDiscountLabel(e.target.value)}
                              className="rounded-xl border border-darkBlue/10 bg-white px-3 py-2 text-sm"
                              placeholder="Ex: Offre promotionnelle"
                            />
                          </div>

                          <div className="flex flex-col gap-1">
                            <label className="text-xs text-darkBlue/60">
                              Montant
                            </label>
                            <input
                              type="number"
                              step="0.01"
                              disabled={isLocked}
                              value={discountAmount ?? ""}
                              onWheel={(e) => e.currentTarget.blur()}
                              onChange={(e) =>
                                setDiscountAmount(
                                  toNumberOrEmpty(e.target.value),
                                )
                              }
                              className="rounded-xl border border-darkBlue/10 bg-white px-3 py-2 text-sm"
                              placeholder="Ex: 100"
                            />
                          </div>
                        </div>
                      </div>

                      <div className="rounded-xl border border-darkBlue/10 bg-white p-3">
                        <p className="text-sm font-semibold text-darkBlue">
                          Aperçu totaux
                        </p>

                        <div className="mt-2 text-sm text-darkBlue/80 space-y-1">
                          <div className="flex justify-between">
                            <span>Sous-total</span>
                            <span>{euro(totalsPreview.subtotal)} €</span>
                          </div>

                          {isDiscountActive ? (
                            <div className="flex justify-between">
                              <span>Remise</span>
                              <span>- {euro(discountAmount)} €</span>
                            </div>
                          ) : null}

                          <div className="flex justify-between font-semibold text-darkBlue">
                            <span>Total</span>
                            <span>{euro(totalsPreview.total)} €</span>
                          </div>
                        </div>
                      </div>
                    </div>
                  ) : null}
                </div>

                {/* ✅ Abonnement + Modules (numeric) pour tous les types */}
                <div className="mt-6 rounded-xl border border-darkBlue/10 bg-white p-3">
                  <p className="text-sm font-semibold text-darkBlue">
                    Abonnement & modules
                  </p>

                  <div className="mt-3 flex flex-col midTablet:flex-row gap-3">
                    <div className="rounded-xl w-full midTablet:w-1/3 border border-darkBlue/10 bg-white p-3">
                      <p className="text-sm font-semibold text-darkBlue">
                        Abonnement
                      </p>

                      <div className="mt-2 flex flex-col gap-2">
                        <input
                          value={subscriptionName}
                          disabled={isLocked}
                          onChange={(e) => setSubscriptionName(e.target.value)}
                          className="w-full rounded-xl border border-darkBlue/10 bg-white px-3 py-2 text-sm"
                          placeholder='Nom (ex: "Essentiel")'
                        />

                        <div className="flex flex-col gap-1">
                          <label className="text-xs text-darkBlue/60">
                            Prix / mois (€)
                          </label>
                          <input
                            type="number"
                            step="0.01"
                            onWheel={(e) => e.currentTarget.blur()}
                            disabled={isLocked}
                            value={subscriptionPriceMonthly ?? ""}
                            onChange={(e) =>
                              setSubscriptionPriceMonthly(
                                toNumberOrEmpty(e.target.value),
                              )
                            }
                            className="w-full rounded-xl border border-darkBlue/10 bg-white px-3 py-2 text-sm"
                            placeholder="95"
                          />
                        </div>
                      </div>

                      <p className="text-sm font-semibold text-darkBlue mt-3">
                        Engagement (mois)
                      </p>
                      <input
                        type="number"
                        min="1"
                        onWheel={(e) => e.currentTarget.blur()}
                        disabled={isLocked}
                        value={engagementMonths ?? ""}
                        onChange={(e) =>
                          setEngagementMonths(toNumberOrEmpty(e.target.value))
                        }
                        className="mt-2 w-full rounded-xl border border-darkBlue/10 bg-white px-3 py-2 text-sm"
                        placeholder="12"
                      />
                    </div>

                    <div className="rounded-xl w-full midTablet:w-2/3 border border-darkBlue/10 bg-white p-3">
                      <div className="flex items-center justify-between gap-3">
                        <p className="text-sm font-semibold text-darkBlue">
                          Modules
                        </p>
                        <button
                          onClick={addModule}
                          disabled={isLocked}
                          className="inline-flex items-center gap-2 rounded-xl border border-darkBlue/10 bg-white px-3 py-2 text-sm font-semibold text-darkBlue hover:bg-darkBlue/5 disabled:opacity-60"
                        >
                          <Plus className="size-4 text-darkBlue/60" />
                          Ajouter
                        </button>
                      </div>

                      <div className="mt-3 flex flex-col gap-2">
                        {modules.map((m, i) => (
                          <div
                            key={i}
                            className="grid items-end grid-cols-1 midTablet:grid-cols-[1fr_110px_140px_44px] gap-2"
                          >
                            <input
                              value={m.name}
                              disabled={isLocked}
                              onChange={(e) =>
                                updateModule(i, { name: e.target.value })
                              }
                              className="rounded-xl border border-darkBlue/10 bg-white px-3 py-2 text-sm"
                              placeholder="Nom du module"
                            />

                            <label className="inline-flex items-center justify-center gap-2 rounded-xl border border-darkBlue/10 bg-white px-3 py-2 text-sm text-darkBlue/80">
                              <input
                                type="checkbox"
                                disabled={isLocked}
                                checked={m.offered}
                                onChange={(e) =>
                                  updateModule(i, {
                                    offered: e.target.checked,
                                    ...(e.target.checked
                                      ? { priceMonthly: 0 }
                                      : {}),
                                  })
                                }
                              />
                              Offert
                            </label>

                            <div className="flex flex-col gap-1">
                              {i === 0 && (
                                <label className="text-xs text-darkBlue/60">
                                  Prix / mois (€)
                                </label>
                              )}

                              <input
                                type="number"
                                step="0.01"
                                onWheel={(e) => e.currentTarget.blur()}
                                value={m.priceMonthly ?? ""}
                                onChange={(e) =>
                                  updateModule(i, {
                                    priceMonthly: toNumberOrEmpty(
                                      e.target.value,
                                    ),
                                  })
                                }
                                className="rounded-xl border border-darkBlue/10 bg-white px-3 py-2 text-sm"
                                placeholder="Prix / mois (€)"
                                disabled={m.offered || isLocked}
                              />
                            </div>

                            <button
                              onClick={() => removeModule(i)}
                              disabled={modules.length === 1 || isLocked}
                              className="inline-flex items-center justify-center rounded-xl border border-red/20 bg-red/10 hover:bg-red/15 transition disabled:opacity-60"
                              title="Supprimer"
                            >
                              <Trash2 className="size-4 text-red" />
                            </button>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </>
          )}
        </div>
      </div>

      {/* ✅ MODALE CONFIRMATION ENVOI */}
      {confirmSendOpen ? (
        <div className="fixed inset-0 z-[1000] flex items-center justify-center px-4">
          <div
            className="absolute inset-0 bg-black/40"
            onClick={() =>
              sendLoading || saving ? null : setConfirmSendOpen(false)
            }
          />
          <div className="mx-4 relative flex flex-col gap-2 justify-center text-center w-full max-w-lg rounded-2xl bg-white shadow-xl border border-darkBlue/10 p-5">
            <p className="text-base font-semibold text-darkBlue">
              Confirmer l’envoi
            </p>
            <p className="text-sm text-darkBlue/70 mt-2">
              {canResend
                ? "Le renvoi va régénérer le PDF puis renvoyer le document au client."
                : "L’envoi va générer le PDF définitif, puis l’envoyer au client."}
              <br />
              {!canResend && (
                <b>Assurez-vous d’avoir correctement saisi les informations.</b>
              )}
            </p>

            <div className="mt-5 flex items-center justify-center gap-2">
              <button
                type="button"
                onClick={() => setConfirmSendOpen(false)}
                disabled={sendLoading}
                className="inline-flex items-center gap-2 rounded-xl border border-darkBlue/10 bg-white px-3 py-2 text-sm font-semibold text-darkBlue hover:bg-darkBlue/5 disabled:opacity-60"
              >
                Annuler
              </button>

              <button
                type="button"
                onClick={async () => {
                  if (doc?.status === "DRAFT") {
                    const ok = await handleSave();
                    if (!ok) return;
                  }

                  await handleSendConfirmed();
                  setConfirmSendOpen(false);
                }}
                disabled={sendLoading || saving}
                className="inline-flex items-center gap-2 rounded-xl bg-blue px-3 py-2 text-white text-sm font-semibold shadow-sm hover:bg-blue/90 disabled:opacity-60"
              >
                {sendLoading ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <Send className="size-4" />
                )}
                {canResend ? "Confirmer & renvoyer" : "Confirmer & envoyer"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </section>
  );
}
