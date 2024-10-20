import { useState } from "react";

// I18N
import { useTranslation } from "next-i18next";

// SVG
import { EditSvg } from "../_shared/_svgs/_index";

// AXIOS
import axios from "axios";

export default function ContactRestaurantComponent() {
  const { t } = useTranslation("restaurant");

  const [editing, setEditing] = useState(false);

  function handleToggleEdit() {
    setEditing(!editing);
  }

  async function handleSave() {
    console.log("save");
    setEditing(false);
  }

  return (
    <section className="bg-white p-6 rounded-lg drop-shadow-sm w-full">
      <div className="flex justify-between">
        <h1 className="font-bold text-lg">{t("contact.title")}</h1>

        <button onClick={editing ? handleSave : handleToggleEdit}>
          {editing ? (
            <span className="text-white bg-blue px-4 py-2 rounded-lg">
              {t("save")}
            </span>
          ) : (
            <EditSvg />
          )}
        </button>
      </div>
    </section>
  );
}
