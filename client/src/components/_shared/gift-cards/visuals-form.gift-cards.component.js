import { useContext, useEffect, useMemo, useState } from "react";
import axios from "axios";
import {
  Check,
  ImagePlus,
  Loader2,
  Paintbrush,
  Save,
  Star,
  Trash2,
} from "lucide-react";
import { GlobalContext } from "@/contexts/global.context";

export const DEFAULT_GIFT_CARD_VISUAL = {
  visualId: "",
  name: "Visuel par défaut",
  imageUrl: "",
  textColor: "#000000",
  textLayout: "right",
};

export const GIFT_CARD_TEXT_LAYOUT_OPTIONS = [
  { value: "right", label: "Droite" },
  { value: "center", label: "Centre" },
  { value: "left", label: "Gauche" },
];

const GIFT_CARD_PREVIEW_DATA = {
  title: "Carte Cadeau",
  amount: "50 €",
  beneficiaryName: "Martin Dupont",
  senderName: "Paul",
  code: "ZDCRVD",
  validUntil: "02/09/2027",
};

export function getGiftCardVisuals(giftCardSettings) {
  return Array.isArray(giftCardSettings?.visuals)
    ? giftCardSettings.visuals
    : [];
}

export function normalizeGiftCardVisual(visual) {
  if (!visual) return DEFAULT_GIFT_CARD_VISUAL;

  return {
    visualId: String(visual._id || visual.visualId || ""),
    name: visual.name || DEFAULT_GIFT_CARD_VISUAL.name,
    imageUrl: visual.imageUrl || "",
    imagePublicId: visual.imagePublicId || "",
    textColor: /^#[0-9a-fA-F]{6}$/.test(visual.textColor || "")
      ? visual.textColor
      : DEFAULT_GIFT_CARD_VISUAL.textColor,
    textLayout: ["right", "center", "left"].includes(visual.textLayout)
      ? visual.textLayout
      : DEFAULT_GIFT_CARD_VISUAL.textLayout,
  };
}

export function resolveGiftCardVisual(giftCard, giftCardSettings) {
  const visuals = getGiftCardVisuals(giftCardSettings);
  const giftVisual = visuals.find(
    (visual) => String(visual._id) === String(giftCard?.visualId || ""),
  );
  const defaultVisual = visuals.find(
    (visual) =>
      String(visual._id) === String(giftCardSettings?.defaultVisualId || ""),
  );

  return normalizeGiftCardVisual(giftVisual || defaultVisual || visuals[0]);
}

function getPreviewTextPositionClasses(layout) {
  if (layout === "left") return "left-0 items-center text-center";
  if (layout === "center") return "left-1/2 -translate-x-1/2 items-center text-center";
  return "right-0 items-center text-center";
}

export function GiftCardVisualPreview({
  visual,
  className = "",
  amount = GIFT_CARD_PREVIEW_DATA.amount,
  description = "",
  size = "compact",
  fill = false,
}) {
  const normalizedVisual = normalizeGiftCardVisual(visual);
  const textPositionClasses = getPreviewTextPositionClasses(
    normalizedVisual.textLayout,
  );
  const isLarge = size === "large";
  const contentClassName = [
    "absolute inset-y-0 flex w-[62%] flex-col justify-center",
    isLarge ? "gap-[2.2%] px-[3.5%]" : "gap-[1.5%] px-[3%]",
  ].join(" ");
  const titleClassName = [
    isLarge
      ? "text-[clamp(14px,4.4cqw,32px)]"
      : "text-[clamp(8px,4.95cqw,25px)]",
    "leading-none",
  ].join(" ");
  const mainClassName = [
    isLarge
      ? "text-[clamp(9px,2.55cqw,19px)]"
      : "text-[clamp(6px,3cqw,16px)]",
    "leading-tight",
  ].join(" ");
  const amountClassName = [
    isLarge
      ? "text-[clamp(10px,3.85cqw,22px)]"
      : "text-[clamp(7px,4.35cqw,18px)]",
    "leading-tight",
  ].join(" ");
  const descriptionClassName = [
    "max-w-[88%]",
    isLarge
      ? "text-[clamp(9px,3.35cqw,18px)]"
      : "text-[clamp(6.5px,4.2cqw,12px)]",
    "leading-tight",
  ].join(" ");
  const metaClassName = [
    isLarge
      ? "text-[clamp(7px,1.65cqw,13px)]"
      : "text-[clamp(4.5px,1.85cqw,8px)]",
    "leading-tight",
  ].join(" ");

  return (
    <div
      className={`relative ${fill ? "h-full w-full" : "aspect-[16/9]"} overflow-hidden border border-darkBlue/10 bg-darkBlue/5 bg-cover bg-center shadow-sm [container-type:inline-size] ${className}`}
      style={
        normalizedVisual.imageUrl
          ? {
              backgroundImage: `url(${normalizedVisual.imageUrl})`,
              backgroundPosition: "center center",
            }
          : undefined
      }
    >
      {!normalizedVisual.imageUrl ? (
        <div className="absolute inset-0 bg-gradient-to-br from-white via-lightGrey to-darkBlue/10" />
      ) : null}

      <div
        className={`${contentClassName} ${textPositionClasses}`}
        style={{ color: normalizedVisual.textColor }}
      >
        <p className={titleClassName}>{GIFT_CARD_PREVIEW_DATA.title}</p>

        {amount ? (
          <p className={amountClassName}>{amount}</p>
        ) : null}

        {description ? (
          <p className={descriptionClassName}>{description}</p>
        ) : null}

        <p className={mainClassName}>
          <span className="italic">Pour :</span>{" "}
          {GIFT_CARD_PREVIEW_DATA.beneficiaryName}
        </p>

        <p className={mainClassName}>
          <span className="italic">De la part de :</span>{" "}
          {GIFT_CARD_PREVIEW_DATA.senderName}
        </p>

        <div className="mt-[10.8%] flex flex-col gap-[1%]">
          <p className={metaClassName}>Code : {GIFT_CARD_PREVIEW_DATA.code}</p>
          <p className={metaClassName}>
            Valable jusqu&apos;au : {GIFT_CARD_PREVIEW_DATA.validUntil}
          </p>
        </div>
      </div>
    </div>
  );
}

export default function GiftCardVisualsFormComponent() {
  const { restaurantContext } = useContext(GlobalContext);

  const restaurantId = restaurantContext?.restaurantData?._id;
  const giftCardSettings = restaurantContext?.restaurantData?.giftCardSettings;
  const visuals = useMemo(
    () => getGiftCardVisuals(giftCardSettings),
    [giftCardSettings],
  );
  const defaultVisualId = String(giftCardSettings?.defaultVisualId || "");

  const [editingVisual, setEditingVisual] = useState(null);
  const [name, setName] = useState("");
  const [textColor, setTextColor] = useState("#000000");
  const [textLayout, setTextLayout] = useState("right");
  const [imageFile, setImageFile] = useState(null);
  const [imagePreviewUrl, setImagePreviewUrl] = useState("");
  const [saving, setSaving] = useState(false);
  const [actionId, setActionId] = useState("");
  const [errorMessage, setErrorMessage] = useState("");

  const isEditing = Boolean(editingVisual?._id);
  const draftVisual = {
    ...normalizeGiftCardVisual(editingVisual),
    name,
    textColor,
    textLayout,
    imageUrl: imagePreviewUrl || editingVisual?.imageUrl || "",
  };

  useEffect(() => {
    if (!imageFile) {
      setImagePreviewUrl("");
      return undefined;
    }

    const objectUrl = URL.createObjectURL(imageFile);
    setImagePreviewUrl(objectUrl);

    return () => URL.revokeObjectURL(objectUrl);
  }, [imageFile]);

  function resetForm() {
    setEditingVisual(null);
    setName("");
    setTextColor("#000000");
    setTextLayout("right");
    setImageFile(null);
    setImagePreviewUrl("");
    setErrorMessage("");
  }

  function startEdit(visual) {
    setEditingVisual(visual);
    setName(visual.name || "");
    setTextColor(visual.textColor || "#000000");
    setTextLayout(visual.textLayout || "right");
    setImageFile(null);
    setImagePreviewUrl("");
    setErrorMessage("");
  }

  function updateRestaurantData(response) {
    restaurantContext?.setRestaurantData?.(response.data.restaurant);
  }

  async function handleSubmit(event) {
    event.preventDefault();
    if (!restaurantId || saving) return;
    if (!isEditing && !imageFile) {
      setErrorMessage("Ajoutez une image pour créer un visuel.");
      return;
    }

    try {
      setSaving(true);
      setErrorMessage("");

      const formData = new FormData();
      formData.append("name", name);
      formData.append("textColor", textColor);
      formData.append("textLayout", textLayout);
      if (imageFile) formData.append("image", imageFile);

      const url = isEditing
        ? `${process.env.NEXT_PUBLIC_API_URL}/restaurants/${restaurantId}/gifts/visuals/${editingVisual._id}`
        : `${process.env.NEXT_PUBLIC_API_URL}/restaurants/${restaurantId}/gifts/visuals`;

      const response = isEditing
        ? await axios.put(url, formData, {
            headers: { "Content-Type": "multipart/form-data" },
          })
        : await axios.post(url, formData, {
            headers: { "Content-Type": "multipart/form-data" },
          });

      updateRestaurantData(response);
      resetForm();
    } catch (error) {
      setErrorMessage(
        error?.response?.data?.message ||
          "Impossible d’enregistrer ce visuel pour le moment.",
      );
    } finally {
      setSaving(false);
    }
  }

  async function setDefaultVisual(visualId) {
    if (!restaurantId || actionId) return;

    try {
      setActionId(`default-${visualId}`);
      setErrorMessage("");
      const response = await axios.put(
        `${process.env.NEXT_PUBLIC_API_URL}/restaurants/${restaurantId}/gifts/visuals/${visualId}/default`,
      );
      updateRestaurantData(response);
    } catch (error) {
      setErrorMessage(
        error?.response?.data?.message ||
          "Impossible de définir ce visuel par défaut.",
      );
    } finally {
      setActionId("");
    }
  }

  async function deleteVisual(visualId) {
    if (!restaurantId || actionId) return;

    try {
      setActionId(`delete-${visualId}`);
      setErrorMessage("");
      const response = await axios.delete(
        `${process.env.NEXT_PUBLIC_API_URL}/restaurants/${restaurantId}/gifts/visuals/${visualId}`,
      );
      updateRestaurantData(response);
      if (String(editingVisual?._id) === String(visualId)) resetForm();
    } catch (error) {
      setErrorMessage(
        error?.response?.data?.message ||
          "Impossible de supprimer ce visuel.",
      );
    } finally {
      setActionId("");
    }
  }

  return (
    <div className="w-full rounded-3xl border border-darkBlue/10 bg-white/70 shadow-sm">
      <div className="px-2 py-4 mobile:p-4 midTablet:p-6">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <p className="flex items-center gap-2 text-base font-semibold text-darkBlue">
              <Paintbrush className="size-4 shrink-0 opacity-60" />
              Visuels de cartes cadeaux
            </p>
            <p className="text-sm text-darkBlue/60">
              Importez des fonds 16/9, puis associez-les aux cartes cadeaux du
              catalogue.
            </p>
          </div>
        </div>

        {errorMessage ? (
          <div className="mt-4 rounded-2xl border border-red/20 bg-red/10 px-4 py-3 text-sm text-red">
            {errorMessage}
          </div>
        ) : null}

        <form
          onSubmit={handleSubmit}
          className="mt-4 grid grid-cols-1 gap-3 rounded-2xl border border-darkBlue/10 bg-white/60 p-3"
        >
          <div className="grid grid-cols-1 gap-3 midTablet:grid-cols-[1fr_auto_auto]">
            <input
              type="text"
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="Nom du visuel, ex : Saint-Valentin"
              className="h-11 rounded-2xl border border-darkBlue/10 bg-white/80 px-4 text-sm outline-none transition placeholder:text-darkBlue/35 focus:border-blue/60 focus:ring-2 focus:ring-blue/20"
            />

            <label className="inline-flex h-11 items-center gap-2 rounded-2xl border border-darkBlue/10 bg-white/80 px-3 text-sm text-darkBlue/70">
              Texte
              <input
                type="color"
                value={textColor}
                onChange={(event) => setTextColor(event.target.value)}
                className="h-7 w-9 cursor-pointer border-0 bg-transparent p-0"
              />
            </label>

            <select
              value={textLayout}
              onChange={(event) => setTextLayout(event.target.value)}
              className="h-11 rounded-2xl border border-darkBlue/10 bg-white/80 px-4 text-sm outline-none transition focus:border-blue/60 focus:ring-2 focus:ring-blue/20"
            >
              {GIFT_CARD_TEXT_LAYOUT_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  Texte {option.label.toLowerCase()}
                </option>
              ))}
            </select>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <label className="inline-flex h-11 cursor-pointer items-center gap-2 rounded-2xl border border-darkBlue/10 bg-white/80 px-4 text-sm font-semibold text-darkBlue transition hover:bg-darkBlue/5">
              <ImagePlus className="size-4" />
              {imageFile
                ? imageFile.name
                : isEditing
                  ? "Remplacer l’image"
                  : "Importer une image"}
              <input
                type="file"
                accept="image/jpeg,image/png,image/webp"
                onChange={(event) =>
                  setImageFile(event.target.files?.[0] || null)
                }
                className="hidden"
              />
            </label>

            <button
              type="submit"
              disabled={saving}
              className="inline-flex h-11 items-center gap-2 rounded-2xl bg-darkBlue px-4 text-sm font-semibold text-white transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {saving ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <Save className="size-4" />
              )}
              {isEditing ? "Enregistrer" : "Ajouter"}
            </button>

            {isEditing ? (
              <button
                type="button"
                onClick={resetForm}
                className="h-11 rounded-2xl border border-darkBlue/10 bg-white/80 px-4 text-sm font-semibold text-darkBlue transition hover:bg-darkBlue/5"
              >
                Annuler
              </button>
            ) : null}
          </div>

          {(imagePreviewUrl || isEditing) ? (
            <div className="mx-auto mt-1 w-full max-w-[760px]">
              <p className="mb-2 text-xs font-semibold uppercase tracking-[0.14em] text-darkBlue/50">
                Prévisualisation
              </p>
              <GiftCardVisualPreview
                visual={draftVisual}
                description="Dîner découverte"
                size="large"
              />
            </div>
          ) : null}
        </form>

        <div className="mt-4 grid grid-cols-1 gap-3 midTablet:grid-cols-2 desktop:grid-cols-4">
          {visuals.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-darkBlue/15 bg-white/50 p-4 text-sm text-darkBlue/55">
              Aucun visuel importé pour le moment. Les cartes gardent le rendu
              historique tant qu’aucun visuel n’est configuré.
            </div>
          ) : null}

          {visuals.map((visual) => {
            const visualId = String(visual._id);
            const isDefault = visualId === defaultVisualId;

            return (
              <article
                key={visualId}
                className="rounded-2xl border border-darkBlue/10 bg-white/70 p-3 shadow-sm"
              >
                <GiftCardVisualPreview visual={visual} />

                <div className="mt-3 flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-darkBlue">
                      {visual.name || "Visuel carte cadeau"}
                    </p>
                    {/* <p className="mt-1 text-xs text-darkBlue/50">
                      Texte {visual.textLayout || "right"} ·{" "}
                      {visual.textColor || "#000000"}
                    </p> */}
                  </div>

                  {isDefault ? (
                    <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-blue/10 px-2 py-1 text-[11px] font-semibold text-blue">
                      <Check className="size-3" />
                      Défaut
                    </span>
                  ) : null}
                </div>

                <div className="mt-3 flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => startEdit(visual)}
                    className="rounded-xl border border-darkBlue/10 bg-white px-3 py-2 text-xs font-semibold text-darkBlue transition hover:bg-darkBlue/5"
                  >
                    Modifier
                  </button>

                  {!isDefault ? (
                    <button
                      type="button"
                      onClick={() => setDefaultVisual(visualId)}
                      disabled={Boolean(actionId)}
                      className="inline-flex items-center gap-1 rounded-xl border border-darkBlue/10 bg-white px-3 py-2 text-xs font-semibold text-darkBlue transition hover:bg-darkBlue/5 disabled:opacity-60"
                    >
                      {actionId === `default-${visualId}` ? (
                        <Loader2 className="size-3 animate-spin" />
                      ) : (
                        <Star className="size-3" />
                      )}
                      Par défaut
                    </button>
                  ) : null}

                  <button
                    type="button"
                    onClick={() => deleteVisual(visualId)}
                    disabled={Boolean(actionId)}
                    className="ml-auto inline-flex items-center gap-1 rounded-xl border border-red/20 bg-red/10 px-3 py-2 text-xs font-semibold text-red transition hover:bg-red/15 disabled:opacity-60"
                  >
                    {actionId === `delete-${visualId}` ? (
                      <Loader2 className="size-3 animate-spin" />
                    ) : (
                      <Trash2 className="size-3" />
                    )}
                    Supprimer
                  </button>
                </div>
              </article>
            );
          })}
        </div>
      </div>
    </div>
  );
}
