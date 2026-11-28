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
      {adminContext.protectedPage && !adminContext.isAuth ? (
        <main className="mx-auto max-w-xl p-6 text-darkBlue">
          {adminContext.sessionUnavailable ? (
            <>
              <p role="alert">Impossible de vérifier la session administrateur pour le moment.</p>
              <button type="button" onClick={adminContext.retrySession} className="mt-3 rounded-lg border p-2">Réessayer</button>
            </>
          ) : <p role="status">Vérification de la session administrateur…</p>}
        </main>
      ) : props.children}
    </GlobalContext.Provider>
  );
}
