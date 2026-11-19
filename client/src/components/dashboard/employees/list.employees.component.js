import { useRouter } from "next/router";
import { useState, useContext, useMemo, useRef, useCallback } from "react";
import axios from "axios";
import { GlobalContext } from "@/contexts/global.context";
import { useTranslation } from "next-i18next";
import { EmployeesSvg } from "../../_shared/_svgs/_index";
import CardEmployeesComponent from "./card.employees.component";
import CatalogHeaderDashboardComponent from "../_shared/catalog-header.dashboard.component";

import {
  Search,
  X,
  Calendar,
  Plus,
  Clock3,
  Briefcase,
} from "lucide-react";

function normalize(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

export default function ListEmployeesComponent() {
  const { t } = useTranslation("employees");
  const { restaurantContext } = useContext(GlobalContext);
  const router = useRouter();

  const [searchTerm, setSearchTerm] = useState("");
  const [postFilter, setPostFilter] = useState("all");
  const [isDeleting, setIsDeleting] = useState(false);
  const [isLoadingDelete, setIsLoadingDelete] = useState(false);
  const [selectedEmployee, setSelectedEmployee] = useState(null);

  const searchRef = useRef(null);

  // filtered employees
  const restaurantId = restaurantContext.restaurantData?._id;
  const personnel = useMemo(
    () => [
      ...(restaurantContext.restaurantData?.employees || []),
      ...(restaurantContext.restaurantData?.accountants || []),
    ],
    [
      restaurantContext.restaurantData?.accountants,
      restaurantContext.restaurantData?.employees,
    ],
  );

  const getSnapshotForRestaurant = useCallback(
    (emp) => {
      const profile =
        (emp.restaurantProfiles || []).find(
          (p) => String(p.restaurant) === String(restaurantId),
        ) || null;
      return profile?.snapshot || {};
    },
    [restaurantId],
  );

  const filtered = useMemo(() => {
    const list = personnel;
    const selectedPost = normalize(postFilter);
    const hasSearch = Boolean(searchTerm.trim());

    const norm = normalize(searchTerm);

    return list.filter((e) => {
      const snap = getSnapshotForRestaurant(e);
      const firstname = snap.firstname ?? e.firstname ?? "";
      const lastname = snap.lastname ?? e.lastname ?? "";
      const post = snap.post ?? e.post ?? "";

      const matchesSearch = hasSearch
        ? normalize(`${firstname} ${lastname}`).includes(norm)
        : true;
      const matchesPost =
        postFilter === "all" ? true : normalize(post) === selectedPost;

      return matchesSearch && matchesPost;
    });
  }, [searchTerm, postFilter, getSnapshotForRestaurant, personnel]);

  const postOptions = useMemo(() => {
    const map = new Map();
    personnel.forEach((employee) => {
      if (employee.accountType === "accountant") return;
      const snapshot = getSnapshotForRestaurant(employee);
      const post = String(snapshot.post ?? employee.post ?? "").trim();
      if (!post) return;
      map.set(normalize(post), post);
    });
    return Array.from(map.values()).sort((a, b) => a.localeCompare(b, "fr"));
  }, [getSnapshotForRestaurant, personnel]);

  const totalEmployees = personnel.length;

  const handleSearchChange = (e) => setSearchTerm(e.target.value);

  const clearSearch = () => {
    setSearchTerm("");
    searchRef.current?.focus?.();
  };

  const handleDeleteClick = (emp) => {
    setSelectedEmployee(emp);
    setIsDeleting(true);
  };

  const confirmDelete = async () => {
    if (!selectedEmployee) return;
    setIsLoadingDelete(true);
    try {
      const url = `${process.env.NEXT_PUBLIC_API_URL}/restaurants/${restaurantContext.restaurantData._id}/employees/${selectedEmployee._id}`;
      const response = await axios.delete(url);
      restaurantContext.setRestaurantData((prev) => ({
        ...prev,
        employees: response.data.restaurant.employees,
        accountants: response.data.restaurant.accountants || [],
      }));
    } catch (err) {
      console.error("Error deleting employee:", err);
    } finally {
      setIsLoadingDelete(false);
      setIsDeleting(false);
      setSelectedEmployee(null);
    }
  };

  return (
    <section className="flex flex-col gap-6">
      <hr className="opacity-20" />

      {/* Header + actions */}
      <div className="flex flex-col gap-4">
        <CatalogHeaderDashboardComponent
          icon={<EmployeesSvg width={30} height={30} fillColor="#131E3690" />}
          title={t("employees:titles.main")}
          subtitle={`${totalEmployees} membre${totalEmployees > 1 || totalEmployees === 0 ? "s" : ""}`}
          actions={
            <>
              <button
                type="button"
                onClick={() => router.push("/dashboard/employees/time-clock")}
                className="hidden midTablet:inline-flex items-center gap-2 rounded-2xl border border-darkBlue/10 bg-white/70 px-4 py-2 text-sm font-semibold text-darkBlue transition hover:bg-darkBlue/5"
                aria-label="Pointeuse"
              >
                <span className="inline-flex items-center justify-center size-9 rounded-full bg-blue/15 text-blue">
                  <Clock3 className="size-4" />
                </span>
                <span className="whitespace-nowrap">Pointeuse</span>
              </button>

              <button
                type="button"
                onClick={() => router.push("/dashboard/employees/planning")}
                className="hidden midTablet:inline-flex items-center gap-2 rounded-2xl border border-darkBlue/10 bg-white/70 px-4 py-2 text-sm font-semibold text-darkBlue transition hover:bg-darkBlue/5"
                aria-label={t("titles.planning")}
                title={t("titles.planning")}
              >
                <span className="inline-flex items-center justify-center size-9 rounded-full bg-violet text-white">
                  <Calendar className="size-4" />
                </span>
                <span className="whitespace-nowrap">
                  {t("titles.planning")}
                </span>
              </button>

              <button
                type="button"
                onClick={() => router.push("/dashboard/employees/add")}
                className="hidden midTablet:inline-flex items-center gap-2 rounded-2xl border border-blue bg-white px-4 py-2 text-sm font-semibold text-blue shadow-sm transition hover:bg-darkBlue/5 active:scale-[0.98]"
                aria-label={t("buttons.addEmployee")}
                title={t("buttons.addEmployee")}
              >
                <span className="inline-flex items-center justify-center size-9 rounded-full bg-blue/15">
                  <Plus className="size-4" />
                </span>
                <span className="whitespace-nowrap">
                  {t("buttons.addEmployee")}
                </span>
              </button>
            </>
          }
        />

        {/* Mobile webapp actions row */}
        <div className="grid grid-cols-2 gap-2 midTablet:hidden">
          <button
            type="button"
            onClick={() => router.push("/dashboard/employees/time-clock")}
            className="inline-flex min-w-0 items-center gap-2 rounded-2xl border border-darkBlue/10 bg-white/70 px-3 py-3 text-sm font-semibold text-darkBlue transition hover:bg-darkBlue/5"
            aria-label="Pointeuse"
          >
            <span className="inline-flex size-9 shrink-0 items-center justify-center rounded-full bg-blue/15 text-blue">
              <Clock3 className="size-4" />
            </span>
            <span className="min-w-0 leading-tight">Pointeuse</span>
          </button>

          <button
            type="button"
            onClick={() => router.push("/dashboard/employees/planning")}
            className="inline-flex min-w-0 items-center gap-2 rounded-2xl border border-darkBlue/10 bg-white/70 px-3 py-3 text-sm font-semibold text-darkBlue transition hover:bg-darkBlue/5"
            aria-label={t("titles.planning")}
            title={t("titles.planning")}
          >
            <span className="inline-flex size-9 shrink-0 items-center justify-center rounded-full bg-violet text-white">
              <Calendar className="size-4" />
            </span>
            <span className="min-w-0 leading-tight">
              {t("titles.planning")}
            </span>
          </button>

          <button
            type="button"
            onClick={() => router.push("/dashboard/employees/add")}
            className="inline-flex min-w-0 items-center gap-2 rounded-2xl border border-blue bg-white px-3 py-3 text-sm font-semibold text-blue shadow-sm transition hover:bg-darkBlue/5 active:scale-[0.98]"
            aria-label={t("buttons.addEmployee")}
            title={t("buttons.addEmployee")}
          >
            <span className="inline-flex size-9 shrink-0 items-center justify-center rounded-full bg-blue/15">
              <Plus className="size-4" />
            </span>
            <span className="min-w-0 leading-tight">
              {t("buttons.addEmployee")}
            </span>
          </button>
        </div>

        {/* Search + post filter */}
        <div className="grid grid-cols-[minmax(0,1fr)_minmax(150px,240px)] gap-2">
          <div className="relative min-w-0">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-darkBlue/40" />
            <input
              ref={searchRef}
              type="text"
              inputMode="search"
              placeholder={t(
                "placeholders.searchEmployee",
                "Rechercher un employé",
              )}
              value={searchTerm}
              onChange={handleSearchChange}
              className={`h-12 w-full rounded-2xl border border-darkBlue/10 bg-white/70 ${
                searchTerm ? "pr-12" : "pr-4"
              } pl-9 text-base`}
            />
            {searchTerm && (
              <button
                type="button"
                onClick={clearSearch}
                className="absolute right-2 top-1/2 inline-flex size-9 -translate-y-1/2 items-center justify-center rounded-2xl border border-darkBlue/10 bg-white transition hover:bg-darkBlue/5"
                aria-label={t("buttons.clear", "Effacer")}
                title={t("buttons.clear", "Effacer")}
              >
                <X className="size-4 text-darkBlue/60" />
              </button>
            )}
          </div>

          <div className="relative min-w-0">
            <Briefcase className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-darkBlue/40" />
            <select
              value={postFilter}
              onChange={(e) => setPostFilter(e.target.value)}
              className="h-12 w-full rounded-2xl border border-darkBlue/10 bg-white/70 pl-9 pr-4 text-base text-darkBlue outline-none"
              aria-label="Filtrer par poste"
            >
              <option value="all">Tous les postes</option>
              {postOptions.map((post) => (
                <option key={post} value={post}>
                  {post}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* Grille d’employés */}
      <div className="my-6 grid grid-cols-2 midTablet:grid-cols-3 tablet:grid-cols-3 desktop:grid-cols-4 ultraWild:grid-cols-4 gap-2 gap-y-8 midTablet:gap-4 midTablet:gap-y-8">
        {filtered.map((emp) => (
          <CardEmployeesComponent
            key={emp._id}
            employee={emp}
            restaurantId={restaurantContext.restaurantData._id}
            handleDeleteClick={handleDeleteClick}
          />
        ))}
      </div>

      {/* Confirmation de suppression */}
      {isDeleting && (
        <div
          className="fixed inset-0 z-[100] flex items-end midTablet:items-center justify-center p-3 midTablet:p-6"
          role="dialog"
          aria-modal="true"
          aria-labelledby="delete-employee-title"
          onKeyDown={(e) => {
            if (e.key === "Escape" && !isLoadingDelete) setIsDeleting(false);
          }}
        >
          {/* Overlay */}
          <button
            type="button"
            onClick={() => {
              if (isLoadingDelete) return;
              setIsDeleting(false);
            }}
            className="absolute inset-0 bg-black/25 backdrop-blur-[2px]"
            aria-label={t("buttons.close", "Fermer")}
          />

          {/* Modal card */}
          <div className="relative w-full max-w-[460px]">
            <div className="rounded-3xl border border-darkBlue/10 bg-white/90 backdrop-blur shadow-[0_20px_60px_rgba(0,0,0,0.15)] overflow-hidden animate-[fadeInUp_.18s_ease-out]">
              {/* Header */}
              <div className="flex items-start justify-between gap-3 px-5 pt-5">
                <div className="min-w-0">
                  <h2
                    id="delete-employee-title"
                    className="text-lg font-semibold text-darkBlue"
                  >
                    {t("modale.titles.deleteEmployee")}
                  </h2>
                  <p className="mt-1 text-sm text-darkBlue/70">
                    {t("modale.description.deleteEmployee")}
                  </p>
                </div>

                <button
                  type="button"
                  onClick={() => {
                    if (isLoadingDelete) return;
                    setIsDeleting(false);
                  }}
                  className="shrink-0 inline-flex items-center justify-center size-10 rounded-full border border-darkBlue/10 bg-white/70 hover:bg-darkBlue/5 transition"
                  aria-label={t("buttons.close", "Fermer")}
                  title={t("buttons.close", "Fermer")}
                  disabled={isLoadingDelete}
                >
                  <span className="text-xl leading-none text-darkBlue/60">
                    ×
                  </span>
                </button>
              </div>

              {/* Content */}
              <div className="px-5 pb-5">
                <div className="mt-4 rounded-2xl border border-darkBlue/10 bg-white/70 px-4 py-3">
                  <div className="text-sm text-darkBlue/70">
                    <span className="font-medium text-darkBlue">
                      {selectedEmployee?.firstname} {selectedEmployee?.lastname}
                    </span>
                  </div>
                  <div className="mt-1 text-xs text-darkBlue/50">
                    {t(
                      "modale.hint.deleteEmployee",
                      "Cette action est définitive.",
                    )}
                  </div>
                </div>

                {/* Actions */}
                <div className="mt-5 flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      if (isLoadingDelete) return;
                      setIsDeleting(false);
                    }}
                    disabled={isLoadingDelete}
                    className="flex-1 h-12 rounded-2xl border border-darkBlue/10 bg-white/70 text-darkBlue font-semibold hover:bg-darkBlue/5 transition disabled:opacity-60"
                  >
                    {t("buttons.cancel")}
                  </button>

                  <button
                    type="button"
                    onClick={confirmDelete}
                    disabled={isLoadingDelete}
                    className="flex-1 h-12 rounded-2xl bg-red text-white font-semibold shadow-sm hover:bg-red/90 active:scale-[0.99] transition disabled:opacity-60 inline-flex items-center justify-center gap-2"
                  >
                    {isLoadingDelete ? (
                      <>
                        <span className="size-4 rounded-full border-2 border-white/40 border-t-white animate-spin" />
                        <span>{t("buttons.loading")}</span>
                      </>
                    ) : (
                      t("buttons.confirm")
                    )}
                  </button>
                </div>
              </div>
            </div>

            {/* Small animation keyframes (Tailwind arbitrary) */}
            <style jsx>{`
              @keyframes fadeInUp {
                from {
                  opacity: 0;
                  transform: translateY(10px);
                }
                to {
                  opacity: 1;
                  transform: translateY(0);
                }
              }
            `}</style>
          </div>
        </div>
      )}

    </section>
  );
}
