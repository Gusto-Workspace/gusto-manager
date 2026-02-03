import { useRouter } from "next/router";
import { useState, useContext, useMemo, useRef } from "react";
import axios from "axios";
import { GlobalContext } from "@/contexts/global.context";
import { useTranslation } from "next-i18next";
import { EmployeesSvg } from "../../_shared/_svgs/_index";
import CardEmployeesComponent from "./card.employees.component";

import { Search, X, Calendar, Plus } from "lucide-react";

export default function ListEmployeesComponent() {
  const { t } = useTranslation("employees");
  const { restaurantContext } = useContext(GlobalContext);
  const router = useRouter();

  const [searchTerm, setSearchTerm] = useState("");
  const [isDeleting, setIsDeleting] = useState(false);
  const [isLoadingDelete, setIsLoadingDelete] = useState(false);
  const [selectedEmployee, setSelectedEmployee] = useState(null);

  const searchRef = useRef(null);

  // accent-insensitive normalize
  const normalize = (str) =>
    str
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .trim();

  // filtered employees
  const restaurantId = restaurantContext.restaurantData?._id;

  const getSnapshotForRestaurant = (emp) => {
    const profile =
      (emp.restaurantProfiles || []).find(
        (p) => String(p.restaurant) === String(restaurantId),
      ) || null;
    return profile?.snapshot || {};
  };

  const filtered = useMemo(() => {
    const list = restaurantContext.restaurantData?.employees || [];
    if (!searchTerm.trim()) return list;

    const norm = normalize(searchTerm);

    return list.filter((e) => {
      const snap = getSnapshotForRestaurant(e);
      const firstname = snap.firstname ?? e.firstname ?? "";
      const lastname = snap.lastname ?? e.lastname ?? "";
      return normalize(`${firstname} ${lastname}`).includes(norm);
    });
  }, [restaurantContext.restaurantData?.employees, restaurantId, searchTerm]);

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
        {/* ✅ Titre: inchangé */}
        <div className="flex items-center gap-2 min-h-[40px]">
          <EmployeesSvg width={30} height={30} fillColor="#131E3690" />
          <h1 className="pl-2 text-xl tablet:text-2xl">
            {t("employees:titles.main")}
          </h1>
        </div>

        {/* Mobile webapp actions row */}
        <div className="flex items-center justify-between gap-3 midTablet:hidden">
          {/* Search */}
          <div className="relative flex-1 min-w-0">
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
                onClick={clearSearch}
                className="absolute right-2 top-1/2 -translate-y-1/2 inline-flex items-center justify-center size-9 rounded-2xl border border-darkBlue/10 bg-white hover:bg-darkBlue/5 transition"
                aria-label={t("buttons.clear", "Effacer")}
                title={t("buttons.clear", "Effacer")}
              >
                <X className="size-4 text-darkBlue/60" />
              </button>
            )}
          </div>

          {/* Buttons (style toolbar) */}
          <div className="shrink-0 flex items-center gap-2">
            <button
              onClick={() => router.push("/dashboard/employees/planning")}
              className="inline-flex items-center justify-center rounded-full border border-darkBlue/10 bg-white/70 hover:bg-darkBlue/5 transition p-4"
              aria-label={t("buttons.planning")}
              title={t("buttons.planning")}
            >
              <Calendar className="size-4 text-darkBlue/70" />
            </button>

            <button
              onClick={() => router.push("/dashboard/employees/add")}
              className="inline-flex items-center justify-center rounded-full bg-blue text-white shadow-sm hover:bg-blue/90 active:scale-[0.98] transition p-4"
              aria-label={t("buttons.addEmployee")}
              title={t("buttons.addEmployee")}
            >
              <Plus className="size-4" />
            </button>
          </div>
        </div>

        {/* Desktop/tablet layout (tu gardes ton layout existant) */}
        <div className="hidden midTablet:flex justify-between flex-wrap gap-4">
          <div className="relative midTablet:w-[350px]">
            <input
              type="text"
              placeholder={t(
                "placeholders.searchEmployee",
                "Rechercher un employé",
              )}
              value={searchTerm}
              onChange={handleSearchChange}
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

          <div className="flex flex-wrap gap-4">
            <button
              onClick={() => router.push("/dashboard/employees/planning")}
              className="bg-blue px-6 py-2 rounded-lg text-white h-fit"
            >
              {t("buttons.planning")}
            </button>

            <button
              onClick={() => router.push("/dashboard/employees/add")}
              className="bg-blue px-6 py-2 rounded-lg text-white h-fit"
            >
              {t("buttons.addEmployee")}
            </button>
          </div>
        </div>
      </div>

      {/* Grille d’employés */}
      <div className="my-6 grid grid-cols-2 midTablet:grid-cols-3 tablet:grid-cols-3 desktop:grid-cols-4 ultraWild:grid-cols-5 gap-2 midTablet:gap-4">
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
            className="shrink-0 inline-flex items-center justify-center size-10 rounded-2xl border border-darkBlue/10 bg-white/70 hover:bg-darkBlue/5 transition"
            aria-label={t("buttons.close", "Fermer")}
            title={t("buttons.close", "Fermer")}
            disabled={isLoadingDelete}
          >
            <span className="text-xl leading-none text-darkBlue/60">×</span>
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
