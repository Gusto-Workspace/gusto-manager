import { useContext } from "react";
import { useRouter } from "next/router";

// REACT HOOK FORM
import { useForm } from "react-hook-form";

// I18N
import { useTranslation } from "next-i18next";

// CONTEXT
import { GlobalContext } from "@/contexts/global.context";

// AXIOS
import axios from "axios";

export default function AddDishesComponent() {
  const { t } = useTranslation("dishes");
  const { restaurantContext } = useContext(GlobalContext);
  const router = useRouter();
  const { locale } = router;

  const currencySymbol = locale === "fr" ? "€" : "$";

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm({
    defaultValues: {
      showOnSite: "yes",
    },
  });

  async function onSubmit(data) {
    const formattedData = {
      ...data,
      showOnWebsite: data.showOnSite === "yes",
      price: parseFloat(data.price),
    };

    try {
      const response = await axios.post(
        `${process.env.NEXT_PUBLIC_API_URL}/restaurants/${restaurantContext?.restaurantData?._id}/dishes`,
        formattedData
      );

      restaurantContext.setRestaurantData(response.data.restaurant);

      router.push("/dishes");
    } catch (error) {
      console.error("Error adding dish:", error);
    }
  }

  return (
    <section className="flex flex-col gap-6">
      <hr className="opacity-20" />

      <h1 className="pl-2 text-2xl">{t("titles.add")}</h1>

      <form
        onSubmit={handleSubmit(onSubmit)}
        className="bg-white p-6 rounded-lg drop-shadow-sm flex flex-col gap-6"
      >
        <div className="grid grid-cols-2 gap-4">
          <div className="flex flex-col gap-1">
            <label className="block font-semibold">
              {t("form.labels.name")}
            </label>

            <input
              type="text"
              placeholder="-"
              {...register("name", { required: true })}
              className={`border p-2 rounded-lg w-full ${
                errors.name ? "border-red" : ""
              }`}
            />
          </div>

          <div className="flex flex-col gap-1">
            <label className="block font-semibold">
              <span>{t("form.labels.description")}</span>

              <span className="text-xs opacity-50 ml-2 italic">
                {t("form.labels.optional")}
              </span>
            </label>

            <input
              type="text"
              placeholder="-"
              {...register("description", { required: false })}
              className={`border p-2 rounded-lg w-full `}
            />
          </div>

          <div className="flex flex-col gap-1">
            <label className="block font-semibold">
              {t("form.labels.category")}
            </label>

            <select
              {...register("category", { required: true })}
              className={`border p-2 rounded-lg w-full ${
                errors.category ? "border-red" : ""
              }`}
            >
              <option value="">{t("form.labels.select")}</option>

              <option value="appetizer">
                {t("form.categories.appetizer")}
              </option>

              <option value="starter">{t("form.categories.starter")}</option>

              <option value="mainCourse">
                {t("form.categories.mainCourse")}
              </option>

              <option value="dessert">{t("form.categories.dessert")}</option>
            </select>
          </div>

          <div className="flex flex-col gap-1">
            <label className="block font-semibold">
              {t("form.labels.price")}
            </label>

            <div className="flex items-center">
              <span
                className={`px-3 py-2 rounded-l-lg  ${
                  errors.price
                    ? "border-t border-l border-b border-t-red border-l-red border-b-red"
                    : "border-t border-l border-b"
                }`}
              >
                {currencySymbol}
              </span>

              <input
                type="number"
                placeholder="-"
                step="0.01"
                {...register("price", { required: true })}
                className={`border p-2 rounded-r-lg w-full ${
                  errors.price ? "border-red" : ""
                }`}
              />
            </div>
          </div>
        </div>

        <div className="flex gap-6">
          <label className="block font-semibold">
            {t("form.labels.status")}
          </label>

          <div className="flex items-center gap-4">
            <label className="flex items-center gap-2">
              <input type="radio" value="yes" {...register("showOnSite")} />
              {t("buttons.yes")}
            </label>

            <label className="flex items-center gap-2">
              <input type="radio" value="no" {...register("showOnSite")} />
              {t("buttons.no")}
            </label>
          </div>
        </div>

        <button
          type="submit"
          className="bg-blue w-fit text-white px-4 py-2 rounded-lg hover:bg-blue-600"
        >
          {t("buttons.save")}
        </button>
      </form>
    </section>
  );
}
