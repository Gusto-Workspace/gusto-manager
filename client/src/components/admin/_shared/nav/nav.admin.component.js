import { useRouter } from "next/router";
import Link from "next/link";

// I18N
import { useTranslation } from "next-i18next";

export default function NavAdminComponent() {
  const { t } = useTranslation("admin");

  const router = useRouter();

  function handleLogout() {
    localStorage.removeItem("admin-token");

    router.push("/admin/login");
  }

  return (
    <nav
      style={{ boxShadow: "3px 0 5px rgba(0, 0, 0, 0.05)" }}
      className="w-[250px] h-screen overflow-y-auto flex flex-col py-6 px-4 gap-8 z-10 text-darkBlue"
    >
      <div className=" z-10 opacity-40 h-[86px]">
        <h1 className="flex flex-col items-center gap-2 text-lg font-semibold">
          <img
            src="/img/logo.webp"
            draggable={false}
            alt="logo"
            className="max-w-[50px]"
          />
          <div className="flex gap-1">
            <span>Gusto</span>
            <span>Manager</span>
          </div>
        </h1>
      </div>{" "}
      <ul className="flex-1 flex flex-col gap-8">
        <li className="h-12 flex items-center">
          <Link
            href="/admin"
            className={router.pathname === "/admin" ? "text-blue" : ""}
          >
            {t("nav.dashboard")}
          </Link>
        </li>
        <li className="h-12 flex items-center">
          <Link
            href="/admin/restaurants"
            className={
              router.pathname === "/admin/restaurants" ? "text-blue" : ""
            }
          >
            {t("nav.restaurants")}
          </Link>
        </li>
        <li className="h-12 flex items-center">
          <Link
            href="/admin/owners"
            className={router.pathname === "/admin/owners" ? "text-blue" : ""}
          >
            {t("nav.owners")}
          </Link>
        </li>
        <li className="h-12 flex items-center">
          <Link
            href="/admin/subscriptions"
            className={
              router.pathname === "/admin/subscriptions" ? "text-blue" : ""
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
