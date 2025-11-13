import { useEffect, useRef, useState } from "react";
// SVG
import { DeleteSvg, DownloadSvg } from "@/components/_shared/_svgs/_index";

// I18N
import { useTranslation } from "next-i18next";
import { Loader2, Trash2 } from "lucide-react";

export default function DocumentsEmployeeComponent(props) {
  const { t } = useTranslation("employees");
  const fileInputRef = useRef(null);

  // Fonction pour tronquer le nom de fichier
  const truncate = (name) =>
    name.length > 20 ? `${name.slice(0, 17)}…` : name;

  const [titleErrors, setTitleErrors] = useState([]);

  useEffect(() => {
    if (props.docs.length === 0 && fileInputRef.current) {
      fileInputRef.current.value = "";
    }
    // reset des erreurs quand la liste change (ex: après une sauvegarde)
    setTitleErrors([]);
  }, [props.docs]);

  const isUploading = props.isUploadingDocs;
  const isDeletingId = props.isDeletingDocId;

  // styles communs (alignés avec les autres composants employés)
  const sectionCls =
    "bg-white/60 backdrop-blur-sm p-2 mobile:p-6 rounded-2xl border border-darkBlue/10 shadow-sm flex flex-col gap-4";
  const cardWrap =
    "rounded-xl bg-white/70 border border-darkBlue/10 px-4 py-3 flex flex-col gap-2";
  const inputBaseCls =
    "w-full rounded-lg border bg-white px-3 py-2 text-[14px] outline-none transition placeholder:text-darkBlue/40";
  const inputNormalCls = `${inputBaseCls} border-darkBlue/20`;
  const inputErrorCls = `${inputBaseCls} border-red`;
  const badgeCls =
    "inline-flex items-center justify-center rounded-full px-2 py-0.5 text-[11px] font-medium";

  // wrapper pour la modif du titre (on nettoie l'erreur si l'utilisateur tape quelque chose)
  const handleTitleChange = (index, value) => {
    const limited = value.slice(0, 30); // max 30 caractères

    props.onDocTitleChange(index, limited);
    setTitleErrors((prev) => {
      const next = [...prev];
      next[index] = !limited.trim(); // erreur seulement si vide
      return next;
    });
  };

  // handler pour l'enregistrement : vérifie les titres avant de lancer onSaveDocs
  const handleSaveDocs = () => {
    const errors = props.docs.map((d) => !d.title || !d.title.trim());
    setTitleErrors(errors);

    const hasError = errors.some((e) => e);
    if (hasError) return; // on ne sauvegarde pas tant que tout n'est pas rempli

    props.onSaveDocs();
  };

  return (
    <section className={sectionCls}>
      {/* Header + bouton upload */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex flex-col gap-1">
          <h3 className="text-lg font-semibold text-darkBlue">
            {t("labels.documents")}
          </h3>
          <p className="text-xs text-darkBlue/50">
            {t("Ajoutez et gérez les documents liés à cet employé")}
          </p>
        </div>

        {/* Input caché */}
        <input
          ref={fileInputRef}
          type="file"
          multiple
          accept=".pdf,image/*"
          onChange={props.onDocsChange}
          disabled={isUploading}
          className="hidden"
        />

        {/* Boutons pour ouvrir l’input */}
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={isUploading}
            className="hidden midTablet:inline-flex items-center gap-2 rounded-lg bg-blue px-4 py-2 text-sm font-medium text-white shadow disabled:opacity-40"
          >
            {t("buttons.addDocument")}
          </button>

          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={isUploading}
            className="midTablet:hidden inline-flex items-center justify-center rounded-lg bg-blue h-9 w-9 text-sm font-medium text-white shadow disabled:opacity-40"
          >
            +
          </button>
        </div>
      </div>

      {/* Liste des fichiers en attente d’upload avec champ titre */}
      {props.docs.length > 0 && (
        <div className="mt-2 flex flex-col gap-3">
          <h4 className="text-xs font-medium text-darkBlue/70 uppercase tracking-wide">
            {t("Documents en attente d’enregistrement")}
          </h4>

          <ul className="grid grid-cols-1 midTablet:grid-cols-2 tablet:grid-cols-3 gap-3">
            {props.docs.map((d, i) => (
              <li key={i} className={cardWrap}>
                <div className="flex items-center justify-between gap-2">
                  <div className="flex flex-col">
                    <span className="text-xs text-darkBlue/50">
                      {t("Fichier")}
                    </span>
                    <span className="text-sm font-medium text-darkBlue">
                      {truncate(d.file.name)}
                    </span>
                  </div>

                  {!isUploading && (
                    <button
                      type="button"
                      onClick={() => props.removeSelectedDoc(i)}
                      className="text-xs text-red hover:underline hover:rotate-12 transition-transform duration-200"
                    >
                      <Trash2 width={18} />
                    </button>
                  )}
                </div>

                <div className="flex flex-col gap-1">
                  <span className="text-xs text-darkBlue/50 flex items-center gap-1">
                    {t("Titre du document")}
                    <span className="text-red text-[10px]">*</span>
                  </span>
                  <input
                    type="text"
                    placeholder="-"
                    value={d.title}
                    maxLength={30}
                    onChange={(e) => handleTitleChange(i, e.target.value)}
                    className={titleErrors[i] ? inputErrorCls : inputNormalCls}
                    disabled={isUploading}
                  />
                  <span className="text-[10px] text-darkBlue/40 text-right">
                    {d.title?.length || 0}/30
                  </span>
                </div>
              </li>
            ))}
          </ul>

          {/* Bouton Enregistrer les nouveaux docs */}
          <button
            onClick={handleSaveDocs}
            disabled={isUploading}
            className="inline-flex w-fit items-center justify-center gap-2 rounded-lg bg-blue px-4 py-2 text-sm font-medium text-white shadow disabled:opacity-40"
          >
            {isUploading ? (
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

      {/* Documents déjà uploadés */}
      {props?.employee.documents?.length > 0 && (
        <div className="mt-4 flex flex-col gap-3">
          <h4 className="text-xs font-medium text-darkBlue/70 uppercase tracking-wide">
            {t("Documents enregistrés")}
          </h4>

          <ul className="grid grid-cols-1 mobile:grid-cols-2 midTablet:grid-cols-3 tablet:grid-cols-4 gap-3">
            {props.employee.documents.map((doc, i) => (
              <li
                key={i}
                className="flex flex-col justify-between gap-3 rounded-xl bg-white/70 border border-darkBlue/10 px-4 py-3 shadow-sm"
              >
                <div className="flex flex-col gap-1">
                  <p className="text-sm font-semibold text-darkBlue line-clamp-2 break-words">
                    {truncate(doc.title) || truncate(doc.filename)}
                  </p>
                  <span
                    className={`${badgeCls} bg-darkBlue/5 text-darkBlue/60 mt-1`}
                  >
                    {truncate(doc.filename)}
                  </span>
                </div>

                <div className="mt-2 flex items-center justify-between gap-2">
                  {/* Télécharger */}
                  <a
                    href={`${process.env.NEXT_PUBLIC_API_URL}/employees/${props.employee._id}/documents/${encodeURIComponent(
                      doc.public_id
                    )}/download`}
                    className="inline-flex items-center justify-center rounded-full bg-[#4ead7a99] hover:bg-[#4ead7a] p-2 transition-colors duration-200"
                    title={t("Télécharger")}
                  >
                    <DownloadSvg
                      width={16}
                      height={16}
                      strokeColor="white"
                      fillColor="white"
                    />
                  </a>

                  {/* Supprimer */}
                  <button
                    type="button"
                    onClick={() => props.confirmDeleteDoc(doc)}
                    disabled={isDeletingId === doc.public_id}
                    className="inline-flex items-center justify-center rounded-full bg-[#FF766499] hover:bg-[#FF7664] p-2 transition-colors durée-200 disabled:opacity-40"
                    title={t("buttons.delete") || "Supprimer"}
                  >
                    <DeleteSvg
                      width={16}
                      height={16}
                      strokeColor="white"
                      fillColor="white"
                    />
                  </button>
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}
