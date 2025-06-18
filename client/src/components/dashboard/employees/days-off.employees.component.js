import { useContext } from "react";
import { useRouter } from "next/router";

import { GlobalContext } from "@/contexts/global.context";
import { useTranslation } from "next-i18next";
import { EmployeesSvg } from "../../_shared/_svgs/_index";

export default function DaysOffEmployeesComponent() {
  const { t } = useTranslation("employees");
  const { restaurantContext } = useContext(GlobalContext);
  const router = useRouter();

  return (
    <section className="flex flex-col gap-4 min-w-0">
      {/* ─── En-tête ───────────────────────────────────────────────────────────── */}
      <div className="flex justify-between flex-wrap gap-4">
        <div className="flex flex-col gap-4">
          <div className="flex items-center gap-2 min-h-[40px]">
            <EmployeesSvg width={30} height={30} fillColor="#131E3690" />
            <h1 className="pl-2 text-xl tablet:text-2xl flex items-center gap-2 flex-wrap">
              <span
                className="cursor-pointer hover:underline"
                onClick={() => router.push("/dashboard/employees")}
              >
                {t("titles.main")}
              </span>
              <span>/</span>
              <span
                className="cursor-pointer hover:underline"
                onClick={() => router.push("/dashboard/employees/planning")}
              >
                {t("titles.planning")}
              </span>
              <span>/</span>
              <span>{t("titles.daysOff")}</span>
            </h1>
          </div>
        </div>
      </div>
    </section>
  );
}
