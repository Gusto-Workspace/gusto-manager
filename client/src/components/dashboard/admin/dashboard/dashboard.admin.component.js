import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { BadgeEuro, Loader2, Store, TrendingUp, Users } from "lucide-react";
import PageHeaderAdminComponent from "../_shared/page-header.admin.component";

function formatPeriod(label) {
  if (!label) return "";
  const [year, month] = String(label).split("-");
  return `${month}/${year}`;
}

function formatCurrency(value) {
  return new Intl.NumberFormat("fr-FR", {
    style: "currency",
    currency: "EUR",
    maximumFractionDigits: 0,
  }).format(Number(value || 0));
}

function MetricCard({ icon: Icon, title, value, hint }) {
  return (
    <div className="rounded-2xl border border-darkBlue/10 bg-white/60 p-4 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-darkBlue/45">
            {title}
          </p>
          <p className="mt-2 text-2xl font-semibold text-darkBlue">{value}</p>
          {hint ? (
            <p className="mt-1 text-xs text-darkBlue/55">{hint}</p>
          ) : null}
        </div>

        <div className="inline-flex size-10 items-center justify-center rounded-2xl border border-darkBlue/10 bg-white">
          <Icon className="size-5 text-darkBlue/70" />
        </div>
      </div>
    </div>
  );
}

function ChartTooltip({
  active,
  payload,
  label,
  valueLabel,
  currency = false,
}) {
  if (!active || !payload?.length) return null;

  const value = Number(payload[0]?.value || 0);

  return (
    <div className="rounded-xl border border-darkBlue/10 bg-white/95 px-3 py-2 text-xs shadow-md">
      <p className="mb-1 font-semibold text-darkBlue">{formatPeriod(label)}</p>
      <p className="text-darkBlue/70">
        <span className="font-semibold text-darkBlue">
          {currency ? formatCurrency(value) : value}
        </span>{" "}
        {valueLabel}
      </p>
    </div>
  );
}

function SimpleAreaChart({
  title,
  subtitle,
  data = [],
  dataKey,
  color,
  valueLabel,
  currency = false,
}) {
  const total = data.reduce(
    (sum, item) => sum + Number(item?.[dataKey] || 0),
    0,
  );
  const lastPoint = data[data.length - 1] || null;
  const yAxisWidth = 52;

  return (
    <section className="rounded-2xl border border-darkBlue/10 bg-white/60 px-4 py-4 shadow-sm tablet:px-6 tablet:py-5">
      <header className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold text-darkBlue tablet:text-lg">
            {title}
          </h2>
          <p className="text-[11px] text-darkBlue/60 tablet:text-xs">
            {subtitle}
          </p>
        </div>

        <div className="flex flex-wrap gap-2 text-xs">
          <div className="inline-flex items-center gap-1 rounded-full border border-darkBlue/10 bg-white/80 px-3 py-1">
            <span
              className="h-2 w-2 rounded-full"
              style={{ backgroundColor: color }}
            />
            <span className="text-darkBlue/70">
              Total :{" "}
              <span className="font-semibold text-darkBlue">
                {currency ? formatCurrency(total) : total}
              </span>
            </span>
          </div>

          {lastPoint ? (
            <div className="inline-flex items-center gap-1 rounded-full border border-darkBlue/10 bg-white/80 px-3 py-1">
              <span className="text-darkBlue/60">
                Mois actuel :{" "}
                <span className="font-semibold text-darkBlue">
                  {currency
                    ? formatCurrency(lastPoint[dataKey])
                    : Number(lastPoint[dataKey] || 0)}
                </span>
              </span>
            </div>
          ) : null}
        </div>
      </header>

      {!data.length ? (
        <div className="flex h-[320px] items-center justify-center text-sm italic text-darkBlue/40">
          Aucune donnée disponible.
        </div>
      ) : (
        <div style={{ width: "100%", height: 320 }}>
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart
              data={data}
              margin={{ top: 10, right: 10, left: -10, bottom: 0 }}
            >
              <defs>
                <linearGradient
                  id={`${dataKey}-color`}
                  x1="0"
                  y1="0"
                  x2="0"
                  y2="1"
                >
                  <stop offset="5%" stopColor={color} stopOpacity={0.55} />
                  <stop offset="95%" stopColor={color} stopOpacity={0} />
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
              />
              <YAxis
                type="number"
                domain={[0, "auto"]}
                allowDecimals={false}
                tick={{ fontSize: 11, fill: "rgba(19,30,54,0.6)" }}
                axisLine={false}
                tickLine={false}
                width={yAxisWidth}
              />
              <Tooltip
                content={
                  <ChartTooltip valueLabel={valueLabel} currency={currency} />
                }
              />
              <Area
                type="monotone"
                dataKey={dataKey}
                stroke={color}
                strokeWidth={1.2}
                fill={`url(#${dataKey}-color)`}
                fillOpacity={1}
                dot={{ r: 2, fill: color }}
                activeDot={{ r: 5, stroke: "#ffffff", strokeWidth: 2 }}
                animationDuration={1200}
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      )}
    </section>
  );
}

export default function DashboardAdminComponent({
  loading = false,
  data = null,
  errorMessage = "",
}) {
  const metrics = data?.metrics || {};
  const charts = data?.charts || {};

  return (
    <section className="flex flex-col gap-4">
      <PageHeaderAdminComponent
        title="Dashboard"
        subtitle="Vue d'ensemble"
        action={null}
      />

      {loading ? (
        <div className="rounded-2xl border border-darkBlue/10 bg-white/60 p-6 shadow-sm">
          <div className="flex items-center gap-3 text-darkBlue/70">
            <Loader2 className="size-5 animate-spin" />
            <span>Chargement du dashboard admin...</span>
          </div>
        </div>
      ) : errorMessage ? (
        <div className="rounded-2xl border border-red/20 bg-red/10 p-6 text-sm text-red shadow-sm">
          {errorMessage}
        </div>
      ) : (
        <>
          <div className="grid grid-cols-1 gap-3 desktop:grid-cols-2 largeDesktop:grid-cols-4">
            <MetricCard
              icon={Store}
              title="Restaurants"
              value={Number(metrics.totalRestaurants || 0)}
              hint="Total des restaurants onboardés"
            />
            <MetricCard
              icon={Users}
              title="Propriétaires"
              value={Number(metrics.totalOwners || 0)}
              hint="Total des comptes propriétaires"
            />
            <MetricCard
              icon={BadgeEuro}
              title="CA Total"
              value={formatCurrency(metrics.totalRevenue)}
              hint="Factures Stripe payées cumulées"
            />
            <MetricCard
              icon={TrendingUp}
              title="CA Mois"
              value={formatCurrency(metrics.currentMonthRevenue)}
              hint="Factures Stripe payées sur le mois courant"
            />
          </div>

          <div className="grid grid-cols-1 gap-4 desktop:grid-cols-2">
            <SimpleAreaChart
              title="CA par mois"
              subtitle="Historique des factures Stripe payées sur les 12 derniers mois."
              data={charts.revenueByMonth || []}
              dataKey="revenue"
              color="#e66430"
              valueLabel="de CA"
              currency={true}
            />

            <SimpleAreaChart
              title="Nouveaux restos onboardés"
              subtitle="Nouveaux restaurants créés sur les 12 derniers mois."
              data={charts.onboardedRestaurantsByMonth || []}
              dataKey="count"
              color="#131E36"
              valueLabel="restaurants"
            />
          </div>
        </>
      )}
    </section>
  );
}
