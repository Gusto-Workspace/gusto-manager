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
import { BioSvg, WineSvg } from "../../_shared/_svgs/_index";

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
    watch,
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

  const showOnSite = watch("showOnSite");
  const bioChecked = watch("bio");

  useEffect(() => {
    if (props.wine) {
      reset({
        name: props.wine.name || "",
        appellation: props.wine.appellation || "",
        volumes: props.wine.volumes?.map((v) => {
          const [volume, unit] = String(v.volume || "").split(" ");
          return {
            volume: volume || "",
            unit: unit || "CL",
            price: v.price !== undefined && v.price !== null ? v.price : "",
          };
        }) || [{ volume: "", unit: "CL", price: "" }],
        year: props.wine.year || "",
        bio: !!props.wine.bio,
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
        name: data.name,
        appellation: data.appellation,
        year: data.year,
        bio: !!data.bio,
        showOnWebsite: data.showOnSite === "yes",
        categoryId: props.category._id,
        volumes: data.volumes.map((v) => ({
          volume: `${v.volume} ${v.unit}`,
          price:
            v.price !== "" && v.price != null
              ? parseFloat(String(v.price).replace(",", "."))
              : null,
        })),
      };

      let apiUrl;
      const method = props.wine ? "put" : "post";

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
          `/dashboard/wines/${formattedCategoryName}-${props.category._id}/${formattedSubCategoryName}-${props.subCategory._id}`
        );
      } else {
        const formattedName = props.category.name
          .replace(/\//g, "-")
          .replace(/\s+/g, "&")
          .toLowerCase();

        router.push(`/dashboard/wines/${formattedName}-${props.category._id}`);
      }
    } catch (error) {
      console.error("Error adding or editing wine:", error);
    } finally {
      setLoading(false);
    }
  }

  // ---- Styles communs (alignés sur AddDishesComponent) ----
  const cardCls =
    "rounded-2xl border border-darkBlue/10 bg-white/50 px-4 py-4 tablet:px-6 tablet:py-5 shadow-[0_18px_45px_rgba(19,30,54,0.06)] flex flex-col gap-4";
  const fieldWrap = "flex flex-col gap-1 tablet:gap-1.5";
  const labelCls =
    "text-xs font-semibold uppercase tracking-[0.08em] text-darkBlue/70 flex items-center gap-2";
  const inputCls =
    "h-11 w-full rounded-xl border border-darkBlue/10 bg-white/80 px-3 text-sm outline-none transition placeholder:text-darkBlue/40";
  const selectCls =
    "h-11 rounded-xl border border-darkBlue/10 bg-white px-3 text-sm outline-none transition";
  const btnPrimary =
    "inline-flex min-w-[120px] items-center justify-center rounded-xl bg-blue text-white text-sm font-medium px-4 py-2.5 shadow-sm hover:bg-blue/90 transition disabled:opacity-60 disabled:cursor-not-allowed";
  const btnSecondary =
    "inline-flex min-w-[120px] items-center justify-center rounded-xl border border-red bg-red text-white text-sm font-medium px-4 py-2.5 shadow-sm hover:bg-red/90 transition disabled:opacity-60 disabled:cursor-not-allowed";
  const badgeToggleBase =
    "inline-flex items-center gap-2 rounded-xl border px-3 py-2 text-xs font-medium transition cursor-pointer select-none";
  const errorTextCls = "text-[11px] text-red mt-0.5";

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

      <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-5">
        {/* Carte infos générales (appellation, nom, millésime) */}
        <div className={cardCls}>
          <div className="flex items-center gap-2 text-darkBlue">
            <span className="inline-flex h-7 px-3 items-center justify-center rounded-full bg-darkBlue/5 text-[11px] font-semibold uppercase tracking-[0.12em] text-darkBlue">
              {t("Informations générales du vin")}
            </span>
          </div>

          <div className="grid gap-4 tablet:grid-cols-2">
            {/* Appellation */}
            <div className={fieldWrap}>
              <label className={labelCls}>
                <span>{t("form.labels.appellation")}</span>
                <span className="text-[11px] text-darkBlue/40 ml-2 italic">
                  {t("form.labels.optional")}
                </span>
              </label>
              <input
                type="text"
                placeholder="-"
                {...register("appellation")}
                className={inputCls}
              />
            </div>

            {/* Nom du vin */}
            <div className={fieldWrap}>
              <label className={labelCls}>
                {t("form.labels.name")}
                <span className="text-red ml-1">*</span>
              </label>
              <input
                type="text"
                placeholder="-"
                {...register("name", { required: true })}
                className={`${inputCls} ${
                  errors.name ? "border-red ring-1 ring-red/30" : ""
                }`}
              />
              {errors.name && (
                <p className={errorTextCls}>{t("form.errors.required")}</p>
              )}
            </div>

            {/* Millésime */}
            <div className={fieldWrap}>
              <label className={labelCls}>
                {t("form.labels.year")}
                <span className="text-[11px] text-darkBlue/40 ml-2 italic">
                  {t("form.labels.optional")}
                </span>
              </label>
              <input
                type="text"
                placeholder="-"
                {...register("year")}
                className={inputCls}
              />
            </div>
          </div>
        </div>

        {/* Carte volumes, bio & statut */}
        <div className={cardCls}>
          {/* Volumes & prix */}
          <div className="flex flex-col gap-3">
            <span className="text-xs font-semibold uppercase tracking-[0.08em] text-darkBlue/70">
              {t("form.labels.volumes")}
            </span>

            <div className="flex flex-col gap-3">
              {fields.map((item, index) => {
                const priceError = errors?.volumes?.[index]?.price;
                const volumeError = errors?.volumes?.[index]?.volume;
                const unitError = errors?.volumes?.[index]?.unit;

                return (
                  <div
                    key={item.id}
                    className="flex flex-col midTablet:flex-row midTablet:items-center gap-3"
                  >
                    {/* Volume */}
                    <div className="flex flex-col gap-1 w-full midTablet:w-[120px]">
                      <label className="text-[11px] font-medium text-darkBlue/70">
                        {t("Volume")}
                      </label>
                      <input
                        type="number"
                        placeholder="ex: 12"
                        step="0.01"
                        onWheel={(e) => e.currentTarget.blur()}
                        {...register(`volumes.${index}.volume`, {
                          required: true,
                        })}
                        className={`${inputCls} ${
                          volumeError ? "border-red ring-1 ring-red/30" : ""
                        }`}
                      />
                    </div>

                    {/* Unité */}
                    <div className="flex flex-col gap-1 w-full midTablet:w-[90px]">
                      <label className="text-[11px] font-medium text-darkBlue/70">
                        {t("form.labels.unit") || "Unité"}
                      </label>
                      <select
                        {...register(`volumes.${index}.unit`, {
                          required: true,
                        })}
                        className={`${selectCls} ${
                          unitError ? "border-red ring-1 ring-red/30" : ""
                        }`}
                      >
                        <option value="CL">CL</option>
                        <option value="L">L</option>
                      </select>
                    </div>

                    {/* Prix */}
                    <div className="flex flex-col gap-1 w-full midTablet:w-[200px]">
                      <label className="text-[11px] font-medium text-darkBlue/70">
                        {t("form.labels.price")}
                      </label>
                      <div className="flex items-stretch rounded-xl border border-darkBlue/10 bg-white/80 overflow-hidden text-sm">
                        <span
                          className={`px-3 inline-flex items-center select-none ${
                            priceError ? "text-red" : "text-darkBlue/70"
                          }`}
                        >
                          {currencySymbol}
                        </span>
                        <input
                          type="number"
                          step="0.01"
                          onWheel={(e) => e.currentTarget.blur()}
                          placeholder={t("form.labels.price")}
                          {...register(`volumes.${index}.price`, {
                            required: true,
                          })}
                          className={`h-11 w-full border-l px-3 outline-none [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none ${
                            priceError
                              ? "border-red text-red"
                              : "border-darkBlue/10 text-darkBlue"
                          }`}
                        />
                      </div>
                      {priceError && (
                        <p className={errorTextCls}>
                          {t("form.errors.required")}
                        </p>
                      )}
                    </div>

                    {/* Bouton supprimer */}
                    {fields.length > 1 && (
                      <button
                        type="button"
                        className="mt-1 inline-flex items-center justify-center rounded-xl border border-red bg-red text-xs text-white px-3 py-2 hover:bg-red/90 transition"
                        onClick={() => remove(index)}
                      >
                        {t("buttons.delete")}
                      </button>
                    )}
                  </div>
                );
              })}
            </div>

            <button
              type="button"
              className="inline-flex items-center justify-center rounded-xl border border-darkBlue/15 bg-darkBlue/5 px-3 py-2 text-xs font-medium text-darkBlue hover:bg-darkBlue/10 transition w-fit mt-2"
              onClick={() => append({ volume: "", unit: "CL", price: "" })}
            >
              {t("buttons.add")}
            </button>
          </div>
        </div>
        <div className={cardCls}>
          {/* Ligne options & statut */}
          <div className="flex flex-col gap-4 mt-4">
            {/* Bio */}
            <div className="flex flex-col gap-2">
              <span className="text-xs font-semibold uppercase tracking-[0.08em] text-darkBlue/70">
                {t("Particularités")}
              </span>

              <div className="flex flex-wrap gap-3">
                <label
                  htmlFor="bio"
                  className={`${badgeToggleBase} ${
                    bioChecked
                      ? "border-darkBlue/40 bg-darkBlue/5 text-darkBlue"
                      : "border-darkBlue/10 bg-white/80 text-darkBlue/70"
                  }`}
                >
                  <input
                    id="bio"
                    type="checkbox"
                    {...register("bio")}
                    className="sr-only"
                  />
                  <span className="text-xs">{t("form.labels.bio")}</span>
                  <span
                    className="
                      inline-flex items-center justify-center
                      h-7 w-7 rounded-full
                      border border-darkBlue/40 bg-darkBlue/5
                    "
                  >
                    <BioSvg fillColor="#131E36" className="w-3.5 h-3.5" />
                  </span>
                </label>
              </div>
            </div>

            {/* Statut (visible / non visible) */}
            <div className="flex flex-col gap-2">
              <span className="text-xs font-semibold uppercase tracking-[0.08em] text-darkBlue/70">
                {t("form.labels.status")}
              </span>

              <div className="flex flex-wrap gap-3">
                <label
                  className={`${badgeToggleBase} ${
                    showOnSite === "yes"
                      ? "border-[#4ead7a80] bg-[#4ead7a1a] text-darkBlue"
                      : "border-darkBlue/10 bg-white/80 text-darkBlue/70"
                  }`}
                >
                  <input
                    type="radio"
                    value="yes"
                    {...register("showOnSite")}
                    className="sr-only"
                  />
                  <span className="text-xs">{t("buttons.yes")}</span>
                </label>

                <label
                  className={`${badgeToggleBase} ${
                    showOnSite === "no"
                      ? "border-darkBlue/40 bg-darkBlue/5 text-darkBlue"
                      : "border-darkBlue/10 bg-white/80 text-darkBlue/70"
                  }`}
                >
                  <input
                    type="radio"
                    value="no"
                    {...register("showOnSite")}
                    className="sr-only"
                  />
                  <span className="text-xs">{t("buttons.no")}</span>
                </label>
              </div>
            </div>
          </div>
        </div>

        {/* Boutons bas de page */}
        <div className="flex flex-col gap-3 tablet:flex-row tablet:justify-start pt-1">
          <button type="submit" className={btnPrimary} disabled={loading}>
            {loading ? t("buttons.loading") : t("buttons.save")}
          </button>

          <button
            type="button"
            className={btnSecondary}
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
