import { useRouter } from "next/router";
import Link from "next/link";
import { useContext, useState, useEffect, useId, useRef } from "react";
import axios from "axios";
import { useForm } from "react-hook-form";
import { GlobalContext } from "@/contexts/global.context";
import { useTranslation } from "next-i18next";
import { Clock3, Files, ShieldCheck, UserRound } from "lucide-react";

// SVG
import { EmployeesSvg } from "@/components/_shared/_svgs/employees.svg";

// COMPONENTS
import CatalogHeaderDashboardComponent from "../_shared/catalog-header.dashboard.component";
import ModaleEmployeesComponent from "./modale.employees.component";
import DocumentsEmployeeComponent from "./documents.employees.component";
import AccessRightsEmployeesComponent from "./access-rights.employees.component";
import DataEmployeesComponent from "./data.employees.component";

const profileTabs = [
  { id: "personal", label: "labels.personalInformation", defaultLabel: "Informations personnelles", Icon: UserRound },
  { id: "access", label: "labels.assignRights", Icon: ShieldCheck },
  { id: "documents", label: "labels.documents", Icon: Files },
];

const DEFAULT_OPTIONS = {
  dashboard: false,
  restaurant: false,
  menus: false,
  dishes: false,
  drinks: false,
  wines: false,
  news: false,
  gift_card: false,
  reservations: false,
  take_away: false,
  employees: false,
  customers: false,
  health_control_plan: false,
};

export default function DetailsEmployeesComponent({ employeeId }) {
  const { t } = useTranslation("employees");
  const { restaurantContext } = useContext(GlobalContext);
  const router = useRouter();
  const fileInputRef = useRef();
  const tabsId = useId();
  const [activeTab, setActiveTab] = useState("personal");

  const [employee, setEmployee] = useState(null);
  const [profileFile, setProfileFile] = useState(null);
  const [previewUrl, setPreviewUrl] = useState(null);

  // documents
  const [docs, setDocs] = useState([]);
  const [uploadedDocuments, setUploadedDocuments] = useState([]);
  const [duplicateModalOpen, setDuplicateModalOpen] = useState(false);
  const [isUploadingDocs, setIsUploadingDocs] = useState(false);
  const [isDeletingDocId, setIsDeletingDocId] = useState(null);
  const [docToDelete, setDocToDelete] = useState(null);

  const [isEditing, setIsEditing] = useState(false);
  const [isSavingDetails, setIsSavingDetails] = useState(false);
  const [optionsSaved, setOptionsSaved] = useState(false);

  const restaurantId = restaurantContext.restaurantData?._id;
  const baseUrl = `${process.env.NEXT_PUBLIC_API_URL}/restaurants/${restaurantId}/employees/${employeeId}`;

  // Formulaire détails + photo (SNAPSHOT pour CE RESTO)
  const {
    register: regDetails,
    handleSubmit: handleDetailsSubmit,
    reset: resetDetails,
    formState: { isDirty: detailsDirty },
  } = useForm({ mode: "onChange" });

  // Formulaire options (droits par resto)
  const {
    register: regOptions,
    handleSubmit: handleOptionsSubmit,
    reset: resetOptions,
    watch: watchOptions,
    formState: { isDirty: optionsDirty, isSubmitting: isSavingOptions },
  } = useForm({ mode: "onChange" });

  const optionLabels = {
    dashboard: t("nav.dashboard", { ns: "common" }),
    restaurant: t("nav.restaurant", { ns: "common" }),
    menus: t("nav.menus", { ns: "common" }),
    dishes: t("nav.dishes", { ns: "common" }),
    drinks: t("nav.drinks", { ns: "common" }),
    wines: t("nav.wines", { ns: "common" }),
    news: t("nav.news", { ns: "common" }),
    gift_card: t("nav.giftCards", { ns: "common" }),
    reservations: t("nav.reservations", { ns: "common" }),
    take_away: t("nav.takeAway", { ns: "common" }),
    employees: t("nav.employees", { ns: "common" }),
    customers: t("nav.customers", { ns: "common" }),
    health_control_plan: t("nav.health", { ns: "common" }),
  };

  // Charger l’employé et initialiser les formulaires
  useEffect(() => {
    const data = restaurantContext.restaurantData;
    if (!data || !restaurantId) return;

    const found = [...(data.employees || []), ...(data.accountants || [])].find(
      (e) => e._id === employeeId,
    );
    if (!found) {
      router.replace("/dashboard/employees");
      return;
    }
    setEmployee(found);

    // --- Récupérer le profile pour CE resto ---
    const profile =
      (found.restaurantProfiles || []).find(
        (p) => String(p.restaurant) === String(restaurantId),
      ) || null;

    const snapshot = profile?.snapshot || {};

    // Petite util pour la date
    const rawDate = snapshot.dateOnPost || found.dateOnPost;
    const dateOnPostStr = rawDate ? String(rawDate).slice(0, 10) : "";

    // --- Initialisation des champs DÉTAILS avec priorité au snapshot ---
    resetDetails({
      firstname: snapshot.firstname ?? found.firstname ?? "",
      lastname: snapshot.lastname ?? found.lastname ?? "",
      post: snapshot.post ?? found.post ?? "",
      dateOnPost: dateOnPostStr,
      email: snapshot.email ?? found.email ?? "",
      phone: snapshot.phone ?? found.phone ?? "",
      secuNumber: snapshot.secuNumber ?? found.secuNumber ?? "",
      address: snapshot.address ?? found.address ?? "",
      emergencyContact:
        snapshot.emergencyContact ?? found.emergencyContact ?? "",
      contractType: profile?.employment?.contractType ?? "",
      contractualValue:
        profile?.employment?.contractualValue ||
        profile?.employment?.contractualValue === 0
          ? String(profile?.employment?.contractualValue || "")
          : "",
      contractualUnit: profile?.employment?.contractualUnit ?? "",
    });

    // --- Initialisation des options avec fallback DEFAULT_OPTIONS ---
    const mergedOptions = {
      ...DEFAULT_OPTIONS,
      ...(profile?.options || {}),
    };
    resetOptions({ options: mergedOptions });

    setPreviewUrl(found.profilePicture?.url || null);
    setProfileFile(null);
    setOptionsSaved(false);

    // Initialise la liste de docs “en attente d’upload”
    setDocs([]);
  }, [
    employeeId,
    resetDetails,
    resetOptions,
    router,
    restaurantContext.restaurantData,
    restaurantId,
  ]);

  // Réinitialise le champ fileInput si docs est vide
  useEffect(() => {
    if (docs.length === 0 && fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  }, [docs]);

  useEffect(() => {
    if (
      !restaurantId ||
      !employeeId ||
      !employee ||
      employee.accountType === "accountant"
    ) {
      setUploadedDocuments([]);
      return undefined;
    }

    let active = true;
    setUploadedDocuments([]);
    axios
      .get(`${baseUrl}/documents`)
      .then(({ data }) => {
        if (active) setUploadedDocuments(data.documents || []);
      })
      .catch((error) => {
        console.error("Erreur récupération documents :", error);
      });

    return () => {
      active = false;
    };
  }, [baseUrl, employee, employeeId, restaurantId]);

  // Sélection locale de la photo
  function handleFileSelect(e) {
    const f = e.target.files[0];
    if (!f) return;
    setProfileFile(f);
    setPreviewUrl(URL.createObjectURL(f));
  }

  // Sauvegarde détails + photo
  async function onSaveDetails(data) {
    setIsSavingDetails(true);
    try {
      const fd = new FormData();
      Object.entries(data).forEach(
        ([k, v]) => v !== undefined && fd.append(k, v),
      );
      if (profileFile) fd.append("profilePicture", profileFile);

      const response = await axios.patch(baseUrl, fd, {
        headers: { "Content-Type": "multipart/form-data" },
      });

      restaurantContext.setRestaurantData((prev) => ({
        ...prev,
        employees: response.data.restaurant.employees,
        accountants: response.data.restaurant.accountants || [],
      }));

      const updated = [
        ...(response.data.restaurant.employees || []),
        ...(response.data.restaurant.accountants || []),
      ].find((e) => e._id === employeeId);
      setEmployee(updated);
      setIsEditing(false);
    } catch (err) {
      console.error("Erreur update détails :", err);
    } finally {
      setIsSavingDetails(false);
    }
  }

  // Sauvegarde options (droits pour ce restaurant)
  async function onSaveOptions(formData) {
    try {
      await handleOptionsSubmit(async (d) => {
        const response = await axios.patch(baseUrl, {
          options: d.options,
        });

        restaurantContext.setRestaurantData((prev) => ({
          ...prev,
          employees: response.data.restaurant.employees,
          accountants: response.data.restaurant.accountants || [],
        }));

        const updated = [
          ...(response.data.restaurant.employees || []),
          ...(response.data.restaurant.accountants || []),
        ].find((e) => e._id === employeeId);
        setEmployee(updated);
        setOptionsSaved(true);

        const profile =
          (updated.restaurantProfiles || []).find(
            (p) => String(p.restaurant) === String(restaurantId),
          ) || null;
        const mergedOptions = {
          ...DEFAULT_OPTIONS,
          ...(profile?.options || {}),
        };
        resetOptions({ options: mergedOptions });
      })(formData);
    } catch (err) {
      console.error("Erreur update options :", err);
    }
  }

  // Sélection documents locaux
  function onDocsChange(e) {
    const selectedFiles = Array.from(e.target.files);
    const existingNames = new Set(docs.map((d) => d.file.name));

    const uploadedNames = new Set(
      uploadedDocuments.map((document) => document.filename),
    );

    const uniqueFiles = selectedFiles.filter(
      (f) => !existingNames.has(f.name) && !uploadedNames.has(f.name),
    );

    if (uniqueFiles.length < selectedFiles.length) {
      setDuplicateModalOpen(true);
    }

    const newDocs = uniqueFiles.map((f) => ({ file: f, title: "" }));
    setDocs((prev) => [...prev, ...newDocs]);
  }

  function onDocTitleChange(index, newTitle) {
    setDocs((prev) =>
      prev.map((d, i) => (i === index ? { ...d, title: newTitle } : d)),
    );
  }

  async function onSaveDocs() {
    if (!docs.length) return;
    setIsUploadingDocs(true);
    try {
      const fd = new FormData();
      docs.forEach((d) => {
        fd.append("documents", d.file);
        fd.append("titles", d.title);
      });
      const response = await axios.post(`${baseUrl}/documents`, fd, {
        headers: { "Content-Type": "multipart/form-data" },
      });
      restaurantContext.setRestaurantData((prev) => ({
        ...prev,
        employees: response.data.restaurant.employees,
        accountants: response.data.restaurant.accountants || [],
      }));
      const updated = [
        ...(response.data.restaurant.employees || []),
        ...(response.data.restaurant.accountants || []),
      ].find((e) => e._id === employeeId);
      setEmployee(updated);
      setUploadedDocuments(response.data.documents || []);
      setDocs([]);
    } catch (err) {
      console.error("Erreur upload documents :", err);
    } finally {
      setIsUploadingDocs(false);
    }
  }

  function removeSelectedDoc(index) {
    setDocs((prev) => prev.filter((_, i) => i !== index));
  }

  function confirmDeleteDoc(doc) {
    setDocToDelete(doc);
  }

  async function onDeleteDoc() {
    const { public_id } = docToDelete;
    setIsDeletingDocId(public_id);
    try {
      const response = await axios.delete(
        `${baseUrl}/documents/${encodeURIComponent(public_id)}`,
      );
      restaurantContext.setRestaurantData((prev) => ({
        ...prev,
        employees: response.data.restaurant.employees,
        accountants: response.data.restaurant.accountants || [],
      }));
      const updated = [
        ...(response.data.restaurant.employees || []),
        ...(response.data.restaurant.accountants || []),
      ].find((e) => e._id === employeeId);
      setEmployee(updated);
      setUploadedDocuments(response.data.documents || []);
      setDocToDelete(null);
    } catch (err) {
      console.error("Erreur suppression document :", err);
    } finally {
      setIsDeletingDocId(null);
    }
  }

  if (!employee) return null;

  // Profil & documents pour le restaurant courant
  const currentProfile =
    (employee.restaurantProfiles || []).find(
      (p) => String(p.restaurant) === String(restaurantId),
    ) || null;

  const currentSnapshot = currentProfile?.snapshot || {};
  const currentEmployment = currentProfile?.employment || {};
  const currentDocuments = uploadedDocuments;
  const currentOptions = watchOptions("options") || {};

  const displayFirstname = currentSnapshot.firstname || employee.firstname;
  const displayLastname = currentSnapshot.lastname || employee.lastname;
  const employeeIsAccountant = employee.accountType === "accountant";
  const tabs = employeeIsAccountant ? profileTabs.slice(0, 1) : profileTabs;
  const visibleTab = tabs.some(({ id }) => id === activeTab) ? activeTab : "personal";

  function handleTabKey(event, index) {
    let next;
    switch (event.key) {
      case "ArrowRight": next = (index + 1) % tabs.length; break;
      case "ArrowLeft": next = (index - 1 + tabs.length) % tabs.length; break;
      case "Home": next = 0; break;
      case "End": next = tabs.length - 1; break;
      default: return;
    }
    event.preventDefault();
    const id = tabs[next].id;
    setActiveTab(id);
    document.getElementById(`${tabsId}-tab-${id}`)?.focus();
  }

  function panelProps(id) {
    return {
      id: `${tabsId}-panel-${id}`,
      role: "tabpanel",
      "aria-labelledby": `${tabsId}-tab-${id}`,
      hidden: visibleTab !== id,
    };
  }

  return (
    <section className="flex flex-col gap-6">
      <hr className="opacity-20" />

      <CatalogHeaderDashboardComponent
        icon={<EmployeesSvg width={30} height={30} fillColor="#131E3690" />}
        title={t("titles.main")}
        onTitleClick={() => router.push("/dashboard/employees")}
        onBack={() => router.push("/dashboard/employees")}
        subtitle={`${displayFirstname} ${displayLastname}${
          employeeIsAccountant ? " · Comptable" : ""
        }`.trim()}
        actions={!employeeIsAccountant && (
          <Link
            href={{ pathname: "/dashboard/employees/time-clock", query: { employeeId } }}
            className="inline-flex min-h-10 items-center gap-2 rounded-xl border border-darkBlue/15 bg-white px-3 py-2 text-sm font-semibold text-darkBlue hover:bg-lightGrey focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue"
          >
            <Clock3 size={17} aria-hidden="true" />
            {t("buttons.viewTimeClock", "Voir les pointages")}
          </Link>
        )}
      />

      <div role="tablist" aria-label={t("labels.employeeProfile", "Fiche salarié")} className="flex flex-wrap gap-x-1 border-b border-darkBlue/10">
        {tabs.map(({ id, label, defaultLabel, Icon }, index) => (
          <button
            key={id}
            type="button"
            id={`${tabsId}-tab-${id}`}
            role="tab"
            aria-selected={id === visibleTab}
            aria-controls={`${tabsId}-panel-${id}`}
            tabIndex={id === visibleTab ? 0 : -1}
            onClick={() => setActiveTab(id)}
            onKeyDown={(event) => handleTabKey(event, index)}
            className={`-mb-px inline-flex min-h-12 items-center gap-1.5 border-b-2 px-2 text-xs font-semibold focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue sm:gap-2 sm:px-5 sm:text-sm ${
              id === visibleTab ? "border-blue text-blue" : "border-transparent text-darkBlue/65 hover:text-darkBlue"
            }`}
          >
            <Icon size={17} className="shrink-0" aria-hidden="true" />
            {t(label, { defaultValue: defaultLabel })}
          </button>
        ))}
      </div>

      {/* Détails & Photo (formulaire branché sur le SNAPSHOT) */}
      <div {...panelProps("personal")}>
        <DataEmployeesComponent
          isEditing={isEditing}
          setIsEditing={setIsEditing}
          handleDetailsSubmit={handleDetailsSubmit}
          onSaveDetails={onSaveDetails}
          regDetails={regDetails}
          isSavingDetails={isSavingDetails}
          employee={employee}
          currentSnapshot={currentSnapshot}
          currentEmployment={currentEmployment}
          previewUrl={previewUrl}
          fileInputRef={fileInputRef}
          handleFileSelect={handleFileSelect}
          resetDetails={resetDetails}
          setProfileFile={setProfileFile}
          setPreviewUrl={setPreviewUrl}
          detailsDirty={detailsDirty}
          profileFile={profileFile}
        />
      </div>

      {/* Attribuer des droits (par restaurant) */}
      {!employeeIsAccountant ? (
        <div {...panelProps("access")}>
          <AccessRightsEmployeesComponent
            handleOptionsSubmit={handleOptionsSubmit}
            onSaveOptions={onSaveOptions}
            employee={employee}
            isSavingOptions={isSavingOptions}
            isEditing={isEditing}
            isSavingDetails={isSavingDetails}
            optionLabels={optionLabels}
            optionsSaved={optionsSaved}
            optionsDirty={optionsDirty}
            regOptions={regOptions}
            options={currentOptions}
          />
        </div>
      ) : null}

      {/* Documents (par restaurant) */}
      {!employeeIsAccountant ? (
        <div {...panelProps("documents")}>
          <DocumentsEmployeeComponent
            onDocsChange={onDocsChange}
            isUploadingDocs={isUploadingDocs}
            docs={docs}
            onSaveDocs={onSaveDocs}
            employee={employee}
            restaurantId={restaurantId}
            baseUrl={baseUrl}
            currentDocuments={currentDocuments}
            confirmDeleteDoc={confirmDeleteDoc}
            isDeletingDocId={isDeletingDocId}
            removeSelectedDoc={removeSelectedDoc}
            onDocTitleChange={onDocTitleChange}
            showUploader
          />
        </div>
      ) : null}

      {/* Modal doublon */}
      {duplicateModalOpen && (
        <ModaleEmployeesComponent
          type="duplicate"
          onCloseDuplicate={() => setDuplicateModalOpen(false)}
        />
      )}

      {/* Modale de confirmation de suppression de document */}
      {docToDelete && (
        <ModaleEmployeesComponent
          docToDelete={docToDelete}
          setDocToDelete={setDocToDelete}
          onDeleteDoc={onDeleteDoc}
          isDeletingDocId={isDeletingDocId}
        />
      )}
    </section>
  );
}
