import { useEffect, useState } from "react";

// REACT HOOK FORM
import { useForm } from "react-hook-form";

// I18N
import { useTranslation } from "next-i18next";

// SVG
import { EditSvg } from "../_shared/_svgs/_index";
import * as icons from "../_shared/_svgs/_index";

// DATA
import { contactData } from "@/_assets/data/contact.data";

// AXIOS
import axios from "axios";

// COMPONENTS
import SimpleSkeletonComponent from "../_shared/skeleton/simple-skeleton.component";

export default function ContactRestaurantComponent(props) {
  const { t } = useTranslation("restaurant");
  const [editing, setEditing] = useState(false);

  const {
    register,
    handleSubmit,
    formState: { errors },
    reset,
  } = useForm({
    defaultValues: getDefaultValues(props.restaurantData),
  });

  useEffect(() => {
    if (props.restaurantData) {
      reset(getDefaultValues(props.restaurantData));
    }
  }, [props.restaurantData, reset]);

  useEffect(() => {
    if (props.closeEditing) {
      setEditing(false);
    }
  }, [props.closeEditing]);

  function handleToggleEdit() {
    setEditing(!editing);
  }

  function getDefaultValues(data) {
    return {
      address: {
        line1: data?.address?.line1 || "",
        zipCode: data?.address?.zipCode || "",
        city: data?.address?.city || "",
        country: data?.address?.country || "France",
      },
      email: data?.email || "",
      phone: data?.phone || "",
      facebook: data?.social_media?.facebook || "",
      instagram: data?.social_media?.instagram || "",
      youtube: data?.social_media?.youtube || "",
      linkedIn: data?.social_media?.linkedIn || "",
      twitter: data?.social_media?.twitter || "",
    };
  }

  async function onSubmit(data) {
    const token = localStorage.getItem("token");

    axios
      .put(
        `${process.env.NEXT_PUBLIC_API_URL}/owner/restaurants/${props.restaurantId}/contact`,
        {
          address: {
            line1: data.address.line1,
            zipCode: data.address.zipCode,
            city: data.address.city,
            country: data.address.country,
          },
          email: data.email,
          phone: data.phone,
          social_media: {
            facebook: data.facebook,
            instagram: data.instagram,
            youtube: data.youtube,
            linkedIn: data.linkedIn,
            twitter: data.twitter,
          },
        },
        {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        }
      )
      .then((response) => {
        props.handleUpdateData(response.data.restaurant);
      })
      .catch((error) => {
        console.error(
          "Erreur lors de la mise à jour des informations de contact :",
          error
        );
      })
      .finally(() => {
        setEditing(false);
      });
  }

  return (
    <div className="bg-white p-6 pb-3 rounded-lg drop-shadow-sm w-full desktop:w-1/2 h-fit">
      <div className="flex gap-6 flex-wrap justify-between">
        <h1 className="font-bold text-lg">{t("contact.title")}</h1>

        <div className="flex gap-2">
          {editing && (
            <button onClick={handleToggleEdit}>
              <span className="text-white bg-red px-4 py-2 rounded-lg">
                {t("cancel")}
              </span>
            </button>
          )}

          <button onClick={editing ? handleSubmit(onSubmit) : handleToggleEdit}>
            {editing ? (
              <span className="text-white bg-blue px-4 py-2 rounded-lg">
                {t("save")}
              </span>
            ) : (
              <div className="hover:opacity-100 opacity-20 p-[4px] rounded-full transition-opacity duration-300">
                <EditSvg
                  width={20}
                  height={20}
                  strokeColor="#131E36"
                  fillColor="#131E36"
                />
              </div>
            )}
          </button>
        </div>
      </div>

      <hr className="opacity-20 mt-6 mb-4" />

      <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-2">
        {contactData.map((item) => {
          const IconComponent = icons[item.icon];
          const isRequired = item.required;

          let fieldValue;

          if (item.field.startsWith("address.")) {
            const addressPart = item.field.split(".")[1];
            fieldValue = props.restaurantData?.address?.[addressPart];
          } else {
            fieldValue =
              props.restaurantData?.social_media?.[item.field] ||
              props.restaurantData?.[item.field];
          }

          return (
            <div
              className={`flex ${editing ? "flex-col midTablet:flex-row mb-4" : "flex-row h-12 items-center"}  justify-between gap-2 midTablet:gap-12 `}
              key={item.field}
            >
              <div className="flex items-center gap-3 midTablet:w-[150px]">
                {IconComponent && (
                  <IconComponent
                    width={25}
                    height={25}
                    fillColor="#131E3660"
                    strokeColor="#131E3660"
                  />
                )}
                <h3 className="flex items-center font-semibold whitespace-nowrap">
                  {t(item.label)}
                </h3>
              </div>

              {props.dataLoading ? (
                <SimpleSkeletonComponent justify="justify-end" />
              ) : editing ? (
                <input
                  type="text"
                  {...register(item.field, {
                    required: isRequired ? t("error.required") : false,
                  })}
                  className={`border p-1 rounded-lg w-full midTablet:w-1/2 ${
                    errors[item.field] ? "border-red" : ""
                  }`}
                  placeholder={!isRequired ? t("emptyInput") : ""}
                />
              ) : (
                <p className="text-right truncate max-w-[120px] mobile:max-w-[40%]">
                  {fieldValue || (
                    <span className="text-sm italic">{t("notUsed")}</span>
                  )}
                </p>
              )}
            </div>
          );
        })}
      </form>
    </div>
  );
}
