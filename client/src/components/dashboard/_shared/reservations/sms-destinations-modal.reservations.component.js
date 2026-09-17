import { Info, X } from "lucide-react";

function countryName(country) {
  try {
    return new Intl.DisplayNames(["fr"], { type: "region" }).of(country);
  } catch (_) {
    return country;
  }
}

export default function SmsDestinationsModalReservationsComponent({
  destinations = [],
  onClose,
}) {
  const activeDestinations = destinations.filter(
    (destination) => destination.enabled,
  );

  return (
    <div
      className="fixed inset-0 z-[220] flex items-end justify-center tablet:items-center"
      role="dialog"
      aria-modal="true"
      aria-labelledby="sms-destinations-modal-title"
    >
      <button
        type="button"
        aria-label="Fermer"
        className="absolute inset-0 bg-darkBlue/35"
        onClick={onClose}
      />
      <div className="relative max-h-[88vh] w-full overflow-y-auto rounded-t-3xl border border-darkBlue/10 bg-white p-5 shadow-[0_25px_80px_rgba(19,30,54,0.25)] tablet:max-w-2xl tablet:rounded-3xl">
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-start gap-3">
            <span className="inline-flex size-10 shrink-0 items-center justify-center rounded-2xl bg-darkBlue/5">
              <Info className="size-5 text-darkBlue" />
            </span>
            <div>
              <h2
                id="sms-destinations-modal-title"
                className="font-semibold text-darkBlue"
              >
                Destinations SMS disponibles
              </h2>
              <p className="mt-1 text-sm text-darkBlue/60">
                Seules les destinations actuellement activées par Gusto sont
                affichées.
              </p>
            </div>
          </div>
          <button
            type="button"
            aria-label="Fermer"
            onClick={onClose}
            className="inline-flex shrink-0 items-center justify-center rounded-full border border-darkBlue/10 bg-white p-2 transition hover:bg-darkBlue/5"
          >
            <X className="size-4 text-darkBlue/70" />
          </button>
        </div>

        <div className="mt-5 grid gap-3">
          {activeDestinations.length ? (
            activeDestinations.map((destination) => (
              <article
                key={destination.country}
                className="rounded-2xl border border-darkBlue/10 bg-slate-50 p-4"
              >
                <h3 className="font-semibold text-darkBlue">
                  {countryName(destination.country)}
                </h3>
                <dl className="mt-3 grid gap-2 text-sm text-darkBlue/70">
                  <div>
                    <dt className="inline font-medium text-darkBlue">
                      Crédits :{" "}
                    </dt>
                    <dd className="inline">
                      {destination.billingCredits} crédit
                      {destination.billingCredits > 1 ? "s" : ""} / SMS
                    </dd>
                  </div>
                  <div>
                    <dt className="inline font-medium text-darkBlue">
                      Coût client :{" "}
                    </dt>
                    <dd className="inline">
                      inclus dans les 100 crédits puis selon la tarification
                      Gusto
                    </dd>
                  </div>
                </dl>
              </article>
            ))
          ) : (
            <p className="rounded-xl bg-slate-50 p-4 text-sm text-darkBlue/60">
              Aucune destination SMS n’est actuellement disponible.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
