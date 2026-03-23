import { useState, useEffect } from "react";

// ICONS
import { Menu, X } from "lucide-react";

// ROUTER
import { useRouter } from "next/router";
import Image from "next/image";

export default function NavbarLanding() {
  const router = useRouter();

  const [isScrolled, setIsScrolled] = useState(false);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  useEffect(() => {
    const handleScroll = () => {
      setIsScrolled(window.scrollY > 10);
    };

    window.addEventListener("scroll", handleScroll);
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  useEffect(() => {
    if (isMobileMenuOpen) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }

    return () => {
      document.body.style.overflow = "";
    };
  }, [isMobileMenuOpen]);

  function handleRestaurantSpace() {
    const token =
      typeof window !== "undefined" ? localStorage.getItem("token") : null;

    if (isMobileMenuOpen) setIsMobileMenuOpen(false);

    token ? router.push("/dashboard") : router.push("/dashboard/login");
  }

  function handleContact() {
    if (isMobileMenuOpen) setIsMobileMenuOpen(false);
    router.push("/contact");
  }

  return (
    <>
      <nav className="fixed top-4 left-0 right-0 z-50">
        <div className="mx-auto max-w-[95%] tablet:max-w-[85%] rounded-2xl bg-darkBlue border-2 border-darkBlue">
          <div className="flex items-center justify-between px-5 py-4 tablet:px-6">
            <a
              href="/"
              className="flex gap-4 items-center font-display font-bold text-lightGrey"
            >
              <Image
                src="/img/logo-nav.png"
                alt="Logo Gusto Manager"
                width={45}
                height={45}
                className="h-auto w-auto"
              />
              <span className="uppercase text-xl">Gusto Manager</span>
            </a>

            {/* DESKTOP ACTIONS */}
            <div className="hidden tablet:flex items-center gap-3">
              <button
                onClick={handleContact}
                className="rounded-2xl border-2 border-lightGrey/70 px-5 py-2 text-lightGrey transition-all duration-300 hover:bg-white/5 cursor-pointer"
              >
                Contactez-nous
              </button>

              <button
                onClick={handleRestaurantSpace}
                className="rounded-2xl bg-orange px-5 py-2 text-white transition-all duration-300 hover:bg-orange/90 cursor-pointer"
              >
                Espace restaurateur
              </button>
            </div>

            {/* MOBILE BURGER */}
            <button
              className="tablet:hidden text-lightGrey"
              onClick={() => setIsMobileMenuOpen(true)}
              aria-label="Ouvrir le menu"
            >
              <Menu size={30} />
            </button>
          </div>
        </div>
      </nav>

      {/* MOBILE OVERLAY */}
      <div
        className={`fixed inset-0 z-[60] bg-black/40 transition-opacity duration-300 tablet:hidden ${
          isMobileMenuOpen
            ? "pointer-events-auto opacity-100"
            : "pointer-events-none opacity-0"
        }`}
        onClick={() => setIsMobileMenuOpen(false)}
      />

      {/* MOBILE PANEL */}
      <div
        className={`fixed top-0 right-0 z-[70] h-full w-[85%] max-w-[360px] bg-darkBlue tablet:hidden transition-transform duration-300 ease-out ${
          isMobileMenuOpen ? "translate-x-0" : "translate-x-full"
        }`}
      >
        <div className="flex h-full flex-col px-6 py-5">
          <div className="mb-10 flex items-center justify-between gap-4">
            <a
              href="/"
              onClick={() => setIsMobileMenuOpen(false)}
              className="flex items-center gap-3 font-display font-bold text-lightGrey"
            >
              <Image
                src="/img/logo-nav.png"
                alt="Logo Gusto Manager"
                width={40}
                height={40}
                className="w-auto h-auto"
              />
              <span className="uppercase text-lg leading-none">
                Gusto Manager
              </span>
            </a>

            <button
              onClick={() => setIsMobileMenuOpen(false)}
              className="shrink-0 text-lightGrey"
              aria-label="Fermer le menu"
            >
              <X size={28} />
            </button>
          </div>

          <div className="mt-6 flex flex-col gap-4">
            <button
              onClick={handleContact}
              className="w-full rounded-2xl border-2 border-lightGrey/70 px-5 py-3 text-lightGrey transition-all duration-300 hover:bg-white/5 cursor-pointer"
            >
              Contactez-nous
            </button>

            <button
              onClick={handleRestaurantSpace}
              className="w-full rounded-2xl bg-orange px-5 py-3 text-white transition-all duration-300 hover:bg-orange/90 cursor-pointer"
            >
              Espace restaurateur
            </button>
          </div>
        </div>
      </div>
    </>
  );
}