import { useState, useContext } from "react";
import { useRouter } from "next/router";

// I18N
import { useTranslation } from "next-i18next";

// SVG
import {
  BioSvg,
  DeleteSvg,
  DishSvg,
  EditSvg,
  GlutenFreeSvg,
  NoVisibleSvg,
  VeganSvg,
  VegetarianSvg,
} from "../_shared/_svgs/_index";

// AXIOS
import axios from "axios";

// CONTEXT
import { GlobalContext } from "@/contexts/global.context";

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

  function handleAddClick() {
    router.push(`/dishes/${props.category._id}/add`);
  }

  function handleEditClick(dish) {
    router.push(`/dishes/${props.category._id}/add?dishId=${dish._id}`);
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

  return (
    <section className="flex flex-col gap-6">
      <hr className="opacity-20" />

      <div className="flex justify-between">
        <div className="pl-2 flex gap-2 items-center">
          <DishSvg width={30} height={30} fillColor="#131E3690" />

          <h1 className="pl-2 text-2xl">
            {t("titles.main")} / {props.category.name}
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
        {dishes.map((dish) => (
          <div
            key={dish._id}
            className="bg-white p-6 rounded-lg drop-shadow-sm flex gap-4 justify-between items-center"
          >
            <div>
              <h3 className="text-lg">
                {dish.name.charAt(0).toUpperCase() + dish.name.slice(1)}
              </h3>

              <p className="text-sm opacity-50">
                {dish.description.charAt(0).toUpperCase() +
                  dish.description.slice(1)}
              </p>
            </div>

            <div className="flex gap-6 items-center">
              <div className="relative flex gap-2">
                {dish.vegan && (
                  <div
                    onMouseEnter={() => setHoveredTooltip(`${dish._id}-vegan`)}
                    onMouseLeave={() => setHoveredTooltip(null)}
                    className="relative"
                  >
                    <VeganSvg
                      fillColor="white"
                      width={18}
                      height={18}
                      className="bg-red p-2 w-8 h-8 rounded-full opacity-70"
                    />
                    {hoveredTooltip === `${dish._id}-vegan` && (
                      <div className="absolute left-1/2 -translate-x-1/2 bottom-full mb-2 bg-darkBlue text-white text-xs p-2 rounded-lg whitespace-nowrap z-50">
                        {t("form.labels.vegan")}
                      </div>
                    )}
                  </div>
                )}
                {dish.vegetarian && (
                  <div
                    onMouseEnter={() =>
                      setHoveredTooltip(`${dish._id}-vegetarian`)
                    }
                    onMouseLeave={() => setHoveredTooltip(null)}
                    className="relative"
                  >
                    <VegetarianSvg
                      fillColor="white"
                      width={18}
                      height={18}
                      className="bg-violet p-2 w-8 h-8 rounded-full opacity-70"
                    />
                    {hoveredTooltip === `${dish._id}-vegetarian` && (
                      <div className="absolute left-1/2 -translate-x-1/2 bottom-full mb-2 bg-darkBlue text-white text-xs p-2 rounded-lg whitespace-nowrap z-50">
                        {t("form.labels.vegetarian")}
                      </div>
                    )}
                  </div>
                )}
                {dish.bio && (
                  <div
                    onMouseEnter={() => setHoveredTooltip(`${dish._id}-bio`)}
                    onMouseLeave={() => setHoveredTooltip(null)}
                    className="relative"
                  >
                    <BioSvg
                      fillColor="white"
                      width={18}
                      height={18}
                      className="bg-darkBlue p-2 w-8 h-8 rounded-full opacity-70"
                    />
                    {hoveredTooltip === `${dish._id}-bio` && (
                      <div className="absolute left-1/2 -translate-x-1/2 bottom-full mb-2 bg-darkBlue text-white text-xs p-2 rounded-lg whitespace-nowrap z-50">
                        {t("form.labels.bio")}
                      </div>
                    )}
                  </div>
                )}
                {dish.glutenFree && (
                  <div
                    onMouseEnter={() =>
                      setHoveredTooltip(`${dish._id}-glutenFree`)
                    }
                    onMouseLeave={() => setHoveredTooltip(null)}
                    className="relative"
                  >
                    <GlutenFreeSvg
                      fillColor="white"
                      width={18}
                      height={18}
                      className="bg-blue p-2 w-8 h-8 rounded-full opacity-70"
                    />
                    {hoveredTooltip === `${dish._id}-glutenFree` && (
                      <div className="absolute left-1/2 -translate-x-1/2 bottom-full mb-2 bg-darkBlue text-white text-xs p-2 rounded-lg whitespace-nowrap z-50">
                        {t("form.labels.glutenFree")}
                      </div>
                    )}
                  </div>
                )}
              </div>

              <p className="text-lg whitespace-nowrap">
                {dish.price.toFixed(2)} {currencySymbol}
              </p>

              <div
                onMouseEnter={() => setHoveredTooltip(`${dish._id}-visibility`)}
                onMouseLeave={() => setHoveredTooltip(null)}
                className="relative flex items-center"
              >
                <NoVisibleSvg
                  width={22}
                  height={22}
                  className={`${dish.showOnWebsite ? "opacity-10" : ""}`}
                />
                {hoveredTooltip === `${dish._id}-visibility` && (
                  <div className="absolute left-1/2 -translate-x-1/2 bottom-full mb-2 bg-darkBlue text-white text-xs p-2 rounded-lg whitespace-nowrap z-50">
                    {dish.showOnWebsite
                      ? t("form.labels.visible")
                      : t("form.labels.notVisible")}
                  </div>
                )}
              </div>

              <div className="flex gap-2">
                <button
                  className="hover:bg-[#4583FF] bg-[#4583FF99] p-[6px] rounded-full transition-colors duration-300"
                  onClick={(e) => {
                    e.stopPropagation();
                    handleEditClick(dish);
                  }}
                >
                  <EditSvg
                    width={20}
                    height={20}
                    strokeColor="white"
                    fillColor="white"
                  />
                </button>

                <button
                  className="hover:bg-[#FF7664] bg-[#FF766499] p-[6px] rounded-full transition-colors duration-300"
                  onClick={(e) => {
                    e.stopPropagation();
                    handleDeleteClick(dish);
                  }}
                >
                  <DeleteSvg
                    width={20}
                    height={20}
                    strokeColor="white"
                    fillColor="white"
                  />
                </button>
              </div>
            </div>
          </div>
        ))}
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
    </section>
  );
}
