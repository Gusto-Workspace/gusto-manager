// I18N
import { useTranslation } from "next-i18next";

export default function AddModaleDrinksComponent(props) {
  const { t } = useTranslation("drinks");

  return (
    <div className="fixed inset-0 flex items-center justify-center z-[100]">
      <div
        onClick={() => {
          if (!props.isSubmitting) {
            props.setIsModalOpen(false);
            props.setEditingCategory(null);
            props.setIsDeleting(false);
            props.reset();
          }
        }}
        className="fixed inset-0 bg-black bg-opacity-20"
      />

      <div className="bg-white p-6 rounded-lg shadow-lg mx-6 w-[400px] z-10">
        <h2 className="text-xl font-semibold mb-6 text-center">
          {props.isDeleting
            ? t("buttons.deleteCategory")
            : props.editingCategory
              ? t("buttons.editCategory")
              : t("buttons.addCategory")}
        </h2>

        <form
          onSubmit={props.handleSubmit(props.onSubmit)}
          className="flex flex-col gap-6"
        >
          <div className="flex flex-col gap-2">
            <label className="block font-semibold">
              {t("form.labels.categoryName")}
            </label>

            <input
              type="text"
              placeholder="-"
              defaultValue={props.editingCategory?.name || ""}
              disabled={props.isDeleting || props.isSubmitting}
              {...props.register("name", { required: !props.isDeleting })}
              className={`border p-2 rounded-lg w-full ${
                props.errors.name ? "border-red" : ""
              } ${props.isDeleting || props.isSubmitting ? "opacity-50 cursor-not-allowed" : ""}`}
            />
          </div>

          <div className="flex gap-4">
            <button
              type="submit"
              className="px-4 py-2 rounded-lg bg-blue text-white flex items-center gap-2"
              disabled={props.isSubmitting}
            >
              {props.isSubmitting
                ? t("buttons.loading")
                : props.isDeleting
                  ? t("buttons.confirm")
                  : t("buttons.save")}
            </button>

            <button
              type="button"
              onClick={() => {
                if (!props.isSubmitting) {
                  props.setIsModalOpen(false);
                  props.setEditingCategory(null);
                  props.setIsDeleting(false);
                  props.reset()
                }
              }}
              className="px-4 py-2 rounded-lg text-white bg-red"
              disabled={props.isSubmitting}
            >
              {t("buttons.cancel")}
            </button>
          </div>
        </form>
      </div>

      {props.catAlreadyExist && (
        <div className="fixed inset-0 flex items-center bg-black bg-opacity-20 justify-center z-[101]">
          <div className="absolute bg-white h-[150px] w-[250px] z-[102] flex flex-col gap-4 items-center justify-center p-6 text-center rounded-xl">
            <p>{t("labels.catAlreadyExist")}</p>

            <button
              type="button"
              onClick={() => props.setCatAlreadyExist(false)}
              className="bg-blue px-4 py-1 text-white rounded"
            >
              OK
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
