// I18N
import { useTranslation } from "next-i18next";

export default function AccessRightsEmployeesComponent(props) {
  const { t } = useTranslation("employees");

  const { employee } = props || {};
  const options = employee?.options || {};

  // styles communs (alignés avec DataEmployees / form employé)
  const cardWrap =
    "group relative rounded-xl bg-white/60   px-4 py-3 border border-darkBlue/10 transition hover:border-darkBlue/30";
  const titleCls = "text-sm font-medium text-darkBlue";
  const checkboxBase =
    "h-4 w-4 rounded cursor-pointer border border-darkBlue/30 text-blue focus:ring-blue focus:ring-offset-0";

  const isDisabled =
    props?.isSavingOptions || props?.isEditing || props?.isSavingDetails;

  return (
    <form
      onSubmit={props?.handleOptionsSubmit(props?.onSaveOptions)}
      className="bg-white/60   p-2 mobile:p-6 rounded-2xl border border-darkBlue/10 shadow-sm flex flex-col gap-4"
    >
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <h3 className="text-lg font-semibold text-darkBlue">
          {t("labels.assignRights")}
        </h3>
        <p className="text-xs text-darkBlue/50">
          {t("Cochez les accès autorisés")}
        </p>
      </div>

      <div className="grid grid-cols-1 mobile:grid-cols-2 gap-3">
        {Object.keys(options).map((key) => {
          const label = props?.optionLabels?.[key] || key;

          return (
            <label
              key={key}
              className={`${cardWrap} flex items-center justify-between gap-3 cursor-pointer ${
                isDisabled ? "opacity-60 cursor-not-allowed" : ""
              }`}
            >
              <span className={titleCls}>{label}</span>

              <input
                type="checkbox"
                {...props?.regOptions(`options.${key}`)}
                disabled={isDisabled}
                className={checkboxBase}
              />
            </label>
          );
        })}
      </div>

      {props?.optionsDirty && (
        <div className="mt-2 flex justify-end">
          <button
            type="submit"
            disabled={isDisabled}
            className="inline-flex items-center justify-center gap-2 rounded-lg bg-blue px-4 py-2 text-sm font-medium text-white shadow disabled:opacity-40"
          >
            {props?.isSavingOptions ? t("buttons.loading") : t("buttons.save")}
          </button>
        </div>
      )}
    </form>
  );
}
