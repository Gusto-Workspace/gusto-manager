import {
  Fragment,
  useState,
  useContext,
  useRef,
  useEffect,
  useMemo,
} from "react";
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
} from "../_svgs/_index";

// CONTEXT
import { GlobalContext } from "@/contexts/global.context";

// COMPONENTS
import SimpleSkeletonComponent from "../skeleton/simple-skeleton.component";
import NotificationsDrawerComponent from "../notifications/notifications-drawer.component";

export default function SettingsComponent() {
  const { t } = useTranslation("");
  const router = useRouter();

  const [showRestaurantList, setShowRestaurantList] = useState(false);
  const [showUserMenu, setShowUserMenu] = useState(false);
  const [openNotificationsDrawer, setOpenNotificationsDrawer] = useState(false);

  const { restaurantContext } = useContext(GlobalContext);

  const userMenuRef = useRef(null);
  const userNameRef = useRef(null);

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

  // Bloque le scroll quand la liste de restos est ouverte
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

  // Fermeture du menu user au clic extérieur
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

  const profilePictureUrl =
    restaurantContext?.userConnected?.profilePictureUrl || null;

  const unreadCount = restaurantContext?.unreadCounts?.total || 0;

  const token =
    typeof window !== "undefined" ? localStorage.getItem("token") : null; // adapte si ton token owner a un autre nom
  const restaurantId = restaurantContext?.restaurantData?._id || null;

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
                          restaurant._id,
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

          {/* ✅ NOTIFS : owner only  --> pour employee aussi, ["owner", "employee"] */}
          {["owner"].includes(restaurantContext?.userConnected?.role) && (
            <div className="relative pl-3">
              <div className="relative">
                <button
                  className="bg-blue p-3 rounded-lg bg-opacity-40"
                  onClick={() => setOpenNotificationsDrawer(true)}
                  aria-label="Ouvrir les notifications"
                  title="Notifications"
                >
                  <NotificationSvg width={25} height={25} fillColor="#4583FF" />
                </button>

                {unreadCount > 0 && (
                  <span className="absolute top-0 right-0 inline-flex items-center justify-center px-1 py-0.5 text-xs font-bold leading-none text-white transform translate-x-1/2 -translate-y-1/2 bg-red rounded-full">
                    {unreadCount}
                  </span>
                )}
              </div>

              {/* ✅ Drawer notifications */}
              <NotificationsDrawerComponent
                open={openNotificationsDrawer}
                onClose={() => setOpenNotificationsDrawer(false)}
                notifications={restaurantContext?.notifications}
                nextCursor={restaurantContext?.notificationsNextCursor}
                loading={restaurantContext?.notificationsLoading}
                fetchNotifications={restaurantContext?.fetchNotifications}
                markNotificationRead={restaurantContext?.markNotificationRead}
                markAllRead={restaurantContext?.markAllRead}
                role={restaurantContext?.userConnected?.role}
                lastNotificationsSyncRef={
                  restaurantContext?.lastNotificationsSyncRef
                }
              />
            </div>
          )}

          {/* USER MENU */}
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
            <div className="h-10 w-10 rounded-full bg-black bg-opacity-20 text-white text-xl flex items-center justify-center overflow-hidden">
              {profilePictureUrl ? (
                <img
                  src={profilePictureUrl}
                  alt={`Avatar ${restaurantContext?.userConnected?.firstname || ""}`}
                  className="w-full h-full object-cover"
                  referrerPolicy="no-referrer"
                />
              ) : (
                restaurantContext?.userConnected?.firstname?.charAt(0)
              )}
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
