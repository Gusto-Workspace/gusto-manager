import { Fragment, useState, useContext } from "react";
import { useRouter } from "next/router";

// SVG
import { ChevronSvg, NotificationSvg } from "../_svgs/_index";

// CONTEXT
import { GlobalContext } from "@/contexts/global.context";

// COMPONENTS
import SimpleSkeletonComonent from "../skeleton/simple-skeleton.component";

export default function SettingsComponent() {
  const router = useRouter();
  const [showRestaurantList, setShowRestaurantList] = useState(false);
  const { restaurantContext } = useContext(GlobalContext);

  const isSubRoute =
    router.pathname !== "/" && router.pathname.split("/").length > 2;

  return (
    <section className="z-10 flex min-h-16 gap-12 justify-between items-center relative">
      {showRestaurantList && (
        <div
          onClick={() => setShowRestaurantList(false)}
          className="fixed inset-0 bg-black bg-opacity-15"
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
            Restaurant - {restaurantContext.restaurantData?.name}
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
        <div className="border-r px-8">
          <button className="bg-blue p-3 rounded-lg bg-opacity-60">
            <NotificationSvg width={25} height={25} fillColor="#4583FF" />
          </button>
        </div>

        <div className="pl-8 flex items-center gap-4 text-sm">
          <p>
            Bonjour,
            <span className="font-bold ml-1">
              {restaurantContext.restaurantData?.owner_id?.firstname}
            </span>
          </p>

          <div className="h-10 w-10 rounded-full bg-black bg-opacity-20 text-white text-xl flex items-center justify-center">
            {restaurantContext.restaurantData?.owner_id?.firstname?.charAt(0)}
          </div>
        </div>
      </div>
    </section>
  );
}
