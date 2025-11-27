import { useRouter } from "next/router";
import { useContext, useState, useEffect, useRef } from "react";
import axios from "axios";
import { useForm } from "react-hook-form";
import { GlobalContext } from "@/contexts/global.context";
import { useTranslation } from "next-i18next";

// SVG
import { EmployeesSvg } from "@/components/_shared/_svgs/employees.svg";

// COMPONENTS
import ModaleEmployeesComponent from "./modale.employees.component";
import DocumentsEmployeeComponent from "./documents.employees.component";
import AccessRightsEmployeesComponent from "./access-rights.employees.component";
import DataEmployeesComponent from "./data.employees.component";

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
  health_control_plan: false,
};

export default function DetailsEmployeesComponent({ employeeId }) {
  const { t } = useTranslation("employees");
  const { restaurantContext } = useContext(GlobalContext);
  const router = useRouter();
  const fileInputRef = useRef();

  const [employee, setEmployee] = useState(null);
  const [profileFile, setProfileFile] = useState(null);
  const [previewUrl, setPreviewUrl] = useState(null);

  // documents
  const [docs, setDocs] = useState([]);
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
    health_control_plan: t("nav.health", { ns: "common" }),
  };

  // Charger l’employé et initialiser les formulaires
  useEffect(() => {
    const data = restaurantContext.restaurantData;
    if (!data || !restaurantId) return;

    const found = data.employees.find((e) => e._id === employeeId);
    if (!found) {
      router.replace("/dashboard/employees");
      return;
    }
    setEmployee(found);

    // --- Récupérer le profile pour CE resto ---
    const profile =
      (found.restaurantProfiles || []).find(
        (p) => String(p.restaurant) === String(restaurantId)
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
        ([k, v]) => v !== undefined && fd.append(k, v)
      );
      if (profileFile) fd.append("profilePicture", profileFile);

      const response = await axios.patch(baseUrl, fd, {
        headers: { "Content-Type": "multipart/form-data" },
      });

      restaurantContext.setRestaurantData((prev) => ({
        ...prev,
        employees: response.data.restaurant.employees,
      }));

      const updated = response.data.restaurant.employees.find(
        (e) => e._id === employeeId
      );
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
        }));

        const updated = response.data.restaurant.employees.find(
          (e) => e._id === employeeId
        );
        setEmployee(updated);
        setOptionsSaved(true);

        const profile =
          (updated.restaurantProfiles || []).find(
            (p) => String(p.restaurant) === String(restaurantId)
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

    const currentProfile =
      (employee?.restaurantProfiles || []).find(
        (p) => String(p.restaurant) === String(restaurantId)
      ) || null;
    const uploadedNames = new Set(
      currentProfile?.documents?.map((d) => d.filename) || []
    );

    const uniqueFiles = selectedFiles.filter(
      (f) => !existingNames.has(f.name) && !uploadedNames.has(f.name)
    );

    if (uniqueFiles.length < selectedFiles.length) {
      setDuplicateModalOpen(true);
    }

    const newDocs = uniqueFiles.map((f) => ({ file: f, title: "" }));
    setDocs((prev) => [...prev, ...newDocs]);
  }

  function onDocTitleChange(index, newTitle) {
    setDocs((prev) =>
      prev.map((d, i) => (i === index ? { ...d, title: newTitle } : d))
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
      }));
      const updated = response.data.restaurant.employees.find(
        (e) => e._id === employeeId
      );
      setEmployee(updated);
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
      const response = await axios.delete(`${baseUrl}/documents/${public_id}`);
      restaurantContext.setRestaurantData((prev) => ({
        ...prev,
        employees: response.data.restaurant.employees,
      }));
      const updated = response.data.restaurant.employees.find(
        (e) => e._id === employeeId
      );
      setEmployee(updated);
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
      (p) => String(p.restaurant) === String(restaurantId)
    ) || null;

  const currentSnapshot = currentProfile?.snapshot || {};
  const currentDocuments = currentProfile?.documents || [];
  const currentOptions = watchOptions("options") || {};

  const displayFirstname = currentSnapshot.firstname || employee.firstname;
  const displayLastname = currentSnapshot.lastname || employee.lastname;

  return (
    <section className="flex flex-col gap-6">
      <hr className="opacity-20" />

      <div className="flex gap-2 items-center min-h-[40px]">
        <div>
          <EmployeesSvg width={30} height={30} fillColor="#131E3690" />
        </div>
        <h1 className="pl-2 text-xl flex-wrap tablet:text-2xl flex items-center gap-2">
          <span
            className="cursor-pointer hover:underline"
            onClick={() => router.push("/dashboard/employees")}
          >
            {t("titles.main")}
          </span>
          <span>/</span>
          <span>
            {displayFirstname} {displayLastname}
          </span>
        </h1>
      </div>

      {/* Détails & Photo (formulaire branché sur le SNAPSHOT) */}
      <DataEmployeesComponent
        isEditing={isEditing}
        setIsEditing={setIsEditing}
        handleDetailsSubmit={handleDetailsSubmit}
        onSaveDetails={onSaveDetails}
        regDetails={regDetails}
        isSavingDetails={isSavingDetails}
        employee={employee}
        currentSnapshot={currentSnapshot}
        previewUrl={previewUrl}
        fileInputRef={fileInputRef}
        handleFileSelect={handleFileSelect}
        resetDetails={resetDetails}
        setProfileFile={setProfileFile}
        setPreviewUrl={setPreviewUrl}
        detailsDirty={detailsDirty}
        profileFile={profileFile}
      />

      {/* Attribuer des droits (par restaurant) */}
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

      {/* Documents (par restaurant) */}
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
      />

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
