import { useContext } from "react";
import Head from "next/head";
import { GlobalContext } from "@/contexts/global.context";
import NavAdminComponent from "@/components/dashboard/admin/_shared/nav/nav.admin.component";

export default function DesignLabShell({ title, children }) {
  const { adminContext } = useContext(GlobalContext);
  if (!adminContext.isAuth) return null;
  return (
    <>
      <Head>
        <title>{title} | Gusto Manager</title>
      </Head>
      <div className="flex">
        <NavAdminComponent />
        <main className="tablet:ml-[88px] min-h-screen min-w-0 flex-1 bg-lightGrey p-4 text-darkBlue mobile:p-6">
          {adminContext.isAdmin ? (
            children
          ) : (
            <p className="mt-20 text-center">
              Accès réservé aux administrateurs.
            </p>
          )}
        </main>
      </div>
    </>
  );
}
