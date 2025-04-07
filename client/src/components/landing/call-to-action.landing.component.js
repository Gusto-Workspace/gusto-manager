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
          <button className="bg-orange hover:bg-orange/90 text-white px-8 py-3 text-lg rounded-lg">
            Demander une démo
          </button>
          
        </div>
      </div>
    </section>
  );
}
