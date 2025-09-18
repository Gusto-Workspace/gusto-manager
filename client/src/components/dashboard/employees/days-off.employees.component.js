import { useContext, useState, useEffect, useMemo } from "react";
import { useRouter } from "next/router";
import axios from "axios";
import { format, differenceInCalendarDays } from "date-fns";
import frLocale from "date-fns/locale/fr";
import { GlobalContext } from "@/contexts/global.context";
import { useTranslation } from "next-i18next";
import { EmployeesSvg } from "../../_shared/_svgs/_index";

export default function DaysOffEmployeesComponent() {
  const { t } = useTranslation("employees");
  const { restaurantContext } = useContext(GlobalContext);
  const router = useRouter();

  // 1) Liste brute des employés
  const allEmployees = restaurantContext.restaurantData?.employees || [];

  // 2) Search state + normalisation sans accents
  const [searchTerm, setSearchTerm] = useState("");
  const normalize = (str) =>
    str
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .trim();

  // 3) Filtrer les employés
  const employees = useMemo(() => {
    if (!searchTerm.trim()) return allEmployees;
    const norm = normalize(searchTerm);
    return allEmployees.filter((e) =>
      normalize(`${e.firstname} ${e.lastname}`).includes(norm)
    );
  }, [allEmployees, searchTerm]);

  // 4) Aplatir leurs demandes
  const [requests, setRequests] = useState([]);
  useEffect(() => {
    const objectIdToDate = (oid) =>
      new Date(parseInt(String(oid).substring(0, 8), 16) * 1000);
    const createdTs = (r) =>
      (r.createdAt ? new Date(r.createdAt) : objectIdToDate(r._id)).getTime();

    const all = employees
      .flatMap((emp) =>
        (emp.leaveRequests || []).map((req) => ({
          ...req,
          employee: emp,
        }))
      )
      .sort((a, b) => createdTs(b) - createdTs(a)); // plus récent d'abord
    setRequests(all);
  }, [employees]);

  // 5) Grouper par statut
  const grouped = useMemo(() => {
    return requests.reduce(
      (acc, req) => {
        if (acc[req.status]) acc[req.status].push(req);
        return acc;
      },
      { pending: [], approved: [], rejected: [], cancelled: [] }
    );
  }, [requests]);

  // 6) Formater le nombre de jours
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

  // 7) Mise à jour instantanée du statut
  async function updateStatus(empId, reqId, status) {
    try {
      const { data } = await axios.put(
        `${process.env.NEXT_PUBLIC_API_URL}/employees/${empId}/leave-requests/${reqId}`,
        { status }
      );

      // 1) Mettre à jour la liste aplanie locale (UI de cette page)
      setRequests((rs) =>
        rs.map((r) =>
          r._id === reqId && r.employee._id === empId ? { ...r, status } : r
        )
      );

      // 2) Mettre à jour le contexte global (très important pour la page Planning)
      restaurantContext.setRestaurantData((prev) => ({
        ...prev,
        employees: (prev?.employees || []).map((e) =>
          e._id === empId
            ? {
                ...e,
                // on met à jour le status de la LR ciblée
                leaveRequests: (e.leaveRequests || []).map((lr) =>
                  String(lr._id) === String(reqId) ? { ...lr, status } : lr
                ),
                // et on remplace les shifts par ceux renvoyés par l’API
                shifts: data.shifts || [],
              }
            : e
        ),
      }));
    } catch (err) {
      console.error("Erreur update leave request:", err);
      window.alert(t("daysOff.errorUpdate", "Impossible de mettre à jour"));
    }
  }

  // 8) Labels
  const statusLabels = {
    pending: t("daysOff.labels.pending", "En attente"),
    approved: t("daysOff.labels.approved", "Confirmées"),
    rejected: t("daysOff.labels.rejected", "Rejetées"),
    cancelled: t("daysOff.labels.cancelled", "Annulées"),
  };

  return (
    <section className="flex flex-col gap-4 min-w-0">
      {/* ─── En-tête + Recherche ─────────────────────────────────────────────── */}
      <div className="flex justify-between flex-wrap gap-4">
        <div className="flex flex-col gap-4">
          <div className="flex items-center gap-2 min-h-[40px]">
            <EmployeesSvg
              width={30}
              height={30}
              fillColor="#131E3690"
              className="min-w-[30px]"
            />
            <h1 className="pl-2 text-xl tablet:text-2xl flex items-center gap-2 flex-wrap">
              <span
                className="cursor-pointer hover:underline"
                onClick={() => router.push("/dashboard/employees")}
              >
                {t("titles.main")}
              </span>
              <span>/</span>
              <span
                className="cursor-pointer hover:underline"
                onClick={() => router.push("/dashboard/employees/planning")}
              >
                {t("titles.planning")}
              </span>
              <span>/</span>
              <span>{t("titles.daysOff")}</span>
            </h1>
          </div>
        </div>
      </div>
      <div className="relative midTablet:w-[350px] mb-6">
        <input
          type="text"
          placeholder={t(
            "placeholders.searchEmployee",
            "Rechercher un employé"
          )}
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="w-full p-2 pr-10 border border-[#131E3690] rounded-lg"
        />
        {searchTerm && (
          <button
            onClick={() => setSearchTerm("")}
                className="absolute right-3 top-1/2 transform -translate-y-1/2 w-6 h-6 bg-black bg-opacity-30 text-white rounded-full flex items-center justify-center"
          >
            &times;
          </button>
        )}
      </div>

      {/* ─── Sections par statut ────────────────────────────────────────────── */}
      {["pending", "approved", "rejected", "cancelled"].map((status) => (
        <div key={status}>
          <div className="relative mb-4">
            <h2 className="relative flex items-center justify-center gap-2 w-fit px-6 mx-auto text-center text-lg font-semibold uppercase bg-lightGrey z-20">
              {statusLabels[status]}
              <span className="text-base opacity-50">
                ({grouped[status].length})
              </span>
            </h2>
            <hr className="bg-darkBlue absolute h-[1px] w-full midTablet:w-[350px] left-1/2 -translate-x-1/2 top-1/2 -translate-y-1/2 z-10" />
          </div>

          {grouped[status].length === 0 ? (
            <div className="p-6 bg-white bg-opacity-70 drop-shadow-sm rounded-lg w-full mobile:w-1/2 mx-auto text-center">
              <p className="italic">
                {t("daysOff.noRequestsStatus", "Aucune demande")}
              </p>
            </div>
          ) : (
            <ul className="flex flex-col gap-4">
              {grouped[status].map((req) => {
                const start = new Date(req.start);
                const end = new Date(req.end);
                return (
                  <li
                    key={req._id}
                    className="relative bg-white p-4 rounded-lg drop-shadow-sm flex flex-col gap-2 midTablet:flex-row midTablet:items-center justify-between"
                  >
                    <div className="flex flex-col text-center midTablet:text-start">
                      <div className="font-medium">
                        {req.employee.firstname} {req.employee.lastname}
                      </div>
                      <div>
                        <strong>
                          {format(start, "dd/MM/yyyy", { locale: frLocale })}
                        </strong>{" "}
                        –{" "}
                        <strong>
                          {format(end, "dd/MM/yyyy", { locale: frLocale })}
                        </strong>{" "}
                        ({formatDays(req)})
                      </div>
                      <div className="text-sm text-gray-600">
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

                    {status === "pending" && (
                      <div className="flex gap-2 mt-4 midTablet:mt-0">
                        <button
                          onClick={() =>
                            updateStatus(req.employee._id, req._id, "approved")
                          }
                          className="px-4 py-2 bg-green text-white rounded hover:opacity-80 transition"
                        >
                          {t("daysOff.confirm", "Confirmer")}
                        </button>
                        <button
                          onClick={() =>
                            updateStatus(req.employee._id, req._id, "rejected")
                          }
                          className="px-4 py-2 bg-red text-white rounded hover:opacity-80 transition"
                        >
                          {t("daysOff.reject", "Rejeter")}
                        </button>
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      ))}
    </section>
  );
}
