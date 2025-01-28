import { useState } from "react";
import dynamic from "next/dynamic";
import { useRouter } from "next/router";

// DATE
import { format } from "date-fns";

// I18N
import { useTranslation } from "next-i18next";

// CALENDAR
const Calendar = dynamic(() => import("react-calendar"), { ssr: false });
import "react-calendar/dist/Calendar.css";

// SVG
import { ReservationSvg } from "../_shared/_svgs/reservation.svg";

export default function ParametersReservationComponent(props) {
  const { t } = useTranslation("reservations");
  const router = useRouter();

  return (
    <section className="flex flex-col gap-6">
      <hr className="opacity-20" />

      <div className="flex gap-4 flex-wrap justify-between">
        <div className="flex gap-2 items-center min-h-[40px]">
          <ReservationSvg
            width={30}
            height={30}
            className="min-h-[30px] min-w-[30px]"
            fillColor="#131E3690"
          />

          <h1 className="pl-2 text-xl tablet:text-2xl flex items-center flex-wrap">
            {t("titles.main")} / {t("buttons.parameters")}
          </h1>
        </div>
      </div>
    </section>
  );
}
