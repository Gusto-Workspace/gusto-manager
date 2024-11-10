// SVG
import { GiftSvg } from "@/components/_shared/_svgs/gift.svg";

export const giftDashboardData = [
  {
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
            : [{ name: "labels.emptyGiftCard", value: 1, fill: "#E0E0E0" }],
      };
    },
  },
  {
    title: "labels.totalPurchasesGiftCards",
    IconComponent: GiftSvg,
    emptyLabel: "labels.emptySold",
    getCounts: (restaurantData) => {
      const total = restaurantData?.purchasesGiftCards?.length || 0;
      const valid =
        restaurantData?.purchasesGiftCards?.filter(
          (gift) => gift.status === "Valid"
        ).length || 0;
      const used =
        restaurantData?.purchasesGiftCards?.filter(
          (gift) => gift.status === "Used"
        ).length || 0;
      const expired =
        restaurantData?.purchasesGiftCards?.filter(
          (gift) => gift.status === "Expired"
        ).length || 0;

      return {
        total,
        data:
          total > 0
            ? [
                { name: "labels.valid", value: valid, fill: "#e66430" },
                { name: "labels.used", value: used, fill: "#eee" },
                { name: "labels.expired", value: expired, fill: "#FFB6C1" },
              ]
            : [{ name: "labels.emptySold", value: 1, fill: "#E0E0E0" }],
      };
    },
  },
];
