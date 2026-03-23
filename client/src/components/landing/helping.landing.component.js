// ICONS
import { BarChart3, CheckCircle2, Heart, XCircle, Zap } from "lucide-react";
import Image from "next/image";

export default function HelpingLandingComponent() {
  return (
    <section className="py-8 tablet:pb-12 pt-24" id="helping">
      <div className="container mx-auto px-4 tablet:px-6">
        <div className="text-center max-w-3xl mx-auto mb-12">
          <h2 className="uppercase text-3xl tablet:text-4xl font-bold text-darkBlue mb-4">
            Moins de gestion. Plus de clients.
          </h2>
          <p className="text-lg text-darkBlue">
            Gusto Manager automatise votre restaurant pour vous faire gagner du
            temps et augmenter votre chiffre d’affaires.
          </p>
        </div>

        <div className="grid grid-cols-1 tablet:grid-cols-3 gap-24 tablet:gap-8 pt-12">
          {/* CARD 1 */}
          <div className="group relative text-balance">
            <div className="absolute inset-0 bg-orange rounded-xl translate-x-2 translate-y-2 transition-all duration-300 group-hover:translate-x-3 group-hover:translate-y-3 pointer-events-none" />

            <div className="relative z-10 bg-white border-2 border-darkBlue rounded-xl pt-[65px] p-6 shadow-sm flex flex-col justify-end items-center text-center transition-all duration-300 group-hover:-translate-x-1 group-hover:-translate-y-1">
              <Image
                src="/img/clock.png"
                width={95}
                height={95}
                alt="Icône horloge - gain de temps"
                className="w-auto h-auto absolute -top-12 left-1/2 -translate-x-1/2 rounded-full"
              />

              <h4 className="font-bold text-lg text-darkBlue mb-2">
                Gagnez du temps
              </h4>
              <p className="text-darkBlue">
                Automatisez jusqu’à 70% de vos tâches
              </p>
            </div>
          </div>

          {/* CARD 2 */}
          <div className="group relative">
            <div className="absolute inset-0 bg-orange rounded-xl translate-x-2 translate-y-2 transition-all duration-300 group-hover:translate-x-3 group-hover:translate-y-3 pointer-events-none" />

            <div className="relative z-10 bg-white border-2 border-darkBlue rounded-xl pt-[65px] p-6 shadow-sm flex flex-col justify-end items-center text-center transition-all duration-300 group-hover:-translate-x-1 group-hover:-translate-y-1">
              <Image
                src="/img/chart.png"
                width={95}
                height={95}
                alt="Icône graphique - augmentation des revenus"
                className="w-auto h-auto absolute -top-14 left-1/2 -translate-x-1/2"
              />

              <h4 className="font-bold text-lg text-darkBlue mb-2">
                Boostez vos revenus
              </h4>
              <p className="text-darkBlue">
                +15% en moyenne grâce à une meilleure gestion
              </p>
            </div>
          </div>

          {/* CARD 3 */}
          <div className="group relative text-balance">
            <div className="absolute inset-0 bg-orange rounded-xl translate-x-2 translate-y-2 transition-all duration-300 group-hover:translate-x-3 group-hover:translate-y-3 pointer-events-none" />

            <div className="relative z-10 bg-white border-2 border-darkBlue rounded-xl pt-[65px] p-6 shadow-sm flex flex-col justify-end items-center text-center transition-all duration-300 group-hover:-translate-x-1 group-hover:-translate-y-1">
              <Image
                src="/img/like.png"
                width={95}
                height={95}
                alt="Icône like - fidélisation client"
                className="w-auto h-auto absolute -top-9 left-1/2 -translate-x-1/2"
              />
              <h4 className="font-bold text-lg text-darkBlue mb-2">
                Fidélisez vos clients
              </h4>
              <p className="text-darkBlue">
                Une meilleure expérience, plus de retours
              </p>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
