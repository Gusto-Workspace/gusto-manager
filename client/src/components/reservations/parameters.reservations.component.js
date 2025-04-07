import { useContext, useState, useEffect } from "react";
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

// AXIOS
import axios from "axios";

export default function ParametersReservationComponent(props) {
  const { t } = useTranslation(["reservations", "restaurant"]);
  const { restaurantContext } = useContext(GlobalContext);
  const router = useRouter();

  const {
    register,
    handleSubmit,
    watch,
    setValue,
    control,
    reset,
    formState: { errors },
  } = useForm({
    defaultValues: {
      same_hours_as_restaurant: true,
      reservation_duration: false,
      deletion_duration: false,
      auto_accept: true,
      interval: "30",
      manage_disponibilities: false,
      tables: [
        { name: "Table 1", seats: 4 },
        { name: "Table 2", seats: 2 },
      ],
      reservation_duration_minutes: null,
      deletion_duration_minutes: 1440,
    },
  });

  const { fields, append, remove } = useFieldArray({
    control,
    name: "tables",
  });

  const [reservationHours, setReservationHours] = useState([]);
  const [isLoading, setIsLoading] = useState(true);

  // useEffect pour initialiser les valeurs du formulaire avec les données existantes
  useEffect(() => {
    if (restaurantContext?.restaurantData?.reservations) {
      const { parameters } = restaurantContext.restaurantData.reservations;

      reset({
        same_hours_as_restaurant: parameters.same_hours_as_restaurant,
        reservation_duration: parameters.reservation_duration,
        deletion_duration: parameters.deletion_duration,
        auto_accept: parameters.auto_accept,
        interval: parameters.interval,
        manage_disponibilities: parameters.manage_disponibilities,
        tables: parameters.tables,
        reservation_duration_minutes: parameters.reservation_duration_minutes,
        deletion_duration_minutes: parameters.deletion_duration_minutes ?? 1440,
      });

      setReservationHours(parameters.reservation_hours);
      setIsLoading(false);
    }
  }, [restaurantContext.restaurantData?._id, reset]);

  async function onSubmit(data) {
    const formData = {
      same_hours_as_restaurant: data.same_hours_as_restaurant,
      auto_accept: data.auto_accept,
      interval: data.interval,
      reservation_duration: data.reservation_duration,
      deletion_duration: data.deletion_duration,
      reservation_hours: data.same_hours_as_restaurant
        ? restaurantContext.restaurantData?.opening_hours
        : reservationHours,
      manage_disponibilities: data.manage_disponibilities,
      tables: data.tables,
      reservation_duration_minutes: data.reservation_duration
        ? data.reservation_duration_minutes
        : null,
      deletion_duration_minutes: data.deletion_duration
        ? data.deletion_duration_minutes
        : 1440,
    };

    try {
      const token = localStorage.getItem("token");

      const response = await axios.put(
        `${process.env.NEXT_PUBLIC_API_URL}/restaurants/${props.restaurantData._id}/reservations/parameters`,
        { parameters: formData },
        {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        }
      );

      props.setRestaurantData(response.data.restaurant);
      router.push("/dashboard/reservations");
    } catch (error) {
      console.error(
        "Erreur lors de la mise à jour des paramètres de réservation :",
        error
      );
    }
  }

  function handleBack() {
    router.push("/dashboard/reservations");
  }

  function onReservationHoursChange(data) {
    setReservationHours(data.hours);
  }

  const same_hours_as_restaurant = watch("same_hours_as_restaurant");
  const manage_disponibilities = watch("manage_disponibilities");
  const reservation_duration = watch("reservation_duration");
  const deletion_duration = watch("deletion_duration");

  useEffect(() => {
    if (manage_disponibilities) {
      setValue("reservation_duration", true);
      setValue("auto_accept", true);
    }
  }, [manage_disponibilities, setValue]);

  if (isLoading) {
    return (
      <section className="flex items-center justify-center flex-1">
        <p className="italic">Chargement ...</p>
      </section>
    );
  }

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

          <h1 className="pl-2 text-xl tablet:text-2xl flex items-center gap-2 flex-wrap">
            <span
              className="cursor-pointer hover:underline"
              onClick={() => router.push("/dashboard/reservations")}
            >
              {t("titles.main")}
            </span>

            <span>/</span>

            <span>{t("buttons.parameters")}</span>
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
              id="same_hours_as_restaurant"
              {...register("same_hours_as_restaurant")}
            />
            <label htmlFor="same_hours_as_restaurant">
              {t("labels.sameHoursAsRestaurant")}
            </label>
          </div>

          {!same_hours_as_restaurant && (
            <HoursRestaurantComponent
              restaurantId={props.restaurantData?._id}
              dataLoading={restaurantContext.dataLoading}
              closeEditing={restaurantContext.closeEditing}
              reservations={true}
              reservationHours={reservationHours}
              onChange={onReservationHoursChange}
            />
          )}
        </div>

        <div className="flex flex-col gap-2">
          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              id="auto_accept"
              {...register("auto_accept")}
              disabled={manage_disponibilities}
            />
            <label htmlFor="auto_accept">{t("labels.autoAccept")}</label>
          </div>

          <p className="text-sm opacity-70 flex flex-col gap-2">
            Si cette option est cochée, alors une réservation effectuée depuis
            votre site internet passera directement en état "Confirmée". Sinon,
            vous devrez manuellement confirmer la réservation depuis la site des
            réservations.
            <span>
              <i>
                <u>Information</u>
              </i>{" "}
              : Si vous activez l'option "Utiliser la gestion intelligente des
              réservations", cette option sera activée par défaut et permettra
              de gérer les disponibilités des tables.
            </span>
          </p>
        </div>

        <div className="flex gap-2 items-center">
          <label htmlFor="interval">{t("labels.interval")} :</label>

          <select
            id="interval"
            {...register("interval", { required: true })}
            className="border p-1 rounded-lg w-[200px]"
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

        <div className="flex flex-col gap-2">
          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              id="reservation_duration"
              {...register("reservation_duration")}
              disabled={manage_disponibilities}
            />
            <label htmlFor="reservation_duration">
              {t("labels.reservationDuration")} :
            </label>

            <div className="flex items-center gap-1">
              <input
                type="number"
                id="reservation_duration_minutes"
                {...register("reservation_duration_minutes", {
                  required: reservation_duration,
                  min: 1,
                })}
                className="border p-1 rounded-lg w-20 text-center"
                placeholder="-"
                disabled={!reservation_duration}
              />
              <span>{t("labels.minute(s)")}</span>
            </div>
          </div>

          <p className="text-sm opacity-70 flex flex-col gap-2">
            Si cette option est cochée, alors la réservation passera
            automatiquement en "Terminée" au bout du temps que vous avez choisi.
            Exemple, si la réservation est à 20h, que vous avez choisi une durée
            de 120mn alors à 22h00 la réservation passera en "Terminée" et la
            table sera automatiquement disponible. Si l'option n'est pas cochée,
            alors vous devrez passer manuellement la réservation en "Terminée"
            dans la liste des réservations une fois celle-ci terminée pour
            rendre la table disponible.
            <span>
              <i>
                <u>Information</u>
              </i>{" "}
              : Si vous activez l'option "Utiliser la gestion intelligente des
              réservations", cette option sera activée par défaut et permettra
              de gérer les disponibilités des tables.
            </span>
          </p>
        </div>

        <div className="flex flex-col gap-2">
          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              id="deletion_duration"
              {...register("deletion_duration", {
                onChange: (e) => {
                  if (!e.target.checked) {
                    setValue("deletion_duration_minutes", 1440);
                  }
                },
              })}
            />
            <label htmlFor="deletion_duration">
              {t("labels.deletionDuration")} :
            </label>

            <select
              id="deletion_duration_minutes"
              {...register("deletion_duration_minutes", { required: true })}
              className="border p-1 rounded-lg w-[200px]"
              disabled={!deletion_duration}
            >
              <option value="1">1 {t("labels.minute")}</option>
              <option value="15">15 {t("labels.minutes")}</option>
              <option value="30">30 {t("labels.minutes")}</option>
              <option value="45">45 {t("labels.minutes")}</option>
              <option value="60">1 {t("labels.hour")}</option>
              <option value="120">2 {t("labels.hours")}</option>
              <option value="360">6 {t("labels.hours")}</option>
              <option value="720">12 {t("labels.hours")}</option>
              <option value="1440">24 {t("labels.hours")}</option>
            </select>
          </div>

          <p className="text-sm opacity-70">
            Si cette option est cochée, une réservation "Terminée" sera
            automatiquement supprimée au bout du temps choisi. Sinon, par
            défaut, la réservation est suppprimée automatiquement au bout de 24
            heures.
          </p>
        </div>

        <div className="flex flex-col gap-2">
          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              id="manage_disponibilities"
              {...register("manage_disponibilities")}
            />
            <label htmlFor="manage_disponibilities">
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

          {manage_disponibilities && (
            <div className="flex flex-col gap-12">
              <p className="text-sm opacity-70">
                Si la case "accepter automatiquement les réservations" est
                cochée, une table sera automatiquement attribuée lors d'une
                réservation. Si la case n'est pas cochée, alors vous aurez la
                possibilité d'attribuer manuellement une table lors de la
                confirmation manuelle de la réservation.
              </p>

              <div className="grid grid-cols-1 desktop:grid-cols-2 gap-6">
                {fields.map((field, index) => (
                  <div
                    key={field.id}
                    className="flex mx-auto gap-4 items-center"
                  >
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
                className="bg-green mx-auto text-white px-4 py-2 rounded-lg w-fit"
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
