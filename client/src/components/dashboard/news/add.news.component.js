import { useContext, useEffect, useState } from "react";
import { useRouter } from "next/router";

// REACT HOOK FORM
import { useForm } from "react-hook-form";

// AXIOS
import axios from "axios";

// I18N
import { useTranslation } from "next-i18next";

// CONTEXT
import { GlobalContext } from "@/contexts/global.context";

// SVG
import { NewsSvg, RemoveSvg, UploadSvg } from "../../_shared/_svgs/_index";

// COMPONENTS
import TiptapEditor from "../../_shared/editor/tiptatp.editor.component";

export default function AddNewsComponent(props) {
  const { t } = useTranslation("news");
  const { restaurantContext } = useContext(GlobalContext);
  const router = useRouter();
  const [imagePreview, setImagePreview] = useState(null);
  const [selectedFile, setSelectedFile] = useState(null);
  const [fileError, setFileError] = useState(null);
  const [imageToRemove, setImageToRemove] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  const {
    register,
    handleSubmit,
    reset,
    setValue,
    formState: { errors },
  } = useForm({
    defaultValues: {
      title: "",
      description: "",
      image: null,
    },
  });

  const handleDescriptionChange = (value) => {
    setValue("description", value, { shouldDirty: true });
  };

  useEffect(() => {
    if (props.news) {
      reset({
        title: props.news.title || "",
        description: props.news.description || "",
      });
      if (props.news.image) {
        setImagePreview(props.news.image);
      }
    } else {
      reset({
        title: "",
        description: "",
        image: null,
      });
      setImagePreview(null);
    }
  }, [props.news, reset]);

  function handleFileChange(e) {
    const file = e.target.files?.[0];
    if (file) {
      if (file.size > 10 * 1024 * 1024) {
        setFileError(t("form.errors.fileSize"));
        setSelectedFile(null);
      } else {
        setFileError(null);
        setSelectedFile(file);
        setImageToRemove(false);
        const reader = new FileReader();
        reader.onload = () => setImagePreview(reader.result);
        reader.readAsDataURL(file);
      }
    } else {
      setSelectedFile(null);
      setImagePreview(null);
    }
  }

  function handleRemoveImage() {
    setSelectedFile(null);
    setImagePreview(null);
    setImageToRemove(true);
  }

  async function onSubmit(data) {
    setIsLoading(true);
    const formData = new FormData();
    formData.append("title", data.title);
    formData.append("description", data.description || "");
    if (selectedFile) {
      formData.append("image", selectedFile);
    }
    if (imageToRemove) {
      formData.append("removeImage", "true");
    }

    try {
      const apiUrl = props.news
        ? `${process.env.NEXT_PUBLIC_API_URL}/restaurants/${restaurantContext?.restaurantData?._id}/news/${props.news._id}`
        : `${process.env.NEXT_PUBLIC_API_URL}/restaurants/${restaurantContext?.restaurantData?._id}/news`;

      const method = props.news ? "put" : "post";

      const response = await axios[method](apiUrl, formData, {
        headers: {
          "Content-Type": "multipart/form-data",
        },
      });

      restaurantContext.setRestaurantData((prev) => ({
        ...prev,
        news: response.data.restaurant.news,
      }));

      router.push("/dashboard/news");
    } catch (error) {
      console.error("Error adding or editing news:", error);
      setIsLoading(false);
    }
  }

  // ---- Styles communs (alignés sur les autres formulaires) ----
  const cardCls =
    "rounded-2xl border border-darkBlue/10 bg-white/50 px-3 py-3 tablet:px-6 tablet:py-5 shadow-[0_18px_45px_rgba(19,30,54,0.06)] flex flex-col gap-4";
  const fieldWrap = "flex flex-col gap-1 tablet:gap-1.5";
  const labelCls =
    "text-xs font-semibold uppercase tracking-[0.08em] text-darkBlue/70 flex items-center gap-2";
  const inputCls =
    "h-11 w-full rounded-xl border border-darkBlue/10 bg-white/80 px-3 text-sm outline-none transition placeholder:text-darkBlue/40";
  const btnPrimary =
    "inline-flex min-w-[120px] items-center justify-center rounded-xl bg-blue text-white text-sm font-medium px-4 py-2.5 shadow-sm hover:bg-blue/90 transition disabled:opacity-60 disabled:cursor-not-allowed";
  const btnSecondary =
    "inline-flex min-w-[120px] items-center justify-center rounded-xl border border-red bg-red text-white text-sm font-medium px-4 py-2.5 shadow-sm hover:bg-red/90 transition disabled:opacity-60 disabled:cursor-not-allowed";
  const errorTextCls = "text-[11px] text-red mt-0.5";

  return (
    <section className="flex flex-col gap-6">
      <hr className="opacity-20" />

      {/* Header */}
      <div className="flex gap-2 py-1 items-center">
        <NewsSvg
          width={30}
          height={30}
          className="min-h-[30px] min-w-[30px]"
          strokeColor="#131E3690"
        />

        <h1 className="pl-2 text-xl tablet:text-2xl flex items-center flex-wrap text-darkBlue">
          {t("titles.main")} /{" "}
          {props.news ? t("buttons.edit") : t("buttons.add")}
        </h1>
      </div>

      <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-5">
        {/* Carte infos générales */}
        <div className={cardCls}>
          <div className="flex flex-col gap-4">
            {/* Titre */}
            <div className={fieldWrap}>
              <label className={labelCls}>
                {t("form.labels.title")}
                <span className="text-red ml-1">*</span>
              </label>

              <input
                type="text"
                {...register("title", { required: true })}
                className={`${inputCls} ${
                  errors.title ? "border-red ring-1 ring-red/30" : ""
                }`}
                placeholder={t("form.placeholders.title") || "-"}
              />
              {errors.title && (
                <p className={errorTextCls}>{t("form.errors.required")}</p>
              )}
            </div>

            {/* Description (Tiptap) */}
            <div className={fieldWrap}>
              <label className={labelCls}>{t("form.labels.description")}</label>

              <div className="rounded-xl border p-2 midTablet:p-4 border-darkBlue/10 bg-white overflow-hidden">
                <TiptapEditor
                  value={props.news ? props.news.description : ""}
                  onChange={handleDescriptionChange}
                />
              </div>
            </div>
          </div>
        </div>

      {/* Carte image */}
<div className={cardCls}>
  {/* Header */}
  <div className="flex items-center justify-between gap-2 text-darkBlue">
    <div className="flex items-center gap-2">
      <span className="inline-flex h-7 px-3 items-center justify-center rounded-full bg-darkBlue/5 text-[11px] font-semibold uppercase tracking-[0.12em] text-darkBlue">
        {t("form.labels.image")}
      </span>
      <span className="text-[11px] text-darkBlue/40 italic">
        {t("form.labels.optional")}
      </span>
    </div>

    <p className="hidden tablet:block text-[11px] text-darkBlue/45">
      {t("form.labels.imageHelper") ||
        "Format paysage conseillé • JPG ou PNG"}
    </p>
  </div>

  {/* Contenu */}
  <div className="mt-2 grid gap-4 tablet:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)] items-start">
    {/* Zone upload */}
    <div className="flex flex-col gap-2">
      <label className="text-[11px] font-semibold uppercase tracking-[0.08em] text-darkBlue/70">
        {t("Ajouter une image")}
      </label>

      <label
        htmlFor="image-upload"
        className={`
          group flex flex-col justify-center items-center
          w-full min-h-[160px] px-4
          rounded-2xl border-2 border-dashed
          ${
            errors.image || fileError
              ? "border-red/70 bg-red/5"
              : "border-darkBlue/15 bg-white/70 hover:border-blue/50 hover:bg-blue/3"
          }
          cursor-pointer transition
        `}
      >
        <div className="flex flex-col items-center justify-center gap-2 text-center">
          <div className="rounded-full bg-darkBlue/5 p-3 group-hover:bg-darkBlue/10 transition">
            <UploadSvg />
          </div>

          {selectedFile ? (
            <p className="text-sm font-semibold text-darkBlue">
              {t("form.labels.selected")}: {selectedFile.name}
            </p>
          ) : (
            <p className="text-sm font-semibold text-darkBlue">
              {t("form.labels.choose")}
            </p>
          )}

          <p className="text-[11px] text-darkBlue/50">
            {t("form.labels.size")}: 10 MB • JPG / PNG
          </p>
        </div>

        <input
          id="image-upload"
          type="file"
          accept="image/*"
          className="hidden"
          {...register("image")}
          onChange={handleFileChange}
        />
      </label>

      {fileError && <p className={errorTextCls}>{fileError}</p>}
    </div>

    {/* Preview */}
    <div className="flex flex-col gap-2">
      <span className="text-[11px] font-semibold uppercase tracking-[0.08em] text-darkBlue/70">
        {t("Aperçu")}
      </span>

      {imagePreview ? (
        <div className="relative rounded-2xl overflow-hidden border border-darkBlue/10 bg-white/80 shadow-[0_10px_30px_rgba(19,30,54,0.06)]">
          <div className="aspect-[4/3] w-full">
            <img
              src={imagePreview}
              alt="Preview"
              className="h-full w-full object-cover"
            />
          </div>

          {!isLoading && (
            <button
              type="button"
              onClick={handleRemoveImage}
              disabled={isLoading}
              className="absolute inset-0 flex items-center justify-center bg-black/0 hover:bg-black/45 transition"
            >
              <RemoveSvg width={40} height={40} fillColor="white" />
            </button>
          )}
        </div>
      ) : (
        <div className="flex h-[160px] w-full items-center justify-center rounded-2xl border border-dashed border-darkBlue/12 bg-white/60 text-[11px] text-darkBlue/40">
          {t("form.labels.noImage") || "Aucune image sélectionnée"}
        </div>
      )}
    </div>
  </div>
</div>


        {/* Boutons bas de page */}
        <div className="flex flex-col gap-3 tablet:flex-row tablet:justify-start pt-1">
          <button type="submit" className={btnPrimary} disabled={isLoading}>
            {isLoading ? t("buttons.loading") : t("buttons.save")}
          </button>

          <button
            type="button"
            className={btnSecondary}
            onClick={() => router.back()}
            disabled={isLoading}
          >
            {t("buttons.cancel")}
          </button>
        </div>
      </form>
    </section>
  );
}
