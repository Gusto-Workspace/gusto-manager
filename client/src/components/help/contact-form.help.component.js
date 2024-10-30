import { useForm } from "react-hook-form";
import { useState } from "react";
import axios from "axios";

export default function ContactFormHelpComponent() {
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm();
  const [loading, setLoading] = useState(false);
  const [messageStatus, setMessageStatus] = useState(null);

  function onSubmit(data) {
    setLoading(true);
    setMessageStatus(null);

    axios
      .post("/api/contact-form-email", data)
      .then((response) => {
        if (response.status === 200) {
          setMessageStatus("Votre message a été envoyé avec succès !");
        }
      })
      .catch((error) => {
        console.error("Erreur lors de l'envoi du message :", error);
        setMessageStatus(
          "Erreur lors de l'envoi du message. Veuillez réessayer ultérieurement"
        );
      })
      .finally(() => {
        setLoading(false);
      });
  }

  return (
    <div className="max-w-md mx-auto p-6 bg-white rounded-lg shadow-lg">
      <h2 className="text-2xl font-semibold text-center mb-4">
        Contactez-nous
      </h2>

      {messageStatus && (
        <p
          className={`text-center mb-4 ${messageStatus.includes("succès") ? "text-green-500" : "text-red-500"}`}
        >
          {messageStatus}
        </p>
      )}

      <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-4">
        <div>
          <label className="block text-sm font-medium">Nom</label>
          <input
            type="text"
            {...register("name", { required: true })}
            className={`p-2 mt-1 block w-full border ${errors.name ? "border-red" : "border-gray-300"} rounded-md`}
          />
        </div>

        <div>
          <label className="block text-sm font-medium">Email</label>
          <input
            type="email"
            {...register("email", {
              required: true,
              pattern: /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,4}$/,
            })}
            className={`p-2 mt-1 block w-full border ${errors.email ? "border-red" : "border-gray-300"} rounded-md`}
          />
        </div>

        <div>
          <label className="block text-sm font-medium">Téléphone</label>
          <input
            type="tel"
            {...register("phone", { required: true })}
            className={`p-2 mt-1 block w-full border ${errors.phone ? "border-red" : "border-gray-300"} rounded-md`}
          />
        </div>

        <div>
          <label className="block text-sm font-medium">Message</label>
          <textarea
            {...register("message", { required: true })}
            className={`p-2 mt-1 block w-full border ${errors.message ? "border-red" : "border-gray-300"} rounded-md`}
            rows="4"
          ></textarea>
        </div>

        <button
          type="submit"
          disabled={loading}
          className={`mt-4 p-2 text-white rounded-md ${loading ? "bg-gray-400" : "bg-blue-500 hover:bg-blue-600"}`}
        >
          {loading ? "Envoi en cours..." : "Envoyer le message"}
        </button>
      </form>
    </div>
  );
}
