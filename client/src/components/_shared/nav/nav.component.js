import { useRouter } from "next/router";
import Link from "next/link";

// I18N
import { useTranslation } from "next-i18next";

// DATA
import { navItemsData } from "@/_assets/data/_index.data";

// ICONS
import * as icons from "@/components/_shared/_svgs/_index";

export default function NavComponent() {
  const { t } = useTranslation("admin");

  const router = useRouter();

  function handleLogout() {
    localStorage.removeItem("token");

    router.push("/login");
  }

  return (
    <nav
      style={{ boxShadow: "3px 0 5px rgba(0, 0, 0, 0.05)" }}
      className="w-[250px] h-screen overflow-y-auto flex flex-col pt-6 pb-12 px-4 gap-12 z-10 text-darkBlue"
    >
      <img
        src="/img/logo.webp"
        draggable={false}
        className="max-w-[50px] mx-auto opacity-40"
        alt="logo"
      />
      <ul className="flex-1 flex flex-col gap-8">
        {navItemsData.map((item) => {
          const IconComponent = icons[item.icon];
          return (
            <li
              key={item.href}
              className={`h-12 flex items-center  pl-1 pr-6 ${
                router.pathname === item.href &&
                "text-blue bg-blue bg-opacity-30 rounded-full"
              }`}
            >
              <Link
                className="h-12 flex gap-2 items-center w-full"
                href={item.href}
              >
                {IconComponent && (
                  <div
                    className={`${router.pathname === item.href ? "bg-blue" : ""} p-[10px] rounded-full`}
                  >
                    <IconComponent
                      width={20}
                      height={20}
                      fillColor={`${router.pathname === item.href ? "white" : ""}`}
                    />
                  </div>
                )}
                {item.label}
              </Link>
            </li>
          );
        })}
      </ul>

      <button
        className="text-white bg-red py-2 rounded-lg"
        onClick={handleLogout}
      >
        Déconnexion
      </button>
    </nav>
  );
}
