import { useRouter } from "next/router";

// I18N
import { useTranslation } from "next-i18next";

export default function ListSubscriptionsAdminComponent() {
  const { t } = useTranslation("admin");
  const router = useRouter();

  function handleAddClick() {
    router.push(`/admin/subscriptions/add`);
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex justify-between">
        <div className="flex gap-2 items-center">
          <h1 className="pl-2 text-2xl flex items-center gap-2">
            <span
              className="cursor-pointer hover:underline"
              onClick={() => router.push("/subscriptions")}
            >
              {t("titles.main")}
            </span>
          </h1>
        </div>

        <button
          onClick={handleAddClick}
          className="bg-blue px-6 py-2 rounded-lg text-white cursor-pointer"
        >
          {t("buttons.add")}
        </button>
      </div>
    </div>
  );
}
