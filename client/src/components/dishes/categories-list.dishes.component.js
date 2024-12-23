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
import { DishSvg } from "../_shared/_svgs/_index";

// DND
import {
  DndContext,
  closestCenter,
  MouseSensor,
  TouchSensor,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import { arrayMove, SortableContext } from "@dnd-kit/sortable";

// COMPONENTS
import CardCategoryListComponent from "./card-category-list.dishes.component";
import AddModaleDishesComponent from "./add-modale.dishes.component";
import GlobalDishesComponent from "./global.dishes.component";

export default function CategoriesListDishesComponent() {
  const { t } = useTranslation("dishes");
  const router = useRouter();
  const { restaurantContext } = useContext(GlobalContext);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingCategory, setEditingCategory] = useState(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [categories, setCategories] = useState(
    restaurantContext?.restaurantData?.dish_categories
  );

  // Détecte les capteurs pour le drag-and-drop (souris et tactile)
  const mouseSensor = useSensor(MouseSensor);
  const touchSensor = useSensor(TouchSensor);
  const sensors = useSensors(mouseSensor, touchSensor);

  useEffect(() => {
    setCategories(restaurantContext?.restaurantData?.dish_categories);
  }, [restaurantContext?.restaurantData]);

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm();

  useEffect(() => {
    if (editingCategory) {
      reset({
        name: editingCategory.name,
        description: editingCategory.description,
      });
    } else {
      reset({ name: null, description: null });
    }
  }, [editingCategory, reset]);

  function handleEditClick(category) {
    setEditingCategory(category);
    setIsModalOpen(true);
  }

  function handleCategoryClick(category) {
    const formattedName = category.name
      .replace(/\//g, "-")
      .replace(/\s+/g, "&")
      .toLowerCase();
    router.push(`/dishes/${formattedName}-${category._id}`);
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
        `${process.env.NEXT_PUBLIC_API_URL}/restaurants/${restaurantContext?.restaurantData?._id}/dishes/categories/${category._id}`,
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
      ? `${process.env.NEXT_PUBLIC_API_URL}/restaurants/${restaurantContext?.restaurantData?._id}/dishes/categories/${editingCategory._id}`
      : `${process.env.NEXT_PUBLIC_API_URL}/restaurants/${restaurantContext?.restaurantData?._id}/dishes/categories`;

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

  function handleDragEnd(event) {
    const { active, over } = event;

    if (!active || !over) {
      return;
    }

    if (active.id !== over.id) {
      setCategories((prevCategories) => {
        const oldIndex = prevCategories.findIndex(
          (cat) => cat._id === active.id
        );
        const newIndex = prevCategories.findIndex((cat) => cat._id === over.id);

        const newCategoriesOrder = arrayMove(
          prevCategories,
          oldIndex,
          newIndex
        );

        saveNewCategoryOrder(newCategoriesOrder);

        return newCategoriesOrder;
      });
    }
  }

  function saveNewCategoryOrder(updatedCategories) {
    const orderedCategoryIds = updatedCategories.map(
      (category) => category._id
    );

    axios
      .put(
        `${process.env.NEXT_PUBLIC_API_URL}/restaurants/${restaurantContext?.restaurantData?._id}/dishes/categories-list/order`,
        { orderedCategoryIds }
      )
      .then((response) => {
        restaurantContext.setRestaurantData(response.data.restaurant);
      })
      .catch((error) => {
        console.error("Error saving category order:", error);
      });
  }

  return (
    <div className="flex flex-col gap-6">
      <hr className="opacity-20" />

      <div className="flex flex-wrap gap-4 justify-between">
        <div className="flex gap-2 items-center min-h-[40px]">
          <DishSvg width={30} height={30} fillColor="#131E3690" />

          <h1 className="pl-2 text-xl tablet:text-2xl">{t("titles.main")}</h1>
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

      {categories && (
        <div className="flex flex-col gap-12">
          <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragEnd={handleDragEnd}
          >
            <SortableContext
              items={categories?.map((category) => category._id)}
            >
              <div className="grid grid-cols-1 tablet:grid-cols-2 desktop:grid-cols-3 ultraWild:grid-cols-4 gap-6">
                {categories?.map((category) => (
                  <CardCategoryListComponent
                    key={category._id}
                    category={category}
                    handleEditClick={handleEditClick}
                    handleVisibilityToggle={handleVisibilityToggle}
                    handleDeleteClick={handleDeleteClick}
                    handleCategoryClick={handleCategoryClick}
                  />
                ))}
              </div>
            </SortableContext>
          </DndContext>

          <GlobalDishesComponent categories={categories} />
        </div>
      )}

      {isModalOpen && (
        <AddModaleDishesComponent
          setIsModalOpen={setIsModalOpen}
          setEditingCategory={setEditingCategory}
          setIsDeleting={setIsDeleting}
          isDeleting={isDeleting}
          editingCategory={editingCategory}
          onSubmit={onSubmit}
          handleSubmit={handleSubmit}
          register={register}
          errors={errors}
        />
      )}
    </div>
  );
}
