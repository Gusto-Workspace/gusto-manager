import { useCallback, useContext, useEffect, useState } from "react";
import {
  BellOff,
  BellRing,
  CheckCircle2,
  Loader2,
  TriangleAlert,
} from "lucide-react";
import { GlobalContext } from "@/contexts/global.context";
import {
  disablePushForModule,
  getPushPermissionStatus,
  isPushDisabledForModule,
  setPushDisabledForModule,
  setupPushForModule,
} from "@/_assets/utils/webpush";

const MODULE_LABELS = {
  gift_cards: "nouvelle carte cadeau achetée",
  reservations: "nouvelle réservation",
};

export default function PushNotificationsSettingsWebapp({ module }) {
  const { restaurantContext } = useContext(GlobalContext);
  const [status, setStatus] = useState("loading");
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const restaurantId = restaurantContext?.restaurantData?._id;

  const synchronizeSubscription = useCallback(
    async ({ requestPermission }) => {
      const token = localStorage.getItem("token");
      return setupPushForModule({
        module,
        restaurantId,
        token,
        apiUrl: process.env.NEXT_PUBLIC_API_URL,
        requestPermission,
      });
    },
    [module, restaurantId],
  );

  useEffect(() => {
    const permission = getPushPermissionStatus();
    setErrorMessage("");

    if (permission !== "granted") {
      setStatus(permission);
      return;
    }
    if (!restaurantId) {
      setStatus("loading");
      return;
    }
    if (isPushDisabledForModule(restaurantId, module)) {
      setStatus("disabled");
      return;
    }

    setStatus("syncing");

    let cancelled = false;
    synchronizeSubscription({ requestPermission: false })
      .then(() => {
        if (!cancelled) setStatus("granted");
      })
      .catch((error) => {
        if (!cancelled) {
          setStatus("error");
          setErrorMessage(
            error?.message || "Impossible de vérifier l’abonnement actuel.",
          );
        }
      });

    return () => {
      cancelled = true;
    };
  }, [module, restaurantId, synchronizeSubscription]);

  async function handleToggleNotifications() {
    const shouldDisable = status === "granted";
    setIsLoading(true);
    setErrorMessage("");
    try {
      if (shouldDisable) {
        const token = localStorage.getItem("token");
        await disablePushForModule({
          module,
          restaurantId,
          token,
          apiUrl: process.env.NEXT_PUBLIC_API_URL,
        });
        setPushDisabledForModule(restaurantId, module, true);
        setStatus("disabled");
        return;
      }

      const result = await synchronizeSubscription({ requestPermission: true });
      if (result?.status === "subscribed") {
        setPushDisabledForModule(restaurantId, module, false);
        setStatus("granted");
      } else if (result?.status === "denied") setStatus("denied");
      else setStatus(getPushPermissionStatus());
    } catch (error) {
      if (!shouldDisable) {
        const permission = getPushPermissionStatus();
        setStatus(permission === "granted" ? "error" : permission);
      }
      setErrorMessage(
        error?.message ||
          `Impossible de ${shouldDisable ? "désactiver" : "activer"} les notifications.`,
      );
    } finally {
      setIsLoading(false);
    }
  }

  const notificationLabel = MODULE_LABELS[module] || "nouvelle activité";
  const isGranted = status === "granted";
  const isDenied = status === "denied";
  const isUnsupported = status === "unsupported";
  const isSyncing = status === "syncing";
  const hasSubscriptionError = status === "error";
  const isToggleDisabled =
    isLoading || isSyncing || !restaurantId || isDenied || isUnsupported;
  const showDetails =
    isDenied ||
    isUnsupported ||
    isLoading ||
    isSyncing ||
    Boolean(errorMessage) ||
    isGranted;

  return (
    <section className="rounded-3xl border border-darkBlue/10 bg-white/70 p-4 shadow-sm mobile:p-6">
      <div className="flex items-start gap-3">
        <div className="inline-flex size-11 shrink-0 items-center justify-center rounded-2xl bg-blue/10 text-blue">
          {isGranted ? (
            <CheckCircle2 className="size-5" />
          ) : status === "disabled" ||
            isDenied ||
            isUnsupported ||
            hasSubscriptionError ? (
            <BellOff className="size-5" />
          ) : (
            <BellRing className="size-5" />
          )}
        </div>
        <div className="min-w-0 flex-1">
          <h2 className="text-base font-semibold text-darkBlue">
            Notifications
          </h2>
          <p className="mt-1 text-sm leading-6 text-darkBlue/60">
            Recevez une alerte sur cet appareil lors de chaque{" "}
            {notificationLabel}.
          </p>
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={isGranted}
          aria-label={
            isGranted
              ? "Désactiver les notifications"
              : "Activer les notifications"
          }
          onClick={handleToggleNotifications}
          disabled={isToggleDisabled}
          className="inline-flex shrink-0 items-center gap-2 text-xs font-semibold text-darkBlue/65 disabled:cursor-not-allowed disabled:opacity-50"
        >
          <span>{isGranted ? "Activées" : "Désactivées"}</span>
          <span
            className={`relative inline-flex h-6 w-11 rounded-full transition ${
              isGranted ? "bg-blue" : "bg-darkBlue/15"
            }`}
          >
            <span
              className={`absolute top-1 size-4 rounded-full bg-white shadow-sm transition ${
                isGranted ? "translate-x-6" : "translate-x-1"
              }`}
            />
          </span>
        </button>
      </div>

      {showDetails ? (
        <div className="mt-5">
          {isDenied ? (
            <div className="rounded-2xl border border-red/20 bg-red/5 px-4 py-3 text-sm leading-6 text-darkBlue/75">
              <p className="font-semibold text-red">Notifications bloquées</p>
              <p className="mt-1">
                Autorisez-les dans les paramètres du navigateur ou de
                l’application installée, puis revenez sur cette page.
              </p>
            </div>
          ) : isUnsupported ? (
            <div className="rounded-2xl border border-red/20 bg-red/5 px-4 py-3 text-sm leading-6 text-darkBlue/75">
              Les notifications ne sont pas disponibles. Utilisez l’application
              installée depuis Chrome et une connexion HTTPS.
            </div>
          ) : isLoading || isSyncing ? (
            <div className="flex items-center gap-2 text-sm text-darkBlue/60">
              <Loader2 className="size-4 animate-spin" />
              Vérification en cours…
            </div>
          ) : null}

          {errorMessage ? (
            <div
              className="mt-3 flex items-start gap-2 rounded-2xl border border-red/20 bg-red/5 px-4 py-3 text-sm text-red"
              role="alert"
            >
              <TriangleAlert className="mt-0.5 size-4 shrink-0" />
              <p>{errorMessage}</p>
            </div>
          ) : null}

          {isGranted ? (
            <p className="mt-3 text-xs leading-5 text-darkBlue/50">
              Si aucune alerte n’apparaît, vérifiez également que les
              notifications de l’application sont autorisées dans les réglages
              de votre appareil.
            </p>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}
