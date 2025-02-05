import { useState, useEffect } from "react";
import { useRouter } from "next/router";

// I18N
import { useTranslation } from "next-i18next";

// AXIOS
import axios from "axios";

// SVG
import { ReservationSvg } from "../_shared/_svgs/_index";

// COMPONENTS
import ConfirmationModalReservationComponent from "./confirm-modal.reservations.component";
import CardReservationComponent from "./card.reservations.component";

export default function ListReservationsComponent(props) {
  const { t } = useTranslation("reservations");
  const router = useRouter();

  const [isConfirmationModalOpen, setIsConfirmationModalOpen] = useState(false);
  const [selectedReservation, setSelectedReservation] = useState(null);
  const [actionType, setActionType] = useState(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState(null);

  const statusList = ["Pending", "Confirmed", "Active", "Late", "Finished"];

  const statusTranslations = {
    Pending: t("list.status.pending"),
    Confirmed: t("list.status.confirmed"),
    Active: t("list.status.active"),
    Late: t("list.status.late"),
    Finished: t("list.status.finished"),
  };

  const reservationsByStatus = {
    Pending: [],
    Confirmed: [],
    Active: [],
    Late: [],
    Finished: [],
  };

  props.reservations.forEach((reservation) => {
    const { status } = reservation;
    if (reservationsByStatus[status]) {
      reservationsByStatus[status].push(reservation);
    }
  });

  // Fonction utilitaire pour combiner la date et l'heure d'une réservation
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

  function openModalForAction(reservation, action) {
    setSelectedReservation(reservation);
    setActionType(action);
    setIsConfirmationModalOpen(true);
  }

  function updateReservationStatus(newStatus) {
    if (!selectedReservation) return;
    setIsProcessing(true);
    setError(null);
    const token = localStorage.getItem("token");
    axios
      .put(
        `${process.env.NEXT_PUBLIC_API_URL}/restaurants/${props.restaurantData?._id}/reservations/${selectedReservation._id}/status`,
        { status: newStatus },
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
        console.error(`Error updating status to ${newStatus}:`, error);
        setError(
          "Une erreur est survenue lors de la mise à jour du statut de la réservation."
        );
      })
      .finally(() => {
        setIsProcessing(false);
      });
  }

  function deleteReservation() {
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

  function handleConfirmAction() {
    if (!selectedReservation) return;
    if (actionType === "delete") {
      deleteReservation();
    } else if (actionType === "finish") {
      updateReservationStatus("Finished");
    } else if (actionType === "active") {
      updateReservationStatus("Active");
    } else if (actionType === "confirm") {
      updateReservationStatus("Confirmed");
    }
  }

  function closeModal() {
    setSelectedReservation(null);
    setActionType(null);
    setIsConfirmationModalOpen(false);
    setError(null);
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
                    <CardReservationComponent
                      key={reservation._id}
                      reservation={reservation}
                      openModalForAction={openModalForAction}
                      handleEditClick={handleEditClick}
                    />
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

      <ConfirmationModalReservationComponent
        isOpen={isConfirmationModalOpen}
        onClose={closeModal}
        onConfirm={handleConfirmAction}
        actionType={actionType}
        reservation={selectedReservation}
        isProcessing={isProcessing}
        error={error}
        t={t}
      />
    </section>
  );
}
