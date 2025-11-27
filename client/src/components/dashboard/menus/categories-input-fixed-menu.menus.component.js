// REACT HOOK FORM
import { useFieldArray, Controller } from "react-hook-form";

// I18N
import { useTranslation } from "next-i18next";

// ICONS
import { PlusCircle, MinusCircle, AlertCircle } from "lucide-react";

export default function CategoriesInputFixedMenuComponent(props) {
  const { t } = useTranslation("menus");

  const {
    control,
    combinationIndex,
    categories,
    errorFields,
    isEditing,
    setErrorFields,
  } = props;

  const { fields, append, remove } = useFieldArray({
    control,
    name: `combinations.${combinationIndex}.categories`,
  });

  function handleCategoryChange(value, catIndex) {
    if (value !== "") {
      setErrorFields((prevErrors) =>
        prevErrors
          .map((error) => {
            if (error.comboIndex === combinationIndex) {
              return {
                ...error,
                emptyCategories: error.emptyCategories.filter(
                  (index) => index !== catIndex
                ),
              };
            }
            return error;
          })
          .filter(
            (error) => error.emptyCategories.length > 0 || error.emptyPrice
          )
      );
    }
  }

  const hasCategoryError = (j) =>
    errorFields.some(
      (error) =>
        error.comboIndex === combinationIndex &&
        error.emptyCategories.includes(j)
    );

  return (
    <div className={`flex flex-wrap ${!props.isEditing && "gap-2"}`}>
      {fields.map((field, j) => (
        <div
          key={field.id}
          className="flex items-center gap-2 max-w-full mobile:max-w-none"
        >
          <div className="flex flex-col gap-1 min-w-[180px]">
            <div className="relative">
              <Controller
                control={control}
                name={`combinations.${combinationIndex}.categories.${j}.value`}
                render={({ field: ctrlField }) => (
                  <select
                    {...ctrlField}
                    // on force toujours la valeur depuis RHF
                    value={ctrlField.value ?? ""}
                    onChange={(e) => {
                      ctrlField.onChange(e); // met à jour RHF
                      handleCategoryChange(e.target.value, j); // ta logique d'erreur
                    }}
                    className={`h-11 w-full rounded-xl border bg-white/80 px-3 pr-9 text-sm outline-none transition appearance-none
                      ${
                        hasCategoryError(j)
                          ? "border-red/70 focus:border-red"
                          : "border-darkBlue/10 focus:border-darkBlue/40 "
                      }`}
                    disabled={!isEditing}
                  >
                    <option value="">{t("labels.select")}</option>
                    {categories?.map((category, k) => (
                      <option key={k} value={category.name}>
                        {category.name}
                      </option>
                    ))}
                  </select>
                )}
              />

              {/* Petite flèche de select (pure déco) */}
              <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-darkBlue/30 text-xs">
                ▾
              </span>
            </div>

            {hasCategoryError(j) && (
              <p className="flex items-center gap-1 text-[11px] text-red mt-0.5">
                <AlertCircle className="h-3.5 w-3.5" />
                <span>{t("form.fixed.labels.categoryRequired")}</span>
              </p>
            )}
          </div>

          {isEditing && (
            <div className="flex items-center gap-1">
              {/* Ajouter une catégorie */}
              {j === fields.length - 1 && (
                <button
                  type="button"
                  onClick={() => append({ value: "" })}
                  className="inline-flex items-center justify-center h-9 w-9 rounded-full border border-darkBlue/15 bg-darkBlue/5 text-darkBlue hover:bg-darkBlue/10 transition"
                >
                  <PlusCircle className="h-4 w-4" />
                </button>
              )}

              {/* Supprimer la dernière catégorie (si > 1) */}
              {fields.length > 1 && j === fields.length - 1 && (
                <button
                  type="button"
                  onClick={() => remove(j)}
                  className="inline-flex items-center justify-center h-9 w-9 rounded-full border border-red/20 bg-red/5 text-red hover:bg-red/10 transition"
                >
                  <MinusCircle className="h-4 w-4" />
                </button>
              )}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
