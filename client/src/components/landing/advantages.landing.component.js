// ICONS
import { Coffee, ThumbsUp, Users } from "lucide-react";

export default function AdvantagesLandingComponent() {
  return (
    <section className="py-16 tablet:py-24 bg-darkBlue/5" id="avantages">
      <div className="container mx-auto px-4 tablet:px-6">
        <div className="text-center max-w-3xl mx-auto mb-16">
          <h2 className="text-3xl tablet:text-4xl font-bold text-darkBlue mb-6">
            Les avantages de Gusto Manager
          </h2>
          <p className="text-lg text-darkBlue">
            Notre plateforme a été conçue spécifiquement pour répondre aux défis
            uniques des restaurateurs d'aujourd'hui.
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
            <p className="text-darkBlue text-pretty">
              Développé en étroite collaboration avec des professionnels de la
              restauration pour répondre précisément à vos besoins quotidiens.
            </p>
          </div>

          <div className="flex flex-col items-center text-center">
            <div className="bg-orange/10 p-6 rounded-full text-orange text-4xl mb-6 animate-float">
              <Users />
            </div>
            <h3 className="text-xl font-bold text-darkBlue mb-3">
              Simple à utiliser
            </h3>
            <p className="text-darkBlue text-pretty">
              Interface intuitive et conviviale qui ne nécessite aucune
              compétence technique. Formation complète et support disponible.
            </p>
          </div>

          <div className="flex flex-col items-center text-center">
            <div className="bg-orange/10 p-6 rounded-full text-orange text-4xl mb-6 animate-float">
              <ThumbsUp />
            </div>
            <h3 className="text-xl font-bold text-darkBlue mb-3">Évolutif</h3>
            <p className="text-darkBlue text-pretty">
              Commencez avec les modules essentiels et ajoutez de nouvelles
              fonctionnalités à mesure que votre entreprise se développe.
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}
