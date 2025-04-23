import { useRouter } from "next/router";
import { useContext, useState, useEffect, useRef } from "react";

// AXIOS
import axios from "axios";

// REACT HOOK FORM
import { useForm } from "react-hook-form";

// CONTEXT
import { GlobalContext } from "@/contexts/global.context";

// SVG
import { AvatarSvg } from "@/components/_shared/_svgs/avatar.svg";
import { EmployeesSvg } from "@/components/_shared/_svgs/employees.svg";
import { EditSvg } from "@/components/_shared/_svgs/edit.svg";

// I18N
import { useTranslation } from "next-i18next";

export default function DetailsEmployeesComponent({ employeeId }) {
  const { t } = useTranslation("employees");
  const { restaurantContext } = useContext(GlobalContext);
  const router = useRouter();
  const fileInputRef = useRef();

  const [employee, setEmployee] = useState(null);
  const [profileFile, setProfileFile] = useState(null);
  const [previewUrl, setPreviewUrl] = useState(null);
  const [docs, setDocs] = useState([]);
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
  const apiUrl = `${process.env.NEXT_PUBLIC_API_URL}/restaurants/${restaurantId}/employees/${employeeId}`;

  // Charger l'employé et initialiser les formulaires
  useEffect(() => {
    if (!restaurantContext.restaurantData) return;
    const found = restaurantContext.restaurantData.employees.find(
      (e) => e._id === employeeId
    );
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
      adress: found.adress,
      emergencyContact: found.emergencyContact,
    });
    resetOptions({ options: found.options });

    setPreviewUrl(found.profilePicture?.url || null);
    setProfileFile(null);
    setOptionsSaved(false);
  }, [
    restaurantContext.restaurantData,
    employeeId,
    resetDetails,
    resetOptions,
    router,
  ]);

  // Réinitialise le badge "Sauvegardé" si on modifie de nouveau
  useEffect(() => {
    if (
      optionsSaved &&
      JSON.stringify(watchOptions("options")) !==
        JSON.stringify(employee.options)
    ) {
      setOptionsSaved(false);
    }
  }, [watchOptions, optionsSaved, employee]);

  // Sélection locale de la nouvelle photo
  const handleFileSelect = (e) => {
    const f = e.target.files[0];
    if (!f) return;
    setProfileFile(f);
    setPreviewUrl(URL.createObjectURL(f));
  };

  // Sauvegarde détails + photo
  async function onSaveDetails(data) {
    setIsSavingDetails(true);
    try {
      const fd = new FormData();
      Object.entries(data).forEach(
        ([k, v]) => v !== undefined && fd.append(k, v)
      );
      if (profileFile) fd.append("profilePicture", profileFile);

      const { data: res } = await axios.patch(apiUrl, fd, {
        headers: { "Content-Type": "multipart/form-data" },
      });
      restaurantContext.setRestaurantData(res.restaurant);
      const upd = res.restaurant.employees.find((e) => e._id === employeeId);
      setEmployee(upd);
      setIsEditing(false);
    } catch (err) {
      console.error("Erreur update détails :", err);
    } finally {
      setIsSavingDetails(false);
    }
  }

  // Sauvegarde options
  async function onSaveOptions(data) {
    try {
      await handleOptionsSubmit(async (d) => {
        const { data: res } = await axios.patch(apiUrl, { options: d.options });
        restaurantContext.setRestaurantData(res.restaurant);
        const upd = res.restaurant.employees.find((e) => e._id === employeeId);
        setEmployee(upd);
        setOptionsSaved(true);
      })(data);
    } catch (err) {
      console.error("Erreur update options :", err);
    }
  }

  // Gestion des documents (console.log)
  const onDocsChange = (e) => {
    const files = Array.from(e.target.files);
    setDocs(files);
    console.log("Documents sélectionnés :", files);
  };

  if (!employee) return null;

  return (
    <section className="flex flex-col gap-6">
      <hr className="opacity-20" />

      {/* Breadcrumb */}
      <div className="flex gap-2 items-center min-h-[40px]">
        <EmployeesSvg width={30} height={30} fillColor="#131E3690" />
        <h1 className="pl-2 text-xl tablet:text-2xl flex items-center gap-2">
          <span
            className="cursor-pointer hover:underline"
            onClick={() => router.push("/dashboard/employees")}
          >
            {t("employees:titles.main")}
          </span>
          <span>/</span>
          <span>{employee.firstname} {employee.lastname}</span>
        </h1>
      </div>

      {/* Détails & Photo */}
      <section className="bg-white p-6 rounded-lg shadow flex justify-between items-start relative">
        {!isEditing && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              setIsEditing(true);
            }}
            className="absolute right-0 top-0 p-2"
          >
            <div className="hover:opacity-100 opacity-20 p-[6px] rounded-full transition-opacity">
              <EditSvg width={20} height={20} strokeColor="#131E36" fillColor="#131E36" />
            </div>
          </button>
        )}

        <form
          onSubmit={handleDetailsSubmit(onSaveDetails)}
          className="flex justify-between items-start w-full gap-6"
        >
          <div className="flex flex-col gap-4 w-2/3">
            {/* Nom & Prénom */}
            {isEditing ? (
              <div className="flex gap-2 mb-4">
                <input
                  {...regDetails("firstname", { required: true })}
                  disabled={isSavingDetails}
                  className="w-1/2 p-2 border border-darkBlue/50 rounded-lg"
                />
                <input
                  {...regDetails("lastname", { required: true })}
                  disabled={isSavingDetails}
                  className="w-1/2 p-2 border border-darkBlue/50 rounded-lg"
                />
              </div>
            ) : (
              <h2 className="text-2xl font-semibold mb-4">
                {employee.firstname} {employee.lastname}
              </h2>
            )}

            {/* Champs classiques + nouveaux */}
            <p>
              <strong>Poste :</strong>{" "}
              {isEditing ? (
                <input
                  {...regDetails("post")}
                  disabled={isSavingDetails}
                  className="p-2 border border-darkBlue/50 rounded-lg w-2/3"
                />
              ) : employee.post}
            </p>
            <p>
              <strong>Depuis le :</strong>{" "}
              {isEditing ? (
                <input
                  type="date"
                  {...regDetails("dateOnPost")}
                  disabled={isSavingDetails}
                  className="p-2 border border-darkBlue/50 rounded-lg w-2/3"
                />
              ) : new Date(employee.dateOnPost).toLocaleDateString("fr-FR")}
            </p>
            <p>
              <strong>Email :</strong>{" "}
              {isEditing ? (
                <input
                  type="email"
                  {...regDetails("email")}
                  disabled={isSavingDetails}
                  className="p-2 border border-darkBlue/50 rounded-lg w-2/3"
                />
              ) : employee.email}
            </p>
            <p>
              <strong>Téléphone :</strong>{" "}
              {isEditing ? (
                <input
                  {...regDetails("phone")}
                  disabled={isSavingDetails}
                  className="p-2 border border-darkBlue/50 rounded-lg w-2/3"
                />
              ) : employee.phone}
            </p>
            <p>
              <strong>N° Sécu. Sociale :</strong>{" "}
              {isEditing ? (
                <input
                  {...regDetails("secuNumber", { required: true })}
                  disabled={isSavingDetails}
                  className="p-2 border border-darkBlue/50 rounded-lg w-2/3"
                />
              ) : employee.secuNumber}
            </p>
            <p>
              <strong>Adresse :</strong>{" "}
              {isEditing ? (
                <input
                  {...regDetails("adress", { required: true })}
                  disabled={isSavingDetails}
                  className="p-2 border border-darkBlue/50 rounded-lg w-2/3"
                />
              ) : employee.adress}
            </p>
            <p>
              <strong>Contact urgence :</strong>{" "}
              {isEditing ? (
                <input
                  {...regDetails("emergencyContact", { required: true })}
                  disabled={isSavingDetails}
                  className="p-2 border border-darkBlue/50 rounded-lg w-2/3"
                />
              ) : employee.emergencyContact}
            </p>
          </div>

          {/* Photo de profil */}
          <div className="relative w-44 h-44 flex-shrink-0 rounded-full overflow-hidden border border-darkBlue/20">
            {previewUrl ? (
              <img src={previewUrl} alt="aperçu" className="w-full h-full object-cover" />
            ) : (
              <div className="flex items-center justify-center w-full h-full bg-lightGrey">
                <AvatarSvg width={40} height={40} fillColor="#131E3690" />
              </div>
            )}
            {isEditing && !isSavingDetails && (
              <div
                className="absolute inset-0 bg-black bg-opacity-30 opacity-0 hover:opacity-100 transition-opacity flex items-center justify-center cursor-pointer"
                onClick={() => fileInputRef.current.click()}
              >
                <EditSvg width={24} height={24} strokeColor="#fff" fillColor="#fff" />
              </div>
            )}
            <input
              ref={fileInputRef}
              type="file"
              accept=".jpg,.jpeg,.png,.webp"
              className="hidden"
              disabled={isSavingDetails}
              onChange={handleFileSelect}
            />
          </div>
        </form>

        {/* Boutons Annuler / Enregistrer */}
        {isEditing && (
          <div className="absolute bottom-4 right-4 flex gap-4">
            <button
              type="button"
              disabled={isSavingDetails}
              onClick={() => {
                resetDetails({
                  firstname: employee.firstname,
                  lastname: employee.lastname,
                  post: employee.post,
                  dateOnPost: employee.dateOnPost?.slice(0, 10),
                  email: employee.email,
                  phone: employee.phone,
                  secuNumber: employee.secuNumber,
                  adress: employee.adress,
                  emergencyContact: employee.emergencyContact,
                });
                setProfileFile(null);
                setPreviewUrl(employee.profilePicture?.url || null);
                setIsEditing(false);
              }}
              className="px-4 py-2 rounded-lg bg-red text-white"
            >
              Annuler
            </button>
            <button
              type="submit"
              onClick={handleDetailsSubmit(onSaveDetails)}
              disabled={(!detailsDirty && !profileFile) || isSavingDetails}
              className="px-4 py-2 rounded-lg bg-blue text-white disabled:opacity-40"
            >
              {isSavingDetails ? "Enregistrement…" : "Enregistrer"}
            </button>
          </div>
        )}
      </section>

      {/* Formulaire des droits */}
      <form
        onSubmit={handleOptionsSubmit(onSaveOptions)}
        className="bg-white p-6 rounded-lg shadow"
      >
        <h3 className="text-xl mb-4">Attribuer des droits</h3>
        <div className="grid grid-cols-2 gap-4">
          {Object.keys(employee.options).map((key) => (
            <label key={key} className="flex items-center gap-2">
              <input
                type="checkbox"
                {...regOptions(`options.${key}`)}
                disabled={isSavingOptions || isEditing || isSavingDetails}
              />
              {optionLabels[key] ?? key.replace(/_/g, " ")}
            </label>
          ))}
        </div>
        {optionsSaved ? (
          <span className="text-green-600">Sauvegardé</span>
        ) : optionsDirty ? (
          <button
            type="submit"
            disabled={isSavingOptions || isEditing || isSavingDetails}
            className="mt-4 px-4 py-2 bg-blue text-white rounded-lg disabled:opacity-40"
          >
            {isSavingOptions ? "Sauvegarde…" : "Sauvegarder les droits"}
          </button>
        ) : null}
      </form>

      {/* Zone documents */}
      <section className="bg-white p-6 rounded-lg shadow">
        <h3 className="text-xl mb-4">Documents</h3>
        <input type="file" multiple onChange={onDocsChange} className="mb-4" />
        {docs.length > 0 && (
          <ul className="list-disc pl-5">
            {docs.map((f, i) => (
              <li key={i}>{f.name}</li>
            ))}
          </ul>
        )}
      </section>
    </section>
  );
}
