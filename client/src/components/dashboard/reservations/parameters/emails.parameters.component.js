import { useEffect, useMemo, useRef, useState } from "react";
import {
  Mail,
  Save,
  Check,
  Loader2,
  RotateCcw,
  X,
  ExternalLink,
} from "lucide-react";

import {
  RESERVATION_EMAIL_TEMPLATE_DEFINITIONS,
  areReservationEmailTemplatesEqual,
  buildReservationEmailPreview,
  buildReservationEmailTemplatesState,
  formatReservationEmailTemplateForDisplay,
  getInvalidReservationEmailTemplateTokens,
  getReservationEmailTemplateDefinition,
  getReservationEmailVariableDisplayToken,
  parseReservationEmailTemplateDisplayValue,
} from "../../../_shared/reservations/email-templates.reservations";

const CLOSE_MS = 280;
const SWIPE_VELOCITY = 0.6;
const CLOSE_RATIO = 0.25;

function buildValidationState(
  templates,
  definitions = RESERVATION_EMAIL_TEMPLATE_DEFINITIONS,
) {
  const currentTemplates = buildReservationEmailTemplatesState(templates);
  const nextValidationState = {};

  for (const definition of definitions) {
    const current = currentTemplates?.[definition.key] || {};
    nextValidationState[definition.key] = {
      subject: getInvalidReservationEmailTemplateTokens(
        definition.key,
        current.subject,
      ),
      body: getInvalidReservationEmailTemplateTokens(
        definition.key,
        current.body,
      ),
    };
  }

  return nextValidationState;
}

function hasTemplateValidationErrors(validationEntry = {}) {
  return Boolean(
    (Array.isArray(validationEntry?.subject) &&
      validationEntry.subject.length > 0) ||
      (Array.isArray(validationEntry?.body) && validationEntry.body.length > 0),
  );
}

function hasValidationErrors(validationState = {}) {
  return Object.values(validationState).some((entry) =>
    hasTemplateValidationErrors(entry),
  );
}

function getVariableDisplayLabel(variableKey) {
  return getReservationEmailVariableDisplayToken(variableKey);
}

function SaveButton({ saveUI, onClick }) {
  const saveBtnBase =
    "inline-flex items-center gap-2 rounded-xl px-3 h-10 text-sm font-semibold transition";
  const saveBtnPrimary =
    "bg-darkBlue text-white hover:opacity-90 active:scale-[0.98]";
  const saveBtnDone =
    "bg-white text-darkBlue border border-darkBlue opacity-60";

  if (!saveUI?.dirty && !saveUI?.saving && !saveUI?.saved) {
    return null;
  }

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={saveUI?.saving || saveUI?.saved}
      className={[
        saveBtnBase,
        saveUI?.saved ? saveBtnDone : saveBtnPrimary,
        saveUI?.saving ? "opacity-60 cursor-not-allowed" : "",
      ].join(" ")}
    >
      {saveUI?.saving ? (
        <>
          <Loader2 className="size-4 animate-spin" />
          Enregistrement...
        </>
      ) : saveUI?.saved ? (
        <>
          <Check className="size-4" />
          Enregistré
        </>
      ) : (
        <>
          <Save className="size-4" />
          Enregistrer
        </>
      )}
    </button>
  );
}

export default function EmailsParametersComponent({
  templates,
  savedTemplates,
  onTemplatesChange,
  restaurantName,
  bankHoldEnabled = false,
  saveUI,
  onSave,
}) {
  const currentTemplates = useMemo(
    () => buildReservationEmailTemplatesState(templates),
    [templates],
  );
  const committedTemplates = useMemo(
    () => buildReservationEmailTemplatesState(savedTemplates),
    [savedTemplates],
  );

  const [drawerTemplateKey, setDrawerTemplateKey] = useState(null);
  const [isDrawerVisible, setIsDrawerVisible] = useState(false);
  const [activeField, setActiveField] = useState("body");
  const [isTabletUp, setIsTabletUp] = useState(false);
  const [showCloseWarning, setShowCloseWarning] = useState(false);
  const [showSavedFeedback, setShowSavedFeedback] = useState(false);
  const [validationState, setValidationState] = useState({});
  const templateDefinitions = useMemo(
    () =>
      RESERVATION_EMAIL_TEMPLATE_DEFINITIONS.filter(
        (definition) =>
          bankHoldEnabled || definition.key !== "bank_hold_action_required",
      ),
    [bankHoldEnabled],
  );
  const visibleValidationState = useMemo(
    () =>
      Object.fromEntries(
        templateDefinitions.map((definition) => [
          definition.key,
          validationState?.[definition.key] || { subject: [], body: [] },
        ]),
      ),
    [templateDefinitions, validationState],
  );

  const prevBodyOverflowRef = useRef("");
  const prevHtmlOverflowRef = useRef("");
  const subjectInputRef = useRef(null);
  const bodyTextareaRef = useRef(null);
  const panelRef = useRef(null);
  const [panelH, setPanelH] = useState(null);
  const [dragY, setDragY] = useState(0);
  const dragStateRef = useRef({
    active: false,
    startY: 0,
    lastY: 0,
    startT: 0,
    lastT: 0,
  });

  const selectedTemplate = drawerTemplateKey
    ? currentTemplates?.[drawerTemplateKey] || null
    : null;
  const selectedDefinition = drawerTemplateKey
    ? getReservationEmailTemplateDefinition(drawerTemplateKey)
    : null;
  const selectedPreview = drawerTemplateKey
    ? buildReservationEmailPreview(
        drawerTemplateKey,
        currentTemplates,
        restaurantName,
      )
    : null;
  const selectedValidation = drawerTemplateKey
    ? visibleValidationState?.[drawerTemplateKey] || { subject: [], body: [] }
    : { subject: [], body: [] };
  const hasUnsavedEmailChanges = useMemo(
    () =>
      !areReservationEmailTemplatesEqual(committedTemplates, currentTemplates),
    [committedTemplates, currentTemplates],
  );
  const drawerSaveUI = useMemo(
    () => ({
      ...saveUI,
      saved: Boolean(saveUI?.saved && showSavedFeedback),
    }),
    [saveUI, showSavedFeedback],
  );

  const restoreScroll = () => {
    if (typeof document === "undefined") return;
    document.body.style.overflow = prevBodyOverflowRef.current || "";
    document.documentElement.style.overflow = prevHtmlOverflowRef.current || "";
  };

  const lockScroll = () => {
    if (typeof document === "undefined") return;
    prevBodyOverflowRef.current = document.body.style.overflow || "";
    prevHtmlOverflowRef.current = document.documentElement.style.overflow || "";
    document.body.style.overflow = "hidden";
    document.documentElement.style.overflow = "hidden";
  };

  useEffect(() => {
    if (typeof window === "undefined") return;

    const mq = window.matchMedia("(min-width: 768px)");
    const update = () => setIsTabletUp(mq.matches);

    update();
    if (mq.addEventListener) mq.addEventListener("change", update);
    else mq.addListener(update);

    return () => {
      if (mq.removeEventListener) mq.removeEventListener("change", update);
      else mq.removeListener(update);
    };
  }, []);

  const measurePanel = () => {
    const el = panelRef.current;
    if (!el) return;
    const h = el.getBoundingClientRect().height || 0;
    if (h > 0) setPanelH(h);
  };

  useEffect(() => {
    if (!drawerTemplateKey) return;

    lockScroll();
    setIsDrawerVisible(false);
    setDragY(0);

    const raf = requestAnimationFrame(() => {
      setIsDrawerVisible(true);
      requestAnimationFrame(measurePanel);
    });

    const onResize = () => requestAnimationFrame(measurePanel);
    window.addEventListener("resize", onResize);

    const onKeyDown = (event) => {
      if (event.key === "Escape") requestCloseDrawer();
    };
    document.addEventListener("keydown", onKeyDown);

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", onResize);
      document.removeEventListener("keydown", onKeyDown);
      restoreScroll();
    };
  }, [drawerTemplateKey]);

  useEffect(() => {
    if (!drawerTemplateKey) setIsDrawerVisible(false);
  }, [drawerTemplateKey]);

  useEffect(() => {
    if (!drawerTemplateKey) {
      setShowCloseWarning(false);
      setShowSavedFeedback(false);
    }
  }, [drawerTemplateKey]);

  function closeWithAnimation() {
    setIsDrawerVisible(false);
    setDragY(0);
    setShowCloseWarning(false);
    setShowSavedFeedback(false);
    setTimeout(() => {
      restoreScroll();
      setDrawerTemplateKey(null);
    }, CLOSE_MS);
  }

  function requestCloseDrawer() {
    if (saveUI?.saving) return;
    if (hasUnsavedEmailChanges) {
      setDragY(0);
      setShowCloseWarning(true);
      return;
    }

    closeWithAnimation();
  }

  function abandonChangesAndClose() {
    onTemplatesChange(buildReservationEmailTemplatesState(committedTemplates));
    closeWithAnimation();
  }

  const panelFallback = 720;
  const dragMaxPx = Math.max(240, (panelH || panelFallback) - 12);
  const swipeClosePx = Math.max(
    90,
    Math.floor((panelH || panelFallback) * CLOSE_RATIO),
  );

  const onPointerDown = (event) => {
    if (isTabletUp) return;
    if (event.pointerType === "mouse" && event.button !== 0) return;

    dragStateRef.current.active = true;
    dragStateRef.current.startY = event.clientY;
    dragStateRef.current.lastY = event.clientY;
    dragStateRef.current.startT = performance.now();
    dragStateRef.current.lastT = dragStateRef.current.startT;

    try {
      event.currentTarget.setPointerCapture?.(event.pointerId);
    } catch {}
  };

  const onPointerMove = (event) => {
    if (isTabletUp) return;
    if (!dragStateRef.current.active) return;

    const dy = event.clientY - dragStateRef.current.startY;
    dragStateRef.current.lastY = event.clientY;
    dragStateRef.current.lastT = performance.now();

    setDragY(Math.max(0, Math.min(dragMaxPx, dy)));
  };

  const onPointerUp = () => {
    if (isTabletUp) return;
    if (!dragStateRef.current.active) return;
    dragStateRef.current.active = false;

    const dt = Math.max(
      1,
      dragStateRef.current.lastT - dragStateRef.current.startT,
    );
    const velocity =
      (dragStateRef.current.lastY - dragStateRef.current.startY) / dt;

    if (dragY >= swipeClosePx || velocity >= SWIPE_VELOCITY) {
      requestCloseDrawer();
      return;
    }

    setDragY(0);
  };

  function updateTemplate(templateKey, field, value) {
    onTemplatesChange((prev) => {
      const nextTemplates = buildReservationEmailTemplatesState(prev);
      return {
        ...nextTemplates,
        [templateKey]: {
          ...(nextTemplates?.[templateKey] || {}),
          [field]: value,
        },
      };
    });
  }

  function insertVariable(token) {
    if (!drawerTemplateKey) return;

    const targetField = activeField === "subject" ? "subject" : "body";
    const targetRef =
      targetField === "subject"
        ? subjectInputRef.current
        : bodyTextareaRef.current;
    const currentValue = formatReservationEmailTemplateForDisplay(
      selectedTemplate?.[targetField] || "",
    );

    const selectionStart = Number(
      targetRef?.selectionStart ?? currentValue.length,
    );
    const selectionEnd = Number(targetRef?.selectionEnd ?? currentValue.length);

    const nextValue =
      currentValue.slice(0, selectionStart) +
      token +
      currentValue.slice(selectionEnd);

    updateTemplate(
      drawerTemplateKey,
      targetField,
      parseReservationEmailTemplateDisplayValue(nextValue),
    );

    requestAnimationFrame(() => {
      if (!targetRef) return;
      const nextCursor = selectionStart + token.length;
      targetRef.focus();
      targetRef.setSelectionRange(nextCursor, nextCursor);
    });
  }

  function resetTemplateToDefault(templateKey) {
    const definition = getReservationEmailTemplateDefinition(templateKey);
    if (!definition) return;

    updateTemplate(templateKey, "subject", definition.defaultSubject);
    updateTemplate(templateKey, "body", definition.defaultBody);
  }

  async function handleSaveClick() {
    const nextValidationState = buildValidationState(
      currentTemplates,
      templateDefinitions,
    );
    setValidationState(nextValidationState);

    if (hasValidationErrors(nextValidationState)) {
      const firstInvalidDefinition = templateDefinitions.find((definition) =>
        hasTemplateValidationErrors(nextValidationState?.[definition.key]),
      );

      if (firstInvalidDefinition) {
        setDrawerTemplateKey(firstInvalidDefinition.key);
      }
      return false;
    }

    const didSave = (await onSave?.()) !== false;
    if (didSave) {
      setShowSavedFeedback(true);
      setShowCloseWarning(false);
    }
    return didSave;
  }

  async function saveAndClose() {
    const didSave = await handleSaveClick();
    if (!didSave) return;
    closeWithAnimation();
  }

  function renderVariableButtons(containerClassName) {
    return (
      <div className={containerClassName}>
        {selectedDefinition.allowedVariables.map((variableKey) => {
          const token = getVariableDisplayLabel(variableKey);

          return (
            <button
              key={variableKey}
              type="button"
              onClick={() => insertVariable(token)}
              className="shrink-0 rounded-2xl border border-darkBlue/10 bg-white px-3 py-2 text-left transition hover:bg-darkBlue/5"
              title={token}
            >
              <span className="block text-sm font-semibold text-darkBlue">
                {token}
              </span>
            </button>
          );
        })}
      </div>
    );
  }

  const overlayOpacity = !isDrawerVisible
    ? 0
    : 1 * (1 - Math.min(1, dragY / dragMaxPx));

  const card = "rounded-3xl border border-darkBlue/10 bg-white/70 shadow-sm";
  const cardInner = "px-2 py-4 mobile:p-4 midTablet:p-6";
  const sectionTitle =
    "text-base font-semibold text-darkBlue flex items-center gap-2";
  const hint = "text-sm text-darkBlue/60";
  const divider = "h-px bg-darkBlue/10 my-4";

  return (
    <>
      <div className={card}>
        <div className={cardInner}>
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              <p className={sectionTitle}>
                <Mail className="size-4 shrink-0 opacity-60" />
                Personnalisation des emails
              </p>
              <p className={hint}>
                Personnalisez chaque email de réservation en ouvrant le détail
                du modèle à modifier.
              </p>
            </div>
          </div>

          <div className={divider} />

          {hasValidationErrors(visibleValidationState) ? (
            <div className="mb-4 rounded-2xl border border-red/20 bg-red/5 px-4 py-3 text-sm text-red">
              Certaines variables ne sont pas reconnues. Ouvrez le modèle
              concerné pour corriger les balises invalides.
            </div>
          ) : null}

          <div className="space-y-3">
            {templateDefinitions.map((definition) => {
              const currentValidation = visibleValidationState?.[
                definition.key
              ] || {
                subject: [],
                body: [],
              };
              const hasInvalidVariables =
                hasTemplateValidationErrors(currentValidation);

              return (
                <div
                  key={definition.key}
                  className="rounded-2xl border border-darkBlue/10 bg-white/60 px-4 py-4"
                >
                  <div className="flex flex-col gap-4 midTablet:flex-row midTablet:items-center midTablet:justify-between">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="font-semibold text-darkBlue">
                          {definition.title}
                        </p>

                        {hasInvalidVariables ? (
                          <span className="shrink-0 rounded-full border border-red/20 bg-red/5 px-3 py-1 text-[11px] font-semibold text-red">
                            Variables invalides
                          </span>
                        ) : null}
                      </div>

                      <p className="mt-1 text-sm text-darkBlue/55">
                        {definition.description}
                      </p>
                    </div>

                    <button
                      type="button"
                      onClick={() => setDrawerTemplateKey(definition.key)}
                      className="inline-flex shrink-0 items-center justify-center gap-2 rounded-2xl border border-darkBlue/10 bg-white px-4 py-3 text-sm font-semibold text-darkBlue transition hover:bg-darkBlue/5"
                      aria-label={`Ouvrir ${definition.title}`}
                    >
                      <ExternalLink className="size-4" />
                      <span>Ouvrir</span>
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {drawerTemplateKey && selectedDefinition && selectedTemplate && (
        <div className="fixed inset-0 z-[120]" role="dialog" aria-modal="true">
          <div
            className={`
              absolute inset-0 bg-darkBlue/30
              transition-opacity duration-200
              ${isDrawerVisible ? "opacity-100" : "opacity-0"}
            `}
            style={{ opacity: overlayOpacity }}
            onClick={requestCloseDrawer}
          />

          <div
            ref={panelRef}
            className={`
              absolute z-[1] flex flex-col overflow-hidden
              border border-darkBlue/10 bg-white
              shadow-[0_25px_80px_rgba(19,30,54,0.25)]
              left-0 right-0 bottom-0 w-full min-h-[40vh] max-h-[86vh] tablet:max-h-[100vh]
              rounded-t-3xl
              tablet:top-0 tablet:bottom-0 tablet:left-auto tablet:right-0
              tablet:h-full tablet:w-[620px]
              tablet:rounded-none
              transform transition-transform duration-300 ease-out will-change-transform
              ${
                isDrawerVisible
                  ? "translate-y-0 tablet:translate-y-0 tablet:translate-x-0"
                  : "translate-y-full tablet:translate-y-0 tablet:translate-x-full"
              }
            `}
            style={
              isTabletUp
                ? undefined
                : {
                    transform: isDrawerVisible
                      ? `translateY(${dragY}px)`
                      : "translateY(100%)",
                    transition: dragStateRef.current.active
                      ? "none"
                      : "transform 240ms ease-out",
                    willChange: "transform",
                  }
            }
            onClick={(event) => event.stopPropagation()}
          >
            <div
              className="tablet:hidden cursor-grab active:cursor-grabbing touch-none"
              onPointerDown={onPointerDown}
              onPointerMove={onPointerMove}
              onPointerUp={onPointerUp}
              onPointerCancel={onPointerUp}
            >
              <div className="flex justify-center py-3">
                <div className="h-1.5 w-12 rounded-full bg-darkBlue/20" />
              </div>
            </div>

            <div className="sticky top-0 z-10 border-b border-darkBlue/10 bg-white/70 px-4 pb-3 midTablet:px-6 midTablet:py-3">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-xs text-darkBlue/45">Template email</p>
                  <h3 className="text-base font-semibold text-darkBlue">
                    {selectedDefinition.title}
                  </h3>
                  <p className="mt-1 text-sm text-darkBlue/60">
                    {selectedDefinition.description}
                  </p>
                </div>

                <button
                  type="button"
                  onClick={requestCloseDrawer}
                  className="inline-flex items-center justify-center rounded-xl border border-darkBlue/10 bg-white p-2 transition hover:bg-darkBlue/5"
                  aria-label="Fermer"
                >
                  <X className="size-4 text-darkBlue/70" />
                </button>
              </div>
            </div>

            <div className="hide-scrollbar flex-1 overflow-y-auto bg-lightGrey p-4 midTablet:p-6 overscroll-contain">
              <div className="flex flex-col gap-4">
                <div className="hidden tablet:block rounded-2xl border border-darkBlue/10 bg-white/70 p-4">
                  <div className="flex flex-col gap-3 midTablet:flex-row midTablet:items-start midTablet:justify-between">
                    <div>
                      <p className="font-semibold text-darkBlue">
                        Variables disponibles
                      </p>
                      <p className="text-xs text-darkBlue/55">
                        Cliquez sur une variable pour l’insérer dans le champ
                        actif.
                      </p>
                    </div>

                    <button
                      type="button"
                      onClick={() => resetTemplateToDefault(drawerTemplateKey)}
                      className="inline-flex items-center gap-2 rounded-xl border border-darkBlue/10 bg-white px-3 py-2 text-sm font-semibold text-darkBlue transition hover:bg-darkBlue/5"
                    >
                      <RotateCcw className="size-4" />
                      Réinitialiser
                    </button>
                  </div>

                  {renderVariableButtons(
                    "mt-4 grid grid-cols-1 gap-2 tablet:grid-cols-2",
                  )}
                </div>

                <div className="rounded-2xl border border-darkBlue/10 bg-white/70 p-4">
                  <p className="font-semibold text-darkBlue">Sujet</p>
                  <input
                    ref={subjectInputRef}
                    type="text"
                    value={formatReservationEmailTemplateForDisplay(
                      selectedTemplate.subject,
                    )}
                    onFocus={() => setActiveField("subject")}
                    onChange={(event) =>
                      updateTemplate(
                        drawerTemplateKey,
                        "subject",
                        parseReservationEmailTemplateDisplayValue(
                          event.target.value,
                        ),
                      )
                    }
                    className="mt-3 h-11 w-full rounded-2xl border border-darkBlue/10 bg-white/80 px-4 text-base outline-none transition placeholder:text-darkBlue/35 focus:border-blue/60 focus:ring-2 focus:ring-blue/20"
                    placeholder="Objet de l’email"
                  />

                  {selectedValidation?.subject?.length ? (
                    <p className="mt-2 text-xs text-red">
                      Variables invalides :{" "}
                      {selectedValidation.subject
                        .map((token) => `{{${token}}}`)
                        .join(", ")}
                    </p>
                  ) : null}
                </div>

                <div className="rounded-2xl border border-darkBlue/10 bg-white/70 p-4">
                  <p className="font-semibold text-darkBlue">Contenu</p>
                  <p className="mt-1 text-xs text-darkBlue/55">
                    Saisissez un texte simple. Les sauts de ligne seront
                    conservés dans l’email envoyé.
                  </p>
                  <textarea
                    ref={bodyTextareaRef}
                    value={formatReservationEmailTemplateForDisplay(
                      selectedTemplate.body,
                    )}
                    onFocus={() => setActiveField("body")}
                    onChange={(event) =>
                      updateTemplate(
                        drawerTemplateKey,
                        "body",
                        parseReservationEmailTemplateDisplayValue(
                          event.target.value,
                        ),
                      )
                    }
                    rows={12}
                    className="mt-3 w-full rounded-2xl border border-darkBlue/10 bg-white/80 px-4 py-3 text-sm outline-none transition placeholder:text-darkBlue/35 focus:border-blue/60 focus:ring-2 focus:ring-blue/20"
                    placeholder="Contenu de l’email"
                  />

                  {selectedValidation?.body?.length ? (
                    <p className="mt-2 text-xs text-red">
                      Variables invalides :{" "}
                      {selectedValidation.body
                        .map((token) => `{{${token}}}`)
                        .join(", ")}
                    </p>
                  ) : null}
                </div>

                <div className="rounded-2xl border border-darkBlue/10 bg-white/70 p-4">
                  <div className="flex items-center gap-2">
                    <Mail className="size-4 text-darkBlue/60" />
                    <p className="font-semibold text-darkBlue">
                      Aperçu avec données fictives
                    </p>
                  </div>
                  <p className="mt-1 text-xs text-darkBlue/55">
                    Cet aperçu simule l’email final reçu par le client.
                  </p>

                  <div className="mt-4 rounded-[24px] border border-darkBlue/10 bg-white p-4 shadow-sm">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-darkBlue/45">
                      Sujet
                    </p>
                    <p className="mt-1 whitespace-pre-line text-base font-semibold leading-6 text-darkBlue">
                      {selectedPreview?.subject || "-"}
                    </p>

                    <div className="mt-4 rounded-2xl border border-darkBlue/10 bg-lightGrey/70 p-4">
                      <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-darkBlue/45">
                        Contenu
                      </p>
                      <p className="mt-2 whitespace-pre-line text-sm leading-6 text-darkBlue">
                        {selectedPreview?.body || "-"}
                      </p>

                      {drawerTemplateKey === "bank_hold_action_required" ? (
                        <div className="mt-4">
                          <span className="inline-flex rounded-xl bg-blue px-4 py-2 text-sm font-semibold text-white">
                            Valider mon empreinte bancaire
                          </span>
                        </div>
                      ) : null}
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <div className="tablet:hidden border-t border-darkBlue/10 bg-white px-4 py-3">
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-xs font-semibold uppercase tracking-[0.14em] text-darkBlue/45">
                    Variables
                  </p>
                </div>

                <button
                  type="button"
                  onClick={() => resetTemplateToDefault(drawerTemplateKey)}
                  className="inline-flex shrink-0 items-center gap-2 rounded-xl border border-darkBlue/10 bg-white px-3 py-2 text-sm font-semibold text-darkBlue transition hover:bg-darkBlue/5"
                >
                  <RotateCcw className="size-4" />
                  Réinit.
                </button>
              </div>

              {renderVariableButtons(
                "hide-scrollbar mt-3 flex gap-2 overflow-x-auto pb-1",
              )}
            </div>

            <div className="border-t border-darkBlue/10 bg-white px-4 py-3 midTablet:px-6">
              <div className="flex flex-wrap items-center justify-end gap-3">
                <SaveButton saveUI={drawerSaveUI} onClick={handleSaveClick} />

                <button
                  type="button"
                  onClick={requestCloseDrawer}
                  className="inline-flex items-center justify-center gap-2 rounded-full border border-darkBlue/15 bg-darkBlue/5 px-4 py-2 text-sm font-medium text-darkBlue hover:bg-darkBlue/8"
                >
                  Fermer
                </button>
              </div>
            </div>

            {showCloseWarning ? (
              <div className="absolute inset-0 z-[3] flex items-center justify-center bg-darkBlue/20 p-4">
                <div className="w-full max-w-[420px] rounded-3xl border border-darkBlue/10 bg-white p-5 shadow-[0_25px_80px_rgba(19,30,54,0.25)]">
                  <p className="text-base font-semibold text-darkBlue">
                    Modifications non enregistrées
                  </p>
                  <p className="mt-2 text-sm leading-6 text-darkBlue/65">
                    Les changements de ce template n&apos;ont pas été
                    enregistrés.
                  </p>

                  <div className="mt-5 flex flex-col gap-2 tablet:flex-row tablet:justify-end">
                    <button
                      type="button"
                      onClick={abandonChangesAndClose}
                      className="inline-flex items-center justify-center rounded-xl border border-red/20 bg-red/10 px-4 py-3 text-sm font-semibold text-red transition hover:bg-red/15"
                    >
                      Abandonner
                    </button>

                    <button
                      type="button"
                      onClick={saveAndClose}
                      className="inline-flex items-center justify-center rounded-xl bg-darkBlue px-4 py-3 text-sm font-semibold text-white transition hover:opacity-95"
                    >
                      Enregistrer
                    </button>
                  </div>
                </div>
              </div>
            ) : null}
          </div>
        </div>
      )}
    </>
  );
}
