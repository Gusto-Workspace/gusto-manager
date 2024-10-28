import { useContext, useEffect } from "react";
import { useRouter } from "next/router";
import { useForm } from "react-hook-form";
import { useTranslation } from "next-i18next";
import axios from "axios";
import { GlobalContext } from "@/contexts/global.context";
import { BioSvg, DrinkSvg } from "../_shared/_svgs/_index";

export default function AddDrinksComponent(props) {
  const { t } = useTranslation("drinks");
  const { restaurantContext } = useContext(GlobalContext);
  const router = useRouter();
  const { locale } = router;
  const currencySymbol = locale === "fr" ? "€" : "$";

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm({
    defaultValues: {
      showOnSite: "yes",
      bio: false,
      year: "",
    },
  });

  useEffect(() => {
    if (props.drink) {
      reset({
        name: props.drink.name,
        description: props.drink.description,
        price: props.drink.price,
        bio: props.drink.bio,
        showOnSite: props.drink.showOnWebsite ? "yes" : "no",
      });
    } else {
      reset({
        showOnSite: "yes",
        bio: false,
      });
    }
  }, [props.drink, reset]);

  async function onSubmit(data) {
    const formattedData = {
      ...data,
      showOnWebsite: data.showOnSite === "yes",
      price: parseFloat(data.price),
      bio: data.bio || false,
      categoryId: props.category._id,
    };

    try {
      let apiUrl;
      let method = props.drink ? "put" : "post";

      if (props.subCategory) {
        // Si la boisson est ajoutée dans une sous-catégorie
        apiUrl = props.drink
          ? `${process.env.NEXT_PUBLIC_API_URL}/restaurants/${restaurantContext?.restaurantData?._id}/drinks/categories/${props.category._id}/subcategories/${props.subCategory._id}/drinks/${props.drink._id}`
          : `${process.env.NEXT_PUBLIC_API_URL}/restaurants/${restaurantContext?.restaurantData?._id}/drinks/categories/${props.category._id}/subcategories/${props.subCategory._id}/drinks`;
      } else {
        // Si la boisson est ajoutée dans une catégorie principale
        apiUrl = props.drink
          ? `${process.env.NEXT_PUBLIC_API_URL}/restaurants/${restaurantContext?.restaurantData?._id}/drinks/${props.drink._id}`
          : `${process.env.NEXT_PUBLIC_API_URL}/restaurants/${restaurantContext?.restaurantData?._id}/drinks`;
      }

      const response = await axios[method](apiUrl, formattedData);

      restaurantContext.setRestaurantData(response.data.restaurant);

      // Redirige vers la catégorie ou sous-catégorie appropriée après l'ajout ou la modification
      if (props.subCategory) {
        router.push(`/drinks/${props.category._id}/${props.subCategory._id}`);
      } else {
        router.push(`/drinks/${props.category._id}`);
      }
    } catch (error) {
      console.error("Error adding or editing drink:", error);
    }
  }

  return (
    <section className="flex flex-col gap-6">
      <hr className="opacity-20" />

      <div className="flex pl-2 gap-2 py-1 items-center">
        <DrinkSvg width={30} height={30} fillColor="#131E3690" />

        <h1 className="pl-2 text-2xl flex items-center">
          {t("titles.main")} / {props?.category?.name} /{" "}
          {props.subCategory ? `${props.subCategory.name} / ` : ""}
          {props.drink ? t("buttons.edit") : t("buttons.add")}
        </h1>
      </div>

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
              className={`border p-2 rounded-lg w-full ${errors.name ? "border-red" : ""}`}
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
              {...register("description")}
              className="border p-2 rounded-lg w-full"
            />
          </div>
          <div className="flex flex-col gap-1">
            <label className="block font-semibold">
              {t("form.labels.price")}
            </label>

            <div className="flex items-center">
              <span
                className={`px-3 py-2 rounded-l-lg ${errors.price ? " border border-r-0 border-t-red border-l-red border-b-red" : " border-t border-l border-b"}`}
              >
                {currencySymbol}
              </span>

              <input
                type="number"
                placeholder="-"
                step="0.01"
                {...register("price", { required: true })}
                className={`border p-2 rounded-r-lg w-full ${errors.price ? "border-red" : ""}`}
              />
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <input
            type="checkbox"
            {...register("bio")}
            id="bio"
            className="w-4 h-4"
          />
          <label
            htmlFor="bio"
            className="font-semibold flex items-center gap-2"
          >
            <BioSvg
              fillColor="white"
              width={18}
              height={18}
              className="bg-darkBlue p-2 w-8 h-8 rounded-full opacity-70"
            />
            {t("form.labels.bio")}
          </label>
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

        <div className="flex gap-4">
          <button
            type="submit"
            className="bg-blue w-fit text-white px-4 py-2 rounded-lg "
          >
            {t("buttons.save")}
          </button>

          <button
            type="button"
            className="bg-red text-white px-4 py-2 rounded-lg "
            onClick={() => router.back()}
          >
            {t("buttons.cancel")}
          </button>
        </div>
      </form>
    </section>
  );
}
