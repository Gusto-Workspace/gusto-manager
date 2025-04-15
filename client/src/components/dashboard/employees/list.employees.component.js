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
import { EmployeesSvg } from "../../_shared/_svgs/_index";
import CardEmployeesComponent from "./card.employees.component";

export default function ListEmployeesComponent(props) {
  const { t } = useTranslation("employees");
  const { restaurantContext } = useContext(GlobalContext);
  const router = useRouter();
  const { locale } = router;

  const [searchTerm, setSearchTerm] = useState("");
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm();

  function handleSearchChange(event) {
    setSearchTerm(event.target.value);
  }

  function handleDeleteClick(employee) {
    const confirmDelete = window.confirm(
      "Êtes-vous sûr de vouloir supprimer cet employé ?"
    );
    if (!confirmDelete) return;

    const deleteUrl = `${process.env.NEXT_PUBLIC_API_URL}/restaurants/${restaurantContext.restaurantData._id}/employees/${employee._id}`;

    axios
      .delete(deleteUrl)
      .then((response) => {
        console.log("Employee deleted:", response.data);
        // Met à jour les données dans le contexte avec les données renvoyées par l'API
        restaurantContext.setRestaurantData(response.data.restaurant);
      })
      .catch((error) => {
        console.error("Error deleting employee:", error);
      });
  }

  function onSubmit(data) {
    const apiUrl = `${process.env.NEXT_PUBLIC_API_URL}/restaurants/${restaurantContext?.restaurantData?._id}/employees`;

    const formData = new FormData();
    formData.append("lastName", data.lastName);
    formData.append("firstName", data.firstName);
    formData.append("email", data.email);
    formData.append("post", data.post);
    formData.append("dateOnPost", data.dateOnPost);

    if (data.profilePicture && data.profilePicture[0]) {
      formData.append("profilePicture", data.profilePicture[0]);
    }

    axios
      .post(apiUrl, formData, {
        headers: {
          "Content-Type": "multipart/form-data",
        },
      })
      .then((response) => {
        restaurantContext.setRestaurantData(response.data.restaurant);
        setIsModalOpen(false);
        reset();
      })
      .catch((error) => {
        console.error("Error creating employee:", error);
      });
  }

  return (
    <section className="flex flex-col gap-6">
      <hr className="opacity-20" />

      <div className="flex gap-4 flex-wrap justify-between">
        <div className="flex gap-2 items-center min-h-[40px]">
          <EmployeesSvg
            width={30}
            height={30}
            className="min-h-[30px] min-w-[30px]"
            fillColor="#131E3690"
          />

          <h1 className="pl-2 py-1 text-xl tablet:text-2xl">
            {t("employees:titles.main")}
          </h1>
        </div>

        <button
          onClick={() => {
            setIsModalOpen(true);
          }}
          className="bg-blue px-6 py-2 rounded-lg text-white cursor-pointer"
        >
          {t("buttons.addEmployee")}
        </button>
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

      <div className="my-12 grid grid-cols-1 tablet:grid-cols-3 desktop:grid-cols-4 ultraWild:grid-cols-5 gap-x-6 gap-y-12">
        {restaurantContext.restaurantData.employees.map((employee, i) => {
          return (
            <CardEmployeesComponent
              key={i}
              employee={employee}
              handleDeleteClick={handleDeleteClick}
            />
          );
        })}
      </div>

      {isModalOpen && (
        <div className="fixed inset-0 flex items-center mx-6 justify-center z-[100]">
          <div
            onClick={() => {
              setIsModalOpen(false);
              setIsDeleting(false);
            }}
            className="fixed inset-0 bg-black bg-opacity-20"
          />

          <div className="bg-white p-6 rounded-lg shadow-lg w-[450px] z-10">
            <h2 className="text-xl font-semibold mb-6 text-center">
              {isDeleting
                ? t("buttons.deleteEmployee")
                : t("buttons.addEmployee")}
            </h2>

            <form
              onSubmit={handleSubmit(onSubmit)}
              className="flex flex-col gap-4"
            >
              {/* Input pour le nom de famille */}
              <div className="flex flex-col">
                <label htmlFor="lastName" className="mb-1">
                  Nom
                </label>
                <input
                  id="lastName"
                  type="text"
                  placeholder="Nom"
                  {...register("lastName", { required: true })}
                  className="p-2 border border-darkBlue/50 rounded-lg"
                />
                {errors.lastName && (
                  <span className="text-red">Ce champ est obligatoire</span>
                )}
              </div>

              {/* Input pour le prénom */}
              <div className="flex flex-col">
                <label htmlFor="firstName" className="mb-1">
                  Prénom
                </label>
                <input
                  id="firstName"
                  type="text"
                  placeholder="Prénom"
                  {...register("firstName", { required: true })}
                  className="p-2 border border-darkBlue/50 rounded-lg"
                />
                {errors.firstName && (
                  <span className="text-red">Ce champ est obligatoire</span>
                )}
              </div>

              {/* Input pour l'email */}
              <div className="flex flex-col">
                <label htmlFor="email" className="mb-1">
                  Email
                </label>
                <input
                  id="email"
                  type="email"
                  placeholder="Email"
                  {...register("email", { required: true })}
                  className="p-2 border border-darkBlue/50 rounded-lg"
                />
                {errors.email && (
                  <span className="text-red">Ce champ est obligatoire</span>
                )}
              </div>

              {/* Input pour le poste */}
              <div className="flex flex-col">
                <label htmlFor="post" className="mb-1">
                  Poste
                </label>
                <input
                  id="post"
                  type="text"
                  placeholder="Poste du salarié"
                  {...register("post", { required: true })}
                  className="p-2 border border-darkBlue/50 rounded-lg"
                />
                {errors.post && (
                  <span className="text-red">Ce champ est obligatoire</span>
                )}
              </div>

              {/* Input pour la date de prise de poste */}
              <div className="flex flex-col">
                <label htmlFor="dateOnPost" className="mb-1">
                  Date de prise de poste
                </label>
                <input
                  id="dateOnPost"
                  type="date"
                  {...register("dateOnPost", { required: true })}
                  className="p-2 border border-darkBlue/50 rounded-lg"
                />
                {errors.dateOnPost && (
                  <span className="text-red">Ce champ est obligatoire</span>
                )}
              </div>

              {/* Input pour la photo de profil */}
              <div className="flex flex-col">
                <label htmlFor="profilePicture" className="mb-1">
                  Photo de profil
                </label>
                <input
                  id="profilePicture"
                  type="file"
                  accept="image/*"
                  {...register("profilePicture")}
                  className="p-2 border border-darkBlue/50 rounded-lg"
                />
                {errors.profilePicture && (
                  <span className="text-red">Ce champ est obligatoire</span>
                )}
              </div>

              <div className="flex gap-4 mx-auto">
                <button
                  type="submit"
                  className="px-4 py-2 rounded-lg bg-blue text-white"
                >
                  {isDeleting ? t("buttons.confirm") : t("buttons.save")}
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setIsModalOpen(false);
                    setIsDeleting(false);
                  }}
                  className="px-4 py-2 rounded-lg text-white bg-red"
                >
                  {t("buttons.cancel")}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </section>
  );
}
