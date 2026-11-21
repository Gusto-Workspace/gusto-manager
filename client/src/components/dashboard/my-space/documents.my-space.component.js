import { useEffect, useState } from "react";
import axios from "axios";
import { useTranslation } from "next-i18next";
import { DocumentSvg } from "@/components/_shared/_svgs/_index";
import EmployeeDocumentsList from "../_shared/employee-documents.dashboard.component";

function PersonalDocuments({ endpoint }) {
  const [documents, setDocuments] = useState([]);
  const [category, setCategory] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError("");
    axios.get(endpoint, { params: { scope: "personal" }, signal: controller.signal })
      .then(({ data }) => { if (!controller.signal.aborted) setDocuments(data.documents || []); })
      .catch(() => {
        if (!controller.signal.aborted) {
          setDocuments([]);
          setError("Impossible de charger vos documents.");
        }
      })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [endpoint, attempt]);

  return <EmployeeDocumentsList documents={documents} endpoint={endpoint} loading={loading}
    category={category} onCategoryChange={setCategory}
    error={error} onRetry={() => setAttempt((value) => value + 1)} personal />;
}

export default function DocumentsMySpaceComponent({ employeeId, restaurantId }) {
  const { t } = useTranslation("myspace");
  const endpoint = employeeId && restaurantId
    ? `${process.env.NEXT_PUBLIC_API_URL}/restaurants/${restaurantId}/employees/${employeeId}/documents`
    : null;
  return (
    <section className="min-w-0 overflow-hidden rounded-xl border border-darkBlue/10 bg-white">
      <header className="flex min-h-16 items-center gap-2 border-b border-darkBlue/10 px-4 py-3 midTablet:px-5">
        <DocumentSvg width={26} height={26} fillColor="#131E3690" />
        <h2 className="text-lg font-semibold">{t("titles.second")}</h2>
      </header>
      {endpoint ? <PersonalDocuments key={endpoint} endpoint={endpoint} /> :
        <p className="px-4 py-6 text-sm text-darkBlue/70">Sélectionnez un restaurant pour consulter vos documents.</p>}
    </section>
  );
}
