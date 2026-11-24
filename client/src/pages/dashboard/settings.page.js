import { useCallback, useContext, useEffect, useRef, useState } from "react";
import Head from "next/head";
import Link from "next/link";
import { useRouter } from "next/router";
import { ArrowLeft } from "lucide-react";

// I18N
import { serverSideTranslations } from "next-i18next/serverSideTranslations";
import { useTranslation } from "next-i18next";

// AXIOS
import axios from "axios";

// CONTEXT
import { GlobalContext } from "@/contexts/global.context";

// SVG
import { SettingsSvg } from "@/components/_shared/_svgs/settings.svg";

// COMPONENTS
import NavComponent from "@/components/_shared/nav/nav.component";
import SettingsComponent from "@/components/_shared/settings/settings.component";
import GeneralFormSettingsComponent from "@/components/dashboard/settings/general-form.settings.component";
import PasswordFormSettingsComponent from "@/components/dashboard/settings/password-form.settings.component";
import TimeClockPinSettings from "@/components/dashboard/settings/time-clock-pin.settings.component";

export default function SettingsPage() {
  const { t } = useTranslation("");
  const { restaurantContext } = useContext(GlobalContext);
  const router = useRouter();
  const [profile, setProfile] = useState(null);
  const [error, setError] = useState(false);
  const role = restaurantContext?.userConnected?.role;
  const restaurant = restaurantContext?.restaurantData;
  const profileKey = `${role}:${restaurantContext?.userConnected?.id}:${restaurant?._id}`;
  const pending = useRef(null);

  const fetchUserData = useCallback(() => {
    const token = localStorage.getItem("token");
    if (!token) return router.push("/dashboard/login");
    pending.current?.abort();
    const controller = new AbortController();
    pending.current = controller;
    setError(false);

    const url =
      role === "owner"
        ? `${process.env.NEXT_PUBLIC_API_URL}/owner/get-data`
        : `${process.env.NEXT_PUBLIC_API_URL}/employees/me`;

    axios
      .get(url, { signal: controller.signal })
      .then((response) => {
        if (controller.signal.aborted) return;
        setProfile({ key: profileKey, data: role === "owner" ? response.data.owner : response.data.employee });
      })
      .catch((error) => {
        if (controller.signal.aborted) return;
        if (error.response?.status === 401 || error.response?.status === 403) router.replace("/dashboard/login");
        else setError(true);
      });
  }, [role, profileKey, router]);

  useEffect(() => {
    if (!role) return;
    fetchUserData();
    return () => pending.current?.abort();
  }, [role, fetchUserData]);

  if (!restaurantContext.isAuth) return null;

  return (
    <>
      <Head>
        <title>Gusto Manager</title>
      </Head>

      <div>
        <div className="flex">
          <NavComponent />

          <div className="tablet:ml-[88px] bg-lightGrey text-darkBlue flex-1 px-2 p-6 mobile:p-6 mobile:px-6 flex flex-col gap-6 min-h-screen">
            <SettingsComponent
              dataLoading={restaurantContext.dataLoading}
              setDataLoading={restaurantContext.setDataLoading}
              closeEditing={restaurantContext.closeEditing}
              setRestaurantData={restaurantContext.setRestaurantData}
              restaurantData={restaurantContext.restaurantData}
            />

            <hr className="opacity-20" />

            <div className="flex justify-between">
              <div className="flex gap-2 items-center">
                <SettingsSvg width={30} height={30} strokeColor="#131E3690" />

                <h1 className="pl-2 text-2xl">{t("settings:titles.main")}</h1>
              </div>
            </div>

            {role === "employee" && <Link href="/dashboard/my-space?tab=account"
              className="flex min-h-11 w-fit items-center gap-2 rounded-xl bg-white px-4 text-sm font-semibold text-violet">
              <ArrowLeft size={17} aria-hidden="true" />{t("myspace:workspace.account")}
            </Link>}
            <div id="personal-profile" className="scroll-mt-4">
              {error ? <button type="button" onClick={fetchUserData}
                className="min-h-11 rounded-xl border border-darkBlue/15 bg-white px-3 text-sm font-semibold" role="alert">
                {t("myspace:workspace.retry")}
              </button> : profile?.key === profileKey ? <GeneralFormSettingsComponent
                key={profileKey} role={role} userData={profile.data} fetchUserData={fetchUserData} restaurantContext={restaurantContext}
              /> : <p role="status">{t("myspace:workspace.loading")}</p>}
            </div>
            <div id="personal-password" className="scroll-mt-4"><PasswordFormSettingsComponent /></div>
            {role === "employee" && restaurant?.options?.employees && (
              <div id="personal-pin" className="scroll-mt-4"><TimeClockPinSettings key={restaurant._id} restaurant={restaurant} /></div>
            )}
          </div>
        </div>
      </div>
    </>
  );
}

export async function getStaticProps({ locale }) {
  return {
    props: {
      ...(await serverSideTranslations(locale, ["common", "settings", "myspace"])),
    },
  };
}
