import { useContext, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/router";
import axios from "axios";
import {
  ArrowLeft,
  Loader2,
  Save,
  Send,
  Plus,
  Trash2,
  FileSignature,
  CheckCircle2,
  Eye,
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

function clampMin(n, min = 0) {
  const x = toSafeNumber(n, 0);
  return x < min ? min : x;
}

function trimText(v) {
  return typeof v === "string" ? v.trim() : v;
}

/**
 * ✅ Règle OFFERED (effective) — uniquement au SAVE/SUBMIT :
 * - si unitPrice <= 0 (ou vide) => offert
 * - si checkbox offert cochée => offert
 *
 * ⚠️ IMPORTANT : l'UI NE DOIT PAS auto-cocher "Offert" quand le prix passe à 0.
 */
function normalizeOfferedForSave(offered, unitPrice) {
  const price = toSafeNumber(unitPrice, 0); // "" => 0
  return Boolean(offered) || price <= 0;
}

function computeTotals(lines, discountAmount) {
  const safeLines = (lines || []).map((l) => {
    const qty = clampMin(l.qty, 1);
    const unitPrice = clampMin(l.unitPrice, 0);

    // On calcule l'effectif pour les totaux (même si UI ne coche pas auto)
    const offeredEffective = normalizeOfferedForSave(l.offered, unitPrice);

    const normalizedUnit = offeredEffective ? 0 : unitPrice;
    const total = offeredEffective ? 0 : qty * normalizedUnit;

    return {
      ...l,
      qty,
      unitPrice: normalizedUnit,
      offered: offeredEffective,
      total,
    };
  });

  const subtotal = safeLines.reduce(
    (acc, l) => acc + (Number(l.total) || 0),
    0,
  );
  const disc = clampMin(discountAmount, 0);
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

// ✅ empêche le changement au scroll sur input number
function preventWheelChange(e) {
  // évite l'incrément/décrément via molette
  e.preventDefault?.();
  e.currentTarget.blur();
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

  /**
   * ✅ Lignes "classiques"
   * - unitPrice par défaut = "" (affiche "-" via placeholder)
   * - offered par défaut = false (jamais coché automatiquement)
   */
  const [lines, setLines] = useState([
    { label: "", qty: 1, unitPrice: "", offered: false, _lastPaidUnitPrice: 0 },
  ]);

  // ✅ Site internet (contrat uniquement)
  const [hasWebsite, setHasWebsite] = useState(false);
  const [websiteLine, setWebsiteLine] = useState({
    label: "Site internet",
    qty: 1,
    unitPrice: "",
    offered: false,
    _lastPaidUnitPrice: 0,
  });

  // ✅ paiement site vitrine : 1 / 2 / 3
  const [sitePaymentSplit, setSitePaymentSplit] = useState(1);

  // Remise (devis/facture uniquement)
  const [discountLabel, setDiscountLabel] = useState("");
  const [discountAmount, setDiscountAmount] = useState("");

  const [comments, setComments] = useState("");

  // ✅ subscription (name + monthly number)
  const [subscriptionPriceMonthly, setSubscriptionPriceMonthly] = useState("");
  const [engagementMonths, setEngagementMonths] = useState(12);

  // ✅ modules numeric
  const [modules, setModules] = useState([
    { name: "", offered: false, priceMonthly: "", _lastPaidPriceMonthly: 0 },
  ]);

  const totalsPreview = useMemo(() => {
    const { subtotal, total } = computeTotals(lines, discountAmount);
    return { subtotal, total };
  }, [lines, discountAmount]);

  // ✅ Offert UI website : UNIQUEMENT checkbox (pas auto si prix=0)
  const websiteOfferedUi = useMemo(() => {
    return Boolean(websiteLine.offered);
  }, [websiteLine.offered]);

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

        /**
         * ✅ lines classiques (on ignore les WEBSITE)
         * UI:
         * - offered = valeur back (checkbox)
         * - unitPrice = "" si 0 ou vide (affiche "-")
         */
        const mappedClassicLines =
          d.lines && d.lines.length > 0
            ? d.lines
                .filter((l) => (l?.kind ? l.kind !== "WEBSITE" : true))
                .map((l) => {
                  const unit = toSafeNumber(l?.unitPrice, 0);
                  const offeredUi = Boolean(l?.offered);

                  return {
                    label: l?.label || "",
                    qty: clampMin(l?.qty ?? 1, 1),
                    unitPrice: offeredUi ? "" : unit > 0 ? unit : "",
                    offered: offeredUi,
                    _lastPaidUnitPrice: unit > 0 ? unit : 0,
                  };
                })
            : null;

        setLines(
          mappedClassicLines && mappedClassicLines.length > 0
            ? mappedClassicLines
            : [
                {
                  label: "",
                  qty: 1,
                  unitPrice: "",
                  offered: false,
                  _lastPaidUnitPrice: 0,
                },
              ],
        );

        // ✅ website enabled (back-compat)
        const websiteEnabled =
          Boolean(d?.website?.enabled) ||
          Boolean(d?.website?.line) ||
          Boolean(d?.website?.priceLabel) ||
          Boolean(d?.website?.offered) ||
          (Array.isArray(d?.lines) &&
            d.lines.some((l) => /site\s*vitrine/i.test(l?.label || "")));

        setHasWebsite(d?.type === "CONTRACT" ? websiteEnabled : false);

        // ✅ récupérer une "website line" (priorité à d.website.line)
        let wLine = null;

        if (d?.website?.line) {
          const unit = toSafeNumber(d.website.line.unitPrice, 0);
          const offeredUi = Boolean(d.website.line.offered);

          wLine = {
            label: d.website.line.label || "Site vitrine",
            qty: 1,
            unitPrice: offeredUi ? "" : unit > 0 ? unit : "",
            offered: offeredUi,
            _lastPaidUnitPrice: unit > 0 ? unit : 0,
          };
        } else {
          // ancien: website.* label
          const legacyUnit = d?.website?.offered
            ? 0
            : parseOldPriceLabelToNumber(d?.website?.priceLabel || "");

          const legacyLineFromLines = (d?.lines || []).find((l) =>
            /site\s*vitrine/i.test(l?.label || ""),
          );

          if (legacyLineFromLines) {
            const unit = toSafeNumber(legacyLineFromLines.unitPrice, 0);
            const offeredUi = Boolean(legacyLineFromLines.offered);

            wLine = {
              label: legacyLineFromLines.label || "Site vitrine",
              qty: 1,
              unitPrice: offeredUi ? "" : unit > 0 ? unit : "",
              offered: offeredUi,
              _lastPaidUnitPrice: unit > 0 ? unit : 0,
            };
          } else if (websiteEnabled) {
            const offeredUi = Boolean(d?.website?.offered);
            wLine = {
              label: "Site vitrine",
              qty: 1,
              unitPrice: offeredUi ? "" : legacyUnit > 0 ? legacyUnit : "",
              offered: offeredUi,
              _lastPaidUnitPrice: legacyUnit > 0 ? legacyUnit : 0,
            };
          }
        }

        if (wLine) setWebsiteLine(wLine);

        // ✅ payment split
        setSitePaymentSplit(Number(d?.website?.paymentSplit || 1));

        // remise
        setDiscountLabel(d?.totals?.discountLabel || "");
        setDiscountAmount(
          toSafeNumber(d?.totals?.discountAmount, 0) > 0
            ? toSafeNumber(d?.totals?.discountAmount, 0)
            : "",
        );

        const subPrice =
          d?.subscription?.priceMonthly ??
          (d?.subscriptionLabel
            ? parseOldPriceLabelToNumber(d.subscriptionLabel)
            : 0);

        setSubscriptionPriceMonthly(subPrice > 0 ? subPrice : "");
        setEngagementMonths(clampMin(d?.engagementMonths ?? 12, 1));

        setModules(
          d?.modules && d.modules.length > 0
            ? d.modules.map((m) => {
                const pm = toSafeNumber(m.priceMonthly, 0);
                const offeredUi = Boolean(m.offered);
                return {
                  name: m.name || "",
                  offered: offeredUi,
                  priceMonthly: offeredUi ? "" : pm > 0 ? pm : "",
                  _lastPaidPriceMonthly: pm > 0 ? pm : 0,
                };
              })
            : [
                {
                  name: "",
                  offered: false,
                  priceMonthly: "",
                  _lastPaidPriceMonthly: 0,
                },
              ],
        );

        setComments(d?.comments || "");
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

  const isLocked = doc?.status === "SENT" || doc?.status === "SIGNED";
  const canResend = doc?.status === "SENT";
  const sendBtnLabel = canResend ? "Renvoyer" : "Envoyer";
  const isDiscountActive = clampMin(discountAmount, 0) > 0;

  function addLine() {
    setLines((prev) => [
      ...(prev || []),
      {
        label: "",
        qty: 1,
        unitPrice: "",
        offered: false,
        _lastPaidUnitPrice: 0,
      },
    ]);
  }
  function removeLine(i) {
    setLines((prev) => (prev || []).filter((_, idx) => idx !== i));
  }

  /**
   * ✅ Update line classique
   * - "Offert" UI = checkbox uniquement
   * - unitPrice peut être "" (affiche "-")
   * - pas de bascule auto en "Offert" quand le prix passe à 0
   * - clamp prix >= 0
   */
  function updateLine(i, patch) {
    setLines((prev) =>
      (prev || []).map((l, idx) => {
        if (idx !== i) return l;

        const next = { ...l, ...patch };

        // qty >= 1
        if ("qty" in patch) {
          const q = patch.qty === "" ? "" : clampMin(patch.qty, 1);
          next.qty = q === "" ? "" : q;
        } else {
          next.qty = clampMin(next.qty, 1);
        }

        // unitPrice >= 0 (mais peut être "")
        if ("unitPrice" in patch) {
          if (patch.unitPrice === "") {
            next.unitPrice = "";
          } else {
            const up = clampMin(patch.unitPrice, 0);
            next.unitPrice = up;
            if (up > 0) next._lastPaidUnitPrice = up;
          }
        }

        // toggle offered
        if (patch?.offered === true) {
          next.offered = true;
          // quand on coche offert, on force à 0 en data (mais on affichera "-" via value "")
          next.unitPrice = 0;
        }
        if (patch?.offered === false) {
          next.offered = false;
          // si on décoches offert, on restaure un prix payant s'il existe sinon "-"
          const restore = toSafeNumber(next._lastPaidUnitPrice, 0);
          next.unitPrice = restore > 0 ? restore : "";
        }

        return {
          ...next,
          label: next.label ?? "",
          offered: Boolean(next.offered),
        };
      }),
    );
  }

  /**
   * ✅ Update site internet
   * - qty forcée à 1
   * - "Offert" UI = checkbox uniquement
   * - clamp prix >= 0
   */
  function updateWebsiteLine(patch) {
    setWebsiteLine((prev) => {
      const next = { ...prev, ...patch };

      // force qty = 1
      next.qty = 1;

      if ("unitPrice" in patch) {
        if (patch.unitPrice === "") {
          next.unitPrice = "";
        } else {
          const up = clampMin(patch.unitPrice, 0);
          next.unitPrice = up;
          if (up > 0) next._lastPaidUnitPrice = up;
        }
      }

      if (patch?.offered === true) {
        next.offered = true;
        next.unitPrice = 0;
      }
      if (patch?.offered === false) {
        next.offered = false;
        const restore = toSafeNumber(next._lastPaidUnitPrice, 0);
        next.unitPrice = restore > 0 ? restore : "";
      }

      return {
        ...next,
        offered: Boolean(next.offered),
      };
    });
  }

  function addModule() {
    setModules((prev) => [
      ...(prev || []),
      { name: "", offered: false, priceMonthly: "", _lastPaidPriceMonthly: 0 },
    ]);
  }
  function removeModule(i) {
    setModules((prev) => (prev || []).filter((_, idx) => idx !== i));
  }

  /**
   * ✅ Update module
   * - "Offert" UI = checkbox uniquement
   * - priceMonthly peut être "" (affiche "-")
   * - clamp prix >= 0
   */
  function updateModule(i, patch) {
    setModules((prev) =>
      (prev || []).map((m, idx) => {
        if (idx !== i) return m;

        const next = { ...m, ...patch };

        if ("priceMonthly" in patch) {
          if (patch.priceMonthly === "") {
            next.priceMonthly = "";
          } else {
            const pm = clampMin(patch.priceMonthly, 0);
            next.priceMonthly = pm;
            if (pm > 0) next._lastPaidPriceMonthly = pm;
          }
        }

        if (patch?.offered === true) {
          next.offered = true;
          next.priceMonthly = 0;
        }
        if (patch?.offered === false) {
          next.offered = false;
          const restore = toSafeNumber(next._lastPaidPriceMonthly, 0);
          next.priceMonthly = restore > 0 ? restore : "";
        }

        return {
          ...next,
          offered: Boolean(next.offered),
        };
      }),
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
      // ✅ normalisation lignes avant payload (SEULEMENT ICI on transforme prix=0 => offert)
      const normalizedClassicLines = (lines || []).map((l) => {
        const offeredEffective = normalizeOfferedForSave(
          l.offered,
          l.unitPrice,
        );
        return {
          label: trimText(l.label),
          qty: clampMin(l.qty, 1),
          unitPrice: offeredEffective ? 0 : clampMin(l.unitPrice, 0),
          offered: offeredEffective,
          kind: "NORMAL",
        };
      });

      const normalizedWebsiteLine = (() => {
        const offeredEffective = normalizeOfferedForSave(
          websiteLine.offered,
          websiteLine.unitPrice,
        );
        return {
          label: trimText(websiteLine.label || "Site vitrine"),
          qty: 1,
          unitPrice: offeredEffective ? 0 : clampMin(websiteLine.unitPrice, 0),
          offered: offeredEffective,
          kind: "WEBSITE",
        };
      })();

      const payload = {
        party: {
          restaurantName: trimText(party.restaurantName),
          address: trimText(party.address),
          ownerName: trimText(party.ownerName),
          email: trimText(party.email).toLowerCase(),
          phone: trimText(party.phone).replace(/\s+/g, ""),
        },
      };

      if (issueDate) payload.issueDate = new Date(issueDate).toISOString();
      if (dueDate) payload.dueDate = new Date(dueDate).toISOString();

      payload.lines =
        hasWebsite && doc?.type === "CONTRACT"
          ? [...normalizedClassicLines, normalizedWebsiteLine]
          : normalizedClassicLines;

      // ✅ abonnement + modules (numeric)
      payload.subscription = {
        priceMonthly: clampMin(subscriptionPriceMonthly, 0),
      };
      payload.engagementMonths = clampMin(engagementMonths, 1);

      payload.modules = (modules || [])
        .filter((m) => trimText(m.name))
        .map((m) => {
          const offeredEffective = normalizeOfferedForSave(
            m.offered,
            m.priceMonthly,
          );
          return {
            name: trimText(m.name),
            offered: offeredEffective,
            priceMonthly: offeredEffective ? 0 : clampMin(m.priceMonthly, 0),
          };
        });

      // Remise uniquement devis/facture
      if (isQuoteOrInvoice(doc.type)) {
        payload.totals = {
          discountLabel: trimText(discountLabel),
          discountAmount: clampMin(discountAmount, 0),
        };
        payload.comments = trimText(comments);
      }

      // ✅ CONTRAT: website meta + line
      if (doc.type === "CONTRACT") {
        payload.website = {
          enabled: Boolean(hasWebsite),
          paymentSplit: Number(sitePaymentSplit || 1),
          line: hasWebsite ? normalizedWebsiteLine : null,
          offered: hasWebsite ? normalizedWebsiteLine.offered : false,
          priceLabel: hasWebsite
            ? normalizedWebsiteLine.offered
              ? "Offert"
              : `${clampMin(normalizedWebsiteLine.unitPrice, 0)}€`
            : "",
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

        if (idx === -1) return [data.document, ...list];

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

    const popup = window.open("about:blank", "_blank");

    setPdfLoading(true);
    setErrorMsg("");

    try {
      const res = await axios.get(
        `${process.env.NEXT_PUBLIC_API_URL}/admin/documents/${doc._id}/pdf/preview`,
        { ...axiosCfg(), responseType: "blob" },
      );

      const file = new Blob([res.data], { type: "application/pdf" });
      const url = window.URL.createObjectURL(file);

      if (popup) popup.location.href = url;
      else window.location.href = url;

      setTimeout(() => window.URL.revokeObjectURL(url), 60_000);
    } catch (err) {
      console.error(err);
      try {
        popup?.close?.();
      } catch {}
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

      setDoc((prev) => ({
        ...(prev || {}),
        status: data.status || prev?.status,
        pdf: data.pdf || prev?.pdf,
        sentAt: data.sentAt || new Date().toISOString(),
      }));

      adminContext?.setDocumentsList?.((prev) =>
        (prev || []).map((d) =>
          d._id === doc._id
            ? {
                ...d,
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
              <Eye className="size-4 text-darkBlue/60" />
            )}
            PDF
          </button>

          {doc?.type !== "CONTRACT" ? (
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
          ) : null}

          {doc?.type === "CONTRACT" && doc?.status !== "SIGNED" && (
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
                    onBlur={(e) =>
                      setParty((p) => ({
                        ...p,
                        restaurantName: trimText(e.target.value),
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
                    onBlur={(e) =>
                      setParty((p) => ({
                        ...p,
                        ownerName: trimText(e.target.value),
                      }))
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
                    onBlur={(e) =>
                      setParty((p) => ({
                        ...p,
                        email: trimText(e.target.value).toLowerCase(),
                      }))
                    }
                    className="rounded-xl border border-darkBlue/10 bg-white px-3 py-2 text-sm"
                    placeholder="Email"
                    type="email"
                    inputMode="email"
                    autoComplete="email"
                  />
                  <input
                    value={party.phone}
                    disabled={isLocked}
                    onChange={(e) =>
                      setParty((p) => ({ ...p, phone: e.target.value }))
                    }
                    onBlur={(e) =>
                      setParty((p) => ({
                        ...p,
                        phone: trimText(e.target.value),
                      }))
                    }
                    className="rounded-xl border border-darkBlue/10 bg-white px-3 py-2 text-sm"
                    placeholder="Téléphone"
                    type="tel"
                    inputMode="tel"
                    autoComplete="tel"
                  />
                  <input
                    value={party.address}
                    disabled={isLocked}
                    onChange={(e) =>
                      setParty((p) => ({ ...p, address: e.target.value }))
                    }
                    onBlur={(e) =>
                      setParty((p) => ({
                        ...p,
                        address: trimText(e.target.value),
                      }))
                    }
                    className="rounded-xl border border-darkBlue/10 bg-white px-3 py-2 text-sm midTablet:col-span-2"
                    placeholder="Adresse"
                  />
                </div>
              </div>

              {/* Dates + détails */}
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

                {/* ✅ BLOC SITE INTERNET (CONTRAT UNIQUEMENT) */}
                {doc?.type === "CONTRACT" ? (
                  <div className="mt-6 rounded-xl border border-darkBlue/10 bg-white p-3">
                    <div className="flex items-center justify-between gap-3">
                      <p className="text-sm font-semibold text-darkBlue">
                        Site internet
                      </p>

                      <label className="inline-flex items-center gap-2 rounded-xl border border-darkBlue/10 bg-white px-3 py-2 text-sm text-darkBlue/80">
                        <input
                          type="checkbox"
                          disabled={isLocked}
                          checked={hasWebsite}
                          onChange={(e) => {
                            const checked = e.target.checked;
                            setHasWebsite(checked);
                            if (checked) {
                              setWebsiteLine((prev) => ({
                                ...prev,
                                label: prev?.label || "Site vitrine",
                                qty: 1,
                                unitPrice: prev?.unitPrice ?? "",
                                offered: Boolean(prev?.offered),
                                _lastPaidUnitPrice: toSafeNumber(
                                  prev?._lastPaidUnitPrice,
                                  0,
                                ),
                              }));
                            }
                          }}
                        />
                        Activer
                      </label>
                    </div>

                    {hasWebsite ? (
                      <>
                        <div className="hidden midTablet:grid mt-3 grid-cols-[1fr_110px_140px] gap-2 px-1">
                          <p className="text-xs text-darkBlue/60 font-semibold">
                            Description
                          </p>
                          <p className="text-xs text-darkBlue/60 font-semibold">
                            Offert
                          </p>
                          <p className="text-xs text-darkBlue/60 font-semibold">
                            Prix (€)
                          </p>
                        </div>

                        <div className="mt-2 grid grid-cols-1 midTablet:grid-cols-[1fr_110px_140px] gap-2">
                          <input
                            value={websiteLine.label}
                            disabled={isLocked}
                            onChange={(e) =>
                              updateWebsiteLine({ label: e.target.value })
                            }
                            onBlur={(e) =>
                              updateWebsiteLine({
                                label: trimText(e.target.value),
                              })
                            }
                            className="rounded-xl border border-darkBlue/10 bg-white px-3 py-2 text-sm"
                            placeholder="Description"
                          />

                          <label className="inline-flex items-center justify-center gap-2 rounded-xl border border-darkBlue/10 bg-white px-3 py-2 text-sm text-darkBlue/80">
                            <input
                              type="checkbox"
                              disabled={isLocked}
                              checked={websiteOfferedUi}
                              onChange={(e) =>
                                updateWebsiteLine({
                                  offered: e.target.checked,
                                })
                              }
                            />
                            Offert
                          </label>

                          <input
                            type="number"
                            min="0"
                            step="0.01"
                            onWheel={preventWheelChange}
                            disabled={isLocked || websiteOfferedUi}
                            value={
                              websiteOfferedUi
                                ? ""
                                : (websiteLine.unitPrice ?? "")
                            }
                            onChange={(e) =>
                              updateWebsiteLine({
                                unitPrice: toNumberOrEmpty(e.target.value),
                              })
                            }
                            className="rounded-xl border border-darkBlue/10 bg-white px-3 py-2 text-sm"
                            placeholder="-"
                          />
                        </div>

                        {/* ✅ Options de paiement : seulement si pas offert (UI) */}
                        {!websiteOfferedUi ? (
                          <div className="mt-3 rounded-xl border border-darkBlue/10 bg-white p-3">
                            <p className="text-sm font-semibold text-darkBlue">
                              Options de paiement (site internet)
                            </p>
                            <div className="mt-2 flex flex-col gap-1">
                              <label className="text-xs text-darkBlue/60">
                                Paiement
                              </label>
                              <select
                                disabled={isLocked}
                                value={sitePaymentSplit}
                                onChange={(e) =>
                                  setSitePaymentSplit(Number(e.target.value))
                                }
                                className="rounded-xl border border-darkBlue/10 bg-white px-3 py-2 text-sm"
                              >
                                <option value={1}>Paiement en 1 fois</option>
                                <option value={2}>Paiement en 2 fois</option>
                                <option value={3}>Paiement en 3 fois</option>
                              </select>
                              
                            </div>
                          </div>
                        ) : null}
                      </>
                    ) : null}
                  </div>
                ) : null}

                {/* ✅ Lignes classiques */}
                <div className="mt-6 rounded-xl border border-darkBlue/10 bg-white p-3">
                  <div className="flex items-center justify-between gap-3">
                    <p className="text-sm font-semibold text-darkBlue">
                      Autre
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
                    {lines.map((l, i) => {
                      const offeredUi = Boolean(l.offered);

                      return (
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
                            onBlur={(e) =>
                              updateLine(i, { label: trimText(e.target.value) })
                            }
                            className="rounded-xl border border-darkBlue/10 bg-white px-3 py-2 text-sm"
                            placeholder="Description"
                          />

                          <input
                            type="number"
                            min="1"
                            onWheel={preventWheelChange}
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
                              checked={offeredUi}
                              onChange={(e) =>
                                updateLine(i, {
                                  offered: e.target.checked,
                                })
                              }
                            />
                            Offert
                          </label>

                          <input
                            type="number"
                            min="0"
                            step="0.01"
                            onWheel={preventWheelChange}
                            disabled={isLocked || offeredUi}
                            value={offeredUi ? "" : (l.unitPrice ?? "")}
                            onChange={(e) =>
                              updateLine(i, {
                                unitPrice: toNumberOrEmpty(e.target.value),
                              })
                            }
                            className="rounded-xl border border-darkBlue/10 bg-white px-3 py-2 text-sm"
                            placeholder="-"
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
                      );
                    })}
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
                              onBlur={(e) =>
                                setDiscountLabel(trimText(e.target.value))
                              }
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
                              min="0"
                              step="0.01"
                              disabled={isLocked}
                              value={discountAmount ?? ""}
                              onWheel={preventWheelChange}
                              onChange={(e) =>
                                setDiscountAmount(
                                  toNumberOrEmpty(e.target.value),
                                )
                              }
                              className="rounded-xl border border-darkBlue/10 bg-white px-3 py-2 text-sm"
                              placeholder="-"
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

                {/* ✅ Abonnement + Modules */}
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
                        <div className="flex flex-col gap-1">
                          <label className="text-xs text-darkBlue/60">
                            Prix / mois (€)
                          </label>
                          <input
                            type="number"
                            min="0"
                            step="0.01"
                            onWheel={preventWheelChange}
                            disabled={isLocked}
                            value={subscriptionPriceMonthly ?? ""}
                            onChange={(e) =>
                              setSubscriptionPriceMonthly(
                                toNumberOrEmpty(e.target.value),
                              )
                            }
                            className="w-full rounded-xl border border-darkBlue/10 bg-white px-3 py-2 text-sm"
                            placeholder="-"
                          />
                        </div>
                      </div>

                      <p className="text-sm font-semibold text-darkBlue mt-3">
                        Engagement (mois)
                      </p>
                      <input
                        type="number"
                        min="1"
                        onWheel={preventWheelChange}
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
                        {modules.map((m, i) => {
                          const offeredUi = Boolean(m.offered);

                          return (
                            <div key={i} className="flex items-end gap-2">
                              <input
                                value={m.name}
                                disabled={isLocked}
                                onChange={(e) =>
                                  updateModule(i, { name: e.target.value })
                                }
                                onBlur={(e) =>
                                  updateModule(i, {
                                    name: trimText(e.target.value),
                                  })
                                }
                                className="rounded-xl border border-darkBlue/10 bg-white px-3 py-2 text-sm w-full"
                                placeholder="Nom du module"
                              />

                              <label className="inline-flex items-center justify-center gap-2 rounded-xl border border-darkBlue/10 bg-white px-3 py-2 text-sm text-darkBlue/80">
                                <input
                                  type="checkbox"
                                  disabled={isLocked}
                                  checked={offeredUi}
                                  onChange={(e) =>
                                    updateModule(i, {
                                      offered: e.target.checked,
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
                                  min="0"
                                  step="0.01"
                                  onWheel={preventWheelChange}
                                  value={
                                    offeredUi ? "" : (m.priceMonthly ?? "")
                                  }
                                  onChange={(e) =>
                                    updateModule(i, {
                                      priceMonthly: toNumberOrEmpty(
                                        e.target.value,
                                      ),
                                    })
                                  }
                                  className="rounded-xl border border-darkBlue/10 bg-white px-3 py-2 text-sm w-[100px]"
                                  placeholder="-"
                                  disabled={offeredUi || isLocked}
                                />
                              </div>

                              <button
                                onClick={() => removeModule(i)}
                                disabled={modules.length === 1 || isLocked}
                                className="inline-flex items-center px-3 h-[38px] justify-center rounded-xl border border-red/20 bg-red/10 hover:bg-red/15 transition disabled:opacity-60"
                                title="Supprimer"
                              >
                                <Trash2 className="size-4 text-red" />
                              </button>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  </div>
                </div>

                {isQuoteOrInvoice(doc?.type) ? (
                  <div className="mt-6 rounded-xl border border-darkBlue/10 bg-white p-3">
                    <p className="text-sm font-semibold text-darkBlue">
                      Commentaires
                    </p>

                    <textarea
                      value={comments}
                      disabled={isLocked}
                      onChange={(e) => setComments(e.target.value)}
                      onBlur={(e) => setComments(trimText(e.target.value))}
                      rows={5}
                      className="mt-2 resize-none w-full rounded-xl border border-darkBlue/10 bg-white px-3 py-2 text-sm"
                      placeholder="Ex: Conditions de paiement, précisions sur la prestation, mention particulière…"
                    />
                  </div>
                ) : null}
              </div>
            </>
          )}
        </div>
      </div>

      {/* ✅ MODALE CONFIRMATION ENVOI */}
      {doc?.type !== "CONTRACT" && confirmSendOpen ? (
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
                ? "Le renvoi va générer le PDF puis renvoyer le document au client."
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
