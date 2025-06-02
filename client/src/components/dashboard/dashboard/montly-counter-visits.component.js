import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";

// Fonction utilitaire pour passer de "YYYY-MM" à "MM/YYYY"
function formatPeriod(label) {
  const [year, month] = label.split("-");
  return `${month}/${year}`;
}

function VisitsTooltip({ active, payload, label }) {
  if (active && payload && payload.length) {
    return (
      <div className="bg-white p-2 border border-gray-300 rounded shadow-sm">
        <p className="font-semibold">{formatPeriod(label)}</p>
        <p>
          <span className="text-darkBlue">{payload[0].value} visites</span>
        </p>
      </div>
    );
  }
  return null;
}

export default function MonthlyCounterVisits({
  data = [],
  loading = false,
  title,
  height = 500,
}) {
  return (
    <div className="bg-white rounded-lg drop-shadow-sm flex flex-col py-6 pr-6 h-full justify-between">
      <h2 className="text-xl font-semibold text-center mb-4">{title}</h2>

      <div
        className={`flex justify-center items-center ${loading ? `h-[${height}px]` : ""}`}
      >
        {!loading ? (
          <ResponsiveContainer width="100%" height={height}>
            <AreaChart
              data={data}
              margin={{ top: 20, right: 5, left: 0, bottom: 0 }}
            >
              <defs>
                <linearGradient id="visitsColor" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#4583FF" stopOpacity={0.8} />
                  <stop offset="95%" stopColor="#4583FF" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" />
              {/* On formate l’axe X avec tickFormatter */}
              <XAxis dataKey="label" tickFormatter={formatPeriod} />
              <YAxis type="number" domain={[0, "auto"]} />
              <Tooltip content={<VisitsTooltip />} />
              <Area
                type="monotone"
                dataKey="visits"
                stroke="#4583FF"
                fill="url(#visitsColor)"
                fillOpacity={1}
                activeDot={{ r: 6 }}
                dot={{ r: 3, fill: "#4583FF" }}
                isAnimationActive={true}
                animationDuration={1500}
              />
            </AreaChart>
          </ResponsiveContainer>
        ) : (
          <p className="h-[500px] flex items-center italic opacity-30 text-xl">
            Chargement…
          </p>
        )}
      </div>
    </div>
  );
}
