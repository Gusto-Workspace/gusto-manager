import { useState, useContext, useEffect } from "react";
import { useRouter } from "next/router";

// I18N
import { useTranslation } from "next-i18next";

// AXIOS
import axios from "axios";

// SVG
import { DeleteSvg, EditSvg, ReservationSvg } from "../_shared/_svgs/_index";

export default function ListReservationsComponent(props) {
  const { t } = useTranslation("reservations");
  const router = useRouter();

  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [selectedReservation, setSelectedReservation] = useState(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [error, setError] = useState(null);

  // Grouper les réservations par statut
  const statusList = ["Pending", "Confirmed", "Late"];

  const statusTranslations = {
    Pending: t("status.pending"),
    Confirmed: t("status.confirmed"),
    Late: t("status.late"),
  };

  const reservationsByStatus = {
    Pending: [],
    Confirmed: [],
    Late: [],
  };

  props.reservations.forEach((reservation) => {
    const { status } = reservation;
    if (reservationsByStatus[status]) {
      reservationsByStatus[status].push(reservation);
    }
  });

  // Gestion des actions
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
    setError(null);
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
      {props.reservations.length === 0 ? (
        <div className="flex flex-col items-center justify-center flex-1">
          <p className="italic">{t("labels.emptyReservations")}</p>
        </div>
      ) : (
        <div className="flex flex-col gap-6">
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
                <ul className="flex flex-col gap-2 max-h-[570px] overflow-y-auto">
                  {reservationsByStatus[status].map((reservation) => (
                    <li
                      key={reservation._id}
                      className="relative bg-white p-4 rounded-lg drop-shadow-sm flex flex-col gap-4 midTablet:flex-row text-center midTablet:text-start justify-between items-start midTablet:items-end"
                    >
                      <button
                        className="group absolute bottom-4 mobile:top-4 right-4 px-2 py-2 rounded h-fit bg-white drop-shadow-md"
                        onClick={() => handleDeleteClick(reservation)}
                      >
                        <DeleteSvg
                          height={28}
                          width={28}
                          strokeColor="#FF7664"
                          className="group-hover:rotate-12 transition-all duration-200"
                        />
                      </button>

                      <div className="flex flex-col gap-2">
                        <p>
                          <strong>{t("form.customerName")}:</strong>{" "}
                          {reservation.customerName}
                        </p>

                        <p>
                          <strong>{t("form.numberOfGuests")}:</strong>{" "}
                          {reservation.numberOfGuests}
                        </p>

                        <p>
                          <strong>{t("form.reservationDate")}:</strong>{" "}
                          {new Date(
                            reservation.reservationDate
                          ).toLocaleDateString("fr-FR")}
                        </p>

                        <p>
                          <strong>{t("form.reservationTime")}:</strong>{" "}
                          {reservation.reservationTime.replace(":", "h")}
                        </p>

                        {reservation.table && (
                          <p>
                            <strong>{t("form.table")}:</strong>{" "}
                            {reservation.table.name} ({reservation.table.seats}{" "}
                            {t("form.seats")})
                          </p>
                        )}

                        {reservation.commentary && (
                          <p>
                            <strong>{t("form.commentary")}:</strong>{" "}
                            {reservation.commentary}
                          </p>
                        )}
                      </div>

                      <div className="flex flex-col gap-2">
                        <button
                          className="px-4 py-2 bg-blue text-white rounded hover:bg-opacity-75 transition-all duration-200 w-fit"
                          onClick={() => handleEditClick(reservation)}
                        >
                          <EditSvg height={20} width={20} fillColor="#fff" />
                        </button>
                      </div>
                    </li>
                  ))}
                </ul>
              ) : (
                <div className="p-6 bg-white drop-shadow-sm rounded-lg">
                  <p className="italic">{t("labels.emptyReservations")}</p>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Modal de Suppression */}
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
                reservationTitle: selectedReservation?.customerName,
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

            {/* Afficher une erreur si la suppression échoue */}
            {error && <p className="text-red-500 text-center mt-4">{error}</p>}
          </div>
        </div>
      )}
    </section>
  );
}
