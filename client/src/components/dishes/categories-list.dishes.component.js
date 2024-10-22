import { useContext, useState } from "react";
import { useRouter } from "next/router";

// REACT HOOK FORM
import { useForm } from "react-hook-form";

// AXIOS
import axios from "axios";

// CONTEXT
import { GlobalContext } from "@/contexts/global.context";

// I18N
import { useTranslation } from "next-i18next";

export default function CategoriesListDishesComponent() {
  const { t } = useTranslation("dishes");
  const router = useRouter();
  const { restaurantContext } = useContext(GlobalContext);
  const [isModalOpen, setIsModalOpen] = useState(false);

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm();

  function onSubmit(data) {
    axios
      .post(
        `${process.env.NEXT_PUBLIC_API_URL}/restaurants/${restaurantContext?.restaurantData?._id}/categories`,
        data
      )
      .then((response) => {
        restaurantContext.setRestaurantData(response.data.restaurant);
        setIsModalOpen(false);
        reset();
      })
      .catch((error) => {
        console.error("Error adding category:", error);
      });
  }

  return (
    <section className="flex flex-col gap-6">
      <hr className="opacity-20" />

      <div className="flex justify-between">
        <h1 className="pl-2 text-2xl">{t("titles.main")}</h1>

        <button
          onClick={() => setIsModalOpen(true)}
          className="bg-blue px-6 py-2 rounded-lg text-white cursor-pointer"
        >
          {t("buttons.addCategory")}
        </button>
      </div>

      <div className="grid grid-cols-1 tablet:grid-cols-2 desktop:grid-cols-3 ultraWild:grid-cols-4 gap-6">
        {restaurantContext?.restaurantData?.dish_categories?.map(
          (category, i) => (
            <div
              key={i}
              className="bg-white p-6 rounded-lg drop-shadow-sm cursor-pointer"
              onClick={() => console.log(category)}
            >
              <h2>{category.name}</h2>
            </div>
          )
        )}
      </div>

      {isModalOpen && (
        <div className="fixed inset-0 flex items-center justify-center z-[100]">
          {isModalOpen && (
            <div
              onClick={() => setIsModalOpen(false)}
              className="fixed inset-0 bg-black bg-opacity-20"
            />
          )}

          <div className="bg-white p-6 rounded-lg shadow-lg w-[400px] z-10">
            <h2 className="text-xl font-semibold mb-6 text-center">
              {t("buttons.addCategory")}
            </h2>

            <form
              onSubmit={handleSubmit(onSubmit)}
              className="flex flex-col gap-6"
            >
              <div className="flex flex-col gap-2">
                <label className="block font-semibold">
                  {t("form.labels.categoryName")}
                </label>

                <input
                  type="text"
                  placeholder="-"
                  {...register("name", { required: t("form.errors.required") })}
                  className={`border p-2 rounded-lg w-full ${errors.name ? "border-red" : ""}`}
                />
              </div>

              <div className="flex gap-4">
                <button
                  type="submit"
                  className="px-4 py-2 rounded-lg bg-blue text-white"
                >
                  {t("buttons.save")}
                </button>

                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-4 py-2 rounded-lg text-white bg-red"
                >
                  {t("buttons.cancel")}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </section>
  );
}
