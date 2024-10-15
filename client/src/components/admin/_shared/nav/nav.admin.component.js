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
    <nav className="border w-[200px] h-screen flex flex-col pt-6 pb-12 px-4 gap-12">
      <img src="/img/logo.webp" draggable={false} className="max-w-[100px] mx-auto opacity-40" alt="logo"/>
      <ul className="flex-1 flex flex-col gap-8">
        <li className="h-12 flex items-center">
          <Link
            href="/admin"
            className={
              router.pathname === "/admin" ? "text-blue" : ""
            }
          >
            {t('nav.dashboard')}
          </Link>
        </li>
        <li className="h-12 flex items-center">
          <Link
            href="/admin/restaurants"
            className={
              router.pathname === "/admin/restaurants" ? "text-blue" : ""
            }
          >
            {t('nav.restaurants')}
          </Link>
        </li>
        <li className="h-12 flex items-center">
          <Link
            href="/admin/owners"
            className={
              router.pathname === "/admin/owners" ? "text-blue" : ""
            }
          >
            {t('nav.owners')}
          </Link>
        </li>
        <li className="h-12 flex items-center">
          <Link
            href="/admin/subscriptions"
            className={
              router.pathname === "/admin/subscriptions" ? "text-blue" : ""
            }
          >
            {t('nav.subscriptions')}
          </Link>
        </li>
      </ul>

      <button
        className="text-white bg-red py-2 rounded-lg"
        onClick={handleLogout}
      >
        {t('buttons.logout')}
      </button>
    </nav>
  );
}
