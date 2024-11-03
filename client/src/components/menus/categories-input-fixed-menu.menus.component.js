// REACT HOOK FORM
import { useFieldArray } from "react-hook-form";

// I18N
import { useTranslation } from "next-i18next";

export default function CategoriesInputFixedMenuComponent(props) {
  const { t } = useTranslation("menus");

  const { fields, append, remove } = useFieldArray({
    control: props?.control,
    name: `combinations.${props?.combinationIndex}.categories`,
  });

  function handleCategoryChange(value, catIndex) {
    if (value !== "") {
      props?.setErrorFields((prevErrors) =>
        prevErrors
          .map((error) => {
            if (error.comboIndex === props?.combinationIndex) {
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

  return (
    <>
      {fields.map((field, j) => (
        <div key={field.id} className="flex items-center gap-2">
          <select
            {...props.register(
              `combinations.${props?.combinationIndex}.categories.${j}.value`
            )}
            className={`p-2 border rounded-lg ${
              props?.errorFields.some(
                (error) =>
                  error.comboIndex === props?.combinationIndex &&
                  error.emptyCategories.includes(j)
              )
                ? "border-red"
                : ""
            }`}
            onChange={(e) => handleCategoryChange(e.target.value, j)}
            disabled={!props.isEditing}
          >
            <option value="" disabled>
              {t("labels.select")}
            </option>
            {props?.categories?.map((category, k) => (
              <option key={k} value={category.name}>
                {category.name}
              </option>
            ))}
          </select>

          {props.isEditing && j === fields.length - 1 && (
            <button
              type="button"
              onClick={() => append({ value: "" })}
              className="px-2 text-white bg-blue rounded-lg"
            >
              +
            </button>
          )}

          {props.isEditing && fields.length > 1 && j === fields.length - 1 && (
            <button
              type="button"
              onClick={() => remove(j)}
              className="px-2 text-white bg-red rounded-lg"
            >
              -
            </button>
          )}
        </div>
      ))}
    </>
  );
}
