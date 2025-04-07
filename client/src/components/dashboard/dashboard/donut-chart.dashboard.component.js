// RECHARTS
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from "recharts";

// COMPONENTS
import CustomTooltipComponent from "./custom-tooltip.dashboard.component";

export default function DonutChartComponent({ data = [], IconComponent }) {
  return (
    <div
      style={{
        minWidth: 100,
        height: 100,
        position: "relative",
        willChange: "transform, opacity",
      }}
    >
      <ResponsiveContainer width="100%" height="100%">
        <PieChart>
          <Pie
            data={data}
            dataKey="value"
            cx="50%"
            cy="50%"
            innerRadius="80%"
            outerRadius="100%"
            startAngle={90}
            endAngle={-270}
            style={{ outline: "none" }}
            animationDuration={0}
          >
            {data.map((entry, index) => (
              <Cell key={`cell-${index}`} fill={entry.fill} cursor="pointer" />
            ))}
          </Pie>
          <Tooltip content={<CustomTooltipComponent />} />
        </PieChart>
      </ResponsiveContainer>
      <div
        style={{
          position: "absolute",
          top: "50%",
          left: "50%",
          transform: "translate(-50%, -50%)",
          zIndex: "-10",
        }}
      >
        <IconComponent
          width={25}
          height={25}
          strokeColor="#e66430"
          fillColor="#e66430"
        />
      </div>
    </div>
  );
}
