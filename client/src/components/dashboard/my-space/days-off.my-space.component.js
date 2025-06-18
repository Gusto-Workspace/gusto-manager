import { useEffect, useState } from "react";
import axios from "axios";
import { format, differenceInCalendarDays } from "date-fns";
import frLocale from "date-fns/locale/fr";
import { useTranslation } from "next-i18next";
import { CalendarSvg } from "@/components/_shared/_svgs/_index";

export default function DaysOffMySpaceComponent({ employeeId }) {
  const { t } = useTranslation("myspace");
  const [requests, setRequests] = useState([]);

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
    const handler = () => {
      fetchRequests();
    };
    window.addEventListener("leaveRequestAdded", handler);
    return () => {
      window.removeEventListener("leaveRequestAdded", handler);
    };
  }, [employeeId]);

  return (
    <section className="flex flex-col gap-6">
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

      <div className="p-4 bg-white rounded-lg shadow">
        {requests.length === 0 ? (
          <p className="text-center text-gray-500">
            {t("daysOff.noRequests", "Aucune demande pour le moment")}
          </p>
        ) : (
          <ul className="space-y-4">
            {requests.map((req, i) => {
              const start = new Date(req.start);
              const end = new Date(req.end);
              const spanDays = differenceInCalendarDays(end, start);
              let labelDays;
              if (spanDays === 0 && req.type !== "full") {
                labelDays =
                  req.type === "morning"
                    ? t("daysOff.halfMorning", "½ j matin")
                    : t("daysOff.halfAfternoon", "½ j après-midi");
              } else {
                labelDays = `${spanDays + 1} j`;
              }
              return (
                <li key={i} className="flex justify-between items-center">
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
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </section>
  );
}
