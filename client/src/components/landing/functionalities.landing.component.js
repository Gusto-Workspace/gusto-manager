"use client";

import Image from "next/image";
import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Plus, X } from "lucide-react";

const functionalities = [
  {
    id: 1,
    title: "Site internet",
    description:
      "Un site professionnel connecté à votre restaurant et à vos réservations.",
    longDescription:
      "Créez un site vitrine moderne, synchronisé avec votre établissement. Vos informations, vos horaires et vos réservations restent cohérents partout, sans double saisie.",
    img: "/img/functionalities/web.jpg",
  },
  {
    id: 2,
    title: "Gestion de carte",
    description:
      "Modifiez vos menus, plats et boissons facilement, en temps réel.",
    longDescription:
      "Ajoutez, modifiez ou retirez vos plats, menus et boissons en quelques clics. Vos changements peuvent être publiés rapidement pour garder une carte toujours à jour.",
    img: "/img/functionalities/menu.png",
  },
  {
    id: 3,
    title: "Réservations intelligentes",
    description:
      "Gérez vos réservations, réduisez les no-shows et optimisez votre remplissage.",
    longDescription:
      "Centralisez vos réservations, gérez les créneaux, les confirmations, les rappels et l’occupation. Vous gagnez du temps tout en améliorant le taux de remplissage.",
    img: "/img/functionalities/reservation.jpg",
  },
  {
    id: 4,
    title: "Cartes cadeaux",
    description:
      "Développez vos revenus avec la vente de cartes cadeaux en ligne.",
    longDescription:
      "Proposez des cartes cadeaux directement depuis votre site. Une solution simple pour générer du chiffre d’affaires supplémentaire et attirer de nouveaux clients.",
    img: "/img/functionalities/card.png",
  },
  {
    id: 5,
    title: "Gestion d’équipe",
    description:
      "Plannings, pointeuse et suivi des employés réunis en un seul outil.",
    longDescription:
      "Regroupez les plannings, le suivi des horaires et l’organisation de l’équipe dans une seule interface pour fluidifier la gestion quotidienne.",
    img: "/img/functionalities/team.png",
  },
  {
    id: 6,
    title: "Suivi HACCP",
    description:
      "Gérez vos contrôles et assurez la conformité de votre établissement.",
    longDescription:
      "Structurez vos relevés, vos contrôles et vos suivis HACCP pour garder une vision claire de votre conformité et rassurer votre équipe au quotidien.",
    img: "/img/functionalities/haccp.png",
  },
  {
    id: 7,
    title: "Fichier client",
    description:
      "Centralisez vos clients et fidélisez-les grâce à un suivi personnalisé.",
    longDescription:
      "Retrouvez l’historique, les préférences et les informations utiles de vos clients afin d’améliorer l’expérience et renforcer la fidélisation.",
    img: "/img/functionalities/customers.png",
  },
  {
    id: 8,
    title: "Notifications",
    description:
      "Soyez alerté en temps réel des réservations, demandes et actions importantes.",
    longDescription:
      "Recevez les bonnes alertes au bon moment pour rester réactif sur les nouvelles réservations, les changements importants ou les actions à traiter.",
    img: "/img/functionalities/notifications.png",
  },
  {
    id: 9,
    title: "Pilotage centralisé",
    description:
      "Visualisez toute votre activité et prenez les bonnes décisions rapidement.",
    longDescription:
      "Gardez une vue d’ensemble sur votre activité, vos modules et vos opérations depuis une seule plateforme pensée pour vous faire gagner en clarté.",
    img: "/img/functionalities/pilot.png",
  },
];

export default function FunctionalitiesLandingComponent() {
  const [activeCard, setActiveCard] = useState(null);

  useEffect(() => {
    document.body.style.overflow = activeCard ? "hidden" : "";
    return () => {
      document.body.style.overflow = "";
    };
  }, [activeCard]);

  return (
    <section className="py-6 tablet:py-12" id="functionalities">
        <div className="mx-auto max-w-[95%] tablet:max-w-[85%]">
        <div className="mx-auto mb-16 max-w-3xl text-center">
          <h2 className="text-balance mb-6 text-3xl font-bold uppercase text-darkBlue tablet:text-4xl">
            Une plateforme qui s’adapte à votre restaurant
          </h2>
          <p className="text-balance text-lg text-darkBlue">
            Activez uniquement les fonctionnalités dont vous avez besoin :
            réservations, cartes, équipe, clients… Gusto Manager évolue avec
            votre activité.
          </p>
        </div>

        <div className="relative">
          <div className="grid grid-cols-1 items-stretch gap-6 tablet:grid-cols-2 desktop:grid-cols-3">
            {functionalities.map((item) => {
              const isActive = activeCard?.id === item.id;
              const isDimmed = activeCard && !isActive;

              return (
                <motion.div
                  key={item.id}
                  layout
                  className={`relative h-full ${
                    isDimmed ? "opacity-20" : "opacity-100"
                  } transition-opacity duration-200`}
                >
                  {!isActive && (
                    <motion.div
                      layoutId={`card-shell-${item.id}`}
                      className="relative h-full min-h-[180px]"
                      transition={{
                        layout: {
                          type: "spring",
                          stiffness: 260,
                          damping: 30,
                        },
                      }}
                    >
                      <div className="pointer-events-none absolute inset-0 z-0 translate-x-2 translate-y-2 rounded-xl bg-darkBlue" />

                      <div className="relative z-10 flex h-full min-h-[180px] flex-col items-center justify-center rounded-xl border-2 border-darkBlue bg-white p-6 text-center shadow-sm transition-transform duration-200 hover:-translate-x-1 hover:-translate-y-1">
                        <button
                          type="button"
                          onClick={() => setActiveCard(item)}
                          className="absolute top-3 right-3 z-20 flex h-9 w-9 items-center justify-center rounded-full border border-orange/15 bg-white text-orange transition-colors duration-200 hover:bg-orange hover:text-white"
                          aria-label={`Ouvrir ${item.title}`}
                        >
                          <Plus size={18} />
                        </button>

                        <h4 className="mb-2 text-lg font-bold text-darkBlue">
                          {item.title}
                        </h4>

                        <p className="text-darkBlue text-balance">{item.description}</p>
                      </div>
                    </motion.div>
                  )}
                </motion.div>
              );
            })}
          </div>

          <AnimatePresence>
            {activeCard && (
              <>
                <motion.div
                  className="fixed inset-0 z-[70] bg-darkBlue/15"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.2 }}
                  onClick={() => setActiveCard(null)}
                />

                <div className="pointer-events-none fixed inset-0 z-[80] flex items-center justify-center p-4 tablet:p-6">
                  <motion.div
                    layoutId={`card-shell-${activeCard.id}`}
                    className="pointer-events-auto relative w-full max-w-[1100px]"
                    transition={{
                      layout: {
                        type: "spring",
                        stiffness: 260,
                        damping: 30,
                      },
                    }}
                  >
                    <div className="pointer-events-none absolute inset-0 z-0 translate-x-3 translate-y-3 rounded-[28px] bg-darkBlue" />

                    <div className="relative z-10 overflow-hidden rounded-[28px] border-2 border-darkBlue bg-white shadow-[0_30px_80px_rgba(0,0,0,0.18)]">
                      <button
                        type="button"
                        onClick={() => setActiveCard(null)}
                        className="absolute top-4 right-4 z-20 flex h-11 w-11 items-center justify-center rounded-full border border-orange/15 bg-white text-orange transition-colors duration-200 hover:bg-orange hover:text-white"
                        aria-label="Fermer"
                      >
                        <X size={20} />
                      </button>

                      <div className="grid min-h-[70vh] grid-cols-1 gap-8 p-6 tablet:p-8 desktop:grid-cols-2 desktop:p-10">
                        <div className="flex flex-col justify-center">
                          <span className="mb-4 inline-flex w-fit rounded-full bg-darkBlue/5 px-3 py-1 text-sm font-medium text-darkBlue">
                            Fonctionnalité
                          </span>

                          <h3 className="mb-4 text-3xl font-bold text-darkBlue tablet:text-4xl">
                            {activeCard.title}
                          </h3>

                          <p className="mb-4 text-lg text-darkBlue">
                            {activeCard.description}
                          </p>

                          <p className="leading-relaxed text-darkBlue/80">
                            {activeCard.longDescription}
                          </p>
                        </div>

                        <div className="flex items-center justify-center">
                          <div className="relative h-[260px] w-full overflow-hidden rounded-2xl border border-darkBlue/10 bg-lightGrey/40 tablet:h-[340px] desktop:h-full desktop:min-h-[420px]">
                            <Image
                              src={activeCard.img}
                              alt={activeCard.title}
                              fill
                              className="object-cover"
                              sizes="(max-width: 1024px) 100vw, 50vw"
                            />
                          </div>
                        </div>
                      </div>
                    </div>
                  </motion.div>
                </div>
              </>
            )}
          </AnimatePresence>
        </div>
      </div>
    </section>
  );
}