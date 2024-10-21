import Link from "next/link";

// I18N
import { useTranslation } from "next-i18next";

export default function ListDishesComponent() {
  const { t } = useTranslation("dishes");

  return (
    <section className="flex flex-col gap-6">
      <hr className="opacity-20" />

      <div className="flex justify-between">
        <h1 className="pl-2 text-2xl">{t("titles.main")}</h1>

        <Link
          href="dishes/add"
          className="bg-blue px-6 py-2 rounded-lg text-white"
        >
          {t("buttons.add")}
        </Link>
      </div>
    </section>
  );
}
