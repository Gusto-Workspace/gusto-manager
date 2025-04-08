// ICONS
import { BarChart3, CheckCircle2, Heart, XCircle, Zap } from "lucide-react";

export default function HelpingLandingComponent() {
  return (
    <section className="pt-16 tablet:pt-24 bg-white" id="transformation">
      <div className="container mx-auto px-4 tablet:px-6">
        <div className="text-center max-w-3xl mx-auto mb-12">
          <h2 className="text-3xl tablet:text-4xl font-bold text-darkBlue mb-4">
            Comment Gusto Manager transforme-t-il votre quotidien ?
          </h2>
          <p className="text-lg text-darkBlue">
            Notre plateforme élimine les tâches administratives fastidieuses
            pour vous permettre de vous concentrer sur ce qui compte vraiment :
            votre cuisine et vos clients.
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
                <XCircle className="text-red mr-3 mt-1 shrink-0" size={20} />
                <span>
                  Gestion manuelle et fastidieuse des réservations avec risques
                  d'erreurs
                </span>
              </li>
              <li className="flex items-start">
                <XCircle className="text-red mr-3 mt-1 shrink-0" size={20} />
                <span>
                  Mise à jour complexe des menus nécessitant l'intervention d'un
                  webmaster
                </span>
              </li>
              <li className="flex items-start">
                <XCircle className="text-red mr-3 mt-1 shrink-0" size={20} />
                <span>
                  Communication inefficace avec vos clients et temps de réponse
                  lent
                </span>
              </li>
              <li className="flex items-start">
                <XCircle className="text-red mr-3 mt-1 shrink-0" size={20} />
                <span>
                  Site web obsolète et peu adapté aux besoins spécifiques des
                  restaurateurs
                </span>
              </li>
              <li className="flex items-start">
                <XCircle className="text-red mr-3 mt-1 shrink-0" size={20} />
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
                  Menus mis à jour en quelques clics, sans aucune connaissance
                  technique
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
                  Vente de cartes cadeaux en ligne pour augmenter votre chiffre
                  d'affaires
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
              <p className="text-darkBlue">
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
              <p className="text-darkBlue">
                Nos utilisateurs constatent une hausse moyenne de 15% de leur
                chiffre d'affaires
              </p>
            </div>

            <div className="bg-white rounded-xl p-6 shadow-sm flex flex-col items-center text-center hover:shadow-md transition-all duration-300">
              <div className="bg-orange/10 p-4 rounded-full mb-4">
                <Heart className="text-orange" />
              </div>
              <h4 className="font-bold text-lg text-darkBlue mb-2">
                Fidélisation client
              </h4>
              <p className="text-darkBlue">
                Améliorez l'expérience client et augmentez le taux de retour de
                25%
              </p>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
