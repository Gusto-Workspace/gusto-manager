import { useState, useContext, useId, useEffect } from "react";
import { useRouter } from "next/router";

// I18N
import { useTranslation } from "next-i18next";

// SVG
import { DishSvg } from "../../_shared/_svgs/_index";

// AXIOS
import axios from "axios";

// REACT HOOK FORM
import { useForm } from "react-hook-form";

// CONTEXT
import { GlobalContext } from "@/contexts/global.context";

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
import {
  restrictToVerticalAxis,
  restrictToParentElement,
} from "@dnd-kit/modifiers";

// COMPONENTS
import DetailsDishComponent from "./details-dish.dishes.component";
import AddModaleDishesComponent from "./add-modale.dishes.component";
import CardCategoryListComponent from "./card-category-list.dishes.component";
import CatalogHeaderDashboardComponent, {
  CatalogActionButton,
  CatalogCategoryActionButton,
} from "../_shared/catalog-header.dashboard.component";

export default function ListDishesComponent(props) {
  const { t } = useTranslation("dishes");
  const router = useRouter();
  const { locale } = router;
  const { restaurantContext } = useContext(GlobalContext);
  const currencySymbol = locale === "fr" ? "€" : "$";

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingCategory, setEditingCategory] = useState(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [selectedDish, setSelectedDish] = useState(null);
  const [hoveredTooltip, setHoveredTooltip] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const [dishes, setDishes] = useState(
    props.subCategory
      ? props.subCategory?.dishes || []
      : props.category?.dishes || [],
  );
  const [subCategories, setSubCategories] = useState(
    props.subCategory ? [] : props.category?.subCategories || [],
  );

  useEffect(() => {
    if (!props.subCategory) {
      const currentCategory =
        restaurantContext?.restaurantData?.dish_categories?.find(
          (category) => category._id === props.category._id,
        );
      setSubCategories(currentCategory?.subCategories || []);
    }
  }, [
    restaurantContext?.restaurantData,
    props.category?._id,
    props.subCategory,
  ]);

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm();

  // GENERE UN ID POUR DND
  const id = useId();

  // Définir les capteurs pour prendre en charge à la fois la souris et le toucher
  const mouseSensor = useSensor(MouseSensor);
  const touchSensor = useSensor(TouchSensor);
  const sensors = useSensors(mouseSensor, touchSensor);

  function handleAddClick() {
    const formattedCategoryName = props.category.name
      .replace(/\//g, "-")
      .replace(/\s+/g, "&")
      .toLowerCase();
    if (props.subCategory) {
      const formattedSubCategoryName = props.subCategory.name
        .replace(/\//g, "-")
        .replace(/\s+/g, "&")
        .toLowerCase();
      router.push(
        `/dashboard/dishes/${formattedCategoryName}-${props.category._id}/${formattedSubCategoryName}-${props.subCategory._id}/add`,
      );
    } else {
      router.push(
        `/dashboard/dishes/${formattedCategoryName}-${props.category._id}/add`,
      );
    }
  }

  function handleEditClick(dish) {
    const formattedCategoryName = props.category.name
      .replace(/\//g, "-")
      .replace(/\s+/g, "&")
      .toLowerCase();
    if (props.subCategory) {
      const formattedSubCategoryName = props.subCategory.name
        .replace(/\//g, "-")
        .replace(/\s+/g, "&")
        .toLowerCase();
      router.push(
        `/dashboard/dishes/${formattedCategoryName}-${props.category._id}/${formattedSubCategoryName}-${props.subCategory._id}/add?dishId=${dish._id}`,
      );
    } else {
      router.push(
        `/dashboard/dishes/${formattedCategoryName}-${props.category._id}/add?dishId=${dish._id}`,
      );
    }
  }

  function handleEditClickSubCategory(category) {
    setEditingCategory(category);
    reset({ name: category.name });
    setIsModalOpen(true);
  }

  function handleAddSubCategoryClick() {
    setEditingCategory(null);
    setIsDeleting(false);
    reset({ name: "" });
    setIsModalOpen(true);
  }

  function handleDeleteSubCategoryClick(category) {
    setEditingCategory(category);
    setIsDeleting(true);
    setIsModalOpen(true);
  }

  function handleDeleteClick(dish) {
    setSelectedDish(dish);
    setIsDeleteModalOpen(true);
  }

  function closeDeleteModal() {
    setSelectedDish(null);
    setIsDeleteModalOpen(false);
  }

  function handleDeleteConfirm() {
    if (editingCategory) {
      setIsLoading(true);
      axios
        .delete(
          `${process.env.NEXT_PUBLIC_API_URL}/restaurants/${restaurantContext?.restaurantData?._id}/dishes/categories/${props.category._id}/subcategories/${editingCategory._id}`,
        )
        .then((response) => {
          restaurantContext.setRestaurantData(response.data.restaurant);
          setEditingCategory(null);
          setIsDeleting(false);
          setIsModalOpen(false);
        })
        .catch((error) => {
          console.error("Error deleting subcategory:", error);
        })
        .finally(() => setIsLoading(false));
      return;
    }

    if (!selectedDish) return;

    setIsLoading(true);
    axios
      .delete(
        `${process.env.NEXT_PUBLIC_API_URL}/restaurants/${restaurantContext?.restaurantData?._id}/dishes/${selectedDish._id}`,
        {
          params: props.subCategory
            ? {
                categoryId: props.category._id,
                subCategoryId: props.subCategory._id,
              }
            : {},
        },
      )
      .then((response) => {
        setDishes((prevDishes) =>
          prevDishes.filter((dish) => dish._id !== selectedDish._id),
        );
        restaurantContext.setRestaurantData(response.data.restaurant);
        closeDeleteModal();
      })
      .catch((error) => {
        console.error("Error deleting dish:", error);
      })
      .finally(() => setIsLoading(false));
  }

  function handleVisibilityToggle(subCategory) {
    axios
      .put(
        `${process.env.NEXT_PUBLIC_API_URL}/restaurants/${restaurantContext?.restaurantData?._id}/dishes/categories/${props.category._id}/subcategories/${subCategory._id}`,
        { visible: !subCategory.visible },
      )
      .then((response) => {
        restaurantContext.setRestaurantData(response.data.restaurant);
      })
      .catch((error) => {
        console.error("Error updating subcategory visibility:", error);
      });
  }

  function handleDragEnd(event) {
    const { active, over } = event;

    if (!active || !over) {
      return;
    }

    if (active.id === over?.id) return;

    if (active.id !== over.id) {
      setDishes((prevDishes) => {
        const oldIndex = prevDishes.findIndex((dish) => dish._id === active.id);
        const newIndex = prevDishes.findIndex((dish) => dish._id === over.id);

        const newDishesOrder = arrayMove(prevDishes, oldIndex, newIndex);

        saveNewDishOrder(newDishesOrder);

        return newDishesOrder;
      });
    }
  }

  function saveNewDishOrder(updatedDishes) {
    const orderedDishIds = updatedDishes.map((dish) => dish._id);

    const apiUrl = props.subCategory
      ? `${process.env.NEXT_PUBLIC_API_URL}/restaurants/${restaurantContext?.restaurantData?._id}/dishes/categories/${props.category._id}/subcategories/${props.subCategory._id}/dishes/order`
      : `${process.env.NEXT_PUBLIC_API_URL}/restaurants/${restaurantContext?.restaurantData?._id}/dishes/categories/${props.category._id}/dishes/order`;

    axios
      .put(apiUrl, { orderedDishIds })
      .then((response) => {
        restaurantContext.setRestaurantData(response.data.restaurant);
      })
      .catch((error) => {
        console.error("Error saving dish order:", error);
      });
  }

  function handleSubCategoryDragEnd(event) {
    const { active, over } = event;
    if (!active || !over || active.id === over.id) return;

    setSubCategories((currentSubCategories) => {
      const oldIndex = currentSubCategories.findIndex(
        (subCategory) => subCategory._id === active.id,
      );
      const newIndex = currentSubCategories.findIndex(
        (subCategory) => subCategory._id === over.id,
      );
      if (oldIndex === -1 || newIndex === -1) return currentSubCategories;

      const nextSubCategories = arrayMove(
        currentSubCategories,
        oldIndex,
        newIndex,
      );
      axios
        .put(
          `${process.env.NEXT_PUBLIC_API_URL}/restaurants/${restaurantContext?.restaurantData?._id}/dishes/categories/${props.category._id}/list-subcategories/order`,
          {
            orderedSubCategoryIds: nextSubCategories.map(
              (subCategory) => subCategory._id,
            ),
          },
        )
        .then((response) => {
          restaurantContext.setRestaurantData(response.data.restaurant);
        })
        .catch((error) => {
          console.error("Error saving subcategory order:", error);
        });
      return nextSubCategories;
    });
  }

  function handleSubCategoryClick(subCategory) {
    const formattedCategoryName = props.category.name
      .replace(/\//g, "-")
      .replace(/\s+/g, "&")
      .toLowerCase();
    const formattedSubCategoryName = subCategory.name
      .replace(/\//g, "-")
      .replace(/\s+/g, "&")
      .toLowerCase();
    router.push(
      `/dashboard/dishes/${formattedCategoryName}-${props.category._id}/${formattedSubCategoryName}-${subCategory._id}`,
    );
  }

  function onSubmit(data) {
    setIsSubmitting(true);
    const apiUrl = editingCategory
      ? `${process.env.NEXT_PUBLIC_API_URL}/restaurants/${restaurantContext?.restaurantData?._id}/dishes/categories/${props.category._id}/subcategories/${editingCategory._id}`
      : `${process.env.NEXT_PUBLIC_API_URL}/restaurants/${restaurantContext?.restaurantData?._id}/dishes/categories/${props.category._id}/subcategories`;
    const method = isDeleting ? "delete" : editingCategory ? "put" : "post";

    axios[method](apiUrl, isDeleting ? {} : { name: data.name })
      .then((response) => {
        restaurantContext.setRestaurantData(response.data.restaurant);
        setIsModalOpen(false);
        setEditingCategory(null);
        setIsDeleting(false);
        reset();
      })
      .catch((error) => {
        console.error("Error modifying dish subcategory:", error);
      })
      .finally(() => setIsSubmitting(false));
  }

  // Chemins formatés pour les niveaux de navigation
  const baseRoute = "/dashboard/dishes";
  const formattedCategoryRoute = props.category
    ? `/dashboard/dishes/${props.category.name
        .replace(/\//g, "-")
        .replace(/\s+/g, "&")
        .toLowerCase()}-${props.category._id}`
    : baseRoute;

  return (
    <div className="flex flex-col gap-6">
      <hr className="opacity-20" />

      <CatalogHeaderDashboardComponent
        icon={<DishSvg width={30} height={30} fillColor="#131E3690" />}
        title={t("titles.main")}
        onTitleClick={() => router.push(baseRoute)}
        onBack={
          props.subCategory
            ? () => router.push(formattedCategoryRoute)
            : props.category
              ? () => router.push(baseRoute)
              : undefined
        }
        backLabel={t("buttons.return", "Retour")}
        subtitleItems={
          props.subCategory
            ? [
                {
                  label: props.category?.name,
                  onClick: () => router.push(formattedCategoryRoute),
                },
                { label: props.subCategory.name },
              ]
            : props.category?.name
              ? [{ label: props.category.name }]
              : []
        }
        actions={
          <>
            <CatalogActionButton
              onClick={handleAddClick}
              label={t("buttons.add")}
            />
            {!props.subCategory && (
              <CatalogCategoryActionButton
                onClick={handleAddSubCategoryClick}
                label={t("buttons.addSubCategory")}
              />
            )}
          </>
        }
      />

      {subCategories.length > 0 && (
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragEnd={handleSubCategoryDragEnd}
          modifiers={[restrictToParentElement]}
        >
          <SortableContext
            items={subCategories.map((subCategory) => subCategory._id)}
          >
            <div className="grid grid-cols-1 midTablet:grid-cols-2 desktop:grid-cols-3 ultraWild:grid-cols-4 gap-4">
              {subCategories.map((subCategory) => (
                <CardCategoryListComponent
                  key={subCategory._id}
                  category={subCategory}
                  handleEditClick={handleEditClickSubCategory}
                  handleVisibilityToggle={handleVisibilityToggle}
                  handleDeleteClick={handleDeleteSubCategoryClick}
                  handleCategoryClick={handleSubCategoryClick}
                />
              ))}
            </div>
          </SortableContext>
        </DndContext>
      )}

      <div className="flex flex-col gap-2">
        <DndContext
          id={id}
          collisionDetection={closestCenter}
          onDragEnd={handleDragEnd}
          sensors={sensors}
          modifiers={[restrictToVerticalAxis, restrictToParentElement]}
        >
          <SortableContext items={dishes.map((dish) => dish._id)}>
            {dishes.map((dish) => (
              <DetailsDishComponent
                key={dish._id}
                hoveredTooltip={hoveredTooltip}
                setHoveredTooltip={setHoveredTooltip}
                dish={dish}
                handleEditClick={handleEditClick}
                handleDeleteClick={handleDeleteClick}
                currencySymbol={currencySymbol}
              />
            ))}
          </SortableContext>
        </DndContext>
      </div>

      {isDeleteModalOpen && (
        <div className="fixed inset-0 flex items-center justify-center z-[100]">
          <div
            onClick={closeDeleteModal}
            className="fixed inset-0 bg-black bg-opacity-20"
          />
          <div className="bg-white p-6 rounded-lg shadow-lg mx-6 w-[400px] z-10">
            <h2 className="text-xl font-semibold mb-6 text-center">
              {t("buttons.deleteDish")}
            </h2>

            <p className="mb-6 text-center">
              {t("buttons.confirmDelete", {
                dishName: selectedDish?.name,
              })}
            </p>

            <div className="flex gap-4 justify-center">
              <button
                className="px-4 py-2 rounded-lg bg-blue text-white"
                onClick={handleDeleteConfirm}
                disabled={isLoading}
              >
                {isLoading ? t("buttons.loading") : t("buttons.yes")}
              </button>

              <button
                className="px-4 py-2 rounded-lg bg-red text-white"
                onClick={closeDeleteModal}
                disabled={isLoading}
              >
                {t("buttons.no")}
              </button>
            </div>
          </div>
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
          reset={reset}
          errors={errors}
          isSubmitting={isSubmitting}
          hideDescription
          isSubCategory
        />
      )}
    </div>
  );
}
