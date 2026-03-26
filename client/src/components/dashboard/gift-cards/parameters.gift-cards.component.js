import { useRouter } from "next/router";
import { useTranslation } from "next-i18next";
import { GiftSvg } from "../../_shared/_svgs/_index";
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
      <div className="flex items-center justify-between gap-4">
        <div className="flex gap-2 items-center min-h-[40px]">
          <div>
            <GiftSvg width={30} height={30} fillColor="#131E3690" />
          </div>

          <div className="flex flex-col">
            <h1 className="pl-2 text-xl flex-wrap tablet:text-2xl flex items-center gap-2">
              <span
                className="cursor-pointer hover:underline"
                onClick={() => router.push("/dashboard/gift-cards")}
              >
                {t("titles.main")}
              </span>
            </h1>
            <span className="ml-2 text-xs font-semibold text-darkBlue/50">
              Paramètres
            </span>
          </div>
        </div>
      </div>

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
