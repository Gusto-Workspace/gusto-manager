// ICONS
import {
  BadgeCheck,
  Clock,
  LayoutDashboard,
  PanelLeft,
  Settings,
  Smartphone,
} from "lucide-react";

export default function FunctionalitiesLandingComponent() {
  return (
    <section className="py-6 tablet:py-12" id="functionalities">
      <div className="container mx-auto px-4 tablet:px-6">
        <div className="text-center max-w-3xl mx-auto mb-16">
          <h2 className="text-balance uppercase text-3xl tablet:text-4xl font-bold text-darkBlue mb-6">
            Une plateforme qui s’adapte à votre restaurant
          </h2>
          <p className="text-lg text-darkBlue text-balance">
            Activez uniquement les fonctionnalités dont vous avez besoin :
            réservations, cartes, équipe, clients… Gusto Manager évolue avec
            votre activité.
          </p>
        </div>

      <div className="grid grid-cols-1 tablet:grid-cols-2 desktop:grid-cols-3 gap-6 items-stretch">
      {/* 1 - SITE INTERNET */}
      <div className="group relative h-full">
        <div className="absolute inset-0 bg-darkBlue rounded-xl translate-x-2 translate-y-2 transition-all duration-300 group-hover:translate-x-3 group-hover:translate-y-3 pointer-events-none" />
        <div className="relative z-10 bg-white border-2 border-darkBlue rounded-xl p-6 shadow-sm flex flex-col justify-center items-center text-center transition-all duration-300 group-hover:-translate-x-1 group-hover:-translate-y-1 h-full min-h-[180px]">
          <h4 className="font-bold text-lg text-darkBlue mb-2">
            Site internet
          </h4>
          <p className="text-darkBlue">
            Un site professionnel connecté à votre restaurant et vos
            réservations.
          </p>
        </div>
      </div>

      {/* 2 - GESTION DE CARTE */}
      <div className="group relative h-full">
        <div className="absolute inset-0 bg-darkBlue rounded-xl translate-x-2 translate-y-2 transition-all duration-300 group-hover:translate-x-3 group-hover:translate-y-3 pointer-events-none" />
        <div className="relative z-10 bg-white border-2 border-darkBlue rounded-xl p-6 shadow-sm flex flex-col justify-center items-center text-center transition-all duration-300 group-hover:-translate-x-1 group-hover:-translate-y-1 h-full min-h-[180px]">
          <h4 className="font-bold text-lg text-darkBlue mb-2">
            Gestion de carte
          </h4>
          <p className="text-darkBlue">
            Modifiez vos menus, plats et boissons facilement, en temps réel.
          </p>
        </div>
      </div>

      {/* 3 - RÉSERVATIONS */}
      <div className="group relative h-full">
        <div className="absolute inset-0 bg-darkBlue rounded-xl translate-x-2 translate-y-2 transition-all duration-300 group-hover:translate-x-3 group-hover:translate-y-3 pointer-events-none" />
        <div className="relative z-10 bg-white border-2 border-darkBlue rounded-xl p-6 shadow-sm flex flex-col justify-center items-center text-center transition-all duration-300 group-hover:-translate-x-1 group-hover:-translate-y-1 h-full min-h-[180px]">
          <h4 className="font-bold text-lg text-darkBlue mb-2">
            Réservations intelligentes
          </h4>
          <p className="text-darkBlue">
            Gérez vos réservations, réduisez les no-shows et optimisez votre
            remplissage.
          </p>
        </div>
      </div>

      {/* 4 - CARTES CADEAUX */}
      <div className="group relative h-full">
        <div className="absolute inset-0 bg-darkBlue rounded-xl translate-x-2 translate-y-2 transition-all duration-300 group-hover:translate-x-3 group-hover:translate-y-3 pointer-events-none" />
        <div className="relative z-10 bg-white border-2 border-darkBlue rounded-xl p-6 shadow-sm flex flex-col justify-center items-center text-center transition-all duration-300 group-hover:-translate-x-1 group-hover:-translate-y-1 h-full min-h-[180px]">
          <h4 className="font-bold text-lg text-darkBlue mb-2">
            Cartes cadeaux
          </h4>
          <p className="text-darkBlue">
            Développez vos revenus avec la vente de cartes cadeaux en ligne.
          </p>
        </div>
      </div>

      {/* 5 - GESTION D’ÉQUIPE */}
      <div className="group relative h-full">
        <div className="absolute inset-0 bg-darkBlue rounded-xl translate-x-2 translate-y-2 transition-all duration-300 group-hover:translate-x-3 group-hover:translate-y-3 pointer-events-none" />
        <div className="relative z-10 bg-white border-2 border-darkBlue rounded-xl p-6 shadow-sm flex flex-col justify-center items-center text-center transition-all duration-300 group-hover:-translate-x-1 group-hover:-translate-y-1 h-full min-h-[180px]">
          <h4 className="font-bold text-lg text-darkBlue mb-2">
            Gestion d’équipe
          </h4>
          <p className="text-darkBlue">
            Plannings, pointeuse et suivi des employés réunis en un seul outil.
          </p>
        </div>
      </div>

      {/* 6 - HACCP */}
      <div className="group relative h-full">
        <div className="absolute inset-0 bg-darkBlue rounded-xl translate-x-2 translate-y-2 transition-all duration-300 group-hover:translate-x-3 group-hover:translate-y-3 pointer-events-none" />
        <div className="relative z-10 bg-white border-2 border-darkBlue rounded-xl p-6 shadow-sm flex flex-col justify-center items-center text-center transition-all duration-300 group-hover:-translate-x-1 group-hover:-translate-y-1 h-full min-h-[180px]">
          <h4 className="font-bold text-lg text-darkBlue mb-2">
            Suivi HACCP
          </h4>
          <p className="text-darkBlue">
            Gérez vos contrôles et assurez la conformité de votre
            établissement.
          </p>
        </div>
      </div>

      {/* 7 - FICHIER CLIENT */}
      <div className="group relative h-full">
        <div className="absolute inset-0 bg-darkBlue rounded-xl translate-x-2 translate-y-2 transition-all duration-300 group-hover:translate-x-3 group-hover:translate-y-3 pointer-events-none" />
        <div className="relative z-10 bg-white border-2 border-darkBlue rounded-xl p-6 shadow-sm flex flex-col justify-center items-center text-center transition-all duration-300 group-hover:-translate-x-1 group-hover:-translate-y-1 h-full min-h-[180px]">
          <h4 className="font-bold text-lg text-darkBlue mb-2">
            Fichier client
          </h4>
          <p className="text-darkBlue">
            Centralisez vos clients et fidélisez-les grâce à un suivi
            personnalisé.
          </p>
        </div>
      </div>

      {/* 8 - NOTIFICATIONS */}
      <div className="group relative h-full">
        <div className="absolute inset-0 bg-darkBlue rounded-xl translate-x-2 translate-y-2 transition-all duration-300 group-hover:translate-x-3 group-hover:translate-y-3 pointer-events-none" />
        <div className="relative z-10 bg-white border-2 border-darkBlue rounded-xl p-6 shadow-sm flex flex-col justify-center items-center text-center transition-all duration-300 group-hover:-translate-x-1 group-hover:-translate-y-1 h-full min-h-[180px]">
          <h4 className="font-bold text-lg text-darkBlue mb-2">
            Notifications
          </h4>
          <p className="text-darkBlue">
            Soyez alerté en temps réel des réservations, demandes et actions
            importantes.
          </p>
        </div>
      </div>

      {/* 9 - PILOTAGE */}
      <div className="group relative h-full">
        <div className="absolute inset-0 bg-darkBlue rounded-xl translate-x-2 translate-y-2 transition-all duration-300 group-hover:translate-x-3 group-hover:translate-y-3 pointer-events-none" />
        <div className="relative z-10 bg-white border-2 border-darkBlue rounded-xl p-6 shadow-sm flex flex-col justify-center items-center text-center transition-all duration-300 group-hover:-translate-x-1 group-hover:-translate-y-1 h-full min-h-[180px]">
          <h4 className="font-bold text-lg text-darkBlue mb-2">
            Pilotage centralisé
          </h4>
          <p className="text-darkBlue">
            Visualisez toute votre activité et prenez les bonnes décisions
            rapidement.
          </p>
        </div>
      </div>
    </div>
      </div>
    </section>
  );
}
