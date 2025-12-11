// SVG
import { GiftSvg } from "@/components/_shared/_svgs/gift.svg";

export const giftDashboardData = [
  {
    key: "giftCardsConfig",
    title: "labels.totalGiftCards",
    IconComponent: GiftSvg,
    emptyLabel: "Aucune carte cadeau",
    getCounts: (restaurantData) => {
      const total = restaurantData?.giftCards?.length || 0;
      const visible =
        restaurantData?.giftCards?.filter((gift) => gift.visible).length || 0;
      const hidden = total - visible;

      return {
        total,
        data:
          total > 0
            ? [
                { name: "labels.visible", value: visible, fill: "#e66430" },
                { name: "labels.masked", value: hidden, fill: "#eee" },
              ]
            : [],
      };
    },
  },
  {
    key: "giftCardsPurchases",
    title: "labels.totalPurchasesGiftCards",
    IconComponent: GiftSvg,
    emptyLabel: "Aucune carte cadeau",
    getCounts: (restaurantData) => {
      const totalSold =
        restaurantData?.giftCardSold?.totalSold ??
        (restaurantData?.purchasesGiftCards?.length || 0);

      const purchases = restaurantData?.purchasesGiftCards || [];
      const valid = purchases.filter((p) => p.status === "Valid").length;
      const used = purchases.filter((p) => p.status === "Used").length;
      const expired = purchases.filter((p) => p.status === "Expired").length;

      const hasStatusData = valid + used + expired > 0;

      const data = hasStatusData
        ? [
            { name: "labels.valid", value: valid, fill: "#e66430" },
            { name: "labels.used", value: used, fill: "#eee" },
            { name: "labels.expired", value: expired, fill: "#FFB6C1" },
          ]
        : [];

      return {
        total: totalSold,
        data,
      };
    },
  },
];
