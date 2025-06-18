import { useEffect, useState } from "react";
import axios from "axios";
import { format, differenceInCalendarDays } from "date-fns";
import frLocale from "date-fns/locale/fr";
import { useTranslation } from "next-i18next";
import { CalendarSvg } from "@/components/_shared/_svgs/_index";

export default function DaysOffMySpaceComponent({ employeeId }) {
  const { t } = useTranslation("myspace");
  const [requests, setRequests] = useState([]);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [toCancel, setToCancel] = useState(null); 

    useEffect(() => {
    if (confirmOpen) {
      document.body.classList.add("overflow-hidden");
    } else {
      document.body.classList.remove("overflow-hidden");
    }

    return () => {
      document.body.classList.remove("overflow-hidden");
    };
  }, [confirmOpen]);

  // 1) Fonction de chargement
  async function fetchRequests() {
    if (!employeeId) return;
    try {
      const { data } = await axios.get(
        `${process.env.NEXT_PUBLIC_API_URL}/employees/${employeeId}/leave-requests`
      );
      setRequests(data);
    } catch (err) {
      console.error("Erreur fetch leave requests:", err);
    }
  }

  // 2) Au montage et à chaque changement d'employeeId
  useEffect(() => {
    fetchRequests();
  }, [employeeId]);

  // 3) Écoute de l’événement pour rafraîchir instantanément
  useEffect(() => {
    const handler = () => fetchRequests();
    window.addEventListener("leaveRequestAdded", handler);
    return () => {
      window.removeEventListener("leaveRequestAdded", handler);
    };
  }, [employeeId]);

  // 4) Supprimer une demande
  async function cancelRequest(reqId) {
    try {
      await axios.delete(
        `${process.env.NEXT_PUBLIC_API_URL}/employees/${employeeId}/leave-requests/${reqId}`
      );
      fetchRequests();
    } catch (err) {
      console.error("Erreur delete leave request:", err);
      window.alert(t("daysOff.errorCancel", "Impossible d’annuler la demande"));
    }
  }

  return (
    <section className="flex flex-col gap-6">
      {/* En-tête */}
      <div className="flex justify-between items-center">
        <div className="flex gap-2 items-center">
          <CalendarSvg
            width={30}
            height={30}
            fillColor="#131E3690"
            strokeColor="#131E3690"
          />
          <h1 className="pl-2 py-1 text-xl tablet:text-2xl">
            {t("titles.third")}
          </h1>
        </div>
      </div>

      {/* Liste */}
      <div className="p-4 bg-white rounded-lg shadow">
        {requests.length === 0 ? (
          <p className="text-center italic">
            {t("daysOff.noRequests", "Aucune demande pour le moment")}
          </p>
        ) : (
          <ul className="space-y-4">
            {requests.map((req) => {
              const start = new Date(req.start);
              const end = new Date(req.end);
              const spanDays = differenceInCalendarDays(end, start);

              let labelDays;
              if (spanDays === 0 && req.type !== "full") {
                labelDays =
                  req.type === "morning"
                    ? t("daysOff.halfMorning", "½ journée matin")
                    : t("daysOff.halfAfternoon", "½ journée après-midi");
              } else {
                labelDays = `${spanDays + 1} jour(s)`;
              }

              return (
                <li key={req._id} className="flex justify-between items-center">
                  <div className="space-y-1">
                    <div>
                      <strong>
                        {format(start, "dd/MM/yyyy", { locale: frLocale })}
                      </strong>
                      {" – "}
                      <strong>
                        {format(end, "dd/MM/yyyy", { locale: frLocale })}
                      </strong>
                    </div>
                    <div className="text-sm text-gray-600">
                      {t("daysOff.requestedAt", "Demandé le")}{" "}
                      {format(new Date(req.requestedAt), "dd/MM/yyyy HH:mm", {
                        locale: frLocale,
                      })}
                    </div>
                  </div>

                  <div className="flex items-center gap-4">
                    <span className="px-2 py-1 bg-gray-100 rounded">
                      {labelDays}
                    </span>
                    <span
                      className={`capitalize px-2 py-1 rounded ${
                        req.status === "pending"
                          ? "bg-lightGrey text-black"
                          : req.status === "approved"
                            ? "bg-green text-white"
                            : "bg-red text-white"
                      }`}
                    >
                      {t(`daysOff.status.${req.status}`)}
                    </span>
                    {req.status === "pending" && (
                      <button
                        type="button"
                        onClick={() => {
                          setToCancel({
                            id: req._id,
                            start,
                            end,
                          });
                          setConfirmOpen(true);
                        }}
                        className="text-red rounded-full border border-red w-6 h-6 flex items-center justify-center hover:scale-105" 
                        title={t("daysOff.cancel", "Annuler")}
                      >
                        &times;
                      </button>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {/* Modale de confirmation de suppression */}
      {confirmOpen && toCancel && (
        <div className="fixed inset-0 flex items-center justify-center z-[100]">
          <div
            className="absolute inset-0 bg-black bg-opacity-40"
            onClick={() => setConfirmOpen(false)}
          />
          <div className="bg-white p-6 rounded-lg shadow-lg z-10 w-[350px] text-center">
            <h2 className="text-lg font-semibold mb-4">
              {t("daysOff.confirmTitle", "Confirmer l’annulation")}
            </h2>
            <p className="mb-4 text-balance">
              {t("daysOff.confirmMessage", "Êtes-vous sûr de vouloir annuler votre demande :")}{" "}
              <br />
              <strong>
                {format(toCancel.start, "dd/MM/yyyy", { locale: frLocale })}
                {" – "}
                {format(toCancel.end, "dd/MM/yyyy", { locale: frLocale })}
              </strong>
              {" "}?
            </p>
            <div className="flex justify-center gap-4">
              <button
                type="button"
                onClick={() => {
                  cancelRequest(toCancel.id);
                  setConfirmOpen(false);
                }}
                className="px-4 py-2 bg-blue text-white rounded-lg"
              >
                {t("daysOff.confirmYes", "Oui")}
              </button>
              <button
                type="button"
                onClick={() => setConfirmOpen(false)}
                className="px-4 py-2 bg-red text-white rounded-lg"
              >
                {t("daysOff.confirmNo", "Non")}
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
