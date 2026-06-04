import {
  Crown,
  PlusCircle,
  RotateCcw,
  Tag,
  UserCheck,
  UserX,
} from "lucide-react";

export const CUSTOMER_TAG_PRIORITY = [
  "very_regular",
  "regular",
  "new",
  "to_reconquer",
  "lost",
];

export const CUSTOMER_TAGS_UI = {
  new: {
    label: "Nouveau",
    cls: "bg-violet/10 text-violet border-violet/20",
    Icon: PlusCircle,
  },
  regular: {
    label: "Régulier",
    cls: "bg-blue/10 text-blue border-blue/20",
    Icon: UserCheck,
  },
  very_regular: {
    label: "Très régulier",
    cls: "bg-green/10 text-green border-green/20",
    Icon: Crown,
  },
  to_reconquer: {
    label: "À reconquérir",
    cls: "bg-[#FF914D22] text-[#B95E1C] border-[#FF914D55]",
    Icon: RotateCcw,
  },
  lost: {
    label: "Perdu",
    cls: "bg-red/10 text-red border-red/20",
    Icon: UserX,
  },
};

export function getPrimaryCustomerTag(tags = []) {
  const normalizedTags = Array.isArray(tags)
    ? tags.map((tag) => String(tag || "").trim()).filter(Boolean)
    : [];

  if (!normalizedTags.length) return "";

  return (
    CUSTOMER_TAG_PRIORITY.find((tag) => normalizedTags.includes(tag)) ||
    normalizedTags[0]
  );
}

export function CustomerTagPill({
  tagKey,
  compact = false,
  className = "",
  iconOnly = false,
}) {
  if (!tagKey) return null;

  const ui = CUSTOMER_TAGS_UI[tagKey] || {
    label: tagKey,
    cls: "bg-darkBlue/5 text-darkBlue/70 border-darkBlue/15",
    Icon: Tag,
  };

  const Icon = ui.Icon || Tag;
  const sizeClass = compact
    ? "gap-1 px-2 py-1 text-[11px]"
    : "gap-2 px-3 py-1 text-xs";

  return (
    <span
      className={`inline-flex items-center rounded-full border font-semibold text-nowrap ${sizeClass} ${ui.cls} ${className}`}
      title={ui.label}
    >
      <Icon className="size-3.5 opacity-80" />
      {iconOnly ? null : ui.label}
    </span>
  );
}
