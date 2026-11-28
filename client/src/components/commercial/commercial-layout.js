import Head from "next/head";
import { useRouter } from "next/router";
import { useEffect, useState } from "react";
import { useTranslation } from "next-i18next";
import { AnalyticsSvg, EmployeesSvg, InvoiceSvg, NewsSvg } from "@/components/_shared/_svgs/_index";
import { UserRound, FileSignature, Library, CalendarDays } from "lucide-react";
import { DashboardSidebar } from "@/components/dashboard/admin/_shared/nav/nav.admin.component";
import SimpleSkeleton from "@/components/_shared/skeleton/simple-skeleton.component";
import { commercialApi, getCommercialSession, getCommercialSessionExpiry, sellerLogin, sellerPath, setCommercialSession } from "./commercial-api";
import { CommercialHeaderAccount } from "./commercial-ui";

const items = [
  ["", "dashboard", AnalyticsSvg], ["prospects", "prospects", EmployeesSvg], ["calendar", "calendar", CalendarDays, true], ["quotes", "quotes", NewsSvg],
  ["invoices", "invoices", InvoiceSvg], ["contracts", "contracts", FileSignature, true], ["commissions", "commissions", InvoiceSvg],
  ["resources", "resources", Library, true], ["account", "account", UserRound, true],
].map(([path, key, Icon, line]) => ({
  href: path ? `${sellerPath}/${path}` : sellerPath, key,
  Icon: line ? ({ width, height, strokeColor }) => <Icon width={width} height={height} color={strokeColor} /> : Icon,
}));

export default function CommercialLayout({ title, children }) {
  const router = useRouter();
  const { t } = useTranslation("commercial");
  const [account, setAccount] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => {
    const token = getCommercialSession();
    const expiresAt = getCommercialSessionExpiry(token);
    const controller = new AbortController();

    function endSession() {
      controller.abort();
      setAccount(null);
      setError("");
      router.replace(sellerLogin);
    }

    function expireSession() {
      if (getCommercialSession() !== token) return;
      setCommercialSession(null);
      endSession();
    }

    if (expiresAt <= Date.now()) {
      expireSession();
      return;
    }
    const expirationTimer = window.setTimeout(expireSession, expiresAt - Date.now());

    async function load() {
      if (expiresAt <= Date.now()) {
        expireSession();
        return;
      }
      try {
        const data = await commercialApi("/me", { signal: controller.signal });
        if (controller.signal.aborted) return;
        setAccount(data.account);
        setError("");
      } catch (error) {
        if (controller.signal.aborted || error.status === 401) return;
        setAccount(null);
        setError("L’espace commercial est momentanément indisponible.");
      }
    }
    window.addEventListener("focus", load);
    window.addEventListener("gusto-commercial-session-ended", endSession);
    load();
    return () => {
      window.clearTimeout(expirationTimer);
      controller.abort();
      window.removeEventListener("focus", load);
      window.removeEventListener("gusto-commercial-session-ended", endSession);
    };
  }, [router]);

  async function logout() {
    const token = getCommercialSession();
    let localOnly = false;
    try {
      await commercialApi("/auth/logout", { method: "POST", signal: AbortSignal.timeout(6000) });
    } catch (failure) {
      if (failure.status === 401) return;
      localOnly = true;
    }
    if (getCommercialSession() === token) {
      setCommercialSession(null);
      setAccount(null);
      router.replace(localOnly ? `${sellerLogin}?logout=local` : sellerLogin);
    }
  }

  return (
    <div className="commercial-workspace min-h-screen text-darkBlue">
      <Head><title>{title} · Gusto Manager</title><meta name="robots" content="noindex,nofollow" /></Head>
      <DashboardSidebar items={items.map(({ key, ...item }) => ({ ...item, label: t(`nav.${key}`) }))} root={sellerPath}
        label={t("nav.label")} menuLabel={t("nav.toggle")} logoutLabel={t("nav.logout")} onLogout={logout} />
      <main className={`min-w-0 p-4 tablet:ml-[88px] tablet:p-6 ${account ? "" : "pt-20"}`}>
        {error ? <p role="alert">{error}</p> : account
          ? <CommercialHeaderAccount.Provider value={account}>{children(account)}</CommercialHeaderAccount.Provider>
          : <SimpleSkeleton />}
      </main>
    </div>
  );
}
