import { useEffect, useRef } from "react";
// SVG
import { DeleteSvg, DownloadSvg } from "@/components/_shared/_svgs/_index";

// I18N
import { useTranslation } from "next-i18next";

export default function DocumentsEmployeeComponent(props) {
  const { t } = useTranslation("employees");
  const fileInputRef = useRef(null);

  // Fonction pour tronquer le nom de fichier
  const truncate = (name) =>
    name.length > 30 ? `${name.slice(0, 27)}…` : name;

  useEffect(() => {
    if (props.docs.length === 0 && fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  }, [props.docs]);

  return (
    <section className="bg-white p-6 rounded-lg shadow">
      <div className="flex justify-between items-center">
        <h3 className="text-xl">{t("labels.documents")}</h3>

        {/* Input caché */}
        <input
          ref={fileInputRef}
          type="file"
          multiple
          accept=".pdf,image/*"
          onChange={props.onDocsChange}
          disabled={props.isUploadingDocs}
          className="hidden"
        />

        {/* Bouton pour ouvrir l’input */}
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          disabled={props.isUploadingDocs}
          className="hidden midTablet:inline-flex items-center px-4 py-2 bg-blue text-white rounded-lg disabled:opacity-40"
        >
          {t("buttons.addDocument")}
        </button>

        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          disabled={props.isUploadingDocs}
          className="midTablet:hidden inline-flex items-center px-4 py-2 bg-blue text-white rounded-lg disabled:opacity-40"
        >
          +
        </button>
      </div>

      {/* Liste des fichiers en attente d’upload avec champ titre */}
      {props.docs.length > 0 && (
        <ul className="list-disc pl-5 mb-6 mt-2 space-y-2">
          {props.docs.map((d, i) => (
            <li key={i} className="flex flex-col gap-2 text-sm">
              <div className="flex items-center gap-2">
                <span>{truncate(d.file.name)}</span>
                {!props.isUploadingDocs && (
                  <button
                    type="button"
                    onClick={() => props.removeSelectedDoc(i)}
                    className="ml-2 text-red hover:underline"
                  >
                    ({t("buttons.remove")})
                  </button>
                )}
              </div>
              <input
                type="text"
                placeholder={t("placeholders.documentTitle")}
                value={d.title}
                onChange={(e) => props.onDocTitleChange(i, e.target.value)}
                className="border px-2 py-1 rounded w-full"
                disabled={props.isUploadingDocs}
              />
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
      {props?.employee.documents?.length > 0 && (
        <div>
          <ul className="grid grid-cols-1 mobile:grid-cols-2 midTablet:grid-cols-3 tablet:grid-cols-4 gap-4 mt-6">
            {props.employee.documents.map((doc, i) => (
              <li
                key={i}
                className="flex flex-col gap-4 items-center justify-between text-center p-4 bg-white rounded-lg shadow-lg"
              >
                <p className="text-sm">
                  <strong>{doc.title || truncate(doc.filename)}</strong>
                </p>

                <div className="flex w-full justify-between">
                  <div className="w-1/2 flex flex-col items-center">
                    <a
                      href={`${process.env.NEXT_PUBLIC_API_URL}/employees/${props.employee._id}/documents/${encodeURIComponent(
                        doc.public_id
                      )}/download`}
                      className="inline-flex items-center justify-center bg-[#4ead7a99] hover:bg-[#4ead7a] p-2 rounded-full transition-colors duration-300"
                    >
                      <DownloadSvg
                        width={15}
                        height={15}
                        strokeColor="white"
                        fillColor="white"
                      />
                    </a>
                  </div>

                  <div className="w-1/2 flex flex-col items-center">
                    <button
                      type="button"
                      onClick={() => props.confirmDeleteDoc(doc)}
                      disabled={props.isDeletingDocId === doc.public_id}
                      className="inline-flex items-center justify-center
                                 bg-[#FF766499] hover:bg-[#FF7664]
                                 p-2 rounded-full transition-colors duration-300 disabled:opacity-40"
                    >
                      <DeleteSvg
                        width={15}
                        height={15}
                        strokeColor="white"
                        fillColor="white"
                      />
                    </button>
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
