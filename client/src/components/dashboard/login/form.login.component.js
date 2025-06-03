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
import { EmailSvg } from "../../_shared/_svgs/email.svg";
import { PasswordSvg } from "../../_shared/_svgs/password.svg";
import {
  ChevronSvg,
  NoVisibleSvg,
  VisibleSvg,
} from "../../_shared/_svgs/_index";

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
  const [tempRole, setTempRole] = useState(null);
  const [showPassword, setShowPassword] = useState(false);

  const { restaurantContext } = useContext(GlobalContext);

  async function onSubmit(data) {
    setLoading(true);
    setErrorMessage("");

    try {
      const response = await axios.post(
        `${process.env.NEXT_PUBLIC_API_URL}/user/login`,
        data
      );
      const { token, owner, employee } = response.data;

      // On stocke token + rôle temporairement
      setTempToken(token);
      if (owner) {
        // Propriétaire
        setTempRole("owner");
        if (owner.restaurants.length > 1) {
          restaurantContext.setRestaurantsList(owner.restaurants);
          restaurantContext.setIsAuth(true);
        } else {
          // 1 resto → on redirige tout de suite
          await handleRestaurantSelect(
            "owner",
            owner.restaurants[0]._id,
            token
          );
        }
      } else {
        // Employé
        setTempRole("employee");
        await handleRestaurantSelect(
          "employee",
          employee.restaurant._id,
          token
        );
      }
    } catch (error) {
      if (error.response?.data?.message) {
        setErrorMessage(error.response.data.message);
      } else {
        setErrorMessage("errors.server");
      }
    } finally {
      setLoading(false);
    }
  }

  async function handleRestaurantSelect(role, restaurantId, token) {
    setLoading(true);
    setErrorMessage("");

    try {
      const { data } = await axios.post(
        `${process.env.NEXT_PUBLIC_API_URL}/user/select-restaurant`,
        { token, restaurantId }
      );
      const newToken = data.token;
      localStorage.setItem("token", newToken);

      // Recharge le contexte
      await restaurantContext.fetchRestaurantData(newToken, restaurantId);
      restaurantContext.setIsAuth(true);

      // Redirige en fonction du rôle passé
      if (role === "employee") {
        router.push("/dashboard/my-space");
      } else {
        router.push("/dashboard");
      }
    } catch (error) {
      console.error("Erreur lors de la sélection du restaurant :", error);
      setErrorMessage("errors.server");
      setLoading(false);
    }
  }

  return (
    <section className="relative h[380px] bg-white/15 backdrop-blur-sm flex flex-col rounded-lg p-12 drop-shadow-sm w-[500px]">
      <div className="flex flex-col gap-2 items-center">
        <h1 className="text-4xl font-semibold text-white">
          {t("titles.main")}
        </h1>

        <h2 className="text-white text-center">{t("descriptions.main")}</h2>

        <div className="w-20 h-1 bg-orange mx-auto mt-2 mb-6 rounded-full"></div>
      </div>

      {restaurantContext?.restaurantsList?.length === 0 ? (
        <form
          onSubmit={handleSubmit(onSubmit)}
          className="w-full flex flex-col gap-4 mt-auto text-white"
        >
          <div
            className={`flex gap-2 pl-2 items-center border w-full rounded-lg  ${errors.email ? "border-red" : ""}`}
          >
            <EmailSvg width={22} height={22} strokeColor="white" />
            <input
              id="email"
              type="email"
              placeholder={t("form.labels.email")}
              className="py-2 w-full rounded-r-lg  border-l pl-2 text-darkBlue"
              {...register("email", { required: true })}
            />
          </div>

          <div className="relative">
            <div
              className={`flex gap-2 pl-2 items-center border w-full rounded-lg ${errors.password ? "border-red" : ""}`}
            >
              <PasswordSvg width={22} height={22} strokeColor="white" />
              <input
                id="password"
                type={showPassword ? "text" : "password"}
                placeholder={t("form.labels.password")}
                className="py-2 w-full rounded-r-lg border-l pl-2 pr-8 text-darkBlue"
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
              onClick={() => router.push("/dashboard/login/forgot-password")}
              className="text-left text-xs italic opacity-70 mt-3 pr-1"
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
            className="bg-orange mx-auto text-white rounded-lg py-2 px-12 hover:bg-opacity-70 transition-all duration-300 w-fit"
            disabled={loading}
          >
            {loading ? t("buttons.loading") : t("buttons.login")}
          </button>
        </form>
      ) : (
        <div className="w-full flex flex-col gap-4 justify-between flex-1">
          <div className="my-auto flex flex-col gap-2">
            <h2 className="font-semibold text-white mx-auto">
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
            className={`bg-orange mx-auto text-white rounded-lg py-2 px-12  transition-all duration-300 w-fit ${
              !selectedRestaurant ? "opacity-50 cursor-not-allowed" : ""
            }`}
            onClick={() =>
              handleRestaurantSelect(tempRole, selectedRestaurant, tempToken)
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
