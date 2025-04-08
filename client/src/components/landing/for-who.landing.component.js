export default function ForWhoLandingComponent() {
  return (
    <section className="py-16 tablet:py-24 bg-white" id="pourqui">
      <div className="container mx-auto px-4 tablet:px-6">
        <div className="text-center max-w-3xl mx-auto mb-16">
          <h2 className="text-3xl tablet:text-4xl font-bold text-darkBlue mb-6">
            Une Solution pour Tous les Types de Restaurants
          </h2>
          <p className="text-lg text-darkBlue">
            Que vous soyez un restaurant indépendant, une chaîne de restaurants
            ou que vous lanciez votre première affaire, Gusto Manager s'adapte à
            votre organisation. La plateforme est conçue pour évoluer avec vos
            besoins.
          </p>
        </div>

        <div className="grid grid-cols-1 tablet:grid-cols-3 gap-8">
          <div className="bg-white p-8 rounded-xl shadow-lg text-center hover-scale">
            <div className="text-4xl font-bold mb-4 text-darkBlue">
              Indépendants
            </div>
            <p className="text-darkBlue text-pretty">
              Idéal pour les restaurants indépendants cherchant à simplifier
              leur gestion quotidienne et à améliorer leur présence en ligne.
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
            <div className="text-4xl font-bold mb-4 text-darkBlue">Chaînes</div>
            <p className="text-darkBlue text-pretty">
              Parfait pour gérer plusieurs établissements avec cohérence tout en
              permettant des personnalisations locales.
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
            <p className="text-darkBlue text-pretty">
              Solution intuitive pour ceux qui lancent leur premier
              établissement et ont besoin d'une solution simple sans expertise
              technique.
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
  );
}
