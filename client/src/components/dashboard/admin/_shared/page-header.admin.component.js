export default function PageHeaderAdminComponent({
  title,
  subtitle = "",
  action = null,
  menuOffset = true,
}) {
  return (
    <div className="relative overflow-hidden rounded-[24px] border border-darkBlue/10 bg-white/90 px-4 py-4 shadow-[0_16px_40px_rgba(19,30,54,0.06)]">
      <div className="pointer-events-none absolute inset-x-0 top-0 h-16 bg-[linear-gradient(180deg,rgba(57,120,255,0.08)_0%,rgba(57,120,255,0)_100%)]" />

      <div
        className={`relative flex min-h-[44px] items-center justify-between gap-3 ${
          menuOffset ? "pl-[56px] tablet:pl-0" : ""
        }`}
      >
        <div className="min-w-0">
          <h1 className="truncate text-[26px] font-semibold leading-none tracking-[-0.03em] text-darkBlue tablet:text-[30px]">
            {title}
          </h1>

          {subtitle ? (
            <p className="mt-2 truncate text-sm font-medium text-darkBlue/45">
              {subtitle}
            </p>
          ) : null}
        </div>

        {action ? <div className="shrink-0">{action}</div> : null}
      </div>
    </div>
  );
}
