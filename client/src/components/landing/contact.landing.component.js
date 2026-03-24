import { useState } from "react";

// REACT HOOK FORM
import { useForm } from "react-hook-form";

// ICONS
import { Check, Loader2 } from "lucide-react";
import axios from "axios";

export default function ContactLandingComponent() {
  const {
    register,
    handleSubmit,
    formState: { errors },
    reset,
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
    <section className="py-20 pt-28 tablet:pb-24 tablet:pt-36 text-darkBlue">
      <div className="mx-auto max-w-[90%] tablet:max-w-[85%]">
        <div className="grid grid-cols-1 tablet:grid-cols-2 gap-10 items-start">
          {/* LEFT CONTENT */}
          <div className="tablet:sticky tablet:top-28">
            <h2 className="mt-5 text-3xl tablet:text-4xl desktop:text-5xl font-bold leading-tight">
              Parlons de votre restaurant
            </h2>

            <p className="mt-5 text-lg text-darkBlue/75 leading-relaxed max-w-xl">
              Découvrez comment Gusto Manager peut simplifier votre gestion,
              centraliser vos outils et vous faire gagner du temps au quotidien.
            </p>

            <div className="w-20 h-1 bg-orange my-8 rounded-full"></div>

            <p className="text-base tablet:text-lg text-darkBlue/80 leading-relaxed max-w-xl">
              Prenez rendez-vous avec notre équipe pour découvrir la plateforme,
              poser vos questions et voir concrètement comment elle peut
              s’adapter à votre fonctionnement.
            </p>

            <div className="mt-8 space-y-4">
              <div className="flex items-start gap-3">
                <div className="shrink-0 rounded-full bg-orange p-1 text-white mt-0.5">
                  <Check className="h-4 w-4" />
                </div>
                <p className="text-darkBlue/85">
                  Un échange d’environ 30 minutes pour comprendre vos besoins
                </p>
              </div>

              <div className="flex items-start gap-3">
                <div className="shrink-0 rounded-full bg-orange p-1 text-white mt-0.5">
                  <Check className="h-4 w-4" />
                </div>
                <p className="text-darkBlue/85">
                  Une démo personnalisée de la plateforme
                </p>
              </div>

              <div className="flex items-start gap-3">
                <div className="shrink-0 rounded-full bg-orange p-1 text-white mt-0.5">
                  <Check className="h-4 w-4" />
                </div>
                <p className="text-darkBlue/85">
                  Toutes les informations pour démarrer sereinement
                </p>
              </div>
            </div>
          </div>

          {/* RIGHT FORM */}
          <div className="relative">
            <div className="absolute inset-0 translate-x-3 translate-y-3 rounded-[28px] bg-orange/90" />
            <div className="relative rounded-[28px] border-2 border-darkBlue bg-white p-6 tablet:p-8 desktop:p-10 shadow-[0_20px_60px_rgba(19,30,54,0.12)]">
              <div className="mb-8">
                <h3 className="text-2xl tablet:text-3xl font-bold">
                  Demander une démo
                </h3>
                <p className="mt-2 text-darkBlue/65">
                  Remplissez le formulaire et nous revenons vers vous
                  rapidement.
                </p>
              </div>

              {messageSent === true && (
                <div className="mb-6 rounded-2xl border border-green-200 bg-green-50 px-4 py-3 text-green-700">
                  Votre message a bien été envoyé.
                </div>
              )}

              {messageSent === false && (
                <div className="mb-6 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-red-700">
                  Une erreur est survenue. Veuillez réessayer.
                </div>
              )}

              <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">
                {/* NOM */}
                <div>
                  <label
                    htmlFor="name"
                    className="mb-2 block text-sm font-semibold text-darkBlue"
                  >
                    Prénom & Nom <span className="text-orange">*</span>
                  </label>
                  <input
                    id="name"
                    type="text"
                    placeholder="Votre prénom et nom"
                    className={`w-full rounded-2xl border px-4 py-3.5 outline-none transition-all duration-200 placeholder:text-darkBlue/35 ${
                      errors.name
                        ? "border-red-400 bg-red-50"
                        : "border-darkBlue/10 bg-dirtyWhite focus:border-darkBlue/25 focus:bg-white"
                    }`}
                    {...register("name", {
                      required: "Ce champ est requis.",
                    })}
                  />
                  {errors.name && (
                    <p className="mt-2 text-sm text-red-500">
                      {errors.name.message}
                    </p>
                  )}
                </div>

                {/* TEL */}
                <div>
                  <label
                    htmlFor="phone"
                    className="mb-2 block text-sm font-semibold text-darkBlue"
                  >
                    Numéro de téléphone <span className="text-orange">*</span>
                  </label>
                  <input
                    id="phone"
                    type="tel"
                    placeholder="Votre numéro de téléphone"
                    className={`w-full rounded-2xl border px-4 py-3.5 outline-none transition-all duration-200 placeholder:text-darkBlue/35 ${
                      errors.phone
                        ? "border-red-400 bg-red-50"
                        : "border-darkBlue/10 bg-dirtyWhite focus:border-darkBlue/25 focus:bg-white"
                    }`}
                    {...register("phone", {
                      required: "Ce champ est requis.",
                    })}
                  />
                  {errors.phone && (
                    <p className="mt-2 text-sm text-red-500">
                      {errors.phone.message}
                    </p>
                  )}
                </div>

                {/* EMAIL */}
                <div>
                  <label
                    htmlFor="email"
                    className="mb-2 block text-sm font-semibold text-darkBlue"
                  >
                    E-mail <span className="text-orange">*</span>
                  </label>
                  <input
                    id="email"
                    type="email"
                    placeholder="Votre e-mail"
                    className={`w-full rounded-2xl border px-4 py-3.5 outline-none transition-all duration-200 placeholder:text-darkBlue/35 ${
                      errors.email
                        ? "border-red-400 bg-red-50"
                        : "border-darkBlue/10 bg-dirtyWhite focus:border-darkBlue/25 focus:bg-white"
                    }`}
                    {...register("email", {
                      required: "Le champ e-mail est requis.",
                      pattern: {
                        value: /^\S+@\S+\.\S+$/,
                        message: "Format d’e-mail invalide.",
                      },
                    })}
                  />
                  {errors.email && (
                    <p className="mt-2 text-sm text-red-500">
                      {errors.email.message}
                    </p>
                  )}
                </div>

                {/* MESSAGE */}
                <div>
                  <label
                    htmlFor="message"
                    className="mb-2 block text-sm font-semibold text-darkBlue"
                  >
                    Votre message <span className="text-orange">*</span>
                  </label>
                  <textarea
                    id="message"
                    rows={5}
                    placeholder="Parlez-nous de votre restaurant et de vos besoins"
                    className={`w-full resize-none rounded-2xl border px-4 py-3.5 outline-none transition-all duration-200 placeholder:text-darkBlue/35 ${
                      errors.message
                        ? "border-red-400 bg-red-50"
                        : "border-darkBlue/10 bg-dirtyWhite focus:border-darkBlue/25 focus:bg-white"
                    }`}
                    {...register("message", {
                      required: "Ce champ est requis.",
                    })}
                  />
                  {errors.message && (
                    <p className="mt-2 text-sm text-red-500">
                      {errors.message.message}
                    </p>
                  )}
                </div>

                {/* CTA */}
                <div className="pt-2">
                  <button
                    type="submit"
                    disabled={loading}
                    className="inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-darkBlue px-6 py-4 text-base font-semibold text-white transition-all duration-300 hover:translate-y-[-1px] hover:bg-darkBlue/95 disabled:cursor-not-allowed disabled:opacity-70"
                  >
                    {loading ? (
                      <>
                        <Loader2 className="h-5 w-5 animate-spin" />
                        Envoi en cours...
                      </>
                    ) : (
                      "Demander une démo"
                    )}
                  </button>
                </div>

                <p className="text-center text-sm text-darkBlue/50">
                  Réponse rapide • Sans engagement
                </p>
              </form>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
