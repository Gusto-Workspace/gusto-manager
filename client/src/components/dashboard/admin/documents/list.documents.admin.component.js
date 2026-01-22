import { useMemo, useState } from "react";
import { useRouter } from "next/router";
import axios from "axios";
import { useTranslation } from "next-i18next";

import SimpleSkeletonComponent from "@/components/_shared/skeleton/simple-skeleton.component";
import DoubleSkeletonComonent from "@/components/_shared/skeleton/double-skeleton.component";

import {
  Plus,
  Trash2,
  Loader2,
  AlertTriangle,
  FileText,
  PenSquare,
  Eye,
  CheckCircle2,
  FileSignature,
  FileDown,
  RefreshCw,
} from "lucide-react";

function formatType(type) {
  if (type === "QUOTE") return "Devis";
  if (type === "INVOICE") return "Facture";
  if (type === "CONTRACT") return "Contrat";
  return "Document";
}

function statusBadge(status) {
  switch (status) {
    case "DRAFT":
      return {
        label: "Brouillon",
        className: "bg-darkBlue/5 text-darkBlue/70",
      };
    case "SENT":
      return { label: "Envoyé", className: "bg-blue/10 text-blue" };
    case "SIGNED":
      return { label: "Signé", className: "bg-green/10 text-green-700" };
    default:
      return {
        label: status || "—",
        className: "bg-darkBlue/5 text-darkBlue/70",
      };
  }
}

export default function ListDocumentsAdminComponent(props) {
  const { t } = useTranslation("admin");
  const router = useRouter();

  const [docToDelete, setDocToDelete] = useState(null);
  const [loadingDeleteId, setLoadingDeleteId] = useState(null);

  const [loadingPreviewId, setLoadingPreviewId] = useState(null);
  const [loadingSendId, setLoadingSendId] = useState(null);

  const documents = useMemo(() => props.documents || [], [props.documents]);

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
  async function resendDocument(documentId) {
    const config = getAuthConfigOrRedirect();
    if (!config) return;

    setLoadingSendId(documentId);
    try {
      const { data } = await axios.post(
        `${process.env.NEXT_PUBLIC_API_URL}/admin/documents/${documentId}/resend`,
        {},
        config,
      );

      props.setDocuments?.((prev) =>
        (prev || []).map((d) =>
          d._id === documentId
            ? {
                ...d,
                status: data.status || d.status,
                pdf: data.pdf || d.pdf,
                sentAt: data.sentAt || new Date().toISOString(),
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
      {/* Header sticky */}
      <div className="sticky top-6 z-20 ml-16 mobile:ml-12 tablet:ml-0 px-4 pt-4 pb-3 bg-white/50 backdrop-blur border-b rounded-xl border-darkBlue/10">
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <h1 className="text-lg font-semibold text-darkBlue truncate">
              Création documents
            </h1>
            <p className="text-xs text-darkBlue/50">
              {documents.length}{" "}
              {documents.length > 1 ? "documents" : "document"}
            </p>
          </div>

          <button
            onClick={goToCreate}
            className="inline-flex items-center gap-2 rounded-xl bg-blue px-3 py-2 text-white text-sm font-semibold shadow-sm hover:bg-blue/90 active:scale-[0.98] transition"
          >
            <Plus className="size-4" />
            <span className="hidden mobile:inline">Créer</span>
          </button>
        </div>
      </div>

      {/* Content */}
      <div>
        {props.loading ? (
          <div className="rounded-2xl bg-white/50 border border-darkBlue/10 shadow-sm p-5 flex flex-col gap-3">
            <DoubleSkeletonComonent justify="justify-start" />
            <SimpleSkeletonComponent />
            <SimpleSkeletonComponent />
          </div>
        ) : documents.length === 0 ? (
          <div className="rounded-xl bg-white/50 border border-darkBlue/10 shadow-sm p-6 text-center">
            <div className="mx-auto mb-3 size-11 rounded-2xl bg-darkBlue/5 flex items-center justify-center">
              <AlertTriangle className="size-5 text-darkBlue/60" />
            </div>
            <p className="text-sm text-darkBlue/70">
              Aucun document pour le moment.
            </p>
          </div>
        ) : (
          <ul className="grid grid-cols-1 gap-3 midTablet:grid-cols-2 desktop:grid-cols-3">
            {documents.map((doc) => {
              const isConfirming = docToDelete === doc._id;

              const isDeleting = loadingDeleteId === doc._id;
              const isPreviewLoading = loadingPreviewId === doc._id;
              const isSendLoading = loadingSendId === doc._id;

              const badge = statusBadge(doc.status);

              const canSign =
                doc.type === "CONTRACT" && doc.status !== "SIGNED";

              const canResend = doc.status === "SENT"; // ✅ uniquement si déjà envoyé

              return (
                <li
                  key={doc._id}
                  className="relative group rounded-xl bg-white/50 border border-darkBlue/10 shadow-sm hover:shadow-md transition-shadow p-4 flex flex-col gap-3 overflow-hidden"
                >
                  {/* Header row */}
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <FileText className="size-4 text-darkBlue/50" />
                        <h2 className="text-base font-semibold text-darkBlue truncate">
                          {formatType(doc.type)}{" "}
                          <span className="text-darkBlue/50 font-medium">
                            {doc.docNumber ? `• ${doc.docNumber}` : ""}
                          </span>
                        </h2>
                      </div>

                      <p className="mt-0.5 text-xs text-darkBlue/70 truncate">
                        {doc.party?.restaurantName || doc.restaurantName || "—"}
                        {doc.party?.email || doc.email
                          ? ` • ${doc.party?.email || doc.email}`
                          : ""}
                      </p>
                    </div>

                    {!isConfirming && (
                      <div className="flex items-center gap-2">
                        <span
                          className={`px-2 py-1 rounded-lg text-xs font-semibold ${badge.className}`}
                        >
                          {badge.label}
                        </span>

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

                        <button
                          onClick={() => setDocToDelete(doc._id)}
                          className="inline-flex items-center justify-center rounded-xl border border-red/20 bg-red/10 hover:bg-red/15 transition p-2"
                          aria-label="Supprimer"
                        >
                          <Trash2 className="size-4 text-red" />
                        </button>
                      </div>
                    )}
                  </div>

                  {/* Quick actions */}
                  <div className="flex flex-wrap gap-2">
                    {/* ✅ PDF = preview (sans save) */}
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

                    {/* ✅ Pas de bouton Envoyer quand DRAFT */}
                    {canResend ? (
                      <button
                        onClick={() => resendDocument(doc._id)}
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
                            Renvoyer
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

                  {/* Overlay confirmation delete */}
                  <div
                    className={`
                      absolute inset-0 z-10 transition-opacity duration-200
                      ${
                        isConfirming
                          ? "opacity-100 pointer-events-auto"
                          : "opacity-0 pointer-events-none"
                      }
                    `}
                    onClick={() => {
                      if (!isDeleting) setDocToDelete(null);
                    }}
                  >
                    <div className="absolute inset-0 bg-white/70 backdrop-blur-sm" />

                    <div
                      className="absolute left-2 right-2 bottom-2 top-2 rounded-xl border border-red/20 bg-white/90
                      shadow-[0_18px_45px_rgba(19,30,54,0.12)] p-3"
                      onClick={(e) => e.stopPropagation()}
                    >
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
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </section>
  );
}
