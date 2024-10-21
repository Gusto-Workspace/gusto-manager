import { createContext } from "react";

// CONTEXTS
import RestaurantContext from "./restaurant.context";

export const GlobalContext = createContext();

export function GlobalProvider(props) {
  const restaurantContext = RestaurantContext();

  return (
    <GlobalContext.Provider
      value={{
        restaurantContext,
      }}
    >
      {props.children}
    </GlobalContext.Provider>
  );
}
