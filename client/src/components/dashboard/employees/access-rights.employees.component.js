//I18N
import { useTranslation } from "next-i18next";

export default function AccessRightsEmployeesComponent(props) {
  const { t } = useTranslation("employees");
  return (
    <form
      onSubmit={props?.handleOptionsSubmit(props?.onSaveOptions)}
      className="bg-white p-6 rounded-lg shadow"
    >
      <h3 className="text-xl mb-4">{t("labels.assignRights")}</h3>
    
      <div className="grid grid-cols-1 mobile:grid-cols-2 gap-4">
        {Object.keys(props?.employee.options).map((key) => (
          <label key={key} className="flex items-center gap-2">
            <input
              type="checkbox"
              {...props?.regOptions(`options.${key}`)}
              disabled={
                props?.isSavingOptions ||
                props?.isEditing ||
                props?.isSavingDetails
              }
            />
            {props?.optionLabels[key]}
          </label>
        ))}
      </div>
      
      {props?.optionsSaved ? (
        <span className="text-green-600">Sauvegardé</span>
      ) : props?.optionsDirty ? (
        <button
          type="submit"
          disabled={
            props?.isSavingOptions || props?.isEditing || props?.isSavingDetails
          }
          className="mt-4 px-4 py-2 bg-blue text-white rounded-lg disabled:opacity-40"
        >
          {props?.isSavingOptions ? t("buttons.loading") : t("buttons.save")}
        </button>
      ) : null}
    </form>
  );
}
