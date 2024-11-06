import { createContext } from "react";

// CONTEXTS
import RestaurantContext from "./restaurant.context";
import AdminContext from "./admin.context";

export const GlobalContext = createContext();

export function GlobalProvider(props) {
  const restaurantContext = RestaurantContext();
  const adminContext = AdminContext();

  return (
    <GlobalContext.Provider
      value={{
        restaurantContext,
        adminContext,
      }}
    >
      {props.children}
    </GlobalContext.Provider>
  );
}
