// ICONS
import { Clock, Rocket, LineChart } from "lucide-react";

export default function PlateformLandingComponent() {
  return (
    <section className="py-16 tablet:py-24 bg-white" id="plateforme">
      <div className="container mx-auto px-4 tablet:px-6">
        <div className="text-center max-w-3xl mx-auto mb-16">
          <h2 className="text-3xl tablet:text-4xl font-bold text-darkBlue mb-6 text-pretty">
            Une Plateforme qui Simplifie la Vie des Restaurateurs
          </h2>
          <p className="text-lg text-darkBlue mb-8">
            Dans le secteur de la restauration, chaque minute compte. Gusto
            Manager est conçu pour vous faire gagner du temps et améliorer votre
            efficacité au quotidien.
          </p>
          <p className="text-lg text-darkBlue">
            Notre solution tout-en-un vous permet de centraliser l'ensemble de
            vos opérations : gestion de votre site web, menus, réservations,
            cartes cadeaux, et bien plus encore.
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
            <p className="text-darkBlue">
              Automatisez les tâches répétitives et concentrez-vous sur
              l'essentiel : offrir une expérience exceptionnelle à vos clients.
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
            <p className="text-darkBlue">
              Présentez votre établissement sous son meilleur jour avec un site
              web professionnel et des outils marketing intégrés.
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
            <p className="text-darkBlue">
              Vendez des cartes cadeaux en ligne, optimisez vos réservations et
              fidélisez votre clientèle pour augmenter votre chiffre d'affaires.
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}
