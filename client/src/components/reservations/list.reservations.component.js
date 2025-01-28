import { useState, useContext } from "react";
import { useRouter } from "next/router";

// I18N
import { useTranslation } from "next-i18next";

// AXIOS
import axios from "axios";

// CONTEXT
import { GlobalContext } from "@/contexts/global.context";

// SVG
import { DeleteSvg, EditSvg, ReservationSvg } from "../_shared/_svgs/_index";

export default function ListReservationsComponent(props) {
  const { t } = useTranslation("reservations");
  const router = useRouter();

  const { restaurantContext } = useContext(GlobalContext);
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);

  const [selectedReservation, setSelectedReservation] = useState(null);
  const [isDeleting, setIsDeleting] = useState(false);

  function handleAddClick() {
    router.push(`/reservations/add`);
  }

  function handleParametersClick() {
    router.push(`/reservations/parameters`);
  }

  function handleEditClick(reservation) {
    router.push(`/reservations/add?reservationId=${reservation._id}`);
  }

  function handleDeleteClick(reservation) {
    setSelectedReservation(reservation);
    setIsDeleteModalOpen(true);
  }

  function closeDeleteModal() {
    setSelectedReservation(null);
    setIsDeleteModalOpen(false);
  }

  function handleDeleteConfirm() {
    if (!selectedReservation) return;
    setIsDeleting(true);

    axios
      .delete(
        `${process.env.NEXT_PUBLIC_API_URL}/restaurants/${restaurantContext?.restaurantData?._id}/reservations/${selectedReservation._id}`
      )
      .then((response) => {
        restaurantContext.setRestaurantData(response.data.restaurant);
        closeDeleteModal();
      })
      .catch((error) => {
        console.error("Error deleting reservation :", error);
      })
      .finally(() => {
        setIsDeleting(false);
      });
  }

  return (
    <section className="flex flex-col gap-6">
      <hr className="opacity-20" />

      <div className="flex gap-4 flex-wrap justify-between">
        <div className="flex gap-2 items-center min-h-[40px]">
          <ReservationSvg
            width={30}
            height={30}
            className="min-h-[30px] min-w-[30px]"
            fillColor="#131E3690"
          />

          <h1 className="pl-2 text-xl tablet:text-2xl flex items-center gap-2">
            {t("titles.main")}
          </h1>
        </div>

        <div className="flex gap-4">
          <button
            onClick={handleParametersClick}
            className="bg-violet px-6 py-2 rounded-lg text-white cursor-pointer"
          >
            {t("buttons.parameters")}
          </button>

          <button
            onClick={handleAddClick}
            className="bg-blue px-6 py-2 rounded-lg text-white cursor-pointer"
          >
            {t("buttons.add")}
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 midTablet:grid-cols-2 desktop:grid-cols-3 gap-6">
        {/* AFFICHAGE DES RESERVATIONS ICI */}
      </div>

      {isDeleteModalOpen && (
        <div className="fixed inset-0 flex items-center justify-center z-[100]">
          <div
            onClick={!isDeleting ? closeDeleteModal : undefined}
            className="fixed inset-0 bg-black bg-opacity-20"
          />
          <div className="bg-white p-6 rounded-lg shadow-lg w-[400px] z-10">
            <h2 className="text-xl font-semibold mb-6 text-center">
              {t("buttons.delete")}
            </h2>

            <p className="mb-6 text-center">
              {t("buttons.confirmDelete", {
                newsTitle: selectedReservation?.title,
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
