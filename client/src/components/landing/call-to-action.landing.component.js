export default function CallToActionLandingComponent() {
  return (
    <section className="bg-darkBlue text-white py-16 tablet:py-24">
      <div className="container mx-auto px-4 tablet:px-6 text-center">
        <h2 className="text-3xl tablet:text-4xl font-bold mb-6">
          Prêt à booster la gestion de votre restaurant ?
        </h2>
        <p className="text-xl mb-8 max-w-2xl mx-auto">
          Commencez dès aujourd'hui et découvrez comment Gusto Manager peut
          simplifier votre quotidien.
        </p>
        <div className="flex flex-col tablet:flex-row gap-4 justify-center">
          <a
            href={`mailto:contact@gusto-manager.com?subject=Demande%20de%20démo%20Gusto%20Manager&body=Bonjour%2C%0A%0AMerci%20de%20renseigner%20ci-dessous%20vos%20informations%20:%0A%0ANom%20:%20_____________________%0APrénom%20:%20_____________________%0ARestaurant%20:%20_____________________%0ATéléphone%20:%20_____________________%0A%0AMerci%20et%20à%20très%20bientôt%20!`}
            className="bg-orange hover:bg-orange/90 text-white px-8 py-3 text-lg rounded-lg cursor-pointer"
          >
            Demander une démo
          </a>
        </div>
      </div>
    </section>
  );
}
