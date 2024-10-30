import { useState } from "react";

// REACT HOOK FORM
import { useForm } from "react-hook-form";

// AXIOS
import axios from "axios";

// I18N
import { useTranslation } from "next-i18next";

// SVG
import { NoVisibleSvg, VisibleSvg } from "../_shared/_svgs/_index";

export default function PasswordFormSettingsComponent(props) {
  const { t } = useTranslation("settings");
  const {
    register,
    handleSubmit,
    formState: { errors },
    setError,
    reset,
  } = useForm();

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showCurrentPassword, setShowCurrentPassword] = useState(false);
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [passwordError, setPasswordError] = useState(null);

  function onSubmit(data) {
    setIsSubmitting(true);
    axios
      .put(`${process.env.NEXT_PUBLIC_API_URL}/owner/update-password`, data, {
        headers: { Authorization: `Bearer ${localStorage.getItem("token")}` },
      })
      .then(() => {
        setPasswordError(null);
        reset({ currentPassword: "", newPassword: "" });
        setShowCurrentPassword(false);
        setShowNewPassword(false);
      })
      .catch((error) => {
        if (error.response?.status === 401) {
          setError("currentPassword", { type: "manual" });
          setPasswordError(t("form.errors.current"));
        }
      })
      .finally(() => {
        setIsSubmitting(false);
      });
  }

  return (
    <div className="flex flex-col gap-6 bg-white rounded-lg drop-shadow-sm p-6">
      <h1 className="text-xl text-center font-semibold">
        {t("titles.password")}
      </h1>

      <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-4">
        <div className="grid grid-cols-1 gap-4 tablet:grid-cols-2">
          <div className="flex gap-4 w-full relative">
            <div className="flex flex-col gap-1 w-full">
              <label className="">{t("form.password.current")}</label>

              <div className="relative">
                <input
                  type={showCurrentPassword ? "text" : "password"}
                  {...register("currentPassword", { required: true })}
                  className={`p-2 border rounded-lg w-full ${errors.currentPassword ? "border-red" : ""}`}
                />
                <button
                  type="button"
                  onClick={() => setShowCurrentPassword(!showCurrentPassword)}
                  className="absolute right-2 top-1/2 -translate-y-1/2"
                >
                  {showCurrentPassword ? (
                    <NoVisibleSvg width={20} height={20} />
                  ) : (
                    <VisibleSvg width={20} height={20} />
                  )}
                </button>

                {passwordError && (
                  <p className="text-red text-xs absolute -bottom-5 left-0">
                    {passwordError}
                  </p>
                )}
              </div>
            </div>
          </div>

          <div className="flex gap-4 w-full relative">
            <div className="flex flex-col gap-1 w-full">
              <label className="">{t("form.password.new")}</label>

              <div className="relative">
                <input
                  type={showNewPassword ? "text" : "password"}
                  {...register("newPassword", {
                    required: "Le nouveau mot de passe est requis.",
                    minLength: {
                      value: 6,
                      message: t("form.errors.new"),
                    },
                  })}
                  className={`p-2 border rounded-lg w-full ${errors.newPassword ? "border-red" : ""}`}
                />
                <button
                  type="button"
                  onClick={() => setShowNewPassword(!showNewPassword)}
                  className="absolute right-2 top-1/2 -translate-y-1/2"
                >
                  {showNewPassword ? (
                    <NoVisibleSvg width={20} height={20} />
                  ) : (
                    <VisibleSvg width={20} height={20} />
                  )}
                </button>

                {errors.newPassword && (
                  <p className="text-red text-xs absolute -bottom-5 left-0">
                    {errors.newPassword.message}
                  </p>
                )}
              </div>
            </div>
          </div>
        </div>

        <button
          type="submit"
          className="px-4 py-2 mt-2 mx-auto tablet:mx-0 text-white rounded-md bg-blue w-fit"
          disabled={isSubmitting}
        >
          {isSubmitting ? t("buttons.loading") : t("buttons.save")}
        </button>
      </form>
    </div>
  );
}
