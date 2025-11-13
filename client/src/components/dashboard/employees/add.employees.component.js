import { useState, useContext, useRef } from "react";
import { useRouter } from "next/router";

// REACT HOOK FORM
import { useForm } from "react-hook-form";

// AXIOS
import axios from "axios";

// CONTEXT
import { GlobalContext } from "@/contexts/global.context";

// I18N
import { useTranslation } from "next-i18next";

// SVG
import { EmployeesSvg, RemoveSvg, UploadSvg } from "../../_shared/_svgs/_index";

// ICONS LUCIDE
import {
  User,
  Mail,
  Phone,
  Briefcase,
  CalendarDays,
  Shield,
  Home,
  PhoneCall,
  Image as ImageIcon,
} from "lucide-react";

export default function AddEmployeesComponent() {
  const { t } = useTranslation("employees");
  const { restaurantContext } = useContext(GlobalContext);
  const [isLoading, setIsLoading] = useState(false);

  // état pour la photo de profil
  const [profilePreview, setProfilePreview] = useState(null);
  const [profileFile, setProfileFile] = useState(null);
  const [profileHasError, setProfileHasError] = useState(false);

  const fileInputRef = useRef(null);

  const router = useRouter();

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitted },
  } = useForm();

  async function onSubmit(data) {
    const url = `${process.env.NEXT_PUBLIC_API_URL}/restaurants/${restaurantContext.restaurantData._id}/employees`;
    const formData = new FormData();
    formData.append("lastName", data.lastName);
    formData.append("firstName", data.firstName);
    formData.append("email", data.email);
    formData.append("phone", data.phone);
    formData.append("post", data.post);
    formData.append("dateOnPost", data.dateOnPost);
    formData.append("secuNumber", data.secuNumber || "");
    formData.append("address", data.address || "");
    formData.append("emergencyContact", data.emergencyContact || "");

    if (profileFile) {
      formData.append("profilePicture", profileFile);
    }

    setIsLoading(true);
    try {
      const response = await axios.post(url, formData, {
        headers: { "Content-Type": "multipart/form-data" },
      });
      restaurantContext.setRestaurantData((prev) => ({
        ...prev,
        employees: response.data.restaurant.employees,
      }));
      reset();
      setProfileFile(null);
      setProfilePreview(null);
      router.replace("/dashboard/employees");
    } catch (err) {
      console.error("Error creating employee:", err);
    } finally {
      setIsLoading(false);
    }
  }

  // styles communs (mêmes vibes que FridgeTemperatureForm)
  const fieldWrap =
    "group relative rounded-xl bg-white/50 backdrop-blur-sm px-3 py-2 h-[80px] transition-shadow";
  const labelCls =
    "flex items-center gap-2 text-xs font-medium text-darkBlue/60 mb-1";
  const inputBaseCls =
    "h-11 w-full rounded-lg border bg-white px-3 text-[15px] outline-none transition placeholder:text-darkBlue/40";
  const inputNormalCls = `${inputBaseCls} border-darkBlue/20`;
  const inputErrorCls = `${inputBaseCls} border-red`;

  // déstructuration spéciale pour brancher RHF + gestion custom du file
  const {
    ref: profileRHFRef,
    onChange: profileRHFOnChange,
    ...profileInputProps
  } = register("profilePicture");

  function handleProfileChange(e) {
    profileRHFOnChange(e); // on laisse RHF suivre le champ

    const file = e.target.files?.[0] || null;

    if (file) {
      // limite 10 Mo
      if (file.size > 10 * 1024 * 1024) {
        setProfileHasError(true);
        setProfileFile(null);
        setProfilePreview(null);
        return;
      }
      setProfileHasError(false);
      setProfileFile(file);

      const reader = new FileReader();
      reader.onload = () => {
        setProfilePreview(reader.result);
      };
      reader.readAsDataURL(file);
    } else {
      setProfileFile(null);
      setProfilePreview(null);
      setProfileHasError(false);
    }
  }

  function handleRemoveProfile() {
    setProfileFile(null);
    setProfilePreview(null);
    setProfileHasError(false);
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  }

  return (
    <section className="flex flex-col gap-6">
      <hr className="opacity-20" />

      <div className="flex justify-between flex-wrap gap-4">
        <div className="flex flex-col gap-4">
          <div className="flex items-center gap-2 min-h-[40px]">
            <EmployeesSvg width={30} height={30} fillColor="#131E3690" />

            <h1 className="pl-2 text-xl tablet:text-2xl flex items-center gap-2 flex-wrap">
              <span>{t("employees:titles.main")}</span>
              <span>/</span>
              <span>Ajouter</span>
            </h1>
          </div>
        </div>
      </div>

      <form
        onSubmit={handleSubmit(onSubmit)}
        className="relative flex flex-col gap-3"
      >
        {/* Grid des champs */}
        <div className="grid grid-cols-1 midTablet:grid-cols-3 gap-2">
          {/* Nom */}
          <div className="w-full">
            <div className={fieldWrap}>
              <label htmlFor="lastName" className={labelCls}>
                <User className="size-4" />
                {t("labels.lastname")}
              </label>
              <input
                id="lastName"
                type="text"
                {...register("lastName", { required: true })}
                className={
                  errors.lastName && isSubmitted ? inputErrorCls : inputNormalCls
                }
              />
            </div>
          </div>

          {/* Prénom */}
          <div className="w-full">
            <div className={fieldWrap}>
              <label htmlFor="firstName" className={labelCls}>
                <User className="size-4" />
                {t("labels.firstname")}
              </label>
              <input
                id="firstName"
                type="text"
                {...register("firstName", { required: true })}
                className={
                  errors.firstName && isSubmitted
                    ? inputErrorCls
                    : inputNormalCls
                }
              />
            </div>
          </div>

          {/* Email */}
          <div className="w-full">
            <div className={fieldWrap}>
              <label htmlFor="email" className={labelCls}>
                <Mail className="size-4" />
                {t("labels.email")}
              </label>
              <input
                id="email"
                type="email"
                {...register("email", { required: true })}
                className={
                  errors.email && isSubmitted ? inputErrorCls : inputNormalCls
                }
              />
            </div>
          </div>

          {/* Téléphone */}
          <div className="w-full">
            <div className={fieldWrap}>
              <label htmlFor="phone" className={labelCls}>
                <Phone className="size-4" />
                {t("labels.phone")}
              </label>
              <input
                id="phone"
                type="text"
                {...register("phone", { required: true })}
                className={
                  errors.phone && isSubmitted ? inputErrorCls : inputNormalCls
                }
              />
            </div>
          </div>

          {/* Poste */}
          <div className="w-full">
            <div className={fieldWrap}>
              <label htmlFor="post" className={labelCls}>
                <Briefcase className="size-4" />
                {t("labels.post")}
              </label>
              <input
                id="post"
                type="text"
                {...register("post", { required: true })}
                className={
                  errors.post && isSubmitted ? inputErrorCls : inputNormalCls
                }
              />
            </div>
          </div>

          {/* Date de prise de poste */}
          <div className="w-full">
            <div className={fieldWrap}>
              <label htmlFor="dateOnPost" className={labelCls}>
                <CalendarDays className="size-4" />
                {t("labels.dateOnPost")}
              </label>
              <input
                id="dateOnPost"
                type="date"
                {...register("dateOnPost", { required: true })}
                className={
                  errors.dateOnPost && isSubmitted
                    ? inputErrorCls
                    : inputNormalCls
                }
              />
            </div>
          </div>

          {/* Numéro de SS */}
          <div className="w-full">
            <div className={fieldWrap}>
              <label htmlFor="secuNumber" className={labelCls}>
                <Shield className="size-4" />
                {t("labels.secuNumber")}
              </label>
              <input
                id="secuNumber"
                type="text"
                {...register("secuNumber")}
                className={
                  errors.secuNumber && isSubmitted
                    ? inputErrorCls
                    : inputNormalCls
                }
              />
            </div>
          </div>

          {/* Adresse */}
          <div className="w-full">
            <div className={fieldWrap}>
              <label htmlFor="address" className={labelCls}>
                <Home className="size-4" />
                {t("labels.address")}
              </label>
              <input
                id="address"
                type="text"
                {...register("address")}
                className={
                  errors.address && isSubmitted ? inputErrorCls : inputNormalCls
                }
              />
            </div>
          </div>

          {/* Contact urgence */}
          <div className="w-full">
            <div className={fieldWrap}>
              <label htmlFor="emergencyContact" className={labelCls}>
                <PhoneCall className="size-4" />
                {t("labels.emergencyContact")}
              </label>
              <input
                id="emergencyContact"
                type="text"
                {...register("emergencyContact")}
                className={
                  errors.emergencyContact && isSubmitted
                    ? inputErrorCls
                    : inputNormalCls
                }
              />
            </div>
          </div>

          {/* Photo de profil : input custom + preview */}
          <div className="w-full">
            <div
              className={`${fieldWrap} h-auto ${
                profileHasError ? "ring-1 ring-red/60" : ""
              }`}
            >
              <label className={labelCls}>
                <ImageIcon className="size-4" />
                {t("labels.profilePicture")}
              </label>

              <div className="flex flex-col gap-3">
                {/* zone cliquable */}
                <label
                  htmlFor="profilePicture"
                  className={`flex flex-col justify-center items-center w-full h-[150px] p-3 border border-dashed rounded-lg cursor-pointer transition ${
                    profileHasError
                      ? "border-red bg-red/5"
                      : "border-darkBlue/20 hover:border-darkBlue/40 bg-white/60"
                  }`}
                >
                  <div className="flex flex-col items-center justify-center pt-2 pb-2 gap-2">
                    <UploadSvg width={32} height={32} />
                    <p className="text-sm text-center font-semibold text-darkBlue/80">
                      {profileFile
                        ? profileFile.name
                        : "Choisir une photo ou prendre une photo"}
                    </p>
                    <p className="text-xs text-darkBlue/50">
                      JPG, PNG, WEBP – 10 Mo max
                    </p>
                  </div>

                  {/* vrai input file caché */}
                  <input
                    id="profilePicture"
                    type="file"
                    accept="image/*"
                    capture="environment"
                    {...profileInputProps}
                    ref={(el) => {
                      profileRHFRef(el);
                      fileInputRef.current = el;
                    }}
                    className="hidden"
                    onChange={handleProfileChange}
                  />
                </label>

                {/* Preview + bouton supprimer */}
                {profilePreview && (
                  <div className="relative mx-auto max-w-[120px] rounded-lg overflow-hidden group">
                    <img
                      src={profilePreview}
                      alt="Prévisualisation photo de profil"
                      className="w-full h-auto object-cover"
                    />
                    <button
                      type="button"
                      onClick={handleRemoveProfile}
                      className="absolute inset-0 flex items-center justify-center bg-black/0 group-hover:bg-black/50 transition"
                    >
                      <RemoveSvg width={40} height={40} fillColor="white" />
                    </button>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Actions */}
        <div className="mt-2 flex flex-col mobile:flex-row gap-2">
          <button
            type="submit"
            disabled={isLoading}
            className="inline-flex items-center justify-center gap-2 rounded-lg bg-blue px-4 py-2 text-sm font-medium text-white shadow disabled:opacity-60"
          >
            {isLoading ? t("buttons.loading") : t("buttons.save")}
          </button>

          <button
            type="button"
            onClick={() => router.replace("/dashboard/employees")}
            disabled={isLoading}
            className="inline-flex items-center justify-center gap-2 rounded-lg border border-red bg-red px-4 py-2 text-sm font-medium text-white"
          >
            {t("buttons.cancel")}
          </button>
        </div>
      </form>
    </section>
  );
}
