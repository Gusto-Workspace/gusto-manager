// I18N
import { useTranslation } from "next-i18next";

export default function ModaleEmployeesComponent(props) {
  const { t } = useTranslation("employees");
  const isDuplicate = props.type === "duplicate";

  return (
    <div className="fixed inset-0 flex items-center justify-center z-[100]">
      <div className="absolute inset-0 bg-black bg-opacity-40" />

      <div className="bg-white mx-4 p-6 text-center rounded-lg shadow-lg z-10 w-[400px]">
        {/* Titre */}
        <h2 className="text-xl font-semibold mb-4">
          {isDuplicate
            ? t("modale.titles.duplicateDocument")
            : t("modale.titles.deleteDocument")}
        </h2>

        {/* Description */}
        <p className="mb-6">
          {isDuplicate
            ? t("modale.description.duplicateDocument")
            : t("modale.description.deleteDocument")}
          {!isDuplicate && <> «{props.docToDelete.filename}» ?</>}
        </p>

        {/* Boutons */}
        <div className="flex justify-center gap-4">
          {isDuplicate ? (
            <button
              onClick={props.onCloseDuplicate}
              className="px-4 py-2 bg-blue text-white rounded-lg"
            >
              {t("buttons.understood")}
            </button>
          ) : (
            <>
              <button
                onClick={props.onDeleteDoc}
                disabled={props.isDeletingDocId === props.docToDelete.public_id}
                className="px-4 py-2 bg-blue text-white rounded-lg disabled:opacity-40"
              >
                {props.isDeletingDocId === props.docToDelete.public_id
                  ? t("buttons.loading")
                  : t("buttons.confirm")}
              </button>

              <button
                onClick={() => props.setDocToDelete(null)}
                disabled={props.isDeletingDocId === props.docToDelete.public_id}
                className="px-4 py-2 bg-red text-white rounded-lg disabled:opacity-40"
              >
                {t("buttons.cancel")}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
