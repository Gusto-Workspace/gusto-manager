import { useState, useEffect } from "react";
import { useRouter } from "next/router";

// I18N
import { useTranslation } from "next-i18next";

// AXIOS
import axios from "axios";

// SVG
import { CalendarSvg } from "@/components/_shared/_svgs/calendar.svg";

export default function PlanningMySpaceComponent(props) {
  const { t } = useTranslation("reservations");
  const router = useRouter();

  return (
    <section className="flex flex-col gap-6">
      <div className="flex justify-between">
        <div className="flex gap-2 items-center">
          <CalendarSvg
            width={30}
            height={30}
            fillColor="#131E3690"
            strokeColor="#131E3690"
          />

          <h1 className="pl-2 py-1 text-xl tablet:text-2xl">
            {t("documents:titles.main")}
          </h1>
        </div>
      </div>
    </section>
  );
}
