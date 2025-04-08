import React, { useState, useEffect, useContext } from "react";
import { Menu, X } from "lucide-react";
import { useRouter } from "next/router";

// CONTEXT
import { GlobalContext } from "@/contexts/global.context";

export default function NavbarLanding() {
  const { restaurantContext } = useContext(GlobalContext);

  const router = useRouter();
  const [isScrolled, setIsScrolled] = useState(false);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  useEffect(() => {
    const handleScroll = () => {
      if (window.scrollY > 10) {
        setIsScrolled(true);
      } else {
        setIsScrolled(false);
      }
    };

    window.addEventListener("scroll", handleScroll);
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  async function handleScrollToSection(id) {
    requestAnimationFrame(() => {
      const section = document.querySelector(id);
      if (section) {
        section.scrollIntoView({ behavior: "smooth" });
      }
    });
  }

  return (
    <nav
      className={`fixed top-0 left-0 right-0 z-50 transition-all duration-300 ${isScrolled ? "bg-white shadow-md py-3" : "bg-transparent py-5"}`}
    >
      <div className="container mx-auto px-4 md:px-6 flex justify-between items-center">
        <div className="text-2xl md:text-3xl font-display text-darkBlue font-bold flex gap-2">
          <span className={`${isScrolled ? "text-darkBlue" : "text-white"}`}>Gusto Manager</span>
        </div>

        <div className="hidden tablet:flex items-center gap-8">
          <a
            onClick={() => handleScrollToSection("#fonctionnalites")}
            className={`cursor-pointer ${isScrolled ? "text-darkBlue" : "text-white"} hover:text-orange transition-colors`}
          >
            Fonctionnalités
          </a>
          <a
            onClick={() => handleScrollToSection("#modules")}
            className={`cursor-pointer ${isScrolled ? "text-darkBlue" : "text-white"} hover:text-orange transition-colors`}
          >
            Modules
          </a>
          <a
            onClick={() => handleScrollToSection("#pourqui")}
            className={`cursor-pointer ${isScrolled ? "text-darkBlue" : "text-white"} hover:text-orange transition-colors`}
          >
            Pour qui
          </a>

          <button
            onClick={() => {
              const token = localStorage.getItem("token");
              token
                ? router.push("/dashboard")
                : router.push("/dashboard/login");
            }}
            className="bg-orange hover:bg-orange/90 text-white py-2 px-4 rounded-lg cursor-pointer"
          >
            Accéder à mon espace
          </button>
        </div>

        <button
          className="tablet:hidden text-darkBlue"
          onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
        >
          {isMobileMenuOpen ? <X size={24} /> : <Menu size={24} />}
        </button>
      </div>

      {/* Mobile menu */}
      {isMobileMenuOpen && (
        <div className="tablet:hidden fixed top-16 left-0 right-0 bg-white shadow-md p-4 animate-fade-in">
          <div className="flex flex-col gap-4">
            <a
              className="text-darkBlue cursor-pointer hover:text-orange py-2 border-b border-gray-100"
              onClick={() => (
                setIsMobileMenuOpen(false),
                handleScrollToSection("#fonctionnalites")
              )}
            >
              Fonctionnalités
            </a>
            <a
              className="text-darkBlue cursor-pointer hover:text-orange py-2 border-b border-gray-100"
              onClick={() => (
                setIsMobileMenuOpen(false), handleScrollToSection("#modules")
              )}
            >
              Modules
            </a>
            <a
              className="text-darkBlue cursor-pointer hover:text-orange py-2 border-b border-gray-100"
              onClick={() => (
                setIsMobileMenuOpen(false), handleScrollToSection("#pourqui")
              )}
            >
              Pour qui
            </a>
            <button
              onClick={() => {
                const token = localStorage.getItem("token");
                token
                  ? router.push("/dashboard")
                  : router.push("/dashboard/login");
              }}
              className="bg-orange hover:bg-orange/90 text-white mt-2"
            >
              Accéder à mon espace
            </button>
          </div>
        </div>
      )}
    </nav>
  );
}
