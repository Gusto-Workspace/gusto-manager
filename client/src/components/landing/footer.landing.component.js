import { useRouter } from "next/router";

export default function FooterLandingComponent() {
  const router = useRouter()
  function wait(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  async function handleScrollToSection(id) {
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
    <footer className="bg-lightBlack text-white py-12 text-center tablet:text-left">
      <div className="container mx-auto px-4 tablet:px-6">
        <div className="grid grid-cols-1 tablet:grid-cols-3 gap-8">
          <div>
            <h3 className="text-2xl font-display font-bold mb-4">
              Gusto Manager
            </h3>
            <p className="mb-4">
              La solution modulaire de gestion digitale pour les restaurants.
            </p>
          </div>

          <div className="w-fit mx-auto">
            <h4 className="font-bold text-lg mb-4">Liens rapides</h4>
            <ul className="space-y-2">
              <li>
                <a
                  onClick={() => handleScrollToSection("#plateforme")}
                  className="cursor-pointer text-white hover:text-orange transition-colors"
                >
                  Plateforme
                </a>
              </li>
              <li>
                <a
                  onClick={() => handleScrollToSection("#avantages")}
                  className="cursor-pointer text-white hover:text-orange transition-colors"
                >
                  Avantages
                </a>
              </li>
              <li>
                <a
                  onClick={() => handleScrollToSection("#fonctionnalités")}
                  className="cursor-pointer text-white hover:text-orange transition-colors"
                >
                  Fonctionnalités
                </a>
              </li>
              <li>
                <a
                  onClick={() => handleScrollToSection("#modules")}
                  className="cursor-pointer text-white hover:text-orange transition-colors"
                >
                  Modules
                </a>
              </li>
            </ul>
          </div>

          <div className="w-fit mx-auto">
            <h4 className="font-bold text-lg mb-4">Légal</h4>
            <ul className="space-y-2">
              <li>
                <a
                  href="/legal"
                  className="hover:text-orange transition-colors"
                >
                  Mentions légales
                </a>
              </li>
              <li>
                <a
                  href="/privacy-policy"
                  className="hover:text-orange transition-colors"
                >
                  Politiques de confidentialité
                </a>
              </li>
            </ul>
          </div>
        </div>

        <div className="border-t border-gray-700 mt-10 pt-8 text-center text-sm text-gray-300">
          <p>
            &copy; {new Date().getFullYear()} Gusto Manager. Tous droits
            réservés.
          </p>
        </div>
      </div>
    </footer>
  );
}
