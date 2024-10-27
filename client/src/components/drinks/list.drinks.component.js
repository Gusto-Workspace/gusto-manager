import { useState, useContext, useId } from "react";
import { useRouter } from "next/router";

// I18N
import { useTranslation } from "next-i18next";

// SVG
import { DishSvg } from "../_shared/_svgs/_index";

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
import DetailsDrinkComponent from "./details-drink.drinks.component";
import AddModaleDrinksComponent from "./add-modale.drinks.component";

export default function ListDrinksComponent(props) {
  const { t } = useTranslation("drinks");
  const router = useRouter();
  const { locale } = router;
  const { restaurantContext } = useContext(GlobalContext);
  const currencySymbol = locale === "fr" ? "€" : "$";

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingCategory, setEditingCategory] = useState(null);
  const [isDeleting, setIsDeleting] = useState(false);

  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [selectedDrink, setSelectedDish] = useState(null);
  const [hoveredTooltip, setHoveredTooltip] = useState(null);
  const [drinks, setDrinks] = useState(props.category.drinks);

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
    router.push(`/drinks/${props.category._id}/add`);
  }

  function handleEditClick(drink) {
    router.push(`/drinks/${props.category._id}/add?drinkId=${drink._id}`);
  }

  function handleAddSubCategoryClick() {
    setEditingCategory(true); // Efface la sélection de catégorie principale
    setIsModalOpen(true);
  }

  function handleDeleteClick(drink) {
    setSelectedDish(drink);
    setIsDeleteModalOpen(true);
  }

  function closeDeleteModal() {
    setSelectedDish(null);
    setIsDeleteModalOpen(false);
  }

  function handleDeleteConfirm() {
    if (!selectedDrink) return;

    axios
      .delete(
        `${process.env.NEXT_PUBLIC_API_URL}/restaurants/${restaurantContext?.restaurantData?._id}/drinks/${selectedDrink._id}`
      )
      .then((response) => {
        setDrinks((prevDrinks) =>
          prevDrinks.filter((drink) => drink._id !== selectedDrink._id)
        );
        restaurantContext.setRestaurantData(response.data.restaurant);
        closeDeleteModal();
      })
      .catch((error) => {
        console.error("Error deleting drink:", error);
      });
  }

  function handleDragEnd(event) {
    const { active, over } = event;

    if (!active || !over) {
      return;
    }

    if (active.id === over?.id) return;

    if (active.id !== over.id) {
      setDrinks((prevDrinks) => {
        const oldIndex = prevDrinks.findIndex(
          (drink) => drink._id === active.id
        );
        const newIndex = prevDrinks.findIndex((drink) => drink._id === over.id);

        const newDishesOrder = arrayMove(prevDrinks, oldIndex, newIndex);

        saveNewDishOrder(newDishesOrder);

        return newDishesOrder;
      });
    }
  }

  function saveNewDishOrder(updatedDrinks) {
    const orderedDrinkIds = updatedDrinks.map((drink) => drink._id);

    axios
      .put(
        `${process.env.NEXT_PUBLIC_API_URL}/restaurants/${restaurantContext?.restaurantData?._id}/drinks/categories/${props.category._id}/drinks/order`,
        { orderedDrinkIds }
      )
      .then((response) => {
        restaurantContext.setRestaurantData(response.data.restaurant);
      })
      .catch((error) => {
        console.error("Error saving drink order:", error);
      });
  }

  function onSubmit(data) {
    console.log(data);
  }

  return (
    <div className="flex flex-col gap-6">
      <hr className="opacity-20" />

      <div className="flex justify-between">
        <div className="pl-2 flex gap-2 items-center">
          <DishSvg width={30} height={30} fillColor="#131E3690" />

          <h1 className="pl-2 text-2xl">
            {t("titles.main")} / {props.category.name}
          </h1>
        </div>

        <div className="flex gap-4">
          <button
            onClick={handleAddClick}
            className="bg-blue px-6 py-2 rounded-lg text-white cursor-pointer"
          >
            {t("buttons.addDrink")}
          </button>

          <button
            onClick={handleAddSubCategoryClick}
            className="bg-blue px-6 py-2 rounded-lg text-white cursor-pointer"
          >
            {t("buttons.addSubCategory")}
          </button>
        </div>
      </div>

      <div className="flex flex-col gap-4">
        <DndContext
          id={id}
          collisionDetection={closestCenter}
          onDragEnd={handleDragEnd}
          sensors={sensors}
          modifiers={[restrictToVerticalAxis]}
        >
          <SortableContext items={drinks.map((drink) => drink._id)}>
            {drinks.map((drink) => (
              <DetailsDrinkComponent
                key={drink._id}
                hoveredTooltip={hoveredTooltip}
                setHoveredTooltip={setHoveredTooltip}
                drink={drink}
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
                drinkName: selectedDrink?.name,
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
        <AddModaleDrinksComponent
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
