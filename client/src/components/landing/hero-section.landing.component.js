// ICONS
import {
  ChevronRight,
  CalendarDays,
  Gift,
  Users,
  ShieldCheck,
  Check,
  Globe,
  Clock3,
} from "lucide-react";
import Image from "next/image";

export default function HeroSectionLandingComponent() {
  function handleScrollToSection(id) {
    requestAnimationFrame(() => {
      const section = document.querySelector(id);

      if (section) {
        const yOffset = -85;
        const y =
          section.getBoundingClientRect().top + window.pageYOffset + yOffset;

        window.scrollTo({
          top: y,
          behavior: "smooth",
        });
      }
    });
  }

  const modules = [
    { icon: Globe, label: "Site internet" },
    { icon: CalendarDays, label: "Réservations" },
    { icon: Gift, label: "Cartes cadeau" },
    { icon: Users, label: "Personnel" },
    { icon: Clock3, label: "Pointeuse" },
    { icon: ShieldCheck, label: "HACCP" },
  ];

  const highlights = [
    "Centralisez vos outils sur une seule plateforme",
    "Activez uniquement les modules dont vous avez besoin",
    "Gardez un site et une gestion toujours synchronisés",
    "Disponible sur tous supports (ordinateur, tablette et téléphone)",
  ];

  return (
    <section className="min-h-[100vh] flex items-center relative overflow-hidden pt-28 pb-10 tablet:pt-26 tablet:pb-28">
      {/* BACKGROUND TOP */}
      <div className="absolute top-0 left-0 right-0 h-[320px] bg-darkBlue tablet:h-[400px]" />

      <div className="relative z-10 mx-auto w-full ">
        {/* TOP TRUST BAR */}

        {/* MAIN HERO */}
        <div className="relative max-w-[95%] tablet:max-w-[85%] mx-auto">
          <div className="absolute inset-0 translate-x-2 translate-y-2 rounded-[32px] bg-darkBlue" />

          <div className="relative overflow-hidden rounded-[32px] border-2 border-darkBlue bg-white">
            <div className="grid items-center desktop:grid-cols-[1.05fr_0.95fr]">
              {/* LEFT */}
              <div className="px-6 py-10 tablet:pl-10 tablet:py-12 desktop:px-14 desktop:py-14">
                <div className="max-w-[680px]">
                  <h1 className="text-4xl font-bold uppercase leading-[0.95] text-darkBlue tablet:text-5xl desktop:text-6xl">
                    Gusto Manager
                  </h1>

                  <p className="mt-5 text-2xl font-semibold leading-tight text-darkBlue tablet:text-3xl desktop:text-4xl">
                    La plateforme tout-en-un pour piloter votre restaurant.
                  </p>

                  <p className="mt-5 max-w-[620px] text-base leading-relaxed text-darkBlue/80 tablet:text-lg desktop:text-xl">
                    Réservations, cartes cadeau, gestion du personnel, HACCP,
                    site internet… centralisez votre activité dans un outil
                    clair, professionnel et évolutif.
                  </p>

                  {/* HIGHLIGHTS */}
                  <div className="mt-7 space-y-3">
                    {highlights.map((item) => (
                      <div
                        key={item}
                        className="flex items-start gap-3 text-darkBlue"
                      >
                        <span className="mt-[2px] flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-darkBlue text-white">
                          <Check size={14} />
                        </span>
                        <p className="leading-relaxed text-darkBlue/85">
                          {item}
                        </p>
                      </div>
                    ))}
                  </div>

                  {/* CTA */}
                  <div className="mt-8 flex flex-col gap-4 mobile:flex-row">
                    <a
                      href="/contact"
                      className="inline-flex items-center justify-center rounded-2xl bg-darkBlue px-7 py-3.5 text-base font-medium text-white transition-all duration-300 hover:bg-darkBlue/90 tablet:text-lg"
                    >
                      Demander une démo
                    </a>

                    <button
                      onClick={() => handleScrollToSection("#functionalities")}
                      className="inline-flex items-center justify-center rounded-2xl border-2 border-darkBlue px-7 py-3.5 text-base font-medium text-darkBlue transition-all duration-300 hover:bg-darkBlue/5 tablet:text-lg"
                    >
                      Découvrir les fonctionnalités
                    </button>
                  </div>
                </div>
              </div>

              {/* RIGHT */}
              <div className="pr-4 pb-6 tablet:pr-8 tablet:pb-8 desktop:pr-10 desktop:py-0">
                <div className="relative mx-auto w-full">
                  {/* floating card top */}
                  <div className="absolute left-3 top-3 z-20 hidden rounded-2xl border-2 border-darkBlue bg-white px-4 py-3 shadow-sm tablet:block">
                    <p className="text-xs font-medium uppercase tracking-[0.08em] text-darkBlue/55">
                      Gestion centralisée
                    </p>
                    <p className="mt-1 text-sm font-semibold text-darkBlue">
                      Tout votre restaurant au même endroit
                    </p>
                  </div>

                  {/* floating card bottom */}
                  <div className="absolute bottom-3 right-3 z-20 hidden rounded-2xl border-2 border-darkBlue bg-white px-4 py-3 shadow-sm tablet:block">
                    <p className="text-xs font-medium uppercase tracking-[0.08em] text-darkBlue/55">
                      Outil évolutif
                    </p>
                    <p className="mt-1 text-sm font-semibold text-darkBlue">
                      Activez les modules selon vos besoins
                    </p>
                  </div>

                  {/* image frame */}
                  <div className="rounded-[28px] border-2 border-darkBlue bg-lightGrey/40 p-3 tablet:p-4">
                    <div className="overflow-hidden rounded-[20px] bg-white">
                      <Image
                        src="/img/bg-hero.webp"
                        alt="Interface Gusto Manager"
                        width={1400}
                        height={1000}
                        priority
                        sizes="(max-width: 768px) 100vw, (max-width: 1200px) 50vw, 640px"
                        className="h-auto w-full object-contain"
                        draggable={false}
                      />
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* MODULES */}
        <div className="mt-6 flex flex-wrap justify-center gap-2 tablet:gap-3">
          {modules.map((item) => {
            const Icon = item.icon;

            return (
              <div
                key={item.label}
                className="rounded-2xl border-2 border-darkBlue bg-white px-4 py-2 text-darkBlue"
              >
                <div className="flex items-center gap-3">
                  <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-darkBlue text-white">
                    <Icon size={16} />
                  </div>

                  <p className="text-sm font-medium tablet:text-base">
                    {item.label}
                  </p>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <button
        onClick={() => handleScrollToSection("#helping")}
        className="absolute bottom-4 left-1/2 -translate-x-1/2 z-10 mt-8 hidden self-center tablet:flex mx-auto"
        aria-label="Faire défiler vers la section suivante"
      >
        <div className="animate-bounce">
          <span className="flex h-[45px] aspect-square items-center justify-center rounded-full bg-orange text-white shadow-md">
            <ChevronRight className="rotate-90" />
          </span>
        </div>
      </button>
    </section>
  );
}
