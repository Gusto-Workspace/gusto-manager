import { useState, useEffect } from "react";

// ICONS
import { Menu, X } from "lucide-react";

// ROUTER
import { useRouter } from "next/router";

export default function NavbarLanding(props) {
  const router = useRouter();

  const [isScrolled, setIsScrolled] = useState(false);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  useEffect(() => {
    const handleScroll = () => {
      if (window.scrollY > 10) setIsScrolled(true);
      else setIsScrolled(false);
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
  }, [isMobileMenuOpen]);

  function wait(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  async function handleScrollToSection(id) {
    setIsMobileMenuOpen(false);
    await wait(300);
    if (router.pathname !== "/") {
      await router.push("/");
      setTimeout(() => {
        const section = document.querySelector(id);
        if (section) {
          section.scrollIntoView({ behavior: "smooth" });
        }
      }, 200);
    } else {
      requestAnimationFrame(() => {
        const section = document.querySelector(id);
        if (section) {
          section.scrollIntoView({ behavior: "smooth" });
        }
      });
    }
  }

  return (
    <nav
      className={`fixed top-0 left-0 right-0 z-50 transition-all duration-300 ${
        isScrolled ? "bg-white shadow-md py-3" : "bg-transparent py-5"
      }`}
    >
      <div className="container mx-auto px-4 tablet:px-6 flex justify-between items-center">
        <div className="text-2xl md:text-3xl font-display font-bold flex gap-2">
          <a href="/" className={isScrolled ? "text-darkBlue" : "text-white"}>
            Gusto Manager
          </a>
        </div>

        <div className="hidden tablet:flex items-center gap-8">
          {["#plateforme", "#avantages", "#fonctionnalités", "#modules"].map(
            (id, i) => (
              <a
                key={i}
                onClick={() => handleScrollToSection(id)}
                className={`cursor-pointer ${
                  isScrolled ? "text-darkBlue" : "text-white"
                } hover:text-orange transition-colors`}
              >
                {id.replace("#", "").charAt(0).toUpperCase() + id.slice(2)}{" "}
              </a>
            ),
          )}
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
          className={`tablet:hidden ${
            isScrolled ? "text-darkBlue" : "text-white"
          }`}
          onClick={() => setIsMobileMenuOpen(true)}
        >
          <Menu size={32} />
        </button>
      </div>

      {/* Overlay */}
      {isMobileMenuOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/50 animate-fade-in"
          onClick={() => setIsMobileMenuOpen(false)}
        />
      )}

      {/* Mobile Menu */}
      <div
        className={`fixed top-0 left-0 right-0 z-50 bg-white shadow-md p-6 transition-transform duration-300 tablet:hidden rounded-b-xl ${
          isMobileMenuOpen ? "translate-y-0" : "-translate-y-full"
        }`}
        style={{
          transform: isMobileMenuOpen ? "translateY(0%)" : "translateY(-100%)",
        }}
      >
        <div className="flex justify-end mb-4">
          <button onClick={() => setIsMobileMenuOpen(false)}>
            <X size={28} />
          </button>
        </div>

        <div className="flex flex-col items-center gap-8">
          <div className="text-2xl font-display font-bold absolute top-5 left-1/2 -translate-x-1/2">
            <span className="text-darkBlue">Gusto Manager</span>
          </div>
          {["#plateforme", "#avantages", "#fonctionnalités", "#modules"].map(
            (id, i) => (
              <a
                key={i}
                onClick={() => handleScrollToSection(id)}
                className="cursor-pointer text-darkBlue hover:text-orange transition-colors"
              >
                {id.replace("#", "").charAt(0).toUpperCase() + id.slice(2)}
              </a>
            ),
          )}
          <button
            onClick={() => {
              const token = localStorage.getItem("token");
              setIsMobileMenuOpen(false);
              token
                ? router.push("/dashboard")
                : router.push("/dashboard/login");
            }}
            className="bg-orange hover:bg-orange/90 text-white py-2 px-4 rounded-lg cursor-pointer"
          >
            Accéder à mon espace
          </button>
        </div>
      </div>
    </nav>
  );
}
