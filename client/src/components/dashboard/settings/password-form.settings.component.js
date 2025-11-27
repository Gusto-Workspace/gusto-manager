import { useState, useContext } from "react";
import { useForm } from "react-hook-form";
import axios from "axios";
import { useTranslation } from "next-i18next";
import { GlobalContext } from "@/contexts/global.context";
import { NoVisibleSvg, VisibleSvg } from "../../_shared/_svgs/_index";

export default function PasswordFormSettingsComponent() {
  const { t } = useTranslation("settings");
  const { restaurantContext } = useContext(GlobalContext);
  const isOwner = restaurantContext?.userConnected?.role === "owner";

  const {
    register,
    handleSubmit,
    formState: { errors },
    setError,
    reset,
    watch,
  } = useForm();

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showCurrentPassword, setShowCurrentPassword] = useState(false);
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [passwordError, setPasswordError] = useState(null);
  const [passwordSuccess, setPasswordSuccess] = useState(null);

  // ---- Styles communs ----
  const cardCls =
    "rounded-2xl border border-darkBlue/10 bg-white/80 px-4 py-5 tablet:px-6 tablet:py-6 shadow-[0_18px_45px_rgba(19,30,54,0.06)] flex flex-col gap-5";
  const headerBadgeCls =
    "inline-flex h-7 px-3 items-center justify-center rounded-full bg-darkBlue/5 text-[11px] font-semibold uppercase tracking-[0.14em] text-darkBlue";
  const fieldWrap = "flex flex-col gap-1.5 midTablet:w-1/2";
  const labelCls =
    "text-xs font-semibold uppercase tracking-[0.08em] text-darkBlue/70";
  const inputCls =
    "h-11 w-full rounded-xl border border-darkBlue/10 bg-white/90 px-3 pr-9 text-sm outline-none transition placeholder:text-darkBlue/40 focus:border-blue/60 focus:ring-1 focus:ring-blue/30";
  const errorTextCls = "text-[11px] text-red mt-0.5";
  const btnPrimary =
    "inline-flex items-center w-full midTablet:w-fit justify-center rounded-xl bg-blue px-4 py-2.5 text-sm font-medium text-white shadow hover:bg-blue/90 transition disabled:opacity-60 disabled:cursor-not-allowed";

  const currentPasswordValue = watch("currentPassword");
  const newPasswordValue = watch("newPassword");
  const confirmNewPasswordValue = watch("confirmNewPassword");

  // 🔹 Bouton enabled seulement si au moins un champ est rempli
  const hasChanges =
    !!currentPasswordValue || !!newPasswordValue || !!confirmNewPasswordValue;

  function onSubmit(data) {
    setIsSubmitting(true);
    setPasswordError(null);
    setPasswordSuccess(null);

    const endpoint = isOwner
      ? `${process.env.NEXT_PUBLIC_API_URL}/owner/update-password`
      : `${process.env.NEXT_PUBLIC_API_URL}/employees/update-password`;

    const { confirmNewPassword, ...payload } = data;

    axios
      .put(endpoint, payload, {
        headers: { Authorization: `Bearer ${localStorage.getItem("token")}` },
      })
      .then(() => {
        setPasswordSuccess("Modifications effectuées");
        reset({ currentPassword: "", newPassword: "", confirmNewPassword: "" });
        setShowCurrentPassword(false);
        setShowNewPassword(false);
        setShowConfirmPassword(false);
      })
      .catch((error) => {
        if (error.response?.status === 401) {
          setError("currentPassword", { type: "manual" });
          setPasswordError(t("form.errors.current"));
        } else if (error.response?.status === 403) {
          setPasswordError(t("form.errors.forbidden") || "Accès refusé.");
        } else {
          setPasswordError(
            t("form.errors.generic") || "Une erreur est survenue."
          );
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
          <span className={headerBadgeCls}>{t("titles.password")}</span>
        </div>

        <form
          onSubmit={handleSubmit(onSubmit)}
          className="mt-2 flex flex-col gap-4"
        >
          {/* Ligne 1 : mot de passe actuel (1/2 largeur) */}
          <div className="flex flex-col midTablet:flex-row gap-4">
            <div className={fieldWrap}>
              <label className={labelCls}>
                {t("form.password.current")}
                <span className="ml-1 text-red">*</span>
              </label>
              <div className="relative">
                <input
                  type={showCurrentPassword ? "text" : "password"}
                  {...register("currentPassword", {
                    required:
                      t("form.errors.required") || "Ce champ est requis.",
                  })}
                  className={`${inputCls} ${
                    errors.currentPassword
                      ? "border-red ring-1 ring-red/30"
                      : ""
                  }`}
                />
                <button
                  type="button"
                  onClick={() => setShowCurrentPassword((prev) => !prev)}
                  className="absolute right-2 top-1/2 -translate-y-1/2"
                >
                  {showCurrentPassword ? (
                    <NoVisibleSvg width={20} height={20} />
                  ) : (
                    <VisibleSvg width={20} height={20} />
                  )}
                </button>
              </div>
              {passwordError && <p className={errorTextCls}>{passwordError}</p>}
              {errors.currentPassword && !passwordError && (
                <p className={errorTextCls}>{errors.currentPassword.message}</p>
              )}
            </div>

            {/* Colonne vide pour garder la grille alignée */}
            <div className="midTablet:w-1/2" />
          </div>

          {/* Ligne 2 : nouveau + confirmation */}
          <div className="flex flex-col midTablet:flex-row gap-4">
            {/* Nouveau mot de passe */}
            <div className={fieldWrap}>
              <label className={labelCls}>
                {t("form.password.new")}
                <span className="ml-1 text-red">*</span>
              </label>
              <div className="relative">
                <input
                  type={showNewPassword ? "text" : "password"}
                  {...register("newPassword", {
                    required: "Le nouveau mot de passe est requis.",
                    minLength: {
                      value: 6,
                      message:
                        "Le mot de passe doit contenir au moins 6 caractères.",
                    },
                  })}
                  className={`${inputCls} ${
                    errors.newPassword ? "border-red ring-1 ring-red/30" : ""
                  }`}
                />
                <button
                  type="button"
                  onClick={() => setShowNewPassword((prev) => !prev)}
                  className="absolute right-2 top-1/2 -translate-y-1/2"
                >
                  {showNewPassword ? (
                    <NoVisibleSvg width={20} height={20} />
                  ) : (
                    <VisibleSvg width={20} height={20} />
                  )}
                </button>
              </div>
              {errors.newPassword && (
                <p className={errorTextCls}>{errors.newPassword.message}</p>
              )}
            </div>

            {/* Confirmation mot de passe */}
            <div className={fieldWrap}>
              <label className={labelCls}>
                {t("Confirmer le nouveau mot de passe")}
                <span className="ml-1 text-red">*</span>
              </label>
              <div className="relative">
                <input
                  type={showConfirmPassword ? "text" : "password"}
                  {...register("confirmNewPassword", {
                    required: t("Ce champ est requis."),
                    validate: (value) =>
                      value === newPasswordValue ||
                      t("Les mots de passe ne correspondent pas."),
                  })}
                  className={`${inputCls} ${
                    errors.confirmNewPassword
                      ? "border-red ring-1 ring-red/30"
                      : ""
                  }`}
                />
                <button
                  type="button"
                  onClick={() => setShowConfirmPassword((prev) => !prev)}
                  className="absolute right-2 top-1/2 -translate-y-1/2"
                >
                  {showConfirmPassword ? (
                    <NoVisibleSvg width={20} height={20} />
                  ) : (
                    <VisibleSvg width={20} height={20} />
                  )}
                </button>
              </div>
              {errors.confirmNewPassword && (
                <p className={errorTextCls}>
                  {errors.confirmNewPassword.message}
                </p>
              )}
            </div>
          </div>

          {/* Bouton + message success */}
          <div className="pt-1 flex flex-col gap-2 tablet:flex-row tablet:items-center tablet:justify-between">
            <button
              type="submit"
              className={btnPrimary}
              disabled={isSubmitting || !hasChanges}
            >
              {isSubmitting ? t("buttons.loading") : t("buttons.save")}
            </button>

            {passwordSuccess && (
              <p className="text-xs text-[#166534] bg-[#16a34a0d] border border-[#16a34a40] rounded-full px-3 py-1 inline-flex items-center">
                {passwordSuccess}
              </p>
            )}
          </div>
        </form>
      </div>
    </section>
  );
}
