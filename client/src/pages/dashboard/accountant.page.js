import { useContext, useEffect, useMemo, useState } from "react";
import Head from "next/head";
import Image from "next/image";
import axios from "axios";
import { serverSideTranslations } from "next-i18next/serverSideTranslations";
import {
  CalendarDays,
  Clock3,
  Download,
  FileSpreadsheet,
  FileText,
  FolderUp,
  Search,
  Users,
} from "lucide-react";

import { GlobalContext } from "@/contexts/global.context";
import NavComponent from "@/components/_shared/nav/nav.component";
import SettingsComponent from "@/components/_shared/settings/settings.component";
import CatalogHeaderDashboardComponent from "@/components/dashboard/_shared/catalog-header.dashboard.component";
import DocumentsEmployeeComponent from "@/components/dashboard/employees/documents.employees.component";

const ACCOUNTANT_NAV_ITEMS = [
  { id: "hours", label: "Heures", icon: "ClockSvg" },
  { id: "documents", label: "Documents", icon: "DocumentSvg" },
];

function pad2(value) {
  return String(value).padStart(2, "0");
}

function getCurrentMonthRange() {
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth();
  const lastDay = new Date(year, month + 1, 0).getDate();

  return {
    from: `${year}-${pad2(month + 1)}-01`,
    to: `${year}-${pad2(month + 1)}-${pad2(lastDay)}`,
  };
}

function normalize(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

async function getDownloadError(error) {
  const data = error?.response?.data;
  if (data instanceof Blob) {
    try {
      const parsed = JSON.parse(await data.text());
      if (parsed?.message) return parsed.message;
    } catch {}
  }
  return data?.message || "Impossible de générer le fichier pour le moment.";
}

export default function AccountantPage() {
  const { restaurantContext } = useContext(GlobalContext);
  const defaultRange = useMemo(() => getCurrentMonthRange(), []);
  const [activeSection, setActiveSection] = useState("hours");
  const [from, setFrom] = useState(defaultRange.from);
  const [to, setTo] = useState(defaultRange.to);
  const [format, setFormat] = useState("excel");
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState("");
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedEmployeeId, setSelectedEmployeeId] = useState("");
  const [documents, setDocuments] = useState([]);
  const [pendingDocuments, setPendingDocuments] = useState([]);
  const [documentsLoading, setDocumentsLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [documentError, setDocumentError] = useState("");

  const user = restaurantContext?.userConnected;
  const restaurant = restaurantContext?.restaurantData;
  const restaurantId = restaurant?._id || user?.restaurantId || null;
  const employees = useMemo(
    () =>
      (restaurant?.employees || []).filter(
        (employee) => employee.accountType !== "accountant",
      ),
    [restaurant?.employees],
  );
  const selectedEmployee = employees.find(
    (employee) => String(employee._id) === String(selectedEmployeeId),
  );
  const filteredEmployees = useMemo(() => {
    const query = normalize(searchTerm);
    if (!query) return employees;

    return employees.filter((employee) =>
      normalize(
        `${employee.firstname} ${employee.lastname} ${employee.post}`,
      ).includes(query),
    );
  }, [employees, searchTerm]);
  const baseUrl =
    restaurantId && selectedEmployee?._id
      ? `${process.env.NEXT_PUBLIC_API_URL}/restaurants/${restaurantId}/employees/${selectedEmployee._id}`
      : "";

  useEffect(() => {
    setSelectedEmployeeId((current) =>
      employees.some((employee) => String(employee._id) === String(current))
        ? current
        : employees[0]?._id || "",
    );
    setSearchTerm("");
    setDocuments([]);
    setPendingDocuments([]);
    setDocumentError("");
    setExportError("");
  }, [employees, restaurantId]);

  useEffect(() => {
    if (!baseUrl || activeSection !== "documents") return undefined;

    let active = true;
    setDocuments([]);
    setDocumentsLoading(true);
    setDocumentError("");
    axios
      .get(`${baseUrl}/documents`)
      .then(({ data }) => {
        if (active) setDocuments(data.documents || []);
      })
      .catch((error) => {
        if (!active) return;
        setDocumentError(
          error?.response?.data?.message ||
            "Impossible de récupérer les documents.",
        );
      })
      .finally(() => {
        if (active) setDocumentsLoading(false);
      });

    return () => {
      active = false;
    };
  }, [activeSection, baseUrl]);

  function selectEmployee(employeeId) {
    setSelectedEmployeeId(employeeId);
    setDocuments([]);
    setPendingDocuments([]);
    setDocumentError("");
  }

  function onDocumentsChange(event) {
    const selected = Array.from(event.target.files || []);
    const knownNames = new Set([
      ...documents.map((document) => document.filename),
      ...pendingDocuments.map((document) => document.file.name),
    ]);
    const unique = selected
      .filter((file) => !knownNames.has(file.name))
      .map((file) => ({ file, title: "" }));

    setPendingDocuments((current) => [...current, ...unique]);
    setDocumentError(
      unique.length < selected.length
        ? "Les fichiers déjà présents ont été ignorés."
        : "",
    );
  }

  function onDocumentTitleChange(index, title) {
    setPendingDocuments((current) =>
      current.map((document, currentIndex) =>
        currentIndex === index ? { ...document, title } : document,
      ),
    );
  }

  async function uploadDocuments() {
    if (!baseUrl || !pendingDocuments.length) return;

    const formData = new FormData();
    pendingDocuments.forEach(({ file, title }) => {
      formData.append("documents", file);
      formData.append("titles", title);
    });

    setUploading(true);
    setDocumentError("");
    try {
      const { data } = await axios.post(`${baseUrl}/documents`, formData, {
        headers: { "Content-Type": "multipart/form-data" },
      });
      setDocuments(data.documents || []);
      setPendingDocuments([]);
    } catch (error) {
      setDocumentError(
        error?.response?.data?.message ||
          "Impossible de déposer les documents.",
      );
    } finally {
      setUploading(false);
    }
  }

  async function downloadHours() {
    if (!restaurantId) return;
    if (!from || !to || from > to) {
      setExportError("Choisissez une période valide.");
      return;
    }

    setExporting(true);
    setExportError("");
    try {
      const extension = format === "excel" ? "xlsx" : "pdf";
      const response = await axios.post(
        `${process.env.NEXT_PUBLIC_API_URL}/restaurants/${restaurantId}/time-clock/export/${format}`,
        { from, to },
        { responseType: "blob" },
      );
      const url = window.URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement("a");
      link.href = url;
      link.download = `heures-salaries-${from}-au-${to}.${extension}`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
    } catch (error) {
      setExportError(await getDownloadError(error));
    } finally {
      setExporting(false);
    }
  }

  if (!restaurantContext?.isAuth || user?.role !== "accountant") return null;

  return (
    <>
      <Head>
        <title>Espace comptable · Gusto Manager</title>
      </Head>

      <div className="flex min-h-screen">
        <NavComponent
          items={ACCOUNTANT_NAV_ITEMS}
          activeItemId={activeSection}
          onItemSelect={setActiveSection}
        />

        <main className="tablet:ml-[88px] min-h-screen min-w-0 flex-1 bg-lightGrey px-2 p-6 text-darkBlue mobile:px-6">
          <div className="flex w-full flex-col gap-6">
            <SettingsComponent />

            <CatalogHeaderDashboardComponent
              icon={
                activeSection === "hours" ? (
                  <Clock3 className="size-5 text-blue" />
                ) : (
                  <FolderUp className="size-5 text-blue" />
                )
              }
              title={activeSection === "hours" ? "Heures" : "Documents"}
              subtitle="Espace comptable"
            />

            {activeSection === "hours" ? (
              <section className="w-full rounded-2xl border border-darkBlue/10 bg-white/60 p-4 shadow-sm mobile:p-6">
                <div className="flex items-start gap-3">
                  <span className="inline-flex size-11 shrink-0 items-center justify-center rounded-xl bg-blue/10 text-blue">
                    <Clock3 className="size-5" />
                  </span>
                  <div>
                    <h2 className="text-lg font-semibold">
                      Heures des salariés
                    </h2>
                    <p className="mt-1 text-sm text-darkBlue/55">
                      Téléchargez les heures enregistrées par la pointeuse pour
                      la période choisie.
                    </p>
                  </div>
                </div>

                <div className="mt-6 grid gap-3 mobile:grid-cols-2">
                  <label className="flex flex-col gap-2 text-sm font-medium">
                    <span className="inline-flex items-center gap-2">
                      <CalendarDays className="size-4 text-blue" /> Du
                    </span>
                    <input
                      type="date"
                      value={from}
                      onChange={(event) => setFrom(event.target.value)}
                      className="h-12 rounded-xl border border-darkBlue/10 bg-white px-3 outline-none"
                    />
                  </label>
                  <label className="flex flex-col gap-2 text-sm font-medium">
                    <span className="inline-flex items-center gap-2">
                      <CalendarDays className="size-4 text-blue" /> Au
                    </span>
                    <input
                      type="date"
                      value={to}
                      onChange={(event) => setTo(event.target.value)}
                      className="h-12 rounded-xl border border-darkBlue/10 bg-white px-3 outline-none"
                    />
                  </label>
                </div>

                <div className="mt-4 grid gap-2 mobile:grid-cols-2">
                  {[
                    { id: "excel", label: "Excel", icon: FileSpreadsheet },
                    { id: "pdf", label: "PDF", icon: FileText },
                  ].map((option) => {
                    const Icon = option.icon;
                    return (
                      <button
                        key={option.id}
                        type="button"
                        onClick={() => setFormat(option.id)}
                        className={`inline-flex h-12 items-center justify-center gap-2 rounded-xl border text-sm font-semibold transition ${
                          format === option.id
                            ? "border-blue/30 bg-blue/10 text-blue"
                            : "border-darkBlue/10 bg-white text-darkBlue"
                        }`}
                      >
                        <Icon className="size-4" /> {option.label}
                      </button>
                    );
                  })}
                </div>

                {exportError ? (
                  <p className="mt-3 text-sm text-red">{exportError}</p>
                ) : null}
                <button
                  type="button"
                  onClick={downloadHours}
                  disabled={exporting || restaurantContext.dataLoading}
                  className="mt-4 inline-flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-blue px-5 text-sm font-semibold text-white shadow-sm disabled:opacity-50 mobile:w-auto"
                >
                  <Download className="size-4" />
                  {exporting ? "Préparation…" : "Télécharger les heures"}
                </button>
              </section>
            ) : (
              <section className="grid w-full min-w-0 items-start gap-4 midTablet:grid-cols-[minmax(240px,300px)_minmax(0,1fr)] desktop:grid-cols-[minmax(280px,340px)_minmax(0,1fr)]">
                <aside className="rounded-2xl border border-darkBlue/10 bg-white/60 p-3 shadow-sm mobile:p-4">
                  <div className="flex items-start gap-3">
                    <span className="inline-flex size-10 shrink-0 items-center justify-center rounded-xl bg-blue/10 text-blue">
                      <Users className="size-5" />
                    </span>
                    <div>
                      <h2 className="font-semibold">Salariés</h2>
                      <p className="text-xs text-darkBlue/50">
                        Choisissez le destinataire du document.
                      </p>
                    </div>
                  </div>

                  <label className="mt-4 flex h-11 items-center gap-2 rounded-xl border border-darkBlue/10 bg-white px-3">
                    <Search className="size-4 text-darkBlue/40" />
                    <input
                      type="search"
                      value={searchTerm}
                      onChange={(event) => setSearchTerm(event.target.value)}
                      placeholder="Rechercher un salarié"
                      className="min-w-0 flex-1 bg-transparent text-sm outline-none"
                    />
                  </label>

                  <div className="mt-3 flex max-h-[520px] flex-col gap-2 overflow-y-auto pr-1">
                    {filteredEmployees.length ? (
                      filteredEmployees.map((employee) => {
                        const selected =
                          String(employee._id) === String(selectedEmployeeId);
                        const initials = `${employee.firstname?.[0] || ""}${
                          employee.lastname?.[0] || ""
                        }`.toUpperCase();

                        return (
                          <button
                            key={employee._id}
                            type="button"
                            onClick={() => selectEmployee(employee._id)}
                            className={`flex w-full items-center gap-3 rounded-xl border p-3 text-left transition ${
                              selected
                                ? "border-blue/30 bg-blue/10 shadow-sm"
                                : "border-darkBlue/5 bg-white/70 hover:border-darkBlue/15"
                            }`}
                          >
                            <span className="relative inline-flex size-11 shrink-0 items-center justify-center overflow-hidden rounded-full bg-lightGrey text-xs font-semibold text-darkBlue/60">
                              {employee.profilePicture?.url ? (
                                <Image
                                  src={employee.profilePicture.url}
                                  alt=""
                                  fill
                                  sizes="44px"
                                  className="object-cover"
                                  unoptimized
                                />
                              ) : (
                                initials
                              )}
                            </span>
                            <span className="min-w-0 flex-1">
                              <span className="block truncate text-sm font-semibold">
                                {employee.firstname} {employee.lastname}
                              </span>
                              <span className="block truncate text-xs text-darkBlue/50">
                                {employee.post || "Métier non renseigné"}
                              </span>
                            </span>
                          </button>
                        );
                      })
                    ) : (
                      <p className="rounded-xl bg-white/60 px-3 py-8 text-center text-sm text-darkBlue/50">
                        Aucun salarié trouvé.
                      </p>
                    )}
                  </div>
                </aside>

                <div className="min-w-0">
                  {selectedEmployee ? (
                    <>
                      <DocumentsEmployeeComponent
                        onDocsChange={onDocumentsChange}
                        isUploadingDocs={uploading}
                        docs={pendingDocuments}
                        onSaveDocs={uploadDocuments}
                        baseUrl={baseUrl}
                        currentDocuments={documents}
                        removeSelectedDoc={(index) =>
                          setPendingDocuments((current) =>
                            current.filter(
                              (_, currentIndex) => currentIndex !== index,
                            ),
                          )
                        }
                        onDocTitleChange={onDocumentTitleChange}
                        description={`Documents déposés pour ${selectedEmployee.firstname} ${selectedEmployee.lastname}.`}
                        showUploader
                      />
                      {documentsLoading ? (
                        <p className="mt-3 text-sm text-darkBlue/50">
                          Chargement des documents…
                        </p>
                      ) : null}
                      {documentError ? (
                        <p className="mt-3 rounded-xl border border-red/20 bg-red/5 px-4 py-3 text-sm text-red">
                          {documentError}
                        </p>
                      ) : null}
                    </>
                  ) : (
                    <div className="rounded-2xl border border-dashed border-darkBlue/15 bg-white/40 px-5 py-16 text-center">
                      <FolderUp className="mx-auto size-8 text-darkBlue/30" />
                      <p className="mt-3 text-sm text-darkBlue/55">
                        Sélectionnez un salarié pour consulter ou déposer ses
                        documents.
                      </p>
                    </div>
                  )}
                </div>
              </section>
            )}
          </div>
        </main>
      </div>
    </>
  );
}

export async function getStaticProps({ locale }) {
  return {
    props: {
      ...(await serverSideTranslations(locale, ["common", "employees"])),
    },
  };
}
