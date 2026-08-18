import { useRef, useState } from "react";
import axios from "axios";
import { useTranslation } from "next-i18next";
import { FileSpreadsheet, Upload } from "lucide-react";
import { getAdminAuthConfig } from "../_shared/utils/admin-auth.utils";

export default function ImportDishCardAdminComponent({
  restaurantId,
  disabled,
  onLoadingChange,
  onImported,
}) {
  const { t } = useTranslation("admin");
  const fileInputRef = useRef(null);
  const [loading, setLoading] = useState(false);
  const [selectedFile, setSelectedFile] = useState(null);
  const [errorMessage, setErrorMessage] = useState("");
  const [successMessage, setSuccessMessage] = useState("");

  function updateLoading(value) {
    setLoading(value);
    onLoadingChange?.(value);
  }

  function handleFileChange(event) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file || !restaurantId) return;

    if (!/\.xlsx$/i.test(file.name)) {
      setSuccessMessage("");
      setErrorMessage(t("restaurants.form.importCard.invalidFile"));
      return;
    }

    setSelectedFile(file);
    setErrorMessage("");
    setSuccessMessage("");
  }

  function cancelSelection() {
    setSelectedFile(null);
    setErrorMessage("");
  }

  async function importSelectedFile() {
    if (!selectedFile || !restaurantId) return;

    const formData = new FormData();
    formData.append("file", selectedFile);

    try {
      updateLoading(true);
      setErrorMessage("");
      setSuccessMessage("");

      const response = await axios.post(
        `${process.env.NEXT_PUBLIC_API_URL}/admin/restaurants/${restaurantId}/dishes/import`,
        formData,
        getAdminAuthConfig(),
      );
      const summary = response.data.summary || {};

      setSuccessMessage(
        t("restaurants.form.importCard.success", {
          categories: summary.categoryCount || 0,
          subCategories: summary.subCategoryCount || 0,
          dishes: summary.dishCount || 0,
        }),
      );
      setSelectedFile(null);
      onImported?.(response.data.restaurant);
    } catch (error) {
      const details = Array.isArray(error?.response?.data?.errors)
        ? error.response.data.errors.slice(0, 3)
        : [];
      const detailMessage = details
        .map(
          (detail) =>
            `${t("restaurants.form.importCard.row", { row: detail.row })} ${detail.column}: ${detail.message}`,
        )
        .join(" ");

      setErrorMessage(
        [
          error?.response?.data?.message ||
            t("restaurants.form.importCard.error"),
          detailMessage,
        ]
          .filter(Boolean)
          .join(" "),
      );
    } finally {
      updateLoading(false);
    }
  }

  return (
    <div className="rounded-2xl bg-white/70 border border-darkBlue/10 p-4">
      <div className="flex items-center gap-2 mb-3">
        <div className="inline-flex size-8 items-center justify-center rounded-xl bg-darkBlue/5 border border-darkBlue/10">
          <FileSpreadsheet className="size-4 text-darkBlue/70" />
        </div>
        <div>
          <h3 className="text-sm font-semibold text-darkBlue">
            {t("restaurants.form.importCard.title")}
          </h3>
          <p className="text-xs text-darkBlue/55">
            {t("restaurants.form.importCard.description")}
          </p>
        </div>
      </div>

      <input
        ref={fileInputRef}
        type="file"
        accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
        className="hidden"
        onChange={handleFileChange}
      />

      {errorMessage ? (
        <div className="mb-3 rounded-xl border border-red/20 bg-red/10 px-3 py-2 text-xs text-red">
          {errorMessage}
        </div>
      ) : null}

      {successMessage ? (
        <div className="mb-3 rounded-xl border border-green-700/20 bg-green-50 px-3 py-2 text-xs text-green-800">
          {successMessage}
        </div>
      ) : null}

      {selectedFile ? (
        <div className="rounded-xl border border-darkBlue/10 bg-white p-3">
          <p className="truncate text-sm font-semibold text-darkBlue">
            {t("restaurants.form.importCard.selected", {
              name: selectedFile.name,
            })}
          </p>
          <p className="mt-1 text-xs text-darkBlue/55">
            {t("restaurants.form.importCard.replacementWarning")}
          </p>
          <div className="mt-3 grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={cancelSelection}
              disabled={disabled || loading}
              className="rounded-xl border border-darkBlue/15 bg-white px-3 py-2 text-sm font-semibold text-darkBlue transition hover:bg-darkBlue/5 disabled:opacity-60"
            >
              {t("restaurants.form.importCard.cancel")}
            </button>
            <button
              type="button"
              onClick={importSelectedFile}
              disabled={disabled || loading}
              className="inline-flex items-center justify-center gap-2 rounded-xl bg-blue px-3 py-2 text-sm font-semibold text-white transition hover:bg-blue/90 disabled:opacity-60"
            >
              <Upload className="size-4" />
              {loading
                ? t("restaurants.form.importCard.loading")
                : t("restaurants.form.importCard.import")}
            </button>
          </div>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          disabled={disabled || loading}
          className="inline-flex w-full items-center justify-center gap-2 rounded-xl border border-blue bg-white px-4 py-2.5 text-sm font-semibold text-blue transition hover:bg-blue/5 disabled:opacity-60"
        >
          <Upload className="size-4" />
          {t("restaurants.form.importCard.button")}
        </button>
      )}
    </div>
  );
}
