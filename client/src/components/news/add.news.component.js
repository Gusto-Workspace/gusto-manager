import { useContext, useEffect, useState } from "react";
import { useRouter } from "next/router";
import { useForm } from "react-hook-form";
import axios from "axios";
import { useTranslation } from "next-i18next";
import { GlobalContext } from "@/contexts/global.context";
import { NewsSvg, UploadSvg } from "../_shared/_svgs/_index";

export default function AddNewsComponent(props) {
  const { t } = useTranslation("news");
  const { restaurantContext } = useContext(GlobalContext);
  const router = useRouter();
  const [imagePreview, setImagePreview] = useState(null);
  const [selectedFile, setSelectedFile] = useState(null);
  const [fileError, setFileError] = useState(null);

  const {
    register,
    handleSubmit,
    reset,
    watch,
    formState: { errors },
  } = useForm({
    defaultValues: props.news || {},
  });

  const imageFile = watch("image");

  function handleFileChange(e) {
    const file = e.target.files[0];
    if (file) {
      if (file.size > 10 * 1024 * 1024) {
        // 10 MB size limit
        setFileError(t("form.errors.fileSize"));
        setSelectedFile(null);
      } else {
        setFileError(null);
        setSelectedFile(file);
        const reader = new FileReader();
        reader.onload = () => setImagePreview(reader.result);
        reader.readAsDataURL(file);
      }
    } else {
      setSelectedFile(null);
      setImagePreview(null);
    }
  }

  useEffect(() => {
    if (imageFile && imageFile[0]) {
      const reader = new FileReader();
      reader.onload = () => setImagePreview(reader.result);
      reader.readAsDataURL(imageFile[0]);
    } else {
      setImagePreview(null);
    }
  }, [imageFile]);

  async function onSubmit(data) {
    const formData = new FormData();
    formData.append("title", data.title);
    formData.append("description", data.description);
    if (selectedFile) {
      formData.append("image", selectedFile);
      console.log("Image added to formData:", selectedFile);
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
    }
  }

  return (
    <section className="flex flex-col gap-6">
      <hr className="opacity-20" />

      <div className="flex pl-2 gap-2 py-1 items-center">
        <NewsSvg width={30} height={30} fillColor="#131E3690" />

        <h1 className="pl-2 text-2xl flex items-center">
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
            className={`border p-2 rounded-lg w-full ${errors.title ? "border-red" : ""}`}
          />
        </div>

        <div className="flex flex-col gap-2">
          <label>{t("form.labels.description")}</label>

          <textarea
            {...register("description", { required: true })}
            className={`border p-2 rounded-lg w-full ${errors.description ? "border-red" : ""}`}
          />
        </div>

        <div className="flex flex-col gap-2">
          <label>
            {t("form.labels.image")}
            <span className="text-xs opacity-50 ml-2 italic">
              {t("form.labels.optional")}
            </span>
          </label>

          <div className="flex  items-center w-full">
            <label
              htmlFor="image-upload"
              className={`flex flex-col justify-center items-center w-1/2 h-[150px] p-3 border-1 border-dashed rounded-lg cursor-pointer ${
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
            <img
              src={imagePreview}
              alt="Preview"
              className="mt-2 max-w-[400px] h-auto"
            />
          )}
        </div>

        <div className="flex gap-4">
          <button
            type="submit"
            className="bg-blue w-fit text-white px-4 py-2 rounded-lg"
          >
            {t("buttons.save")}
          </button>

          <button
            type="button"
            className="bg-red text-white px-4 py-2 rounded-lg"
            onClick={() => router.back()}
          >
            {t("buttons.cancel")}
          </button>
        </div>
      </form>
    </section>
  );
}
