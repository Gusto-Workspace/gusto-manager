import { useState, useContext } from "react";
import { useRouter } from "next/router";

// REACT HOOK FORM
import { useForm } from "react-hook-form";

// AXIOS
import axios from "axios";

// CONTEXT
import { GlobalContext } from "@/contexts/global.context";

// I18N
import { useTranslation } from "next-i18next";

// SVG
import { EmployeesSvg, WarningSvg } from "../../_shared/_svgs/_index";

export default function PlanningEmployeesComponent() {
  const { t } = useTranslation("employees");
  const { restaurantContext } = useContext(GlobalContext);
  const router = useRouter();

  return (
    <section className="flex flex-col gap-6">
      <hr className="opacity-20" />

      <div className="flex justify-between flex-wrap gap-4">
        <div className="flex flex-col gap-4">
          <div className="flex items-center gap-2 min-h-[40px]">
            <EmployeesSvg width={30} height={30} fillColor="#131E3690" />

            <h1 className="pl-2 text-xl tablet:text-2xl flex items-center gap-2 flex-wrap">
              <span
                className="cursor-pointer hover:underline"
                onClick={() => router.push("/dashboard/employees")}
              >
                {t("employees:titles.main")}
              </span>
              <span>/</span>
              <span>Planning</span>
            </h1>
          </div>
        </div>
      </div>
    </section>
  );
}
