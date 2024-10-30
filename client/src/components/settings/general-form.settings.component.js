import { useEffect, useState } from "react";

// REACT HOOK FORM
import { useForm } from "react-hook-form";

// AXIOS
import axios from "axios";

// I18N
import { useTranslation } from "next-i18next";

export default function GeneralFormSettingsComponent(props) {
  const { t } = useTranslation("settings");

  const {
    register,
    handleSubmit,
    setValue,
    formState: { errors },
  } = useForm();
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (props.ownerData) {
      setValue("firstname", props.ownerData.firstname);
      setValue("lastname", props.ownerData.lastname);
      setValue("email", props.ownerData.email);
      setValue("phoneNumber", props.ownerData.phoneNumber);
    }
  }, [props.ownerData, setValue]);

  function onSubmit(data) {
    setIsSubmitting(true);
    axios
      .put(`${process.env.NEXT_PUBLIC_API_URL}/owner/update-data`, data, {
        headers: { Authorization: `Bearer ${localStorage.getItem("token")}` },
      })
      .then(() => {
        props.fetchOwnerData();
      })
      .catch((error) => {
        console.error("Erreur lors de la mise à jour :", error);
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
            <label className="">{t("form.general.labels.firstname")}</label>

            <input
              type="text"
              {...register("firstname", { required: true })}
              className={`p-2 border rounded-lg ${errors.firstname ? "border-red" : ""}`}
            />
          </div>

          <div className="flex flex-col gap-1">
            <label className="">{t("form.general.labels.lastname")}</label>
            <input
              type="text"
              {...register("lastname", { required: true })}
              className={`p-2 border rounded-lg ${errors.lastname ? "border-red" : ""}`}
            />
          </div>

          <div className="flex flex-col gap-1">
            <label className="">{t("form.general.labels.email")}</label>
            <input
              type="email"
              {...register("email", { required: true })}
              className={`p-2 border rounded-lg ${errors.email ? "border-red" : ""}`}
            />
          </div>

          <div className="flex flex-col gap-1">
            <label className="">{t("form.general.labels.phone")}</label>

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
