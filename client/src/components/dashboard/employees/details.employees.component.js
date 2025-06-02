import { useRouter } from "next/router";
import { useContext, useState, useEffect, useRef } from "react";
import axios from "axios";
import { useForm } from "react-hook-form";
import { GlobalContext } from "@/contexts/global.context";
import { EmployeesSvg } from "@/components/_shared/_svgs/employees.svg";
import { useTranslation } from "next-i18next";

import ModaleEmployeesComponent from "./modale.employees.component";
import DocumentsEmployeeComponent from "./documents.employees.component";
import AccessRightsEmployeesComponent from "./access-rights.employees.component";
import DataEmployeesComponent from "./data.employees.component";

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

  // Formulaire détails + photo
  const {
    register: regDetails,
    handleSubmit: handleDetailsSubmit,
    reset: resetDetails,
    formState: { isDirty: detailsDirty },
  } = useForm({ mode: "onChange" });

  // Formulaire options
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
  };

  const restaurantId = restaurantContext.restaurantData?._id;
  const baseUrl = `${process.env.NEXT_PUBLIC_API_URL}/restaurants/${restaurantId}/employees/${employeeId}`;

  // Charger l’employé et initialiser les formulaires
  useEffect(() => {
    const data = restaurantContext.restaurantData;
    if (!data) return;
    const found = data.employees.find((e) => e._id === employeeId);
    if (!found) {
      router.replace("/dashboard/employees");
      return;
    }
    setEmployee(found);

    resetDetails({
      firstname: found.firstname,
      lastname: found.lastname,
      post: found.post,
      dateOnPost: found.dateOnPost?.slice(0, 10),
      email: found.email,
      phone: found.phone,
      secuNumber: found.secuNumber,
      address: found.address,
      emergencyContact: found.emergencyContact,
    });
    resetOptions({ options: found.options });

    setPreviewUrl(found.profilePicture?.url || null);
    setProfileFile(null);
    setOptionsSaved(false);

    // On réinitialise docs à chaque nouvel employé
    setDocs([]);
  }, [
    employeeId,
    resetDetails,
    resetOptions,
    router,
    restaurantContext.restaurantData,
  ]);

  // Réinitialise le champ fileInput si docs est vide
  useEffect(() => {
    if (docs.length === 0 && fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  }, [docs]);

  // Sélection locale de la photo (inchangé)
  function handleFileSelect(e) {
    const f = e.target.files[0];
    if (!f) return;
    setProfileFile(f);
    setPreviewUrl(URL.createObjectURL(f));
  }

  // Sauvegarde détails + photo (inchangé)
  async function onSaveDetails(data) {
    setIsSavingDetails(true);
    try {
      const fd = new FormData();
      Object.entries(data).forEach(
        ([k, v]) => v !== undefined && fd.append(k, v)
      );
      if (profileFile) fd.append("profilePicture", profileFile);
      const { data: res } = await axios.patch(baseUrl, fd, {
        headers: { "Content-Type": "multipart/form-data" },
      });
      restaurantContext.setRestaurantData(res.restaurant);
      setEmployee(res.restaurant.employees.find((e) => e._id === employeeId));
      setIsEditing(false);
    } catch (err) {
      console.error("Erreur update détails :", err);
    } finally {
      setIsSavingDetails(false);
    }
  }

  // Sauvegarde options (inchangé)
  async function onSaveOptions(formData) {
    try {
      await handleOptionsSubmit(async (d) => {
        const { data: res } = await axios.patch(baseUrl, {
          options: d.options,
        });
        restaurantContext.setRestaurantData(res.restaurant);
        const updated = res.restaurant.employees.find(
          (e) => e._id === employeeId
        );
        setEmployee(updated);
        setOptionsSaved(true);
        resetOptions({ options: updated.options });
      })(formData);
    } catch (err) {
      console.error("Erreur update options :", err);
    }
  }

  // Sélection documents locaux
  function onDocsChange(e) {
    const selectedFiles = Array.from(e.target.files);
    // 1. Ne pas réajouter un fichier déjà en attente d'upload
    const existingNames = new Set(docs.map((d) => d.file.name));
    // 2. Ne pas ajouter non plus un fichier déjà présent sur l'employé
    const uploadedNames = new Set(
      employee.documents?.map((d) => d.filename) || []
    );

    // Garde uniquement les fichiers UNIQUES
    const uniqueFiles = selectedFiles.filter(
      (f) => !existingNames.has(f.name) && !uploadedNames.has(f.name)
    );

    if (uniqueFiles.length < selectedFiles.length) {
      // Avertissement : certains fichiers étaient en double
      setDuplicateModalOpen(true);
    }

    // On ajoute les nouveaux fichiers (file + titre vide)
    const newDocs = uniqueFiles.map((f) => ({ file: f, title: "" }));
    setDocs((prev) => [...prev, ...newDocs]);
  }

  // Met à jour le titre pour le doc à l’index donné
  function onDocTitleChange(index, newTitle) {
    setDocs((prev) =>
      prev.map((d, i) => (i === index ? { ...d, title: newTitle } : d))
    );
  }

  // Upload documents + titres
  async function onSaveDocs() {
    if (!docs.length) return;
    setIsUploadingDocs(true);
    try {
      const fd = new FormData();
      docs.forEach((d) => {
        fd.append("documents", d.file);
        fd.append("titles", d.title);
      });
      const { data: res } = await axios.post(`${baseUrl}/documents`, fd, {
        headers: { "Content-Type": "multipart/form-data" },
      });
      restaurantContext.setRestaurantData(res.restaurant);
      setEmployee(res.restaurant.employees.find((e) => e._id === employeeId));
      setDocs([]); // on vide la sélection après l’upload
    } catch (err) {
      console.error("Erreur upload documents :", err);
    } finally {
      setIsUploadingDocs(false);
    }
  }

  // Retirer un fichier sélectionné
  function removeSelectedDoc(index) {
    setDocs((prev) => prev.filter((_, i) => i !== index));
  }

  // Ouvre la modale de confirmation
  function confirmDeleteDoc(doc) {
    setDocToDelete(doc);
  }

  // Supprime après confirmation (inchangé)
  async function onDeleteDoc() {
    const { public_id } = docToDelete;
    setIsDeletingDocId(public_id);
    try {
      const { data: res } = await axios.delete(
        `${baseUrl}/documents/${public_id}`
      );
      restaurantContext.setRestaurantData(res.restaurant);
      setEmployee(res.restaurant.employees.find((e) => e._id === employeeId));
      setDocToDelete(null);
    } catch (err) {
      console.error("Erreur suppression document :", err);
    } finally {
      setIsDeletingDocId(null);
    }
  }

  if (!employee) return null;

  return (
    <section className="flex flex-col gap-6">
      <hr className="opacity-20" />

      {/* Fil d’Ariane */}
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
            {employee.firstname} {employee.lastname}
          </span>
        </h1>
      </div>

      {/* Détails & Photo */}
      <DataEmployeesComponent
        isEditing={isEditing}
        setIsEditing={setIsEditing}
        handleDetailsSubmit={handleDetailsSubmit}
        onSaveDetails={onSaveDetails}
        regDetails={regDetails}
        isSavingDetails={isSavingDetails}
        employee={employee}
        previewUrl={previewUrl}
        fileInputRef={fileInputRef}
        handleFileSelect={handleFileSelect}
        resetDetails={resetDetails}
        setProfileFile={setProfileFile}
        setPreviewUrl={setPreviewUrl}
        detailsDirty={detailsDirty}
        profileFile={profileFile}
      />

      {/* Attribuer des droits */}
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
      />

      {/* Documents */}
      <DocumentsEmployeeComponent
        onDocsChange={onDocsChange}
        isUploadingDocs={isUploadingDocs}
        docs={docs}
        onSaveDocs={onSaveDocs}
        employee={employee}
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
