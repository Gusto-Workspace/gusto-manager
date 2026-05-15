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

const CONTRACT_TYPE_OPTIONS = [
  { value: "", label: "Type de contrat" },
  { value: "CDI", label: "CDI" },
  { value: "CDD", label: "CDD" },
  { value: "Extra", label: "Extra" },
  { value: "Intérim", label: "Intérim" },
  { value: "Alternance", label: "Alternance" },
  { value: "Stage", label: "Stage" },
];

const CONTRACT_UNIT_OPTIONS = [
  { value: "week", label: "h / semaine" },
  { value: "month", label: "h / mois" },
];

function formatContractualLabel(employment = {}) {
  const value = employment?.contractualValue;
  const unit = employment?.contractualUnit || "";

  if (!value && !unit) return "—";
  if (!unit) return `${value || 0} h`;
  if (unit === "week") return `${value || 0} h / semaine`;
  if (unit === "month") return `${value || 0} h / mois`;
  return `${value || 0} ${unit}`.trim();
}

export default function DataEmployeesComponent(props) {
  const { t } = useTranslation("employees");

  const {
    employee,
    currentSnapshot,
    currentEmployment,
    isEditing,
    setIsEditing,
    handleDetailsSubmit,
    onSaveDetails,
    regDetails,
    isSavingDetails,
    previewUrl,
    resetDetails,
    detailsDirty,
  } = props || {};

  // On fusionne snapshot + global (snapshot prioritaire)
  const merged = {
    firstname: currentSnapshot?.firstname ?? employee?.firstname ?? "",
    lastname: currentSnapshot?.lastname ?? employee?.lastname ?? "",
    email: currentSnapshot?.email ?? employee?.email ?? "",
    phone: currentSnapshot?.phone ?? employee?.phone ?? "",
    secuNumber: currentSnapshot?.secuNumber ?? employee?.secuNumber ?? "",
    address: currentSnapshot?.address ?? employee?.address ?? "",
    emergencyContact:
      currentSnapshot?.emergencyContact ?? employee?.emergencyContact ?? "",
    post: currentSnapshot?.post ?? employee?.post ?? "",
    dateOnPost: currentSnapshot?.dateOnPost ?? employee?.dateOnPost ?? null,
    contractType: currentEmployment?.contractType ?? employee?.employment?.contractType ?? "",
    contractualValue:
      currentEmployment?.contractualValue ??
      employee?.employment?.contractualValue ??
      "",
    contractualUnit:
      currentEmployment?.contractualUnit ??
      employee?.employment?.contractualUnit ??
      "",
  };

  // format date pour l'affichage (en lecture seule)
  const formattedDateOnPost = merged.dateOnPost
    ? new Date(merged.dateOnPost).toLocaleDateString("fr-FR")
    : "—";

  const cardWrap =
    "group relative rounded-xl bg-white/60 px-4 py-3 border border-darkBlue/10 transition-shadow";
  const labelCls =
    "flex items-center gap-2 text-xs font-medium text-darkBlue/60 mb-1";
  const valueCls = "text-sm text-darkBlue";
  const inputBase =
    "h-10 w-full rounded-lg border bg-white px-3 text-[15px] outline-none transition placeholder:text-darkBlue/40";
  const inputNormal = `${inputBase} border-darkBlue/20`;

  const fields = [
    {
      key: "post",
      label: t("labels.post"),
      value: merged.post || "—",
      icon: <Briefcase className="size-4" />,
      type: "text",
      required: true,
      defaultValue: merged.post || "",
    },
    {
      key: "dateOnPost",
      label: t("labels.dateOnPost"),
      value: formattedDateOnPost,
      icon: <CalendarDays className="size-4" />,
      type: "date",
      required: true,
      defaultValue: merged.dateOnPost
        ? String(merged.dateOnPost).slice(0, 10)
        : "",
    },
    {
      key: "email",
      label: t("labels.email"),
      value: merged.email || "—",
      icon: <Mail className="size-4" />,
      type: "email",
      required: true,
      defaultValue: merged.email || "",
    },
    {
      key: "phone",
      label: t("labels.phone"),
      value: merged.phone || "—",
      icon: <Phone className="size-4" />,
      type: "text",
      required: true,
      defaultValue: merged.phone || "",
    },
    {
      key: "secuNumber",
      label: t("labels.secuNumber"),
      value: merged.secuNumber || "—",
      icon: <Shield className="size-4" />,
      type: "text",
      required: false,
      defaultValue: merged.secuNumber || "",
    },
    {
      key: "address",
      label: t("labels.address"),
      value: merged.address || "—",
      icon: <Home className="size-4" />,
      type: "text",
      required: false,
      defaultValue: merged.address || "",
    },
    {
      key: "emergencyContact",
      label: t("labels.emergencyContact"),
      value: merged.emergencyContact || "—",
      icon: <PhoneCall className="size-4" />,
      type: "text",
      required: false,
      defaultValue: merged.emergencyContact || "",
    },
  ];

  // URL finale de l'avatar (toujours en mode vue)
  const avatarUrl = previewUrl || employee?.profilePicture?.url || null;

  return (
    <section className="bg-white/60 p-2 midTablet:p-6 rounded-2xl border border-darkBlue/10 shadow-sm flex flex-col midTablet:flex-row justify-between items-start gap-6 relative">
      {/* Bouton éditer (mode vue uniquement) */}
      {!isEditing && (
        <button
          className="absolute z-10 right-3 top-3 p-1.5 rounded-full hover:bg-darkBlue/5 transition"
          onClick={(e) => {
            e.stopPropagation();
            setIsEditing?.(true);
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
        onSubmit={handleDetailsSubmit(onSaveDetails)}
        className="flex flex-col-reverse midTablet:flex-row justify-between items-start w-full gap-6"
      >
        {/* PARTIE GAUCHE : infos employé */}
        <div className="flex flex-col gap-3 w-full midTablet:w-[85%]">
          {/* Nom + prénom */}
          <div className={cardWrap}>
            <div className={labelCls}>
              <User className="size-4" />
              {t("Prénom & nom")}
            </div>

            {isEditing ? (
              <div className="flex flex-col mobile:flex-row gap-2">
                <input
                  {...regDetails("firstname", { required: true })}
                  defaultValue={merged.firstname}
                  disabled={isSavingDetails}
                  placeholder={t("labels.firstname")}
                  className={inputNormal}
                />
                <input
                  {...regDetails("lastname", { required: true })}
                  defaultValue={merged.lastname}
                  disabled={isSavingDetails}
                  placeholder={t("labels.lastname")}
                  className={inputNormal}
                />
              </div>
            ) : (
              <p className="text-lg font-semibold text-darkBlue">
                {merged.firstname} {merged.lastname}
              </p>
            )}
          </div>

            {/* Autres champs dans une grille */}
          <div className="grid grid-cols-1 mobile:grid-cols-2 gap-3">
            <div className={cardWrap}>
              <div className={labelCls}>
                <Briefcase className="size-4" />
                Type de contrat
              </div>

              {isEditing ? (
                <select
                  {...regDetails("contractType")}
                  defaultValue={merged.contractType || ""}
                  disabled={isSavingDetails}
                  className={inputNormal}
                >
                  {CONTRACT_TYPE_OPTIONS.map((option) => (
                    <option key={option.value || "empty"} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              ) : (
                <p className={valueCls}>{merged.contractType || "—"}</p>
              )}
            </div>

            <div className={cardWrap}>
              <div className={labelCls}>
                <CalendarDays className="size-4" />
                Temps contractuel
              </div>

              {isEditing ? (
                <div className="flex flex-col gap-2">
                  <input
                    type="number"
                    min="0"
                    step="0.5"
                    {...regDetails("contractualValue")}
                    defaultValue={
                      merged.contractualValue || merged.contractualValue === 0
                        ? String(merged.contractualValue || "")
                        : ""
                    }
                    disabled={isSavingDetails}
                    className={inputNormal}
                    placeholder="Ex. 35"
                  />

                  <select
                    {...regDetails("contractualUnit")}
                    defaultValue={merged.contractualUnit || ""}
                    disabled={isSavingDetails}
                    className={inputNormal}
                  >
                    <option value="" disabled hidden>
                      Sélectionner
                    </option>
                    {CONTRACT_UNIT_OPTIONS.map((option) => (
                      <option
                        key={option.value || "empty"}
                        value={option.value}
                      >
                        {option.label}
                      </option>
                    ))}
                  </select>
                </div>
              ) : (
                <p className={valueCls}>
                  {formatContractualLabel({
                    contractualValue: merged.contractualValue,
                    contractualUnit: merged.contractualUnit,
                  })}
                </p>
              )}
            </div>

            {fields.map((f) => {
              const isRequired = f.required;

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
                      {...regDetails(f.key, { required: isRequired })}
                      defaultValue={f.defaultValue}
                      disabled={isSavingDetails}
                      className={inputNormal}
                    />
                  ) : (
                    <p className={valueCls}>{f.value || "—"}</p>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* PARTIE DROITE : photo (aperçu uniquement, jamais éditable ici) */}
        <div className="relative flex flex-col items-center gap-2 w-full midTablet:w-auto">
          <div className="relative w-40 h-40 midTablet:w-36 midTablet:h-36 flex-shrink-0 mx-auto midTablet:mx-0 rounded-full overflow-hidden border border-darkBlue/15 bg-white/70 shadow-sm">
            {avatarUrl ? (
              <img
                src={avatarUrl}
                alt="aperçu"
                className="w-full h-full object-cover"
              />
            ) : (
              <div className="flex items-center justify-center w-full h-full bg-lightGrey/60">
                <AvatarSvg width={40} height={40} fillColor="#131E3690" />
              </div>
            )}
          </div>

          {employee?.profilePicture?.url && (
            <p className="text-[11px] text-darkBlue/50">
              {t("labels.profilePicture") || "Photo de profil"}
            </p>
          )}
        </div>

        {/* Boutons en mode édition */}
        {isEditing && (
          <div className="midTablet:absolute bottom-4 right-4 flex gap-2 flex-row-reverse w-full midTablet:w-auto ">
            <button
              type="button"
              disabled={isSavingDetails}
              onClick={() => {
                // Reset RHF aux valeurs par défaut (définies dans le parent via resetDetails)
                resetDetails();
                setIsEditing?.(false);
              }}
              className="px-4 py-2 rounded-lg bg-red text-white text-sm w-full midTablet:w-auto font-medium disabled:opacity-50"
            >
              {t("buttons.cancel")}
            </button>

            <button
              type="submit"
              disabled={!detailsDirty || isSavingDetails}
              className="px-4 py-2 rounded-lg bg-blue text-white text-sm w-full midTablet:w-auto font-medium disabled:opacity-40"
            >
              {isSavingDetails ? (
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
      </form>
    </section>
  );
}
