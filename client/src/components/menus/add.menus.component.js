import { useContext, useEffect, useState } from "react";
import { useRouter } from "next/router";
import { useForm, useFieldArray } from "react-hook-form";
import axios from "axios";
import { useTranslation } from "next-i18next";
import { GlobalContext } from "@/contexts/global.context";
import { MenuSvg } from "../_shared/_svgs/_index";
import GlobalDishesComponent from "../dishes/global.dishes.component";

export default function AddMenusComponent(props) {
  const { t } = useTranslation("menus");
  const { restaurantContext } = useContext(GlobalContext);
  const router = useRouter();
  const [categories, setCategories] = useState(
    restaurantContext?.restaurantData?.dish_categories
  );
  const [isLoading, setIsLoading] = useState(false);
  const [menuType, setMenuType] = useState("fixed"); // Fixed by default

  const {
    register,
    handleSubmit,
    control,
    setValue,
    formState: { errors },
  } = useForm({
    defaultValues: { combinations: [] },
  });
  const { fields, append, remove } = useFieldArray({
    control,
    name: "combinations",
  });

  useEffect(() => {
    setCategories(restaurantContext?.restaurantData?.dish_categories);
  }, [restaurantContext?.restaurantData]);

  function onSubmit(data) {
    console.log(data);
  }

  return (
    <section className="flex flex-col gap-6">
      <hr className="opacity-20" />
      <div className="flex pl-2 gap-2 py-1 items-center">
        <MenuSvg width={30} height={30} fillColor="#131E3690" />
        <h1 className="pl-2 text-2xl flex items-center">
          {t("titles.main")} /{" "}
          {props.menu ? t("buttons.edit") : t("buttons.add")}
        </h1>
      </div>

      <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-4">
        <div className="flex flex-col gap-4">
          <label className="text-lg font-semibold">
            {t("fields.menu_type")}
          </label>
          <select
            value={menuType}
            onChange={(e) => setMenuType(e.target.value)}
            className="p-2 border rounded-md"
          >
            <option value="fixed">{t("fields.menu_fixed")}</option>
            <option value="custom">{t("fields.menu_custom")}</option>
          </select>
        </div>

        {menuType === "fixed" ? (
          <div className="flex flex-col gap-4">
            <h2 className="text-lg font-semibold">
              {t("fields.menu_combinations")}
            </h2>

            {fields.map((field, index) => (
              <div key={field.id} className="flex flex-col gap-2">
                <div className="flex items-center gap-2">
                  {field.categories?.map((category, catIndex) => (
                    <div key={catIndex} className="flex items-center gap-2">
                      <select
                        {...register(
                          `combinations.${index}.categories.${catIndex}`,
                          { required: true }
                        )}
                        className="p-2 border rounded-md"
                      >
                        {categories.map((cat) => (
                          <option key={cat._id} value={cat.name}>
                            {cat.name}
                          </option>
                        ))}
                      </select>
                    </div>
                  ))}
                  <button
                    type="button"
                    onClick={() => {
                      const newCategories = [...field.categories, ""]; // Ajoute un nouveau champ vide pour la catégorie
                      setValue(
                        `combinations.${index}.categories`,
                        newCategories
                      );
                    }}
                    className="text-blue text-lg"
                  >
                    +
                  </button>
                </div>
                <input
                  type="number"
                  step="0.01"
                  {...register(`combinations.${index}.price`, {
                    required: true,
                  })}
                  placeholder={t("fields.price_placeholder")}
                  className="p-2 border rounded-md w-28 mt-2"
                />
                <button
                  type="button"
                  onClick={() => remove(index)}
                  className="text-red mt-2"
                >
                  {t("buttons.delete_combination")}
                </button>
              </div>
            ))}
            <button
              type="button"
              onClick={() => append({ categories: [""], price: 0 })}
              className="mt-2 p-2 bg-blue text-white rounded-md"
            >
              {t("buttons.add_combination")}
            </button>
          </div>
        ) : (
          <div className="flex gap-4">
            <div className="w-full"></div>

            <div className="w-full">
              <GlobalDishesComponent
                categories={categories}
                menu={true}
                onDishSelect={(selectedDishes) =>
                  setValue("dishes", selectedDishes)
                }
              />
            </div>
          </div>
        )}

        <button
          type="submit"
          className={`p-2 mt-4 text-white rounded-md ${isLoading ? "bg-gray-400" : "bg-blue"}`}
          disabled={isLoading}
        >
          {isLoading ? t("buttons.saving") : t("buttons.save")}
        </button>
      </form>
    </section>
  );
}
