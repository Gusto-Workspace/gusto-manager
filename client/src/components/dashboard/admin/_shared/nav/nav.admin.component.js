import { useRouter } from "next/router";
import Link from "next/link";

// I18N
import { useTranslation } from "next-i18next";

export default function NavAdminComponent() {
  const { t } = useTranslation("admin");

  const router = useRouter();

  function handleLogout() {
    localStorage.removeItem("admin-token");

    router.push("/dashboard/admin/login");
  }

  return (
    <nav
      style={{ boxShadow: "3px 0 5px rgba(0, 0, 0, 0.05)" }}
      className="w-[250px] fixed bg-white h-screen overflow-y-auto flex flex-col py-6 px-4 gap-8 z-10 text-darkBlue"
    >
      <div className=" z-10 opacity-40 h-[86px] flex items-center justify-start">
        <h1 className="flex flex-col items-center gap-2 text-lg font-semibold">
          <div className="flex gap-4 items-center">
            <img
              src="/img/logo.png"
              draggable={false}
              alt="logo"
              className="max-w-[75px]"
            />
            <img
              src="/img/logo-2.png"
              draggable={false}
              alt="logo"
              className="max-w-[100px]"
            />
          </div>
        </h1>
      </div>

      <ul className="flex-1 flex flex-col gap-8">
        <li className="h-12 flex items-center">
          <Link
            href="/dashboard/admin"
            className={router.pathname === "/admin" ? "text-blue" : ""}
          >
            {t("nav.dashboard")}
          </Link>
        </li>
        <li className="h-12 flex items-center">
          <Link
            href="/dashboard/admin/restaurants"
            className={
              router.pathname === "/dashboard/admin/restaurants"
                ? "text-blue"
                : ""
            }
          >
            {t("nav.restaurants")}
          </Link>
        </li>

        <li className="h-12 flex items-center">
          <Link
            href="/dashboard/admin/owners"
            className={
              router.pathname === "/dashboard/admin/owners" ? "text-blue" : ""
            }
          >
            {t("nav.owners")}
          </Link>
        </li>

        <li className="h-12 flex items-center">
          <Link
            href="/dashboard/admin/subscriptions"
            className={
              router.pathname === "/dashboard/admin/subscriptions"
                ? "text-blue"
                : ""
            }
          >
            {t("nav.subscriptions")}
          </Link>
        </li>
      </ul>
      <button
        className="text-white bg-red py-2 rounded-lg"
        onClick={handleLogout}
      >
        {t("buttons.logout")}
      </button>
    </nav>
  );
}
