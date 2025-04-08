import { useContext } from "react";
import Head from "next/head";

// I18N
import { i18n } from "next-i18next";
import { serverSideTranslations } from "next-i18next/serverSideTranslations";
import { useTranslation } from "next-i18next";

// CONTEXT
import { GlobalContext } from "@/contexts/global.context";

// COMPONENTS
import NavbarLanding from "@/components/landing/nav.landing.component";

import {
  LayoutDashboard,
  CalendarRange,
  GiftIcon,
  Clock,
  PanelLeft,
  Smartphone,
  Settings,
  BadgeCheck,
  ChevronRight,
  Users,
  Rocket,
  LineChart,
  Coffee,
  ThumbsUp,
  CheckCircle2,
  XCircle,
  Zap,
  BarChart3,
  HandCoins,
  Heart,
} from "lucide-react";
import FeatureItemLandingComponent from "@/components/landing/feature-item.landing.component";
import ModuleCardLandingComponent from "@/components/landing/module-card.landing.component";
import CallToActionLandingComponent from "@/components/landing/call-to-action.landing.component";
import FooterLandingComponent from "@/components/landing/footer.landing.component";
import FloatingElementsLandingComponent from "@/components/landing/floating-elements.landing.component";

export default function DashboardPage(props) {
  let title;
  let description;

  switch (i18n.language) {
    case "en":
      title = "Gusto Manager";
      description = "";
      break;
    default:
      title = "Gusto Manager";
      description = "";
  }

  async function handleScrollToSection(id) {
    requestAnimationFrame(() => {
      const section = document.querySelector(id);
      if (section) {
        section.scrollIntoView({ behavior: "smooth" });
      }
    });
  }

  return (
    <>
      <Head>
        <title>{title}</title>

        {/* <>
          {description && <meta name="description" content={description} />}
          {title && <meta property="og:title" content={title} />}
          {description && (
            <meta property="og:description" content={description} />
          )}
          <meta
            property="og:url"
            content="https://lespetitsbilingues-newham.com/"
          />
          <meta property="og:type" content="website" />
          <meta property="og:image" content="/img/open-graph.jpg" />
          <meta property="og:image:width" content="1200" />
          <meta property="og:image:height" content="630" />
        </> */}
      </Head>

      <div className="min-h-screen">
        <NavbarLanding />

        {/* Hero section */}
        <section className="relative h-screen flex items-center">
          <div
            // className="absolute inset-0 bg-cover bg-center z-0"
            // style={{
            //   backgroundImage:
            //     'url("https://images.unsplash.com/photo-1414235077428-338989a2e8c0?ixlib=rb-4.0.3&ixid=M3wxMjA3fDB8MHxwaG90by1wYWdlfHx8fGVufDB8fHx8fA%3D%3D&auto=format&fit=crop&w=2070&q=80")',
            //   backgroundAttachment: "fixed",
            // }}
          >
            <div className="absolute inset-0 bg-darkBlue"></div>
            <FloatingElementsLandingComponent/>
            <img
              src="/img/hero-1.webp"
              draggable={false}
              alt="logo"
              className="max-w-[175px] absolute left-[5%] top-[20%] -rotate-6"
            />

<img
              src="/img/hero-2.webp"
              draggable={false}
              alt="logo"
              className="max-w-[275px] absolute right-[5%] bottom-[10%]"
            />
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
                <button className="rounded-lg bg-orange hover:bg-orange/90 text-white px-8 py-3 text-lg hover-scale">
                  Découvrir les modules
                </button>
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

        {/* Plateforme section */}
        <section className="py-16 tablet:py-24 bg-white" id="plateforme">
          <div className="container mx-auto px-4 tablet:px-6">
            <div className="text-center max-w-3xl mx-auto mb-16">
              <h2 className="text-3xl tablet:text-4xl font-bold text-darkBlue mb-6 text-pretty">
                Une Plateforme qui Simplifie la Vie des Restaurateurs
              </h2>
              <p className="text-lg text-gray-600 mb-8">
                Dans le secteur de la restauration, chaque minute compte. Gusto
                Manager est conçu pour vous faire gagner du temps et améliorer
                votre efficacité au quotidien.
              </p>
              <p className="text-lg text-gray-600">
                Notre solution tout-en-un vous permet de centraliser l'ensemble
                de vos opérations : gestion de votre site web, menus,
                réservations, cartes cadeaux, et bien plus encore.
              </p>
            </div>

            <div className="grid grid-cols-1 tablet:grid-cols-2 desktop:grid-cols-3 gap-10">
              <div className="p-6 bg-white rounded-xl shadow-lg hover-scale">
                <div className="flex items-center mb-4">
                  <div className="bg-orange/10 p-3 rounded-full mr-4">
                    <Clock className="text-orange" />
                  </div>
                  <h3 className="text-xl font-bold text-darkBlue">
                    Gagnez du temps
                  </h3>
                </div>
                <p className="text-gray-600">
                  Automatisez les tâches répétitives et concentrez-vous sur
                  l'essentiel : offrir une expérience exceptionnelle à vos
                  clients.
                </p>
              </div>

              <div className="p-6 bg-white rounded-xl shadow-lg hover-scale">
                <div className="flex items-center mb-4">
                  <div className="bg-orange/10 p-3 rounded-full mr-4">
                    <Rocket className="text-orange" />
                  </div>
                  <h3 className="text-xl font-bold text-darkBlue">
                    Améliorez votre visibilité
                  </h3>
                </div>
                <p className="text-gray-600">
                  Présentez votre établissement sous son meilleur jour avec un
                  site web professionnel et des outils marketing intégrés.
                </p>
              </div>

              <div className="p-6 bg-white rounded-xl shadow-lg hover-scale">
                <div className="flex items-center mb-4">
                  <div className="bg-orange/10 p-3 rounded-full mr-4">
                    <LineChart className="text-orange" />
                  </div>
                  <h3 className="text-xl font-bold text-darkBlue">
                    Augmentez vos revenus
                  </h3>
                </div>
                <p className="text-gray-600">
                  Vendez des cartes cadeaux en ligne, optimisez vos réservations
                  et fidélisez votre clientèle pour augmenter votre chiffre
                  d'affaires.
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* Avantages section */}
        <section className="py-16 tablet:py-24 bg-darkBlue/5" id="avantages">
          <div className="container mx-auto px-4 tablet:px-6">
            <div className="text-center max-w-3xl mx-auto mb-16">
              <h2 className="text-3xl tablet:text-4xl font-bold text-darkBlue mb-6">
                Les avantages de Gusto Manager
              </h2>
              <p className="text-lg text-gray-600">
                Notre plateforme a été conçue spécifiquement pour répondre aux
                défis uniques des restaurateurs d'aujourd'hui.
              </p>
            </div>

            <div className="grid grid-cols-1 tablet:grid-cols-3 gap-12 mb-16">
              <div className="flex flex-col items-center text-center">
                <div className="bg-orange/10 p-6 rounded-full text-orange text-4xl mb-6 animate-float">
                  <Coffee />
                </div>
                <h3 className="text-xl font-bold text-darkBlue mb-3">
                  Adapté aux besoins des restaurateurs
                </h3>
                <p className="text-gray-600">
                  Développé en étroite collaboration avec des professionnels de
                  la restauration pour répondre précisément à vos besoins
                  quotidiens.
                </p>
              </div>

              <div className="flex flex-col items-center text-center">
                <div className="bg-orange/10 p-6 rounded-full text-orange text-4xl mb-6 animate-float">
                  <Users />
                </div>
                <h3 className="text-xl font-bold text-darkBlue mb-3">
                  Simple à utiliser
                </h3>
                <p className="text-gray-600">
                  Interface intuitive et conviviale qui ne nécessite aucune
                  compétence technique. Formation complète et support
                  disponible.
                </p>
              </div>

              <div className="flex flex-col items-center text-center">
                <div className="bg-orange/10 p-6 rounded-full text-orange text-4xl mb-6 animate-float">
                  <ThumbsUp />
                </div>
                <h3 className="text-xl font-bold text-darkBlue mb-3">
                  Évolutif
                </h3>
                <p className="text-gray-600">
                  Commencez avec les modules essentiels et ajoutez de nouvelles
                  fonctionnalités à mesure que votre entreprise se développe.
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* Comment Gusto Manager transforme-t-il votre quotidien ? (Redesigned) */}
        <section className="pt-16 tablet:pt-24 bg-white" id="transformation">
          <div className="container mx-auto px-4 tablet:px-6">
            <div className="text-center max-w-3xl mx-auto mb-12">
              <h2 className="text-3xl tablet:text-4xl font-bold text-darkBlue mb-4">
                Comment Gusto Manager transforme-t-il votre quotidien ?
              </h2>
              <p className="text-lg text-gray-600">
                Notre plateforme élimine les tâches administratives fastidieuses
                pour vous permettre de vous concentrer sur ce qui compte
                vraiment : votre cuisine et vos clients.
              </p>
              <div className="w-20 h-1 bg-orange mx-auto my-6 rounded-full"></div>
            </div>

            <div className="grid grid-cols-1 tablet:grid-cols-2 gap-10 mb-16">
              <div className="bg-white rounded-xl shadow-md border border-darkBlue/5 hover:border-orange/50 p-6 transition-all duration-300">
                <div className="flex items-center mb-6">
                  <div className="bg-red/30 p-3 rounded-full mr-4">
                    <XCircle className="text-red" />
                  </div>
                  <h3 className="text-xl font-bold text-darkBlue">
                    Avant Gusto Manager
                  </h3>
                </div>

                <ul className="space-y-4">
                  <li className="flex items-start">
                    <XCircle
                      className="text-red mr-3 mt-1 shrink-0"
                      size={20}
                    />
                    <span>
                      Gestion manuelle et fastidieuse des réservations avec
                      risques d'erreurs
                    </span>
                  </li>
                  <li className="flex items-start">
                    <XCircle
                      className="text-red mr-3 mt-1 shrink-0"
                      size={20}
                    />
                    <span>
                      Mise à jour complexe des menus nécessitant l'intervention
                      d'un webmaster
                    </span>
                  </li>
                  <li className="flex items-start">
                    <XCircle
                      className="text-red mr-3 mt-1 shrink-0"
                      size={20}
                    />
                    <span>
                      Communication inefficace avec vos clients et temps de
                      réponse lent
                    </span>
                  </li>
                  <li className="flex items-start">
                    <XCircle
                      className="text-red mr-3 mt-1 shrink-0"
                      size={20}
                    />
                    <span>
                      Site web obsolète et peu adapté aux besoins spécifiques
                      des restaurateurs
                    </span>
                  </li>
                  <li className="flex items-start">
                    <XCircle
                      className="text-red mr-3 mt-1 shrink-0"
                      size={20}
                    />
                    <span>
                      Absence de solution pour vendre des cartes cadeaux et
                      fidéliser la clientèle
                    </span>
                  </li>
                </ul>
              </div>

              <div className="bg-white rounded-xl shadow-md border border-darkBlue/5 hover:border-orange/50 p-6 transition-all duration-300">
                <div className="flex items-center mb-6">
                  <div className="bg-lightGreen/20 p-3 rounded-full mr-4">
                    <CheckCircle2 className="text-lightGreen" />
                  </div>
                  <h3 className="text-xl font-bold text-darkBlue">
                    Avec Gusto Manager
                  </h3>
                </div>

                <ul className="space-y-4">
                  <li className="flex items-start">
                    <CheckCircle2
                      className="text-lightGreen mr-3 mt-1 shrink-0"
                      size={20}
                    />
                    <span>
                      Réservations en ligne automatisées avec confirmations
                      instantanées
                    </span>
                  </li>
                  <li className="flex items-start">
                    <CheckCircle2
                      className="text-lightGreen mr-3 mt-1 shrink-0"
                      size={20}
                    />
                    <span>
                      Menus mis à jour en quelques clics, sans aucune
                      connaissance technique
                    </span>
                  </li>
                  <li className="flex items-start">
                    <CheckCircle2
                      className="text-lightGreen mr-3 mt-1 shrink-0"
                      size={20}
                    />
                    <span>
                      Communication directe avec vos clients et notifications en
                      temps réel
                    </span>
                  </li>
                  <li className="flex items-start">
                    <CheckCircle2
                      className="text-lightGreen mr-3 mt-1 shrink-0"
                      size={20}
                    />
                    <span>
                      Site web professionnel et à jour, optimisé pour la
                      restauration
                    </span>
                  </li>
                  <li className="flex items-start">
                    <CheckCircle2
                      className="text-lightGreen mr-3 mt-1 shrink-0"
                      size={20}
                    />
                    <span>
                      Vente de cartes cadeaux en ligne pour augmenter votre
                      chiffre d'affaires
                    </span>
                  </li>
                </ul>
              </div>
            </div>

            <div className="bg-darkBlue/5 rounded-2xl p-8 shadow-inner">
              <div className="grid grid-cols-1 tablet:grid-cols-3 gap-8">
                <div className="bg-white rounded-xl p-6 shadow-sm flex flex-col items-center text-center hover:shadow-md transition-all duration-300">
                  <div className="bg-orange/10 p-4 rounded-full mb-4">
                    <Zap className="text-orange" />
                  </div>
                  <h4 className="font-bold text-lg text-darkBlue mb-2">
                    Gain de temps considérable
                  </h4>
                  <p className="text-gray-600">
                    Automatisez jusqu'à 70% de vos tâches administratives
                    quotidiennes
                  </p>
                </div>

                <div className="bg-white rounded-xl p-6 shadow-sm flex flex-col items-center text-center hover:shadow-md transition-all duration-300">
                  <div className="bg-orange/10 p-4 rounded-full mb-4">
                    <BarChart3 className="text-orange" />
                  </div>
                  <h4 className="font-bold text-lg text-darkBlue mb-2">
                    Augmentation des revenus
                  </h4>
                  <p className="text-gray-600">
                    Nos utilisateurs constatent une hausse moyenne de 15% de
                    leur chiffre d'affaires
                  </p>
                </div>

                <div className="bg-white rounded-xl p-6 shadow-sm flex flex-col items-center text-center hover:shadow-md transition-all duration-300">
                  <div className="bg-orange/10 p-4 rounded-full mb-4">
                    <Heart className="text-orange" />
                  </div>
                  <h4 className="font-bold text-lg text-darkBlue mb-2">
                    Fidélisation client
                  </h4>
                  <p className="text-gray-600">
                    Améliorez l'expérience client et augmentez le taux de retour
                    de 25%
                  </p>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Fonctionnalités section */}
        <section className="py-16 tablet:py-24 bg-white" id="fonctionnalites">
          <div className="container mx-auto px-4 tablet:px-6">
            <div className="text-center max-w-3xl mx-auto mb-16">
              <h2 className="text-3xl tablet:text-4xl font-bold text-darkBlue mb-6">
                Des Fonctionnalités Conçues pour les Restaurants
              </h2>
              <p className="text-lg text-gray-600">
                Chaque restaurant a des besoins différents. C'est pourquoi Gusto
                Manager est conçu comme une solution modulaire : activez
                uniquement les fonctionnalités qui vous intéressent, sans
                obligation d'utiliser l'ensemble.
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
                description="Gestion illimitée des menus et cartes de boissons avec des catégories structurées."
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

        {/* Modules section (Redesigned) */}
        <section className="py-16 tablet:py-24 bg-darkBlue/5" id="modules">
          <div className="container mx-auto px-4 tablet:px-6">
            <div className="text-center max-w-3xl mx-auto mb-16">
              <h2 className="text-3xl tablet:text-4xl font-bold text-darkBlue mb-4">
                Modules Gusto Manager
              </h2>
              <p className="text-lg text-gray-600 mb-4">
                Choisissez uniquement les modules qui vous conviennent, et ne
                payez que pour ce que vous utilisez.
              </p>
              <p className="text-md text-gray-600">
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
                  "Gestion illimitée des menus et boissons",
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
              <p className="text-lg text-gray-600 mb-8 max-w-2xl mx-auto">
                Modules additionnels à venir : PMS, Vente à emporter, Marketing
                Direct, Analyse Avancée des Données etc. Contactez-nous pour en
                savoir plus !
              </p>
              <button className="bg-orange hover:bg-orange/90 text-white px-8 py-3 text-lg hover-scale rounded-lg">
                Demander une démonstration personnalisée
              </button>
            </div>
          </div>
        </section>

        {/* For who section */}
        <section className="py-16 tablet:py-24 bg-white" id="pourqui">
          <div className="container mx-auto px-4 tablet:px-6">
            <div className="text-center max-w-3xl mx-auto mb-16">
              <h2 className="text-3xl tablet:text-4xl font-bold text-darkBlue mb-6">
                Une Solution pour Tous les Types de Restaurants
              </h2>
              <p className="text-lg text-gray-600">
                Que vous soyez un restaurant indépendant, une chaîne de
                restaurants ou que vous lanciez votre première affaire, Gusto
                Manager s'adapte à votre organisation. La plateforme est conçue
                pour évoluer avec vos besoins.
              </p>
            </div>

            <div className="grid grid-cols-1 tablet:grid-cols-3 gap-8">
              <div className="bg-white p-8 rounded-xl shadow-lg text-center hover-scale">
                <div className="text-4xl font-bold mb-4 text-darkBlue">
                  Indépendants
                </div>
                <p className="text-gray-600">
                  Idéal pour les restaurants indépendants cherchant à simplifier
                  leur gestion quotidienne et à améliorer leur présence en
                  ligne.
                </p>
                <ul className="mt-4 text-left space-y-2">
                  <li className="flex items-center">
                    <span className="text-orange mr-2">•</span>
                    <span>Gestion simplifiée sans personnel dédié</span>
                  </li>
                  <li className="flex items-center">
                    <span className="text-orange mr-2">•</span>
                    <span>Fonctionnalités essentielles à petit prix</span>
                  </li>
                  <li className="flex items-center">
                    <span className="text-orange mr-2">•</span>
                    <span>Support technique personnalisé</span>
                  </li>
                </ul>
              </div>
              <div className="bg-white p-8 rounded-xl shadow-lg text-center hover-scale">
                <div className="text-4xl font-bold mb-4 text-darkBlue">
                  Chaînes
                </div>
                <p className="text-gray-600">
                  Parfait pour gérer plusieurs établissements avec cohérence
                  tout en permettant des personnalisations locales.
                </p>
                <ul className="mt-4 text-left space-y-2">
                  <li className="flex items-center">
                    <span className="text-orange mr-2">•</span>
                    <span>Gestion centralisée de multiples restaurants</span>
                  </li>
                  <li className="flex items-center">
                    <span className="text-orange mr-2">•</span>
                    <span>Rapports et statistiques consolidés</span>
                  </li>
                  <li className="flex items-center">
                    <span className="text-orange mr-2">•</span>
                    <span>Configuration spécifique par établissement</span>
                  </li>
                </ul>
              </div>
              <div className="bg-white p-8 rounded-xl shadow-lg text-center hover-scale">
                <div className="text-4xl font-bold mb-4 text-darkBlue">
                  Débutants
                </div>
                <p className="text-gray-600">
                  Solution intuitive pour ceux qui lancent leur premier
                  établissement et ont besoin d'une solution simple sans
                  expertise technique.
                </p>
                <ul className="mt-4 text-left space-y-2">
                  <li className="flex items-center">
                    <span className="text-orange mr-2">•</span>
                    <span>Prise en main rapide et assistée</span>
                  </li>
                  <li className="flex items-center">
                    <span className="text-orange mr-2">•</span>
                    <span>Guides et tutoriels détaillés</span>
                  </li>
                  <li className="flex items-center">
                    <span className="text-orange mr-2">•</span>
                    <span>Évolutivité pour accompagner votre croissance</span>
                  </li>
                </ul>
              </div>
            </div>
          </div>
        </section>

        <CallToActionLandingComponent />

        <FooterLandingComponent />
      </div>
    </>
  );
}

export async function getStaticProps({ locale }) {
  return {
    props: {
      ...(await serverSideTranslations(locale, [
        "common",
        "index",
        "transactions",
      ])),
    },
  };
}
