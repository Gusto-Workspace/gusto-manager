import { ChevronLeft, FolderPlus, Plus } from "lucide-react";

function HeaderLabel({ children, onClick, className = "" }) {
  if (typeof onClick === "function") {
    return (
      <button
        type="button"
        onClick={onClick}
        className={`cursor-pointer text-left transition hover:underline ${className}`.trim()}
      >
        {children}
      </button>
    );
  }

  return <span className={className}>{children}</span>;
}

function getBadgeClasses(tone = "neutral", clickable = false) {
  const toneClasses =
    tone === "accent"
      ? "border-blue/15 bg-blue/10 text-blue"
      : "border-darkBlue/10 bg-white/80 text-darkBlue/65";

  const interactiveClasses = clickable
    ? "transition hover:bg-darkBlue/5 hover:text-darkBlue"
    : "";

  return [
    "inline-flex items-center rounded-full border px-3 py-1 text-xs font-semibold",
    toneClasses,
    interactiveClasses,
  ]
    .join(" ")
    .trim();
}

export default function CatalogHeaderDashboardComponent({
  icon,
  title,
  onTitleClick,
  onBack,
  backLabel = "Retour",
  subtitle,
  onSubtitleClick,
  subtitleItems = [],
  badges = [],
  actions = null,
}) {
  const visibleSubtitleItems =
    subtitleItems.length > 0
      ? subtitleItems.filter((item) => item?.label)
      : subtitle
        ? [{ label: subtitle, onClick: onSubtitleClick }]
        : [];
  const visibleBadges = badges.filter((badge) => badge?.label);

  return (
    <div className="flex flex-wrap items-start justify-between gap-4">
      <div className="flex gap-2 items-center min-h-[40px]">
        <div className="flex h-[30px] w-[30px] shrink-0 items-center justify-center">
          {typeof onBack === "function" ? (
            <button
              type="button"
              onClick={onBack}
              aria-label={backLabel}
              title={backLabel}
              className="inline-flex h-[30px] w-[30px] items-center justify-center rounded-xl text-darkBlue/70 transition hover:bg-darkBlue/5 hover:text-darkBlue"
            >
              <ChevronLeft className="size-5" />
            </button>
          ) : (
            icon
          )}
        </div>

        <div className="flex flex-col">
          <h1 className="pl-2 text-xl tablet:text-2xl flex flex-wrap items-center gap-2">
            <HeaderLabel onClick={onTitleClick}>{title}</HeaderLabel>
          </h1>

          {visibleSubtitleItems.length > 0 ? (
            <div className="ml-2 flex flex-wrap items-center gap-2 text-xs font-semibold text-darkBlue/50">
              {visibleSubtitleItems.map((item, index) => (
                <span
                  key={`${item.label}_${index}`}
                  className="inline-flex items-center gap-2"
                >
                  {index > 0 ? (
                    <span className="inline-block h-1.5 w-1.5 rounded-full bg-darkBlue/25" />
                  ) : null}
                  <HeaderLabel onClick={item.onClick}>{item.label}</HeaderLabel>
                </span>
              ))}
            </div>
          ) : null}

          {visibleBadges.length > 0 ? (
            <div className="ml-2 mt-2 flex flex-wrap items-center gap-2">
              {visibleBadges.map((badge) => {
                const clickable = typeof badge.onClick === "function";

                if (clickable) {
                  return (
                    <button
                      key={`${badge.label}_${badge.tone || "neutral"}`}
                      type="button"
                      onClick={badge.onClick}
                      className={getBadgeClasses(badge.tone, true)}
                    >
                      {badge.label}
                    </button>
                  );
                }

                return (
                  <span
                    key={`${badge.label}_${badge.tone || "neutral"}`}
                    className={getBadgeClasses(badge.tone, false)}
                  >
                    {badge.label}
                  </span>
                );
              })}
            </div>
          ) : null}
        </div>
      </div>

      {actions ? <div className="flex flex-wrap gap-1">{actions}</div> : null}
    </div>
  );
}

export function CatalogActionButton({
  label,
  onClick,
  ariaLabel,
  title,
  icon = null,
  className = "",
}) {
  const mobileIcon = icon || <Plus className="size-4" />;

  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={ariaLabel || label}
      title={title || label}
      className={`inline-flex items-center justify-center rounded-full bg-blue text-white shadow-sm hover:bg-blue/90 active:scale-[0.98] transition h-[40px] w-[40px] ${className}`.trim()}
    >
      {mobileIcon}
    </button>
  );
}

export function CatalogCategoryActionButton(props) {
  return (
    <CatalogActionButton {...props} icon={<FolderPlus className="size-4" />} />
  );
}
