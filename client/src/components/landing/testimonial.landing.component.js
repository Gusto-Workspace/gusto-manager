"use client";

import { Star } from "lucide-react";

export default function TestimonialLandingComponent() {
const testimonials = [
  {
    name: "Julien Caron",
    role: "Le Bistrot Urbain",
    text: "Depuis que j’utilise Gusto Manager, j’ai enfin une vision claire de mon restaurant. Tout est centralisé et je gagne un temps énorme au quotidien.",
  },
  {
    name: "Sophie Renaud",
    role: "La Table du Marché",
    text: "On a réduit les erreurs de réservation et simplifié la gestion des équipes. L’outil est simple et vraiment efficace.",
  },
  {
    name: "Karim Bensalem",
    role: "Brasserie 1920",
    text: "Le fait d’avoir le site connecté directement à la gestion interne change tout. Plus besoin de mettre à jour plusieurs outils.",
  },
  {
    name: "Claire Meunier",
    role: "Le Comptoir des Saveurs",
    text: "Les cartes cadeau et les réservations en ligne nous ont apporté plus de clients sans complexifier notre organisation.",
  },
  {
    name: "Thomas Garcia",
    role: "Maison Riviera",
    text: "L’interface est claire, l’équipe s’est adaptée rapidement, et on a gagné en confort sur toute la partie gestion.",
  },
  {
    name: "Élodie Chevalier",
    role: "L’Atelier Gourmand",
    text: "On cherchait une solution simple pour centraliser plusieurs besoins. Gusto Manager nous a permis de tout regrouper proprement.",
  },
  {
    name: "Nicolas Faure",
    role: "Café des Arts",
    text: "Le module de réservation nous fait gagner du temps tous les jours. On est mieux organisés et le suivi est beaucoup plus simple.",
  },
  {
    name: "Camille Lefèvre",
    role: "Le Jardin Secret",
    text: "Ce que j’apprécie le plus, c’est d’avoir un outil évolutif. On peut avancer étape par étape sans complexifier l’activité.",
  },
  {
    name: "Antoine Moreau",
    role: "Comptoir 21",
    text: "La mise à jour du site et la gestion interne sont enfin cohérentes. C’est plus pro pour nous et plus clair pour nos clients.",
  },
  {
    name: "Laura Da Silva",
    role: "Chez Victor",
    text: "On avait besoin d’une solution moderne mais facile à prendre en main. L’outil est fluide et rassurant à utiliser.",
  },
  {
    name: "Mehdi El Amrani",
    role: "L’Adresse Locale",
    text: "Les fonctionnalités sont utiles, sans être compliquées. On sent que la plateforme a été pensée pour la réalité d’un restaurant.",
  },
  {
    name: "Anaïs Blanchard",
    role: "Le Carré Blanc",
    text: "Entre la gestion des équipes, les réservations et les cartes cadeau, on gagne en temps et en lisibilité au quotidien.",
  },
];

  const loopedTestimonials = [...testimonials, ...testimonials];

  return (
    <section className="overflow-hidden bg-darkBlue py-16 tablet:py-20 my-6 tablet:my-12">
      <div className="mx-auto w-full ">
        <div className="mb-10 text-center">
          <p className="text-sm font-medium uppercase tracking-[0.14em] text-white/60">
            Témoignages
          </p>

          <h2 className="mt-3 text-3xl font-bold uppercase text-white tablet:text-4xl desktop:text-5xl">
            Ce qu’ils pensent de Gusto Manager
          </h2>

          <p className="mx-auto mt-4 max-w-[760px] text-base leading-relaxed text-white/75 tablet:text-lg">
            Une solution pensée pour simplifier la gestion quotidienne des
            restaurants, sans ajouter de complexité.
          </p>

          <div className="mb-3 flex gap-1 justify-center mt-6">
            {Array.from({ length: 5 }).map((_, i) => (
              <Star key={i} size={16} className="fill-orange text-orange" />
            ))}
          </div>
        </div>

        <div className="relative">
          <div className="pointer-events-none absolute left-0 top-0 z-10 h-full w-12 bg-gradient-to-r from-darkBlue to-transparent tablet:w-24" />
          <div className="pointer-events-none absolute right-0 top-0 z-10 h-full w-12 bg-gradient-to-l from-darkBlue to-transparent tablet:w-24" />

          <div className="flex w-max animate-[testimonial-marquee_120s_linear_infinite] gap-4">
            {loopedTestimonials.map((t, index) => (
              <article
                key={`${t.name}-${index}`}
                className="w-[340px] shrink-0 rounded-[24px] border border-white/10 bg-white px-5 py-5 text-darkBlue tablet:w-[450px]"
              >
                <p className="min-h-[80px] text-sm leading-relaxed text-darkBlue/85 tablet:text-base">
                  “{t.text}”
                </p>

                <div className="mt-5 border-t border-darkBlue/10 pt-4">
                  <p className="text-sm font-semibold tablet:text-base">
                    {t.name}
                  </p>
                  <p className="text-xs text-darkBlue/60 tablet:text-sm">
                    {t.role}
                  </p>
                </div>
              </article>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
