// RECHARTS
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from "recharts";

// COMPONENTS
import CustomTooltipComponent from "./custom-tooltip.dashboard.component";

export default function DonutChartComponent({ data = [], IconComponent }) {
  const hasData = Array.isArray(data) && data.length > 0;

  // Si aucune donnée => anneau gris neutre
  const chartData = hasData
    ? data
    : [{ name: "empty", value: 1, fill: "#E5E7EB" }];

  return (
    <div
      className="
        relative flex items-center justify-center
        h-[90px] w-[90px] midTablet:h-[100px] midTablet:w-[100px]
        will-change-transform will-change-opacity
      "
    >
      <ResponsiveContainer width="100%" height="100%">
        <PieChart>
          <defs>
            {/* très léger glow sur l’anneau principal */}
            <filter id="donutShadow" x="-20%" y="-20%" width="140%" height="140%">
              <feDropShadow
                dx="0"
                dy="4"
                stdDeviation="4"
                floodColor="rgba(0,0,0,0.1)"
              />
            </filter>
          </defs>

          <Pie
            data={chartData}
            dataKey="value"
            cx="50%"
            cy="50%"
            innerRadius="70%"
            outerRadius="95%"
            startAngle={90}
            endAngle={-270}
            style={{ outline: "none", filter: "url(#donutShadow)" }}
            paddingAngle={hasData ? 2 : 0}
            animationDuration={900}
            isAnimationActive={true}
          >
            {chartData.map((entry, index) => (
              <Cell
                key={`cell-${index}`}
                fill={entry.fill}
                cursor={hasData ? "pointer" : "default"}
              />
            ))}
          </Pie>

          {hasData && <Tooltip content={<CustomTooltipComponent />} />}
        </PieChart>
      </ResponsiveContainer>

      {/* Icône centrale sur pastille blanche */}
      {IconComponent && (
        <div
          className="
            pointer-events-none
            absolute flex items-center justify-center
            h-8 w-8 rounded-2xl -z-10
            bg-white shadow-[0_4px_12px_rgba(19,30,54,0.18)]
          "
        >
          <IconComponent
            width={20}
            height={20}
            strokeColor="#e66430"
            fillColor="#e66430"
          />
        </div>
      )}
    </div>
  );
}
