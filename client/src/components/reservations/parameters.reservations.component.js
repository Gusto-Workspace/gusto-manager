import { useContext, useState } from "react";
import { useRouter } from "next/router";

// CONTEXT
import { GlobalContext } from "@/contexts/global.context";

// I18N
import { useTranslation } from "next-i18next";

// SVG
import { ReservationSvg } from "../_shared/_svgs/reservation.svg";

// REACT HOOK FORM
import { useForm, useFieldArray } from "react-hook-form";

// COMPONENTS
import HoursRestaurantComponent from "../restaurant/hours.restaurant.component";

export default function ParametersReservationComponent(props) {
  const { t } = useTranslation(["reservations", "restaurant"]);
  const { restaurantContext } = useContext(GlobalContext);
  const router = useRouter();

  const {
    register,
    handleSubmit,
    watch,
    control,
    formState: { errors },
  } = useForm({
    defaultValues: {
      sameHoursAsRestaurant: true,
      reservationDuration: false,
      autoAccept: true,
      interval: "30",
      manageDisponibilities: false,
      tables: [
        { name: "Table 1", seats: 4 },
        { name: "Table 2", seats: 2 },
      ],
    },
  });

  const { fields, append, remove } = useFieldArray({
    control,
    name: "tables",
  });

  const [reservationHours, setReservationHours] = useState([]);

  function onSubmit(data) {
    const formData = {
      sameHoursAsRestaurant: data.sameHoursAsRestaurant,
      autoAccept: data.autoAccept,
      interval: data.interval,
      reservationDuration: data.reservationDuration,
      reservationHours: data.sameHoursAsRestaurant
        ? restaurantContext.restaurantData?.opening_hours
        : reservationHours,
      manageDisponibilities: data.manageDisponibilities,
      tables: data.manageDisponibilities ? data.tables : null,
      reservationDurationMinutes: data.reservationDuration
        ? data.reservationDurationMinutes
        : null,
    };

    console.log("Données de réservation :", formData);
  }

  function handleBack() {
    router.push("/reservations");
  }

  function onReservationHoursChange(data) {
    setReservationHours(data.hours);
  }

  const sameHoursAsRestaurant = watch("sameHoursAsRestaurant");
  const manageDisponibilities = watch("manageDisponibilities");
  const reservationDuration = watch("reservationDuration");

  return (
    <section className="flex flex-col gap-6">
      <hr className="opacity-20" />

      <div className="flex gap-4 flex-wrap justify-between">
        <div className="flex gap-2 items-center min-h-[40px]">
          <ReservationSvg
            width={30}
            height={30}
            className="min-h-[30px] min-w-[30px]"
            fillColor="#131E3690"
          />

          <h1 className="pl-2 text-xl tablet:text-2xl flex items-center flex-wrap">
            {t("titles.main")} / {t("buttons.parameters")}
          </h1>
        </div>
      </div>

      <form
        onSubmit={handleSubmit(onSubmit)}
        className="flex flex-col gap-12 mt-4"
      >
        <div className="flex flex-col gap-4">
          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              id="sameHoursAsRestaurant"
              {...register("sameHoursAsRestaurant")}
            />
            <label htmlFor="sameHoursAsRestaurant">
              {t("labels.sameHoursAsRestaurant")}
            </label>
          </div>

          {!sameHoursAsRestaurant && (
            <HoursRestaurantComponent
              restaurantId={restaurantContext.restaurantData?._id}
              dataLoading={restaurantContext.dataLoading}
              closeEditing={restaurantContext.closeEditing}
              reservations={true}
              onChange={onReservationHoursChange}
            />
          )}
        </div>

        <div className="flex items-center gap-2">
          <input type="checkbox" id="autoAccept" {...register("autoAccept")} />
          <label htmlFor="autoAccept">{t("labels.autoAccept")}</label>
        </div>

        <div className="flex flex-col">
          <label htmlFor="interval" className="mb-2">
            {t("labels.interval")}
          </label>
          <select
            id="interval"
            {...register("interval", { required: true })}
            className="border p-2 rounded-lg w-[200px]"
          >
            <option value="15">15 {t("labels.minutes")}</option>
            <option value="30">30 {t("labels.minutes")}</option>
            <option value="45">45 {t("labels.minutes")}</option>
            <option value="60">1 {t("labels.hour")}</option>
          </select>
          {errors.interval && (
            <span className="text-red">
              {t("reservations.errors.interval")}
            </span>
          )}
        </div>

        <div className="flex flex-col gap-4">
          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              id="reservationDuration"
              {...register("reservationDuration")}
            />
            <label htmlFor="reservationDuration">
              {t("labels.reservationDuration")} :
            </label>

            <div className="flex items-center gap-1">
              <input
                type="number"
                id="reservationDurationMinutes"
                {...register("reservationDurationMinutes", {
                  required: reservationDuration,
                  min: 1,
                })}
                className="border p-1 rounded-lg w-24"
                placeholder="-"
                disabled={!reservationDuration}
              />
              <span>{t("labels.minutes")}</span>
            </div>
          </div>

          <p className="text-sm opacity-70">
            Si cette option est cochée, alors la réservation passera
            automatiquement en "Terminée" au bout du temps que vous avez choisi.
            Exemple, si la réservation est à 20h, que vous avez choisi une durée
            de 120mn alors à 22h00 la réservation passera en "Terminée" et la
            table sera automatiquement disponible. Si l'option n'est pas cochée,
            alors vous devrez passer manuellement la réservation en "Terminée"
            dans la liste des réservations une fois celle ci terminée pour
            rendre la table disponible.
          </p>
        </div>

        <div className="flex flex-col gap-2">
          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              id="manageDisponibilities"
              {...register("manageDisponibilities")}
            />
            <label htmlFor="manageDisponibilities">
              {t("labels.manageDisponibilities")}
            </label>
          </div>

          <p className="text-sm opacity-70">
            Cette option permet de gérer vos réservations en fonction des
            disponibilités des tables et des places. Exemple, si une réservation
            pour 4 personnes est demandée, cette option permet de vérifier
            qu'une table est disponible pour le créneau souhaité. Si ce n'est
            pas le cas, le créneau est marqué comme indisponible sur la page de
            réservation de votre site. Si cette option n'est pas cochée, tous
            les créneaux seront marqués comme disponibles.
          </p>

          {manageDisponibilities && (
            <div className="flex flex-col gap-4">
              <p className="text-sm opacity-70">
                Si la case "accepter automatiquement les réservations" est
                cochée, une table sera automatiquement attribuée lors d'une
                réservation. Si la case n'est pas cochée, alors vous aurez la
                possibilité d'attribuer manuellement une table lors de la
                confirmation manuelle de la réservation.
              </p>

              <div className="grid grid-cols-2 gap-6">
                {fields.map((field, index) => (
                  <div key={field.id} className="flex gap-4 items-center">
                    <input
                      type="text"
                      placeholder={t("labels.tableName")}
                      {...register(`tables.${index}.name`, { required: true })}
                      className="border p-2 rounded-lg"
                    />
                    <input
                      type="number"
                      placeholder={t("labels.seats")}
                      {...register(`tables.${index}.seats`, {
                        required: true,
                        min: 1,
                      })}
                      className="border p-2 rounded-lg w-[100px]"
                    />
                    <button
                      type="button"
                      onClick={() => remove(index)}
                      className="bg-red text-white px-3 py-1 rounded-lg"
                    >
                      {t("buttons.delete")}
                    </button>
                  </div>
                ))}
              </div>

              {errors.tables && (
                <span className="text-red">
                  {t("reservations.errors.tables")}
                </span>
              )}
              <button
                type="button"
                onClick={() => append({ name: "", seats: 1 })}
                className="bg-green text-white px-4 py-2 rounded-lg w-fit"
              >
                {t("buttons.addTable")}
              </button>
            </div>
          )}
        </div>

        <hr className="opacity-30" />

        <div className="flex justify-center gap-4">
          <button
            type="submit"
            className="bg-blue text-white px-4 py-2 rounded-lg w-[150px]"
          >
            {t("buttons.validate")}
          </button>

          <button
            type="button"
            onClick={handleBack}
            className="bg-red text-white px-4 py-2 rounded-lg w-[150px]"
          >
            {t("buttons.back")}
          </button>
        </div>
      </form>
    </section>
  );
}
