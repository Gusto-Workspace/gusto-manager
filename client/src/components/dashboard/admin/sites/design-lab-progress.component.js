export default function DesignLabProgress({ title, progress, children }) {
  if (!progress) return null;
  const value = Math.min(100, Math.max(0, Number(progress.progress) || 0));
  const failed = progress.status === "failed";
  return (
    <section
      className={`rounded-xl border p-4 text-sm ${failed ? "border-red/20 bg-red/5 text-red" : "border-blue/20 bg-blue/5 text-darkBlue"}`}
      role={failed ? "alert" : "status"}
    >
      <div className="flex items-center justify-between gap-3">
        <h2 className="font-semibold">{title}</h2>
        <span className="font-semibold tabular-nums">{value} %</span>
      </div>
      <div
        className="mt-2 h-2 overflow-hidden rounded-full bg-darkBlue/10"
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={value}
        aria-label={title}
      >
        <div
          className={`h-full rounded-full transition-[width] duration-300 ${failed ? "bg-red" : "bg-blue"}`}
          style={{ width: `${value}%` }}
        />
      </div>
      {children}
      <p className="mt-2">{progress.message}</p>
    </section>
  );
}
