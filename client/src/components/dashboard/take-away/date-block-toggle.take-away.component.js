import { Loader2 } from "lucide-react";

export default function TakeAwayDateBlockToggle({
  active = false,
  saving = false,
  onToggle,
  dateLabel = "",
  roundedClassName = "rounded-2xl",
  heightClassName = "h-[42px]",
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={active}
      aria-label="Mettre en pause les commandes en ligne"
      title={`${active ? "Reprendre" : "Mettre en pause"} les commandes en ligne${
        dateLabel ? ` pour ${dateLabel}` : ""
      }`}
      disabled={saving}
      onClick={() => onToggle?.(!active)}
      className={[
        "inline-flex items-center gap-2 border px-3 text-xs font-semibold transition",
        roundedClassName,
        heightClassName,
        active
          ? "border-red/20 bg-red/10 text-red"
          : "border-darkBlue/10 bg-white/70 text-darkBlue/65 canHover:hover:bg-darkBlue/5",
        saving ? "cursor-not-allowed opacity-60" : "",
      ].join(" ")}
    >
      <span>Pause</span>
      <span className="inline-flex h-5 w-9 shrink-0 items-center justify-center">
        {saving ? (
          <Loader2 className="size-4 animate-spin" />
        ) : (
          <span
            className={`relative inline-flex h-5 w-9 rounded-full transition ${
              active ? "bg-red" : "bg-darkBlue/15"
            }`}
          >
            <span
              className={`absolute top-0.5 h-4 w-4 rounded-full bg-white shadow-sm transition ${
                active ? "translate-x-[18px]" : "translate-x-0.5"
              }`}
            />
          </span>
        )}
      </span>
    </button>
  );
}
