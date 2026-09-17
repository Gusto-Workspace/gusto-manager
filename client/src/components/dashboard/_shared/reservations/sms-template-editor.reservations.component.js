import { useCallback, useEffect, useRef, useState } from "react";
import {
  SMS_TEMPLATE_VARIABLES,
  deleteSmsTemplateSelection,
  insertSmsTemplateVariable,
  normalizeSmsTemplateSelectionToGsm7,
  smsTemplateToDisplay,
  splitSmsTemplateTokens,
} from "./sms-message.utils";

function tokenDisplayFromElement(element) {
  const backend = element?.dataset?.smsToken;
  return (
    SMS_TEMPLATE_VARIABLES.find((variable) => variable.backend === backend)
      ?.display || ""
  );
}

function readEditorText(editor) {
  return Array.from(editor?.childNodes || [])
    .map((node) => {
      if (node.nodeType === Node.TEXT_NODE) return node.nodeValue || "";
      if (node.nodeType !== Node.ELEMENT_NODE) return "";
      if (node.dataset?.smsToken) return tokenDisplayFromElement(node);
      if (node.tagName === "BR") return "\n";
      return node.textContent || "";
    })
    .join("");
}

function selectionOffsets(editor, fallback) {
  const selection = window.getSelection();
  if (!selection?.rangeCount) return fallback;
  const range = selection.getRangeAt(0);
  if (!editor.contains(range.startContainer) || !editor.contains(range.endContainer)) {
    return fallback;
  }

  function offsetFor(node, offset) {
    const prefix = document.createRange();
    prefix.selectNodeContents(editor);
    prefix.setEnd(node, offset);
    return smsTemplateToDisplay(prefix.toString()).length;
  }

  return {
    start: offsetFor(range.startContainer, range.startOffset),
    end: offsetFor(range.endContainer, range.endOffset),
  };
}

function placeCaret(editor, requestedOffset) {
  const offset = Math.max(0, requestedOffset);
  const range = document.createRange();
  const selection = window.getSelection();
  let consumed = 0;

  for (const node of editor.childNodes) {
    const token =
      node.nodeType === Node.ELEMENT_NODE && node.dataset?.smsToken
        ? tokenDisplayFromElement(node)
        : "";
    const length = token.length || node.nodeValue?.length || 0;
    if (offset <= consumed + length) {
      if (token) {
        range.setStartAfter(node);
      } else {
        range.setStart(node, Math.max(0, offset - consumed));
      }
      range.collapse(true);
      selection.removeAllRanges();
      selection.addRange(range);
      return;
    }
    consumed += length;
  }

  range.selectNodeContents(editor);
  range.collapse(false);
  selection.removeAllRanges();
  selection.addRange(range);
}

function renderEditorValue(editor, value, caretOffset = null) {
  const fragment = document.createDocumentFragment();
  splitSmsTemplateTokens(value).forEach((part) => {
    if (part.type === "text") {
      fragment.appendChild(document.createTextNode(part.value));
      return;
    }
    const token = document.createElement("span");
    token.contentEditable = "false";
    token.dataset.smsToken = part.variable.backend;
    token.className =
      "rounded bg-darkBlue/[0.035] font-semibold text-darkBlue";
    token.textContent = part.variable.display;
    fragment.appendChild(token);
  });
  editor.replaceChildren(fragment);
  if (caretOffset !== null) placeCaret(editor, caretOffset);
}

function editorNeedsNormalization(editor, rawValue) {
  if (smsTemplateToDisplay(rawValue) !== rawValue) return true;
  return Array.from(editor.childNodes).some((node) => {
    if (node.nodeType === Node.TEXT_NODE) {
      return SMS_TEMPLATE_VARIABLES.some((variable) =>
        String(node.nodeValue || "").includes(variable.display),
      );
    }
    return !(
      node.nodeType === Node.ELEMENT_NODE && Boolean(node.dataset?.smsToken)
    );
  });
}

export default function SmsTemplateEditorReservationsComponent({
  value,
  onChange,
  invalid = false,
  compact = false,
}) {
  const editorRef = useRef(null);
  const [charactersAdapted, setCharactersAdapted] = useState(false);
  const lastSelectionRef = useRef({ start: String(value || "").length, end: String(value || "").length });

  const rememberSelection = useCallback(() => {
    if (!editorRef.current) return lastSelectionRef.current;
    const offsets = selectionOffsets(
      editorRef.current,
      lastSelectionRef.current,
    );
    lastSelectionRef.current = offsets;
    return offsets;
  }, []);

  const replaceSelection = useCallback(
    (text) => {
      const editor = editorRef.current;
      if (!editor) return;
      const selection = selectionOffsets(editor, lastSelectionRef.current);
      const insertion = insertSmsTemplateVariable(
        value,
        smsTemplateToDisplay(text),
        selection.start,
        selection.end,
      );
      const normalized = normalizeSmsTemplateSelectionToGsm7(
        insertion.value,
        insertion.cursor,
        insertion.cursor,
      );
      renderEditorValue(editor, normalized.value, normalized.end);
      lastSelectionRef.current = {
        start: normalized.start,
        end: normalized.end,
      };
      setCharactersAdapted(normalized.adapted);
      editor.focus();
      onChange(normalized.value);
    },
    [onChange, value],
  );

  useEffect(() => {
    const editor = editorRef.current;
    if (!editor) return;
    const logicalValue = smsTemplateToDisplay(value);
    if (readEditorText(editor) !== logicalValue) {
      renderEditorValue(editor, logicalValue);
      lastSelectionRef.current = {
        start: logicalValue.length,
        end: logicalValue.length,
      };
    }
  }, [value]);

  function handleInput() {
    const editor = editorRef.current;
    if (!editor) return;
    const selection = selectionOffsets(editor, lastSelectionRef.current);
    const rawValue = readEditorText(editor);
    const normalized = normalizeSmsTemplateSelectionToGsm7(
      rawValue,
      selection.start,
      selection.end,
    );
    const logicalValue = normalized.value;
    const logicalSelection = {
      start: normalized.start,
      end: normalized.end,
    };

    if (normalized.adapted || editorNeedsNormalization(editor, rawValue)) {
      renderEditorValue(editor, logicalValue, logicalSelection.end);
    }
    lastSelectionRef.current = logicalSelection;
    setCharactersAdapted(normalized.adapted);
    onChange(logicalValue);
  }

  function handleKeyDown(event) {
    if (event.key === "Enter") {
      event.preventDefault();
      replaceSelection("\n");
      return;
    }
    if (!event.key.match(/^(Backspace|Delete)$/)) return;

    const selection = rememberSelection();
    const deletion = deleteSmsTemplateSelection(
      value,
      selection.start,
      selection.end,
      event.key === "Backspace" ? "backward" : "forward",
    );
    if (!deletion) return;

    event.preventDefault();
    renderEditorValue(editorRef.current, deletion.value, deletion.cursor);
    lastSelectionRef.current = {
      start: deletion.cursor,
      end: deletion.cursor,
    };
    setCharactersAdapted(false);
    onChange(deletion.value);
  }

  function handleBeforeInput(event) {
    if (
      !["insertParagraph", "insertLineBreak"].includes(
        event.nativeEvent?.inputType,
      )
    ) {
      return;
    }
    event.preventDefault();
    replaceSelection("\n");
  }

  function handlePaste(event) {
    event.preventDefault();
    replaceSelection(event.clipboardData.getData("text/plain"));
  }

  return (
    <div
      className={`grid gap-3 ${
        compact
          ? ""
          : "desktop:grid-cols-[minmax(0,3fr)_minmax(12rem,1fr)]"
      }`}
    >
      <div className="min-w-0">
        <div
          ref={editorRef}
          id="sms_reminder_template"
          role="textbox"
          aria-labelledby="sms_reminder_template_label"
          aria-multiline="true"
          aria-invalid={invalid}
          contentEditable
          suppressContentEditableWarning
          spellCheck
          onBeforeInput={handleBeforeInput}
          onInput={handleInput}
          onKeyDown={handleKeyDown}
          onKeyUp={rememberSelection}
          onMouseUp={rememberSelection}
          onBlur={rememberSelection}
          onPaste={handlePaste}
          className={`min-h-36 w-full whitespace-pre-wrap break-words rounded-xl border px-3 py-2 text-sm outline-none ${
            invalid
              ? "border-red bg-red/5 focus:border-red focus:ring-1 focus:ring-red/20"
              : "border-darkBlue/15 focus:border-darkBlue/30 focus:ring-1 focus:ring-darkBlue/10"
          }`}
        />
        {charactersAdapted ? (
          <p className="mt-1.5 text-xs leading-relaxed text-darkBlue/55">
            Certains caractères ont été adaptés pour conserver le message au
            format SMS standard.
          </p>
        ) : null}
      </div>
      <div className="rounded-2xl border border-darkBlue/10 bg-white/60 p-3">
        <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-darkBlue/55">
          Variables
        </p>
        <div className="flex flex-wrap gap-2">
          {SMS_TEMPLATE_VARIABLES.map((variable) => (
            <button
              key={variable.backend}
              type="button"
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => replaceSelection(variable.display)}
              className="rounded-full border border-darkBlue/10 bg-darkBlue/[0.035] px-2.5 py-1.5 text-left text-xs font-medium text-darkBlue transition hover:border-blue/30 hover:bg-blue/5"
            >
              {variable.display}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
