// I18N
import { useTranslation } from "next-i18next";

export default function CustomTooltipComponent(props) {
  const { t } = useTranslation("index");

  if (props.active && props.payload?.length) {
    return (
      <div className="custom-tooltip bg-white p-2 shadow-lg rounded-md z-20 whitespace-nowrap">
        <p className="label font-semibold text-sm">{`${t(props.payload[0].name)}`}</p>
      </div>
    );
  }
  return null;
}
