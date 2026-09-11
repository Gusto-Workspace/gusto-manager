import { useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { Loader2 } from "lucide-react";

// I18N
import { useTranslation } from "next-i18next";

export default function ModaleEmployeesComponent(props) {
  const { t } = useTranslation("employees");
  const isDuplicate = props.type === "duplicate";
  const isDeleting =
    !isDuplicate && props.isDeletingDocId === props.docToDelete?.public_id;
  const secondaryButtonRef = useRef(null);
  const portalTarget = typeof document !== "undefined" ? document.body : null;

  function closeModal() {
    if (isDeleting) return;
    if (isDuplicate) {
      props.onCloseDuplicate();
      return;
    }
    props.setDocToDelete(null);
  }

  useEffect(() => {
    if (!portalTarget) return undefined;

    const appRoot = document.getElementById("__next");
    const rootWasInert = appRoot?.hasAttribute("inert") || false;
    const previousOverflow = document.body.style.overflow;
    const previouslyFocusedElement = document.activeElement;

    appRoot?.setAttribute("inert", "");
    document.body.style.overflow = "hidden";
    secondaryButtonRef.current?.focus();

    return () => {
      if (!rootWasInert) appRoot?.removeAttribute("inert");
      document.body.style.overflow = previousOverflow;
      previouslyFocusedElement?.focus?.();
    };
  }, [portalTarget]);

  useEffect(() => {
    function handleKeyDown(event) {
      if (event.key === "Escape") closeModal();
    }

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  });

  if (!portalTarget) return null;

  const documentName =
    props.docToDelete?.title ||
    props.docToDelete?.filename ||
    t("labels.document", "ce document");

  return createPortal(
    <div
      className="fixed inset-0 z-[160] flex items-center justify-center p-3 mobile:p-4"
      role={isDuplicate ? "dialog" : "alertdialog"}
      aria-modal="true"
      aria-labelledby="employee-document-modal-title"
      aria-describedby="employee-document-modal-description"
    >
      <button
        type="button"
        className="absolute inset-0 cursor-default bg-darkBlue/35 backdrop-blur-[1px]"
        onClick={closeModal}
        disabled={isDeleting}
        aria-label={t("buttons.cancel")}
      />

      <section className="relative z-[1] w-full max-w-[420px] rounded-2xl border border-darkBlue/10 bg-white/95 p-5 text-center shadow-[0_22px_55px_rgba(19,30,54,0.20)] mobile:p-6">
        <h2
          id="employee-document-modal-title"
          className="text-balance text-xl font-semibold text-darkBlue"
        >
          {isDuplicate
            ? t("modale.titles.duplicateDocument")
            : t("modale.titles.deleteDocument")}
        </h2>

        <p
          id="employee-document-modal-description"
          className="mx-auto mt-2 max-w-sm text-balance text-sm leading-6 text-darkBlue/65"
        >
          {isDuplicate ? (
            t("modale.description.duplicateDocument")
          ) : (
            <>
              {t("modale.description.deleteDocument")}{" "}
              <span className="font-semibold text-darkBlue">
                « {documentName} »
              </span>{" "}
              ?
            </>
          )}
        </p>

        <div className="mt-6 grid grid-cols-1 gap-2 mobile:grid-cols-2">
          {isDuplicate ? (
            <button
              ref={secondaryButtonRef}
              type="button"
              onClick={props.onCloseDuplicate}
              className="col-span-full inline-flex h-11 items-center justify-center rounded-xl bg-blue px-4 text-sm font-semibold text-white shadow-sm transition hover:bg-blue/90"
            >
              {t("buttons.understood")}
            </button>
          ) : (
            <>
              <button
                ref={secondaryButtonRef}
                type="button"
                onClick={closeModal}
                disabled={isDeleting}
                className="inline-flex h-11 items-center justify-center rounded-xl border border-darkBlue/10 bg-white px-4 text-sm font-semibold text-darkBlue transition hover:bg-darkBlue/5 disabled:opacity-40"
              >
                {t("buttons.cancel")}
              </button>

              <button
                type="button"
                onClick={props.onDeleteDoc}
                disabled={isDeleting}
                className="inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-red px-4 text-sm font-semibold text-white shadow-sm transition hover:bg-red/90 disabled:opacity-40"
              >
                {isDeleting ? (
                  <>
                    <Loader2 className="size-4 animate-spin" />
                    <span>En cours…</span>
                  </>
                ) : (
                  t("buttons.delete")
                )}
              </button>
            </>
          )}
        </div>
      </section>
    </div>,
    portalTarget,
  );
}
