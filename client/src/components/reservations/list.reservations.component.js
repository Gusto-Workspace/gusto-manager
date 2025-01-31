import { useState, useContext, useEffect } from "react";
import { useRouter } from "next/router";

// I18N
import { useTranslation } from "next-i18next";

// AXIOS
import axios from "axios";

// SVG
import {
  CheckSvg,
  DeleteSvg,
  EditSvg,
  ReservationSvg,
} from "../_shared/_svgs/_index";

export default function ListReservationsComponent(props) {
  const { t } = useTranslation("reservations");
  const router = useRouter();

  const [isConfirmationModalOpen, setIsConfirmationModalOpen] = useState(false);
  const [selectedReservation, setSelectedReservation] = useState(null);
  const [actionType, setActionType] = useState(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState(null);

  // Grouper les réservations par statut
  const statusList = ["Pending", "Confirmed", "Late", "Finished"];

  const statusTranslations = {
    Pending: t("list.status.pending"),
    Confirmed: t("list.status.confirmed"),
    Late: t("list.status.late"),
    Finished: t("list.status.finished"),
  };

  const reservationsByStatus = {
    Pending: [],
    Confirmed: [],
    Late: [],
    Finished: [],
  };

  props.reservations.forEach((reservation) => {
    const { status } = reservation;
    if (reservationsByStatus[status]) {
      reservationsByStatus[status].push(reservation);
    }
  });

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
    setActionType("delete");
    setIsConfirmationModalOpen(true);
  }

  function handleFinishClick(reservation) {
    setSelectedReservation(reservation);
    setActionType("finish");
    setIsConfirmationModalOpen(true);
  }

  function closeModal() {
    setSelectedReservation(null);
    setActionType(null);
    setIsConfirmationModalOpen(false);
    setError(null);
  }

  function handleDeleteConfirm() {
    if (!selectedReservation) return;
    setIsProcessing(true);
    setError(null);

    const token = localStorage.getItem("token");

    axios
      .delete(
        `${process.env.NEXT_PUBLIC_API_URL}/restaurants/${props.restaurantData?._id}/reservations/${selectedReservation._id}`,
        {
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
          },
        }
      )
      .then((response) => {
        props.setRestaurantData(response.data.restaurant);
        closeModal();
      })
      .catch((error) => {
        console.error("Error deleting reservation:", error);
        setError(
          "Une erreur est survenue lors de la suppression de la réservation."
        );
      })
      .finally(() => {
        setIsProcessing(false);
      });
  }

  function handleFinishConfirm() {
    if (!selectedReservation) return;
    setIsProcessing(true);
    setError(null);

    const token = localStorage.getItem("token");

    axios
      .put(
        `${process.env.NEXT_PUBLIC_API_URL}/restaurants/${props.restaurantData?._id}/reservations/${selectedReservation._id}/status`,
        { status: "Finished" },
        {
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
          },
        }
      )
      .then((response) => {
        props.setRestaurantData(response.data.restaurant);
        closeModal();
      })
      .catch((error) => {
        console.error("Error updating reservation status:", error);
        setError(
          "Une erreur est survenue lors de la mise à jour du statut de la réservation."
        );
      })
      .finally(() => {
        setIsProcessing(false);
      });
  }

  function handleConfirmAction() {
    if (!selectedReservation) return;

    if (actionType === "delete") {
      handleDeleteConfirm();
    } else if (actionType === "finish") {
      handleFinishConfirm();
    }
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

      {/* Gestion des états de chargement et d'erreur */}

      <div className="flex flex-col gap-12">
        {statusList.map((status) => (
          <div key={status} className="flex flex-col gap-4">
            <div className="relative">
              <h2 className="relative flex gap-2 items-center text-lg font-semibold w-fit px-6 mx-auto text-center uppercase bg-lightGrey z-20">
                {statusTranslations[status]}{" "}
                <span className="text-base opacity-50">
                  ({reservationsByStatus[status].length})
                </span>
              </h2>

              <hr className="bg-darkBlue absolute h-[1px] w-full midTablet:w-[350px] left-1/2 -translate-x-1/2 top-1/2 -translate-y-1/2 z-10" />
            </div>

            {reservationsByStatus[status].length > 0 ? (
              <ul className="grid grid-cols-1 midTablet:grid-cols-2 desktop:grid-cols-3 ultraWild:grid-cols-4 gap-6 max-h-[670px] overflow-y-auto">
                {reservationsByStatus[status].map((reservation) => (
                  <li
                    key={reservation._id}
                    className="relative bg-white p-6 pb-2 rounded-lg drop-shadow-sm flex flex-col justify-between gap-2"
                  >
                    <div className="flex flex-col gap-2">
                      <p>
                        <strong>{t("list.card.customerName")} :</strong>{" "}
                        {reservation.customerName}
                      </p>

                      <p>
                        <strong>{t("list.card.numberOfGuests")} :</strong>{" "}
                        {reservation.numberOfGuests}
                      </p>

                      <p>
                        <strong>{t("list.card.reservationDate")} :</strong>{" "}
                        {new Date(
                          reservation.reservationDate
                        ).toLocaleDateString("fr-FR")}
                      </p>

                      <p>
                        <strong>{t("list.card.reservationTime")} :</strong>{" "}
                        {reservation.reservationTime.replace(":", "h")}
                      </p>

                      <p>
                        <strong>{t("list.card.reservationTable")} :</strong>{" "}
                        {reservation?.table?.name || (
                          <span className="opacity-30">-</span>
                        )}
                      </p>

                      <p>
                        <strong>{t("list.card.commentary")} :</strong>{" "}
                        {reservation.commentary || (
                          <span className="opacity-30">-</span>
                        )}
                      </p>
                    </div>

                    <div className="flex flex-col gap-2">
                      <hr className="bg-darkBlue h-[1px] w-[90%] opacity-20 mx-auto" />

                      <div className="flex w-full justify-center">
                        {reservation.status !== "Finished" && (
                          <div className="w-1/3 flex justify-center">
                            <button
                              className="flex flex-col items-center gap-1 p-2"
                              onClick={() => handleFinishClick(reservation)}
                            >
                              <div className="bg-green bg-opacity-75 hover:bg-green p-[6px] rounded-full transition-colors duration-300">
                                <CheckSvg
                                  width={15}
                                  height={15}
                                  strokeColor="white"
                                  fillColor="white"
                                />
                              </div>
                              <p className="text-xs text-center">
                                {t("buttons.finish")}
                              </p>
                            </button>
                          </div>
                        )}
                        
                        {reservation.status !== "Finished" && (
                          <div className="w-1/3 flex justify-center">
                            <button
                              className="flex flex-col items-center gap-1 p-2"
                              onClick={() => handleEditClick(reservation)}
                            >
                              <div className="bg-blue bg-opacity-75 hover:bg-blue p-[6px] rounded-full transition-colors duration-300">
                                <EditSvg
                                  width={15}
                                  height={15}
                                  strokeColor="white"
                                  fillColor="white"
                                />
                              </div>
                              <p className="text-xs text-center">
                                {t("buttons.edit")}
                              </p>
                            </button>
                          </div>
                        )}

                        <div className="w-1/3 flex justify-center">
                          <button
                            className="flex flex-col items-center gap-1 p-2"
                            onClick={() => handleDeleteClick(reservation)}
                          >
                            <div className="hover:bg-[#FF7664] bg-[#FF766499] p-[6px] rounded-full transition-colors duration-300">
                              <DeleteSvg
                                width={15}
                                height={15}
                                strokeColor="white"
                                fillColor="white"
                              />
                            </div>
                            <p className="text-xs text-center">
                              {t("buttons.delete")}
                            </p>
                          </button>
                        </div>
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            ) : (
              <div className="p-6 bg-white bg-opacity-70 drop-shadow-sm rounded-lg w-1/2 mx-auto text-center">
                <p className="italic">{t("list.card.empty")}</p>
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Modal de Confirmation */}
      {isConfirmationModalOpen && (
        <div className="fixed inset-0 flex items-center justify-center z-[100]">
          <div
            onClick={!isProcessing ? closeModal : undefined}
            className="fixed inset-0 bg-black bg-opacity-20"
          />
          <div className="bg-white p-6 rounded-lg shadow-lg w-[400px] z-10">
            <h2 className="text-xl font-semibold mb-6 text-center">
              {actionType === "delete"
                ? t("buttons.delete")
                : t("buttons.finish")}
            </h2>

            <p className="mb-6 text-center">
              {actionType === "delete"
                ? t("buttons.confirmDelete", {
                    reservationTitle: selectedReservation?.customerName,
                  })
                : t("buttons.confirmFinish", {
                    reservationTitle: selectedReservation?.customerName,
                  })}
            </p>

            <div className="flex gap-4 justify-center">
              <button
                className="px-4 py-2 rounded-lg bg-blue text-white"
                onClick={handleConfirmAction}
                disabled={isProcessing}
              >
                {isProcessing ? t("buttons.loading") : t("buttons.yes")}
              </button>

              <button
                className="px-4 py-2 rounded-lg bg-red text-white"
                onClick={closeModal}
                disabled={isProcessing}
              >
                {t("buttons.no")}
              </button>
            </div>

            {/* Afficher une erreur si l'action échoue */}
            {error && <p className="text-red-500 text-center mt-4">{error}</p>}
          </div>
        </div>
      )}
    </section>
  );
}
