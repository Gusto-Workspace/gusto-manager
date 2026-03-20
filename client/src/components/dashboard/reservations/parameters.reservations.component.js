import { useContext, useState, useEffect, useMemo, useRef } from "react";
import { useRouter } from "next/router";

// CONTEXT
import { GlobalContext } from "@/contexts/global.context";

// I18N
import { useTranslation } from "next-i18next";

// SVG
import { ReservationSvg } from "../../_shared/_svgs/reservation.svg";

// REACT HOOK FORM
import { useForm } from "react-hook-form";

// ICONS
import { Loader2, X, ChevronLeft } from "lucide-react";

// AXIOS
import axios from "axios";

// COMPONENTS
import RangesParametersComponent from "./parameters/ranges.parameters.component";
import HoursParametersComponent from "./parameters/hours.parameters.component";
import SlotsParametersComponent from "./parameters/slots.parameters.component";
import AutomationsParametersComponent from "./parameters/automations.parameters.component";
import EmailsParametersComponent from "./parameters/emails.parameters.component";
import SmartParametersComponent from "./parameters/smart.parameters.component";
import FloorPlanParametersComponent from "./parameters/floor-plan.parameters.component";
import BankHoldParametersComponent from "./parameters/bank-hold.parameters.component";
import {
  areReservationEmailTemplatesEqual,
  buildReservationEmailTemplatesPayload,
  buildReservationEmailTemplatesState,
} from "../../_shared/reservations/email-templates.reservations";

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

function shallowEqual(a, b) {
  if (a === b) return true;
  if (!a || !b) return false;
  const ak = Object.keys(a);
  const bk = Object.keys(b);
  if (ak.length !== bk.length) return false;
  for (const k of ak) {
    if (String(a[k]) !== String(b[k])) return false;
  }
  return true;
}

export default function ParametersReservationComponent(props) {
  const { t } = useTranslation(["reservations", "restaurant"]);
  const { restaurantContext } = useContext(GlobalContext);
  const router = useRouter();

  const {
    register,
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

      // Empreinte bancaire
      bank_hold_enabled: false,
      bank_hold_amount_per_person: 0,

      // Automatisations
      auto_finish_reservations: false,

      deletion_duration: false,
      deletion_duration_minutes: 1440,

      // Gestion intelligente
      manage_disponibilities: false,

      // Durée d’occupation
      table_occupancy_lunch_minutes: "",
      table_occupancy_dinner_minutes: "",
    },
  });

  const [reservationHours, setReservationHours] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [manualTablesNeedingAssignment, setManualTablesNeedingAssignment] =
    useState(0);
  const [manualToFix, setManualToFix] = useState([]);
  const [manualToFixLoading, setManualToFixLoading] = useState(false);
  const [manualToFixError, setManualToFixError] = useState("");

  const [
    unassignedReservationsNeedingAssignment,
    setUnassignedReservationsNeedingAssignment,
  ] = useState(0);
  const [unassignedToFix, setUnassignedToFix] = useState([]);
  const [unassignedToFixLoading, setUnassignedToFixLoading] = useState(false);
  const [unassignedToFixError, setUnassignedToFixError] = useState("");

  const [tablesCatalog, setTablesCatalog] = useState([]);
  const [emailTemplates, setEmailTemplates] = useState(
    buildReservationEmailTemplatesState(),
  );

  // UX errors (pas RHF)
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

  async function fetchUnassignedTablesToFix() {
    try {
      setUnassignedToFixLoading(true);
      setUnassignedToFixError("");

      const token = localStorage.getItem("token");
      const restaurantId = props.restaurantData?._id;
      if (!restaurantId) return;

      const res = await axios.get(
        `${process.env.NEXT_PUBLIC_API_URL}/restaurants/${restaurantId}/reservations/unassigned-tables`,
        { headers: { Authorization: `Bearer ${token}` } },
      );

      setUnassignedToFix(
        Array.isArray(res.data?.reservations) ? res.data.reservations : [],
      );
    } catch (e) {
      console.error("Error fetching unassigned tables to fix:", e);
      setUnassignedToFixError(
        e?.response?.data?.message ||
          "Impossible de récupérer la liste des réservations sans table.",
      );
    } finally {
      setUnassignedToFixLoading(false);
    }
  }

  // -----------------------------
  // ✅ “Save per section” state
  // -----------------------------
  const initialSnapRef = useRef({
    hours: null,
    slots: null,
    bank_hold: null,
    automations: null,
    emails: null,
    smart: null,
  });

  const [sectionUI, setSectionUI] = useState({
    hours: { dirty: false, saving: false, saved: false },
    slots: { dirty: false, saving: false, saved: false },
    bank_hold: { dirty: false, saving: false, saved: false },
    automations: { dirty: false, saving: false, saved: false },
    emails: { dirty: false, saving: false, saved: false },
    smart: { dirty: false, saving: false, saved: false },
  });

  const markSectionDirty = (key, nextDirty) => {
    setSectionUI((prev) => {
      const p = prev[key] || { dirty: false, saving: false, saved: false };
      const dirty = Boolean(nextDirty);

      // si ça redevient clean, on enlève saved aussi
      if (!dirty) {
        return { ...prev, [key]: { ...p, dirty: false, saved: false } };
      }

      // si on devient dirty, on enlève "saved"
      return { ...prev, [key]: { ...p, dirty: true, saved: false } };
    });
  };

  const setSaving = (key, saving) => {
    setSectionUI((prev) => ({
      ...prev,
      [key]: { ...prev[key], saving: Boolean(saving) },
    }));
  };

  const setSaved = (key, saved) => {
    setSectionUI((prev) => ({
      ...prev,
      [key]: {
        ...prev[key],
        saved: Boolean(saved),
        dirty: saved ? false : prev[key].dirty,
      },
    }));
  };

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

        bank_hold_enabled: parameters?.bank_hold?.enabled ?? false,
        bank_hold_amount_per_person:
          parameters?.bank_hold?.amount_per_person ?? 0,

        auto_finish_reservations: nextAutoFinishEnabled,

        deletion_duration: parameters.deletion_duration ?? false,
        deletion_duration_minutes: parameters.deletion_duration_minutes ?? 1440,

        manage_disponibilities: parameters.manage_disponibilities ?? false,

        table_occupancy_lunch_minutes: nextLunch,
        table_occupancy_dinner_minutes: nextDinner,
      });

      setReservationHours(parameters.reservation_hours || []);
      setIsLoading(false);
      setDurationError({ lunch: false, dinner: false });
      setTablesCatalog(parameters.tables || []);
      setEmailTemplates(
        buildReservationEmailTemplatesState(parameters.email_templates),
      );

      // Snapshot initial par section (utilisé pour détecter dirty)
      const snap = {
        hours: {
          same_hours_as_restaurant: parameters.same_hours_as_restaurant ?? true,
        },
        slots: {
          auto_accept: parameters.auto_accept ?? true,
          interval: String(parameters.interval ?? "30"),
          pending_duration_minutes: parameters.pending_duration_minutes ?? 120,
        },
        bank_hold: {
          bank_hold_enabled: parameters?.bank_hold?.enabled ?? false,
          bank_hold_amount_per_person:
            parameters?.bank_hold?.amount_per_person ?? 0,
        },
        automations: {
          auto_finish_reservations: nextAutoFinishEnabled,
          deletion_duration: parameters.deletion_duration ?? false,
          deletion_duration_minutes:
            parameters.deletion_duration_minutes ?? 1440,
          table_occupancy_lunch_minutes: nextLunch,
          table_occupancy_dinner_minutes: nextDinner,
        },
        emails: buildReservationEmailTemplatesState(parameters.email_templates),
        smart: {
          manage_disponibilities: parameters.manage_disponibilities ?? false,
        },
      };
      initialSnapRef.current = snap;

      // reset UI states
      setSectionUI({
        hours: { dirty: false, saving: false, saved: false },
        slots: { dirty: false, saving: false, saved: false },
        bank_hold: { dirty: false, saving: false, saved: false },
        automations: { dirty: false, saving: false, saved: false },
        emails: { dirty: false, saving: false, saved: false },
        smart: { dirty: false, saving: false, saved: false },
      });
    }
  }, [restaurantContext.restaurantData?._id, reset]);

  // Watch values (pour dirty detection)
  const same_hours_as_restaurant = watch("same_hours_as_restaurant");
  const manage_disponibilities = watch("manage_disponibilities");
  const deletion_duration = watch("deletion_duration");
  const auto_finish_reservations = watch("auto_finish_reservations");
  const auto_accept = watch("auto_accept");

  const interval = watch("interval");
  const pending_duration_minutes = watch("pending_duration_minutes");
  const deletion_duration_minutes = watch("deletion_duration_minutes");
  const bank_hold_enabled = watch("bank_hold_enabled");
  const bank_hold_amount_per_person = watch("bank_hold_amount_per_person");
  const table_occupancy_lunch_minutes = watch("table_occupancy_lunch_minutes");
  const table_occupancy_dinner_minutes = watch(
    "table_occupancy_dinner_minutes",
  );

  // Detect dirty per section
  useEffect(() => {
    const snap = initialSnapRef.current?.hours;
    if (!snap) return;

    const next = {
      same_hours_as_restaurant: Boolean(same_hours_as_restaurant),
    };
    markSectionDirty("hours", !shallowEqual(snap, next));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [same_hours_as_restaurant]);

  useEffect(() => {
    if (isLoading) return;
    if (!initialSnapRef.current?.smart) return;
    if (!sectionUI.smart?.dirty) return;
    if (sectionUI.smart?.saving) return;

    const timer = setTimeout(() => {
      saveSection("smart");
    }, 150);

    return () => clearTimeout(timer);
  }, [
    isLoading,
    manage_disponibilities,
    sectionUI.smart?.dirty,
    sectionUI.smart?.saving,
  ]);

  useEffect(() => {
    if (isLoading) return;
    if (!initialSnapRef.current?.hours) return;
    if (!sectionUI.hours?.dirty) return;
    if (sectionUI.hours?.saving) return;

    const timer = setTimeout(() => {
      saveSection("hours");
    }, 150);

    return () => clearTimeout(timer);
  }, [
    isLoading,
    same_hours_as_restaurant,
    sectionUI.hours?.dirty,
    sectionUI.hours?.saving,
  ]);

  useEffect(() => {
    const snap = initialSnapRef.current?.slots;
    if (!snap) return;

    const next = {
      auto_accept: Boolean(auto_accept),
      interval: String(interval ?? ""),
      pending_duration_minutes: Number(pending_duration_minutes ?? 0),
    };
    markSectionDirty("slots", !shallowEqual(snap, next));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [auto_accept, interval, pending_duration_minutes]);

  useEffect(() => {
    const snap = initialSnapRef.current?.bank_hold;
    if (!snap) return;

    const next = {
      bank_hold_enabled: Boolean(bank_hold_enabled),
      bank_hold_amount_per_person: Number(bank_hold_amount_per_person ?? 0),
    };
    markSectionDirty("bank_hold", !shallowEqual(snap, next));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bank_hold_enabled, bank_hold_amount_per_person]);

  useEffect(() => {
    const snap = initialSnapRef.current?.automations;
    if (!snap) return;

    const next = {
      auto_finish_reservations: Boolean(auto_finish_reservations),
      deletion_duration: Boolean(deletion_duration),
      deletion_duration_minutes: Number(deletion_duration_minutes ?? 0),
      table_occupancy_lunch_minutes: String(
        table_occupancy_lunch_minutes ?? "",
      ),
      table_occupancy_dinner_minutes: String(
        table_occupancy_dinner_minutes ?? "",
      ),
    };
    markSectionDirty("automations", !shallowEqual(snap, next));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    auto_finish_reservations,
    deletion_duration,
    deletion_duration_minutes,
    table_occupancy_lunch_minutes,
    table_occupancy_dinner_minutes,
  ]);

  useEffect(() => {
    const snap = initialSnapRef.current?.emails;
    if (!snap) return;

    markSectionDirty(
      "emails",
      !areReservationEmailTemplatesEqual(snap, emailTemplates),
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [emailTemplates]);

  useEffect(() => {
    const snap = initialSnapRef.current?.smart;
    if (!snap) return;

    const next = { manage_disponibilities: Boolean(manage_disponibilities) };
    markSectionDirty("smart", !shallowEqual(snap, next));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [manage_disponibilities]);

  const subtitle = t("reservations:buttons.parameters", "Paramètres");

  // Pré-remplissage métier si vide
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

  function handleBack() {
    router.push("/dashboard/reservations");
  }

  // -----------------------------
  // ✅ Partial save (section only)
  // -----------------------------
  async function saveSection(sectionKey) {
    try {
      const restaurantId = props.restaurantData?._id;
      if (!restaurantId) return false;

      const token = localStorage.getItem("token");
      const currentParams =
        restaurantContext?.restaurantData?.reservations?.parameters || {};

      setSaving(sectionKey, true);

      // Build partial + merge (safe)
      let partial = {};

      if (sectionKey === "hours") {
        partial = {
          same_hours_as_restaurant: Boolean(same_hours_as_restaurant),
          reservation_hours: Boolean(same_hours_as_restaurant)
            ? restaurantContext.restaurantData?.opening_hours
            : reservationHours,
        };
      }

      if (sectionKey === "slots") {
        const aa = Boolean(auto_accept);
        partial = {
          auto_accept: aa,
          interval: Number(interval),
          pending_duration_minutes: aa
            ? currentParams.pending_duration_minutes || 120
            : Number(pending_duration_minutes),
        };
      }

      if (sectionKey === "bank_hold") {
        const bhe = Boolean(bank_hold_enabled);
        const amount = Number(bank_hold_amount_per_person || 0);

        partial = {
          bank_hold: {
            enabled: bhe,
            amount_per_person: bhe ? amount : 0,
          },
        };
      }

      if (sectionKey === "smart") {
        const manageNext = Boolean(manage_disponibilities);
        const tablesToSave = manageNext
          ? Array.isArray(tablesCatalog)
            ? tablesCatalog
            : []
          : currentParams.tables || [];

        partial = {
          manage_disponibilities: manageNext,
          tables: tablesToSave,
        };
      }

      if (sectionKey === "automations") {
        // Durées (midi/soir) : mêmes règles que ton submit
        const lunchRaw = (table_occupancy_lunch_minutes ?? "")
          .toString()
          .trim();
        const dinnerRaw = (table_occupancy_dinner_minutes ?? "")
          .toString()
          .trim();

        const lunchHas = lunchRaw !== "" && Number(lunchRaw) >= 1;
        const dinnerHas = dinnerRaw !== "" && Number(dinnerRaw) >= 1;

        const mustHaveDurations = Boolean(
          auto_finish_reservations || manage_disponibilities,
        );
        const shouldStoreDurations =
          mustHaveDurations || (lunchHas && dinnerHas);

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
            setSaving(sectionKey, false);
            return false;
          }

          setDurationError({ lunch: false, dinner: false });
        } else {
          const bothEmpty = lunchRaw === "" && dinnerRaw === "";
          const bothFilled = lunchHas && dinnerHas;

          if (!bothEmpty && !bothFilled) {
            setDurationError({ lunch: !lunchHas, dinner: !dinnerHas });
            setFocus(
              !lunchHas
                ? "table_occupancy_lunch_minutes"
                : "table_occupancy_dinner_minutes",
            );
            setSaving(sectionKey, false);
            return false;
          }

          setDurationError({ lunch: false, dinner: false });
        }

        partial = {
          auto_finish_reservations: Boolean(auto_finish_reservations),
          deletion_duration: Boolean(deletion_duration),
          deletion_duration_minutes: Boolean(deletion_duration)
            ? Number(deletion_duration_minutes)
            : 1440,
          table_occupancy_lunch_minutes: shouldStoreDurations
            ? Number(lunchRaw)
            : null,
          table_occupancy_dinner_minutes: shouldStoreDurations
            ? Number(dinnerRaw)
            : null,
        };
      }

      if (sectionKey === "emails") {
        const nextEmailTemplates =
          buildReservationEmailTemplatesPayload(emailTemplates);
        partial = {
          email_templates: nextEmailTemplates,
        };
      }

      const response = await axios.put(
        `${process.env.NEXT_PUBLIC_API_URL}/restaurants/${restaurantId}/reservations/parameters`,
        { parameters: partial },
        { headers: { Authorization: `Bearer ${token}` } },
      );

      props.setRestaurantData(response.data.restaurant);

      // manual tables warning (si backend renvoie)
      const count = Number(response?.data?.manualTablesNeedingAssignment || 0);
      setManualTablesNeedingAssignment(count);

      const unassignedCount = Number(
        response?.data?.unassignedReservationsNeedingAssignment || 0,
      );
      setUnassignedReservationsNeedingAssignment(unassignedCount);

      if (sectionKey === "hours") {
        initialSnapRef.current.hours = {
          same_hours_as_restaurant: Boolean(same_hours_as_restaurant),
        };
      }
      if (sectionKey === "slots") {
        initialSnapRef.current.slots = {
          auto_accept: Boolean(auto_accept),
          interval: String(interval ?? ""),
          pending_duration_minutes: Number(pending_duration_minutes ?? 0),
        };
      }
      if (sectionKey === "bank_hold") {
        initialSnapRef.current.bank_hold = {
          bank_hold_enabled: Boolean(bank_hold_enabled),
          bank_hold_amount_per_person: Number(bank_hold_amount_per_person ?? 0),
        };
      }
      if (sectionKey === "smart") {
        initialSnapRef.current.smart = {
          manage_disponibilities: Boolean(manage_disponibilities),
        };
      }
      if (sectionKey === "automations") {
        initialSnapRef.current.automations = {
          auto_finish_reservations: Boolean(auto_finish_reservations),
          deletion_duration: Boolean(deletion_duration),
          deletion_duration_minutes: Number(deletion_duration_minutes ?? 0),
          table_occupancy_lunch_minutes: String(
            table_occupancy_lunch_minutes ?? "",
          ),
          table_occupancy_dinner_minutes: String(
            table_occupancy_dinner_minutes ?? "",
          ),
        };
      }
      if (sectionKey === "emails") {
        const savedEmailTemplates = buildReservationEmailTemplatesState(
          response?.data?.restaurant?.reservations?.parameters
            ?.email_templates || partial.email_templates,
        );
        setEmailTemplates(savedEmailTemplates);
        initialSnapRef.current.emails = savedEmailTemplates;
      }

      setSaved(sectionKey, true);
      return true;
    } catch (error) {
      console.error("Erreur sauvegarde paramètres réservation :", error);
      return false;
    } finally {
      setSaving(sectionKey, false);
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
          ✅ FORM (on garde RHF pour les values)
          ========================= */}
      <form className="flex flex-col gap-4">
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
          saveUI={sectionUI.slots}
          onSave={() => saveSection("slots")}
        />
        {/* --- Bloc: Empreinte bancaire --- */}
        <BankHoldParametersComponent
          register={register}
          watch={watch}
          errors={errors}
          saveUI={sectionUI.bank_hold}
          onSave={() => saveSection("bank_hold")}
        />
        {/* --- Bloc: Automatisations --- */}
        <AutomationsParametersComponent
          register={register}
          setValue={setValue}
          auto_finish_reservations={auto_finish_reservations}
          deletion_duration={deletion_duration}
          durationError={durationError}
          saveUI={sectionUI.automations}
          onSave={() => saveSection("automations")}
        />
        <EmailsParametersComponent
          templates={emailTemplates}
          savedTemplates={initialSnapRef.current?.emails}
          onTemplatesChange={setEmailTemplates}
          restaurantName={props.restaurantData?.name}
          saveUI={sectionUI.emails}
          onSave={() => saveSection("emails")}
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
          unassignedReservationsNeedingAssignment={
            unassignedReservationsNeedingAssignment
          }
          unassignedToFixLoading={unassignedToFixLoading}
          unassignedToFixError={unassignedToFixError}
          unassignedToFix={unassignedToFix}
          fetchUnassignedTablesToFix={fetchUnassignedTablesToFix}
          fmtShortFR={fmtShortFR}
          statusLabel={statusLabel}
        />
        <FloorPlanParametersComponent
          restaurantId={props.restaurantData?._id}
          setRestaurantData={props.setRestaurantData}
          tablesCatalog={tablesCatalog}
          onTablesCatalogUpdated={(nextTables) => {
            setTablesCatalog(Array.isArray(nextTables) ? nextTables : []);
          }}
        />
      </form>
    </section>
  );
}
