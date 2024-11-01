import { useState, useContext, useEffect } from "react";
import { useRouter } from "next/router";

// I18N
import { useTranslation } from "next-i18next";

// AXIOS
import axios from "axios";

// CONTEXT
import { GlobalContext } from "@/contexts/global.context";

// SVG
import {
  DeleteSvg,
  EditSvg,
  MenuSvg,
  NoImageSvg,
  NoVisibleSvg,
} from "../_shared/_svgs/_index";
import CardListMenuComponent from "./card-list-menu.menus.component";

export default function ListMenusComponent(props) {
  const { t } = useTranslation("menus");
  const router = useRouter();
  const { restaurantContext } = useContext(GlobalContext);
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [selectedMenu, setSelectedMenu] = useState(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [menus, setMenus] = useState(
    restaurantContext?.setRestaurantData?.menus
  );

  useEffect(() => {
    setMenus(restaurantContext.restaurantData?.menus);
  }, [restaurantContext?.restaurantData?.menus]);

  function handleAddClick() {
    router.push(`/menus/add`);
  }

  function handleEditClick(menu) {
    router.push(`/menus/add?menuId=${menu._id}`);
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
        restaurantContext.setRestaurantData(response.data.restaurant);
        closeDeleteModal();
      })
      .catch((error) => {
        console.error("Error deleting menu:", error);
      })
      .finally(() => {
        setIsDeleting(false);
      });
  }

  function handleVisibilityToggle(data) {
    const updatedVisibility = !data.visible;

    axios
      .put(
        `${process.env.NEXT_PUBLIC_API_URL}/restaurants/${restaurantContext?.restaurantData?._id}/menus/${data._id}`,
        { visible: updatedVisibility }
      )
      .then((response) => {
        restaurantContext.setRestaurantData(response.data.restaurant);
      })
      .catch((error) => {
        console.error("Error updating category visibility:", error);
      });
  }

  return (
    <section className="flex flex-col gap-6">
      <hr className="opacity-20" />

      <div className="flex justify-between">
        <div className="pl-2 flex gap-2 items-center">
          <MenuSvg width={30} height={30} fillColor="#131E3690" />

          <h1 className="pl-2 text-2xl">{t("titles.main")}</h1>
        </div>

        <button
          onClick={handleAddClick}
          className="bg-blue px-6 py-2 rounded-lg text-white cursor-pointer"
        >
          {t("buttons.add")}
        </button>
      </div>

      <div className="grid grid-cols-1 tablet:grid-cols-2 desktop:grid-cols-3 ultraWild:grid-cols-4 gap-6">
        {menus?.map((menu, i) => {
          return <CardListMenuComponent key={i} menu={menu} />;
        })}
      </div>

      {isDeleteModalOpen && (
        <div className="fixed inset-0 flex items-center justify-center z-[100]">
          <div
            onClick={!isDeleting ? closeDeleteModal : undefined}
            className="fixed inset-0 bg-black bg-opacity-20"
          />
          <div className="bg-white p-6 rounded-lg shadow-lg w-[400px] z-10">
            <h2 className="text-xl font-semibold mb-6 text-center">
              {t("buttons.deleteNews")}
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
    </section>
  );
}
