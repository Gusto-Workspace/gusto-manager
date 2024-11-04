import { Fragment, useState, useContext, useRef, useEffect } from "react";
import { useRouter } from "next/router";

// I18N
import { useTranslation } from "next-i18next";

// SVG
import {
  AboutSvg,
  ChevronSvg,
  FullScreenSvg,
  HelpSvg,
  NotificationSvg,
  SettingsSvg,
} from "../_svgs/_index";

// CONTEXT
import { GlobalContext } from "@/contexts/global.context";

// COMPONENTS
import SimpleSkeletonComonent from "../skeleton/simple-skeleton.component";

export default function SettingsComponent() {
  const { t } = useTranslation("");
  const router = useRouter();
  const [showRestaurantList, setShowRestaurantList] = useState(false);
  const [showUserMenu, setShowUserMenu] = useState(false);
  const [showNotifications, setShowNotifications] = useState(false);
  const [notifications, setNotifications] = useState([]);
  const [isFullScreen, setIsFullScreen] = useState(false);
  const { restaurantContext } = useContext(GlobalContext);

  const userMenuRef = useRef(null);
  const userNameRef = useRef(null);
  const notificationsRef = useRef(null);
  const notificationsButtonRef = useRef(null);

  const isSubRoute =
    router.pathname !== "/" && router.pathname.split("/").length > 2;

  function handleFullScreenToggle() {
    const elem = document.documentElement;
    if (!isFullScreen) {
      elem.requestFullscreen?.() ||
        elem.webkitRequestFullscreen?.() ||
        elem.msRequestFullscreen?.();
    } else {
      document.exitFullscreen?.() ||
        document.webkitExitFullscreen?.() ||
        document.msExitFullscreen?.();
    }
    setIsFullScreen(!isFullScreen);
  }

  useEffect(() => {
    function handleClickOutside(event) {
      if (
        userMenuRef.current &&
        !userMenuRef.current.contains(event.target) &&
        !userNameRef.current.contains(event.target)
      ) {
        setShowUserMenu(false);
      }
      if (
        notificationsRef.current &&
        !notificationsRef.current.contains(event.target) &&
        !notificationsButtonRef.current.contains(event.target)
      ) {
        setShowNotifications(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  return (
    <section className="z-50 flex min-h-16 gap-12 justify-between items-center relative">
      {showRestaurantList && (
        <div
          onClick={() => setShowRestaurantList(false)}
          className="fixed inset-0 bg-black bg-opacity-20"
        />
      )}

      <div
        className={`bg-white flex-1 h-full px-6 items-center flex justify-between drop-shadow-sm rounded-lg ${restaurantContext.restaurantsList?.length > 1 && !isSubRoute ? "cursor-pointer" : ""}`}
        onClick={() => {
          if (!isSubRoute && restaurantContext.restaurantsList?.length > 1) {
            setShowRestaurantList(!showRestaurantList);
          }
        }}
      >
        {restaurantContext.dataLoading ? (
          <SimpleSkeletonComonent />
        ) : (
          <h1 className={`${isSubRoute && "opacity-40"}`}>
            {t("settings.restaurant")} -{" "}
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

      <div className="flex">
        <div className="pr-3">
          <button
            className="bg-violet p-3 rounded-lg bg-opacity-40"
            onClick={handleFullScreenToggle}
          >
            <FullScreenSvg width={25} height={25} fillColor="#634FD2" />
          </button>
        </div>

        <div className="border-r pr-8 relative">
          <button
            ref={notificationsButtonRef}
            className="bg-blue p-3 rounded-lg bg-opacity-40"
            onClick={() => setShowNotifications(!showNotifications)}
          >
            <NotificationSvg width={25} height={25} fillColor="#4583FF" />
          </button>

          <div
            ref={notificationsRef}
            className={`absolute right-0 top-full mt-4 bg-white shadow-lg rounded-lg w-64 z-10 transition-all duration-300 overflow-hidden ${
              showNotifications ? "max-h-[200px]" : "max-h-0"
            }`}
            style={{ maxHeight: showNotifications ? "200px" : "0" }}
          >
            <ul className="flex flex-col p-4">
              {notifications.length > 0 ? (
                notifications.map((notification, i) => (
                  <li key={i} className="text-sm py-2">
                    {notification}
                  </li>
                ))
              ) : (
                <li className="opacity-40 italic text-sm">
                  Aucune notification
                </li>
              )}
            </ul>
          </div>
        </div>

        <div
          ref={userNameRef}
          className="pl-8 flex items-center gap-4 text-sm cursor-pointer"
          onClick={() => setShowUserMenu((prev) => !prev)}
        >
          <p>
            {t("settings.hello")},{" "}
            <span className="font-bold ml-1">
              {restaurantContext.restaurantData?.owner_id?.firstname}
            </span>
          </p>

          <div className="h-10 w-10 rounded-full bg-black bg-opacity-20 text-white text-xl flex items-center justify-center">
            {restaurantContext.restaurantData?.owner_id?.firstname?.charAt(0)}
          </div>
        </div>

        <div
          ref={userMenuRef}
          className={`absolute right-0 top-full mt-2 bg-white shadow-lg rounded-lg w-44 z-10 transition-all duration-300 overflow-hidden ${
            showUserMenu ? "max-h-[200px]" : "max-h-0"
          }`}
          style={{ maxHeight: showUserMenu ? "200px" : "0" }}
        >
          <ul className="flex flex-col">
            <li
              className="cursor-pointer flex gap-4 items-center hover:bg-darkBlue hover:bg-opacity-10 px-4 py-2 my-2"
              onClick={() => router.push("/settings")}
            >
              <SettingsSvg width={20} height={20} />
              {t("settings.settings")}
            </li>

            <hr className="h-[1px] bg-darkBlue opacity-20 mx-4" />

            <li
              className="cursor-pointer flex gap-4 items-center hover:bg-darkBlue hover:bg-opacity-10 px-4 py-2 my-2"
              onClick={() => router.push("/help")}
            >
              <HelpSvg width={20} height={20} />
              {t("settings.help")}
            </li>

            <hr className="h-[1px] bg-darkBlue opacity-20 mx-4" />

            <li
              className="cursor-pointer flex gap-4 items-center hover:bg-darkBlue hover:bg-opacity-10 px-4 py-2 my-2"
              onClick={() => router.push("/about")}
            >
              <AboutSvg width={18} height={18} />
              {t("settings.about")}
            </li>
          </ul>
        </div>
      </div>
    </section>
  );
}
