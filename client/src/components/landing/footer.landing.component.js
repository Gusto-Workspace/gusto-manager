import { useRouter } from "next/router";

export default function FooterLandingComponent() {
  const router = useRouter();

  function handleRestaurantSpace() {
    const token =
      typeof window !== "undefined" ? localStorage.getItem("token") : null;

    token ? router.push("/dashboard") : router.push("/dashboard/login");
  }

  return (
    <footer className="bg-darkBlue text-white pt-16 pb-10">
      <div className="mx-auto max-w-[1400px] px-4 tablet:px-6">
        <div className="grid grid-cols-1 tablet:grid-cols-3 gap-10 items-start">
          
          {/* LEFT */}
          <div className="w-full max-w-[320px] text-left justify-self-start">
            <h3 className="text-2xl font-display font-bold mb-4">
              Gusto Manager
            </h3>
            <p className="text-white/70 leading-relaxed">
              La plateforme tout-en-un pour simplifier la gestion de votre
              restaurant et développer votre activité.
            </p>
          </div>

          {/* CENTER */}
          <div className="w-full max-w-[320px] text-left justify-self-center">
            <h4 className="font-semibold mb-4 text-white/90">Navigation</h4>

            <ul className="space-y-3 text-white/70">
              <li
                onClick={handleRestaurantSpace}
                className="cursor-pointer hover:text-white transition"
              >
                Espace restaurateur
              </li>

              <li
                onClick={() => router.push("/contact")}
                className="cursor-pointer hover:text-white transition"
              >
                Contact
              </li>
            </ul>
          </div>

          {/* RIGHT */}
          <div className="w-full max-w-[320px] text-left justify-self-end">
            <h4 className="font-semibold mb-4 text-white/90">Démarrer</h4>

            <p className="text-white/70 mb-6">
              Découvrez comment Gusto Manager peut transformer votre quotidien.
            </p>

            <button
              onClick={() => router.push("/contact")}
              className="w-full tablet:w-auto bg-orange hover:bg-orange/90 text-white px-6 py-3 rounded-2xl transition"
            >
              Demander une démo
            </button>
          </div>
        </div>

        {/* BOTTOM */}
        <div className="border-t border-white/10 mt-12 pt-6 flex flex-col tablet:flex-row items-center justify-between gap-4 text-sm text-white/50">
          <p className="text-center tablet:text-left">
            © {new Date().getFullYear()} Gusto Manager. Tous droits réservés.
          </p>

          <div className="flex flex-col tablet:flex-row gap-4 tablet:gap-6 items-center">
            <button
              onClick={() => router.push("/legal")}
              className="cursor-pointer hover:text-white transition"
            >
              Mentions légales
            </button>
            <button
              onClick={() => router.push("/privacy-policy")}
              className="cursor-pointer hover:text-white transition"
            >
              Politique de confidentialité
            </button>
          </div>
        </div>
      </div>
    </footer>
  );
}