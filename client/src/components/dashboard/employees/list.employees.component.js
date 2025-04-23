import { useRouter } from "next/router";
import { useState, useContext } from "react";

// REACT HOOK FORM
import { useForm } from "react-hook-form";

// AXIOS
import axios from "axios";

// CONTEXT
import { GlobalContext } from "@/contexts/global.context";

// I18N
import { useTranslation } from "next-i18next";

// SVG
import { EmployeesSvg, WarningSvg } from "../../_shared/_svgs/_index";

// COMPONENTS
import CardEmployeesComponent from "./card.employees.component";

export default function ListEmployeesComponent(props) {
  const { t } = useTranslation("employees");
  const { restaurantContext } = useContext(GlobalContext);
  const router = useRouter();
  const { locale } = router;

  const [searchTerm, setSearchTerm] = useState("");
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [selectedEmployee, setSelectedEmployee] = useState(null);

  // On récupère aussi isSubmitted depuis formState
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitted },
  } = useForm();

  function handleSearchChange(event) {
    setSearchTerm(event.target.value);
  }

  // Ouvre la modale en mode suppression
  function handleDeleteClick(employee) {
    setSelectedEmployee(employee);
    setIsDeleting(true);
    setIsModalOpen(true);
  }

  // Supprime l'employé après confirmation
  function confirmDelete() {
    const deleteUrl = `${process.env.NEXT_PUBLIC_API_URL}/restaurants/${restaurantContext.restaurantData._id}/employees/${selectedEmployee._id}`;

    setIsLoading(true);

    axios
      .delete(deleteUrl)
      .then((response) => {
        restaurantContext.setRestaurantData(response.data.restaurant);
        setIsModalOpen(false);
        setIsDeleting(false);
        setSelectedEmployee(null);
        setIsLoading(false);
      })
      .catch((error) => {
        console.error("Error deleting employee:", error);
        setIsLoading(false);
      });
  }

  // Envoi du formulaire pour ajouter un employé
  function onSubmit(data) {
    const apiUrl = `${process.env.NEXT_PUBLIC_API_URL}/restaurants/${restaurantContext?.restaurantData?._id}/employees`;

    const formData = new FormData();
    formData.append("lastName", data.lastName);
    formData.append("firstName", data.firstName);
    formData.append("email", data.email);
    formData.append("post", data.post);
    formData.append("dateOnPost", data.dateOnPost);
    formData.append("phone", data.phone);

    if (data.profilePicture && data.profilePicture[0]) {
      formData.append("profilePicture", data.profilePicture[0]);
    }

    setIsLoading(true);

    axios
      .post(apiUrl, formData, {
        headers: { "Content-Type": "multipart/form-data" },
      })
      .then((response) => {
        restaurantContext.setRestaurantData(response.data.restaurant);
        setIsModalOpen(false);
        reset();
        setIsLoading(false);
      })
      .catch((error) => {
        console.error("Error creating employee:", error);
        setIsLoading(false);
      });
  }

  return (
    <section className="flex flex-col gap-6">
      <hr className="opacity-20" />

      <div className="flex gap-4 flex-wrap justify-between">
        <div className="flex flex-col gap-4">
          <div className="flex gap-2 items-center min-h-[40px]">
            <EmployeesSvg
              width={30}
              height={30}
              className="min-h-[30px] min-w-[30px]"
              fillColor="#131E3690"
            />
            <h1 className="pl-2 text-xl tablet:text-2xl">
              {t("employees:titles.main")}
            </h1>
          </div>
          <div className="relative midTablet:w-[350px]">
            <input
              type="text"
              placeholder="Rechercher un employé"
              value={searchTerm}
              onChange={handleSearchChange}
              className="p-2 pr-10 border border-[#131E3690] rounded-lg w-full"
            />
            {searchTerm && (
              <button
                onClick={() => setSearchTerm("")}
                className="absolute right-4 top-1/2 transform -translate-y-1/2 text-white bg-black bg-opacity-30 w-4 h-4 flex items-center justify-center rounded-full focus:outline-none"
              >
                &times;
              </button>
            )}
          </div>
        </div>

        <div className="flex gap-4 items-start">
          <button
            onClick={() => {
              setIsModalOpen(true);
              setIsDeleting(false);
            }}
            className="bg-blue px-6 py-2 rounded-lg text-white cursor-pointer"
          >
            {t("buttons.addEmployee")}
          </button>
        </div>
      </div>

      <div className="my-12 grid grid-cols-1 tablet:grid-cols-3 desktop:grid-cols-4 ultraWild:grid-cols-5 gap-x-6 gap-y-12">
        {restaurantContext.restaurantData.employees.map((employee, i) => (
          <CardEmployeesComponent
            key={i}
            employee={employee}
            handleDeleteClick={handleDeleteClick}
          />
        ))}
      </div>

      {isModalOpen && (
        <div className="fixed inset-0 flex items-center mx-6 justify-center z-[100]">
          <div
            onClick={() => {
              if (!isLoading) {
                setIsModalOpen(false);
                setIsDeleting(false);
                setSelectedEmployee(null);
              }
            }}
            className="fixed inset-0 bg-black bg-opacity-20"
          />
          <div className="bg-white p-6 rounded-lg shadow-lg w-[450px] z-10">
            {isDeleting ? (
              <>
                <h2 className="text-xl font-semibold mb-6 text-center">
                  {t("modale.titles.deleteEmployee")}
                </h2>
                <p className="mb-8 text-center text-balance">
                  {t("modale.description.deleteEmployee")}{" "}
                  {selectedEmployee?.firstname} {selectedEmployee?.lastname} ?
                </p>
                <div className="flex gap-4 justify-center">
                  <button
                    onClick={confirmDelete}
                    type="button"
                    disabled={isLoading}
                    className="px-4 py-2 rounded-lg bg-blue text-white"
                  >
                    {isLoading ? t("buttons.loading") : t("buttons.confirm")}
                  </button>
                  <button
                    onClick={() => {
                      setIsModalOpen(false);
                      setIsDeleting(false);
                      setSelectedEmployee(null);
                    }}
                    type="button"
                    disabled={isLoading}
                    className="px-4 py-2 rounded-lg text-white bg-red"
                  >
                    {t("buttons.cancel")}
                  </button>
                </div>
              </>
            ) : (
              <>
                <h2 className="text-xl font-semibold mb-6 text-center">
                  {t("buttons.addEmployee")}
                </h2>
                <form
                  onSubmit={handleSubmit(onSubmit)}
                  className="flex flex-col gap-4"
                >
                  {/* Input pour le nom de famille */}
                  <div className="flex flex-col relative">
                    <label htmlFor="lastName" className="mb-1">
                      {t("modale.labels.lastname")}
                    </label>
                    <div className="flex items-center gap-2">
                      <input
                        id="lastName"
                        type="text"
                        placeholder="Nom"
                        {...register("lastName", { required: true })}
                        className="w-full p-2 border border-darkBlue/50 rounded-lg"
                      />
                      {errors.lastName && isSubmitted && (
                        <WarningSvg
                          fillColor="#FF7664"
                          width={22}
                          height={22}
                        />
                      )}
                    </div>
                  </div>
                  {/* Input pour le prénom */}
                  <div className="flex flex-col relative">
                    <label htmlFor="firstName" className="mb-1">
                      {t("modale.labels.firstname")}
                    </label>
                    <div className="flex items-center gap-2">
                      <input
                        id="firstName"
                        type="text"
                        placeholder="Prénom"
                        {...register("firstName", { required: true })}
                        className="w-full p-2 border border-darkBlue/50 rounded-lg"
                      />
                      {errors.firstName && isSubmitted && (
                        <WarningSvg
                          fillColor="#FF7664"
                          width={22}
                          height={22}
                        />
                      )}
                    </div>
                  </div>
                  {/* Input pour l'email */}
                  <div className="flex flex-col relative">
                    <label htmlFor="email" className="mb-1">
                      {t("modale.labels.email")}
                    </label>
                    <div className="flex items-center gap-2">
                      <input
                        id="email"
                        type="email"
                        placeholder="Email"
                        {...register("email", { required: true })}
                        className="w-full p-2 border border-darkBlue/50 rounded-lg"
                      />
                      {errors.email && isSubmitted && (
                        <WarningSvg
                          fillColor="#FF7664"
                          width={22}
                          height={22}
                        />
                      )}
                    </div>
                  </div>

                  {/* Input pour le téléphone */}
                  <div className="flex flex-col relative">
                    <label htmlFor="email" className="mb-1">
                      {t("modale.labels.phone")}
                    </label>
                    <div className="flex items-center gap-2">
                      <input
                        id="phone"
                        type="phone"
                        placeholder="Téléphone"
                        {...register("phone", { required: true })}
                        className="w-full p-2 border border-darkBlue/50 rounded-lg"
                      />
                      {errors.email && isSubmitted && (
                        <WarningSvg
                          fillColor="#FF7664"
                          width={22}
                          height={22}
                        />
                      )}
                    </div>
                  </div>

                  {/* Input pour le poste */}
                  <div className="flex flex-col relative">
                    <label htmlFor="post" className="mb-1">
                      {t("modale.labels.post")}
                    </label>
                    <div className="flex items-center gap-2">
                      <input
                        id="post"
                        type="text"
                        placeholder="Poste du salarié"
                        {...register("post", { required: true })}
                        className="w-full p-2 border border-darkBlue/50 rounded-lg"
                      />
                      {errors.post && isSubmitted && (
                        <WarningSvg
                          fillColor="#FF7664"
                          width={22}
                          height={22}
                        />
                      )}
                    </div>
                  </div>
                  {/* Input pour la date de prise de poste */}
                  <div className="flex flex-col relative">
                    <label htmlFor="dateOnPost" className="mb-1">
                      {t("modale.labels.dateOnPost")}
                    </label>
                    <div className="flex items-center gap-2">
                      <input
                        id="dateOnPost"
                        type="date"
                        {...register("dateOnPost", { required: true })}
                        className="w-full p-2 border border-darkBlue/50 rounded-lg"
                      />
                      {errors.dateOnPost && isSubmitted && (
                        <WarningSvg
                          fillColor="#FF7664"
                          width={22}
                          height={22}
                        />
                      )}
                    </div>
                  </div>
                  {/* Input pour la photo de profil */}
                  <div className="flex flex-col relative">
                    <label htmlFor="profilePicture" className="mb-1">
                      {t("modale.labels.profilePicture")}
                    </label>
                    <div className="flex items-center gap-2">
                      <input
                        id="profilePicture"
                        type="file"
                        accept="image/*"
                        {...register("profilePicture")}
                        className="w-full p-2 border border-darkBlue/50 rounded-lg"
                      />
                      {errors.profilePicture && isSubmitted && (
                        <WarningSvg
                          fillColor="#FF7664"
                          width={22}
                          height={22}
                        />
                      )}
                    </div>
                  </div>
                  <div className="flex gap-4 mx-auto">
                    <button
                      disabled={isLoading}
                      type="submit"
                      className="px-4 py-2 rounded-lg bg-blue text-white"
                    >
                      {isLoading ? t("buttons.loading") : t("buttons.save")}
                    </button>

                    <button
                      type="button"
                      onClick={() => {
                        setIsModalOpen(false);
                      }}
                      disabled={isLoading}
                      className="px-4 py-2 rounded-lg text-white bg-red"
                    >
                      {t("buttons.cancel")}
                    </button>
                  </div>
                </form>
              </>
            )}
          </div>
        </div>
      )}
    </section>
  );
}
