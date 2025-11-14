import { useTranslation } from "next-i18next";

export default function DataCardCompnent(props) {
  const { t } = useTranslation("index");
  const { title, count, data, IconComponent, ChartComponent } = props;

  const hasChart = Array.isArray(data) && data.length > 0;

  return (
    <div
      className={`
        relative overflow-hidden
        rounded-2xl border border-darkBlue/10
       bg-white/50
        px-4 py-4 midTablet:px-5 midTablet:py-5
        flex items-center gap-4
        ${hasChart ? "justify-between" : "justify-start"}
        shadow-[0_18px_45px_rgba(19,30,54,0.08)]
        hover:shadow-[0_22px_55px_rgba(19,30,54,0.12)]
        transition-shadow
      `}
    >
      {/* Accents décoratifs */}
      <div className="pointer-events-none absolute -right-10 -top-10 h-32 w-32 rounded-full bg-[#e66430]/5" />

      {/* Colonne texte */}
      <div className="relative z-10 flex flex-col gap-3 min-w-0">
        {/* Ligne icône + badge */}
        <div className="flex items-center gap-2">
          {IconComponent && (
            <div
              className="
                inline-flex items-center justify-center
                h-8 w-8 rounded-xl
                bg-darkBlue/5
              "
            >
              <IconComponent
                width={18}
                height={18}
                fillColor="#131E36"
                strokeColor="#131E36"
              />
            </div>
          )}

          <span className="inline-flex items-center rounded-full border border-darkBlue/10 bg-white/70 px-2 py-0.5 text-[11px] font-medium text-darkBlue/60">
            {t(title)}
          </span>
        </div>

        {/* Valeur principale */}
        <p className="text-2xl pl-1 tablet:text-3xl font-semibold tracking-tight text-darkBlue">
          {count}
        </p>
      </div>

      {/* Pod donut / chart – seulement si on a des données */}
      {hasChart && (
        <div
          className="
            relative z-10 flex items-center justify-center
            rounded-2xl
            bg-white/80
            border border-darkBlue/5
            h-[90px] w-[90px] midTablet:h-[100px] midTablet:w-[100px]
            shadow-inner
            shrink-0
          "
        >
          <ChartComponent data={data} IconComponent={IconComponent} />
        </div>
      )}
    </div>
  );
}
