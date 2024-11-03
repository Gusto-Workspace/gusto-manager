import { useForm } from "react-hook-form";
import { useRouter } from "next/router";
import { useContext, useState } from "react";

// AXIOS
import axios from "axios";

// I18N
import { useTranslation } from "next-i18next";

// CONTEXT
import { GlobalContext } from "@/contexts/global.context";

// SVG
import { EmailSvg } from "../_shared/_svgs/email.svg";
import { PasswordSvg } from "../_shared/_svgs/password.svg";

export default function FormForgotPasswordComponent() {
  const { t } = useTranslation("login");

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm();
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [selectedRestaurant, setSelectedRestaurant] = useState("");

  const { restaurantContext } = useContext(GlobalContext);

  async function onSubmit(data) {
    setLoading(true);
    setErrorMessage("");

    try {
      const response = await axios.post(
        `${process.env.NEXT_PUBLIC_API_URL}/owner/login`,
        data
      );

      const { token, owner } = response.data;

      localStorage.setItem("token", token);

      // Vérifier le nombre de restaurants du propriétaire
      if (owner.restaurants.length > 1) {
        restaurantContext.setRestaurantsList(owner.restaurants);
        restaurantContext.setIsAuth(true);
      } else {
        // Si le propriétaire n'a qu'un restaurant, regénérer le token avec l'ID du restaurant
        handleRestaurantSelect(owner.restaurants[0]._id, token);
      }
    } catch (error) {
      if (error.response && error.response.data) {
        setErrorMessage(error.response.data.message || "Login failed");
      } else {
        setErrorMessage("An error occurred. Please try again.");
      }
    } finally {
      setLoading(false);
    }
  }

  async function handleRestaurantSelect(restaurantId, token) {
    try {
      const response = await axios.post(
        `${process.env.NEXT_PUBLIC_API_URL}/owner/select-restaurant`,
        { token, restaurantId }
      );

      const newToken = response.data.token;

      localStorage.setItem("token", newToken);

      await restaurantContext.fetchRestaurantData(newToken, restaurantId);
      restaurantContext.setIsAuth(true);
      router.push("/");
    } catch (error) {
      console.error("Erreur lors de la sélection du restaurant:", error);
      setErrorMessage("An error occurred. Please try again.");
    }
  }

  return (
    <section className="relative  bg-white flex flex-col gap-6 rounded-lg p-12 drop-shadow-sm w-[500px]">
      <div className="flex flex-col gap-2 items-center">
        <h1 className="text-4xl font-semibold">{t("titles.second")}</h1>

        <h2>{t("descriptions.second")}</h2>
      </div>

      <form
        onSubmit={handleSubmit(onSubmit)}
        className="w-full flex flex-col gap-4 mt-auto"
      >
        <div
          className={`flex gap-2 pl-2 items-center border w-full rounded-lg  ${errors.email ? "border-red" : ""}`}
        >
          <EmailSvg width={22} height={22} />
          <input
            id="email"
            type="email"
            placeholder={t("form.labels.email")}
            className="py-2 w-full rounded-r-lg  border-l pl-2"
            {...register("email", { required: "Email is required" })}
          />
        </div>

        {errorMessage && (
          <p className="absolute bottom-5 italic text-xs w-full text-center left-1/2 -translate-x-1/2 text-red">
            {t(`form.${errorMessage}`)}
          </p>
        )}

        <button
          type="submit"
          className="bg-black mx-auto text-white rounded-lg py-2 px-12 hover:bg-opacity-70 transition-all duration-300 w-fit"
          disabled={loading}
        >
          {loading ? t("buttons.loading") : t("buttons.access")}
        </button>
      </form>
    </section>
  );
}
