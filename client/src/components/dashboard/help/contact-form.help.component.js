import { useState } from "react";

// REACT HOOK FORM
import { useForm } from "react-hook-form";

// AXIOS
import axios from "axios";

// I18N
import { useTranslation } from "next-i18next";

export default function ContactFormHelpComponent() {
  const { t } = useTranslation("help");

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm();
  const [loading, setLoading] = useState(false);
  const [messageSent, setMessageSent] = useState(null);

  function onSubmit(data) {
    setLoading(true);
    setMessageSent(null);

    axios
      .post("/api/contact-form-email", data)
      .then((response) => {
        if (response.status === 200) {
          setMessageSent(true);
          reset();
        }
      })
      .catch((error) => {
        console.error("Erreur lors de l'envoi du message :", error);
        setMessageSent(false);
      })
      .finally(() => {
        setLoading(false);
      });
  }

  return (
    <div className="w-full flex flex-col gap-4 max-w-[800px] mx-auto p-6 bg-white rounded-lg drop-shadow-sm">
      <h2 className="text-2xl font-semibold text-center mb-4">
        Contactez-nous
      </h2>

      <p>{t("description")}</p>

      <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-4">
        <div>
          <label className="block text-sm font-medium">
            {t("form.labels.name")}
          </label>

          <input
            type="text"
            {...register("name", { required: true })}
            className={`p-2 mt-1 block w-full border ${errors.name ? "border-red" : ""} rounded-md`}
          />
        </div>

        <div>
          <label className="block text-sm font-medium">
            {t("form.labels.email")}
          </label>

          <input
            type="email"
            {...register("email", {
              required: true,
              pattern: /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,4}$/,
            })}
            className={`p-2 mt-1 block w-full border ${errors.email ? "border-red" : ""} rounded-md`}
          />
        </div>

        <div>
          <label className="block text-sm font-medium">
            {t("form.labels.phone")}
          </label>

          <input
            type="tel"
            {...register("phone", { required: true })}
            className={`p-2 mt-1 block w-full border ${errors.phone ? "border-red" : ""} rounded-md`}
          />
        </div>

        <div>
          <label className="block text-sm font-medium">
            {t("form.labels.message")}
          </label>

          <textarea
            {...register("message", { required: true })}
            className={`p-2 resize-none mt-1 block w-full border ${errors.message ? "border-red" : ""} rounded-md`}
            rows="4"
          />
        </div>

        <button
          type="submit"
          disabled={loading}
          className={`mt-4 p-2 text-white rounded-md bg-blue w-fit`}
        >
          {loading
            ? t("buttons.loading")
            : messageSent
              ? t("buttons.success")
              : t("buttons.send")}
        </button>
      </form>
    </div>
  );
}
