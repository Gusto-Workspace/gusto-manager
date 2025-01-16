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
import { NewsSvg, RemoveSvg, UploadSvg } from "../_shared/_svgs/_index";

// COMPONENTS
import TiptapEditor from "../_shared/editor/tiptatp.editor.component";

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
    setValue("description", value);
  };

  useEffect(() => {
    if (props.news) {
      reset({
        title: props.news.title,
        description: props.news.description,
      });
      if (props.news.image) {
        setImagePreview(props.news.image);
      }
    }
  }, [props.news, reset]);

  function handleFileChange(e) {
    const file = e.target.files[0];
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
    formData.append("description", data.description);
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

      restaurantContext.setRestaurantData(response.data.restaurant);
      router.push("/news");
    } catch (error) {
      console.error("Error adding or editing news:", error);
      setIsLoading(false);
    }
  }

  return (
    <section className="flex flex-col gap-6">
      <hr className="opacity-20" />

      <div className="flex gap-2 py-1 items-center">
        <NewsSvg
          width={30}
          height={30}
          className="min-h-[30px] min-w-[30px]"
           strokeColor="#131E3690"
        />

        <h1 className="pl-2 text-xl tablet:text-2xl flex items-center flex-wrap">
          {t("titles.main")} /{" "}
          {props.news ? t("buttons.edit") : t("buttons.add")}
        </h1>
      </div>

      <form
        onSubmit={handleSubmit(onSubmit)}
        className="bg-white p-6 rounded-lg drop-shadow-sm flex flex-col gap-6"
      >
        <div className="flex flex-col gap-2">
          <label>{t("form.labels.title")}</label>

          <input
            type="text"
            {...register("title", { required: true })}
            className={`border p-2 rounded-lg w-full ${
              errors.title ? "border-red" : ""
            }`}
          />
        </div>

        <div className="flex flex-col gap-2">
          <label>{t("form.labels.description")}</label>

          <TiptapEditor
            value={props.news ? props.news.description : ""}
            onChange={handleDescriptionChange}
          />
        </div>

        <div className="flex flex-col gap-2">
          <label>
            {t("form.labels.image")}
            <span className="text-xs opacity-50 ml-2 italic">
              {t("form.labels.optional")}
            </span>
          </label>

          <div className="flex items-center w-full">
            <label
              htmlFor="image-upload"
              className={`flex flex-col justify-center items-center w-full midTablet:w-1/2 h-[150px] p-3 border-1 border-dashed rounded-lg cursor-pointer ${
                errors.image || fileError ? "border-red" : "border"
              }`}
            >
              <div className="flex flex-col items-center justify-center pt-5 pb-6">
                <UploadSvg />
                {selectedFile ? (
                  <p className="mb-2 text-lg font-semibold">
                    {t("form.labels.selected")}: {selectedFile.name}
                  </p>
                ) : (
                  <p className="mb-2 text-lg font-semibold">
                    {t("form.labels.choose")}
                  </p>
                )}
                <p className="text-xs">{t("form.labels.size")}: 10 MB</p>
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
          </div>

          {imagePreview && (
            <div className="relative mt-2 max-w-[400px] h-auto group">
              <img
                src={imagePreview}
                alt="Preview"
                className="w-full h-auto rounded-lg"
              />

              {!isLoading && (
                <div className="absolute rounded-lg inset-0 bg-black bg-opacity-0 group-hover:bg-opacity-50 flex items-center justify-center  transition-all duration-200">
                  <div
                    onClick={handleRemoveImage}
                    disabled={isLoading}
                    className="cursor-pointer opacity-0 group-hover:opacity-100 transition-opacity duration-200 flex justify-center items-center"
                  >
                    <RemoveSvg width={50} height={50} fillColor="white" />
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        <div className="flex gap-4">
          <button
            type="submit"
            className="bg-blue w-fit text-white px-4 py-2 rounded-lg flex items-center justify-center"
            disabled={isLoading}
          >
            {isLoading ? t("buttons.loading") : t("buttons.save")}
          </button>

          <button
            type="button"
            className="bg-red text-white px-4 py-2 rounded-lg"
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
