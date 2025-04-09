// ICONS
import { CalendarRange, GiftIcon, LayoutDashboard } from "lucide-react";

// COMPONENTS
import ModuleCardLandingComponent from "./module-card.landing.component";

export default function PluginsLandingComponent() {
  return (
    <section className="py-16 tablet:py-24 bg-darkBlue/5" id="modules">
      <div className="container mx-auto px-4 tablet:px-6">
        <div className="text-center max-w-3xl mx-auto mb-16">
          <h2 className="text-3xl tablet:text-4xl font-bold text-darkBlue mb-4">
            Modules Gusto Manager
          </h2>
          <p className="text-lg text-darkBlue mb-4">
            Choisissez uniquement les modules qui vous conviennent, et ne payez
            que pour ce que vous utilisez.
          </p>
          <p className="text-md text-darkBlue">
            Notre approche modulaire vous permet d'adapter la plateforme
            précisément à vos besoins, avec la possibilité d'ajouter des
            fonctionnalités à mesure que votre entreprise évolue.
          </p>
          <div className="w-20 h-1 bg-orange mx-auto my-6 rounded-full"></div>
        </div>

        <div className="grid grid-cols-1 tablet:grid-cols-3 gap-8 items-start">
          <ModuleCardLandingComponent
            title="Module Core – Gestion de Restaurant & Contenu"
            icon={<LayoutDashboard />}
            description="Le module de base offrant un contrôle total sur les éléments essentiels de votre restaurant."
            features={[
              "Mise à jour des informations commerciales",
              "Gestion illimitée de votre carte, des menus et des boissons",
              "Ajout, suppression ou modification des plats",
              "Publication de nouvelles ou promotions",
              "Interface intuitive multi-appareils",
              "Dashboard centralisé pour un aperçu global",
            ]}
          />
          <ModuleCardLandingComponent
            title="Module Réservations – Gestion Intelligente des Tables"
            icon={<CalendarRange />}
            description="Permettez à vos clients de réserver en ligne 24/7 via votre site, tout en simplifiant votre flux de réservations."
            features={[
              "Configuration des créneaux horaires et places disponibles",
              "Confirmation automatique ou manuelle des réservations",
              "Notifications et suivi des réservations en temps réel",
              "Ajout manuel des réservations (téléphone, en personne)",
              "Mise à jour automatique des statuts",
              "Suppression automatique des réservations terminées",
            ]}
          />
          <ModuleCardLandingComponent
            title="Module Cartes Cadeaux – Dopez vos Ventes en Ligne"
            icon={<GiftIcon />}
            description="Vendez des cartes cadeaux personnalisées directement depuis votre site web."
            features={[
              "Code unique généré automatiquement",
              "Paiements en ligne",
              "Suivi du statut de chaque carte cadeau",
              "Marquage facile des cartes comme utilisées ou expirées",
              "Possibilité de remboursement directement depuis la plateforme",
            ]}
          />
        </div>

        <div className="mt-16 text-center">
          <p className="text-lg text-darkBlue mb-8 max-w-2xl mx-auto">
            Modules additionnels à venir : PMS, Vente à emporter, Marketing
            Direct, Analyse Avancée des Données etc. Contactez-nous pour en
            savoir plus !
          </p>
          <a
            href="/contact"
            className="bg-orange hover:bg-orange/90 text-white px-8 py-3 text-lg rounded-lg cursor-pointer"
          >
            Demander une démo
          </a>
        </div>
      </div>
    </section>
  );
}
