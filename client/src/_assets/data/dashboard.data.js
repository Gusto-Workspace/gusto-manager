// SVG
import {
  MenuSvg,
  DishSvg,
  DrinkSvg,
  WineSvg,
  NewsSvg,
  NotificationSvg,
  ReservationSvg,
} from "../../components/_shared/_svgs/_index";

export const dashboardData = [
  {
    title: "labels.totalMenu",
    IconComponent: MenuSvg,
    emptyLabel: "labels.emptyMenu",
    getCounts: (restaurantData) => {
      const total = restaurantData?.menus?.length || 0;
      const visible =
        restaurantData?.menus?.filter((menu) => menu.visible).length || 0;
      const hidden = total - visible;
      return { visible, hidden, total, emptyLabel: "labels.emptyMenu" };
    },
  },
  {
    title: "labels.totalDishes",
    IconComponent: DishSvg,
    emptyLabel: "labels.emptyDish",
    getCounts: (restaurantData) => {
      const total = restaurantData?.dish_categories?.reduce(
        (acc, category) => acc + (category.dishes?.length || 0),
        0
      );
      const visible = restaurantData?.dish_categories?.reduce(
        (acc, category) =>
          acc + category.dishes?.filter((dish) => dish.showOnWebsite).length,
        0
      );
      const hidden = total - visible;
      return { visible, hidden, total, emptyLabel: "labels.emptyDish" };
    },
  },
  {
    title: "labels.totalDrinks",
    IconComponent: DrinkSvg,
    emptyLabel: "labels.emptyDrink",
    getCounts: (restaurantData) => {
      const total = restaurantData?.drink_categories?.reduce(
        (acc, category) => {
          const categoryDrinks = category.drinks?.length || 0;
          const subCategoryDrinks = category.subCategories?.reduce(
            (subAcc, subCategory) => subAcc + (subCategory.drinks?.length || 0),
            0
          );
          return acc + categoryDrinks + subCategoryDrinks;
        },
        0
      );
      const visible = restaurantData?.drink_categories?.reduce(
        (acc, category) => {
          const visibleCategoryDrinks = category.drinks?.filter(
            (drink) => drink.showOnWebsite
          ).length;
          const visibleSubCategoryDrinks = category.subCategories?.reduce(
            (subAcc, subCategory) =>
              subAcc +
              subCategory.drinks?.filter((drink) => drink.showOnWebsite).length,
            0
          );
          return acc + visibleCategoryDrinks + visibleSubCategoryDrinks;
        },
        0
      );
      const hidden = total - visible;
      return { visible, hidden, total, emptyLabel: "labels.emptyDrink" };
    },
  },
  {
    title: "labels.totalWines",
    IconComponent: WineSvg,
    emptyLabel: "labels.emptyWine",
    getCounts: (restaurantData) => {
      const total = restaurantData?.wine_categories?.reduce((acc, category) => {
        const categoryWines = category.wines?.length || 0;
        const subCategoryWines = category.subCategories?.reduce(
          (subAcc, subCategory) => subAcc + (subCategory.wines?.length || 0),
          0
        );
        return acc + categoryWines + subCategoryWines;
      }, 0);
      const visible = restaurantData?.wine_categories?.reduce(
        (acc, category) => {
          const visibleCategoryWines = category.wines?.filter(
            (wine) => wine.showOnWebsite
          ).length;
          const visibleSubCategoryWines = category.subCategories?.reduce(
            (subAcc, subCategory) =>
              subAcc +
              subCategory.wines?.filter((wine) => wine.showOnWebsite).length,
            0
          );
          return acc + visibleCategoryWines + visibleSubCategoryWines;
        },
        0
      );
      const hidden = total - visible;
      return { visible, hidden, total, emptyLabel: "labels.emptyWine" };
    },
  },
  {
    title: "labels.totalNews",
    IconComponent: NewsSvg,
    emptyLabel: "labels.emptyNew",
    getCounts: (restaurantData) => {
      const total = restaurantData?.news?.length || 0;
      const visible =
        restaurantData?.news?.filter((news) => news.visible).length || 0;
      const hidden = total - visible;
      return { visible, hidden, total, emptyLabel: "labels.emptyNew" };
    },
  },
  {
    title: "labels.reservationsToday",
    emptyLabel: "labels.emptyReservations",
    noDonut: true, 
    getCounts: (restaurantData) => {
      if (!restaurantData?.options?.reservations) {
        return {
          visible: 0,
          hidden: 0,
          total: 0,
          emptyLabel: "labels.emptyReservations",
        };
      }

      const todayDate = new Date().toISOString().split("T")[0];
      const reservationsList = restaurantData?.reservations?.list || [];
      const todayReservations = reservationsList.filter((reservation) => {
        return (
          reservation.reservationDate &&
          reservation.reservationDate.split("T")[0] === todayDate
        );
      });
      const total = todayReservations.length;
      return {
        visible: total,
        hidden: 0,
        total,
        emptyLabel: "labels.emptyReservations",
      };
    },
  },
];
