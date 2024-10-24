// TIPTAP EDITOR
import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import TextStyle from "@tiptap/extension-text-style";
import Color from "@tiptap/extension-color";
import Underline from "@tiptap/extension-underline";
import Placeholder from "@tiptap/extension-placeholder";

import { BoldSvg } from "../_svgs/bold.svg";
import { ItalicSvg } from "../_svgs/italic.svg";
import { StrikeSvg } from "../_svgs/strike.svg";
import { UnderlineSvg } from "../_svgs/underline.svg";
import { BulletListSvg } from "../_svgs/bullet-list.svg";
import { OrderedListSvg } from "../_svgs/ordered-list.svg";

// I18N
import { useTranslation } from "next-i18next";
import { useEffect } from "react";

function MenuBar({ editor, t }) {
  if (!editor) {
    return null;
  }

  return (
    <div className="control-group">
      <div className="button-group">
        <button
          type="button"
          onClick={() => editor.chain().focus().toggleBold().run()}
          disabled={!editor.can().chain().focus().toggleBold().run()}
          className={editor.isActive("bold") ? "is-active" : ""}
        >
          <BoldSvg
            width={15}
            height={15}
            fillColor={editor.isActive("bold") ? "white" : ""}
          />
        </button>

        <button
          type="button"
          onClick={() => editor.chain().focus().toggleItalic().run()}
          disabled={!editor.can().chain().focus().toggleItalic().run()}
          className={editor.isActive("italic") ? "is-active" : ""}
        >
          <ItalicSvg
            width={15}
            height={15}
            fillColor={editor.isActive("italic") ? "white" : ""}
          />
        </button>

        <button
          type="button"
          onClick={() => editor.chain().focus().toggleStrike().run()}
          disabled={!editor.can().chain().focus().toggleStrike().run()}
          className={editor.isActive("strike") ? "is-active" : ""}
        >
          <StrikeSvg
            width={20}
            height={20}
            fillColor={editor.isActive("strike") ? "white" : ""}
          />
        </button>

        <button
          type="button"
          onClick={() => editor.chain().focus().toggleUnderline().run()}
          disabled={!editor.can().chain().focus().toggleUnderline().run()}
          className={editor.isActive("underline") ? "is-active" : ""}
        >
          <UnderlineSvg
            width={15}
            height={15}
            fillColor={editor.isActive("underline") ? "white" : ""}
          />
        </button>

        <button
          type="button"
          onClick={() => editor.chain().focus().setParagraph().run()}
          className={editor.isActive("paragraph") ? "is-active" : ""}
        >
          {t("editor.text")}
        </button>

        <button
          type="button"
          onClick={() =>
            editor.chain().focus().toggleHeading({ level: 1 }).run()
          }
          className={
            editor.isActive("heading", { level: 1 }) ? "is-active" : ""
          }
        >
          {t("editor.title")} 1
        </button>

        <button
          type="button"
          onClick={() =>
            editor.chain().focus().toggleHeading({ level: 2 }).run()
          }
          className={
            editor.isActive("heading", { level: 2 }) ? "is-active" : ""
          }
        >
          {t("editor.title")} 2
        </button>

        <button
          type="button"
          onClick={() =>
            editor.chain().focus().toggleHeading({ level: 3 }).run()
          }
          className={
            editor.isActive("heading", { level: 3 }) ? "is-active" : ""
          }
        >
          {t("editor.title")} 3
        </button>

        <button
          type="button"
          onClick={() => editor.chain().focus().toggleBulletList().run()}
          className={editor.isActive("bulletList") ? "is-active" : ""}
        >
          <BulletListSvg
            width={20}
            height={20}
            fillColor={editor.isActive("bulletList") ? "white" : ""}
          />
        </button>

        <button
          type="button"
          onClick={() => editor.chain().focus().toggleOrderedList().run()}
          className={editor.isActive("orderedList") ? "is-active" : ""}
        >
          <OrderedListSvg
            width={25}
            height={22}
            fillColor={editor.isActive("orderedList") ? "white" : ""}
          />
        </button>
      </div>
    </div>
  );
}

export default function TiptapEditor({ value = "", onChange }) {
  const { t } = useTranslation("news");
  const editor = useEditor({
    extensions: [
      StarterKit,
      TextStyle,
      Color,
      Underline,
      Placeholder.configure({
        placeholder: t("editor.startWrite"),
      }),
    ],
    content: value, // Passer la valeur initiale ici
    onUpdate: ({ editor }) => {
      const html = editor.getHTML().replace(/<p><\/p>/g, "<br>");
      if (onChange) {
        onChange(html);
      }
    },
    editorProps: {
      attributes: {
        class: "prose  focus:outline-none",
      },
    },
    immediatelyRender: false,
  });

  useEffect(() => {
    if (editor && value !== editor.getHTML()) {
      editor.commands.setContent(value); // Mettre à jour le contenu lorsque la valeur change
    }
  }, [value, editor]);

  return (
    <div className="tiptap-editor">
      <MenuBar editor={editor} t={t} />
      <EditorContent editor={editor} className="editor-content" />
    </div>
  );
}