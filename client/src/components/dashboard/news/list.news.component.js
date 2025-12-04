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
} from "../../_shared/_svgs/_index";

export default function ListNewsComponent(props) {
  const { t } = useTranslation("news");
  const router = useRouter();
  const { restaurantContext } = useContext(GlobalContext);
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [selectedNews, setSelectedNews] = useState(null);
  const [isDeleting, setIsDeleting] = useState(false);

  const cardCls =
    "rounded-2xl border border-darkBlue/10 bg-white/50 px-4 py-3 tablet:px-5 tablet:py-4 shadow-[0_18px_45px_rgba(19,30,54,0.06)] hover:shadow-[0_22px_55px_rgba(19,30,54,0.10)] transition-shadow flex flex-col gap-3";
  const btnPrimary =
    "inline-flex items-center gap-2 rounded-xl bg-blue text-white text-sm font-medium px-4 py-2.5 shadow-sm hover:bg-blue/90 transition";
  const btnSecondary =
    "inline-flex min-w-[120px] items-center justify-center rounded-xl border border-red bg-red text-white text-sm font-medium px-4 py-2.5 shadow-sm hover:bg-red/90 transition disabled:opacity-60 disabled:cursor-not-allowed";
  const iconPill =
    "inline-flex items-center justify-center h-8 w-8 rounded-full border transition-colors";
  const actionLabelCls = "text-[11px] text-darkBlue/70";

  function handleAddClick() {
    router.push(`/dashboard/news/add`);
  }

  function handleEditClick(news) {
    router.push(`/dashboard/news/add?newsId=${news._id}`);
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
        restaurantContext.setRestaurantData((prev) => ({
          ...prev,
          news: response.data.restaurant.news,
        }));
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
        restaurantContext.setRestaurantData((prev) => ({
          ...prev,
          news: response.data.restaurant.news,
        }));
      })
      .catch((error) => {
        console.error("Error updating category visibility:", error);
      });
  }

  const hasNews = Array.isArray(props?.news) && props.news.length > 0;

  return (
    <section className="flex flex-col gap-6">
      <hr className="opacity-20" />

      {/* Header */}
      <div className="flex gap-4 flex-wrap justify-between items-center">
        <div className="flex gap-2 items-center min-h-[40px]">
          <NewsSvg
            width={30}
            height={30}
            className="min-h-[30px] min-w-[30px]"
            strokeColor="#131E3690"
          />

          <h1 className="pl-2 text-xl tablet:text-2xl flex items-center gap-2 text-darkBlue">
            {t("titles.main")}
          </h1>
        </div>

        <button onClick={handleAddClick} className={btnPrimary}>
          {t("buttons.add")}
        </button>
      </div>

      {/* Liste / Empty state */}
      {!hasNews ? (
        <div className={cardCls}>
          <div className="flex flex-col items-center gap-2 text-center text-darkBlue/70 py-4">
            <NewsSvg
              width={36}
              height={36}
              className="opacity-30 mb-1"
              strokeColor="#131E3690"
            />
            <p className="text-sm">{t("Aucun article pour le moment")}</p>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 midTablet:grid-cols-2 desktop:grid-cols-3 gap-6">
          {props.news.map((data) => {
            const isVisible = data.visible;

            return (
              <article key={data._id} className={cardCls}>
                {/* Header carte : titre + badge + séparateur */}
                <div className="flex flex-col items-center gap-2">
                  <h2 className="text-base tablet:text-lg font-semibold text-darkBlue text-center text-balance min-h-[40px] flex items-center justify-center px-2">
                    {data.title}
                  </h2>

                  <div className="inline-flex items-center gap-1 rounded-full border border-darkBlue/10 bg-white px-3 py-0.5 text-[11px]">
                    <span
                      className={`inline-block h-1.5 w-1.5 rounded-full ${
                        isVisible ? "bg-[#4ead7a]" : "bg-darkBlue/30"
                      }`}
                    />
                    <span className="text-darkBlue/70">
                      {isVisible ? "Visible" : "Non visible"}
                    </span>
                  </div>

                  <hr className="border-0 h-px bg-darkBlue/10 w-full" />
                </div>

                {/* Contenu */}
                <div className="flex flex-col gap-3">
                  <div
                    dangerouslySetInnerHTML={{ __html: data.description }}
                    className="prose prose-sm max-w-none text-darkBlue/80 h-[210px] overflow-y-auto custom-scrollbar"
                  />

                  <div className="flex flex-col gap-2">
                    {data.image ? (
                      <div className="w-full rounded-xl overflow-hidden border border-darkBlue/10 bg-white">
                        <img
                          src={data.image}
                          alt={data.title || "Image de l'actualité"}
                          draggable={false}
                          className="w-full h-[210px] object-cover object-center"
                        />
                      </div>
                    ) : (
                      <div className="h-[210px] flex items-center justify-center rounded-xl border border-dashed border-darkBlue/10 bg-white/80">
                        <NoImageSvg
                          width={64}
                          height={64}
                          className="opacity-20"
                        />
                      </div>
                    )}
                  </div>
                </div>

                <hr className="border-0 h-px bg-darkBlue/10 w-full" />

                {/* Actions */}
                <div className="flex w-full justify-between gap-1 pt-1">
                  {/* Visibilité */}
                  <button
                    type="button"
                    onClick={() => handleVisibilityToggle(data)}
                    className="flex flex-col items-center gap-1 flex-1 px-1 py-1"
                  >
                    <div
                      className={`${iconPill} ${
                        isVisible
                          ? "bg-[#4ead7a1a] border-[#4ead7a80]"
                          : "bg-darkBlue/5 border-darkBlue/15"
                      }`}
                    >
                      <NoVisibleSvg
                        width={15}
                        height={15}
                        strokeColor={isVisible ? "#167a47" : "#6b7280"}
                        fillColor={isVisible ? "#167a47" : "#6b7280"}
                      />
                    </div>
                    <span className={actionLabelCls}>
                      {isVisible ? "Visible" : "Non visible"}
                    </span>
                  </button>

                  {/* Supprimer */}
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleDeleteClick(data);
                    }}
                    className="flex flex-col items-center gap-1 flex-1 px-1 py-1"
                  >
                    <div
                      className={`${iconPill} bg-[#ef44441a] border-[#ef444480] hover:bg-[#ef444433]`}
                    >
                      <DeleteSvg
                        width={15}
                        height={15}
                        strokeColor="#b91c1c"
                        fillColor="#b91c1c"
                      />
                    </div>
                    <span className={actionLabelCls}>Supprimer</span>
                  </button>

                  {/* Modifier */}
                  <button
                    type="button"
                    onClick={() => handleEditClick(data)}
                    className="flex flex-col items-center gap-1 flex-1 px-1 py-1"
                  >
                    <div
                      className={`${iconPill} bg-[#4f46e51a] border-[#4f46e580] hover:bg-[#4f46e533]`}
                    >
                      <EditSvg
                        width={15}
                        height={15}
                        strokeColor="#4f46e5"
                        fillColor="#4f46e5"
                      />
                    </div>
                    <span className={actionLabelCls}>{t("buttons.edit")}</span>
                  </button>
                </div>
              </article>
            );
          })}
        </div>
      )}

      {/* Modal suppression */}
      {isDeleteModalOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center">
          <div
            onClick={!isDeleting ? closeDeleteModal : undefined}
            className="fixed inset-0 bg-black/30"
          />
          <div className="relative z-10 w-[90%] max-w-[420px] rounded-2xl border border-darkBlue/10 bg-white px-5 py-5 shadow-[0_18px_45px_rgba(19,30,54,0.25)] flex flex-col gap-4">
            <h2 className="text-lg font-semibold text-darkBlue text-center">
              {t("buttons.deleteNews")}
            </h2>

            <p className="text-sm text-darkBlue/80 text-center">
              {t("buttons.confirmDelete", {
                newsTitle: selectedNews?.title,
              })}
            </p>

            <div className="flex gap-3 justify-center pt-1">
              <button
                className={btnPrimary}
                onClick={handleDeleteConfirm}
                disabled={isDeleting}
              >
                {isDeleting ? t("buttons.loading") : t("buttons.yes")}
              </button>

              <button
                className={btnSecondary}
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
