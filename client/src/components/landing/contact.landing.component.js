import { useState } from "react";

// REACT HOOK FORM
import { useForm } from "react-hook-form";

// ICONS
import { Check } from "lucide-react";
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
    <div className="mx-auto text-pretty px-[10%] py-32 flex flex-col tablet:flex-row gap-6 items-center">
      <div className="w-full tablet:w-1/2 container mx-auto px-4 md:px-6">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
          <div className="lg:col-span-5 pt-8">
            <h2 className="text-3xl tablet:text-4xl font-bold text-lightGrey mb-4">
              Nous contacter
            </h2>

            <div className="w-20 h-1 bg-orange my-6 rounded-full"></div>

            <p className="text-lg text-lightGrey mb-4 font-light">
              Découvrez comment Gusto Manager peut améliorer la gestion de votre
              restaurant. Remplissez le formulaire pour qu'un expert vous
              contacte.
            </p>
            <p className="text-lg text-lightGrey mb-4">
              Réservez une démo produit avec notre équipe et découvrez{" "}
              <span className="font-semibold text-lightGrey">
                la meilleure plateforme de gestion pour votre restaurant, bar ou
                café.
              </span>
            </p>

            <h3 className="font-semibold text-lightGrey text-xl mb-4">
              Prenez rendez-vous avec notre équipe pour :
            </h3>

            <ul className="space-y-4 mb-8 font-light text-lg">
              <li className="flex items-start gap-3">
                <div className="text-white bg-orange rounded-full p-0.5 mt-1">
                  <Check className="h-4 w-4" />
                </div>
                <span className="text-lightGrey">
                  Un appel (d'environ 30 minutes) pour discuter de vos besoins
                </span>
              </li>

              <li className="flex items-start gap-3">
                <div className="text-white bg-orange rounded-full p-0.5 mt-1">
                  <Check className="h-4 w-4" />
                </div>
                <span className="text-lightGrey">Une démo gratuite de notre plateforme de gestion</span>
              </li>

              <li className="flex items-start gap-3">
                <div className="text-white bg-orange rounded-full p-0.5 mt-1">
                  <Check className="h-4 w-4" />
                </div>
                <span className="text-lightGrey">Toutes les informations pour vous aider à démarrer</span>
              </li>
            </ul>
          </div>
        </div>
      </div>

      <div className="w-full tablet:w-1/2 bg-white rounded-xl shadow-md border border-darkBlue/5 hover:border-orange/50 p-12 transition-all duration-300 h-fit">
        {/* Formulaire */}
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
          {/* Champ Prénom */}
          <div>
            <label htmlFor="prenom" className="block mb-1">
              Prénom & Nom <span className="text-orange">*</span>
            </label>
            <input
              id="prenom"
              type="text"
              className="border rounded w-full p-2 border-darkBlue/10"
              placeholder="Votre prénom"
              {...register("name", { required: true })}
            />
          </div>

          {/* Champ Numéro de téléphone */}
          <div>
            <label htmlFor="phone" className="block mb-1">
              Numéro de téléphone <span className="text-orange">*</span>
            </label>
            <input
              id="phone"
              type="tel"
              className="border rounded w-full p-2 border-darkBlue/10"
              placeholder="Votre numéro de téléphone"
              {...register("phone", { required: true })}
            />
          </div>

          {/* Champ E-mail professionnel */}
          <div>
            <label htmlFor="email" className="block mb-1">
              E-mail <span className="text-orange">*</span>
            </label>
            <input
              id="email"
              type="email"
              className="border rounded w-full p-2 border-darkBlue/10"
              placeholder="Votre e-mail"
              {...register("email", {
                required: "Le champ Email est requis.",
                pattern: {
                  value: /^\S+@\S+\.\S+$/,
                  message: "Format d’email invalide.",
                },
              })}
            />
          </div>

          <div>
            <label htmlFor="email" className="block mb-1">
              Joindre un message <span className="text-orange">*</span>
            </label>

            <textarea
              {...register("message", { required: true })}
              className={`p-2 resize-none mt-1 block w-full border border-darkBlue/10 rounded`}
              rows="4"
            />
          </div>

          {/* Bouton Envoyer */}
          <div className="mt-4">
            <button
              type="submit"
              disabled={loading || messageSent}
              className="bg-orange text-white font-semibold py-2 px-6 rounded shadow-md hover:opacity-90"
            >
              {loading
                ? "En cours ..."
                : messageSent
                  ? "Message envoyé !"
                  : "Envoyer"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
