import { useMemo, useState } from "react";
import { useRouter } from "next/router";
import axios from "axios";
import SimpleSkeletonComponent from "@/components/_shared/skeleton/simple-skeleton.component";
import DoubleSkeletonComponent from "@/components/_shared/skeleton/double-skeleton.component";
import PageHeaderAdminComponent from "../_shared/page-header.admin.component";

import {
  Plus,
  Trash2,
  Loader2,
  AlertTriangle,
  FileText,
  PenSquare,
  Eye,
  FileSignature,
  FileDown,
  RefreshCw,
  Search,
  X,
} from "lucide-react";

function normalizeSearchValue(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

function formatType(type, contractKind) {
  if (type === "QUOTE") return "Devis";
  if (type === "INVOICE") return "Facture";
  if (type === "CONTRACT" && contractKind === "AMENDMENT") return "Avenant";
  if (type === "CONTRACT") return "Contrat";
  return "Document";
}

function statusBadge(status, type, signatureRequest, invoice) {
  if (invoice?.cancelledAt) return { label: "Annulée", className: "bg-darkBlue/5 text-darkBlue/70" };
  if (invoice?.paidAt) return { label: "Payée", className: "bg-green/10 text-green-700" };
  switch (status) {
    case "DRAFT":
      return {
        label: "Brouillon",
        className: "bg-darkBlue/5 text-darkBlue/70",
      };
    case "SENT":
      return {
        label:
          type === "CONTRACT" &&
          signatureRequest?.expiresAt &&
          new Date(signatureRequest.expiresAt).getTime() <= Date.now()
            ? "Lien expiré"
            : type === "INVOICE" ? "Envoyée" : "Envoyé",
        className: "bg-blue/10 text-blue",
      };
    case "SIGNED":
      return { label: "Signé", className: "bg-green/10 text-green-700" };
    case "ACCEPTED":
      return {
        label: "Signé",
        className: "bg-green/10 text-green-700",
      };
    default:
      return {
        label: status || "—",
        className: "bg-darkBlue/5 text-darkBlue/70",
      };
  }
}

export default function ListDocumentsAdminComponent(props) {
  const router = useRouter();

  const [docToDelete, setDocToDelete] = useState(null);
  const [loadingDeleteId, setLoadingDeleteId] = useState(null);

  const [loadingPreviewId, setLoadingPreviewId] = useState(null);
  const [loadingSendId, setLoadingSendId] = useState(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [typeFilter, setTypeFilter] = useState("ALL");
  const [statusFilter, setStatusFilter] = useState("ALL");

  const documents = useMemo(() => props.documents || [], [props.documents]);
  const filteredDocuments = useMemo(() => {
    const normalizedSearch = normalizeSearchValue(searchTerm);

    return documents.filter((doc) => {
      if (typeFilter !== "ALL" && doc?.type !== typeFilter) return false;
      const status = doc.setupInvoice?.cancelledAt ? "CANCELLED" : doc.setupInvoice?.paidAt ? "PAID" : doc.status;
      if (statusFilter !== "ALL" && status !== statusFilter) return false;
      if (!normalizedSearch) return true;

      const searchableValues = [
        doc?.docNumber,
        doc?.party?.restaurantName,
        doc?.restaurantName,
        doc?.party?.ownerName,
        doc?.party?.email,
        doc?.email,
        doc?.party?.phone,
      ];

      return searchableValues.some((value) =>
        normalizeSearchValue(value).includes(normalizedSearch),
      );
    });
  }, [documents, searchTerm, statusFilter, typeFilter]);
  const hasActiveFilters =
    Boolean(searchTerm.trim()) ||
    typeFilter !== "ALL" ||
    statusFilter !== "ALL";

  function clearFilters() {
    setSearchTerm("");
    setTypeFilter("ALL");
    setStatusFilter("ALL");
  }

  function getAuthConfigOrRedirect() {
    const token =
      typeof window !== "undefined"
        ? localStorage.getItem("admin-token")
        : null;

    if (!token) {
      router.push("/dashboard/admin/login");
      return null;
    }

    return {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    };
  }

  async function confirmDelete(documentId) {
    const config = getAuthConfigOrRedirect();
    if (!config) return;

    setLoadingDeleteId(documentId);
    try {
      await axios.delete(
        `${process.env.NEXT_PUBLIC_API_URL}/admin/documents/${documentId}`,
        config,
      );

      props.setDocuments?.((prev) =>
        (prev || []).filter((d) => d._id !== documentId),
      );

      setDocToDelete(null);
    } catch (error) {
      console.error("Erreur lors de la suppression du document:", error);
      if (error?.response?.status === 403) {
        localStorage.removeItem("admin-token");
        router.push("/dashboard/admin/login");
      }
    } finally {
      setLoadingDeleteId(null);
    }
  }

  // ✅ PDF PREVIEW (comme Details) -> ouvre un onglet, sans enregistrer en BDD/Cloudinary
  async function previewPdf(documentId) {
    const config = getAuthConfigOrRedirect();
    if (!config) return;

    // ✅ pré-ouvrir direct au clic
    const popup = window.open("about:blank", "_blank");

    setLoadingPreviewId(documentId);
    try {
      const res = await axios.get(
        `${process.env.NEXT_PUBLIC_API_URL}/admin/documents/${documentId}/pdf/preview`,
        { ...config, responseType: "blob" },
      );

      const file = new Blob([res.data], { type: "application/pdf" });
      const url = window.URL.createObjectURL(file);

      if (popup) popup.location.href = url;
      else window.location.href = url;

      setTimeout(() => window.URL.revokeObjectURL(url), 60_000);
    } catch (error) {
      console.error("Erreur lors du preview PDF:", error);
      try {
        popup?.close?.();
      } catch {}

      if (error?.response?.status === 403) {
        localStorage.removeItem("admin-token");
        router.push("/dashboard/admin/login");
      }
    } finally {
      setLoadingPreviewId(null);
    }
  }

  // ✅ Renvoi uniquement quand status === SENT
  async function resendDocument(document) {
    const config = getAuthConfigOrRedirect();
    if (!config) return;

    const documentId = document._id;
    setLoadingSendId(documentId);
    try {
      const endpoint =
        document.type === "CONTRACT"
          ? `${process.env.NEXT_PUBLIC_API_URL}/admin/documents/${documentId}/signature-request/resend`
          : `${process.env.NEXT_PUBLIC_API_URL}/admin/documents/${documentId}/resend`;
      const { data } = await axios.post(endpoint, {}, config);

      props.setDocuments?.((prev) =>
        (prev || []).map((d) =>
          d._id === documentId
            ? {
                ...d,
                ...(data.document || {}),
                status: data.status || data.document?.status || d.status,
                pdf: data.pdf || data.document?.pdf || d.pdf,
                sentAt:
                  data.sentAt ||
                  data.document?.sentAt ||
                  new Date().toISOString(),
              }
            : d,
        ),
      );
    } catch (error) {
      console.error("Erreur lors du renvoi email:", error);
      if (error?.response?.status === 403) {
        localStorage.removeItem("admin-token");
        router.push("/dashboard/admin/login");
      }
    } finally {
      setLoadingSendId(null);
    }
  }

  function goToCreate() {
    router.push("/dashboard/admin/documents/add");
  }

  function goToEdit(doc) {
    router.push(`/dashboard/admin/documents/add/${doc._id}`);
  }

  function goToSign(doc) {
    router.push(`/dashboard/admin/documents/add/${doc._id}/sign`);
  }

  return (
    <section className="flex flex-col gap-4">
      <PageHeaderAdminComponent
        title="Création documents"
        subtitle={
          hasActiveFilters
            ? `${filteredDocuments.length} sur ${documents.length} documents`
            : `${documents.length} ${
                documents.length > 1 ? "documents" : "document"
              }`
        }
        action={
          <button
            onClick={goToCreate}
            className="inline-flex size-11 items-center justify-center rounded-2xl border border-blue/10 bg-[linear-gradient(180deg,#5F94FF_0%,#3978FF_100%)] text-white shadow-[0_14px_30px_rgba(57,120,255,0.22)] transition hover:scale-[1.01] hover:shadow-[0_18px_34px_rgba(57,120,255,0.28)] active:scale-[0.98]"
          >
            <Plus className="size-4" />
          </button>
        }
      />

      {!props?.loading && documents.length > 0 ? (
        <div className="flex flex-col gap-2 rounded-2xl border border-darkBlue/10 bg-white/50 p-3 shadow-sm midTablet:flex-row midTablet:items-center">
          <div className="relative min-w-0 flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-darkBlue/40" />
            <input
              type="search"
              value={searchTerm}
              onChange={(event) => setSearchTerm(event.target.value)}
              placeholder="Rechercher par numéro, restaurant, contact…"
              aria-label="Rechercher un document"
              className="h-11 w-full rounded-xl border border-darkBlue/10 bg-white py-2 pl-10 pr-10 text-sm text-darkBlue outline-none transition placeholder:text-darkBlue/40 focus:border-blue/50 focus:ring-2 focus:ring-blue/20"
            />
            {searchTerm ? (
              <button
                type="button"
                onClick={() => setSearchTerm("")}
                className="absolute right-3 top-1/2 inline-flex size-6 -translate-y-1/2 items-center justify-center rounded-lg text-darkBlue/45 transition hover:bg-darkBlue/5 hover:text-darkBlue"
                aria-label="Effacer la recherche"
              >
                <X className="size-4" />
              </button>
            ) : null}
          </div>

          <select
            value={typeFilter}
            onChange={(event) => setTypeFilter(event.target.value)}
            aria-label="Filtrer par type de document"
            className="h-11 rounded-xl border border-darkBlue/10 bg-white px-3 text-sm text-darkBlue outline-none transition focus:border-blue/50 focus:ring-2 focus:ring-blue/20"
          >
            <option value="ALL">Tous les types</option>
            <option value="QUOTE">Devis</option>
            <option value="INVOICE">Factures</option>
            <option value="CONTRACT">Contrats</option>
          </select>

          <select
            value={statusFilter}
            onChange={(event) => setStatusFilter(event.target.value)}
            aria-label="Filtrer par statut du document"
            className="h-11 rounded-xl border border-darkBlue/10 bg-white px-3 text-sm text-darkBlue outline-none transition focus:border-blue/50 focus:ring-2 focus:ring-blue/20"
          >
            <option value="ALL">Tous les statuts</option>
            <option value="DRAFT">Brouillons</option>
            <option value="SENT">Envoyés</option>
            <option value="SIGNED">Signés</option>
            <option value="ACCEPTED">Acceptés électroniquement</option>
            <option value="PAID">Factures payées</option>
            <option value="CANCELLED">Factures annulées</option>
          </select>
        </div>
      ) : null}

      {/* Content */}
      <div>
        {props?.loading ? (
          <div className="rounded-2xl bg-white/50 border border-darkBlue/10 shadow-sm p-5 flex flex-col gap-3">
            <DoubleSkeletonComponent justify="justify-start" />
            <SimpleSkeletonComponent />
            <SimpleSkeletonComponent />
          </div>
        ) : documents?.length === 0 ? (
          <div className="rounded-xl bg-white/50 border border-darkBlue/10 shadow-sm p-6 text-center">
            <div className="mx-auto mb-3 size-11 rounded-2xl bg-darkBlue/5 flex items-center justify-center">
              <AlertTriangle className="size-5 text-darkBlue/60" />
            </div>
            <p className="text-sm text-darkBlue/70">
              Aucun document pour le moment.
            </p>
          </div>
        ) : filteredDocuments.length === 0 ? (
          <div className="rounded-xl border border-darkBlue/10 bg-white/50 p-6 text-center shadow-sm">
            <div className="mx-auto mb-3 flex size-11 items-center justify-center rounded-2xl bg-darkBlue/5">
              <Search className="size-5 text-darkBlue/60" />
            </div>
            <p className="text-sm text-darkBlue/70">
              Aucun document ne correspond à ces critères.
            </p>
            <button
              type="button"
              onClick={clearFilters}
              className="mt-3 text-sm font-semibold text-blue hover:underline"
            >
              Réinitialiser les filtres
            </button>
          </div>
        ) : (
          <div className="overflow-hidden rounded-2xl border border-darkBlue/10 bg-white/75 shadow-sm">
          <table className="block w-full text-left text-sm tablet:table tablet:table-fixed">
            <thead className="sr-only bg-lightGrey/65 text-xs font-semibold text-darkBlue/75 tablet:not-sr-only tablet:table-header-group">
              <tr>
                <th scope="col" className="w-[24%] px-4 py-3">Document</th>
                <th scope="col" className="w-[25%] px-4 py-3">Restaurant et contact</th>
                <th scope="col" className="w-[13%] px-4 py-3">Statut</th>
                <th scope="col" className="px-4 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="block divide-y divide-darkBlue/10 tablet:table-row-group">
            {filteredDocuments.map((doc) => {
              const isConfirming = docToDelete === doc._id;

              const isDeleting = loadingDeleteId === doc._id;
              const isPreviewLoading = loadingPreviewId === doc._id;
              const isSendLoading = loadingSendId === doc._id;

              const badge = statusBadge(
                doc.status,
                doc.type,
                doc.signatureRequest,
                doc.setupInvoice,
              );

              const isLegacyPhysicalSent =
                doc.type === "CONTRACT" &&
                doc.status === "SENT" &&
                !doc.signatureRequest?.issuedAt;
              const canSign =
                doc.type === "CONTRACT" &&
                (doc.status === "DRAFT" || isLegacyPhysicalSent);

              const canResend = doc.status === "SENT" && !isLegacyPhysicalSent && !doc.setupInvoice?.cancelledAt;
              const canDelete = doc.status === "DRAFT" ? !doc.commercialDelivery?.state : doc.type !== "CONTRACT" && !doc.offerConditions;

              return (
                <tr
                  key={doc._id}
                  className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-2 px-4 py-3 hover:bg-lightGrey/50 tablet:table-row tablet:[&>td]:border-t tablet:[&>td]:border-darkBlue/10 tablet:[&>td]:px-4 tablet:[&>td]:py-3"
                >
                  <td className="block min-w-0 tablet:table-cell">
                    <button type="button" onClick={() => goToEdit(doc)} className="flex max-w-full items-center gap-2 text-left hover:text-blue">
                      <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-blue/10 text-blue">
                        <FileText className="size-4" aria-hidden="true" />
                      </span>
                      <span className="min-w-0">
                        <span className="block font-semibold">{formatType(doc.type, doc.contractKind)}</span>
                        <span className="block break-words text-xs text-darkBlue/70">{doc.docNumber}</span>
                        {doc.salesOwnerId && <span className="text-xs text-blue">Commercial</span>}
                      </span>
                    </button>
                  </td>
                  <td className="col-span-2 row-start-2 block min-w-0 tablet:table-cell">
                    <span className="block break-words font-medium">{doc.party?.restaurantName || doc.restaurantName || "—"}</span>
                    <span className="block break-words text-xs text-darkBlue/70">{doc.party?.email || doc.email}</span>
                  </td>
                  <td className="col-start-2 row-start-1 block justify-self-end tablet:table-cell">
                    <span className={`inline-block rounded-lg px-2 py-1 text-xs font-semibold ${badge.className}`}>{badge.label}</span>
                  </td>
                  <td className="col-span-2 block min-w-0 tablet:table-cell">
                  <div className="flex flex-wrap items-center gap-2 tablet:justify-end">
                    {!isConfirming && <>

                        <button
                          onClick={() => goToEdit(doc)}
                          className="inline-flex items-center justify-center rounded-xl border border-darkBlue/10 bg-white hover:bg-darkBlue/5 transition p-2"
                          aria-label={
                            doc.status === "DRAFT" ? "Modifier" : "Voir"
                          }
                        >
                          {doc.status === "DRAFT" ? (
                            <PenSquare className="size-4 text-darkBlue/70" />
                          ) : (
                            <Eye className="size-4 text-darkBlue/70" />
                          )}
                        </button>

                        {canDelete ? (
                          <button
                            onClick={() => setDocToDelete(doc._id)}
                            className="inline-flex items-center justify-center rounded-xl border border-red/20 bg-red/10 hover:bg-red/15 transition p-2"
                            aria-label="Supprimer"
                          >
                            <Trash2 className="size-4 text-red" />
                          </button>
                        ) : null}
                    </>}
                    <button
                      onClick={() => previewPdf(doc._id)}
                      disabled={isPreviewLoading}
                      className="inline-flex items-center gap-2 rounded-xl border border-darkBlue/10 bg-white px-3 py-2 text-sm font-semibold text-darkBlue hover:bg-darkBlue/5 transition disabled:opacity-60"
                    >
                      {isPreviewLoading ? (
                        <>
                          <Loader2 className="size-4 animate-spin" />
                          PDF…
                        </>
                      ) : (
                        <>
                          <FileDown className="size-4 text-darkBlue/60" />
                          PDF
                        </>
                      )}
                    </button>

                    {canResend ? (
                      <button
                        onClick={() => resendDocument(doc)}
                        disabled={isSendLoading}
                        className="inline-flex items-center gap-2 rounded-xl border border-darkBlue/10 bg-white px-3 py-2 text-sm font-semibold text-darkBlue hover:bg-darkBlue/5 transition disabled:opacity-60"
                      >
                        {isSendLoading ? (
                          <>
                            <Loader2 className="size-4 animate-spin" />
                            Renvoi…
                          </>
                        ) : (
                          <>
                            <RefreshCw className="size-4 text-darkBlue/60" />
                            {doc.type === "CONTRACT"
                              ? "Remplacer le lien"
                              : "Renvoyer"}
                          </>
                        )}
                      </button>
                    ) : null}

                    {canSign && (
                      <button
                        onClick={() => goToSign(doc)}
                        className="inline-flex items-center gap-2 rounded-xl bg-blue px-3 py-2 text-white text-sm font-semibold shadow-sm hover:bg-blue/90 active:scale-[0.98] transition"
                      >
                        <FileSignature className="size-4" />
                        Signer
                      </button>
                    )}
                  </div>

                  {isConfirming && (
                    <div className="mt-2 rounded-xl border border-red/20 bg-white p-3" role="group" aria-label="Confirmation de suppression">
                      <p className="text-sm font-semibold text-darkBlue">
                        Supprimer ce document ?
                      </p>
                      <p className="text-xs text-darkBlue/60 mt-0.5">
                        Cette action est irréversible.
                      </p>

                      <div className="mt-3 flex gap-2">
                        <button
                          onClick={() => confirmDelete(doc._id)}
                          disabled={isDeleting}
                          className="flex-1 inline-flex items-center justify-center gap-2 rounded-xl bg-red text-white text-sm font-semibold py-1 shadow-sm hover:bg-red/90 disabled:opacity-60"
                        >
                          {isDeleting ? (
                            <>
                              <Loader2 className="size-4 animate-spin" />
                              Suppression…
                            </>
                          ) : (
                            "Confirmer"
                          )}
                        </button>

                        <button
                          onClick={() => setDocToDelete(null)}
                          disabled={isDeleting}
                          className="flex-1 inline-flex items-center justify-center rounded-xl bg-white border border-darkBlue/10 text-darkBlue text-sm font-semibold py-1 hover:bg-darkBlue/5 disabled:opacity-60"
                        >
                          Annuler
                        </button>
                      </div>
                    </div>
                  )}
                  </td>
                </tr>
              );
            })}
            </tbody>
          </table>
          </div>
        )}
      </div>
    </section>
  );
}
