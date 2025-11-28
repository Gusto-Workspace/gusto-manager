import { useState, useContext, useEffect } from "react";
import { useRouter } from "next/router";

// I18N
import { useTranslation } from "next-i18next";

// AXIOS
import axios from "axios";

// CONTENXT
import { GlobalContext } from "@/contexts/global.context";

// SVG
import { MenuSvg } from "../../_shared/_svgs/_index";

// COMPONENTS
import CardListMenuComponent from "./card-list-menu.menus.component";

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

export default function ListMenusComponent(props) {
  const { t } = useTranslation("menus");
  const router = useRouter();
  const { restaurantContext } = useContext(GlobalContext);
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [selectedMenu, setSelectedMenu] = useState(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [menus, setMenus] = useState(restaurantContext?.restaurantData?.menus);

  const mouseSensor = useSensor(MouseSensor);
  const touchSensor = useSensor(TouchSensor);
  const sensors = useSensors(mouseSensor, touchSensor);

  useEffect(() => {
    setMenus(restaurantContext?.restaurantData?.menus);
  }, [restaurantContext?.restaurantData?.menus]);

  function handleAddClick() {
    router.push(`/dashboard/menus/add`);
  }

  function handleCategoryClick(menu) {
    router.push(`/dashboard/menus/add?menuId=${menu._id}`);
  }

  function handleDeleteClick(menu) {
    setSelectedMenu(menu);
    setIsDeleteModalOpen(true);
  }

  function closeDeleteModal() {
    setSelectedMenu(null);
    setIsDeleteModalOpen(false);
  }

  function handleDeleteConfirm() {
    if (!selectedMenu) return;
    setIsDeleting(true);

    axios
      .delete(
        `${process.env.NEXT_PUBLIC_API_URL}/restaurants/${restaurantContext?.restaurantData?._id}/menus/${selectedMenu._id}`
      )
      .then((response) => {
        restaurantContext.setRestaurantData((prev) => ({
          ...prev,
          menus: response.data.restaurant.menus,
        }));
        closeDeleteModal();
      })
      .catch((error) => {
        console.error("Error deleting menu:", error);
      })
      .finally(() => {
        setIsDeleting(false);
      });
  }

  function handleVisibilityToggle(menu) {
    const updatedVisibility = !menu.visible;

    axios
      .put(
        `${process.env.NEXT_PUBLIC_API_URL}/restaurants/${restaurantContext?.restaurantData?._id}/menus/${menu._id}/update`,
        { visible: updatedVisibility }
      )
      .then((response) => {
        restaurantContext.setRestaurantData((prev) => ({
          ...prev,
          menus: response.data.restaurant.menus,
        }));
      })
      .catch((error) => {
        console.error("Error updating menu visibility:", error);
      });
  }

  function handleDragEnd(event) {
    const { active, over } = event;

    if (!active || !over) return;

    if (active.id !== over.id) {
      setMenus((prevMenus) => {
        const oldIndex = prevMenus.findIndex((menu) => menu._id === active.id);
        const newIndex = prevMenus.findIndex((menu) => menu._id === over.id);

        const newMenuOrder = arrayMove(prevMenus, oldIndex, newIndex);

        saveNewMenuOrder(newMenuOrder);

        return newMenuOrder;
      });
    }
  }

  function saveNewMenuOrder(updatedMenus) {
    const orderedMenuIds = updatedMenus.map((menu) => menu._id);

    axios
      .put(
        `${process.env.NEXT_PUBLIC_API_URL}/restaurants/${restaurantContext?.restaurantData?._id}/menus/order`,
        { orderedMenuIds }
      )
      .then((response) => {
        restaurantContext.setRestaurantData((prev) => ({
          ...prev,
          menus: response.data.restaurant.menus,
        }));
      })
      .catch((error) => {
        console.error("Error saving menu order:", error);
      });
  }

  return (
    <div className="flex flex-col gap-6">
      <hr className="opacity-20" />

      <div className="flex flex-wrap gap-4 justify-between">
        <div className="flex gap-2 items-center min-h-[40px]">
          <MenuSvg width={30} height={30} fillColor="#131E3690" />

          <h1 className="pl-2 text-xl tablet:text-2xl">{t("titles.main")}</h1>
        </div>

        <button
          onClick={handleAddClick}
          className="bg-blue px-6 py-2 rounded-lg text-white cursor-pointer"
        >
          {t("buttons.add")}
        </button>
      </div>

      {menus && (
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragEnd={handleDragEnd}
        >
          <SortableContext items={menus?.map((menu) => menu._id)}>
            <div className="grid grid-cols-1 midTablet:grid-cols-2 desktop:grid-cols-3 gap-4">
              {menus?.map((menu, i) => (
                <CardListMenuComponent
                  key={menu._id}
                  menu={menu}
                  handleCategoryClick={handleCategoryClick}
                  handleDeleteClick={handleDeleteClick}
                  handleVisibilityToggle={handleVisibilityToggle}
                />
              ))}
            </div>
          </SortableContext>
        </DndContext>
      )}

      {isDeleteModalOpen && (
        <div className="fixed inset-0 flex items-center justify-center z-[100]">
          <div
            onClick={!isDeleting ? closeDeleteModal : undefined}
            className="fixed inset-0 bg-black bg-opacity-20"
          />
          <div className="bg-white p-6 rounded-lg shadow-lg mx-6 w-[400px] z-10">
            <h2 className="text-xl font-semibold mb-6 text-center">
              {t("buttons.deleteMenu")}
            </h2>

            <p className="mb-6 text-center">
              {t("buttons.confirmDelete", {
                menuTitle: selectedMenu?.title,
              })}
            </p>

            <div className="flex gap-4 justify-center">
              <button
                className="px-4 py-2 rounded-lg bg-blue text-white"
                onClick={handleDeleteConfirm}
                disabled={isDeleting}
              >
                {isDeleting ? t("buttons.loading") : t("buttons.yes")}
              </button>

              <button
                className="px-4 py-2 rounded-lg bg-red text-white"
                onClick={closeDeleteModal}
                disabled={isDeleting}
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
