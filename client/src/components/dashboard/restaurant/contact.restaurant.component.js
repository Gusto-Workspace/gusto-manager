import { useEffect, useState } from "react";

// REACT HOOK FORM
import { useForm } from "react-hook-form";

// I18N
import { useTranslation } from "next-i18next";

// SVG
import * as icons from "../../_shared/_svgs/_index";

// DATA
import { contactData } from "@/_assets/data/contact.data";

// AXIOS
import axios from "axios";

// COMPONENTS
import SimpleSkeletonComponent from "../../_shared/skeleton/simple-skeleton.component";
import { Edit, Loader2, Save, XCircle } from "lucide-react";

export default function ContactRestaurantComponent(props) {
  const { t } = useTranslation("restaurant");
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);

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
    setEditing((prev) => !prev);
  }

  async function onSubmit(data) {
    const token = localStorage.getItem("token");
    setSaving(true);
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
        setSaving(false);
      });
  }

  // styles communs
  const sectionCls =
    "bg-white/60 p-2 midTablet:p-6 rounded-2xl border border-darkBlue/10 shadow-sm flex flex-col gap-4 w-full h-fit";
  const fieldCard =
    "group rounded-xl bg-white/70 border border-darkBlue/10 px-4 py-3 flex flex-row items-center justify-between gap-2";
  const labelWrap =
    "flex items-center gap-3 midTablet:min-w-[160px] text-darkBlue";
  const labelText = "font-semibold text-sm whitespace-nowrap";
  const valueText = "text-right text-sm text-darkBlue truncate";
  const inputCls =
    "w-full midTablet:w-1/2 rounded-lg border bg-white px-3 py-2 text-[14px] text-right outline-none transition placeholder:text-darkBlue/40 border-darkBlue/20";
  const inputErrorCls = `${inputCls} border-red`;

  return (
    <section className={sectionCls}>
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex justify-between items-start w-full gap-6">
          <div className="text-balance">
            <h1 className="font-semibold text-lg text-darkBlue">
              {t("contact.title")}
            </h1>
            <p className="text-xs text-darkBlue/60 max-w-md">
              {t(
                "contact.subtitle",
                "Gérez les informations de contact affichées sur votre site."
              )}
            </p>
          </div>
          <div className="flex gap-2">
            {editing && (
              <button
                type="button"
                onClick={() => setEditing(false)}
                disabled={saving}
              >
                {/* Version texte (desktop / mobile large) */}
                <span className="hidden mobile:flex rounded-lg text-white disabled:cursor-none bg-red px-4 py-2 gap-2 items-center transition-opacity duration-150">
                  {t("cancel")}
                </span>

                {/* Version icône seule (mobile) */}
                <span className="mobile:hidden rounded-lg text-white disabled:cursor-none bg-red px-4 py-2 flex gap-2 items-center transition-opacity duration-150">
                  <XCircle className="size-5" />
                </span>
              </button>
            )}

            <button
              type="button"
              onClick={editing ? handleSubmit(onSubmit) : handleToggleEdit}
              disabled={saving}
            >
              {editing ? (
                <span className="rounded-lg text-white bg-blue px-4 py-2 flex gap-2 items-center transition-opacity duration-150">
                  {saving ? (
                    <div className="flex items-center gap-2">
                      <Loader2 className="size-5 mobile:size-4 animate-spin" />
                      <span className="hidden mobile:flex">
                        {t("saving", "En cours…")}
                      </span>
                    </div>
                  ) : (
                    <>
                      <span className="hidden mobile:flex">{t("save")}</span>
                      <span className="mobile:hidden flex">
                        <Save className="size-5" />
                      </span>
                    </>
                  )}
                </span>
              ) : (
                <div className="rounded-lg text-white bg-blue px-4 py-2 flex gap-2 items-center transition-opacity duration-150">
                  <Edit className="size-5" />
                  <span className="hidden mobile:flex">
                    {t("edit", "Éditer")}
                  </span>
                </div>
              )}
            </button>
          </div>
        </div>
      </div>

      <hr className="opacity-10" />

      <form
        onSubmit={handleSubmit(onSubmit)}
        className="flex flex-col gap-3 mt-1"
      >
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
            <div className={fieldCard} key={item.field}>
              {/* Label + icone */}
              <div className={labelWrap}>
                {IconComponent && (
                  <IconComponent
                    width={22}
                    height={22}
                    fillColor="#131E3660"
                    strokeColor="#131E3660"
                  />
                )}
                <h3 className={labelText}>
                  {t(item.label)}
                  {isRequired && editing && (
                    <span className="text-red text-[11px] ml-1">*</span>
                  )}
                </h3>
              </div>

              {/* Valeur ou input */}
              {props.dataLoading ? (
                <div className="w-full midTablet:w-1/2 flex justify-end">
                  <SimpleSkeletonComponent justify="justify-end" />
                </div>
              ) : editing ? (
                <input
                  type="text"
                  {...register(item.field, {
                    required: isRequired ? t("error.required") : false,
                  })}
                  className={errors[item.field] ? inputErrorCls : inputCls}
                  placeholder={!isRequired ? t("emptyInput") : ""}
                />
              ) : (
                <p className={valueText}>
                  {fieldValue ? (
                    fieldValue
                  ) : (
                    <span className="text-xs italic text-darkBlue/50">
                      {t("notUsed")}
                    </span>
                  )}
                </p>
              )}
            </div>
          );
        })}
      </form>
    </section>
  );
}
