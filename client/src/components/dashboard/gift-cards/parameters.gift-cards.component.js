import { useRouter } from "next/router";
import { useTranslation } from "next-i18next";
import { GiftSvg } from "../../_shared/_svgs/_index";
import CatalogHeaderDashboardComponent from "../_shared/catalog-header.dashboard.component";
import GiftCardSettingsFormComponent, {
  useGiftCardSettingsController,
} from "../../_shared/gift-cards/settings-form.gift-cards.component";

export default function ParametersGiftCardsComponent() {
  const { t } = useTranslation("gifts");
  const router = useRouter();
  const { settings, sectionState, errorMessage, handleChange, saveSettings } =
    useGiftCardSettingsController();

  return (
    <section className="flex flex-col gap-6">
      <hr className="opacity-20 hidden midTablet:block" />

      <CatalogHeaderDashboardComponent
        icon={<GiftSvg width={30} height={30} fillColor="#131E3690" />}
        title={t("titles.main")}
        onTitleClick={() => router.push("/dashboard/gift-cards")}
        onBack={() => router.push("/dashboard/gift-cards")}
        subtitle={t("buttons.parameters", "Paramètres")}
      />

      <div className="max-w-3xl">
        <GiftCardSettingsFormComponent
          settings={settings}
          sectionState={sectionState}
          errorMessage={errorMessage}
          onChange={handleChange}
          onSave={saveSettings}
        />
      </div>
    </section>
  );
}
