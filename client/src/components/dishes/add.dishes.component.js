import { useContext, useEffect } from "react";
import { useRouter } from "next/router";

// REACT HOOK FORM
import { useForm } from "react-hook-form";

// I18N
import { useTranslation } from "next-i18next";

// AXIOS
import axios from "axios";

// CONTEXT
import { GlobalContext } from "@/contexts/global.context";

// SVG
import {
  BioSvg,
  DishSvg,
  GlutenFreeSvg,
  VeganSvg,
  VegetarianSvg,
} from "../_shared/_svgs/_index";

export default function AddDishesComponent(props) {
  const { t } = useTranslation("dishes");
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
      vegan: false,
      vegetarian: false,
      bio: false,
      glutenFree: false,
    },
  });

  useEffect(() => {
    if (props.dish) {
      reset({
        name: props.dish.name,
        description: props.dish.description,
        price: props.dish.price,
        vegan: props.dish.vegan,
        vegetarian: props.dish.vegetarian,
        bio: props.dish.bio,
        glutenFree: props.dish.glutenFree,
        showOnSite: props.dish.showOnWebsite ? "yes" : "no",
      });
    } else {
      reset({
        showOnSite: "yes",
        vegan: false,
        vegetarian: false,
        bio: false,
        glutenFree: false,
      });
    }
  }, [props.dish, reset]);

  async function onSubmit(data) {
    const formattedData = {
      ...data,
      showOnWebsite: data.showOnSite === "yes",
      price: parseFloat(data.price),
      categoryId: props.category._id,
    };

    try {
      const apiUrl = props.dish
        ? `${process.env.NEXT_PUBLIC_API_URL}/restaurants/${restaurantContext?.restaurantData?._id}/dishes/${props.dish._id}`
        : `${process.env.NEXT_PUBLIC_API_URL}/restaurants/${restaurantContext?.restaurantData?._id}/dishes`;

      const method = props.dish ? "put" : "post";

      const response = await axios[method](apiUrl, formattedData);

      restaurantContext.setRestaurantData(response.data.restaurant);

      router.push(`/dishes/${props.category._id}`);
    } catch (error) {
      console.error("Error adding or editing dish:", error);
    }
  }

  return (
    <section className="flex flex-col gap-6">
      <hr className="opacity-20" />

      <div className="flex pl-2 gap-2 py-1 items-center">
        <DishSvg width={30} height={30} fillColor="#131E3690" />

        <h1 className="pl-2 text-2xl flex items-center">
          {t("titles.main")} / {props.category?.name} /{" "}
          {props.dish ? t("buttons.edit") : t("buttons.add")}
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

        <div className="flex gap-12 flex-wrap">
          <label className="flex items-center gap-2">
            <input type="checkbox" {...register("vegan")} />
            {t("form.labels.vegan")}
            <VeganSvg
              fillColor="white"
              width={18}
              height={18}
              className="bg-red p-2 w-8 h-8 rounded-full opacity-70"
            />
          </label>

          <label className="flex items-center gap-2">
            <input type="checkbox" {...register("vegetarian")} />
            {t("form.labels.vegetarian")}
            <VegetarianSvg
              fillColor="white"
              width={18}
              height={18}
              className="bg-violet p-2 w-8 h-8 rounded-full opacity-70"
            />
          </label>

          <label className="flex items-center gap-2">
            <input type="checkbox" {...register("bio")} />
            {t("form.labels.bio")}
            <BioSvg
              fillColor="white"
              width={18}
              height={18}
              className="bg-darkBlue p-2 w-8 h-8 rounded-full opacity-70"
            />
          </label>

          <label className="flex items-center gap-2">
            <input type="checkbox" {...register("glutenFree")} />
            {t("form.labels.glutenFree")}
            <GlutenFreeSvg
              fillColor="white"
              width={18}
              height={18}
              className="bg-blue p-2 w-8 h-8 rounded-full opacity-70"
            />
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