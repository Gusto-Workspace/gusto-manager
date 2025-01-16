import { useContext, useEffect, useState } from "react";
import { useRouter } from "next/router";

// REACT HOOK FORM
import { useFieldArray, useForm } from "react-hook-form";

// I18N
import { useTranslation } from "next-i18next";

// AXIOS
import axios from "axios";

// CONTEXT
import { GlobalContext } from "@/contexts/global.context";

// SVG
import { BioSvg, WineSvg } from "../_shared/_svgs/_index";

export default function AddWinesComponent(props) {
  const { t } = useTranslation("wines");
  const { restaurantContext } = useContext(GlobalContext);
  const router = useRouter();
  const { locale } = router;
  const currencySymbol = locale === "fr" ? "€" : "$";

  const [loading, setLoading] = useState(false);

  const {
    register,
    handleSubmit,
    reset,
    control,
    formState: { errors },
  } = useForm({
    defaultValues: {
      name: "",
      appellation: "",
      volumes: [{ volume: "", unit: "CL", price: "" }],
      year: "",
      bio: false,
      showOnSite: "yes",
    },
  });

  const { fields, append, remove } = useFieldArray({
    control,
    name: "volumes",
  });

  useEffect(() => {
    if (props.wine) {
      reset({
        name: props.wine.name,
        appellation: props.wine.appellation,
        volumes: props.wine.volumes.map((v) => {
          const [volume, unit] = v.volume.split(" ");
          return { volume, unit: unit || "CL", price: v.price };
        }),
        year: props.wine.year || "",
        bio: props.wine.bio || false,
        showOnSite: props.wine.showOnWebsite ? "yes" : "no",
      });
    } else {
      reset({
        name: "",
        appellation: "",
        volumes: [{ volume: "", unit: "CL", price: "" }],
        year: "",
        bio: false,
        showOnSite: "yes",
      });
    }
  }, [props.wine, reset]);

  async function onSubmit(data) {
    setLoading(true);
    try {
      data.name = data.name.trim();
      data.appellation = data.appellation.trim();
      data.year = data.year.trim();

      const formattedData = {
        ...data,
        showOnWebsite: data.showOnSite === "yes",
        bio: data.bio || false,
        categoryId: props.category._id,
        volumes: data.volumes.map((volume) => ({
          volume: `${volume.volume} ${volume.unit}`,
          price: parseFloat(volume.price),
        })),
      };

      let apiUrl;
      let method = props.wine ? "put" : "post";

      if (props.subCategory) {
        apiUrl = props.wine
          ? `${process.env.NEXT_PUBLIC_API_URL}/restaurants/${restaurantContext?.restaurantData?._id}/wines/categories/${props.category._id}/subcategories/${props.subCategory._id}/wines/${props.wine._id}`
          : `${process.env.NEXT_PUBLIC_API_URL}/restaurants/${restaurantContext?.restaurantData?._id}/wines/categories/${props.category._id}/subcategories/${props.subCategory._id}/wines`;
      } else {
        apiUrl = props.wine
          ? `${process.env.NEXT_PUBLIC_API_URL}/restaurants/${restaurantContext?.restaurantData?._id}/wines/${props.wine._id}`
          : `${process.env.NEXT_PUBLIC_API_URL}/restaurants/${restaurantContext?.restaurantData?._id}/wines`;
      }

      const response = await axios[method](apiUrl, formattedData);

      restaurantContext.setRestaurantData(response.data.restaurant);

      if (props.subCategory) {
        const formattedCategoryName = props.category.name
          .replace(/\//g, "-")
          .replace(/\s+/g, "&")
          .toLowerCase();

        const formattedSubCategoryName = props.subCategory.name
          .replace(/\//g, "-")
          .replace(/\s+/g, "&")
          .toLowerCase();

        router.push(
          `/wines/${formattedCategoryName}-${props.category._id}/${formattedSubCategoryName}-${props.subCategory._id}`
        );
      } else {
        const formattedName = props.category.name
          .replace(/\//g, "-")
          .replace(/\s+/g, "&")
          .toLowerCase();

        router.push(`/wines/${formattedName}-${props.category._id}`);
      }

      setLoading(false);
    } catch (error) {
      console.error("Error adding or editing wine:", error);
    } finally {
      setLoading(false);
    }
  }

  return (
    <section className="flex flex-col gap-6">
      <hr className="opacity-20" />

      <div className="flex gap-2 min-h-[40px] items-center">
        <WineSvg
          width={30}
          height={30}
          className="min-h-[30px] min-w-[30px]"
          fillColor="#131E3690"
        />

        <h1 className="pl-2 text-xl tablet:text-2xl flex items-center gap-2 flex-wrap">
          <span>{t("titles.main")}</span>

          {props.category && (
            <>
              <span>/</span>
              <span>{props.category.name}</span>
            </>
          )}

          {props.subCategory && (
            <>
              <span>/</span>
              <span>{props.subCategory.name}</span>
            </>
          )}

          <span>/</span>
          <span>{props.wine ? t("buttons.edit") : t("buttons.add")}</span>
        </h1>
      </div>

      <form
        onSubmit={handleSubmit(onSubmit)}
        className="bg-white p-6 rounded-lg drop-shadow-sm flex flex-col gap-6"
      >
        <div className="grid tablet:grid-cols-2 gap-4">
          <div className="flex flex-col gap-1">
            <label className="block font-semibold">
              <span>{t("form.labels.appellation")}</span>

              <span className="text-xs opacity-50 ml-2 italic">
                {t("form.labels.optional")}
              </span>
            </label>

            <input
              type="text"
              placeholder="-"
              {...register("appellation")}
              className="border p-2 rounded-lg w-full"
            />
          </div>

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
              {t("form.labels.volumes")}
            </label>

            <div className="flex flex-col gap-4">
              {fields.map((item, index) => (
                <div
                  key={item.id}
                  className="flex flex-col midTablet:flex-row items-start gap-4 midTablet:items-center"
                >
                  <input
                    type="number"
                    placeholder="Volume"
                    step="0.01"
                    {...register(`volumes.${index}.volume`, { required: true })}
                    className="border p-2 rounded-lg w-24"
                  />
                  <select
                    {...register(`volumes.${index}.unit`, { required: true })}
                    className="border p-2 rounded-lg w-20"
                  >
                    <option value="CL">CL</option>
                    <option value="L">L</option>
                  </select>
                  <div className="flex items-center">
                    <span
                      className={`px-3 py-2 rounded-l-lg ${
                        errors?.volumes?.[index]?.price
                          ? "border border-r-0 border-t-red border-l-red border-b-red"
                          : "border-t border-l border-b"
                      }`}
                    >
                      {currencySymbol}
                    </span>
                    <input
                      type="number"
                      step="0.01"
                      placeholder={t("form.labels.price")}
                      {...register(`volumes.${index}.price`, {
                        required: true,
                      })}
                      className={`border p-2 rounded-r-lg w-32 ${
                        errors?.volumes?.[index]?.price ? "border-red" : ""
                      }`}
                    />
                  </div>
                  {fields.length > 1 && (
                    <button
                      type="button"
                      className="bg-red text-white px-2 py-1 rounded-lg"
                      onClick={() => remove(index)}
                    >
                      {t("buttons.delete")}
                    </button>
                  )}
                </div>
              ))}
            </div>

            <button
              type="button"
              className="bg-blue bg-opacity-30 text-blue px-4 py-2 rounded-lg w-fit mt-4"
              onClick={() => append({ volume: "", unit: "CL", price: "" })}
            >
              {t("buttons.add")}
            </button>
          </div>
        </div>
        <div className="flex flex-col gap-1 w-[150px]">
          <label className="block font-semibold">{t("form.labels.year")}</label>

          <input
            type="text"
            placeholder="-"
            {...register("year")}
            className="border p-2 rounded-lg w-full"
          />
        </div>

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
            className={`bg-blue w-fit text-white px-4 py-2 rounded-lg ${
              loading ? "opacity-50 cursor-not-allowed" : ""
            }`}
            disabled={loading}
          >
            {loading ? t("buttons.loading") : t("buttons.save")}
          </button>

          <button
            type="button"
            className={`bg-red text-white px-4 py-2 rounded-lg ${
              loading ? "opacity-50 cursor-not-allowed" : ""
            }`}
            disabled={loading}
            onClick={() => router.back()}
          >
            {t("buttons.cancel")}
          </button>
        </div>
      </form>
    </section>
  );
}
