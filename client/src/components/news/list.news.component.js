import { useState, useContext } from "react";
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
  NewsSvg,
  NoImageSvg,
  NoVisibleSvg,
} from "../_shared/_svgs/_index";

export default function ListNewsComponent(props) {
  const { t } = useTranslation("news");
  const router = useRouter();
  const { restaurantContext } = useContext(GlobalContext);
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [selectedNews, setSelectedNews] = useState(null);
  const [isDeleting, setIsDeleting] = useState(false);

  function handleAddClick() {
    router.push(`/news/add`);
  }

  function handleEditClick(news) {
    router.push(`/news/add?newsId=${news._id}`);
  }

  function handleDeleteClick(news) {
    setSelectedNews(news);
    setIsDeleteModalOpen(true);
  }

  function closeDeleteModal() {
    setSelectedNews(null);
    setIsDeleteModalOpen(false);
  }

  function handleDeleteConfirm() {
    if (!selectedNews) return;
    setIsDeleting(true);

    axios
      .delete(
        `${process.env.NEXT_PUBLIC_API_URL}/restaurants/${restaurantContext?.restaurantData?._id}/news/${selectedNews._id}`
      )
      .then((response) => {
        restaurantContext.setRestaurantData(response.data.restaurant);
        closeDeleteModal();
      })
      .catch((error) => {
        console.error("Error deleting news:", error);
      })
      .finally(() => {
        setIsDeleting(false);
      });
  }

  function handleVisibilityToggle(data) {
    const updatedVisibility = !data.visible;

    axios
      .put(
        `${process.env.NEXT_PUBLIC_API_URL}/restaurants/${restaurantContext?.restaurantData?._id}/news/${data._id}`,
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
        <div className="flex gap-2 items-center">
          <NewsSvg width={30} height={30} strokeColor="#131E3690" />

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
        {props?.news?.map((data, i) => {
          return (
            <div
              key={i}
              className="bg-white rounded-lg drop-shadow-sm p-6 flex flex-col gap-4 h-fit"
            >
              <h2 className="text-xl text-center">{data.title}</h2>

              <hr className="bg-darkBlue h-[1px] w-full opacity-20 mx-auto" />

              <div
                dangerouslySetInnerHTML={{ __html: data.description }}
                className="prose h-[200px] overflow-y-auto dro"
              />

              <hr className="bg-darkBlue h-[1px] w-[100%] opacity-20 mx-auto" />

              {data.image ? (
                <img
                  src={data.image}
                  alt="img"
                  draggable={false}
                  className="h-[200px] w-full object-cover object-center  rounded-lg"
                />
              ) : (
                <div className="h-[200px] flex items-center justify-center">
                  <NoImageSvg width={80} height={80} className="opacity-10" />
                </div>
              )}

              <hr className="bg-darkBlue h-[1px] w-[90%] opacity-20 mx-auto" />

              <div className="flex w-full justify-center">
                <div className="w-1/3 flex justify-center">
                  <button
                    onClick={(e) => {
                      handleVisibilityToggle(data);
                    }}
                    className="flex flex-col items-center gap-1 p-2"
                  >
                    <div
                      className={`bg-green ${
                        data.visible ? "bg-opacity-20" : ""
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
                      {data.visible ? "Visible" : "Non Visible"}
                    </p>
                  </button>
                </div>

                <div className="w-1/3 flex justify-center">
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      handleDeleteClick(data);
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
                    onClick={() => handleEditClick(data)}
                    className="flex flex-col items-center gap-1 p-2"
                  >
                    <div className="hover:bg-[#4583FF] bg-[#4583FF99] p-[6px] rounded-full transition-colors duration-300">
                      <EditSvg
                        width={15}
                        height={15}
                        strokeColor="white"
                        fillColor="white"
                      />
                    </div>
                    <p className="text-xs text-center">Modifier</p>
                  </button>
                </div>
              </div>
            </div>
          );
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
                newsTitle: selectedNews?.title,
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
