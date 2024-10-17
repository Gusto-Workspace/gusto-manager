import { useEffect, useState } from "react";

// REACT HOOK FORM
import { useForm } from "react-hook-form";

// AXIOS
import axios from "axios";

// I18N
import { useTranslation } from "next-i18next";

// COMPONENTS
import FormInputComponent from "@/components/_shared/inputs/form-input.component";

export default function AddRestaurantModal(props) {
  const { t } = useTranslation("admin");

  const [owners, setOwners] = useState([]);
  const [loading, setLoading] = useState(false);

  const {
    register,
    handleSubmit,
    formState: { errors },
    reset,
    setValue,
    watch,
  } = useForm();

  useEffect(() => {
    async function fetchOwners() {
      try {
        const response = await axios.get(
          `${process.env.NEXT_PUBLIC_API_URL}/admin/owners`
        );
        setOwners(response.data.owners);

        if (props.restaurant && props.restaurant.owner_id) {
          setValue("existingOwnerId", props.restaurant.owner_id._id);
        }
      } catch (error) {
        console.error("Erreur lors du chargement des propriétaires:", error);
      }
    }

    fetchOwners();

    if (props.restaurant) {
      reset({
        restaurantData: {
          name: props.restaurant.name,
          address: props.restaurant.address,
          phone: props.restaurant.phone,
          website: props.restaurant.website,
        },
      });
    } else {
      reset();
      props.setIsExistingOwner(false);
    }
  }, [props.restaurant, reset, setValue]);

  useEffect(() => {
    if (props.restaurant && props.restaurant.owner_id) {
      setValue("existingOwnerId", props.restaurant.owner_id._id);
    }
  }, [owners, props.restaurant, setValue]);

  async function onSubmit(data) {
    const restaurantData = data.restaurantData;
    let ownerData = null;
    let existingOwnerId = null;

    if (props.isExistingOwner) {
      existingOwnerId = data.existingOwnerId;
    } else {
      ownerData = data.ownerData;
    }

    try {
      setLoading(true);

      const payload = {
        restaurantData,
        ownerData,
        existingOwnerId,
      };

      let response;
      if (props.restaurant) {
        response = await axios.put(
          `${process.env.NEXT_PUBLIC_API_URL}/admin/restaurants/${props.restaurant._id}`,
          payload
        );
        props.handleEditRestaurant(response.data.restaurant);
      } else {
        response = await axios.post(
          `${process.env.NEXT_PUBLIC_API_URL}/admin/add-restaurant`,
          payload
        );
        props.handleAddRestaurant(response.data.restaurant);
      }

      setLoading(false);
      props.closeModal();
    } catch (error) {
      console.error("Erreur lors de l'ajout/mise à jour du restaurant:", error);
      alert("Erreur lors de l'ajout/mise à jour du restaurant.");
    }
  }

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex justify-center items-center">
      <div className="bg-white p-8 rounded-lg flex flex-col gap-4 w-[550px]">
        <h2>
          {props.restaurant
            ? t("restaurants.form.edit")
            : t("restaurants.form.add")}
        </h2>

        <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-4">
          <FormInputComponent
            name="restaurantData.name"
            placeholder={t("restaurants.form.name")}
            register={register}
            required={true}
            errors={errors}
          />

          <FormInputComponent
            name="restaurantData.address"
            placeholder={t("restaurants.form.adress")}
            register={register}
            required={true}
            errors={errors}
          />

          <FormInputComponent
            name="restaurantData.phone"
            placeholder={t("restaurants.form.phone")}
            register={register}
            required={true}
            errors={errors}
          />

          <FormInputComponent
            name="restaurantData.website"
            placeholder={t("restaurants.form.web")}
            register={register}
            required={true}
            errors={errors}
          />

          <h3>{t("owner.form.infos")}</h3>

          <div className="flex gap-4">
            <label className="flex gap-2">
              <input
                type="radio"
                name="ownerType"
                value="new"
                checked={!props.isExistingOwner}
                onChange={() => props.setIsExistingOwner(false)}
              />
              {t("owner.form.createNew")}
            </label>

            <label className="flex gap-2">
              <input
                type="radio"
                name="ownerType"
                value="existing"
                checked={props.isExistingOwner}
                onChange={() => props.setIsExistingOwner(true)}
              />
              {t("owner.form.selectExisting")}
            </label>
          </div>

          {props.isExistingOwner ? (
            <div className="w-full">
              <select
                name="existingOwnerId"
                {...register("existingOwnerId", { required: true })}
                value={watch("existingOwnerId") || ""}
                onChange={(e) => setValue("existingOwnerId", e.target.value)}
                className={`w-full border p-2 rounded-lg ${errors.existingOwnerId ? "border-red" : ""}`}
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
                <FormInputComponent
                  name="ownerData.firstname"
                  placeholder={t("owner.form.firstname")}
                  register={register}
                  required={true}
                  errors={errors}
                />

                <FormInputComponent
                  name="ownerData.lastname"
                  placeholder={t("owner.form.lastname")}
                  register={register}
                  required={true}
                  errors={errors}
                />
              </div>

              <FormInputComponent
                name="ownerData.phoneNumber"
                placeholder={t("owner.form.phoneNumber")}
                register={register}
                required={true}
                errors={errors}
              />

              <FormInputComponent
                name="ownerData.email"
                placeholder={t("owner.form.email")}
                register={register}
                required={true}
                errors={errors}
              />

              <FormInputComponent
                name="ownerData.password"
                placeholder={t("owner.form.password")}
                register={register}
                required={true}
                errors={errors}
                type="password"
              />
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="bg-blue text-white px-4 py-2 rounded-lg"
          >
            {loading
              ? t("buttons.loading")
              : props.restaurant
                ? t("restaurants.form.buttons.edit")
                : t("restaurants.form.buttons.add")}
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
