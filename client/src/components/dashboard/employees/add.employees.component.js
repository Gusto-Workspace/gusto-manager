import { useState, useContext } from "react";
import { useForm } from "react-hook-form";
import axios from "axios";
import { GlobalContext } from "@/contexts/global.context";
import { useTranslation } from "next-i18next";
import { EmployeesSvg, WarningSvg } from "../../_shared/_svgs/_index";
import { useRouter } from "next/router";

export default function AddEmployeesComponent() {
  const { t } = useTranslation("employees");
  const { restaurantContext } = useContext(GlobalContext);
  const [isLoading, setIsLoading] = useState(false);
  const router = useRouter();

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitted },
  } = useForm();

  async function onSubmit(data) {
    const url = `${process.env.NEXT_PUBLIC_API_URL}/restaurants/${restaurantContext.restaurantData._id}/employees`;
    const formData = new FormData();
    formData.append("lastName", data.lastName);
    formData.append("firstName", data.firstName);
    formData.append("email", data.email);
    formData.append("phone", data.phone);
    formData.append("post", data.post);
    formData.append("dateOnPost", data.dateOnPost);
    formData.append("secuNumber", data.secuNumber);
    formData.append("address", data.address);
    formData.append("emergencyContact", data.emergencyContact);
    if (data.profilePicture?.[0]) {
      formData.append("profilePicture", data.profilePicture[0]);
    }

    setIsLoading(true);
    try {
      const res = await axios.post(url, formData, {
        headers: { "Content-Type": "multipart/form-data" },
      });
      restaurantContext.setRestaurantData(res.data.restaurant);
      reset();
      router.replace('/dashboard/employees')
    } catch (err) {
      console.error("Error creating employee:", err);
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <section className="flex flex-col gap-6">
      <hr className="opacity-20" />

      <div className="flex justify-between flex-wrap gap-4">
        <div className="flex flex-col gap-4">
          <div className="flex items-center gap-2 min-h-[40px]">
            <EmployeesSvg width={30} height={30} fillColor="#131E3690" />

            <h1 className="pl-2 text-xl tablet:text-2xl flex items-center gap-2 flex-wrap">
              <span> {t("employees:titles.main")}</span>
              <span>/</span>
              <span>Ajouter</span>
            </h1>
          </div>
        </div>
      </div>

      <form
        onSubmit={handleSubmit(onSubmit)}
        className="grid grid-cols-2 gap-4"
      >
        {/* Nom */}
        <div className="flex flex-col">
          <label htmlFor="lastName" className="mb-1">
            {t("modale.labels.lastname")}
          </label>
          <div className="flex items-center gap-2">
            <input
              id="lastName"
              type="text"
              {...register("lastName", { required: true })}
              className="w-full p-2 border border-darkBlue/50 rounded-lg"
            />
            {errors.lastName && isSubmitted && (
              <WarningSvg fillColor="#FF7664" width={22} height={22} />
            )}
          </div>
        </div>

        {/* Prénom */}
        <div className="flex flex-col">
          <label htmlFor="firstName" className="mb-1">
            {t("modale.labels.firstname")}
          </label>
          <div className="flex items-center gap-2">
            <input
              id="firstName"
              type="text"
              {...register("firstName", { required: true })}
              className="w-full p-2 border border-darkBlue/50 rounded-lg"
            />
            {errors.firstName && isSubmitted && (
              <WarningSvg fillColor="#FF7664" width={22} height={22} />
            )}
          </div>
        </div>

        {/* Email */}
        <div className="flex flex-col">
          <label htmlFor="email" className="mb-1">
            {t("modale.labels.email")}
          </label>
          <div className="flex items-center gap-2">
            <input
              id="email"
              type="email"
              {...register("email", { required: true })}
              className="w-full p-2 border border-darkBlue/50 rounded-lg"
            />
            {errors.email && isSubmitted && (
              <WarningSvg fillColor="#FF7664" width={22} height={22} />
            )}
          </div>
        </div>

        {/* Téléphone */}
        <div className="flex flex-col">
          <label htmlFor="phone" className="mb-1">
            {t("modale.labels.phone")}
          </label>
          <div className="flex items-center gap-2">
            <input
              id="phone"
              type="text"
              {...register("phone", { required: true })}
              className="w-full p-2 border border-darkBlue/50 rounded-lg"
            />
            {errors.phone && isSubmitted && (
              <WarningSvg fillColor="#FF7664" width={22} height={22} />
            )}
          </div>
        </div>

        {/* Poste */}
        <div className="flex flex-col">
          <label htmlFor="post" className="mb-1">
            {t("modale.labels.post")}
          </label>
          <div className="flex items-center gap-2">
            <input
              id="post"
              type="text"
              {...register("post", { required: true })}
              className="w-full p-2 border border-darkBlue/50 rounded-lg"
            />
            {errors.post && isSubmitted && (
              <WarningSvg fillColor="#FF7664" width={22} height={22} />
            )}
          </div>
        </div>

        {/* Date de prise de poste */}
        <div className="flex flex-col">
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
              <WarningSvg fillColor="#FF7664" width={22} height={22} />
            )}
          </div>
        </div>

        {/* Numéro de SS */}
        <div className="flex flex-col">
          <label htmlFor="secuNumber" className="mb-1">
            {t("modale.labels.secuNumber")}
          </label>
          <div className="flex items-center gap-2">
            <input
              id="secuNumber"
              type="text"
              {...register("secuNumber")}
              className="w-full p-2 border border-darkBlue/50 rounded-lg"
            />
            {errors.secuNumber && isSubmitted && (
              <WarningSvg fillColor="#FF7664" width={22} height={22} />
            )}
          </div>
        </div>

        {/* Rue */}
        <div className="flex flex-col">
          <label htmlFor="address" className="mb-1">
            {t("modale.labels.address")}
          </label>
          <input
            id="address"
            type="text"
            {...register("address")}
            className="w-full p-2 border border-darkBlue/50 rounded-lg"
          />
          {errors.address && isSubmitted && (
            <WarningSvg fillColor="#FF7664" width={22} height={22} />
          )}
        </div>

        {/* Contact urgence */}
        <div className="flex flex-col">
          <label htmlFor="emergencyContact" className="mb-1">
            {t("modale.labels.emergencyContact")}
          </label>
          <input
            id="emergencyContact"
            type="text"
            {...register("emergencyContact")}
            className="w-full p-2 border border-darkBlue/50 rounded-lg"
          />
          {errors.emergencyContact && isSubmitted && (
            <WarningSvg fillColor="#FF7664" width={22} height={22} />
          )}
        </div>

        {/* Photo de profil */}
        <div className="flex flex-col">
          <label htmlFor="profilePicture" className="mb-1">
            {t("modale.labels.profilePicture")}
          </label>
          <input
            id="profilePicture"
            type="file"
            accept=".jpg,.jpeg,.png,.gif,.bmp,.webp"
            {...register("profilePicture")}
            className="w-full p-2 border border-darkBlue/50 rounded-lg"
          />
          {errors.profilePicture && isSubmitted && (
            <WarningSvg fillColor="#FF7664" width={22} height={22} />
          )}
        </div>

        <div className="col-span-2 flex  gap-4 mt-4">
          <button
            type="submit"
            disabled={isLoading}
            className="px-4 py-2 bg-blue text-white rounded-lg"
          >
            {isLoading ? t("buttons.loading") : t("buttons.save")}
          </button>
          
          <button
            type="button"
            onClick={() => router.replace("/dashboard/employees")}
            disabled={isLoading}
            className="px-4 py-2 bg-red text-white rounded-lg"
          >
            {t("buttons.cancel")}
          </button>
        </div>
      </form>
    </section>
  );
}
