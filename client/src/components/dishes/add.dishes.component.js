import { useRouter } from "next/router";

// REACT HOOK FORM
import { useForm } from "react-hook-form";

// I18N
import { useTranslation } from "next-i18next";

export default function AddDishesComponent() {
  const { t } = useTranslation("dishes");
  const router = useRouter();
  const { locale } = router;

  const currencySymbol = locale === "fr" ? "€" : "$";

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm();

  function onSubmit(data) {
    console.log("Form Data:", data);
  }

  return (
    <section className="flex flex-col gap-6">
      <hr className="opacity-20" />

      <h1 className="pl-2 text-2xl">{t("titles.add")}</h1>

      <form
        onSubmit={handleSubmit(onSubmit)}
        className="bg-white p-6 rounded-lg drop-shadow-sm flex flex-col gap-6"
      >
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block font-semibold">{t("menu_name")}</label>
            <input
              type="text"
              placeholder="Product Name"
              {...register("menuName", { required: true })}
              className={`border p-2 rounded-lg w-full ${
                errors.menuName ? "border-red" : ""
              }`}
            />
          </div>

          <div>
            <label className="block font-semibold">{t("ingredients")}</label>
            <input
              type="text"
              placeholder="Lorem Ipsum Text..."
              {...register("ingredients", { required: true })}
              className={`border p-2 rounded-lg w-full ${
                errors.ingredients ? "border-red" : ""
              }`}
            />
          </div>

          <div>
            <label className="block font-semibold">{t("category")}</label>
            <select
              {...register("category", { required: true })}
              className={`border p-2 rounded-lg w-full ${
                errors.category ? "border-red" : ""
              }`}
            >
              <option value="">Sélectionner</option>
              <option value="Category 1">Category 1</option>
              <option value="Category 2">Category 2</option>
              <option value="Category 3">Category 3</option>
            </select>
          </div>

          <div>
            <label className="block font-semibold">{t("status")}</label>
            <div className="flex items-center gap-4">
              <label className="flex items-center gap-2">
                <input
                  type="radio"
                  value="published"
                  {...register("status", { required: true })}
                />
                {t("published")}
              </label>
              <label className="flex items-center gap-2">
                <input
                  type="radio"
                  value="draft"
                  {...register("status", { required: true })}
                />
                {t("draft")}
              </label>
            </div>
          </div>

          <div>
            <label className="block font-semibold">{t("price")}</label>
            <div className="flex items-center">
              <span
                className={`px-3 py-2 rounded-l-lg  ${
                  errors.price ? "border-t border-l border-b border-t-red border-l-red border-b-red" : "border-t border-l border-b"
                }`}
              >
                {currencySymbol}
              </span>

              <input
                type="number"
                placeholder="270"
                {...register("price", { required: true })}
                className={`border p-2 rounded-r-lg w-full ${
                  errors.price ? "border-red" : ""
                }`}
              />
            </div>
          </div>

          <div>
            <label className="block font-semibold">{t("discount")}</label>
            <div className="flex items-center">
              <span className="px-3 py-2 rounded-l-lg border-t border-l border-b">
                %
              </span>
              <input
                type="number"
                placeholder="50"
                {...register("discount")}
                className="border p-2 rounded-r-lg w-full"
              />
            </div>
          </div>
        </div>

        <div>
          <label className="block font-semibold">
            {t("ingredients_description")}
          </label>
          <textarea
            placeholder="There are many variations of passages of Lorem Ipsum available..."
            {...register("description")}
            className="border p-2 rounded-lg w-full"
            rows="5"
          />
        </div>

        <button
          type="submit"
          className="bg-blue w-fit text-white px-4 py-2 rounded-lg hover:bg-blue-600"
        >
          {t("save")}
        </button>
      </form>
    </section>
  );
}
