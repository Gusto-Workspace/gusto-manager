import { useState, useContext, useId, useEffect } from "react";
import { useRouter } from "next/router";

// I18N
import { useTranslation } from "next-i18next";

// SVG
import { WineSvg } from "../../_shared/_svgs/_index";

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
import { restrictToVerticalAxis } from "@dnd-kit/modifiers";

// COMPONENTS
import DetailsWineComponent from "./details-wine.wines.component";
import AddModaleWinesComponent from "./add-modale.wines.component";
import CardCategoryListComponent from "./card-category-list.wines.component";

export default function ListWinesComponent(props) {
  const { t } = useTranslation("wines");
  const router = useRouter();
  const { locale } = router;
  const { restaurantContext } = useContext(GlobalContext);
  const currencySymbol = locale === "fr" ? "€" : "$";

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingCategory, setEditingCategory] = useState(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [selectedWine, setSelectedWine] = useState(null);
  const [hoveredTooltip, setHoveredTooltip] = useState(null);
  const [wines, setWines] = useState(
    props.subCategory ? props.subCategory.wines : props.category.wines
  );

  const [subCategories, setSubCategories] = useState(
    !props.subCategory &&
      restaurantContext?.restaurantData?.wine_categories?.find(
        (category) => category._id === props.category._id
      )?.subCategories
  );

  useEffect(() => {
    {
      !props.subCategory &&
        setSubCategories(
          restaurantContext?.restaurantData?.wine_categories?.find(
            (category) => category._id === props.category._id
          )?.subCategories
        );
    }
  }, [restaurantContext?.restaurantData, props.category_id]);

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
        `/dashboard/wines/${formattedCategoryName}-${props.category._id}/${formattedSubCategoryName}-${props.subCategory._id}/add`
      );
    } else {
      const formattedName = props.category.name
        .replace(/\//g, "-")
        .replace(/\s+/g, "&")
        .toLowerCase();
      router.push(`/dashboard/wines/${formattedName}-${props.category._id}/add`);
    }
  }

  function handleEditClick(wine) {
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
        `/dashboard/wines/${formattedCategoryName}-${props.category._id}/${formattedSubCategoryName}-${props.subCategory._id}/add?wineId=${wine._id}`
      );
    } else {
      const formattedCategoryName = props.category.name
        .replace(/\//g, "-")
        .replace(/\s+/g, "&")
        .toLowerCase();
      router.push(
        `/dashboard/wines/${formattedCategoryName}-${props.category._id}/add?wineId=${wine._id}`
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

  function handleDeleteClick(wine) {
    setSelectedWine(wine);
    setIsDeleteModalOpen(true);
  }

  function handleDeleteSubCategoryClick(category) {
    setEditingCategory(category);
    setIsDeleting(true);
    setIsModalOpen(true);
  }

  function closeDeleteModal() {
    setSelectedWine(null);
    setIsDeleteModalOpen(false);
  }

  function handleDeleteConfirm() {
    if (editingCategory) {
      axios
        .delete(
          `${process.env.NEXT_PUBLIC_API_URL}/restaurants/${restaurantContext?.restaurantData?._id}/wines/categories/${props.category._id}/subcategories/${editingCategory._id}`
        )
        .then((response) => {
          setSubCategories((prevSubCategories) =>
            prevSubCategories.filter(
              (subCategory) => subCategory._id !== editingCategory._id
            )
          );
          restaurantContext.setRestaurantData(response.data.restaurant);
          setEditingCategory(null);
          setIsModalOpen(false);
        })
        .catch((error) => {
          console.error("Error deleting subcategory:", error);
        });
    } else if (selectedWine) {
      const apiUrl = `${process.env.NEXT_PUBLIC_API_URL}/restaurants/${restaurantContext?.restaurantData?._id}/wines/${selectedWine._id}`;
      const params = props.subCategory
        ? {
            categoryId: props.category._id,
            subCategoryId: props.subCategory._id,
          }
        : {};

      axios
        .delete(apiUrl, { params })
        .then((response) => {
          setWines((prevWines) =>
            prevWines.filter((wine) => wine._id !== selectedWine._id)
          );
          restaurantContext.setRestaurantData(response.data.restaurant);
          closeDeleteModal();
        })
        .catch((error) => {
          console.error("Error deleting wine:", error);
        });
    }
  }

  function handleVisibilityToggle(subCategory) {
    const updatedVisibility = !subCategory.visible;

    axios
      .put(
        `${process.env.NEXT_PUBLIC_API_URL}/restaurants/${restaurantContext?.restaurantData?._id}/wines/categories/${props.category._id}/subcategories/${subCategory._id}`,
        { visible: updatedVisibility }
      )
      .then((response) => {
        restaurantContext.setRestaurantData(response.data.restaurant);
      })
      .catch((error) => {
        console.error("Error updating subCategory visibility:", error);
      });
  }

  function handleDragEnd(event) {
    const { active, over } = event;

    if (!active || !over) {
      return;
    }

    if (active.id === over?.id) return;

    if (active.id !== over.id) {
      setWines((prevWines) => {
        const oldIndex = prevWines.findIndex((wine) => wine._id === active.id);
        const newIndex = prevWines.findIndex((wine) => wine._id === over.id);

        const newDishesOrder = arrayMove(prevWines, oldIndex, newIndex);

        saveNewDishOrder(newDishesOrder);

        return newDishesOrder;
      });
    }
  }

  function saveNewDishOrder(updatedWines) {
    const orderedWineIds = updatedWines.map((wine) => wine._id);

    let apiUrl;
    if (props.subCategory) {
      // URL pour réorganiser les boissons dans une sous-catégorie
      apiUrl = `${process.env.NEXT_PUBLIC_API_URL}/restaurants/${restaurantContext?.restaurantData?._id}/wines/categories/${props.category._id}/subcategories/${props.subCategory._id}/wines/order`;
    } else {
      // URL pour réorganiser les boissons dans une catégorie
      apiUrl = `${process.env.NEXT_PUBLIC_API_URL}/restaurants/${restaurantContext?.restaurantData?._id}/wines/categories/${props.category._id}/wines/order`;
    }

    axios
      .put(apiUrl, { orderedWineIds })
      .then((response) => {
        restaurantContext.setRestaurantData(response.data.restaurant);
      })
      .catch((error) => {
        console.error("Error saving wine order:", error);
      });
  }

  function saveNewSubCategoryOrder(updatedSubCategories) {
    const orderedSubCategoryIds = updatedSubCategories.map(
      (subCategory) => subCategory._id
    );

    axios
      .put(
        `${process.env.NEXT_PUBLIC_API_URL}/restaurants/${restaurantContext?.restaurantData?._id}/wines/categories/${props.category._id}/list-subcategories/order`,
        { orderedSubCategoryIds }
      )
      .then((response) => {
        restaurantContext.setRestaurantData(response.data.restaurant);
      })
      .catch((error) => {
        console.error("Error saving subcategory order:", error);
      });
  }

  function handleSubCategoryDragEnd(event) {
    const { active, over } = event;

    if (!active || !over) {
      return;
    }

    if (active.id !== over.id) {
      setSubCategories((prevSubCategories) => {
        const oldIndex = prevSubCategories.findIndex(
          (subCategory) => subCategory._id === active.id
        );
        const newIndex = prevSubCategories.findIndex(
          (subCategory) => subCategory._id === over.id
        );

        const newSubCategoriesOrder = arrayMove(
          prevSubCategories,
          oldIndex,
          newIndex
        );
        saveNewSubCategoryOrder(newSubCategoriesOrder);

        return newSubCategoriesOrder;
      });
    }
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
      `/dashboard/wines/${formattedCategoryName}-${props.category._id}/${formattedSubCategoryName}-${subCategory._id}`
    );
  }

  function onSubmit(data) {
    setIsSubmitting(true);
    const apiUrl = editingCategory
      ? `${process.env.NEXT_PUBLIC_API_URL}/restaurants/${restaurantContext?.restaurantData?._id}/wines/categories/${props.category._id}/subcategories/${editingCategory._id}`
      : `${process.env.NEXT_PUBLIC_API_URL}/restaurants/${restaurantContext?.restaurantData?._id}/wines/categories/${props.category._id}/subcategories/`;

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
      })
      .finally(() => {
        setIsSubmitting(false);
      });
  }

  // Chemins pour la navigation avec le formatage de nom et d'ID
  const baseRoute = "/dashboard/wines";
  const formattedCategoryRoute = props.category
    ? `/dashboard/wines/${props.category.name
        .replace(/\//g, "-")
        .replace(/\s+/g, "&")
        .toLowerCase()}-${props.category._id}`
    : baseRoute;

  const formattedSubCategoryRoute = props.subCategory
    ? `/dashboard/wines/${props.category.name
        .replace(/\//g, "-")
        .replace(/\s+/g, "&")
        .toLowerCase()}-${props.category._id}/${props.subCategory.name
        .replace(/\//g, "-")
        .replace(/\s+/g, "&")
        .toLowerCase()}-${props.subCategory._id}`
    : formattedCategoryRoute;

  return (
    <div className="flex flex-col gap-6">
      <hr className="opacity-20" />

      <div className="flex gap-4 flex-wrap justify-between">
        <div className="flex gap-2 items-center min-h-[40px]">
          <WineSvg
            width={30}
            height={30}
            className="min-h-[30px] min-w-[30px]"
            fillColor="#131E3690"
          />
          
          <h1 className="pl-2 text-xl tablet:text-2xl flex flex-wrap items-center gap-2">
            <span
              className="cursor-pointer hover:underline"
              onClick={() => router.push(baseRoute)}
            >
              {t("titles.main")}
            </span>

            {props.category && (
              <>
                <span>/</span>
                <span
                  className="cursor-pointer hover:underline"
                  onClick={() => router.push(formattedCategoryRoute)}
                >
                  {props.category.name}
                </span>
              </>
            )}

            {props.subCategory && (
              <>
                <span>/</span>
                <span
                  className="cursor-pointer hover:underline"
                  onClick={() => router.push(formattedSubCategoryRoute)}
                >
                  {props.subCategory.name}
                </span>
              </>
            )}
          </h1>
        </div>

        <div className="flex flex-wrap gap-4">
          <button
            onClick={handleAddClick}
            className="bg-blue px-6 py-2 rounded-lg text-white cursor-pointer"
          >
            {t("buttons.addWine")}
          </button>

          {!props.subCategory && (
            <button
              onClick={handleAddSubCategoryClick}
              className="bg-blue px-6 py-2 rounded-lg text-white cursor-pointer"
            >
              {t("buttons.addSubCategory")}
            </button>
          )}
        </div>
      </div>

      {subCategories && (
        <div className="flex flex-col gap-12">
          <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragEnd={handleSubCategoryDragEnd}
          >
            <SortableContext
              items={subCategories?.map((subCategory) => subCategory._id)}
            >
              <div className="grid grid-cols-1 midTablet:grid-cols-2 desktop:grid-cols-3 ultraWild:grid-cols-4 gap-6">
                {subCategories?.map((subCategory, i) => (
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
        </div>
      )}

      <div className="flex flex-col gap-4">
        <DndContext
          id={id}
          collisionDetection={closestCenter}
          onDragEnd={handleDragEnd}
          sensors={sensors}
          modifiers={[restrictToVerticalAxis]}
        >
          <SortableContext items={wines.map((wine) => wine._id)}>
            {wines.map((wine) => (
              <DetailsWineComponent
                key={wine._id}
                hoveredTooltip={hoveredTooltip}
                setHoveredTooltip={setHoveredTooltip}
                wine={wine}
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
          <div className="bg-white p-6 rounded-lg shadow-lg w-[400px] z-10">
            <h2 className="text-xl font-semibold mb-6 text-center">
              {t("buttons.deleteWine")}
            </h2>

            <p className="mb-6 text-center">
              {t("buttons.confirmDelete", {
                wineName: selectedWine?.name,
              })}
            </p>

            <div className="flex gap-4 justify-center">
              <button
                className="px-4 py-2 rounded-lg bg-blue text-white"
                onClick={handleDeleteConfirm}
              >
                {t("buttons.yes")}
              </button>

              <button
                className="px-4 py-2 rounded-lg bg-red text-white"
                onClick={closeDeleteModal}
              >
                {t("buttons.no")}
              </button>
            </div>
          </div>
        </div>
      )}

      {isModalOpen && (
        <AddModaleWinesComponent
          setIsModalOpen={setIsModalOpen}
          setEditingCategory={setEditingCategory}
          setIsDeleting={setIsDeleting}
          isDeleting={isDeleting}
          editingCategory={editingCategory}
          onSubmit={onSubmit}
          reset={reset}
          handleSubmit={handleSubmit}
          register={register}
          errors={errors}
          isSubmitting={isSubmitting}
        />
      )}
    </div>
  );
}
