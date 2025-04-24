import { useRef } from "react";
// SVG
import { DeleteSvg } from "@/components/_shared/_svgs/delete.svg";
import { VisibleSvg } from "@/components/_shared/_svgs/visible.svg";

// I18N
import { useTranslation } from "next-i18next";

export default function DocumentsEmployeeComponent(props) {
  const { t } = useTranslation("employees");
  const fileInputRef = useRef(null);

  return (
    <section className="bg-white p-6 rounded-lg shadow">
      <div className="flex justify-between">
      <h3 className="text-xl mb-4">{t("labels.documents")}</h3>

      {/* 1) Input caché  */}
      <input
        ref={fileInputRef}
        type="file"
        multiple
        accept=".pdf,image/*"
        onChange={props.onDocsChange}
        disabled={props.isUploadingDocs}
        className="hidden"
      />

      {/* 2) Bouton custom pour l’ouvrir */}
      <button
        type="button"
        onClick={() => fileInputRef.current?.click()}
        disabled={props.isUploadingDocs}
        className="inline-flex items-center px-4 py-2 bg-blue text-white rounded-lg disabled:opacity-40"
      >
        {props.isUploadingDocs
          ? t("buttons.loading")
          : t("buttons.addDocument")}
      </button>
      </div>

      {/* Liste des fichiers sélectionnés */}
      {props.docs.length > 0 && (
        <ul className="list-disc pl-5 mb-4">
          {props.docs.map((f, i) => (
            <li key={i} className="flex items-center justify-between">
              <span>{f.name}</span>
              <button
                type="button"
                onClick={() => props.removeSelectedDoc(i)}
                className="ml-2 text-red-600 hover:underline text-xs"
              >
                (Retirer)
              </button>
            </li>
          ))}
        </ul>
      )}

      {/* Bouton Enregistrer */}
      {props.docs.length > 0 && (
        <button
          onClick={props.onSaveDocs}
          disabled={props.isUploadingDocs}
          className="px-4 py-2 bg-blue text-white rounded-lg disabled:opacity-40"
        >
          {props.isUploadingDocs ? t("buttons.loading") : t("buttons.save")}
        </button>
      )}

      {/* Documents déjà uploadés */}
      {props.employee.documents?.length > 0 && (
        <div className="mt-6">
          <h4 className="font-semibold mb-2">
            {t("labels.uploadedDocuments")}
          </h4>

          <ul className="grid grid-cols-4 gap-6">
            {props.employee.documents.map((doc) => (
              <li
                key={doc.public_id}
                className="flex flex-col gap-4 items-center p-4 bg-white rounded-lg shadow-lg"
              >
                <p>{doc.filename}</p>

                <div className="flex w-full justify-between">
                  {/* Voir */}
                  <div className="w-1/2 flex flex-col items-center">
                    <a href={doc.url} target="_blank" rel="noopener noreferrer">
                      <button
                        type="button"
                        className="inline-flex items-center justify-center
                                   bg-[#4ead7a99] hover:bg-[#4ead7a]
                                   p-2 rounded-full transition-colors duration-300"
                      >
                        <VisibleSvg
                          width={15}
                          height={15}
                          strokeColor="white"
                          fillColor="white"
                        />
                      </button>
                    </a>
                    <p className="text-xs text-center mt-1">
                      {t("buttons.view")}
                    </p>
                  </div>

                  {/* Supprimer */}
                  <div className="w-1/2 flex flex-col items-center">
                    <button
                      type="button"
                      onClick={() => props.confirmDeleteDoc(doc)}
                      disabled={props.isDeletingDocId === doc.public_id}
                      className="inline-flex items-center justify-center
                                 bg-[#FF766499] hover:bg-[#FF7664]
                                 p-2 rounded-full transition-colors duration-300
                                 disabled:opacity-40"
                    >
                      <DeleteSvg
                        width={15}
                        height={15}
                        strokeColor="white"
                        fillColor="white"
                      />
                    </button>
                    <p className="text-xs text-center mt-1">
                      {t("buttons.delete")}
                    </p>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}
