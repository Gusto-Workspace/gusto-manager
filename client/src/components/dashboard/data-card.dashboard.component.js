// COMPONENTS
import DonutChartComponent from "./donut-chart.dashboard.component";

// I18N
import { useTranslation } from "next-i18next";

export default function DataCardCompnent(props) {
  const { t } = useTranslation("index");
  return (
    <div
       
      className="bg-white drop-shadow-sm rounded-lg p-6 flex items-center justify-between gap-4"
    >
      <div className="flex flex-col gap-2">
        <h3 className="font-semibold text-lg text-balance">{t(props.title)}</h3>
        <p className="font-bold text-2xl">{props.count}</p>
      </div>

      <DonutChartComponent
        data={props.data}
        IconComponent={props.IconComponent}
      />
    </div>
  );
}
