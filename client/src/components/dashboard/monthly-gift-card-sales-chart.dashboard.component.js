import { useMemo } from "react";
import { useRouter } from "next/router";

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
import { format, parseISO } from "date-fns";

function CustomTooltip(props) {
  if (props?.active && props?.payload?.length) {
    return (
      <div className="bg-white p-2 border border-gray-300 rounded shadow-sm">
        <p className="font-semibold">{props.label}</p>
        <p>
          <span className="text-darkBlue">
            {props?.payload[0].value} {props.currencySymbol}
          </span>
        </p>
      </div>
    );
  }
  return null;
}

export default function MonthlyGiftCardSalesChart(props) {
  const { t } = useTranslation("index");
  const router = useRouter();
  const { locale } = router;
  const currencySymbol = locale === "fr" ? "€" : "$";

  const monthlySalesData = useMemo(() => {
    const salesByMonth = {};

    props.purchasesGiftCards.forEach((giftCard) => {
      const month = format(parseISO(giftCard.created_at), "MMM yyyy");
      salesByMonth[month] = (salesByMonth[month] || 0) + giftCard.value;
    });

    return Object.entries(salesByMonth).map(([month, sales]) => ({
      month,
      sales,
    }));
  }, [props.purchasesGiftCards]);

  return (
    <div className="bg-white rounded-lg drop-shadow-sm p-6">
      <h2 className="text-xl font-semibold text-center mb-4">
        {t("labels.monthlySold")}
      </h2>

      <div className="h-[400px] flex justify-center items-center">
        {props.purchasesGiftCards.length > 0 ? (
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart
              data={monthlySalesData}
              margin={{ top: 20, right: 30, left: 0, bottom: 0 }}
            >
              <defs>
                <linearGradient id="colorSales" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.8} />
                  <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="month" />
              <YAxis />
              <Tooltip
                content={<CustomTooltip currencySymbol={currencySymbol} />}
              />
              <Area
                type="monotone"
                dataKey="sales"
                stroke="#3b82f6"
                fill="url(#colorSales)"
                fillOpacity={1}
                activeDot={{ r: 6 }}
                dot={{ r: 3, fill: "#3b82f6" }}
              />
            </AreaChart>
          </ResponsiveContainer>
        ) : (
          <p className="italic opacity-30 text-xl">{t("labels.emptySold")}</p>
        )}
      </div>
    </div>
  );
}
