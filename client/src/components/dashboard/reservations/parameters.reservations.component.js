import { useContext, useState, useEffect } from "react";
import { useRouter } from "next/router";

// CONTEXT
import { GlobalContext } from "@/contexts/global.context";

// I18N
import { useTranslation } from "next-i18next";

// SVG
import { ReservationSvg } from "../../_shared/_svgs/reservation.svg";

// REACT HOOK FORM
import { useForm, useFieldArray } from "react-hook-form";

// ICONS
import { Loader2, X } from "lucide-react";

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
    setFocus,
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
      // 👉 Par défaut 2 tables VIDES (pas de “1” automatique)
      tables: [
        { name: "", seats: "" },
        { name: "", seats: "" },
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

  // État d'affichage d'erreurs UX (pas RHF)
  const [submitted, setSubmitted] = useState(false);
  const [tableErrors, setTableErrors] = useState({}); // { [index]: { name:bool, seats:bool } }
  const [durationError, setDurationError] = useState(false);

  // Init depuis le contexte
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
        tables: parameters.tables?.length
          ? // on map pour garantir string vide si manquant
            parameters.tables.map((t) => ({
              name: t?.name ?? "",
              seats:
                t?.seats === 0 || t?.seats === null || t?.seats === undefined
                  ? ""
                  : String(t.seats),
            }))
          : [
              { name: "", seats: "" },
              { name: "", seats: "" },
            ],
        reservation_duration_minutes:
          parameters.reservation_duration_minutes ?? "",
        deletion_duration_minutes: parameters.deletion_duration_minutes ?? 1440,
      });

      setReservationHours(parameters.reservation_hours);
      setIsLoading(false);
      setSubmitted(false);
      setTableErrors({});
      setDurationError(false);
    }
    // On ne dépend que de l'ID et reset pour éviter d'écraser l'état local en cours d'édition
  }, [restaurantContext.restaurantData?._id, reset]);

  const same_hours_as_restaurant = watch("same_hours_as_restaurant");
  const manage_disponibilities = watch("manage_disponibilities");
  const reservation_duration = watch("reservation_duration");
  const deletion_duration = watch("deletion_duration");
  const tablesWatch = watch("tables");

  // Quand la gestion intelligente est activée :
  // - forcer reservation_duration & auto_accept à true (déjà existant)
  // - s'il n'y a pas de tables, injecter 2 lignes vides
  useEffect(() => {
    if (manage_disponibilities) {
      setValue("reservation_duration", true);
      setValue("auto_accept", true);
      const hasAnyRow = Array.isArray(tablesWatch) && tablesWatch.length > 0;
      if (!hasAnyRow) {
        append({ name: "", seats: "" });
        append({ name: "", seats: "" });
      }
    } else {
      // on nettoie l'affichage des erreurs liées aux tables si on désactive le mode
      setSubmitted(false);
      setTableErrors({});
      setDurationError(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [manage_disponibilities]);

  // Recalcule les erreurs visuelles des lignes si on a déjà tenté de soumettre
  useEffect(() => {
    if (!submitted) return;
    const nextErrors = {};
    (tablesWatch || []).forEach((row, i) => {
      const name = (row?.name || "").trim();
      const seatsRaw = row?.seats;
      const seatsEmpty =
        seatsRaw === "" || seatsRaw === null || seatsRaw === undefined;
      const nameEmpty = name === "";
      const bothEmpty = nameEmpty && seatsEmpty;
      if (bothEmpty) return; // on ignore les lignes totalement vides
      if (nameEmpty || seatsEmpty) {
        nextErrors[i] = { name: nameEmpty, seats: seatsEmpty };
      }
    });
    setTableErrors(nextErrors);
  }, [tablesWatch, submitted]);

  function handleBack() {
    router.push("/dashboard/reservations");
  }

  function onReservationHoursChange(data) {
    setReservationHours(data.hours);
  }

  // —— Sauvegarde immédiate des heures de réservation (appelée par l'enfant)
  async function saveReservationHoursImmediate(newHours) {
    try {
      const token = localStorage.getItem("token");

      // On repart des paramètres actuels persistés côté serveur
      const currentParams =
        restaurantContext?.restaurantData?.reservations?.parameters || {};

      const payload = {
        ...currentParams,
        same_hours_as_restaurant: false, // l'utilisateur édite des heures dédiées
        reservation_hours: newHours,
      };

      const response = await axios.put(
        `${process.env.NEXT_PUBLIC_API_URL}/restaurants/${props.restaurantData._id}/reservations/parameters`,
        { parameters: payload },
        { headers: { Authorization: `Bearer ${token}` } }
      );

      // Sync source de vérité
      props.setRestaurantData(response.data.restaurant);
      // Sync local
      setReservationHours(newHours);
    } catch (err) {
      console.error(
        "Erreur lors de l’enregistrement immédiat des heures :",
        err
      );
      throw err;
    }
  }

  // Ajout/Suppression de table avec bonnes valeurs par défaut
  function handleAddTable() {
    append({ name: "", seats: "" });
  }
  function handleRemoveTable(i) {
    remove(i);
  }

  // Nettoyage + validation UX + soumission
  async function onSubmit(data) {
    setSubmitted(true);

    // ——— Validation "tables"
    const rawTables = Array.isArray(data.tables) ? data.tables : [];

    // on filtre les lignes totalement vides
    const sanitizedTables = rawTables
      .map((row) => ({
        name: (row?.name || "").trim(),
        seatsRaw: row?.seats,
      }))
      .filter(
        (r) => !(r.name === "" && (r.seatsRaw === "" || r.seatsRaw == null))
      )
      .map((r) => ({
        name: r.name,
        seats:
          r.seatsRaw === "" || r.seatsRaw == null
            ? null
            : Number.parseInt(r.seatsRaw, 10),
      }));

    // lignes partiellement remplies => erreur visuelle & on stop
    const partialErrors = {};
    rawTables.forEach((row, i) => {
      const name = (row?.name || "").trim();
      const seatsEmpty =
        row?.seats === "" || row?.seats === null || row?.seats === undefined;
      const nameEmpty = name === "";
      const bothEmpty = nameEmpty && seatsEmpty;
      if (!bothEmpty && (nameEmpty || seatsEmpty)) {
        partialErrors[i] = { name: nameEmpty, seats: seatsEmpty };
      }
    });
    if (Object.keys(partialErrors).length > 0) {
      setTableErrors(partialErrors);
      return;
    }

    // ——— Validation reservation_duration_minutes si gestion intelligente active
    const duration = data.reservation_duration_minutes;
    if (manage_disponibilities && (!duration || Number(duration) < 1)) {
      setDurationError(true);
      setFocus("reservation_duration_minutes");
      return;
    } else {
      setDurationError(false);
    }

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
      // 👉 on envoie les tables nettoyées (lignes vides supprimées)
      tables: sanitizedTables.map((t) => ({
        name: t.name,
        seats: t.seats, // nombre (ou null si jamais, mais ici on a déjà filtré)
      })),
      reservation_duration_minutes: data.reservation_duration
        ? Number(data.reservation_duration_minutes)
        : null,
      deletion_duration_minutes: data.deletion_duration
        ? Number(data.deletion_duration_minutes)
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

      <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-12">
        {/* --- Heures --- */}
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
              onSaveReservationHours={saveReservationHoursImmediate}
            />
          )}
        </div>

        {/* --- Auto accept --- */}
        <div className="flex flex-col gap-2">
          <div className="flex items-center gap-4">
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
            vous devrez confirmer manuellement les réservations.
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

        {/* --- Intervalle --- */}
        <div className="flex gap-4 flex-wrap items-center">
          <label htmlFor="interval" className="text-pretty">
            Définir l'intervalle entre les créneaux de réservation :
          </label>

          <select
            id="interval"
            {...register("interval", { required: true })}
            className="border p-1 rounded-lg w-full mobile:w-[200px]"
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

        {/* --- Durée de réservation --- */}
        <div className="flex flex-col gap-2">
          <div className="flex flex-wrap items-center gap-4">
            <div className="flex items-center gap-4 w-fit">
              <input
                type="checkbox"
                id="reservation_duration"
                {...register("reservation_duration")}
                disabled={manage_disponibilities}
              />
              <label htmlFor="reservation_duration">
                {t("labels.reservationDuration")} :
              </label>
            </div>

            <div className="flex w-full mobile:w-auto items-center gap-1">
              <input
                type="number"
                id="reservation_duration_minutes"
                {...register("reservation_duration_minutes", {
                  min: 1,
                })}
                className={`border p-1 rounded-lg w-full mobile:w-24 text-center ${
                  durationError ? "border-red" : ""
                }`}
                placeholder="-"
                disabled={!reservation_duration}
              />
              <span>{t("labels.minute(s)")}</span>
            </div>
          </div>

          <p className="text-sm opacity-70 flex flex-col gap-2">
            Si cette option est cochée, alors la réservation passera
            automatiquement en "Terminée" au bout du temps que vous avez choisi
            <span>
              <i>
                <u>Information</u>
              </i>{" "}
              : Si vous activez l'option "Utiliser la gestion intelligente des
              réservations", cette option sera activée par défaut
            </span>
          </p>
        </div>

        {/* --- Suppression automatique --- */}
        <div className="flex flex-col gap-2">
          <div className="flex flex-wrap items-center gap-4">
            <div className="flex items-center gap-4 w-fit">
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
            </div>

            <select
              id="deletion_duration_minutes"
              {...register("deletion_duration_minutes", { required: true })}
              className="border p-1 rounded-lg w-full mobile:w-[200px]"
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
            automatiquement supprimée
          </p>
        </div>

        {/* --- Gestion intelligente + Tables (nouvelle UI/UX) --- */}
        <div className="flex flex-col gap-2">
          <div className="flex items-center gap-4">
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
            disponibilités des tables et des places
          </p>

          {manage_disponibilities && (
            <div className="flex flex-col gap-6">
              <p className="text-sm opacity-70">
                Si l'option "accepter automatiquement les réservations" est
                cochée, une table sera automatiquement attribuée
              </p>

              {/* Liste des tables : grille responsive, lignes propres */}
              <div className="grid grid-cols-1 desktop:grid-cols-2 gap-2">
                {fields.map((field, index) => {
                  const nameError = !!tableErrors[index]?.name;
                  const seatsError = !!tableErrors[index]?.seats;
                  return (
                    <div
                      key={field.id}
                      className="w-full bg-white/60 rounded-2xl shadow-sm p-4 border border-[#131E36]/10"
                    >
                      <div className="grid grid-cols-[minmax(0,1fr)_120px_auto] items-center gap-3">
                        <input
                          type="text"
                          placeholder="nom / n° de table"
                          {...register(`tables.${index}.name`)}
                          className={`min-w-0 border p-2 rounded-lg placeholder:opacity-60 ${
                            nameError ? "border-red" : "border-[#131E36]/30"
                          }`}
                        />
                        <input
                          type="number"
                          inputMode="numeric"
                          placeholder="nombre de sièges"
                          {...register(`tables.${index}.seats`, {
                            min: 1,
                          })}
                          className={`border p-2 rounded-lg text-center placeholder:opacity-60 ${
                            seatsError ? "border-red" : "border-[#131E36]/30"
                          }`}
                        />

                        <button
                          type="button"
                          onClick={() => handleRemoveTable(index)}
                          className="justify-self-end w-8 h-8 rounded-full bg-red flex items-center justify-center shadow-sm"
                          aria-label={t("buttons.delete")}
                          title={t("buttons.delete")}
                        >
                          <X className="w-4 h-4 text-white" />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>

              <button
                type="button"
                onClick={handleAddTable}
                className="bg-green text-white px-4 py-2 rounded-lg w-fit mx-auto"
              >
                {t("buttons.addTable")}
              </button>
            </div>
          )}
        </div>

        <hr className="opacity-30" />

        <div className="flex flex-col mobile:flex-row justify-center gap-2">
          <button
            type="submit"
            disabled={isLoading}
            className="bg-blue text-white px-4 py-2 rounded-lg mobile:w-[150px]"
          >
            {isLoading ? (
              <div className="flex gap-2">
                <Loader2 className="size-6 animate-spin" />
                <span>En cours…</span>
              </div>
            ) : (
              t("buttons.validate")
            )}
          </button>

          <button
            type="button"
            onClick={handleBack}
            disabled={isLoading}
            className="bg-red text-white px-4 py-2 rounded-lg mobile:w-[150px]"
          >
            {t("buttons.back")}
          </button>
        </div>
      </form>
    </section>
  );
}
