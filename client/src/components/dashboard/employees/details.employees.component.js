import { useRouter } from "next/router";
import { useContext, useState, useEffect, useRef } from "react";
import axios from "axios";
import { useForm } from "react-hook-form";
import { GlobalContext } from "@/contexts/global.context";
import { AvatarSvg } from "@/components/_shared/_svgs/avatar.svg";
import { EmployeesSvg } from "@/components/_shared/_svgs/employees.svg";
import { EditSvg } from "@/components/_shared/_svgs/edit.svg";
import { useTranslation } from "next-i18next";
import { VisibleSvg } from "@/components/_shared/_svgs/visible.svg";
import { DeleteSvg } from "@/components/_shared/_svgs/delete.svg";

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
  const [isUploadingDocs, setIsUploadingDocs] = useState(false);
  const [isDeletingDocId, setIsDeletingDocId] = useState(null);

  const [isEditing, setIsEditing] = useState(false);
  const [isSavingDetails, setIsSavingDetails] = useState(false);
  const [optionsSaved, setOptionsSaved] = useState(false);

  // form détails
  const {
    register: regDetails,
    handleSubmit: handleDetailsSubmit,
    reset: resetDetails,
    formState: { isDirty: detailsDirty },
  } = useForm({ mode: "onChange" });

  // form options
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

  // load employee + init forms
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
    setDocs([]);
  }, [
    restaurantContext.restaurantData,
    employeeId,
    resetDetails,
    resetOptions,
    router,
  ]);

  // reset options badge
  useEffect(() => {
    if (
      optionsSaved &&
      JSON.stringify(watchOptions("options")) !==
        JSON.stringify(employee.options)
    ) {
      setOptionsSaved(false);
    }
  }, [watchOptions, optionsSaved, employee]);

  /** Photo sélectionnée */
  const handleFileSelect = (e) => {
    const f = e.target.files[0];
    if (!f) return;
    setProfileFile(f);
    setPreviewUrl(URL.createObjectURL(f));
  };

  /** Save détails + photo */
  const onSaveDetails = async (data) => {
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
  };

  /** Save options */
  const onSaveOptions = async (formData) => {
    try {
      await handleOptionsSubmit(async (d) => {
        const { data: res } = await axios.patch(baseUrl, {
          options: d.options,
        });
        restaurantContext.setRestaurantData(res.restaurant);
        setEmployee(res.restaurant.employees.find((e) => e._id === employeeId));
        setOptionsSaved(true);
      })(formData);
    } catch (err) {
      console.error("Erreur update options :", err);
    }
  };

  /** Sélection docs locales */
  const onDocsChange = (e) => {
    setDocs(Array.from(e.target.files));
  };

  /** Upload docs */
  const onSaveDocs = async () => {
    if (!docs.length) return;
    setIsUploadingDocs(true);
    try {
      const fd = new FormData();
      docs.forEach((f) => fd.append("documents", f));
      const { data: res } = await axios.post(`${baseUrl}/documents`, fd, {
        headers: { "Content-Type": "multipart/form-data" },
      });
      restaurantContext.setRestaurantData(res.restaurant);
      setEmployee(res.restaurant.employees.find((e) => e._id === employeeId));
      setDocs([]);
    } catch (err) {
      console.error("Erreur upload documents :", err);
    } finally {
      setIsUploadingDocs(false);
    }
  };

  /** Supprimer un document existant */
  const onDeleteDoc = async (public_id) => {
    setIsDeletingDocId(public_id);
    try {
      const { data: res } = await axios.delete(
        `${baseUrl}/documents/${public_id}`
      );
      restaurantContext.setRestaurantData(res.restaurant);
      setEmployee(res.restaurant.employees.find((e) => e._id === employeeId));
    } catch (err) {
      console.error("Erreur suppression document :", err);
    } finally {
      setIsDeletingDocId(null);
    }
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
          <span>
            {employee.firstname} {employee.lastname}
          </span>
        </h1>
      </div>

      {/* Détails & Photo */}
      <section className="bg-white p-6 rounded-lg shadow flex justify-between items-start relative">
        {!isEditing && (
          <button
            className="absolute right-0 top-0 p-2"
            onClick={(e) => {
              e.stopPropagation();
              setIsEditing(true);
            }}
          >
            <div className="hover:opacity-100 opacity-20 p-[6px] rounded-full transition-opacity">
              <EditSvg
                width={20}
                height={20}
                strokeColor="#131E36"
                fillColor="#131E36"
              />
            </div>
          </button>
        )}

        <form
          onSubmit={handleDetailsSubmit(onSaveDetails)}
          className="flex justify-between items-start w-full gap-6"
        >
          <div className="flex flex-col gap-4 w-2/3">
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

            {[
              ["post", t("modale.labels.post"), employee.post],
              [
                "dateOnPost",
                t("modale.labels.dateOnPost"),
                new Date(employee.dateOnPost).toLocaleDateString("fr-FR"),
              ],
              ["email", t("modale.labels.email"), employee.email],
              ["phone", t("modale.labels.phone"), employee.phone],
              [
                "secuNumber",
                t("modale.labels.secuNumber"),
                employee.secuNumber,
              ],
              ["address", t("modale.labels.address"), employee.address],
              [
                "emergencyContact",
                t("modale.labels.emergencyContact"),
                employee.emergencyContact,
              ],
            ].map(([field, label, value]) => {
              const isRequired = ![
                "secuNumber",
                "address",
                "emergencyContact",
              ].includes(field);
              return (
                <p key={field}>
                  <strong>{label} :</strong>{" "}
                  {isEditing ? (
                    <input
                      type={field === "dateOnPost" ? "date" : "text"}
                      {...regDetails(field, { required: isRequired })}
                      disabled={isSavingDetails}
                      className="p-2 border border-darkBlue/50 rounded-lg"
                      defaultValue={value}
                    />
                  ) : (
                    value
                  )}
                </p>
              );
            })}
          </div>

          {/* Photo */}
          <div className="relative w-44 h-44 flex-shrink-0 rounded-full overflow-hidden border border-darkBlue/20">
            {previewUrl ? (
              <img
                src={previewUrl}
                alt="aperçu"
                className="w-full h-full object-cover"
              />
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
                <EditSvg
                  width={24}
                  height={24}
                  strokeColor="#fff"
                  fillColor="#fff"
                />
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
                  address: employee.address,
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

      {/* Rights */}
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

      {/* Documents */}
      <section className="bg-white p-6 rounded-lg shadow">
        <h3 className="text-xl mb-4">{t("modale.labels.documents")}</h3>

        <input
          type="file"
          multiple
          accept=".pdf,image/*"
          onChange={onDocsChange}
          disabled={isUploadingDocs}
          className="mb-4"
        />

        {docs.length > 0 && (
          <ul className="list-disc pl-5 mb-4">
            {docs.map((f, i) => (
              <li key={i}>{f.name}</li>
            ))}
          </ul>
        )}

        <button
          onClick={onSaveDocs}
          disabled={isUploadingDocs || docs.length === 0}
          className="px-4 py-2 bg-blue text-white rounded-lg disabled:opacity-40"
        >
          {isUploadingDocs ? t("buttons.loading") : t("buttons.save")}
        </button>

        {employee.documents?.length > 0 && (
  <div className="mt-6">
    <h4 className="font-semibold mb-2">
      {t("modale.labels.uploadedDocuments")}
    </h4>
    <ul className="grid grid-cols-4 gap-6">
      {employee.documents.map((doc) => (
        <li
          key={doc.public_id}
          className="flex flex-col gap-4 items-center p-4 bg-white rounded-lg shadow-lg"
        >
          <p>{doc.filename}</p>

          <div className="flex w-full justify-between">
            {/* Bouton Voir */}
            <div className="w-1/2 flex flex-col items-center">
              <a href={doc.url} target="_blank" rel="noopener noreferrer">
                <button
                  type="button"
                  className="inline-flex items-center justify-center
                             bg-[#4ead7a99] hover:bg-[#4ead7a]
                             p-2 rounded-full transition-colors duration-300"
                >
                  <VisibleSvg
                    width={15}
                    height={15}
                    strokeColor="white"
                    fillColor="white"
                  />
                </button>
              </a>
              <p className="text-xs text-center mt-1">Voir</p>
            </div>

            {/* Bouton Supprimer */}
            <div className="w-1/2 flex flex-col items-center">
              <button
                onClick={() => onDeleteDoc(doc.public_id)}
                disabled={isDeletingDocId === doc.public_id}
                className="inline-flex items-center justify-center
                           bg-[#FF766499] hover:bg-[#FF7664]
                           p-2 rounded-full transition-colors duration-300
                           disabled:opacity-40"
              >
                <DeleteSvg
                  width={15}
                  height={15}
                  strokeColor="white"
                  fillColor="white"
                />
              </button>
              <p className="text-xs text-center mt-1">
                {t("buttons.delete")}
              </p>
            </div>
          </div>
        </li>
      ))}
    </ul>
  </div>
)}

      </section>
    </section>
  );
}
