import { useContext, useState, useEffect, useMemo } from "react";
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
import { Loader2, X, ChevronLeft } from "lucide-react";

// AXIOS
import axios from "axios";

// COMPONENTS
import RangesParametersComponent from "./parameters/ranges.parameters.component";
import HoursParametersComponent from "./parameters/hours.parameters.component";
import SlotsParametersComponent from "./parameters/slots.parameters.component";
import AutomationsParametersComponent from "./parameters/automations.parameters.component";
import SmartParametersComponent from "./parameters/smart.parameters.component";

// Helpers
const statusLabel = (status) => {
  const s = String(status || "").trim();
  if (!s) return "";

  const map = {
    Pending: "En attente",
    Confirmed: "Confirmée",
    Active: "En cours",
    Late: "En retard",
    Finished: "Terminée",
    Canceled: "Annulée",
    NoShow: "No-show",
  };

  return map[s] || s;
};

function fmtShortFR(date) {
  const d = date instanceof Date ? date : new Date(date);
  if (Number.isNaN(d.getTime())) return "-";
  return d.toLocaleString("fr-FR", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

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
    shouldUnregister: false,
    defaultValues: {
      same_hours_as_restaurant: true,

      // Créneaux
      auto_accept: true,
      interval: "30",
      pending_duration_minutes: 120,

      // Automatisations
      auto_finish_reservations: false,

      deletion_duration: false,
      deletion_duration_minutes: 1440,

      // Gestion intelligente
      manage_disponibilities: false,

      // ✅ Durée d’occupation (sert aussi à l’auto-finish)
      table_occupancy_lunch_minutes: "",
      table_occupancy_dinner_minutes: "",

      tables: [
        { name: "", seats: "" },
        { name: "", seats: "" },
      ],
    },
  });

  const { fields, append, remove } = useFieldArray({
    control,
    name: "tables",
  });

  const [reservationHours, setReservationHours] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [manualTablesNeedingAssignment, setManualTablesNeedingAssignment] =
    useState(0);
  const [manualToFix, setManualToFix] = useState([]);
  const [manualToFixLoading, setManualToFixLoading] = useState(false);
  const [manualToFixError, setManualToFixError] = useState("");

  // UX errors (pas RHF)
  const [submitted, setSubmitted] = useState(false);
  const [tableErrors, setTableErrors] = useState({});
  const [durationError, setDurationError] = useState({
    lunch: false,
    dinner: false,
  });

  const blockedRanges = useMemo(() => {
    const r =
      props.restaurantData?.reservations?.parameters?.blocked_ranges || [];
    return Array.isArray(r) ? r : [];
  }, [props.restaurantData?.reservations?.parameters?.blocked_ranges]);

  async function fetchManualTablesToFix() {
    try {
      setManualToFixLoading(true);
      setManualToFixError("");

      const token = localStorage.getItem("token");
      const restaurantId = props.restaurantData?._id;
      if (!restaurantId) return;

      const res = await axios.get(
        `${process.env.NEXT_PUBLIC_API_URL}/restaurants/${restaurantId}/reservations/manual-tables`,
        { headers: { Authorization: `Bearer ${token}` } },
      );

      setManualToFix(
        Array.isArray(res.data?.reservations) ? res.data.reservations : [],
      );
    } catch (e) {
      console.error("Error fetching manual tables to fix:", e);
      setManualToFixError(
        e?.response?.data?.message ||
          "Impossible de récupérer la liste des réservations à corriger.",
      );
    } finally {
      setManualToFixLoading(false);
    }
  }

  // Init depuis le contexte
  useEffect(() => {
    if (restaurantContext?.restaurantData?.reservations) {
      const { parameters } = restaurantContext.restaurantData.reservations;

      const nextLunch =
        parameters?.table_occupancy_lunch_minutes === 0 ||
        parameters?.table_occupancy_lunch_minutes
          ? String(parameters.table_occupancy_lunch_minutes)
          : "";

      const nextDinner =
        parameters?.table_occupancy_dinner_minutes === 0 ||
        parameters?.table_occupancy_dinner_minutes
          ? String(parameters.table_occupancy_dinner_minutes)
          : "";

      const nextAutoFinishEnabled = Boolean(
        parameters?.auto_finish_reservations,
      );

      reset({
        same_hours_as_restaurant: parameters.same_hours_as_restaurant ?? true,

        auto_accept: parameters.auto_accept ?? true,
        interval: String(parameters.interval ?? "30"),
        pending_duration_minutes: parameters.pending_duration_minutes ?? 120,

        auto_finish_reservations: nextAutoFinishEnabled,

        deletion_duration: parameters.deletion_duration ?? false,
        deletion_duration_minutes: parameters.deletion_duration_minutes ?? 1440,

        manage_disponibilities: parameters.manage_disponibilities ?? false,

        table_occupancy_lunch_minutes: nextLunch,
        table_occupancy_dinner_minutes: nextDinner,

        tables: parameters.tables?.length
          ? parameters.tables.map((tt) => ({
              name: tt?.name ?? "",
              seats:
                tt?.seats === 0 || tt?.seats === null || tt?.seats === undefined
                  ? ""
                  : String(tt.seats),
            }))
          : [
              { name: "", seats: "" },
              { name: "", seats: "" },
            ],
      });

      setReservationHours(parameters.reservation_hours || []);
      setIsLoading(false);
      setSubmitted(false);
      setTableErrors({});
      setDurationError({ lunch: false, dinner: false });
    }
  }, [restaurantContext.restaurantData?._id, reset]);

  const same_hours_as_restaurant = watch("same_hours_as_restaurant");
  const manage_disponibilities = watch("manage_disponibilities");
  const deletion_duration = watch("deletion_duration");
  const auto_finish_reservations = watch("auto_finish_reservations");
  const tablesWatch = watch("tables");
  const auto_accept = watch("auto_accept");

  const subtitle = t("reservations:buttons.parameters", "Paramètres");

  const tablesCount = useMemo(() => {
    const raw = Array.isArray(tablesWatch) ? tablesWatch : [];
    return raw.filter((r) => {
      const name = (r?.name || "").trim();
      const seatsEmpty =
        r?.seats === "" || r?.seats === null || r?.seats === undefined;
      return !(name === "" && seatsEmpty);
    }).length;
  }, [tablesWatch]);

  // Pré-remplissage métier si vide (dès qu’on active soit auto-finish, soit gestion intelligente)
  useEffect(() => {
    const lunch = (watch("table_occupancy_lunch_minutes") ?? "").toString();
    const dinner = (watch("table_occupancy_dinner_minutes") ?? "").toString();

    if (
      (auto_finish_reservations || manage_disponibilities) &&
      !lunch &&
      !dinner
    ) {
      setValue("table_occupancy_lunch_minutes", "90");
      setValue("table_occupancy_dinner_minutes", "120");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [auto_finish_reservations, manage_disponibilities]);

  // Quand on active la gestion intelligente: s'assurer d'avoir 2 lignes
  useEffect(() => {
    if (manage_disponibilities) {
      const hasAnyRow = Array.isArray(tablesWatch) && tablesWatch.length > 0;
      if (!hasAnyRow) {
        append({ name: "", seats: "" });
        append({ name: "", seats: "" });
      }
    } else {
      setSubmitted(false);
      setTableErrors({});
      setDurationError({ lunch: false, dinner: false });
      setManualTablesNeedingAssignment(0);
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
      if (bothEmpty) return;

      if (nameEmpty || seatsEmpty) {
        nextErrors[i] = { name: nameEmpty, seats: seatsEmpty };
      }
    });

    setTableErrors(nextErrors);
  }, [tablesWatch, submitted]);

  function handleBack() {
    router.push("/dashboard/reservations");
  }

  function handleAddTable() {
    append({ name: "", seats: "" });
  }

  function handleRemoveTable(i) {
    remove(i);
  }

  async function onSubmit(data) {
    setSubmitted(true);

    // --------------------
    // ✅ Tables validation (seulement si gestion intelligente)
    // --------------------
    const rawTables = Array.isArray(data.tables) ? data.tables : [];

    const sanitizedTables = rawTables
      .map((row) => ({
        name: (row?.name || "").trim(),
        seatsRaw: row?.seats,
      }))
      .filter(
        (r) => !(r.name === "" && (r.seatsRaw === "" || r.seatsRaw == null)),
      )
      .map((r) => ({
        name: r.name,
        seats:
          r.seatsRaw === "" || r.seatsRaw == null
            ? null
            : Number.parseInt(r.seatsRaw, 10),
      }));

    if (manage_disponibilities) {
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
    }

    // --------------------
    // ✅ Durées (midi/soir)
    // --------------------
    let lunch = (data.table_occupancy_lunch_minutes ?? "").toString().trim();
    let dinner = (data.table_occupancy_dinner_minutes ?? "").toString().trim();

    const lunchHas = lunch !== "" && Number(lunch) >= 1;
    const dinnerHas = dinner !== "" && Number(dinner) >= 1;

    const mustHaveDurations = Boolean(
      auto_finish_reservations || manage_disponibilities,
    );

    const shouldStoreDurations = mustHaveDurations || (lunchHas && dinnerHas);

    if (mustHaveDurations) {
      const lunchMissing = !lunchHas;
      const dinnerMissing = !dinnerHas;

      if (lunchMissing || dinnerMissing) {
        setDurationError({ lunch: lunchMissing, dinner: dinnerMissing });
        setFocus(
          lunchMissing
            ? "table_occupancy_lunch_minutes"
            : "table_occupancy_dinner_minutes",
        );
        return;
      }

      setDurationError({ lunch: false, dinner: false });
    } else {
      const bothEmpty = lunch === "" && dinner === "";
      const bothFilled = lunchHas && dinnerHas;

      if (!bothEmpty && !bothFilled) {
        setDurationError({ lunch: !lunchHas, dinner: !dinnerHas });
        setFocus(
          !lunchHas
            ? "table_occupancy_lunch_minutes"
            : "table_occupancy_dinner_minutes",
        );
        return;
      }

      setDurationError({ lunch: false, dinner: false });
    }

    const currentParams =
      restaurantContext?.restaurantData?.reservations?.parameters || {};

    const manageNext = Boolean(data.manage_disponibilities);

    const tablesToSave = manageNext
      ? sanitizedTables.map((tt) => ({ name: tt.name, seats: tt.seats }))
      : currentParams.tables || [];

    const formData = {
      same_hours_as_restaurant: Boolean(data.same_hours_as_restaurant),

      // Créneaux
      auto_accept: Boolean(data.auto_accept),
      interval: Number(data.interval),

      pending_duration_minutes: data.auto_accept
        ? currentParams.pending_duration_minutes || 120
        : Number(data.pending_duration_minutes),

      // Automatisations
      auto_finish_reservations: Boolean(data.auto_finish_reservations),

      deletion_duration: Boolean(data.deletion_duration),
      deletion_duration_minutes: data.deletion_duration
        ? Number(data.deletion_duration_minutes)
        : 1440,

      reservation_hours: data.same_hours_as_restaurant
        ? restaurantContext.restaurantData?.opening_hours
        : reservationHours,

      manage_disponibilities: manageNext,
      tables: tablesToSave,

      // ✅ Durées (stockées dès qu'on en a besoin)
      table_occupancy_lunch_minutes: shouldStoreDurations
        ? Number(lunch)
        : null,
      table_occupancy_dinner_minutes: shouldStoreDurations
        ? Number(dinner)
        : null,
    };

    try {
      const token = localStorage.getItem("token");

      const response = await axios.put(
        `${process.env.NEXT_PUBLIC_API_URL}/restaurants/${props.restaurantData._id}/reservations/parameters`,
        { parameters: formData },
        { headers: { Authorization: `Bearer ${token}` } },
      );

      props.setRestaurantData(response.data.restaurant);

      const count = Number(response?.data?.manualTablesNeedingAssignment || 0);
      setManualTablesNeedingAssignment(count);

      if (count > 0) {
        // ✅ on reste sur la page pour que le restaurateur voie le message
        // (sinon il ne le verra jamais)
        return;
      }

      router.push("/dashboard/reservations");
    } catch (error) {
      console.error("Erreur mise à jour paramètres réservation :", error);
    }
  }

  if (isLoading) {
    return (
      <section className="flex items-center justify-center flex-1">
        <div className="inline-flex items-center gap-2 rounded-2xl border border-darkBlue/10 bg-white/70 px-4 py-3 text-sm text-darkBlue/70">
          <Loader2 className="size-4 shrink-0 animate-spin" />
          <span className="italic">
            {t("reservations:messages.loading", "Chargement…")}
          </span>
        </div>
      </section>
    );
  }

  return (
    <section className="flex flex-col gap-6">
      {/* =========================
          ✅ HEADER
          ========================= */}
      <div className="midTablet:hidden  bg-lightGrey">
        <div className="flex items-center justify-between gap-3 h-[50px]">
          <button
            onClick={handleBack}
            className="shrink-0 inline-flex items-center justify-center rounded-2xl border border-darkBlue/10 bg-white/70 hover:bg-darkBlue/5 transition p-2"
            aria-label={t("reservations:calendar.back", "Retour")}
            title={t("reservations:calendar.back", "Retour")}
          >
            <ChevronLeft className="size-5 text-darkBlue/70" />
          </button>

          <div className="min-w-0 flex-1 flex items-center gap-2">
            <ReservationSvg
              width={26}
              height={26}
              className="min-h-[26px] min-w-[26px]"
              fillColor="#131E3690"
            />
            <div className="min-w-0">
              <p className="text-xl font-semibold text-darkBlue truncate">
                {t("reservations:titles.main", "Réservations")}
              </p>
              <p className="text-sm text-darkBlue/50 truncate">{subtitle}</p>
            </div>
          </div>

          <div className="shrink-0 w-[40px]" />
        </div>
      </div>

      <hr className="opacity-20 hidden midTablet:block" />

      <div className="hidden midTablet:flex items-center justify-between gap-4 flex-wrap">
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
              onClick={handleBack}
            >
              {t("reservations:titles.main", "Réservations")}
            </span>
            <span className="text-darkBlue/30 select-none">/</span>
            <span className="">{subtitle}</span>
          </h1>
        </div>

        <button
          type="button"
          onClick={handleBack}
          className="inline-flex items-center gap-2 rounded-lg border border-darkBlue/10 bg-white/70 hover:bg-darkBlue/5 transition px-4 py-2 text-sm font-semibold text-darkBlue"
        >
          <ChevronLeft className="size-4 shrink-0 text-darkBlue/60" />
          {t("reservations:buttons.back", "Retour")}
        </button>
      </div>

      {/* =========================
          ✅ FORM
          ========================= */}
      <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-4">
        {/* --- Bloc: Ranges --- */}
        <RangesParametersComponent
          restaurantId={props.restaurantData?._id}
          blockedRanges={blockedRanges}
          setRestaurantData={props.setRestaurantData}
        />

        {/* --- Bloc: Heures --- */}
        <HoursParametersComponent
          register={register}
          same_hours_as_restaurant={same_hours_as_restaurant}
          restaurantId={props.restaurantData?._id}
          reservationHours={reservationHours}
          setReservationHours={setReservationHours}
          setRestaurantData={props.setRestaurantData}
          dataLoading={restaurantContext.dataLoading}
          closeEditing={restaurantContext.closeEditing}
        />

        {/* --- Bloc: Créneaux --- */}
        <SlotsParametersComponent
          register={register}
          watch={watch}
          errors={errors}
          auto_accept={auto_accept}
        />

        {/* --- Bloc: Automatisations --- */}
        <AutomationsParametersComponent
          register={register}
          setValue={setValue}
          auto_finish_reservations={auto_finish_reservations}
          deletion_duration={deletion_duration}
          durationError={durationError}
        />

        {/* --- Bloc: Gestion intelligente + tables --- */}
        <SmartParametersComponent
          register={register}
          manage_disponibilities={manage_disponibilities}
          manualTablesNeedingAssignment={manualTablesNeedingAssignment}
          manualToFixLoading={manualToFixLoading}
          manualToFixError={manualToFixError}
          manualToFix={manualToFix}
          fetchManualTablesToFix={fetchManualTablesToFix}
          fields={fields}
          tablesCount={tablesCount}
          tableErrors={tableErrors}
          handleAddTable={handleAddTable}
          handleRemoveTable={handleRemoveTable}
          fmtShortFR={fmtShortFR}
          statusLabel={statusLabel}
          restaurantId={restaurantContext?.restaurantData?._id}
          tablesCatalog={
            restaurantContext?.restaurantData?.reservations?.parameters
              ?.tables || []
          }
        />

        {/* --- Actions --- */}
        <div className="flex flex-col midTablet:flex-row items-stretch midTablet:items-center justify-end gap-3 pt-2">
          <button
            type="button"
            onClick={handleBack}
            disabled={isLoading}
            className="inline-flex items-center justify-center gap-2 rounded-2xl border border-darkBlue/10 bg-white/70 hover:bg-darkBlue/5 transition px-5 h-11 text-sm font-semibold text-darkBlue"
          >
            <X className="size-4 shrink-0 text-darkBlue/60" />
            {t("reservations:buttons.back", "Retour")}
          </button>

          <button
            type="submit"
            disabled={isLoading}
            className={[
              "inline-flex items-center justify-center gap-2 rounded-2xl px-5 h-11",
              "text-sm font-semibold text-white",
              "bg-blue hover:bg-blue/90 active:scale-[0.98] transition",
              isLoading ? "opacity-50 cursor-not-allowed" : "",
            ].join(" ")}
          >
            {isLoading ? (
              <>
                <Loader2 className="size-4 shrink-0 animate-spin" />
                {t("reservations:buttons.loading", "En cours…")}
              </>
            ) : (
              t("reservations:buttons.validate", "Valider")
            )}
          </button>
        </div>
      </form>
    </section>
  );
}
