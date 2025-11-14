import { useState } from "react";
import { useForm } from "react-hook-form";
import axios from "axios";
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
  const [messageSent, setMessageSent] = useState(null); // null | true | false

  // ---- Styles communs ----
  const cardCls =
    "w-full max-w-[820px] mx-auto rounded-2xl border border-darkBlue/10 bg-white/80 px-4 py-5 tablet:px-6 tablet:py-6 shadow-[0_18px_45px_rgba(19,30,54,0.06)] flex flex-col gap-5";
  const headerBadgeCls =
    "inline-flex h-7 px-3 items-center justify-center rounded-full bg-darkBlue/5 text-[11px] font-semibold uppercase tracking-[0.14em] text-darkBlue";
  const titleCls =
    "text-lg tablet:text-xl font-semibold text-darkBlue mt-1 text-left";
  const descriptionCls = "text-sm text-darkBlue/70 leading-relaxed";
  const fieldWrap = "flex flex-col gap-1.5";
  const labelCls =
    "text-xs font-semibold uppercase tracking-[0.08em] text-darkBlue/70";
  const inputCls =
    "h-11 w-full rounded-xl border border-darkBlue/10 bg-white/90 px-3 text-sm outline-none transition placeholder:text-darkBlue/40 focus:border-blue/60 focus:ring-1 focus:ring-blue/30";
  const textareaCls =
    "min-h-[120px] w-full rounded-xl border border-darkBlue/10 bg-white/90 px-3 py-2 text-sm outline-none transition resize-none placeholder:text-darkBlue/40 focus:border-blue/60 focus:ring-1 focus:ring-blue/30";
  const errorTextCls = "text-[11px] text-red mt-0.5";
  const btnPrimary =
    "inline-flex items-center justify-center rounded-xl bg-blue px-4 py-2.5 text-sm font-medium text-white shadow hover:bg-blue/90 transition disabled:opacity-60 disabled:cursor-not-allowed";
  const statusSuccessCls =
    "text-xs text-[#166534] bg-[#16a34a0d] border border-[#16a34a40] rounded-full px-3 py-1 inline-flex items-center";
  const statusErrorCls =
    "text-xs text-[#b91c1c] bg-[#ef44440d] border border-[#ef444440] rounded-full px-3 py-1 inline-flex items-center";

  function onSubmit(data) {
    setLoading(true);
    setMessageSent(null);

    axios
      .post("/api/contact-form-email", data)
      .then((response) => {
        if (response.status === 200) {
          setMessageSent(true);
          reset();
        } else {
          setMessageSent(false);
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
    <section className="w-full px-2 tablet:px-0">
      <div className={cardCls}>
        {/* Header */}
        <div className="flex flex-col gap-2">
          <span className={headerBadgeCls}>Contact support</span>
          <h2 className={titleCls}>Contactez-nous</h2>
          <p className={descriptionCls}>{t("description")}</p>
        </div>

        {/* Formulaire */}
        <form
          onSubmit={handleSubmit(onSubmit)}
          className="mt-2 flex flex-col gap-4"
        >
          {/* Nom */}
          <div className={fieldWrap}>
            <label className={labelCls}>
              {t("form.labels.name")}
              <span className="ml-1 text-red">*</span>
            </label>

            <input
              type="text"
              {...register("name", {
                required: t("form.errors.required") || "Ce champ est requis.",
              })}
              className={`${inputCls} ${
                errors.name ? "border-red ring-1 ring-red/30" : ""
              }`}
            />
            {errors.name && (
              <p className={errorTextCls}>{errors.name.message}</p>
            )}
          </div>

          {/* Email */}
          <div className={fieldWrap}>
            <label className={labelCls}>
              {t("form.labels.email")}
              <span className="ml-1 text-red">*</span>
            </label>

            <input
              type="email"
              {...register("email", {
                required: t("form.errors.required") || "Ce champ est requis.",
                pattern: {
                  value:
                    /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/i,
                  message:
                    t("form.errors.email") ||
                    "Veuillez saisir une adresse email valide.",
                },
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
              {t("form.labels.phone")}
              <span className="ml-1 text-red">*</span>
            </label>

            <input
              type="tel"
              {...register("phone", {
                required: t("form.errors.required") || "Ce champ est requis.",
              })}
              className={`${inputCls} ${
                errors.phone ? "border-red ring-1 ring-red/30" : ""
              }`}
            />
            {errors.phone && (
              <p className={errorTextCls}>{errors.phone.message}</p>
            )}
          </div>

          {/* Message */}
          <div className={fieldWrap}>
            <label className={labelCls}>
              {t("form.labels.message")}
              <span className="ml-1 text-red">*</span>
            </label>

            <textarea
              {...register("message", {
                required: t("form.errors.required") || "Ce champ est requis.",
              })}
              className={`${textareaCls} ${
                errors.message ? "border-red ring-1 ring-red/30" : ""
              }`}
              rows={4}
            />
            {errors.message && (
              <p className={errorTextCls}>{errors.message.message}</p>
            )}
          </div>

          {/* Bouton + statut */}
          <div className="pt-1 flex flex-col gap-2 tablet:flex-row tablet:items-center tablet:justify-between">
            <button
              type="submit"
              disabled={loading}
              className={btnPrimary}
            >
              {loading
                ? t("buttons.loading")
                : t("buttons.send")}
            </button>

            {messageSent === true && (
              <p className={statusSuccessCls}>
                {t("buttons.success") || "Message envoyé avec succès."}
              </p>
            )}

            {messageSent === false && (
              <p className={statusErrorCls}>
                {t("form.errors.generic") ||
                  "Une erreur est survenue, veuillez réessayer."}
              </p>
            )}
          </div>
        </form>
      </div>
    </section>
  );
}
