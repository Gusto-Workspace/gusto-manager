// ICONS
import { ChevronRight } from "lucide-react";

// COMPONENTS
import FloatingElementsLandingComponent from "./floating-elements.landing.component";

export default function HeroSectionLandingComponent() {
  async function handleScrollToSection(id) {
    requestAnimationFrame(() => {
      const section = document.querySelector(id);
      if (section) {
        section.scrollIntoView({ behavior: "smooth" });
      }
    });
  }

  return (
    <section className="relative h-[100dvh] flex items-center">
      <div>
        <div className="absolute inset-0 bg-darkBlue"></div>

        {/* Les éléments flottants avec delay global */}
        <div className="delay-[0.8s] opacity-30 midTablet:opacity-100">
          <FloatingElementsLandingComponent />
        </div>

        {/* Images avec animation scale */}
        <img
          src="/img/hero-1.webp"
          draggable={false}
          alt="img-1"
          className="hidden tablet:block max-w-[175px] absolute left-[5%] top-[20%] opacity-5 scale-in-rotate"
        />

        {/* Image 2 classique sans rotation */}
        <div className="hidden tablet:block absolute right-[7%] opacity-5 scale-in-delay bottom-[10%]">
          <img
            src="/img/hero-2.webp"
            draggable={false}
            alt="img-2"
            className="max-w-[195px] opacity-5 scale-in-delay"
          />

          <img
            src="/img/hero-3.webp"
            draggable={false}
            alt="img-2"
            className="max-w-[135px] absolute -right-[50px] -top-[35px]"
          />
        </div>
      </div>

      <div className="container flex items-center justify-center text-center mx-auto px-4 tablet:px-6 relative z-10 text-white">
        <div className="max-w-3xl animate-stagger">
          <h1 className="text-4xl tablet:text-5xl desktop:text-6xl font-bold mb-6 uppercase">
            Gusto Manager
          </h1>
          <p className="text-2xl tablet:text-3xl mb-6 text-pretty">
            La solution modulaire de gestion digitale pour les restaurants
          </p>
          <p className="text-lg mb-8">
            Simplifiez vos opérations quotidiennes grâce à une plateforme
            intuitive qui centralise la gestion de votre restaurant.
          </p>
          <div className="flex flex-col items-center justify-center mobile:flex-row gap-4">
            <a
              href="/contact"
              className="rounded-lg bg-orange hover:bg-orange/90 text-white px-8 py-3 text-lg hover-scale"
            >
              Demander une démo
            </a>
          </div>
        </div>
      </div>

      <button
        onClick={() => handleScrollToSection("#plateforme")}
        className="absolute bottom-8 left-1/2 transform -translate-x-1/2"
      >
        <div className="animate-bounce">
          <p className="text-white flex flex-col items-center">
            <span className="mb-2">Découvrir</span>
            <ChevronRight className="rotate-90" />
          </p>
        </div>
      </button>
    </section>
  );
}
