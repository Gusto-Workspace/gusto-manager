export default function StrongPointsLandingComponent() {
  return (
    <section className="py-6 tablet:py-12" id="strong-points">
      <div className="container mx-auto px-4 tablet:px-6">
        <div className="p-6 bg-darkBlue text-white rounded-2xl">
          <div className="flex flex-col tablet:flex-row items-center justify-between gap-6 text-center tablet:text-left">
            {/* POINT 1 */}
            <div className="flex flex-col items-center tablet:items-start">
              <p className="font-semibold">Sans commission</p>
            </div>

            {/* LOSANGE */}
            <div className="w-3 h-3 bg-orange rotate-45 rounded-full" />

            {/* POINT 2 */}
            <div className="flex flex-col items-center tablet:items-start">
              <p className="font-semibold">Support 7j/7</p>
            </div>

            {/* LOSANGE */}
            <div className="w-3 h-3 bg-orange rotate-45 rounded-full" />

            {/* POINT 3 */}
            <div className="flex flex-col items-center tablet:items-start">
              <p className="font-semibold">Simple à utiliser</p>
            </div>

            {/* LOSANGE */}
            <div className="w-3 h-3 bg-orange rotate-45 rounded-full" />

            {/* POINT 4 */}
            <div className="flex flex-col items-center tablet:items-start">
              <p className="font-semibold">Tout-en-un</p>
            </div>

            {/* LOSANGE */}
            <div className="w-3 h-3 bg-orange rotate-45 rounded-full" />

            {/* POINT 5 */}
            <div className="flex flex-col items-center tablet:items-start">
              <p className="font-semibold">Évolutif</p>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
