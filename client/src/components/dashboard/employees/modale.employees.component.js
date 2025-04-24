// I18N
import { useTranslation } from "next-i18next";

export default function ModaleEmployeesComponent(props) {
  const { t } = useTranslation("employees");

  return (
    <div className="fixed inset-0 flex items-center text-center justify-center z-[100]">
      <div className="absolute inset-0 bg-black bg-opacity-40" />
    
      <div className="bg-white p-6 rounded-lg shadow-lg z-10 w-[400px]">
        <h2 className="text-xl font-semibold mb-4">
          {t("modale.titles.deleteDocument")}
        </h2>
      
        <p className="mb-6">
          {t("modale.description.deleteDocument")} «{props.docToDelete.filename}» ?
        </p>
      
        <div className="flex justify-center gap-4">
          <button
            onClick={() => props.setDocToDelete(null)}
            className="px-4 py-2 bg-red text-white rounded-lg"
          >
            {t("buttons.cancel")}
          </button>

          <button
            onClick={props.onDeleteDoc}
            disabled={props.isDeletingDocId === props.docToDelete.public_id}
            className="px-4 py-2 bg-blue text-white rounded-lg disabled:opacity-40"
          >
            {props.isDeletingDocId === props.docToDelete.public_id
              ? t("buttons.loading")
              : t("buttons.confirm")}
          </button>
        </div>
      </div>
    </div>
  );
}
