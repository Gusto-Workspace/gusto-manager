import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import axios from "axios";
import { useTranslation } from "next-i18next";
import { jwtDecode } from "jwt-decode";

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
  } = useForm({
    defaultValues: {
      firstname: "",
      lastname: "",
      email: "",
      phoneNumber: "",
    },
  });

  const [isSubmitting, setIsSubmitting] = useState(false);

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
    "inline-flex items-center justify-center rounded-xl bg-blue px-4 py-2.5 text-sm font-medium text-white shadow hover:bg-blue/90 transition disabled:opacity-60 disabled:cursor-not-allowed";

  // Pré-remplissage quand userData arrive ou change
  useEffect(() => {
    if (!userData) return;
    const isOwner = role === "owner";
    reset({
      firstname: userData.firstname || "",
      lastname: userData.lastname || "",
      email: userData.email || "",
      phoneNumber: isOwner ? userData.phoneNumber || "" : userData.phone || "",
    });
  }, [userData, role, reset]);

  function onSubmit(data) {
    setIsSubmitting(true);
    const endpoint =
      role === "owner"
        ? `${process.env.NEXT_PUBLIC_API_URL}/owner/update-data`
        : `${process.env.NEXT_PUBLIC_API_URL}/employees/update-data`;

    axios
      .put(endpoint, data, {
        headers: { Authorization: `Bearer ${localStorage.getItem("token")}` },
      })
      .then((res) => {
        const newToken = res.data?.token;
        if (newToken) {
          localStorage.setItem("token", newToken);
          const decoded = jwtDecode(newToken);
          restaurantContext.setUserConnected(decoded);
        }
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
                  required:
                    t("form.errors.required") || "Ce champ est requis.",
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
                  required:
                    t("form.errors.required") || "Ce champ est requis.",
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
                  required:
                    t("form.errors.required") || "Ce champ est requis.",
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
                  required:
                    t("form.errors.required") || "Ce champ est requis.",
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

          <div className="pt-1 flex justify-start">
            <button
              type="submit"
              className={btnPrimary}
              disabled={isSubmitting}
            >
              {isSubmitting ? t("buttons.loading") : t("buttons.save")}
            </button>
          </div>
        </form>
      </div>
    </section>
  );
}
