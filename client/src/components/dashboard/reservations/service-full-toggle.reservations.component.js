import { Loader2 } from "lucide-react";

export default function ServiceFullToggleReservationsComponent({
  active = false,
  automatic = false,
  hasCurrentService = false,
  saving = false,
  onToggle,
  roundedClassName = "rounded-2xl midTablet:rounded-full",
  heightClassName = "h-[42px] midTablet:h-[40px]",
}) {
  const disabled = saving || automatic || !hasCurrentService;
  const title = !hasCurrentService
    ? "Disponible uniquement pendant un service"
    : automatic
      ? "La fermeture automatique est active pour ce service"
      : active
        ? "Rouvrir les réservations en ligne pour ce service"
        : "Fermer les réservations en ligne pour ce service";

  return (
    <button
      type="button"
      role="switch"
      aria-checked={active}
      aria-label="Complet"
      title={title}
      disabled={disabled}
      onClick={() => onToggle?.(!active)}
      className={[
        "inline-flex items-center gap-2 border px-3 text-xs font-semibold transition",
        roundedClassName,
        heightClassName,
        active
          ? "border-red/20 bg-red/10 text-red"
          : "border-darkBlue/10 bg-white/70 text-darkBlue/65 hover:bg-darkBlue/5",
        disabled ? "cursor-not-allowed opacity-60" : "",
      ].join(" ")}
    >
      <span>Complet</span>
      <span className="inline-flex h-5 w-9 shrink-0 items-center justify-center">
        {saving ? (
          <Loader2 className="size-4 animate-spin" />
        ) : (
          <span
            className={[
              "relative inline-flex h-5 w-9 rounded-full transition",
              active ? "bg-red" : "bg-darkBlue/15",
            ].join(" ")}
          >
            <span
              className={[
                "absolute top-0.5 h-4 w-4 rounded-full bg-white shadow-sm transition",
                active ? "translate-x-[18px]" : "translate-x-0.5",
              ].join(" ")}
            />
          </span>
        )}
      </span>
    </button>
  );
}
