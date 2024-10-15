import { useEffect, useState } from "react";

// REACT HOOK FORM
import { useForm } from "react-hook-form";

// AXIOS
import axios from "axios";

// I18N
import { useTranslation } from "next-i18next";

export default function AddRestaurantModal(props) {
  const { t } = useTranslation("admin");
  const [owners, setOwners] = useState([]);
  const [isExistingOwner, setIsExistingOwner] = useState(false);

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm();

  useEffect(() => {
    async function fetchOwners() {
      try {
        const response = await axios.get(
          `${process.env.NEXT_PUBLIC_API_URL}/admin/owners`
        );
        setOwners(response.data.owners);
      } catch (error) {
        console.error("Erreur lors du chargement des propriétaires:", error);
      }
    }

    fetchOwners();
  }, []);

  async function onSubmit(data) {
    const { restaurantData, ownerData, existingOwnerId } = data;

    try {
      const payload = {
        restaurantData,
        ownerData: isExistingOwner ? { existingOwnerId } : ownerData, // Si un propriétaire existant est sélectionné, envoyer son ID
      };

      await axios.post(
        `${process.env.NEXT_PUBLIC_API_URL}/admin/add-restaurant`,
        payload
      );
      props.closeModal();
    } catch (error) {
      console.error("Erreur lors de l'ajout du restaurant:", error);
      alert("Erreur lors de l'ajout du restaurant.");
    }
  }

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex justify-center items-center">
      <div className="bg-white p-8 rounded-lg flex flex-col gap-4 w-[550px]">
        <h2>{t("restaurants.form.add")}</h2>

        <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-4">
          <input
            type="text"
            name="restaurantData.name"
            placeholder={t("restaurants.form.name")}
            {...register("restaurantData.name", { required: true })}
            className={`border p-2  ${errors.restaurantData?.name ? "border-red-500" : ""}`}
          />

          <input
            type="text"
            name="restaurantData.address"
            placeholder={t("restaurants.form.adress")}
            {...register("restaurantData.address", { required: true })}
            className={`border p-2  ${errors.restaurantData?.address ? "border-red-500" : ""}`}
          />

          <input
            type="text"
            name="restaurantData.phone"
            placeholder={t("restaurants.form.phone")}
            {...register("restaurantData.phone", { required: true })}
            className={`border p-2  ${errors.restaurantData?.phone ? "border-red-500" : ""}`}
          />

          <input
            type="text"
            name="restaurantData.website"
            placeholder={t("restaurants.form.web")}
            {...register("restaurantData.website")}
            className="border p-2 "
          />

          <h3>{t("owner.form.infos")}</h3>

          <div className="flex gap-4">
            <label className="flex gap-2">
              <input
                type="radio"
                name="ownerType"
                value="new"
                checked={!isExistingOwner}
                onChange={() => setIsExistingOwner(false)}
              />
              {t("owner.form.createNew")}
            </label>

            <label className="flex gap-2">
              <input
                type="radio"
                name="ownerType"
                value="existing"
                checked={isExistingOwner}
                onChange={() => setIsExistingOwner(true)}
              />
              {t("owner.form.selectExisting")}
            </label>
          </div>

          {isExistingOwner ? (
            <div>
              <select
                name="existingOwnerId"
                {...register("existingOwnerId", { required: true })}
                className={`border p-2  ${errors.existingOwnerId ? "border-red-500" : ""}`}
              >
                <option value="">{t("owner.form.select")}</option>
                {owners.map((owner) => (
                  <option key={owner._id} value={owner._id}>
                    {owner.firstname} {owner.lastname} ({owner.email})
                  </option>
                ))}
              </select>
            </div>
          ) : (
            <div className="flex flex-col gap-4">
              <div className="flex gap-2">
                <input
                  type="text"
                  name="ownerData.firstname"
                  placeholder={t("owner.form.firstname")}
                  {...register("ownerData.firstname", { required: true })}
                  className={`border p-2 w-full  ${errors.ownerData?.firstname ? "border-red-500" : ""}`}
                />

                <input
                  type="text"
                  name="ownerData.lastname"
                  placeholder={t("owner.form.lastname")}
                  {...register("ownerData.lastname", { required: true })}
                  className={`border p-2 w-full ${errors.ownerData?.lastname ? "border-red-500" : ""}`}
                />
              </div>

              <input
                type="text"
                name="ownerData.username"
                placeholder={t("owner.form.username")}
                {...register("ownerData.username", { required: true })}
                className={`border p-2  ${errors.ownerData?.username ? "border-red-500" : ""}`}
              />

              <input
                type="email"
                name="ownerData.email"
                placeholder={t("owner.form.email")}
                {...register("ownerData.email", { required: true })}
                className={`border p-2  ${errors.ownerData?.email ? "border-red-500" : ""}`}
              />

              <input
                type="password"
                name="ownerData.password"
                placeholder={t("owner.form.password")}
                {...register("ownerData.password", { required: true })}
                className={`border p-2  ${errors.ownerData?.password ? "border-red-500" : ""}`}
              />
            </div>
          )}

          <button
            type="submit"
            className="bg-blue text-white px-4 py-2 rounded-lg"
          >
            {t("restaurants.form.buttons.add")}
          </button>

          <button
            type="button"
            onClick={props.closeModal}
            className="bg-red text-white px-4 py-2 rounded-lg"
          >
            {t("restaurants.form.buttons.cancel")}
          </button>
        </form>
      </div>
    </div>
  );
}
