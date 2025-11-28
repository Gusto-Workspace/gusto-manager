import { useEffect, useState } from "react";
import axios from "axios";
import { format, differenceInCalendarDays } from "date-fns";
import frLocale from "date-fns/locale/fr";
import { useTranslation } from "next-i18next";
import { CalendarSvg } from "@/components/_shared/_svgs/_index";

export default function DaysOffMySpaceComponent({ employeeId, restaurantId }) {
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

  async function fetchRequests() {
    if (!employeeId || !restaurantId) return;
    try {
      const { data } = await axios.get(
        `${process.env.NEXT_PUBLIC_API_URL}/restaurants/${restaurantId}/employees/${employeeId}/leave-requests`
      );
      setRequests(data || []);
    } catch (err) {
      console.error("Erreur fetch leave requests:", err);
    }
  }

  useEffect(() => {
    fetchRequests();
  }, [employeeId, restaurantId]);

  useEffect(() => {
    const handler = () => fetchRequests();
    window.addEventListener("leaveRequestAdded", handler);
    return () => {
      window.removeEventListener("leaveRequestAdded", handler);
    };
  }, [employeeId, restaurantId]);

  async function cancelRequest(reqId) {
    if (!employeeId || !restaurantId) return;

    try {
      await axios.delete(
        `${process.env.NEXT_PUBLIC_API_URL}/restaurants/${restaurantId}/employees/${employeeId}/leave-requests/${reqId}`
      );
      fetchRequests();
    } catch (err) {
      console.error("Erreur delete leave request:", err);
      window.alert(t("daysOff.errorCancel", "Impossible d’annuler la demande"));
    }
  }

  function formatDays(req) {
    const start = new Date(req.start);
    const end = new Date(req.end);
    const span = differenceInCalendarDays(end, start);

    if (span === 0 && req.type !== "full") {
      return req.type === "morning"
        ? t("daysOff.halfMorning", "½ journée matin")
        : t("daysOff.halfAfternoon", "½ journée après-midi");
    }

    const totalDays = span + 1;
    return `${totalDays} ${totalDays > 1 ? "jours" : "jour"}`;
  }

  function statusBadge(status) {
    const label = t(`daysOff.status.${status}`);
    let cls =
      "inline-flex items-center justify-center rounded-full px-3 py-0.5 text-[11px] font-medium";

    if (status === "pending") {
      cls += " bg-lightGrey text-darkBlue/80 border border-darkBlue/10";
    } else if (status === "approved") {
      cls += " bg-[#4ead7a1a] text-[#166534] border border-[#4ead7a80]";
    } else if (status === "rejected") {
      cls += " bg-[#ef44441a] text-[#b91c1c] border border-[#ef444480]";
    } else if (status === "cancelled") {
      cls += " bg-slate-100 text-slate-700 border border-slate-200";
    } else {
      cls += " bg-lightGrey text-darkBlue/70";
    }

    return <span className={cls}>{label}</span>;
  }

  return (
    <section className="flex flex-col gap-6 min-w-0">
      <div className="flex justify-between items-start flex-wrap gap-3">
        <div className="flex flex-col gap-2">
          <div className="flex gap-2 items-center min-h-[40px]">
            <CalendarSvg
              width={30}
              height={30}
              fillColor="#131E3690"
              strokeColor="#131E3690"
            />
            <h1 className="pl-2 py-1 text-xl tablet:text-2xl flex items-center gap-2 flex-wrap">
              {t("titles.third")}
            </h1>
          </div>
          <p className="text-xs text-darkBlue/60 max-w-xl">
            {t(
              "daysOff.helper",
              "Consultez vos demandes de congés et annulez celles qui sont encore en attente."
            )}
          </p>
        </div>
      </div>

      <div className="">
        {requests.length === 0 ? (
          <p className="text-center italic text-sm text-darkBlue/60">
            {t("daysOff.noRequests", "Aucune demande pour le moment")}
          </p>
        ) : (
          <ul className="flex flex-col gap-3">
            {requests.map((req) => {
              const start = new Date(req.start);
              const end = new Date(req.end);

              return (
                <li
                  key={req._id}
                  className="
                    flex flex-col midTablet:flex-row
                    justify-between midTablet:items-center gap-3
                    rounded-xl bg-white/80 border border-darkBlue/10
                    px-3 py-3 midTablet:px-4 midTablet:py-3
                  "
                >
                  <div className="flex flex-col gap-1 text-sm text-darkBlue">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-medium">
                        {format(start, "dd/MM/yyyy", { locale: frLocale })}
                      </span>
                      <span>–</span>
                      <span className="font-medium">
                        {format(end, "dd/MM/yyyy", { locale: frLocale })}
                      </span>

                      <span className="ml-2 inline-flex items-center rounded-full bg-lightGrey px-2 py-0.5 text-[11px] text-darkBlue/70">
                        {formatDays(req)}
                      </span>
                    </div>

                    <div className="text-[11px] text-darkBlue/60">
                      {t("daysOff.requestedAt", "Demandé le")}{" "}
                      {format(
                        req.createdAt
                          ? new Date(req.createdAt)
                          : new Date(
                              parseInt(String(req._id).substring(0, 8), 16) *
                                1000
                            ),
                        "dd/MM/yyyy HH:mm",
                        { locale: frLocale }
                      )}
                    </div>
                  </div>

                  <div className="flex gap-2">
                    <div>{statusBadge(req.status)}</div>

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
                        className="
                          inline-flex items-center justify-center
                          rounded-full border border-red/70 text-red
                          w-7 h-7 text-sm font-bold
                          hover:bg-red/5 hover:scale-105
                          transition
                        "
                        title={t("daysOff.cancel", "Annuler")}
                      >
                        ×
                      </button>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {confirmOpen && toCancel && (
        <div className="fixed inset-0 z-[120] flex items-center justify-center px-4">
          <div
            className="absolute inset-0 bg-black/25 backdrop-blur-[1px]"
            onClick={() => setConfirmOpen(false)}
          />

          <div
            className="
              relative w-full max-w-[380px]
              rounded-2xl border border-darkBlue/10 bg-white/95
              px-5 py-6 shadow-[0_22px_55px_rgba(19,30,54,0.20)]
              flex flex-col gap-4 text-center
            "
          >
            <h2 className="text-lg font-semibold text-darkBlue">
              {t("daysOff.confirmTitle", "Confirmer l’annulation")}
            </h2>

            <p className="text-sm text-darkBlue/80 text-balance">
              {t(
                "daysOff.confirmMessage",
                "Êtes-vous sûr de vouloir annuler votre demande :"
              )}{" "}
              <br />
              <strong>
                {format(toCancel.start, "dd/MM/yyyy", { locale: frLocale })} –{" "}
                {format(toCancel.end, "dd/MM/yyyy", { locale: frLocale })}
              </strong>
              ?
            </p>

            <div className="mt-2 flex justify-center gap-3">
              <button
                type="button"
                onClick={() => {
                  cancelRequest(toCancel.id);
                  setConfirmOpen(false);
                }}
                className="
                  inline-flex items-center justify-center
                  rounded-xl bg-blue px-4 py-2.5
                  text-sm font-medium text-white shadow
                  hover:bg-blue/90 transition
                "
              >
                {t("daysOff.confirmYes", "Oui")}
              </button>
              <button
                type="button"
                onClick={() => setConfirmOpen(false)}
                className="
                  inline-flex items-center justify-center
                  rounded-xl bg-red px-4 py-2.5
                  text-sm font-medium text-white shadow
                  hover:bg-red/90 transition
                "
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
