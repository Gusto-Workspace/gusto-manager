export function EmptyState({ text }) {
  return (
    <div className="rounded-2xl border border-darkBlue/10 bg-white/60 p-6 text-sm text-darkBlue/55">
      {text}
    </div>
  );
}

export function FormField({ label, hint, error, children }) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-xs font-semibold uppercase tracking-wide text-darkBlue/55">
        {label}
      </span>
      {children}
      {error ? (
        <span className="text-xs font-semibold text-red">{error}</span>
      ) : hint ? (
        <span className="text-xs text-darkBlue/45">{hint}</span>
      ) : null}
    </label>
  );
}

export function ToggleField({
  checked,
  onChange,
  title,
  description,
  disabled = false,
}) {
  return (
    <label
      className={`flex min-h-[76px] items-start gap-3 rounded-xl border border-darkBlue/10 bg-white/70 p-3 transition ${
        disabled ? "cursor-not-allowed opacity-50" : "cursor-pointer"
      }`}
    >
      <input
        type="checkbox"
        className="mt-1"
        checked={checked}
        disabled={disabled}
        onChange={(e) => onChange(e.target.checked)}
      />
      <span className="flex flex-col gap-1">
        <span className="text-sm font-semibold text-darkBlue">{title}</span>
        {description ? (
          <span className="text-xs leading-relaxed text-darkBlue/50">
            {description}
          </span>
        ) : null}
      </span>
    </label>
  );
}
