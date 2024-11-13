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
import { ChevronSvg, NoVisibleSvg, VisibleSvg } from "../_shared/_svgs/_index";

export default function FormLoginComponent() {
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
  const [tempToken, setTempToken] = useState(null);
  const [showPassword, setShowPassword] = useState(false);

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

      setTempToken(token);

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
        setErrorMessage("errors.server");
      }
    } finally {
      setLoading(false);
    }
  }

  async function handleRestaurantSelect(restaurantId, token) {
    try {
      setLoading(true);
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
      setErrorMessage("errors.server");
      setLoading(false);
    }
  }

  return (
    <section className="relative h-[380px] bg-white flex flex-col rounded-lg p-12 drop-shadow-sm w-[500px]">
      <div className="flex flex-col gap-2 items-center">
        <h1 className="text-4xl font-semibold">{t("titles.main")}</h1>

        <h2>{t("descriptions.main")}</h2>
      </div>

      {restaurantContext?.restaurantsList?.length === 0 ? (
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
              {...register("email", { required: true })}
            />
          </div>

          <div className="relative">
            <div
              className={`flex gap-2 pl-2 items-center border w-full rounded-lg ${errors.password ? "border-red" : ""}`}
            >
              <PasswordSvg width={22} height={22} />
              <input
                id="password"
                type={showPassword ? "text" : "password"}
                placeholder={t("form.labels.password")}
                className="py-2 w-full rounded-r-lg border-l pl-2 pr-8"
                {...register("password", { required: true })}
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-1 p-1 bg-white"
              >
                {showPassword ? (
                  <VisibleSvg width={20} height={20} />
                ) : (
                  <NoVisibleSvg width={20} height={20} />
                )}
              </button>
            </div>

            <button
              type="button"
              onClick={() => router.push("/login/forgot-password")}
              className="text-left text-xs italic opacity-50 mt-1 pr-1"
            >
              {t("form.labels.forgotPassword")}
            </button>
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
            {loading ? t("buttons.loading") : t("buttons.login")}
          </button>
        </form>
      ) : (
        <div className="w-full flex flex-col justify-between flex-1">
          <div className="my-auto">
            <h2 className="font-semibold mb-1">
              {t("form.labels.selectRestaurant")}
            </h2>

            <div className="relative w-full">
              <select
                className="border rounded-lg p-2 w-full appearance-none pr-8 cursor-pointer"
                value={selectedRestaurant}
                onChange={(e) => setSelectedRestaurant(e.target.value)}
              >
                <option value="">{t("form.labels.select")}</option>
                {restaurantContext?.restaurantsList?.map((restaurant) => (
                  <option key={restaurant._id} value={restaurant._id}>
                    {restaurant.name}
                  </option>
                ))}
              </select>

              <div className="absolute right-2 top-1/2 transform -translate-y-1/2 pointer-events-none">
                <ChevronSvg />
              </div>
            </div>
          </div>

          <button
            className={`bg-black mx-auto text-white rounded-lg py-2 px-12  transition-all duration-300 w-fit ${
              !selectedRestaurant ? "opacity-50 cursor-not-allowed" : ""
            }`}
            onClick={() =>
              handleRestaurantSelect(selectedRestaurant, tempToken)
            }
            disabled={!selectedRestaurant}
          >
            {loading ? t("buttons.loading") : t("buttons.access")}
          </button>
        </div>
      )}
    </section>
  );
}
