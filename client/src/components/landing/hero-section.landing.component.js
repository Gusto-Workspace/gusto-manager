// ICONS
import { ChevronRight } from "lucide-react";
import Image from "next/image";

export default function HeroSectionLandingComponent() {
  function handleScrollToSection(id) {
    requestAnimationFrame(() => {
      const section = document.querySelector(id);
      if (section) {
        section.scrollIntoView({ behavior: "smooth" });
      }
    });
  }

  return (
    <section className="relative overflow-hidden min-h-[100dvh] flex flex-col justify-center px-4 pt-28 pb-0 tablet:px-6 tablet:pt-32 tablet:pb-20">
      <div className="bg-darkBlue absolute top-0 left-0 right-0 h-[38%] tablet:h-[42%] desktop:h-[45%]" />

      <div className="relative z-10 w-full max-w-[1400px] mx-auto">
        <div className="bg-white rounded-[28px] border-2 border-darkBlue text-darkBlue w-full shadow-[0_20px_60px_rgba(19,30,54,0.10)] overflow-hidden">
          <div className="flex flex-col desktop:flex-row items-center">
            {/* TEXTE */}
            <div className="text-center tablet:text-left w-full desktop:w-1/2 px-6 py-10 pb-0 tablet:px-10 tablet:py-12 desktop:px-14 desktop:py-14">
              <h1 className="text-4xl tablet:text-5xl desktop:text-6xl font-bold mb-5 uppercase leading-none">
                Gusto Manager
              </h1>

              <p className="text-2xl tablet:text-3xl desktop:text-4xl mb-5 text-balance font-medium">
                Le logiciel tout-en-un conçu pour les restaurants
              </p>

              <p className="text-base tablet:text-lg desktop:text-xl mb-8 text-darkBlue/80 max-w-[640px] leading-relaxed">
                Simplifiez vos opérations quotidiennes grâce à une plateforme
                intuitive qui centralise la gestion de votre restaurant.
              </p>

              <div className="flex flex-col sm:flex-row gap-4">
                <a
                  href="/contact"
                  className="inline-flex items-center justify-center rounded-2xl bg-darkBlue hover:bg-darkBlue/90 text-white px-7 py-3.5 text-base tablet:text-lg transition-all duration-300"
                >
                  Demander une démo
                </a>
              </div>
            </div>

            {/* IMAGE */}
            <div className="w-full desktop:w-1/2 px-4 pb-6 tablet:px-8 tablet:pb-8 desktop:px-8 desktop:py-8 flex justify-center">
              <Image
                src="/img/hero.png"
                alt="Interface Gusto Manager"
                width={1200}
                height={900}
                sizes="(max-width: 768px) 100vw, (max-width: 1200px) 50vw, 600px"
                className="w-full max-w-[620px] h-auto object-contain"
                priority
              />
            </div>
          </div>
        </div>

        {/* BADGES */}
        <div className="mt-6 flex flex-wrap justify-center gap-3 tablet:gap-4 text-xs tablet:text-sm">
          <div className="bg-darkBlue text-white px-4 py-2 rounded-full">
            Site internet
          </div>
          <div className="bg-darkBlue text-white px-4 py-2 rounded-full">
            Réservations
          </div>
          <div className="bg-darkBlue text-white px-4 py-2 rounded-full">
            Cartes cadeau
          </div>
          <div className="bg-darkBlue text-white px-4 py-2 rounded-full">
            Gestion du personnel
          </div>
          <div className="bg-darkBlue text-white px-4 py-2 rounded-full">
            Pointeuse
          </div>
          <div className="bg-darkBlue text-white px-4 py-2 rounded-full">
            HACCP
          </div>
        </div>
      </div>

      <button
        onClick={() => handleScrollToSection("#helping")}
        className="hidden tablet:block relative z-10 mt-8 self-center tablet:mt-10"
        aria-label="Faire défiler vers la section suivante"
      >
        <div className="animate-bounce">
          <span className="text-white flex justify-center items-center h-[45px] aspect-square rounded-full bg-orange shadow-md">
            <ChevronRight className="rotate-90" />
          </span>
        </div>
      </button>
    </section>
  );
}