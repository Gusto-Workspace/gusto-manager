// ICONS
import {
  BadgeCheck,
  Clock,
  LayoutDashboard,
  PanelLeft,
  Settings,
  Smartphone,
} from "lucide-react";

// COMPONENTS
import FeatureItemLandingComponent from "./feature-item.landing.component";

export default function FunctionalitiesLandingComponent() {
  return (
    <section className="py-16 tablet:py-24 bg-white" id="fonctionnalités">
      <div className="container mx-auto px-4 tablet:px-6">
        <div className="text-center max-w-3xl mx-auto mb-16">
          <h2 className="text-3xl tablet:text-4xl font-bold text-darkBlue mb-6">
            Des Fonctionnalités Conçues pour les Restaurants
          </h2>
          <p className="text-lg text-darkBlue">
            Chaque restaurant a des besoins différents. C'est pourquoi Gusto
            Manager est conçu comme une solution modulaire : activez uniquement
            les fonctionnalités qui vous intéressent, sans obligation d'utiliser
            l'ensemble.
          </p>
        </div>

        <div className="grid grid-cols-1 tablet:grid-cols-2 desktop:grid-cols-3 gap-8">
          <FeatureItemLandingComponent
            icon={<Clock />}
            title="Simple & Rapide"
            description="Mise à jour facile des informations essentielles comme les horaires, coordonnées et descriptions."
          />
          <FeatureItemLandingComponent
            icon={<PanelLeft />}
            title="Gestion de Menus"
            description="Gestion illimitée de votre carte, des menus et cartes de boissons avec des catégories structurées."
          />
          <FeatureItemLandingComponent
            icon={<Settings />}
            title="Personnalisable"
            description="Créez et organisez des menus fixes ou des formules à composer selon vos besoins."
          />
          <FeatureItemLandingComponent
            icon={<Smartphone />}
            title="Compatible Multi-Appareils"
            description="Interface intuitive compatible avec PC, tablette et mobile pour une gestion où que vous soyez."
          />
          <FeatureItemLandingComponent
            icon={<LayoutDashboard />}
            title="Tableau de Bord Centralisé"
            description="Suivez l'activité de votre restaurant en un coup d'œil depuis un dashboard central."
          />
          <FeatureItemLandingComponent
            icon={<BadgeCheck />}
            title="Sans Compétences Techniques"
            description="Aucune compétence technique requise pour utiliser la plateforme."
          />
        </div>
      </div>
    </section>
  );
}
