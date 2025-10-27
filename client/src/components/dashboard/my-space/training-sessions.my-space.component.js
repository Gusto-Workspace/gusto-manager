import { useEffect, useState } from "react";
import axios from "axios";
import { format, differenceInCalendarDays } from "date-fns";
import frLocale from "date-fns/locale/fr";
import { useTranslation } from "next-i18next";
import { CalendarSvg } from "@/components/_shared/_svgs/_index";

export default function TraningSessionsMySpaceComponent({ employeeId }) {
  const { t } = useTranslation("myspace");
  const [requests, setRequests] = useState([]);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [toCancel, setToCancel] = useState(null);



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
          <ul className="space-y-8">
            {training_sessions.map((tra) => {
             
            })}
          </ul>
        )}
      </div>

    </section>
  );
}
