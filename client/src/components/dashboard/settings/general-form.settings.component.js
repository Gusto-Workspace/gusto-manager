import { useEffect, useState, useRef } from "react";
import { useForm } from "react-hook-form";
import axios from "axios";
import { useTranslation } from "next-i18next";
import { jwtDecode } from "jwt-decode";
import { AvatarSvg } from "@/components/_shared/_svgs/_index";

export default function GeneralFormSettingsComponent({
  role,
  userData,
  fetchUserData,
  restaurantContext,
}) {
  const { t } = useTranslation("settings");

  const {
    register,
    handleSubmit,
    formState: { errors },
    reset,
    setError,
    watch,
  } = useForm({
    defaultValues: {
      firstname: "",
      lastname: "",
      email: "",
      phoneNumber: "",
    },
  });

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [successMessage, setSuccessMessage] = useState(null);

  // 🔹 État pour la photo de profil (uniquement utilisé si role === "employee")
  const [profilePreview, setProfilePreview] = useState(null);
  const [profileFile, setProfileFile] = useState(null);
  const [profileHasError, setProfileHasError] = useState(false);
  const [removeProfilePicture, setRemoveProfilePicture] = useState(false);

  const fileInputRef = useRef(null);

  // 🔹 Snapshots initiaux pour détecter les changements
  const initialValuesRef = useRef(null);
  const initialPhotoUrlRef = useRef(null);

  // ---- Styles communs ----
  const cardCls =
    "rounded-2xl border border-darkBlue/10 bg-white/50 px-4 py-5 tablet:px-6 tablet:py-6 shadow-[0_18px_45px_rgba(19,30,54,0.06)] flex flex-col gap-5";
  const headerBadgeCls =
    "inline-flex h-7 px-3 items-center justify-center rounded-full bg-darkBlue/5 text-[11px] font-semibold uppercase tracking-[0.14em] text-darkBlue";
  const fieldWrap = "flex flex-col gap-1.5";
  const labelCls =
    "text-xs font-semibold uppercase tracking-[0.08em] text-darkBlue/70";
  const inputCls =
    "h-11 w-full rounded-xl border border-darkBlue/10 bg-white/90 px-3 text-sm outline-none transition placeholder:text-darkBlue/40 focus:border-blue/60 focus:ring-1 focus:ring-blue/30";
  const errorTextCls = "text-[11px] text-red mt-0.5";
  const btnPrimary =
    "inline-flex items-center w-full midTablet:w-fit justify-center rounded-xl bg-blue px-4 py-2.5 text-sm font-medium text-white shadow hover:bg-blue/90 transition disabled:opacity-60 disabled:cursor-not-allowed";
  const btnGhost =
    "inline-flex items-center justify-center rounded-xl border border-darkBlue/15 bg-white/70 px-3 py-1.5 text-xs font-medium text-darkBlue/80 hover:bg-darkBlue/5 transition disabled:opacity-50 disabled:cursor-not-allowed";

  // 🔹 Register spécial pour brancher RHF sur l'input file
  const {
    ref: profileRHFRef,
    onChange: profileRHFOnChange,
    ...profileInputProps
  } = register("profilePicture");

  // Pré-remplissage quand userData arrive ou change
  useEffect(() => {
    if (!userData) return;
    const isOwner = role === "owner";

    const formDefaults = {
      firstname: userData.firstname || "",
      lastname: userData.lastname || "",
      email: userData.email || "",
      phoneNumber: isOwner ? userData.phoneNumber || "" : userData.phone || "",
    };

    reset(formDefaults);
    initialValuesRef.current = formDefaults;

    // 🔹 Pré-remplir la preview photo pour l'employé
    if (role === "employee") {
      const existingUrl = userData.profilePicture?.url || null;
      setProfilePreview(existingUrl);
      setProfileFile(null);
      setProfileHasError(false);
      setRemoveProfilePicture(false);
      initialPhotoUrlRef.current = existingUrl;

      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    } else {
      initialPhotoUrlRef.current = null;
    }
  }, [userData, role, reset]);

  function handleProfileChange(e) {
    // on laisse RHF suivre le champ
    profileRHFOnChange(e);

    const file = e.target.files?.[0] || null;

    if (file) {
      // limite 10 Mo
      if (file.size > 10 * 1024 * 1024) {
        setProfileHasError(true);
        setProfileFile(null);
        setProfilePreview(null);
        setRemoveProfilePicture(false);
        return;
      }
      setProfileHasError(false);
      setProfileFile(file);
      setRemoveProfilePicture(false);

      const reader = new FileReader();
      reader.onload = () => {
        setProfilePreview(reader.result);
      };
      reader.readAsDataURL(file);
    } else {
      // aucune nouvelle sélection
      setProfileFile(null);
      setProfileHasError(false);

      // on revient à la photo existante (si présente) et on annule le "remove"
      setProfilePreview(userData?.profilePicture?.url || null);
      setRemoveProfilePicture(false);
    }
  }

  function handleRemoveProfile() {
    // côté UI : plus de preview image, plus de fichier
    setProfileFile(null);
    setProfilePreview(null);
    setProfileHasError(false);
    setRemoveProfilePicture(true);

    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  }

  function onSubmit(data) {
    setIsSubmitting(true);
    setSuccessMessage(null);

    const endpoint =
      role === "owner"
        ? `${process.env.NEXT_PUBLIC_API_URL}/owner/update-data`
        : `${process.env.NEXT_PUBLIC_API_URL}/employees/update-data`;

    // 🔹 Cas OWNER : on reste en JSON simple
    if (role === "owner") {
      axios
        .put(endpoint, data, {
          headers: {
            Authorization: `Bearer ${localStorage.getItem("token")}`,
          },
        })
        .then(() => {
          setSuccessMessage("Modifications effectuées");
          fetchUserData();
        })
        .catch((error) => {
          if (error.response?.status === 409) {
            setError("email", {
              type: "manual",
              message: "Cet email est déjà utilisé.",
            });
          } else {
            console.error("Erreur lors de la mise à jour :", error);
          }
        })
        .finally(() => {
          setIsSubmitting(false);
        });

      return;
    }

    // 🔹 Cas EMPLOYEE : multipart/form-data + profilePicture optionnelle
    const formData = new FormData();
    formData.append("firstname", data.firstname);
    formData.append("lastname", data.lastname);
    formData.append("email", data.email);
    formData.append("phone", data.phoneNumber || "");

    if (profileFile) {
      formData.append("profilePicture", profileFile);
    }
    if (removeProfilePicture && !profileFile) {
      formData.append("removeProfilePicture", "true");
    }

    axios
      .put(endpoint, formData, {
        headers: {
          Authorization: `Bearer ${localStorage.getItem("token")}`,
          "Content-Type": "multipart/form-data",
        },
      })
      .then((res) => {
        const newToken = res.data?.token;
        if (newToken) {
          localStorage.setItem("token", newToken);
          const decoded = jwtDecode(newToken);
          restaurantContext.setUserConnected(decoded);
        }
        setSuccessMessage("Modifications effectuées");
        fetchUserData();
      })
      .catch((error) => {
        if (error.response?.status === 409) {
          setError("email", {
            type: "manual",
            message: "Cet email est déjà utilisé.",
          });
        } else {
          console.error("Erreur lors de la mise à jour :", error);
        }
      })
      .finally(() => {
        setIsSubmitting(false);
      });
  }

  // ---------- Détection des changements (form + photo) ----------
  const currentValues = watch();

  let hasBaseChanges = false;
  if (initialValuesRef.current) {
    for (const key of ["firstname", "lastname", "email", "phoneNumber"]) {
      const initialVal = initialValuesRef.current[key] || "";
      const currentVal = currentValues[key] || "";
      if (initialVal !== currentVal) {
        hasBaseChanges = true;
        break;
      }
    }
  }

  const hasPhotoChanges =
    role === "employee" &&
    (Boolean(profileFile) ||
      removeProfilePicture ||
      (initialPhotoUrlRef.current || null) !== (profilePreview || null));

  const hasChanges = hasBaseChanges || hasPhotoChanges;

  const isReady = Boolean(userData);

  return (
    <section className="flex flex-col gap-4">
      <div className={cardCls}>
        {/* Header / badge */}
        <div className="flex items-center justify-between gap-2">
          <span className={headerBadgeCls}>{t("titles.general")}</span>
        </div>

        <form
          onSubmit={handleSubmit(onSubmit)}
          className="mt-2 flex flex-col gap-4"
        >
          <div className="grid grid-cols-1 gap-4 tablet:grid-cols-2">
            {/* Prénom */}
            <div className={fieldWrap}>
              <label className={labelCls}>
                {t("form.general.labels.firstname")}
                <span className="ml-1 text-red">*</span>
              </label>
              <input
                type="text"
                {...register("firstname", {
                  required: t("form.errors.required") || "Ce champ est requis.",
                })}
                className={`${inputCls} ${
                  errors.firstname ? "border-red ring-1 ring-red/30" : ""
                }`}
              />
              {errors.firstname && (
                <p className={errorTextCls}>{errors.firstname.message}</p>
              )}
            </div>

            {/* Nom */}
            <div className={fieldWrap}>
              <label className={labelCls}>
                {t("form.general.labels.lastname")}
                <span className="ml-1 text-red">*</span>
              </label>
              <input
                type="text"
                {...register("lastname", {
                  required: t("form.errors.required") || "Ce champ est requis.",
                })}
                className={`${inputCls} ${
                  errors.lastname ? "border-red ring-1 ring-red/30" : ""
                }`}
              />
              {errors.lastname && (
                <p className={errorTextCls}>{errors.lastname.message}</p>
              )}
            </div>

            {/* Email */}
            <div className={fieldWrap}>
              <label className={labelCls}>
                {t("form.general.labels.email")}
                <span className="ml-1 text-red">*</span>
              </label>
              <input
                type="email"
                {...register("email", {
                  required: t("form.errors.required") || "Ce champ est requis.",
                })}
                className={`${inputCls} ${
                  errors.email ? "border-red ring-1 ring-red/30" : ""
                }`}
              />
              {errors.email && (
                <p className={errorTextCls}>{errors.email.message}</p>
              )}
            </div>

            {/* Téléphone */}
            <div className={fieldWrap}>
              <label className={labelCls}>
                {t("form.general.labels.phone")}
                <span className="ml-1 text-red">*</span>
              </label>
              <input
                type="text"
                {...register("phoneNumber", {
                  required: t("form.errors.required") || "Ce champ est requis.",
                })}
                className={`${inputCls} ${
                  errors.phoneNumber ? "border-red ring-1 ring-red/30" : ""
                }`}
              />
              {errors.phoneNumber && (
                <p className={errorTextCls}>{errors.phoneNumber.message}</p>
              )}
            </div>
          </div>

          {/* Photo de profil — uniquement pour les employés */}
          {role === "employee" && (
            <div className="mt-2 rounded-2xl border border-darkBlue/10 bg-[#f7f8fc] px-4 py-4 flex flex-col gap-4 tablet:flex-row tablet:items-center tablet:justify-between">
              {/* Avatar + texte */}
              <div className="flex items-center gap-3">
                <div className="relative w-20 h-20 rounded-full border border-darkBlue/10 bg-gradient-to-br from-darkBlue/5 to-darkBlue/10 flex items-center justify-center overflow-hidden">
                  {profilePreview ? (
                    <img
                      src={profilePreview}
                      alt="Photo de profil"
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <AvatarSvg width={56} height={56} fillColor="#131E3690" />
                  )}
                </div>

                <div className="flex flex-col gap-0.5">
                  <span className="text-sm font-medium text-darkBlue">
                    {userData?.firstname} {userData?.lastname}
                  </span>
                  <span className="text-[11px] text-darkBlue/60">
                    {profilePreview
                      ? t(
                          "form.general.labels.profilePictureSet",
                          "Photo de profil définie."
                        )
                      : t(
                          "form.general.labels.noProfilePicture",
                          "Aucune photo pour le moment."
                        )}
                  </span>
                </div>
              </div>

              {/* Actions upload / suppression */}
              <div className="flex flex-col items-start gap-2 tablet:items-end tablet:text-right">
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    className="inline-flex items-center justify-center rounded-xl bg-blue px-3 py-1.5 text-xs font-medium text-white shadow hover:bg-blue/90 transition disabled:opacity-60"
                    onClick={() => fileInputRef.current?.click()}
                    disabled={isSubmitting}
                  >
                    {profilePreview
                      ? t(
                          "form.general.labels.changeProfilePicture",
                          "Changer la photo"
                        )
                      : t(
                          "form.general.labels.addProfilePicture",
                          "Ajouter une photo"
                        )}
                  </button>

                  {profilePreview && (
                    <button
                      type="button"
                      className={btnGhost}
                      onClick={handleRemoveProfile}
                      disabled={isSubmitting}
                    >
                      {t(
                        "form.general.labels.removeProfilePicture",
                        "Supprimer la photo"
                      )}
                    </button>
                  )}
                </div>

                <p className="text-[11px] text-darkBlue/50">
                  JPG, PNG, WEBP – 10 Mo max
                </p>

                {/* input file caché */}
                <input
                  id="profilePicture"
                  type="file"
                  accept="image/*"
                  {...profileInputProps}
                  ref={(el) => {
                    profileRHFRef(el);
                    fileInputRef.current = el;
                  }}
                  className="hidden"
                  onChange={handleProfileChange}
                />

                {profileHasError && (
                  <p className={errorTextCls}>
                    {t(
                      "form.general.errors.profilePictureTooBig",
                      "La photo ne doit pas dépasser 10 Mo."
                    )}
                  </p>
                )}
              </div>
            </div>
          )}

          <div className="pt-1 flex flex-col gap-2 tablet:flex-row tablet:items-center tablet:justify-between">
            <button
              type="submit"
              className={btnPrimary}
              disabled={isSubmitting || !hasChanges || !isReady}
            >
              {isSubmitting ? t("buttons.loading") : t("buttons.save")}
            </button>

            {successMessage && (
              <p className="text-xs text-[#166534] bg-[#16a34a0d] border border-[#16a34a40] rounded-full px-3 py-1 inline-flex items-center">
                {successMessage}
              </p>
            )}
          </div>
        </form>
      </div>
    </section>
  );
}
