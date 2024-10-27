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
        year: props.drink.year || "",
      });
    } else {
      reset({
        showOnSite: "yes",
        bio: false,
        year: "",
      });
    }
  }, [props.drink, reset]);

  async function onSubmit(data) {
    const formattedData = {
      ...data,
      showOnWebsite: data.showOnSite === "yes",
      price: parseFloat(data.price),
      bio: data.bio || false,
      year: data.year ? parseInt(data.year, 10) : undefined,
      categoryId: props.category._id,
    };

    try {
      const apiUrl = props.drink
        ? `${process.env.NEXT_PUBLIC_API_URL}/restaurants/${restaurantContext?.restaurantData?._id}/drinks/${props.drink._id}`
        : `${process.env.NEXT_PUBLIC_API_URL}/restaurants/${restaurantContext?.restaurantData?._id}/drinks`;

      const method = props.drink ? "put" : "post";
      const response = await axios[method](apiUrl, formattedData);

      restaurantContext.setRestaurantData(response.data.restaurant);
      router.push(`/drinks/${props.category._id}`);
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
          {t("titles.main")} / {props.category?.name} /{" "}
          {props.drink ? t("buttons.edit") : t("buttons.add")}
        </h1>
      </div>

      <form
        onSubmit={handleSubmit(onSubmit)}
        className="bg-white p-6 rounded-lg drop-shadow-sm flex flex-col gap-6"
      >
        {/* Name Field */}
        <div className="flex flex-col gap-2">
          <label className="block font-semibold">{t("form.labels.name")}</label>
          <input
            type="text"
            placeholder="-"
            {...register("name", { required: true })}
            className={`border p-2 rounded-lg w-full ${errors.name ? "border-red" : ""}`}
          />
          {errors.name && <span className="text-red">{t("form.errors.required")}</span>}
        </div>

        {/* Description Field */}
        <div className="flex flex-col gap-2">
          <label className="block font-semibold">{t("form.labels.description")}</label>
          <textarea
            placeholder="-"
            {...register("description")}
            className="border p-2 rounded-lg w-full"
          />
        </div>

        {/* Price Field */}
        <div className="flex flex-col gap-2">
          <label className="block font-semibold">{t("form.labels.price")}</label>
          <input
            type="number"
            step="0.01"
            placeholder={`0.00 ${currencySymbol}`}
            {...register("price", { required: true })}
            className={`border p-2 rounded-lg w-full ${errors.price ? "border-red" : ""}`}
          />
          {errors.price && <span className="text-red">{t("form.errors.required")}</span>}
        </div>

        {/* Year Field */}
        <div className="flex flex-col gap-2">
          <label className="block font-semibold">{t("form.labels.year")}</label>
          <input
            type="number"
            placeholder="-"
            {...register("year")}
            className="border p-2 rounded-lg w-full"
          />
        </div>

        {/* Show on Site Field */}
        <div className="flex flex-col gap-2">
          <label className="block font-semibold">{t("form.labels.showOnSite")}</label>
          <div className="flex items-center gap-4">
            <label className="flex items-center gap-2">
              <input type="radio" value="yes" {...register("showOnSite")} />
              {t("form.labels.yes")}
            </label>
            <label className="flex items-center gap-2">
              <input type="radio" value="no" {...register("showOnSite")} />
              {t("form.labels.no")}
            </label>
          </div>
        </div>

        {/* Bio Field */}
        <div className="flex items-center gap-2">
          <input
            type="checkbox"
            {...register("bio")}
            id="bio"
            className="w-4 h-4"
          />
          <label htmlFor="bio" className="font-semibold flex items-center gap-2">
            <BioSvg width={20} height={20} fillColor="#131E3690" />
            {t("form.labels.bio")}
          </label>
        </div>

        {/* Buttons */}
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
