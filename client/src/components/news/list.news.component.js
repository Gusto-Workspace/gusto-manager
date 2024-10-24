import { useRouter } from "next/router";

// I18N
import { useTranslation } from "next-i18next";

// SVG
import { NewsSvg } from "../_shared/_svgs/_index";

export default function ListNewsComponent(props) {
  const { t } = useTranslation("news");
  const router = useRouter();

  function handleAddClick() {
    router.push(`/news/add`);
  }
  return (
    <section className="flex flex-col gap-6">
      <hr className="opacity-20" />

      <div className="flex justify-between">
        <div className="pl-2 flex gap-2 items-center">
          <NewsSvg width={30} height={30} strokeColor="#131E3690" />

          <h1 className="pl-2 text-2xl">{t("titles.main")}</h1>
        </div>

        <button
          onClick={handleAddClick}
          className="bg-blue px-6 py-2 rounded-lg text-white cursor-pointer"
        >
          {t("buttons.add")}
        </button>
      </div>

      <div className="grid grid-cols-1 tablet:grid-cols-2 desktop:grid-cols-3 ultraWild:grid-cols-4 gap-6">
        {props?.news?.map((data, i) => {
          return (
            <div key={i} className="bg-white rounded-lg drop-shadow-sm p-6 h-fit">
              <h1>{data.title}</h1>
              <div
                dangerouslySetInnerHTML={{ __html: data.description }}
                className="prose"
              />
            </div>
          );
        })}
      </div>
    </section>
  );
}
