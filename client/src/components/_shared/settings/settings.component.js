import { Fragment, useState, useContext, useRef, useEffect } from "react";
import { useRouter } from "next/router";
import { useTranslation } from "next-i18next";

// SVG
import {
  ChevronSvg,
  FullScreenSvg,
  HelpSvg,
  InvoiceSvg,
  NotificationSvg,
  SettingsSvg,
  VisibleSvg,
} from "../_svgs/_index";

// CONTEXT
import { GlobalContext } from "@/contexts/global.context";

// COMPONENTS
import SimpleSkeletonComponent from "../skeleton/simple-skeleton.component";

export default function SettingsComponent() {
  const { t } = useTranslation("");
  const router = useRouter();
  const [showRestaurantList, setShowRestaurantList] = useState(false);
  const [showUserMenu, setShowUserMenu] = useState(false);
  const [showNotifications, setShowNotifications] = useState(false);

  const [displayedCount, setDisplayedCount] = useState(null);

  const { restaurantContext } = useContext(GlobalContext);

  const userMenuRef = useRef(null);
  const userNameRef = useRef(null);
  const notificationsRef = useRef(null);
  const notificationsButtonRef = useRef(null);

  const isSubRoute =
    router.pathname !== "/dashboard" && router.pathname.split("/").length > 3;

  function handleFullScreenToggle() {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen?.() ||
        document.documentElement.webkitRequestFullscreen?.() ||
        document.documentElement.msRequestFullscreen?.();
    } else {
      document.exitFullscreen?.() ||
        document.webkitExitFullscreen?.() ||
        document.msExitFullscreen?.();
    }
  }

  useEffect(() => {
    function handleClickOutside(event) {
      if (showNotifications) {
        if (
          notificationsRef.current &&
          !notificationsRef.current.contains(event.target) &&
          !notificationsButtonRef.current.contains(event.target)
        ) {
          setShowNotifications(false);
        }
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [showNotifications]);

  const totalCount =
    (restaurantContext.newReservationsCount || 0) +
    (restaurantContext.newLeaveRequestsCount || 0) +
    (restaurantContext.newGiftPurchasesCount || 0);

  useEffect(() => {
    if (showNotifications) setDisplayedCount(totalCount);
  }, [totalCount, showNotifications]);

  useEffect(() => {
    if (showRestaurantList) {
      document.body.classList.add("no-scroll");
      window.scrollTo({ top: 0, behavior: "smooth" });
    } else {
      document.body.classList.remove("no-scroll");
    }
    return () => {
      document.body.classList.remove("no-scroll");
    };
  }, [showRestaurantList]);

  // Écoute de la fin de transition pour lancer la réinitialisation ET mettre à jour lastNotificationCheck
  useEffect(() => {
    const node = notificationsRef.current;
    if (!node) return;

    function handleTransitionEnd(e) {
      if (e.propertyName === "max-height" && !showNotifications) {
        restaurantContext.resetNewReservationsCount();
        restaurantContext.resetNewLeaveRequestsCount();
        restaurantContext.resetNewGiftPurchasesCount();

        const allZero =
          (restaurantContext.newReservationsCount || 0) === 0 &&
          (restaurantContext.newLeaveRequestsCount || 0) === 0 &&
          (restaurantContext.newGiftPurchasesCount || 0) === 0;
        if (allZero) {
          restaurantContext.updateLastNotificationCheck();
        }
        setDisplayedCount(0);
      }
    }
    node.addEventListener("transitionend", handleTransitionEnd);
    return () => node.removeEventListener("transitionend", handleTransitionEnd);
  }, [showNotifications, restaurantContext]);

  useEffect(() => {
    function handleClickOutside(event) {
      if (
        showUserMenu &&
        userMenuRef.current &&
        !userMenuRef.current.contains(event.target) &&
        userNameRef.current &&
        !userNameRef.current.contains(event.target)
      ) {
        setShowUserMenu(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [showUserMenu]);

  return (
    <section className="flex flex-col-reverse tablet:flex-row min-h-16 gap-6 tablet:gap-7 justify-between items-center relative">
      {showRestaurantList && (
        <div
          onClick={() => setShowRestaurantList(false)}
          className="fixed inset-0 bg-black bg-opacity-20 z-[92]"
        />
      )}

      <div
        className={`${
          showRestaurantList ? "z-[92]" : "z-50"
        } relative min-h-[64px] w-full bg-white flex-1 px-6 items-center flex justify-between drop-shadow-sm rounded-lg ${
          restaurantContext.restaurantsList?.length > 1 && !isSubRoute
            ? "cursor-pointer"
            : ""
        }`}
        onClick={() => {
          if (!isSubRoute && restaurantContext.restaurantsList?.length > 1) {
            setShowRestaurantList(!showRestaurantList);
          }
        }}
      >
        {restaurantContext.dataLoading ? (
          <SimpleSkeletonComponent />
        ) : (
          <h1 className={`${isSubRoute && "opacity-40"} mr-4`}>
            {restaurantContext.restaurantData?.name}
          </h1>
        )}

        {!isSubRoute && restaurantContext.restaurantsList?.length > 1 && (
          <ChevronSvg />
        )}

        {showRestaurantList &&
          restaurantContext.restaurantsList?.length > 1 && (
            <div className="absolute top-full left-0 bg-white shadow-sm rounded-lg mt-2 w-full">
              <ul>
                {restaurantContext.restaurantsList.map((restaurant, i) => (
                  <Fragment key={restaurant._id}>
                    <li
                      className="p-6 cursor-pointer"
                      onClick={() => {
                        const role = restaurantContext.userConnected?.role;
                        const targetPath =
                          role === "employee"
                            ? "/dashboard/my-space"
                            : "/dashboard";

                        router.push(targetPath);
                        setShowRestaurantList(false);
                        restaurantContext.handleRestaurantSelect(
                          restaurant._id
                        );
                      }}
                    >
                      {restaurant.name}
                    </li>
                    {i < restaurantContext.restaurantsList.length - 1 && (
                      <hr className="mx-6 opacity-20" />
                    )}
                  </Fragment>
                ))}
              </ul>
            </div>
          )}
      </div>

      <div className="flex items-center justify-end w-full tablet:w-auto">
        <div className="flex">
          <div className="hidden tablet:block">
            <button
              className="bg-violet p-3 rounded-lg bg-opacity-40"
              onClick={handleFullScreenToggle}
            >
              <FullScreenSvg width={25} height={25} fillColor="#634FD2" />
            </button>
          </div>

          {restaurantContext?.userConnected?.role === "owner" && (
            <div className="relative pl-3">
              <div className="relative">
                <button
                  ref={notificationsButtonRef}
                  className="bg-blue p-3 rounded-lg bg-opacity-40"
                  onClick={() => {
                    if (!showNotifications) {
                      setDisplayedCount(totalCount);
                      setShowNotifications(true);
                    } else {
                      setShowNotifications(false);
                    }
                  }}
                >
                  <NotificationSvg width={25} height={25} fillColor="#4583FF" />
                </button>
                {/* Badge de notification */}
                {totalCount > 0 && (
                  <span className="absolute top-0 right-0 inline-flex items-center justify-center px-1 py-0.5 text-xs font-bold leading-none text-white transform translate-x-1/2 -translate-y-1/2 bg-red rounded-full">
                    {totalCount}
                  </span>
                )}
              </div>

              <div
                ref={notificationsRef}
                className={`absolute -left-[100px] tablet:right-0 top-full mt-4 bg-white shadow-lg rounded-lg w-fit z-[60] tablet:z-10 transition-all duration-300 overflow-hidden ${
                  showNotifications ? "max-h-[200px]" : "max-h-0"
                }`}
                style={{ maxHeight: showNotifications ? "200px" : "0" }}
              >
                <div className="p-4">
                  {displayedCount > 0 ? (
                    <ul className="flex flex-col gap-4 text-nowrap">
                      {restaurantContext.newLeaveRequestsCount > 0 && (
                        <li className="text-sm flex items-center justify-between gap-4">
                          <span>
                            {restaurantContext.newLeaveRequestsCount} nouvelle
                            {restaurantContext.newLeaveRequestsCount > 1
                              ? "s"
                              : ""}{" "}
                            demande
                            {restaurantContext.newLeaveRequestsCount > 1
                              ? "s"
                              : ""}{" "}
                            de congé
                          </span>
                          <button
                            className="shrink-0 h-6 w-6 rounded-full bg-darkBlue bg-opacity-10 flex items-center justify-center hover:bg-opacity-20"
                            onClick={(e) => {
                              e.stopPropagation();
                              setShowNotifications(false);
                              router.push(
                                "/dashboard/employees/planning/days-off"
                              );
                            }}
                            aria-label="Voir les demandes de congés"
                            title="Voir les demandes de congés"
                          >
                            <span className="text-sm font-bold leading-none">
                              <VisibleSvg width={12} />
                            </span>
                          </button>
                        </li>
                      )}

                      {restaurantContext.newReservationsCount > 0 && (
                        <li className="text-sm flex items-center justify-between gap-4">
                          <span>
                            {restaurantContext.newReservationsCount} nouvelle
                            {restaurantContext.newReservationsCount > 1
                              ? "s"
                              : ""}{" "}
                            réservation
                            {restaurantContext.newReservationsCount > 1
                              ? "s"
                              : ""}{" "}
                          </span>
                          <button
                            className="shrink-0 h-6 w-6 rounded-full bg-darkBlue bg-opacity-10 flex items-center justify-center hover:bg-opacity-20"
                            onClick={(e) => {
                              e.stopPropagation();
                              setShowNotifications(false);
                              router.push("/dashboard/reservations");
                            }}
                            aria-label="Voir les réservations"
                            title="Voir les réservations"
                          >
                            <span className="text-sm font-bold leading-none">
                              <VisibleSvg width={12} />
                            </span>
                          </button>
                        </li>
                      )}

                      {restaurantContext.newGiftPurchasesCount > 0 && (
                        <li className="text-sm flex items-center justify-between gap-4">
                          <span>
                            {restaurantContext.newGiftPurchasesCount} nouvelle
                            {restaurantContext.newGiftPurchasesCount > 1
                              ? "s"
                              : ""}{" "}
                            carte
                            {restaurantContext.newGiftPurchasesCount > 1
                              ? "s"
                              : ""}{" "}
                            cadeau
                            {restaurantContext.newGiftPurchasesCount > 1
                              ? "x"
                              : ""}{" "}
                            vendue
                            {restaurantContext.newGiftPurchasesCount > 1
                              ? "s"
                              : ""}{" "}
                          </span>
                          <button
                            className="shrink-0 h-6 w-6 rounded-full bg-darkBlue bg-opacity-10 flex items-center justify-center hover:bg-opacity-20"
                            onClick={(e) => {
                              e.stopPropagation();
                              setShowNotifications(false);
                              router.push("/dashboard/gifts");
                            }}
                            aria-label="Voir les cartes cadeaux"
                            title="Voir les cartes cadeaux"
                          >
                            <span className="text-sm font-bold leading-none">
                              <VisibleSvg width={12} />
                            </span>
                          </button>
                        </li>
                      )}
                    </ul>
                  ) : (
                    <p className="opacity-40 italic text-sm w-48">
                      Aucune notification
                    </p>
                  )}
                </div>
              </div>
            </div>
          )}

          <div
            ref={userNameRef}
            className="tablet:border-l tablet:border-black/30 pl-2 ml-6 tablet:pl-4 flex items-center gap-2 tablet:gap-4 text-sm cursor-pointer"
            onClick={() => setShowUserMenu((prev) => !prev)}
          >
            <p>
              {t("settings.hello")},{" "}
              <span className="font-bold ml-1">
                {restaurantContext?.userConnected?.firstname}
              </span>
            </p>
            <div className="h-10 w-10 rounded-full bg-black bg-opacity-20 text-white text-xl flex items-center justify-center">
              {restaurantContext?.userConnected?.firstname?.charAt(0)}
            </div>
          </div>

          <div
            ref={userMenuRef}
            className={`absolute right-0 top-[50px] tablet:top-full mt-2 bg-white shadow-lg rounded-lg w-44 z-[60] tablet:z-10 transition-all duration-300 overflow-hidden ${
              showUserMenu ? "max-h-[300px]" : "max-h-0"
            }`}
            style={{ maxHeight: showUserMenu ? "300px" : "0" }}
          >
            <ul className="flex flex-col">
              <li
                className="cursor-pointer flex gap-4 items-center hover:bg-darkBlue hover:bg-opacity-10 px-4 py-2 my-2"
                onClick={() => router.push("/dashboard/settings")}
              >
                <SettingsSvg width={20} height={20} />
                {t("settings.settings")}
              </li>
              {restaurantContext?.userConnected?.role === "owner" && (
                <>
                  <hr className="h-[1px] bg-darkBlue opacity-20 mx-4" />
                  <li
                    className="cursor-pointer flex gap-4 items-center hover:bg-darkBlue hover:bg-opacity-10 px-4 py-2 my-2"
                    onClick={() => router.push("/dashboard/subscription")}
                  >
                    <InvoiceSvg width={20} height={20} />
                    {t("settings.subscription")}
                  </li>
                </>
              )}
              <hr className="h-[1px] bg-darkBlue opacity-20 mx-4" />
              <li
                className="cursor-pointer flex gap-4 items-center hover:bg-darkBlue hover:bg-opacity-10 px-4 py-2 my-2"
                onClick={() => router.push("/dashboard/help")}
              >
                <HelpSvg width={20} height={20} />
                {t("settings.help")}
              </li>
            </ul>
          </div>
        </div>
      </div>
    </section>
  );
}
