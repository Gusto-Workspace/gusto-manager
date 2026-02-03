import { useContext, useState, useEffect, useMemo } from "react";
import { useRouter } from "next/router";
import axios from "axios";
import { format, differenceInCalendarDays } from "date-fns";
import frLocale from "date-fns/locale/fr";
import { GlobalContext } from "@/contexts/global.context";
import { useTranslation } from "next-i18next";
import { EmployeesSvg } from "../../_shared/_svgs/_index";
import {
  Search,
  CalendarDays,
  User,
  CheckCircle2,
  XCircle,
} from "lucide-react";

export default function DaysOffEmployeesComponent() {
  const { t } = useTranslation("employees");
  const { restaurantContext } = useContext(GlobalContext);
  const router = useRouter();

  const restaurantId = restaurantContext.restaurantData?._id;

  // 1) Liste brute des employés
  const allEmployees = restaurantContext.restaurantData?.employees || [];

  // 2) HYDRATATION DES LEAVE-REQUESTS AU MONTAGE ──────────────────────────────
  useEffect(() => {
    if (!restaurantId) return;
    const employees = allEmployees;
    if (!employees.length) return;

    const alreadyHaveLeave = employees.some(
      (e) => Array.isArray(e.leaveRequests) && e.leaveRequests.length > 0
    );
    if (alreadyHaveLeave) return;

    let cancelled = false;

    (async () => {
      try {
        const results = await Promise.all(
          employees.map((emp) =>
            axios
              .get(
                `${process.env.NEXT_PUBLIC_API_URL}/restaurants/${restaurantId}/employees/${emp._id}/leave-requests`
              )
              .then((res) => ({
                employeeId: emp._id,
                leaveRequests: res.data || [],
              }))
              .catch((err) => {
                console.error(
                  "Erreur fetch leave-requests pour",
                  emp._id,
                  err
                );
                return { employeeId: emp._id, leaveRequests: [] };
              })
          )
        );

        if (cancelled) return;

        restaurantContext.setRestaurantData((prev) => {
          if (!prev) return prev;
          const prevEmployees = prev.employees || [];
          return {
            ...prev,
            employees: prevEmployees.map((emp) => {
              const match = results.find(
                (r) => String(r.employeeId) === String(emp._id)
              );
              return match
                ? { ...emp, leaveRequests: match.leaveRequests }
                : emp;
            }),
          };
        });
      } catch (e) {
        console.error("Erreur hydratation leave-requests:", e);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [restaurantId, allEmployees.length]);

  // 3) Search state + normalisation sans accents
  const [searchTerm, setSearchTerm] = useState("");
  const normalize = (str) =>
    str
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .trim();

  // 4) Filtrer les employés
  const employees = useMemo(() => {
    if (!searchTerm.trim()) return allEmployees;
    const norm = normalize(searchTerm);
    return allEmployees.filter((e) =>
      normalize(`${e.firstname} ${e.lastname}`).includes(norm)
    );
  }, [allEmployees, searchTerm]);

  // 5) Aplatir leurs demandes
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

  // 6) Grouper par statut
  const grouped = useMemo(() => {
    return requests.reduce(
      (acc, req) => {
        if (acc[req.status]) acc[req.status].push(req);
        return acc;
      },
      { pending: [], approved: [], rejected: [], cancelled: [] }
    );
  }, [requests]);

  // 7) Formater le nombre de jours
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

  // 8) Mise à jour instantanée du statut
  async function updateStatus(empId, reqId, status) {
    try {
      if (!restaurantId) {
        window.alert("Restaurant introuvable");
        return;
      }

      const { data } = await axios.put(
        `${process.env.NEXT_PUBLIC_API_URL}/restaurants/${restaurantId}/employees/${empId}/leave-requests/${reqId}`,
        { status }
      );
      // data = { leaveRequest, shifts }

      // 1) Mettre à jour la liste aplanie locale
      setRequests((rs) =>
        rs.map((r) =>
          r._id === reqId && r.employee._id === empId ? { ...r, status } : r
        )
      );

      // 2) Mettre à jour le contexte global (pour le planning)
      restaurantContext.setRestaurantData((prev) => ({
        ...prev,
        employees: (prev?.employees || []).map((e) =>
          e._id === empId
            ? {
                ...e,
                leaveRequests: (e.leaveRequests || []).map((lr) =>
                  String(lr._id) === String(reqId) ? { ...lr, status } : lr
                ),
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

  // 9) Labels
  const statusLabels = {
    pending: t("daysOff.labels.pending", "En attente"),
    approved: t("daysOff.labels.approved", "Confirmées"),
    rejected: t("daysOff.labels.rejected", "Rejetées"),
    cancelled: t("daysOff.labels.cancelled", "Annulées"),
  };

  const sectionCard =
    "rounded-2xl bg-white/60 border border-darkBlue/10 shadow-sm p-2 midTablet:p-3";

  return (
    <section className="flex flex-col gap-6 min-w-0">
      {/* ─── En-tête ─────────────────────────────────────────────── */}
      <div className="flex justify-between flex-wrap gap-4">
        <div className="flex flex-col gap-3">
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
              <span className="">{t("titles.daysOff")}</span>
            </h1>
          </div>
          <p className="text-xs text-darkBlue/60 max-w-xl">
            {t(
              "daysOff.helper",
              "Visualisez et gérez les demandes de congés des employés, par statut."
            )}
          </p>
        </div>
      </div>

      {/* ─── Barre de recherche ───────────────────────────────────── */}
      <div className={`midTablet:w-[380px]`}>
        <div className="relative">
          <input
            type="text"
            placeholder={t(
              "placeholders.searchEmployee",
              "Rechercher un employé"
            )}
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full h-10 rounded-lg border border-darkBlue/20 bg-white/90 px-3 pr-9 text-base outline-none transition placeholder:text-darkBlue/40 focus:border-darkBlue/50"
          />
          {!searchTerm && <Search className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 size-4 text-darkBlue/30" />}
          {searchTerm && (
            <button
              type="button"
              onClick={() => setSearchTerm("")}
              className="absolute right-2 top-1/2 -translate-y-1/2 w-5 h-5 bg-black/20 text-white rounded-full flex items-center justify-center text-xs hover:bg-black/40 transition"
            >
              ×
            </button>
          )}
        </div>
      </div>

      {/* ─── Sections par statut ──────────────────────────────────── */}
      {["pending", "approved", "rejected", "cancelled"].map((status) => (
        <div key={status} className="flex flex-col gap-3">
          {/* Titre de section avec ligne */}
          <div className="relative mb-1">
            <hr className="text-darkBlue/10 absolute h-[1px] w-full left-0 top-1/2 -translate-y-1/2 z-10" />
            <div className="relative z-20 flex justify-center">
              <span className="inline-flex items-center gap-2 rounded-full bg-lightGrey px-4 py-1 text-xs font-semibold uppercase tracking-wide text-darkBlue/80 shadow-sm">
                {status === "pending" && (
                  <CalendarDays className="size-3.5 text-amber-500" />
                )}
                {status === "approved" && (
                  <CheckCircle2 className="size-3.5 text-emerald-500" />
                )}
                {status === "rejected" && (
                  <XCircle className="size-3.5 text-red-500" />
                )}
                {status === "cancelled" && (
                  <XCircle className="size-3.5 text-slate-500" />
                )}
                <span>{statusLabels[status]}</span>
                <span className="text-[11px] opacity-60">
                  ({grouped[status].length})
                </span>
              </span>
            </div>
          </div>

          {grouped[status].length === 0 ? (
            <div className={`${sectionCard} midTablet:w-1/2 mx-auto`}>
              <p className="italic text-center text-sm text-darkBlue/60">
                {t("daysOff.noRequestsStatus", "Aucune demande")}
              </p>
            </div>
          ) : (
            <ul className="grid grid-cols-1 midTablet:grid-cols-2 gap-3">
              {grouped[status].map((req) => {
                const start = new Date(req.start);
                const end = new Date(req.end);

                return (
                  <li
                    key={req._id}
                    className={`${sectionCard} flex flex-col gap-3 midTablet:flex-row midTablet:items-center justify-between`}
                  >
                    {/* Infos employé + dates */}
                    <div className="flex flex-col gap-1 text-center midTablet:text-left">
                      <div className="flex items-center justify-center midTablet:justify-start gap-2">
                        <User className="size-4 text-darkBlue/70" />
                        <span className="font-medium text-darkBlue">
                          {req.employee.firstname} {req.employee.lastname}
                        </span>
                      </div>

                      <div className="text-sm flex flex-col gap-1 items-center midTablet:items-start text-darkBlue/80">
                        <span className="inline-flex items-center gap-1">
                          <CalendarDays className="size-3.5 text-darkBlue/60" />
                          <strong>
                            {format(start, "dd/MM/yyyy", { locale: frLocale })}
                          </strong>
                          <span>–</span>
                          <strong>
                            {format(end, "dd/MM/yyyy", { locale: frLocale })}
                          </strong>
                        </span>
                        <span className="text-xs text-darkBlue/60">
                          ({formatDays(req)})
                        </span>
                      </div>

                      <div className="text-[11px] text-darkBlue/50">
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

                    {/* Statut / actions */}
                    {status === "pending" && (
                      <div className="flex flex-col items-center midTablet:items-end gap-2">
                        <div className="flex gap-2">
                          <button
                            type="button"
                            onClick={() =>
                              updateStatus(
                                req.employee._id,
                                req._id,
                                "approved"
                              )
                            }
                            className="inline-flex items-center gap-2 rounded-lg bg-green px-3 py-1.5 text-xs font-medium text-white shadow hover:opacity-90 transition"
                          >
                            <CheckCircle2 className="size-5" />
                          </button>
                          <button
                            type="button"
                            onClick={() =>
                              updateStatus(
                                req.employee._id,
                                req._id,
                                "rejected"
                              )
                            }
                            className="inline-flex items-center gap-2 rounded-lg bg-red px-3 py-1.5 text-xs font-medium text-white shadow hover:opacity-90 transition"
                          >
                            <XCircle className="size-5" />
                          </button>
                        </div>
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
