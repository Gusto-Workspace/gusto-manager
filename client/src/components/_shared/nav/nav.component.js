import Link from "next/link";
import { useRouter } from "next/router";
import { useState, useEffect, useRef } from "react";

// I18N
import { useTranslation } from "next-i18next";

// SVGS
import { ChevronSvg } from "../_svgs/chevron.svg";

export default function NavbarComponent() {
  const { t } = useTranslation("common");
  const router = useRouter();
  const { locale, locales } = router;

  const [isOpen, setIsOpen] = useState(false);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const menuRef = useRef(null);

  function changeLanguage(newLocale) {
    setIsOpen(!isOpen);
    router.push(router.pathname, router.asPath, { locale: newLocale });
  }

  function toggleMenu() {
    setIsOpen(!isOpen);
  }

  useEffect(() => {
    function handleClickOutside(event) {
      if (menuRef.current && !menuRef.current.contains(event.target)) {
        setIsOpen(false);
      }
    }

    document.addEventListener("mousedown", handleClickOutside);

    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [menuRef]);

  return (
    <>
      {/* NAV DESKTOP */}
      <nav className="hidden desktop:flex w-full items-center justify-between h-[100px]">
        <ul className="flex gap-[3vw] w-1/3">
          <li>
            <Link href="/about">
              <a className="relative">
                {t("nav.list.about")}
                {router.pathname === "/about" && (
                  <span className="absolute -bottom-4 left-1/2 transform -translate-x-1/2 h-2 w-2 bg-blue rounded-full" />
                )}
              </a>
            </Link>
          </li>
          <li>
            <Link href="/programs">
              <a className="relative">
                {t("nav.list.programs")}
                {router.pathname === "/programs" && (
                  <span className="absolute -bottom-4 left-1/2 transform -translate-x-1/2 h-2 w-2 bg-blue rounded-full" />
                )}
              </a>
            </Link>
          </li>
          <li>
            <Link href="/contact">
              <a className="relative">
                {t("nav.list.contact")}
                {router.pathname === "/contact" && (
                  <span className="absolute -bottom-4 left-1/2 transform -translate-x-1/2 h-2 w-2 bg-blue rounded-full" />
                )}
              </a>
            </Link>
          </li>
        </ul>

        <div className="w-1/3 flex justify-center">
          <Link href="/">
            <a>
              <img
                src="/img/logo-2.png"
                draggable={false}
                className="max-w-[175px] cursor-pointer -mt-[20px]"
              />
            </a>
          </Link>
        </div>

        <div className="flex justify-end items-center gap-4 w-1/3">
          <div className="relative text-left" ref={menuRef}>
            <button
              className="inline-flex justify-center py-2 w-12 items-center gap-2"
              id="options-menu"
              aria-expanded="true"
              aria-haspopup="true"
              onClick={toggleMenu}
            >
              {locale.toUpperCase()}
              <ChevronSvg className="opacity-25" />
            </button>

            <div
              className={`z-10 origin-top-right absolute left-1/2 -translate-x-1/2 w-12 flex flex-col justify-center py-2 rounded-md shadow-lg bg-white ring-1
            transition-all duration-300 ease-in-out transform ${
              isOpen
                ? "opacity-100 translate-y-0"
                : "opacity-0 translate-y-4 pointer-events-none"
            }`}
              role="menu"
              aria-orientation="vertical"
              aria-labelledby="options-menu"
            >
              {locales.map((locale) => (
                <button
                  key={locale}
                  className="block py-2 text-sm"
                  onClick={() => changeLanguage(locale)}
                >
                  {locale.toUpperCase()}
                </button>
              ))}
            </div>
          </div>

          <span className="opacity-25">|</span>

          <Link href="/sign-up">
            <a className="bg-pink text-white font-semibold rounded-[15px] px-6 py-3 cursor-pointer">
              {t("nav.button.inscription")}
            </a>
          </Link>
        </div>
      </nav>

      {/* NAV MOBILR */}

      <div className="desktop:hidden relative">
        <div className="flex w-full items-end justify-between pb-6 pt-4 bg-white">
          <div className="">
            <Link href="/">
              <a>
                <img
                  src="/img/logo-2.png"
                  draggable={false}
                  className="max-w-[200px] cursor-pointer"
                  alt="Logo"
                />
              </a>
            </Link>
          </div>

          <button
            className="bg-pink p-4 rounded-[15px]"
            onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
          >
            <div
              className={`h-0.5 w-6 bg-darkBlue transform transition duration-500 ease-in-out ${
                isMobileMenuOpen ? "rotate-45 translate-y-2.5" : ""
              }`}
            />
            <div className="my-2">
              <div
                className={`h-0.5 w-6 bg-darkBlue transition-all duration-500 ease-in-out ${
                  isMobileMenuOpen ? "opacity-0" : "opacity-100"
                }`}
              />
            </div>
            <div
              className={`h-0.5 w-6 bg-darkBlue transform transition duration-500 ease-in-out ${
                isMobileMenuOpen ? "-rotate-45 -translate-y-2.5" : ""
              }`}
            />
          </button>
        </div>

        <div
          className={`overflow-hidden absolute left-0 right-0 flex flex-col bg-darkBlue rounded-[30px] z-40 transition-all duration-300 ${
            isMobileMenuOpen
              ? "max-h-[500px] pointer-events-auto"
              : "max-h-0 pointer-events-none"
          }`}
        >
          <ul className="text-white flex items-center flex-col gap-6 font-medium text-lg py-8">
            <li>
              <Link href="/about">
                <a onClick={() => setIsMobileMenuOpen(false)}>
                  {t("nav.list.about")}
                </a>
              </Link>
            </li>
            <li>
              <Link href="/programs">
                <a onClick={() => setIsMobileMenuOpen(false)}>
                  {t("nav.list.programs")}
                </a>
              </Link>
            </li>
            <li>
              <Link href="/contact">
                <a onClick={() => setIsMobileMenuOpen(false)}>
                  {t("nav.list.contact")}
                </a>
              </Link>
            </li>
          </ul>

          <div className="flex justify-center items-center gap-8 py-8 bg-white bg-opacity-5">
            <div className="relative text-left">
              <div
                className="flex gap-4 justify-center text-white"
                role="menu"
                aria-orientation="vertical"
                aria-labelledby="options-menu"
              >
                {locales.map((locale) => (
                  <button
                    key={locale}
                    className="block py-2 bg-blue p-3 rounded-[10px]"
                    onClick={() => changeLanguage(locale)}
                  >
                    {locale.toUpperCase()}
                  </button>
                ))}
              </div>
            </div>

            <Link href="/sign-up">
              <a
                className="bg-pink text-darkBlue font-semibold rounded-[15px] px-3 py-3 cursor-pointer"
                onClick={() => setIsMobileMenuOpen(false)}
              >
                {t("nav.button.inscription")}
              </a>
            </Link>
          </div>
        </div>
      </div>
    </>
  );
}
