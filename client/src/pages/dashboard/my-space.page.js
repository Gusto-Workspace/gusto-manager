import { useContext, useState } from "react";
import Head from "next/head";
import SettingsComponent from "@/components/_shared/settings/settings.component";
import Link from "next/link";
import { useRouter } from "next/router";
import { ArrowLeft, Bell, CalendarDays, ChevronRight, Clock3, FileText, GraduationCap, Home, KeyRound, LogOut,
  Mail, Menu, ShieldCheck, UserRound, UsersRound } from "lucide-react";
import { useTranslation } from "next-i18next";
import { serverSideTranslations } from "next-i18next/serverSideTranslations";
import { GlobalContext } from "@/contexts/global.context";
import NavComponent from "@/components/_shared/nav/nav.component";
import NotificationsDrawerComponent from "@/components/_shared/notifications/notifications-drawer.component";
import NoAvailableComponent from "@/components/_shared/options/no-available.options.component";
import { navItemsData } from "@/_assets/data/_index.data";
import { isEmployeeDashboardRouteAllowed } from "@/_assets/utils/dashboard-access";
import DocumentsMySpaceComponent from "@/components/dashboard/my-space/documents.my-space.component";
import PlanningMySpaceComponent, { PersonalShiftCard, PersonalShiftDetails, ScheduleFeedback, usePersonalPlanning } from "@/components/dashboard/my-space/planning.my-space.component";
import DaysOffMySpaceComponent from "@/components/dashboard/my-space/days-off.my-space.component";
import TrainingSessionsMySpaceComponent from "@/components/dashboard/my-space/training-sessions.my-space.component";
import TimeClockMySpaceComponent from "@/components/dashboard/my-space/time-clock.my-space.component";
import { nextPersonalDay, planningDateLabel, resolvePersonalSection } from "@/components/dashboard/my-space/my-space-planning.utils.mjs";

const tabs = [["home", Home], ["planning", CalendarDays], ["requests", Mail], ["account", UserRound]];
const mySpace = (tab) => ({ pathname: "/dashboard/my-space", query: tab === "home" ? {} : { tab } });
const accountSections = new Set(["account", "documents", "hours", "training"]);

const card = "rounded-2xl border border-darkBlue/10 bg-white p-4 midTablet:p-5";
const pageLink = "inline-flex min-h-11 items-center gap-1.5 rounded-lg px-2 text-sm font-semibold text-violet hover:bg-violet/10";


function WorkspaceNavigation({ section }) {
  const { t } = useTranslation("myspace");
  return <nav aria-label={t("workspace.title")}
    className="fixed inset-x-0 bottom-0 z-[110] grid grid-cols-4 gap-1 border-t border-darkBlue/15 bg-white px-2 pt-2 pb-[max(0.5rem,env(safe-area-inset-bottom))] shadow-[0_-6px_22px_rgba(19,30,54,0.08)] tablet:static tablet:mx-0 tablet:w-fit tablet:rounded-2xl tablet:border tablet:p-1.5 tablet:shadow-none">
    {tabs.map(([tab, Icon]) => {
      const active = section === tab || (tab === "account" && accountSections.has(section));
      return <Link aria-current={active ? "page" : undefined} href={mySpace(tab)} key={tab}
        className={`flex min-h-[48px] min-w-0 flex-col items-center justify-center gap-1 rounded-xl px-1 py-1.5 text-center text-[11px] font-semibold leading-tight hover:bg-lightGrey tablet:min-w-[120px] tablet:flex-row tablet:gap-2 tablet:px-4 tablet:text-sm ${active ? "bg-violet/10 text-[#4d399e]" : "text-darkBlue/75"}`}>
        <Icon size={19} aria-hidden="true" />{t(`workspace.${tab}`)}
      </Link>;
    })}
  </nav>;
}

function WorkspaceLink({ href, icon: Icon, title, description }) {
  return <Link href={href} className="flex min-w-0 items-center gap-3 rounded-2xl border border-darkBlue/10 bg-white px-4 py-3.5 transition hover:border-violet/40 focus-visible:outline focus-visible:outline-2 focus-visible:outline-violet">
    <span className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-lightGrey text-violet"><Icon size={20} aria-hidden="true" /></span>
    <span className="min-w-0 flex-1">
      <strong className="block break-words text-sm">{title}</strong>
      {description && <span className="mt-1 block text-xs leading-relaxed text-darkBlue/75">{description}</span>}
    </span>
    <ChevronRight className="shrink-0 text-darkBlue/55" size={18} aria-hidden="true" />
  </Link>;
}

function EmployeeWorkspace({ context, query, section, unread, onNotifications }) {
  const { t, i18n } = useTranslation(["myspace", "common"]);
  const user = context.userConnected;
  const restaurant = context.restaurantData;
  const employeeId = user.id;
  const restaurantId = restaurant._id;
  const [selected, setSelected] = useState(null);
  const access = { restaurantData: restaurant, userConnected: user };
  const canManage = isEmployeeDashboardRouteAllowed("/dashboard/employees", access);
  const schedule = usePersonalPlanning({
    employeeId: ["home", "planning"].includes(section) ? employeeId : null,
    restaurantId, planningRevision: context.planningRevision,
  });
  const upcoming = nextPersonalDay(schedule.shifts);
  const upcomingLabel = upcoming[0] && planningDateLabel(upcoming[0].startDate, i18n.language === "en" ? "en-GB" : "fr-FR", {
    weekday: "long", month: "long", day: "numeric",
  });
  const modules = navItemsData.filter(({ href }) => href !== "/dashboard/my-space" && isEmployeeDashboardRouteAllowed(href, access));
  const links = [
    ["documents", FileText],
    ...(restaurant.options?.employees ? [["hours", Clock3]] : []),
    ...(restaurant.options?.health_control_plan ? [["training", GraduationCap]] : []),
  ];
  return <>
    {section === "home" && <>
      <div className="grid gap-5 midTablet:grid-cols-[minmax(0,1.55fr)_minmax(250px,1fr)]">
        <section className={`${card} grid content-start gap-4`}>
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div><h2 className="text-lg font-semibold">{t("workspace.nextShifts")}</h2>
              {upcomingLabel && <p className="mt-1 text-sm font-medium capitalize text-violet">{upcomingLabel}</p>}
            </div>
            <Link href={mySpace("planning")} className={pageLink}>{t("workspace.openPlanning")}<ChevronRight size={16} aria-hidden="true" /></Link>
          </div>
          <ScheduleFeedback schedule={schedule} />
          {!schedule.error && !schedule.loading && (upcoming.length ? (
            <ul className="grid gap-2 ultraWild:grid-cols-2">{upcoming.map((shift) => <li className="min-w-0" key={shift.id}>
              <PersonalShiftCard shift={shift} onClick={setSelected} />
            </li>)}</ul>
          ) : <p className="rounded-xl bg-lightGrey p-4 text-sm text-darkBlue/75">{t("workspace.emptyUpcoming")}</p>)}
        </section>
        <section className="grid content-start gap-3">
          <button type="button" onClick={onNotifications} className={`${card} flex items-center gap-3 text-left hover:border-violet/40`}>
            <Bell size={21} className="shrink-0 text-violet" aria-hidden="true" />
            <span className="grid gap-0.5"><strong className="text-sm">{t("workspace.notifications")}</strong>
              <span className="text-xs text-darkBlue/75">{unread > 0 ? t("workspace.unread", { count: unread }) : t("workspace.noUnread")}</span>
            </span>
            <ChevronRight size={18} className="ml-auto shrink-0 text-darkBlue/55" aria-hidden="true" />
          </button>
          <WorkspaceLink icon={Mail} href={mySpace("requests")} title={t("workspace.leave")} description={t("workspace.leaveDescription")} />
          <WorkspaceLink icon={FileText} href={mySpace("documents")} title={t("workspace.documents")} />
          {canManage && <WorkspaceLink icon={UsersRound} href="/dashboard/employees" title={t("workspace.teamTools")} description={t("workspace.teamDescription")} />}
        </section>
      </div>
      <PersonalShiftDetails shift={selected} onClose={() => setSelected(null)} />
    </>}
    {section === "planning" && <PlanningMySpaceComponent schedule={schedule}
      canManage={canManage} initialPlanningDate={query.planningDate} />}
    {section === "requests" && <DaysOffMySpaceComponent employeeId={employeeId} restaurantId={restaurantId} />}
    {section === "documents" && <DocumentsMySpaceComponent employeeId={employeeId} restaurantId={restaurantId} />}
    {section === "hours" && (restaurant.options?.employees ? <TimeClockMySpaceComponent restaurantId={restaurantId} /> :
      <p className={card} role="status">{t("workspace.unavailable")}</p>)}
    {section === "training" && (restaurant.options?.health_control_plan ? <TrainingSessionsMySpaceComponent employeeId={employeeId}
      restaurantId={restaurantId} /> : <p className={card} role="status">{t("workspace.unavailable")}</p>)}
    {section === "account" && <>
      <div className="grid gap-3 midTablet:grid-cols-2">
        <WorkspaceLink href="/dashboard/settings#personal-profile" icon={UserRound} title={t("workspace.profile")} description={t("workspace.profileDescription")} />
        <WorkspaceLink href="/dashboard/settings#personal-password" icon={ShieldCheck} title={t("workspace.password")} description={t("workspace.passwordDescription")} />
        {restaurant.options?.employees && <WorkspaceLink href="/dashboard/settings#personal-pin" icon={KeyRound} title={t("workspace.pin")} description={t("workspace.pinDescription")} />}
        {links.map(([key, Icon]) => <WorkspaceLink key={key} href={mySpace(key)} icon={Icon} title={t(`workspace.${key}`)} />)}
      </div>
      {modules.length > 0 && <section className="grid gap-3">
        <h2 className="flex items-center gap-2 text-base font-semibold"><Menu size={18} aria-hidden="true" />{t("workspace.modules")}</h2>
        <div className="grid gap-2 midTablet:grid-cols-2 desktop:grid-cols-3">{modules.map(({ href, label }) =>
          <WorkspaceLink key={href} href={href} icon={href === "/dashboard/employees" ? UsersRound : Menu} title={t(`common:${label}`)} />)}</div>
      </section>}
      <button type="button" className="inline-flex min-h-11 w-fit items-center gap-2 rounded-xl border border-darkBlue/15 bg-white px-4 text-sm font-semibold hover:bg-lightGrey"
        onClick={context.logout}><LogOut size={17} aria-hidden="true" />{t("workspace.logout")}</button>
    </>}
  </>;
}

export default function MySpacePage() {
  const { t } = useTranslation("myspace");
  const { restaurantContext: context } = useContext(GlobalContext);
  const { query, asPath } = useRouter();
  const [open, setOpen] = useState(false);
  const user = context.userConnected;
  if (!context.isAuth) return null;
  if (user && user.role !== "employee") return <NoAvailableComponent dataLoading={context.dataLoading} mySpace />;
  const section = resolvePersonalSection({ ...query, leave: query.leave || asPath.endsWith("#my-leave-requests") });
  const subSection = section !== "account" && accountSections.has(section);
  const restaurant = context.restaurantData;
  const unread = context.unreadCounts?.byModule?.my_planning || 0;
  const showNotifications = () => setOpen(true);
  return <>
    <Head><title>{t("workspace.title")} | Gusto Manager</title></Head>
    <NavComponent />
    <div className="min-h-screen bg-[#f5f4f9] text-darkBlue tablet:ml-[88px]">
      <div className="px-2 tablet:px-4"><SettingsComponent dataLoading={context.dataLoading} setDataLoading={context.setDataLoading}
        closeEditing={context.closeEditing} setRestaurantData={context.setRestaurantData} restaurantData={restaurant} /></div>
      <main className="grid w-full min-w-0 content-start gap-5 px-4 pt-5 pb-[calc(5.5rem+env(safe-area-inset-bottom))] midTablet:px-6 tablet:pb-8">
        <WorkspaceNavigation section={section} />
        <div>
          {subSection && <Link href={mySpace("account")} className={pageLink}><ArrowLeft size={16} aria-hidden="true" />{t("workspace.account")}</Link>}
          <h1 className="text-[clamp(1.55rem,3vw,2.25rem)] font-bold leading-tight tracking-[-0.025em]">
            {section === "home" && user?.firstname ? t("workspace.greeting", { firstname: user.firstname }) : t(`workspace.${section}`)}
          </h1>
        </div>
        {context.dataLoading || !user ? <p role="status" className={card}>{t("workspace.loading")}</p>
          : !restaurant?._id ? <p role="status" className={card}>{t("workspace.selectRestaurant")}</p>
          : <EmployeeWorkspace key={`${restaurant._id}:${user.id}`} context={context} query={query} section={section}
            unread={unread} onNotifications={showNotifications} />}
      </main>
    </div>
    <NotificationsDrawerComponent key={restaurant?._id || "none"} open={open && !context.dataLoading} onClose={() => setOpen(false)}
      notifications={context.notifications} modulesFilter="my_planning" nextCursor={context.notificationsNextCursorByModule?.my_planning}
      loading={context.notificationsLoading} fetchNotifications={context.fetchNotifications} markNotificationRead={context.markNotificationRead}
      markAllRead={context.markAllRead} lastNotificationsSyncRef={context.lastNotificationsSyncRef} />
  </>;
}

export async function getStaticProps({ locale }) {
  return { props: { ...(await serverSideTranslations(locale, ["common", "myspace", "planning"])) } };
}
