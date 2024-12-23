import { useState, useContext, useId } from "react";
import { useRouter } from "next/router";

// I18N
import { useTranslation } from "next-i18next";

// SVG
import { DishSvg } from "../_shared/_svgs/_index";

// AXIOS
import axios from "axios";

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
import DetailsDishComponent from "./details-dish.dishes.component";

export default function ListDishesComponent(props) {
  const { t } = useTranslation("dishes");
  const router = useRouter();
  const { locale } = router;
  const { restaurantContext } = useContext(GlobalContext);
  const currencySymbol = locale === "fr" ? "€" : "$";

  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [selectedDish, setSelectedDish] = useState(null);
  const [hoveredTooltip, setHoveredTooltip] = useState(null);
  const [dishes, setDishes] = useState(props.category.dishes);

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
    router.push(`/dishes/${formattedCategoryName}-${props.category._id}/add`);
  }

  function handleEditClick(dish) {
    const formattedCategoryName = props.category.name
      .replace(/\//g, "-")
      .replace(/\s+/g, "&")
      .toLowerCase();
    router.push(
      `/dishes/${formattedCategoryName}-${props.category._id}/add?dishId=${dish._id}`
    );
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
    if (!selectedDish) return;

    axios
      .delete(
        `${process.env.NEXT_PUBLIC_API_URL}/restaurants/${restaurantContext?.restaurantData?._id}/dishes/${selectedDish._id}`
      )
      .then((response) => {
        setDishes((prevDishes) =>
          prevDishes.filter((dish) => dish._id !== selectedDish._id)
        );
        restaurantContext.setRestaurantData(response.data.restaurant);
        closeDeleteModal();
      })
      .catch((error) => {
        console.error("Error deleting dish:", error);
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

    axios
      .put(
        `${process.env.NEXT_PUBLIC_API_URL}/restaurants/${restaurantContext?.restaurantData?._id}/dishes/categories/${props.category._id}/dishes/order`,
        { orderedDishIds }
      )
      .then((response) => {
        restaurantContext.setRestaurantData(response.data.restaurant);
      })
      .catch((error) => {
        console.error("Error saving dish order:", error);
      });
  }

  // Chemins formatés pour les niveaux de navigation
  const baseRoute = "/dishes";
  const formattedCategoryRoute = props.category
    ? `/dishes/${props.category.name
      .replace(/\//g, "-")
      .replace(/\s+/g, "&") 
      .toLowerCase()
    }-${props.category._id}`
    : baseRoute;

  return (
    <div className="flex flex-col gap-6">
      <hr className="opacity-20" />

      <div className="flex gap-4 flex-wrap justify-between">
        <div className="flex gap-2 items-center min-h-[40px]">
          <DishSvg width={30} height={30} fillColor="#131E3690" />

          <h1 className="pl-2 text-xl tablet:text-2xl flex items-center gap-2">
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
          </h1>
        </div>

        <button
          onClick={handleAddClick}
          className="bg-blue px-6 py-2 rounded-lg text-white cursor-pointer"
        >
          {t("buttons.add")}
        </button>
      </div>

      <div className="flex flex-col gap-4">
        <DndContext
          id={id}
          collisionDetection={closestCenter}
          onDragEnd={handleDragEnd}
          sensors={sensors}
          modifiers={[restrictToVerticalAxis]}
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
          <div className="bg-white p-6 rounded-lg shadow-lg w-[400px] z-10">
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
    </div>
  );
}
