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
            message:  "Cet email est déjà utilisé.",
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
    <div className="flex flex-col gap-6 bg-white rounded-lg drop-shadow-sm p-6">
      <h1 className="text-xl text-center font-semibold">
        {t("titles.general")}
      </h1>

      <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-4">
        <div className="grid grid-cols-1 gap-4 tablet:grid-cols-2">
          <div className="flex flex-col gap-1">
            <label>{t("form.general.labels.firstname")}</label>
            <input
              type="text"
              {...register("firstname", { required: true })}
              className={`p-2 border rounded-lg ${errors.firstname ? "border-red" : ""}`}
            />
          </div>

          <div className="flex flex-col gap-1">
            <label>{t("form.general.labels.lastname")}</label>
            <input
              type="text"
              {...register("lastname", { required: true })}
              className={`p-2 border rounded-lg ${errors.lastname ? "border-red" : ""}`}
            />
          </div>

          <div className="flex flex-col gap-1 relative">
            <label>{t("form.general.labels.email")}</label>
            <input
              type="email"
              {...register("email", { required: true })}
              className={`p-2 border rounded-lg ${errors.email ? "border-red" : ""}`}
            />
            {errors.email && (
              <p className="text-red text-xs mt-1">{errors.email.message}</p>
            )}
          </div>

          <div className="flex flex-col gap-1">
            <label>{t("form.general.labels.phone")}</label>
            <input
              type="text"
              {...register("phoneNumber", { required: true })}
              className={`p-2 border rounded-lg ${errors.phoneNumber ? "border-red" : ""}`}
            />
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
