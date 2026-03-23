// ICONS
import { Coffee, ThumbsUp, Users } from "lucide-react";
import Image from "next/image";

export default function AdvantagesLandingComponent() {
  return (
    <section
      className="py-16 my-12 bg-darkBlue max-w-[95%] tablet:max-w-[85%] mx-auto rounded-2xl"
      id="advantages"
    >
      <div className="container mx-auto px-4 tablet:px-6 flex flex-col gap-16 text-white">
        <div className="text-center max-w-3xl mx-auto">
          <h2 className="uppercase text-3xl tablet:text-4xl font-bold  mb-6">
            Pourquoi choisir Gusto Manager ?
          </h2>
          <p className="text-lg text-balance">
            Une plateforme complète, pensée pour simplifier votre gestion et
            vous aider à développer votre restaurant au quotidien.
          </p>
        </div>

        <div className="grid grid-cols-1 tablet:grid-cols-3 gap-6">
          <div className="bg-lightGrey border-lightGrey border bg-opacity-15 rounded-2xl px-4 py-8 flex flex-col gap-4 items-center text-center">
            <h3 className="mb-2 flex items-center justify-center text-xl font-bold h-[56px]">Pensé pour les restaurateurs</h3>
            <div className="bg-white rounded-2xl">
              <Image
                src="/img/advantage-3.png"
                alt="Hero"
                width={0}
                height={0}
                sizes="100vw"
                className="w-full h-auto"
              />
            </div>

            <p className="text-pretty mt-2">
              Conçu avec des professionnels du secteur pour répondre aux vrais
              enjeux du quotidien : gestion, organisation et rentabilité.
            </p>
          </div>

          <div className="bg-lightGrey border-lightGrey border bg-opacity-15 rounded-2xl px-4 py-8 flex flex-col gap-4 items-center text-center">
            <h3 className="mb-2 flex items-center justify-center text-xl font-bold h-[56px]">Simple à utiliser</h3>
            <div className="bg-white rounded-2xl">
              <Image
                src="/img/advantage-1.png"
                alt="Hero"
                width={0}
                height={0}
                sizes="100vw"
                className="w-full h-auto"
              />
            </div>
            <p className="text-pretty mt-2">
              Une interface claire et intuitive, accessible à toute votre équipe
              sans formation technique.
            </p>
          </div>

          <div className="bg-lightGrey border-lightGrey border bg-opacity-15 rounded-2xl px-4 py-8 flex flex-col gap-4 items-center text-center">
            <h3 className="mb-2 flex items-center justify-center text-xl font-bold h-[56px]">Évolutif</h3>
            <div className="bg-white rounded-2xl">
              <Image
                src="/img/advantage-2.png"
                alt="Hero"
                width={0}
                height={0}
                sizes="100vw"
                className="w-full h-auto"
              />
            </div>
            <p className="text-pretty mt-2">
              Activez uniquement les modules dont vous avez besoin et faites
              évoluer la plateforme en même temps que votre activité.
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}
