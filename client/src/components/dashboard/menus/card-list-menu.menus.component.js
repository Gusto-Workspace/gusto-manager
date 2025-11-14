import { useRouter } from "next/router";

// I18N
import { useTranslation } from "next-i18next";

// SVG
import {
  DeleteSvg,
  DragMultiSvg,
  NoVisibleSvg,
  RightArrowSvg,
} from "../../_shared/_svgs/_index";

// DND
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";

export default function CardListMenuComponent(props) {
  const { t } = useTranslation("menus");
  const router = useRouter();
  const { locale } = router;
  const currencySymbol = locale === "fr" ? "€" : "$";

  const { listeners, setNodeRef, transform, transition } = useSortable({
    id: props.menu._id,
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  const isVisible = props.menu.visible;
  const hasCombinations =
    Array.isArray(props.menu.combinations) &&
    props.menu.combinations.length > 0;

  return (
    <section
      ref={setNodeRef}
      style={style}
      className="
        relative flex flex-col items-stretch gap-3
        rounded-2xl border border-darkBlue/10 bg-white/80
        px-4 py-4
        shadow-[0_18px_45px_rgba(19,30,54,0.06)]
        hover:shadow-[0_22px_55px_rgba(19,30,54,0.10)]
        transition-shadow
      "
    >
      {/* Ligne top : drag + (optionnellement badge visibilité plus tard si tu veux) */}
      <div className="flex items-start justify-between gap-2">
        <button
          {...listeners}
          className="
            absolute p-1 op
           opacity-50
            cursor-grab active:cursor-grabbing
          "
        >
          <DragMultiSvg width={18} height={18} />
        </button>
      </div>

      {/* Contenu principal */}
      <div className="flex-1 flex flex-col items-center gap-2 px-2 text-center">
        {/* Titre */}
        <h2 className="text-base tablet:text-lg font-semibold text-darkBlue text-balance">
          {props.menu.name ? props.menu.name : t("labels.fixed")}
        </h2>

        {/* Badge visibilité */}
        <div className="inline-flex items-center gap-1 rounded-full border border-darkBlue/10 bg-white px-3 py-0.5 text-[11px]">
          <span
            className={`inline-block h-1.5 w-1.5 rounded-full ${
              isVisible ? "bg-[#4ead7a]" : "bg-darkBlue/30"
            }`}
          />
          <span className="text-darkBlue/70">
            {isVisible ? "Visible" : "Non visible"}
          </span>
        </div>

        {/* Prix principal : seulement s'il y a des combinaisons
            (sinon il sera affiché dans le bloc placeholder) */}
        {props.menu.price && hasCombinations && (
          <div className="mt-1 inline-flex items-center gap-1 rounded-full bg-[#e6643014] px-3 py-1 text-xs tablet:text-sm">
            <span className="text-darkBlue/60">
              {t("labels.price", "Prix")} :
            </span>
            <span className="font-semibold text-darkBlue">
              {props.menu.price} {currencySymbol}
            </span>
          </div>
        )}

        {/* Zone centrale à hauteur contrôlée */}
        <div className="mt-2 w-full">
          {hasCombinations ? (
            // Liste des formules, scrollable si besoin
            <div className="rounded-xl bg-white/90 border border-darkBlue/5 px-3 py-2 text-sm tablet:text-sm text-darkBlue/80 max-h-[110px] overflow-y-auto">
              <ul className="flex flex-col gap-1">
                {props.menu.combinations.map((comb, i) => (
                  <li
                    key={i}
                    className="flex items-center justify-between gap-2"
                  >
                    <p className="flex-1 text-left">
                      {comb.categories.map((category, j) => (
                        <span key={j}>
                          {category}
                          {j < comb.categories.length - 1 && " • "}
                        </span>
                      ))}
                    </p>
                    <p className="whitespace-nowrap font-medium text-darkBlue">
                      {comb.price} {currencySymbol}
                    </p>
                  </li>
                ))}
              </ul>
            </div>
          ) : (
            // Placeholder pour menus simples : on “remplit” le vide
            <div className="flex h-[110px] flex-col items-center justify-center rounded-xl border border-dashed border-darkBlue/15 bg-white/80 px-4 text-[11px] tablet:text-xs text-darkBlue/55">
              <span>{t("labels.singlePriceMenu", "Menu à prix unique")}</span>
              {props.menu.price && (
                <span className="mt-2 text-lg font-semibold text-darkBlue">
                  {props.menu.price} {currencySymbol}
                </span>
              )}
            </div>
          )}
        </div>
      </div>

      <hr className="border-0 h-px bg-darkBlue/10 mt-1" />

      {/* Actions */}
      <div className="flex w-full justify-between gap-1 pt-1">
        {/* Visibilité */}
        <button
          onClick={(e) => {
            e.stopPropagation();
            props.handleVisibilityToggle(props.menu);
          }}
          className="
            flex flex-col items-center gap-1 flex-1 px-1 py-1
            text-[11px] text-darkBlue/70
          "
        >
          <div
            className={`
              inline-flex items-center justify-center
              h-8 w-8 rounded-full
              border
              transition-colors
              ${
                isVisible
                  ? "bg-[#4ead7a1a] border-[#4ead7a80]"
                  : "bg-darkBlue/5 border-darkBlue/15"
              }
            `}
          >
            <NoVisibleSvg
              width={14}
              height={14}
              strokeColor={isVisible ? "#167a47" : "#6b7280"}
              fillColor={isVisible ? "#167a47" : "#6b7280"}
            />
          </div>
          <span>{isVisible ? "Visible" : "Non visible"}</span>
        </button>

        {/* Supprimer */}
        <button
          onClick={(e) => {
            e.stopPropagation();
            props.handleDeleteClick(props.menu);
          }}
          className="
            flex flex-col items-center gap-1 flex-1 px-1 py-1
            text-[11px] text-darkBlue/70
          "
        >
          <div
            className="
              inline-flex items-center justify-center
              h-8 w-8 rounded-full
              bg-[#ef44441a] border border-[#ef444480]
              hover:bg-[#ef444433] transition-colors
            "
          >
            <DeleteSvg
              width={14}
              height={14}
              strokeColor="#b91c1c"
              fillColor="#b91c1c"
            />
          </div>
          <span>{t("buttons.delete")}</span>
        </button>

        {/* Accéder */}
        <button
          onClick={() => props.handleCategoryClick(props.menu)}
          className="
            flex flex-col items-center gap-1 flex-1 px-1 py-1
            text-[11px] text-darkBlue/70
          "
        >
          <div
            className="
              inline-flex items-center justify-center
              h-8 w-8 rounded-full
              bg-[#4f46e51a] border border-[#4f46e580]
              hover:bg-[#4f46e533] transition-colors
            "
          >
            <RightArrowSvg
              width={14}
              height={14}
              strokeColor="#4f46e5"
              fillColor="#4f46e5"
            />
          </div>
          <span>{t("buttons.access")}</span>
        </button>
      </div>
    </section>
  );
}
