import { useState } from "react";
import { useRouter } from "next/router";

// I18N
import { useTranslation } from "next-i18next";

// AXIOS
import axios from "axios";

// SVG
import {
  CalendarSvg,
  CheckSvg,
  ClockSvg,
  CommentarySvg,
  CommunitySvg,
  DeleteSvg,
  EditSvg,
  EmailSvg,
  PhoneSvg,
  ReservationSvg,
  TableSvg,
  UserSvg,
} from "../_shared/_svgs/_index";

export default function ListReservationsComponent(props) {
  const { t } = useTranslation("reservations");
  const router = useRouter();

  const [isConfirmationModalOpen, setIsConfirmationModalOpen] = useState(false);
  const [selectedReservation, setSelectedReservation] = useState(null);
  const [actionType, setActionType] = useState(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState(null);

  // Définition des statuts et de leurs traductions
  const statusList = ["Pending", "Confirmed", "Late", "Finished"];

  const statusTranslations = {
    Pending: t("list.status.pending"),
    Confirmed: t("list.status.confirmed"),
    Late: t("list.status.late"),
    Finished: t("list.status.finished"),
  };

  // On groupe les réservations par statut
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

  // Fonction pour combiner la date et l'heure de la réservation en un objet Date
  const getReservationDateTime = (reservation) => {
    const date = new Date(reservation.reservationDate);
    const [hours, minutes] = reservation.reservationTime.split(":");
    date.setHours(parseInt(hours, 10));
    date.setMinutes(parseInt(minutes, 10));
    return date;
  };

  const now = new Date();
  ["Pending", "Confirmed"].forEach((status) => {
    reservationsByStatus[status].sort((a, b) => {
      const firstDateTime = getReservationDateTime(a);
      const secondDateTime = getReservationDateTime(b);
      return Math.abs(firstDateTime - now) - Math.abs(secondDateTime - now);
    });
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

  function handleSearchChange(event) {
    setSearchTerm(event.target.value);
  }

  return (
    <section className="flex flex-col gap-6">
      <hr className="opacity-20" />

      <div className="flex gap-4 flex-wrap justify-between">
        <div className="flex flex-col gap-4">
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

          <div className="relative midTablet:w-[350px]">
            <input
              type="text"
              placeholder="Rechercher un client"
              value={searchTerm}
              onChange={handleSearchChange}
              className="p-2 pr-10 border border-[#131E3690] rounded-lg w-full"
            />
            {searchTerm && (
              <button
                onClick={() => setSearchTerm("")}
                className="absolute right-4 top-1/2 transform -translate-y-1/2 text-white bg-black bg-opacity-30 w-4 h-4 flex items-center justify-center rounded-full focus:outline-none"
              >
                &times;
              </button>
            )}
          </div>
        </div>

        <div className="flex gap-4 items-start">
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

      <div className="flex flex-col gap-12">
        {statusList.map((status) => {
          const filteredReservations = reservationsByStatus[status].filter(
            (reservation) =>
              reservation.customerName
                .toLowerCase()
                .includes(searchTerm.toLowerCase())
          );

          return (
            <div key={status} className="flex flex-col gap-4">
              <div className="relative">
                <h2 className="relative flex gap-2 items-center text-lg font-semibold w-fit px-6 mx-auto text-center uppercase bg-lightGrey z-20">
                  {statusTranslations[status]}{" "}
                  <span className="text-base opacity-50">
                    ({filteredReservations.length})
                  </span>
                </h2>

                <hr className="bg-darkBlue absolute h-[1px] w-full midTablet:w-[350px] left-1/2 -translate-x-1/2 top-1/2 -translate-y-1/2 z-10" />
              </div>

              {filteredReservations.length > 0 ? (
                <ul className="grid grid-cols-1 midTablet:grid-cols-2 desktop:grid-cols-3 ultraWild:grid-cols-4 gap-6 max-h-[670px] overflow-y-auto">
                  {filteredReservations.map((reservation) => (
                    <li
                      key={reservation._id}
                      className="relative bg-white p-6 pb-2 rounded-lg drop-shadow-sm flex flex-col justify-between gap-2"
                    >
                      <div className="flex flex-col gap-2">
                        <p className="flex gap-3">
                          <UserSvg
                            width={20}
                            height={20}
                            className="opacity-50"
                          />
                          <span>{reservation.customerName}</span>
                        </p>

                        <p className="flex gap-3">
                          <PhoneSvg
                            width={20}
                            height={20}
                            className="opacity-50"
                          />
                          <span>{reservation.customerPhone}</span>
                        </p>

                        <p className="flex gap-3">
                          <EmailSvg
                            width={20}
                            height={20}
                            className="opacity-50"
                          />
                          <span>{reservation.customerEmail}</span>
                        </p>

                        <p className="flex gap-3">
                          <CommunitySvg
                            width={20}
                            height={20}
                            className="opacity-50"
                          />
                          <span>{reservation.numberOfGuests} personnes</span>
                        </p>

                        <p className="flex gap-3">
                          <CalendarSvg
                            width={21}
                            height={21}
                            className="opacity-50"
                          />

                          <span>
                            {new Date(
                              reservation.reservationDate
                            ).toLocaleDateString("fr-FR")}
                          </span>
                        </p>

                        <p className="flex gap-3">
                          <ClockSvg
                            width={20}
                            height={20}
                            className="opacity-50"
                          />

                          <span>
                            {reservation.reservationTime.replace(":", "h")}
                          </span>
                        </p>

                        <p className="flex gap-3">
                          <TableSvg
                            width={20}
                            height={23}
                            className="opacity-50"
                          />

                          <span>
                            {reservation.table?.name || (
                              <span className="opacity-30">-</span>
                            )}
                          </span>
                        </p>

                        <p className="flex gap-3">
                          <CommentarySvg
                            width={20}
                            height={20}
                            className="opacity-50"
                          />

                          <span>
                            {reservation.commentary || (
                              <span className="opacity-30">-</span>
                            )}
                          </span>
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
          );
        })}
      </div>

      {/* Modal de Confirmation */}
      {isConfirmationModalOpen && (
        <div className="fixed inset-0 flex items-center justify-center z-[100]">
          <div
            onClick={!isProcessing ? closeModal : undefined}
            className="fixed inset-0 bg-black bg-opacity-20"
          />
          <div className="bg-white p-6 flex flex-col gap-6 rounded-lg shadow-lg w-[500px] mx-6 z-10">
            <h2 className="text-xl flex flex-col gap-4 font-semibold text-center">
              {actionType === "delete"
                ? t("labels.deleteReservation.title")
                : t("labels.finishedReservation.title")}
              <span className="w-[200px] h-[1px] mx-auto bg-black" />
            </h2>

            <p className="text-center text-balance mb-2">
              {actionType === "delete"
                ? t("labels.deleteReservation.content", {
                    reservationTitle: selectedReservation?.customerName,
                  })
                : t("labels.finishedReservation.content", {
                    reservationTitle: selectedReservation?.customerName,
                  })}
            </p>

            <div className="flex gap-4 justify-center">
              <button
                className="px-4 py-2 rounded bg-blue text-white"
                onClick={handleConfirmAction}
                disabled={isProcessing}
              >
                {isProcessing ? t("buttons.loading") : t("buttons.confirm")}
              </button>

              <button
                className="px-4 py-2 rounded bg-red text-white"
                onClick={closeModal}
                disabled={isProcessing}
              >
                {t("buttons.cancel")}
              </button>
            </div>

            {error && <p className="text-red text-center mt-4">{error}</p>}
          </div>
        </div>
      )}
    </section>
  );
}
