import { Fragment, useState } from "react";

// SVG
import { ChevronSvg, NotificationSvg } from "../_svgs/_index";

// COMPONENTS
import SimpleSkeletonComonent from "../skeleton/simple-skeleton.component";

export default function SettingsComponent(props) {
  const [showRestaurantList, setShowRestaurantList] = useState(false);

  return (
    <section className="z-10 flex min-h-16 gap-12 justify-between items-center relative">
      {showRestaurantList && (
        <div
          onClick={() => setShowRestaurantList(false)}
          className="fixed inset-0 bg-black bg-opacity-15"
        />
      )}

      <div
        className={`bg-white flex-1 h-full px-6 items-center flex justify-between drop-shadow-sm rounded-lg ${props.restaurantsList?.length > 1 ? "cursor-pointer" : ""}`}
        onClick={() => {
          props?.restaurantsList?.length > 1
            ? setShowRestaurantList(!showRestaurantList)
            : null;
        }}
      >
        {props.dataLoading ? (
          <SimpleSkeletonComonent />
        ) : (
          <h1>Restaurant - {props.restaurantName}</h1>
        )}

        {props?.restaurantsList?.length > 1 && <ChevronSvg />}

        {showRestaurantList && props?.restaurantsList?.length > 1 && (
          <div className="absolute top-full left-0 bg-white shadow-sm rounded-lg mt-2 w-full">
            <ul>
              {props.restaurantsList.map((restaurant, i) => (
                <Fragment key={restaurant._id}>
                  <li
                    className="p-6 cursor-pointer"
                    onClick={() => {
                      setShowRestaurantList(false);
                      props.onRestaurantSelect(restaurant._id);
                    }}
                  >
                    {restaurant.name}
                  </li>
                  {i < props.restaurantsList.length - 1 && (
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
            Bonjour, <span className="font-bold">{props.ownerFirstname}</span>
          </p>

          <div className="h-10 w-10 rounded-full bg-black bg-opacity-20 text-white text-xl flex items-center justify-center">
            {props.ownerFirstname?.charAt(0)}
          </div>
        </div>
      </div>
    </section>
  );
}
