// TIPTAP EDITOR
import { useEffect } from "react";
import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import TextStyle from "@tiptap/extension-text-style";
import Color from "@tiptap/extension-color";
import Underline from "@tiptap/extension-underline";
import Placeholder from "@tiptap/extension-placeholder";
import ListItem from "@tiptap/extension-list-item";

// ICONS
import { BoldSvg } from "../_svgs/bold.svg";
import { ItalicSvg } from "../_svgs/italic.svg";
import { StrikeSvg } from "../_svgs/strike.svg";
import { UnderlineSvg } from "../_svgs/underline.svg";
import { BulletListSvg } from "../_svgs/bullet-list.svg";
import { OrderedListSvg } from "../_svgs/ordered-list.svg";

// I18N
import { useTranslation } from "next-i18next";

function MenuBar({ editor, t }) {
  if (!editor) return null;

  const btnBase =
    "inline-flex items-center justify-center h-8 rounded-lg px-2 text-[11px] font-medium tracking-[0.05em] uppercase transition disabled:opacity-40 disabled:cursor-not-allowed";
  const btnNeutral = "text-darkBlue/60 hover:bg-darkBlue/5";
  const btnActive = "bg-darkBlue text-white shadow-sm";

  const iconBtnBase =
    "inline-flex items-center justify-center h-8 w-8 rounded-lg transition disabled:opacity-40 disabled:cursor-not-allowed";
  const iconNeutral = "text-darkBlue/60 hover:bg-darkBlue/5";
  const iconActive = "bg-darkBlue text-white shadow-sm";

  return (
    <div className="rounded-2xl border border-darkBlue/10 bg-white/80 px-2 py-1.5 flex flex-wrap gap-1">
      {/* Bold */}
      <button
        type="button"
        onClick={() => editor.chain().focus().toggleBold().run()}
        disabled={!editor.can().chain().focus().toggleBold().run()}
        className={`${iconBtnBase} ${
          editor.isActive("bold") ? iconActive : iconNeutral
        }`}
      >
        <BoldSvg
          width={15}
          height={15}
          fillColor={editor.isActive("bold") ? "white" : "#131E36"}
        />
      </button>

      {/* Italic */}
      <button
        type="button"
        onClick={() => editor.chain().focus().toggleItalic().run()}
        disabled={!editor.can().chain().focus().toggleItalic().run()}
        className={`${iconBtnBase} ${
          editor.isActive("italic") ? iconActive : iconNeutral
        }`}
      >
        <ItalicSvg
          width={15}
          height={15}
          fillColor={editor.isActive("italic") ? "white" : "#131E36"}
        />
      </button>

      {/* Strike */}
      <button
        type="button"
        onClick={() => editor.chain().focus().toggleStrike().run()}
        disabled={!editor.can().chain().focus().toggleStrike().run()}
        className={`${iconBtnBase} ${
          editor.isActive("strike") ? iconActive : iconNeutral
        }`}
      >
        <StrikeSvg
          width={20}
          height={20}
          fillColor={editor.isActive("strike") ? "white" : "#131E36"}
        />
      </button>

      {/* Underline */}
      <button
        type="button"
        onClick={() => editor.chain().focus().toggleUnderline().run()}
        disabled={!editor.can().chain().focus().toggleUnderline().run()}
        className={`${iconBtnBase} ${
          editor.isActive("underline") ? iconActive : iconNeutral
        }`}
      >
        <UnderlineSvg
          width={15}
          height={15}
          fillColor={editor.isActive("underline") ? "white" : "#131E36"}
        />
      </button>

      <span className="mx-1 h-6 w-px bg-darkBlue/10 self-center" />

      {/* Paragraph */}
      <button
        type="button"
        onClick={() => editor.chain().focus().setParagraph().run()}
        className={`${btnBase} ${
          editor.isActive("paragraph") ? btnActive : btnNeutral
        }`}
      >
        {t("editor.text")}
      </button>

      {/* H1 */}
      <button
        type="button"
        onClick={() =>
          editor.chain().focus().toggleHeading({ level: 1 }).run()
        }
        className={`${btnBase} ${
          editor.isActive("heading", { level: 1 }) ? btnActive : btnNeutral
        }`}
      >
        {t("editor.title")} 1
      </button>

      {/* H2 */}
      <button
        type="button"
        onClick={() =>
          editor.chain().focus().toggleHeading({ level: 2 }).run()
        }
        className={`${btnBase} ${
          editor.isActive("heading", { level: 2 }) ? btnActive : btnNeutral
        }`}
      >
        {t("editor.title")} 2
      </button>

      {/* H3 */}
      <button
        type="button"
        onClick={() =>
          editor.chain().focus().toggleHeading({ level: 3 }).run()
        }
        className={`${btnBase} ${
          editor.isActive("heading", { level: 3 }) ? btnActive : btnNeutral
        }`}
      >
        {t("editor.title")} 3
      </button>

      <span className="mx-1 h-6 w-px bg-darkBlue/10 self-center" />

      {/* Bullet list */}
      <button
        type="button"
        onClick={() => editor.chain().focus().toggleBulletList().run()}
        className={`${iconBtnBase} ${
          editor.isActive("bulletList") ? iconActive : iconNeutral
        }`}
      >
        <BulletListSvg
          width={20}
          height={20}
          fillColor={editor.isActive("bulletList") ? "white" : "#131E36"}
        />
      </button>

      {/* Ordered list */}
      <button
        type="button"
        onClick={() => editor.chain().focus().toggleOrderedList().run()}
        className={`${iconBtnBase} ${
          editor.isActive("orderedList") ? iconActive : iconNeutral
        }`}
      >
        <OrderedListSvg
          width={25}
          height={22}
          fillColor={editor.isActive("orderedList") ? "white" : "#131E36"}
        />
      </button>
    </div>
  );
}

export default function TiptapEditor({ value = "", onChange }) {
  const { t } = useTranslation("news");

  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        listItem: false,
      }),
      ListItem.configure({
        HTMLAttributes: { class: "my-0 py-0" },
      }),
      TextStyle,
      Color,
      Underline,
      Placeholder.configure({
        placeholder: "Commencez à écrire...",
      }),
    ],
    content: value,
    onUpdate: ({ editor }) => {
      let html = editor.getHTML();

      // Remplace les <p> vides hors listes par <br> pour éviter les gros trous
      const container = document.createElement("div");
      container.innerHTML = html;
      container.querySelectorAll("p").forEach((p) => {
        if (!p.textContent.trim() && !p.closest("ul") && !p.closest("ol")) {
          const br = document.createElement("br");
          p.replaceWith(br);
        }
      });
      html = container.innerHTML;

      if (onChange) onChange(html);
    },
    editorProps: {
      attributes: {
        class:
          "prose max-w-none text-sm text-darkBlue focus:outline-none min-h-[160px]",
      },
    },
    immediatelyRender: false,
  });

  // Sync quand tu charges un article en édition
  useEffect(() => {
    if (!editor) return;
    if (value && value !== editor.getHTML()) {
      editor.commands.setContent(value);
    }
  }, [value, editor]);

  return (
    <div className="flex flex-col gap-2">
      <MenuBar editor={editor} t={t} />
      <div className="rounded-2xl border border-darkBlue/10 bg-white px-3 py-2 min-h-[180px] max-h-[420px] overflow-y-auto">
        <EditorContent editor={editor} />
      </div>
    </div>
  );
}
