import { useContext, useEffect, useState } from "react";
import { useRouter } from "next/router";

// REACT HOOK FORM
import { useForm, useFieldArray } from "react-hook-form";

// I18N
import { useTranslation } from "next-i18next";

// CONTEXT
import { GlobalContext } from "@/contexts/global.context";

// AXIOS
import axios from "axios";

// COMPONENTS
import CategoriesInputFixedMenuComponent from "./categories-input-fixed-menu.menus.component";

export default function FixedMenuComponent(props) {
  const { t } = useTranslation("menus");
  const router = useRouter();
  const { locale } = router;
  const { restaurantContext } = useContext(GlobalContext);
  const currencySymbol = locale === "fr" ? "€" : "$";
  const [categories, setCategories] = useState(
    restaurantContext?.restaurantData?.dish_categories
  );
  const [isLoading, setIsLoading] = useState(false);
  const [errorFields, setErrorFields] = useState([]);

  const { register, handleSubmit, reset, control } = useForm({
    defaultValues: {
      combinations: [
        { categories: [{ value: "" }], price: "", description: "" },
      ],
    },
  });

  const {
    fields: combinationFields,
    append: addCombination,
    remove: removeCombination,
  } = useFieldArray({
    control,
    name: "combinations",
  });

  useEffect(() => {
    if (props.menu) {
      const formattedCombinations = props.menu.combinations.map((combo) => ({
        categories: combo.categories.map((category) => ({ value: category })),
        price: combo.price.toString(),
        description: combo.description || "",
      }));

      reset({
        name: props.menu.name || "",
        description: props.menu.description || "",
        combinations: formattedCombinations,
      });
    }
  }, [props.menu, reset]);

  useEffect(() => {
    const modifiedCategories =
      restaurantContext?.restaurantData?.dish_categories?.map((category) => ({
        ...category,
        name: category.name.endsWith("s")
          ? category.name.slice(0, -1)
          : category.name,
      })) || [];
    setCategories(modifiedCategories);
  }, [restaurantContext?.restaurantData]);

  function onSubmit(data) {
    const emptyFields = data.combinations.reduce((acc, combo, comboIndex) => {
      const emptyCategories = combo.categories.reduce(
        (catAcc, cat, catIndex) => {
          if (cat.value === "") {
            catAcc.push(catIndex);
          }
          return catAcc;
        },
        []
      );
      const emptyPrice = combo.price === "";

      if (emptyCategories.length > 0 || emptyPrice) {
        acc.push({
          comboIndex,
          emptyCategories,
          emptyPrice,
        });
      }
      return acc;
    }, []);

    setErrorFields(emptyFields.length > 0 ? emptyFields : []);

    if (emptyFields.length > 0) {
      return;
    }

    setIsLoading(true);

    const formattedData = {
      type: props.menuType,
      name: data.name,
      description: data.description,
      combinations: data.combinations.map((combo) => ({
        categories: combo.categories.map((cat) => cat.value),
        price: parseFloat(combo.price),
        description: combo.description,
      })),
    };

    const apiUrl = props?.menu
      ? `${process.env.NEXT_PUBLIC_API_URL}/restaurants/${restaurantContext?.restaurantData?._id}/menus/${props.menu._id}/update`
      : `${process.env.NEXT_PUBLIC_API_URL}/restaurants/${restaurantContext?.restaurantData?._id}/add-menus`;

    const method = props?.menu ? "put" : "post";

    axios[method](apiUrl, formattedData)
      .then((response) => {
        restaurantContext.setRestaurantData((prev) => ({
          ...prev,
          menus: response.data.restaurant.menus,
        }));
        router.push("/dashboard/menus");
      })
      .catch((error) => {
        console.error("Error saving menu:", error);
        setIsLoading(false);
      });
  }

  function handleAddCombination() {
    addCombination({ categories: [{ value: "" }], price: "", description: "" });
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-4">
      <div className="bg-white p-6 drop-shadow-sm rounded-lg flex flex-col gap-4">
        <div className="flex flex-col gap-1">
          <label className="block font-semibold">
            <span>{t("form.fixed.labels.name")}</span>

            <span className="text-xs opacity-50 ml-2 italic">
              {t("form.fixed.labels.optional")}
            </span>
          </label>

          <input
            type="text"
            placeholder="-"
            {...register("name")}
            className="p-2 border rounded-lg w-full"
            disabled={!props.isEditing}
          />
        </div>

        <div className="flex flex-col gap-1">
          <label className="block font-semibold">
            <span>{t("form.fixed.labels.generaleDescription")}</span>
            <span className="text-xs opacity-50 ml-2 italic">
              {t("form.fixed.labels.optional")}
            </span>
          </label>

          <input
            type="text"
            placeholder="-"
            {...register("description")}
            className="p-2 border rounded-lg w-full"
            disabled={!props.isEditing}
          />
        </div>
      </div>

      <div className="flex flex-col gap-12 bg-white p-6 rounded-lg drop-shadow-sm">
        {combinationFields.map((field, i) => (
          <div key={field.id} className="flex flex-col gap-4">
            <div className="flex justify-between">
              <h2 className="text-lg font-semibold py-2">
                {t("form.fixed.labels.option")} {i + 1}
              </h2>

              {props.isEditing && combinationFields.length > 1 && (
                <button
                  type="button"
                  onClick={() => removeCombination(i)}
                  className="px-4 py-2 text-white bg-red rounded-lg"
                >
                  {t("buttons.deleteOption")}
                </button>
              )}
            </div>

            <div className="flex flex-col mobile:flex-row flex-wrap gap-4">
              <CategoriesInputFixedMenuComponent
                control={control}
                register={register}
                combinationIndex={i}
                categories={categories}
                errorFields={errorFields}
                isEditing={props.isEditing}
                setErrorFields={setErrorFields}
              />
            </div>

            <div className="flex flex-col gap-1">
              <label className="block font-semibold">
                <span>{t("form.fixed.labels.description")}</span>
                <span className="text-xs opacity-50 ml-2 italic">
                  {t("form.fixed.labels.optional")}
                </span>
              </label>

              <input
                type="text"
                placeholder="-"
                {...register(`combinations.${i}.description`)}
                className="p-2 border rounded-lg w-full"
                disabled={!props.isEditing}
              />
            </div>

            <div className="flex flex-col gap-1">
              <label className="block font-semibold">
                {t("form.fixed.labels.price")}
              </label>

              <div className="flex items-center">
                <span
                  className={`px-3 py-2 rounded-l-lg border-t border-l border-b ${
                    errorFields.some(
                      (error) => error.comboIndex === i && error.emptyPrice
                    )
                      ? "border-red"
                      : ""
                  }`}
                >
                  {currencySymbol}
                </span>

                <input
                  type="number"
                  placeholder="-"
                  step="0.01"
                  {...register(`combinations.${i}.price`, {})}
                  className={`p-2 border rounded-r-lg w-24 ${
                    errorFields.some(
                      (error) => error.comboIndex === i && error.emptyPrice
                    )
                      ? "border-red"
                      : ""
                  }`}
                  disabled={!props.isEditing}
                  onWheel={(e) => e.target.blur()}
                />
              </div>
            </div>
          </div>
        ))}

        {props.isEditing && (
          <button
            type="button"
            onClick={handleAddCombination}
            className="px-4 py-2 w-fit bg-blue bg-opacity-30 text-blue rounded-lg"
          >
            {t("buttons.addOption")}
          </button>
        )}
      </div>

      <div className="flex gap-4 mx-auto">
        {props.isEditing && (
          <button
            type="submit"
            className="p-2 text-white rounded-lg bg-blue"
            disabled={isLoading}
          >
            {isLoading ? t("buttons.loading") : t("buttons.save")}
          </button>
        )}

        <button
          type="button"
          className="px-4 py-2 text-white bg-red rounded-lg"
          onClick={() => router.back()}
        >
          {props.isEditing ? t("buttons.cancel") : t("buttons.return")}
        </button>
      </div>
    </form>
  );
}
