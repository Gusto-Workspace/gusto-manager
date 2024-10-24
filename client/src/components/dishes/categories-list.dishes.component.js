import { useContext, useEffect, useState } from "react";
import { useRouter } from "next/router";

// REACT HOOK FORM
import { useForm } from "react-hook-form";

// AXIOS
import axios from "axios";

// CONTEXT
import { GlobalContext } from "@/contexts/global.context";

// I18N
import { useTranslation } from "next-i18next";

// SVG
import {
  DeleteSvg,
  DishSvg,
  EditSvg,
  NoVisibleSvg,
  RightArrowSvg,
} from "../_shared/_svgs/_index";

export default function CategoriesListDishesComponent() {
  const { t } = useTranslation("dishes");
  const router = useRouter();
  const { restaurantContext } = useContext(GlobalContext);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingCategory, setEditingCategory] = useState(null);
  const [isDeleting, setIsDeleting] = useState(false);

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm();

  useEffect(() => {
    if (editingCategory) {
      reset({ name: editingCategory.name });
    } else {
      reset({ name: "" });
    }
  }, [editingCategory, reset]);

  function handleEditClick(category) {
    setEditingCategory(category);
    setIsModalOpen(true);
  }

  function handleCategoryClick(category) {
    router.push(`/dishes/${category._id}`);
  }

  function handleDeleteClick(category) {
    setEditingCategory(category);
    setIsDeleting(true);
    setIsModalOpen(true);
  }

  function handleVisibilityToggle(category) {
    const updatedVisibility = !category.visible;

    axios
      .put(
        `${process.env.NEXT_PUBLIC_API_URL}/restaurants/${restaurantContext?.restaurantData?._id}/categories/${category._id}`,
        { visible: updatedVisibility }
      )
      .then((response) => {
        restaurantContext.setRestaurantData(response.data.restaurant);
      })
      .catch((error) => {
        console.error("Error updating category visibility:", error);
      });
  }

  function onSubmit(data) {
    const apiUrl = editingCategory
      ? `${process.env.NEXT_PUBLIC_API_URL}/restaurants/${restaurantContext?.restaurantData?._id}/categories/${editingCategory._id}`
      : `${process.env.NEXT_PUBLIC_API_URL}/restaurants/${restaurantContext?.restaurantData?._id}/categories`;

    const method = isDeleting ? "delete" : editingCategory ? "put" : "post";

    axios[method](apiUrl, isDeleting ? {} : data)
      .then((response) => {
        restaurantContext.setRestaurantData(response.data.restaurant);
        setIsModalOpen(false);
        reset();
        setEditingCategory(null);
        setIsDeleting(false);
      })
      .catch((error) => {
        console.error("Error modifying, adding or deleting category:", error);
      });
  }

  return (
    <section className="flex flex-col gap-6">
      <hr className="opacity-20" />

      <div className="flex justify-between">
        <div className="pl-2 flex gap-2 items-center">
          <DishSvg width={30} height={30} fillColor="#131E3690" />
          <h1 className="pl-2 text-2xl">{t("titles.main")}</h1>
        </div>

        <button
          onClick={() => {
            setEditingCategory(null);
            setIsDeleting(false);
            setIsModalOpen(true);
          }}
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
              className="relative bg-white p-6 pb-2 rounded-lg drop-shadow-sm flex flex-col gap-2 justify-between items-center"
            >
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  handleEditClick(category);
                }}
                className="absolute right-0 top-0 flex flex-col items-center gap-1 p-2"
              >
                <div className="hover:opacity-100 opacity-20 p-[6px] rounded-full transition-opacity duration-300">
                  <EditSvg
                    width={20}
                    height={20}
                    strokeColor="#131E36"
                    fillColor="#131E36"
                  />
                </div>
              </button>

              <h2 className="text-xl font-semibold">{category.name}</h2>

              <p className="text-sm opacity-50 mb-2">
                Nombre de plats : {category.dishes.length}
              </p>

              <hr className="bg-darkBlue h-[1px] w-[90%] opacity-20" />

              <div className="flex w-full justify-center">
                <div className="w-1/3 flex justify-center">
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      handleVisibilityToggle(category);
                    }}
                    className="flex flex-col items-center gap-1 p-2"
                  >
                    <div
                      className={`bg-green ${
                        category.visible ? "bg-opacity-20" : ""
                      } p-[6px] rounded-full transition-colors duration-300`}
                    >
                      <NoVisibleSvg
                        width={15}
                        height={15}
                        strokeColor="white"
                        fillColor="white"
                      />
                    </div>
                    <p className="text-xs text-center">
                      {category.visible ? "Visible" : "Non Visible"}
                    </p>
                  </button>
                </div>

                <div className="w-1/3 flex justify-center">
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      handleDeleteClick(category);
                    }}
                    className="flex flex-col items-center gap-1 p-2"
                  >
                    <div className="hover:bg-[#FF7664] bg-[#FF766499] p-[6px] rounded-full transition-colors duration-300">
                      <DeleteSvg
                        width={15}
                        height={15}
                        strokeColor="white"
                        fillColor="white"
                      />
                    </div>
                    <p className="text-xs text-center">Supprimer</p>
                  </button>
                </div>

                <div className="w-1/3 flex justify-center">
                  <button
                    onClick={() => handleCategoryClick(category)}
                    className="flex flex-col items-center gap-1 p-2"
                  >
                    <div className="hover:bg-[#634FD2] bg-[#634FD299] p-[6px] rounded-full transition-colors duration-300">
                      <RightArrowSvg
                        width={15}
                        height={15}
                        strokeColor="white"
                        fillColor="white"
                      />
                    </div>
                    <p className="text-xs text-center">Accéder</p>
                  </button>
                </div>
              </div>
            </div>
          )
        )}
      </div>

      {isModalOpen && (
        <div className="fixed inset-0 flex items-center justify-center z-[100]">
          <div
            onClick={() => {
              setIsModalOpen(false);
              setEditingCategory(null);
              setIsDeleting(false);
            }}
            className="fixed inset-0 bg-black bg-opacity-20"
          />

          <div className="bg-white p-6 rounded-lg shadow-lg w-[400px] z-10">
            <h2 className="text-xl font-semibold mb-6 text-center">
              {isDeleting
                ? t("buttons.deleteCategory")
                : editingCategory
                  ? t("buttons.editCategory")
                  : t("buttons.addCategory")}
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
                  defaultValue={editingCategory?.name || ""}
                  disabled={isDeleting}
                  {...register("name", { required: !isDeleting })}
                  className={`border p-2 rounded-lg w-full ${
                    errors.name ? "border-red" : ""
                  } ${isDeleting ? "opacity-50 cursor-not-allowed" : ""}`}
                />
              </div>

              <div className="flex gap-4">
                <button
                  type="submit"
                  className="px-4 py-2 rounded-lg bg-blue text-white"
                >
                  {isDeleting ? t("buttons.confirm") : t("buttons.save")}
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setIsModalOpen(false);
                    setEditingCategory(null);
                    setIsDeleting(false);
                  }}
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
