import { useId } from "react";

// I18N
import { useTranslation } from "next-i18next";

// RECHARTS
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

function SalesTooltip({ active, payload, label, currencySymbol }) {
  if (active && payload && payload.length) {
    return (
      <div className="rounded-xl border border-darkBlue/10 bg-white/95 px-3 py-2 shadow-md text-xs">
        <p className="mb-1 font-semibold text-darkBlue">{label}</p>
        <p className="text-darkBlue/70">
          <span className="font-semibold text-darkBlue">
            {payload[0].value.toLocaleString("fr-FR")}
          </span>{" "}
          {currencySymbol}
        </p>
      </div>
    );
  }
  return null;
}

export default function MonthlySalesChart(props) {
  const { t } = useTranslation("index");
  const gradientId = useId().replace(/:/g, "");
  const currencySymbol = new Intl.NumberFormat("fr-FR", {
    style: "currency",
    currency: (props.currency || "eur").toUpperCase(),
  })
    .formatToParts(0)
    .find((part) => part.type === "currency")?.value;

  const data = props.data || [];

  const totalAmount = Array.isArray(data)
    ? data.reduce((sum, d) => sum + (d.total || 0), 0)
    : 0;

  const lastPoint =
    Array.isArray(data) && data.length > 0 ? data[data.length - 1] : null;

  const height = 400;

  // ----- Calcul dynamique de la largeur de l’axe Y (même logique que Visits) -----
  let maxTotal = 0;
  if (Array.isArray(data) && data.length > 0) {
    maxTotal = data.reduce((max, d) => {
      const v = typeof d.total === "number" ? d.total : Number(d.total) || 0;
      return Math.max(max, Math.abs(v));
    }, 0);
  }

  const formattedMax = Math.abs(maxTotal).toLocaleString("fr-FR");
  const hasNegativeTotal = data.some((point) => Number(point.total) < 0);
  const yAxisDomain = hasNegativeTotal ? ["auto", "auto"] : [0, "auto"];
  const yAxisWidth = Math.max(
    44,
    formattedMax.length * 6.5 +
      String(currencySymbol || "€").length * 6.5 +
      15,
  );

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
            {props.title}
          </h2>
          <p className="text-[11px] tablet:text-xs text-darkBlue/60">
            {props.subtitle}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2 text-xs">
          {props.children}
          <div className="inline-flex items-center gap-1 rounded-full bg-white/80 border border-darkBlue/10 px-3 py-1">
            <span className="h-2 w-2 rounded-full bg-[#e66430]" />
            <span className="text-darkBlue/70">
              Total :{" "}
              <span className="font-semibold text-darkBlue">
                {totalAmount.toLocaleString("fr-FR")} {currencySymbol}
              </span>
            </span>
          </div>

          {lastPoint && (
            <div className="inline-flex items-center gap-1 rounded-full bg-white/80 border border-darkBlue/10 px-3 py-1">
              <span className="text-darkBlue/60">
                Mois en cours :{" "}
                <span className="font-semibold text-darkBlue">
                  {lastPoint.total.toLocaleString("fr-FR")} {currencySymbol}
                </span>
              </span>
            </div>
          )}
        </div>
      </header>

      {/* Chart */}
      <div className="relative z-10">
        {props.loading ? (
          <div
            className="flex flex-col items-center justify-center gap-2 text-darkBlue/40"
            style={{ height }}
          >
            <Loader2 className="size-6 animate-spin" />
            <span className="text-sm italic">Chargement…</span>
          </div>
        ) : props.error ? (
          <div
            role="alert"
            className="flex items-center justify-center text-sm text-red"
            style={{ height }}
          >
            {props.error}
          </div>
        ) : !data.length ? (
          <div
            className="flex items-center justify-center text-sm italic text-darkBlue/40"
            style={{ height }}
          >
            {t("labels.emptySold")}
          </div>
        ) : (
          <div style={{ width: "100%", height }}>
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart
                data={data}
                margin={{ top: 10, right: 10, left: -10, bottom: 0 }}
              >
                <defs>
                  <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#e66430" stopOpacity={0.6} />
                    <stop offset="95%" stopColor="#e66430" stopOpacity={0} />
                  </linearGradient>
                </defs>

                <CartesianGrid
                  strokeDasharray="3 3"
                  stroke="rgba(19,30,54,0.06)"
                  vertical={false}
                />
                <XAxis
                  dataKey="month"
                  tick={{ fontSize: 11, fill: "rgba(19,30,54,0.6)" }}
                  axisLine={false}
                  tickLine={false}
                  padding={{ left: 0, right: 10 }}
                />
                <YAxis
                  type="number"
                  domain={yAxisDomain}
                  allowDecimals={false}
                  tick={(tickProps) => (
                    <text
                      x={0}
                      y={tickProps.y}
                      textAnchor="start"
                      dominantBaseline="central"
                      fontSize={11}
                      fill="rgba(19,30,54,0.6)"
                    >
                      {tickProps.tickFormatter(tickProps.payload.value)}
                    </text>
                  )}
                  tickFormatter={(value) =>
                    `${Number(value).toLocaleString("fr-FR")} ${currencySymbol}`
                  }
                  axisLine={false}
                  tickLine={false}
                  width={yAxisWidth}
                />
                <Tooltip
                  content={<SalesTooltip currencySymbol={currencySymbol} />}
                />
                <Area
                  type="monotone"
                  dataKey="total"
                  stroke="#e66430"
                  strokeWidth={1.2}
                  fill={`url(#${gradientId})`}
                  fillOpacity={1}
                  activeDot={{
                    r: 5,
                    stroke: "#ffffff",
                    strokeWidth: 2,
                  }}
                  dot={{ r: 2, fill: "#e66430" }}
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
