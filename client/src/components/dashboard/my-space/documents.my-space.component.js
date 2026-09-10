import { useEffect, useState } from "react";
import axios from "axios";
import { useTranslation } from "next-i18next";

// SVG
import { DocumentSvg } from "@/components/_shared/_svgs/_index";
import EmployeeDocumentRow from "../_shared/employee-document-row.dashboard.component";

export default function DocumentsMySpaceComponent({
  employeeId,
  restaurantId,
}) {
  const [docs, setDocs] = useState([]);
  const { t, i18n } = useTranslation("myspace");

  useEffect(() => {
    async function fetchDocs() {
      if (!employeeId || !restaurantId) return;

      try {
        const { data } = await axios.get(
          `${process.env.NEXT_PUBLIC_API_URL}/restaurants/${restaurantId}/employees/${employeeId}/documents`,
        );
        setDocs(data.documents || []);
      } catch (err) {
        console.error("Erreur récupération documents :", err);
      }
    }

    fetchDocs();
  }, [employeeId, restaurantId]);

  async function handleDownloadDocument(doc) {
    if (!doc?.public_id || !employeeId || !restaurantId) return;

    try {
      const response = await axios.get(
        `${process.env.NEXT_PUBLIC_API_URL}/restaurants/${restaurantId}/employees/${employeeId}/documents/${encodeURIComponent(
          doc.public_id,
        )}/download`,
        {
          responseType: "blob",
        },
      );

      const blob = new Blob([response.data]);
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = doc.filename || doc.title || "document";
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
    } catch (error) {
      console.error("Erreur téléchargement document :", error);
    }
  }

  const documentLabels = {
    document: t("documents.document", "Document"),
    uploadedOn: t("documents.uploadedOn", "Mis en ligne le"),
    at: t("documents.at", "à"),
    by: t("documents.by", "Par"),
    download: t("buttons.download"),
    delete: "",
  };
  const locale = i18n.resolvedLanguage?.startsWith("fr") ? "fr-FR" : "en-GB";

  return (
    <section className="flex flex-col gap-6">
      <div className="flex justify-between">
        <div className="flex gap-2 items-center">
          <DocumentSvg width={30} height={30} fillColor="#131E3690" />
          <h1 className="pl-2 py-1 text-xl tablet:text-2xl">
            {t("titles.second")}
          </h1>
        </div>
      </div>

      <div>
        {docs.length === 0 ? (
          <p className="text-sm italic text-darkBlue/60 text-center">
            {t("noDocuments", "Aucun document disponible pour ce restaurant.")}
          </p>
        ) : (
          <ul className="flex flex-col gap-2">
            {docs.map((doc) => (
              <EmployeeDocumentRow
                key={doc.public_id}
                document={doc}
                locale={locale}
                labels={documentLabels}
                showUploader
                onDownload={handleDownloadDocument}
              />
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}
