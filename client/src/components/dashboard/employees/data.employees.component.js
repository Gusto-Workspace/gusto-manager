// SVG
import { AvatarSvg } from "@/components/_shared/_svgs/avatar.svg";
import { EditSvg } from "@/components/_shared/_svgs/edit.svg";

// I18N
import { useTranslation } from "next-i18next";

// ICONS LUCIDE
import {
  User,
  Briefcase,
  CalendarDays,
  Mail,
  Phone,
  Shield,
  Home,
  PhoneCall,
  Loader2,
} from "lucide-react";

export default function DataEmployeesComponent(props) {
  const { t } = useTranslation("employees");

  const { employee, isEditing } = props || {};

  // styles communs (alignés avec les autres forms)
  const cardWrap =
    "group relative rounded-xl bg-white/60   px-4 py-3 border border-darkBlue/10 transition-shadow";
  const labelCls =
    "flex items-center gap-2 text-xs font-medium text-darkBlue/60 mb-1";
  const valueCls = "text-sm text-darkBlue";
  const inputBase =
    "h-10 w-full rounded-lg border bg-white px-3 text-[15px] outline-none transition placeholder:text-darkBlue/40";
  const inputNormal = `${inputBase} border-darkBlue/20`;

  // format date pour l'affichage
  const formattedDateOnPost = employee?.dateOnPost
    ? new Date(employee.dateOnPost).toLocaleDateString("fr-FR")
    : "—";

  const fields = [
    {
      key: "post",
      label: t("labels.post"),
      value: employee?.post || "—",
      icon: <Briefcase className="size-4" />,
      type: "text",
      required: true,
    },
    {
      key: "dateOnPost",
      label: t("labels.dateOnPost"),
      value: formattedDateOnPost,
      icon: <CalendarDays className="size-4" />,
      type: "date",
      required: true,
      defaultRaw: employee?.dateOnPost?.slice(0, 10) || "",
    },
    {
      key: "email",
      label: t("labels.email"),
      value: employee?.email || "—",
      icon: <Mail className="size-4" />,
      type: "email",
      required: true,
    },
    {
      key: "phone",
      label: t("labels.phone"),
      value: employee?.phone || "—",
      icon: <Phone className="size-4" />,
      type: "text",
      required: true,
    },
    {
      key: "secuNumber",
      label: t("labels.secuNumber"),
      value: employee?.secuNumber || "—",
      icon: <Shield className="size-4" />,
      type: "text",
      required: false,
    },
    {
      key: "address",
      label: t("labels.address"),
      value: employee?.address || "—",
      icon: <Home className="size-4" />,
      type: "text",
      required: false,
    },
    {
      key: "emergencyContact",
      label: t("labels.emergencyContact"),
      value: employee?.emergencyContact || "—",
      icon: <PhoneCall className="size-4" />,
      type: "text",
      required: false,
    },
  ];

  return (
    <section className="bg-white/60   p-2 midTablet:p-6 rounded-2xl border border-darkBlue/10 shadow-sm flex flex-col midTablet:flex-row justify-between items-start gap-6 relative">
      {/* Bouton éditer (mode vue uniquement) */}
      {!isEditing && (
        <button
          className="absolute z-10 right-3 top-3 p-1.5 rounded-full hover:bg-darkBlue/5 transition"
          onClick={(e) => {
            e.stopPropagation();
            props?.setIsEditing(true);
          }}
        >
          <EditSvg
            width={18}
            height={18}
            strokeColor="#131E36"
            fillColor="#131E36"
          />
        </button>
      )}

      <form
        onSubmit={props?.handleDetailsSubmit(props?.onSaveDetails)}
        className="flex flex-col-reverse midTablet:flex-row justify-between items-start w-full gap-6"
      >
        {/* PARTIE GAUCHE : infos employé */}
        <div className="flex flex-col gap-3 w-full midTablet:w-[85%]">
          {/* Nom + prénom dans une carte dédiée */}
          <div className={`${cardWrap}`}>
            <div className={labelCls}>
              <User className="size-4" />
              {t("Prénom & nom")}
            </div>

            {isEditing ? (
              <div className="flex flex-col mobile:flex-row gap-2">
                <input
                  {...props?.regDetails("firstname", { required: true })}
                  disabled={props?.isSavingDetails}
                  placeholder={t("labels.firstname")}
                  className={inputNormal}
                />
                <input
                  {...props?.regDetails("lastname", { required: true })}
                  disabled={props?.isSavingDetails}
                  placeholder={t("labels.lastname")}
                  className={inputNormal}
                />
              </div>
            ) : (
              <p className="text-lg font-semibold text-darkBlue">
                {employee?.firstname} {employee?.lastname}
              </p>
            )}
          </div>

          {/* Autres champs dans une grille */}
          <div className="grid grid-cols-1 mobile:grid-cols-2 gap-3">
            {fields.map((f) => {
              const isRequired = f.required;
              const defaultValue =
                f.key === "dateOnPost"
                  ? (f.defaultRaw ?? "")
                  : (employee && employee[f.key]) || "";

              return (
                <div key={f.key} className={cardWrap}>
                  <div className={labelCls}>
                    {f.icon}
                    {f.label}
                    {isRequired && isEditing && (
                      <span className="text-red text-[10px] ml-1">*</span>
                    )}
                  </div>

                  {isEditing ? (
                    <input
                      type={f.type}
                      {...props?.regDetails(f.key, { required: isRequired })}
                      disabled={props?.isSavingDetails}
                      className={inputNormal}
                      defaultValue={defaultValue}
                    />
                  ) : (
                    <p className={valueCls}>{f.value || "—"}</p>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* PARTIE DROITE : photo */}
        <div className="relative flex flex-col items-center gap-2 w-full midTablet:w-auto">
          <div className="relative w-40 h-40 midTablet:w-36 midTablet:h-36 flex-shrink-0 mx-auto midTablet:mx-0 rounded-full overflow-hidden border border-darkBlue/15 bg-white/70 shadow-sm">
            {props?.previewUrl ? (
              <img
                src={props?.previewUrl}
                alt="aperçu"
                className="w-full h-full object-cover"
              />
            ) : (
              <div className="flex items-center justify-center w-full h-full bg-lightGrey/60">
                <AvatarSvg width={40} height={40} fillColor="#131E3690" />
              </div>
            )}

            {isEditing && !props?.isSavingDetails && (
              <div
                className="absolute inset-0 bg-black/0 hover:bg-black/40 transition flex items-center justify-center cursor-pointer"
                onClick={() => props?.fileInputRef.current?.click()}
              >
                <EditSvg
                  width={26}
                  height={26}
                  strokeColor="#ffffff"
                  fillColor="#ffffff"
                />
              </div>
            )}
          </div>

          {!isEditing && employee?.profilePicture?.url && (
            <p className="text-[11px] text-darkBlue/50">
              {t("labels.profilePicture") || "Photo de profil"}
            </p>
          )}

          <input
            ref={props?.fileInputRef}
            type="file"
            accept=".jpg,.jpeg,.png,.webp"
            className="hidden"
            disabled={props?.isSavingDetails}
            onChange={props?.handleFileSelect}
          />
        </div>
      </form>

      {/* Boutons en mode édition */}
      {isEditing && (
        <div className="midTablet:absolute bottom-4 right-4 flex flex-col gap-2 w-full midTablet:w-auto midTablet:flex-row">
          <button
            type="button"
            disabled={props?.isSavingDetails}
            onClick={() => {
              props.resetDetails({
                firstname: employee?.firstname,
                lastname: employee?.lastname,
                post: employee?.post,
                dateOnPost: employee?.dateOnPost?.slice(0, 10),
                email: employee?.email,
                phone: employee?.phone,
                secuNumber: employee?.secuNumber,
                address: employee?.address,
                emergencyContact: employee?.emergencyContact,
              });
              props?.setProfileFile(null);
              props?.setPreviewUrl(employee?.profilePicture?.url || null);
              props?.setIsEditing(false);
            }}
            className="px-4 py-2 rounded-lg bg-red text-white text-sm font-medium disabled:opacity-50"
          >
            {t("buttons.cancel")}
          </button>

          <button
            type="submit"
            onClick={props?.handleDetailsSubmit(props?.onSaveDetails)}
            disabled={
              (!props?.detailsDirty && !props?.profileFile) ||
              props?.isSavingDetails
            }
            className="px-4 py-2 rounded-lg bg-blue text-white text-sm font-medium disabled:opacity-40"
          >
            {props?.isSavingDetails ? (
              <div className="flex items-center gap-2">
                <Loader2 className="size-4 animate-spin" />
                <span>En cours…</span>
              </div>
            ) : (
              t("buttons.save")
            )}
          </button>
        </div>
      )}
    </section>
  );
}
