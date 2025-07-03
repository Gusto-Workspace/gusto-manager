import { useRouter } from "next/router";
import { useState, useContext, useMemo } from "react";
import axios from "axios";
import { GlobalContext } from "@/contexts/global.context";
import { useTranslation } from "next-i18next";
import { EmployeesSvg } from "../../_shared/_svgs/_index";
import CardEmployeesComponent from "./card.employees.component";

export default function ListEmployeesComponent() {
  const { t } = useTranslation("employees");
  const { restaurantContext } = useContext(GlobalContext);
  const router = useRouter();

  const [searchTerm, setSearchTerm] = useState("");
  const [isDeleting, setIsDeleting] = useState(false);
  const [isLoadingDelete, setIsLoadingDelete] = useState(false);
  const [selectedEmployee, setSelectedEmployee] = useState(null);

  // accent-insensitive normalize
  const normalize = (str) =>
    str
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .trim();

  // filtered employees
  const filtered = useMemo(() => {
    if (!searchTerm.trim()) return restaurantContext.restaurantData.employees;
    const norm = normalize(searchTerm);
    return restaurantContext.restaurantData.employees.filter((e) =>
      normalize(`${e.firstname} ${e.lastname}`).includes(norm)
    );
  }, [restaurantContext.restaurantData.employees, searchTerm]);

  const handleSearchChange = (e) => setSearchTerm(e.target.value);

  const handleDeleteClick = (emp) => {
    setSelectedEmployee(emp);
    setIsDeleting(true);
  };

  const confirmDelete = async () => {
    if (!selectedEmployee) return;
    setIsLoadingDelete(true);
    try {
      const url = `${process.env.NEXT_PUBLIC_API_URL}/restaurants/${restaurantContext.restaurantData._id}/employees/${selectedEmployee._id}`;
      const res = await axios.delete(url);
      restaurantContext.setRestaurantData(res.data.restaurant);
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

      {/* Barre de recherche + boutons */}
      <div className="flex justify-between flex-wrap gap-4">
        <div className="flex flex-col gap-4">
          <div className="flex items-center gap-2 min-h-[40px]">
            <EmployeesSvg width={30} height={30} fillColor="#131E3690" />
            <h1 className="pl-2 text-xl tablet:text-2xl">
              {t("employees:titles.main")}
            </h1>
          </div>

          <div className="relative midTablet:w-[350px]">
            <input
              type="text"
              placeholder={t(
                "placeholders.searchEmployee",
                "Rechercher un employé"
              )}
              value={searchTerm}
              onChange={handleSearchChange}
              className="w-full p-2 pr-10 border border-[#131E3690] rounded-lg"
            />
            {searchTerm && (
              <button
                onClick={() => setSearchTerm("")}
                className="absolute right-4 top-1/2 transform -translate-y-1/2 w-4 h-4 bg-black bg-opacity-30 text-white rounded-full flex items-center justify-center"
              >
                &times;
              </button>
            )}
          </div>
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

      {/* Grille d’employés */}
      <div className="my-6 grid grid-cols-1 tablet:grid-cols-3 desktop:grid-cols-4 ultraWild:grid-cols-5 gap-6">
        {filtered.map((emp) => (
          <CardEmployeesComponent
            key={emp._id}
            employee={emp}
            handleDeleteClick={handleDeleteClick}
          />
        ))}
      </div>

      {/* Confirmation de suppression */}
      {isDeleting && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-6">
          <div
            onClick={() => setIsDeleting(false)}
            className="absolute inset-0 bg-black bg-opacity-20"
          />
          <div className="relative bg-white p-6 rounded-lg shadow-lg w-[400px] z-10">
            <h2 className="text-xl font-semibold mb-4 text-center">
              {t("modale.titles.deleteEmployee")}
            </h2>
            <p className="mb-6 text-center">
              {t("modale.description.deleteEmployee")} <br />
              <strong>
                {selectedEmployee.firstname} {selectedEmployee.lastname}
              </strong>{" "}
              ?
            </p>
            <div className="flex justify-center gap-4">
              <button
                onClick={confirmDelete}
                disabled={isLoadingDelete}
                className="px-4 py-2 bg-blue text-white rounded-lg"
              >
                {isLoadingDelete ? t("buttons.loading") : t("buttons.confirm")}
              </button>
              <button
                onClick={() => setIsDeleting(false)}
                disabled={isLoadingDelete}
                className="px-4 py-2 bg-red text-white rounded-lg"
              >
                {t("buttons.cancel")}
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
