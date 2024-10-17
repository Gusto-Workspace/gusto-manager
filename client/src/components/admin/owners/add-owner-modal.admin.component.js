import { useEffect, useState } from "react";

// REACT HOOK FORM
import { useForm } from "react-hook-form";

// AXIOS
import axios from "axios";

// I18N
import { useTranslation } from "next-i18next";

// COMPONENTS
import FormInputComponent from "@/components/_shared/inputs/form-input.component";

export default function AddOwnerModalComponent(props) {
  const { t } = useTranslation("admin");
  const [loading, setLoading] = useState(false);

  const {
    register,
    handleSubmit,
    formState: { errors },
    reset,
  } = useForm();

  useEffect(() => {
    if (props.owner) {
      reset({
        ownerData: {
          firstname: props.owner.firstname,
          lastname: props.owner.lastname,
          email: props.owner.email,
          phoneNumber: props.owner.phoneNumber,
        },
      });
    } else {
      reset();
    }
  }, [props.owner, reset]);

  async function onSubmit(data) {
    const ownerData = data.ownerData;

    try {
      setLoading(true);
      let response;
      if (props.owner) {
        response = await axios.put(
          `${process.env.NEXT_PUBLIC_API_URL}/admin/owners/${props.owner._id}`,
          { ownerData }
        );
        props.handleEditOwner(response.data.owner);
      } else {
        response = await axios.post(
          `${process.env.NEXT_PUBLIC_API_URL}/admin/add-owner`,
          { ownerData }
        );
        props.handleAddOwner(response.data.owner);
      }

      setLoading(false);
      props.closeModal();
    } catch (error) {
      console.error(
        "Erreur lors de l'ajout/mise à jour du propriétaire:",
        error
      );
      alert("Erreur lors de l'ajout/mise à jour du propriétaire.");
      setLoading(false);
    }
  }

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex justify-center items-center">
      <div className="bg-white p-8 rounded-lg flex flex-col gap-4 w-[550px]">
        <h2>{props.owner ? t("owner.form.edit") : t("owner.form.add")}</h2>

        <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-4">
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
            name="ownerData.email"
            placeholder={t("owner.form.email")}
            register={register}
            required={true}
            errors={errors}
          />

          <FormInputComponent
            name="ownerData.phoneNumber"
            placeholder={t("owner.form.phoneNumber")}
            register={register}
            required={true}
            errors={errors}
          />

          {!props.owner && (
            <FormInputComponent
              name="ownerData.password"
              placeholder={t("owner.form.password")}
              register={register}
              required={true}
              errors={errors}
              type="password"
            />
          )}

          <button
            type="submit"
            disabled={loading}
            className="bg-blue text-white px-4 py-2 rounded-lg"
          >
            {loading
              ? t("buttons.loading")
              : props.owner
                ? t("owner.list.buttons.edit")
                : t("owner.list.buttons.add")}
          </button>

          <button
            type="button"
            onClick={props.closeModal}
            className="bg-red text-white px-4 py-2 rounded-lg"
          >
            {t("owner.list.buttons.cancel")}
          </button>
        </form>
      </div>
    </div>
  );
}
