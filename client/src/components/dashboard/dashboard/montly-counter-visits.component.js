import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import { Loader2 } from "lucide-react";

// Fonction utilitaire pour passer de "YYYY-MM" à "MM/YYYY"
function formatPeriod(label) {
  if (!label) return "";
  const [year, month] = String(label).split("-");
  return `${month}/${year}`;
}

function VisitsTooltip({ active, payload, label }) {
  if (active && payload && payload.length) {
    return (
      <div className="rounded-xl border border-darkBlue/10 bg-white/95 px-3 py-2 shadow-md text-xs">
        <p className="font-semibold text-darkBlue mb-1">
          {formatPeriod(label)}
        </p>
        <p className="text-darkBlue/70">
          <span className="font-semibold text-darkBlue">
            {payload[0].value}
          </span>{" "}
          visites
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
  height = 320,
}) {
  const totalVisits = Array.isArray(data)
    ? data.reduce((sum, d) => sum + (d.visits || 0), 0)
    : 0;
  const lastPoint =
    Array.isArray(data) && data.length > 0 ? data[data.length - 1] : null;

  // ----- Calcul dynamique de la largeur de l’axe Y -----
  let maxVisits = 0;
  if (Array.isArray(data) && data.length > 0) {
    maxVisits = data.reduce((max, d) => {
      const v = typeof d.visits === "number" ? d.visits : Number(d.visits) || 0;
      return Math.max(max, v);
    }, 0);
  }

  // On ne regarde que la partie entière pour déterminer la tranche
  const intMax = Math.floor(Math.abs(maxVisits));
  const digits = String(intMax || 0).length; // 0 -> "0" -> 1

  const yAxisWidth =
    digits === 1 ? 28 :
    digits === 2 ? 34 :
    digits === 3 ? 42 :
    50; // 4 chiffres et plus

  return (
    <section
      className="
        relative overflow-hidden
        rounded-2xl border border-darkBlue/10
        bg-white/50
        px-4 py-4 tablet:px-6 tablet:py-5
        shadow-[0_18px_45px_rgba(19,30,54,0.08)]
      "
    >
      {/* Header */}
      <header className="relative z-10 mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-col gap-1">
          <h2 className="text-base tablet:text-lg font-semibold text-darkBlue">
            {title}
          </h2>
          <p className="text-[11px] tablet:text-xs text-darkBlue/60">
            Historique des visites mensuelles sur les 13 derniers mois.
          </p>
        </div>

        <div className="flex flex-wrap gap-2 text-xs">
          <div className="inline-flex items-center gap-1 rounded-full bg-white/80 border border-darkBlue/10 px-3 py-1">
            <span className="w-2 h-2 rounded-full bg-darkBlue" />
            <span className="text-darkBlue/70">
              Total :{" "}
              <span className="font-semibold text-darkBlue">{totalVisits}</span>
            </span>
          </div>

          {lastPoint && (
            <div className="inline-flex items-center gap-1 rounded-full bg-white/80 border border-darkBlue/10 px-3 py-1">
              <span className="text-darkBlue/60">
                Dernier mois :{" "}
                <span className="font-semibold text-darkBlue">
                  {lastPoint.visits}
                </span>
              </span>
            </div>
          )}
        </div>
      </header>

      {/* Chart */}
      <div className="relative z-10">
        {loading ? (
          <div
            className="flex flex-col items-center justify-center gap-2 text-darkBlue/40"
            style={{ height }}
          >
            <Loader2 className="size-6 animate-spin" />
            <span className="text-sm italic">Chargement…</span>
          </div>
        ) : data.length === 0 ? (
          <div
            className="flex items-center justify-center text-sm italic text-darkBlue/40"
            style={{ height }}
          >
            Aucune donnée de visite disponible pour l’instant.
          </div>
        ) : (
          <div style={{ width: "100%", height }}>
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart
                data={data}
                margin={{ top: 10, right: 10, left: -10, bottom: 0 }}
              >
                <defs>
                  <linearGradient id="visitsColor" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#131E36" stopOpacity={0.6} />
                    <stop offset="95%" stopColor="#131E36" stopOpacity={0} />
                  </linearGradient>
                </defs>

                <CartesianGrid
                  strokeDasharray="3 3"
                  stroke="rgba(19,30,54,0.06)"
                  vertical={false}
                />
                <XAxis
                  dataKey="label"
                  tickFormatter={formatPeriod}
                  tick={{ fontSize: 11, fill: "rgba(19,30,54,0.6)" }}
                  axisLine={false}
                  tickLine={false}
                  padding={{ left: 0, right: 10 }}
                />
                <YAxis
                  type="number"
                  domain={[0, "auto"]}
                  allowDecimals={false} // <- plus de 1.5 / 2.5 etc
                  tick={{ fontSize: 11, fill: "rgba(19,30,54,0.6)" }}
                  axisLine={false}
                  tickLine={false}
                  width={yAxisWidth}
                />
                <Tooltip content={<VisitsTooltip />} />
                <Area
                  type="monotone"
                  dataKey="visits"
                  stroke="#131E36"
                  strokeWidth={1.2}
                  fill="url(#visitsColor)"
                  fillOpacity={1}
                  activeDot={{
                    r: 5,
                    stroke: "#ffffff",
                    strokeWidth: 2,
                  }}
                  dot={{ r: 2, fill: "#131E36" }}
                  isAnimationActive={true}
                  animationDuration={1200}
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>
    </section>
  );
}
