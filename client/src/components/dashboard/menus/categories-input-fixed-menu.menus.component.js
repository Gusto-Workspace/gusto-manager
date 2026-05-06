import { useState } from "react";

// REACT HOOK FORM
import { useFieldArray, Controller } from "react-hook-form";

// I18N
import { useTranslation } from "next-i18next";

// ICONS
import { PlusCircle, MinusCircle, AlertCircle } from "lucide-react";

const OTHER_CATEGORY_VALUE = "__other_category__";

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
  const [manualFields, setManualFields] = useState({});

  const categoryNames = (categories || [])
    .map((category) => category?.name)
    .filter(Boolean);

  function handleCategoryChange(value, catIndex) {
    if (String(value || "").trim() !== "") {
      setErrorFields((prevErrors) =>
        prevErrors
          .map((error) => {
            if (error.comboIndex === combinationIndex) {
              return {
                ...error,
                emptyCategories: error.emptyCategories.filter(
                  (index) => index !== catIndex,
                ),
              };
            }
            return error;
          })
          .filter(
            (error) => error.emptyCategories.length > 0 || error.emptyPrice,
          ),
      );
    }
  }

  const hasCategoryError = (j) =>
    errorFields.some(
      (error) =>
        error.comboIndex === combinationIndex &&
        error.emptyCategories.includes(j),
    );

  const isLastField = (j) => j === fields.length - 1;

  function setManualFieldMode(fieldId, enabled) {
    setManualFields((prev) => ({
      ...prev,
      [fieldId]: enabled,
    }));
  }

  return (
    <div className="flex flex-col gap-2 midTablet:flex-row midTablet:flex-wrap">
      {fields.map((field, j) => (
        <div
          key={field.id}
          className={`w-full ${isLastField(j) ? "midTablet:w-auto" : "midTablet:w-auto"}`}
        >
          <div className="flex w-full items-start gap-2 midTablet:w-auto midTablet:items-start">
            <div className="flex w-full flex-col gap-1 min-w-0 midTablet:min-w-[180px]">
              <div className="relative w-full">
                <Controller
                  control={control}
                  name={`combinations.${combinationIndex}.categories.${j}.value`}
                  render={({ field: ctrlField }) => {
                    const value = ctrlField.value ?? "";
                    const isManualValue =
                      value !== "" && !categoryNames.includes(value);
                    const isManualMode =
                      manualFields[field.id] === true || isManualValue;

                    if (isManualMode) {
                      return (
                        <div className="flex flex-col gap-2">
                          <input
                            type="text"
                            value={value}
                            onChange={(e) => {
                              ctrlField.onChange(e.target.value);
                              handleCategoryChange(e.target.value, j);
                            }}
                            placeholder={t(
                              "form.fixed.labels.manualCategory",
                              "Saisir une categorie",
                            )}
                            className={`h-11 w-full rounded-xl border bg-white/80 px-3 text-base outline-none transition disabled:cursor-default disabled:opacity-70 ${
                              hasCategoryError(j)
                                ? "border-red/70 focus:border-red"
                                : "border-darkBlue/10 focus:border-darkBlue/40"
                            }`}
                            disabled={!isEditing}
                          />

                          {isEditing && (
                            <button
                              type="button"
                              onClick={() => {
                                setManualFieldMode(field.id, false);
                                ctrlField.onChange("");
                              }}
                              className="w-fit text-[11px] font-medium text-darkBlue/55 transition hover:text-darkBlue"
                            >
                              {t(
                                "form.fixed.buttons.backToCategories",
                                "Choisir dans la liste",
                              )}
                            </button>
                          )}
                        </div>
                      );
                    }

                    return (
                      <>
                        <select
                          {...ctrlField}
                          value={value}
                          onChange={(e) => {
                            const nextValue = e.target.value;

                            if (nextValue === OTHER_CATEGORY_VALUE) {
                              setManualFieldMode(field.id, true);
                              ctrlField.onChange("");
                              return;
                            }

                            setManualFieldMode(field.id, false);
                            ctrlField.onChange(nextValue);
                            handleCategoryChange(nextValue, j);
                          }}
                          className={`h-11 w-full rounded-xl border bg-white/80 px-3 pr-9 text-base outline-none transition appearance-none ${
                            hasCategoryError(j)
                              ? "border-red/70 focus:border-red"
                              : "border-darkBlue/10 focus:border-darkBlue/40"
                          }`}
                          disabled={!isEditing}
                        >
                          <option value="">{t("labels.select")}</option>
                          {categories?.map((category, k) => (
                            <option key={k} value={category.name}>
                              {category.name}
                            </option>
                          ))}
                          <option value={OTHER_CATEGORY_VALUE}>
                            {t("labels.other", "Autre")}
                          </option>
                        </select>

                        <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-darkBlue/30 text-xs">
                          ▾
                        </span>
                      </>
                    );
                  }}
                />
              </div>

              {hasCategoryError(j) && (
                <p className="mt-0.5 flex items-center gap-1 text-[11px] text-red">
                  <AlertCircle className="h-3.5 w-3.5" />
                  <span>Requis</span>
                </p>
              )}
            </div>

            {/* Mobile : bouton - sur la même ligne que le dernier input */}
            {isEditing && isLastField(j) && fields.length > 1 && (
              <div className="flex pt-1 midTablet:hidden">
                <button
                  type="button"
                  onClick={() => remove(j)}
                  className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-red/20 bg-red/5 text-red transition hover:bg-red/10"
                >
                  <MinusCircle className="h-4 w-4" />
                </button>
              </div>
            )}

            {/* midTablet+ : boutons à droite du dernier input */}
            {isEditing && isLastField(j) && (
              <div className="hidden midTablet:flex midTablet:items-center midTablet:gap-1 midTablet:pt-1">
                <button
                  type="button"
                  onClick={() => append({ value: "" })}
                  className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-darkBlue/15 bg-darkBlue/5 text-darkBlue transition hover:bg-darkBlue/10"
                >
                  <PlusCircle className="h-4 w-4" />
                </button>

                {fields.length > 1 && (
                  <button
                    type="button"
                    onClick={() => remove(j)}
                    className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-red/20 bg-red/5 text-red transition hover:bg-red/10"
                  >
                    <MinusCircle className="h-4 w-4" />
                  </button>
                )}
              </div>
            )}
          </div>

          {/* Mobile : bouton + sur la ligne du dessous */}
          {isEditing && isLastField(j) && (
            <div className="mt-2 flex justify-start midTablet:hidden">
              <button
                type="button"
                onClick={() => append({ value: "" })}
                className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-darkBlue/15 bg-darkBlue/5 text-darkBlue transition hover:bg-darkBlue/10"
              >
                <PlusCircle className="h-4 w-4" />
              </button>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
