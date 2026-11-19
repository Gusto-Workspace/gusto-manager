import { useEffect, useRef, useState } from "react";
import axios from "axios";
import { Eye, EyeOff, KeyRound, RefreshCw } from "lucide-react";
import { useTranslation } from "next-i18next";
import { ClockDialog, primary, secondary } from "../time-clock/register-controls.time-clock.component";
import { getAuthConfig } from "../time-clock/time-clock.utils";

export default function TimeClockPinSettings({ restaurant }) {
  const { t } = useTranslation("settings");
  const [configured, setConfigured] = useState(null);
  const [pin, setPin] = useState(null);
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);
  const lock = useRef(false);
  const endpoint = `${process.env.NEXT_PUBLIC_API_URL}/restaurants/${restaurant._id}/time-clock/me/pin`;

  useEffect(() => {
    const controller = new AbortController();
    axios.get(endpoint, getAuthConfig({ signal: controller.signal })).then(({ data }) => {
      if (!controller.signal.aborted) setConfigured(data.configured);
    }).catch(() => {
      if (!controller.signal.aborted) setError("clockPin.loadError");
    });
    return () => controller.abort();
  }, [endpoint]);

  async function run(operation, fallback) {
    if (lock.current) return;
    lock.current = true;
    setBusy(true);
    setError("");
    try {
      await operation();
    } catch (failure) {
      setError(failure.response?.status === 429 ? "clockPin.cooldown" : fallback);
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }

  function togglePin() {
    if (pin !== null) {
      setPin(null);
      return;
    }
    run(async () => {
      const { data } = await axios.get(endpoint, getAuthConfig({ params: { reveal: "true" } }));
      setConfigured(data.configured);
      setPin(typeof data.pin === "string" ? data.pin : null);
    }, "clockPin.loadError");
  }

  function regenerate() {
    run(async () => {
      await axios.post(`${endpoint}/regenerate`, {}, getAuthConfig());
      setConfigured(true);
      setPin(null);
      setConfirming(false);
      setSaved(true);
    }, "clockPin.saveError");
  }

  return (
    <section className="grid gap-4 rounded-2xl border border-darkBlue/10 bg-white/80 p-5 shadow-[0_18px_45px_rgba(19,30,54,0.06)] tablet:p-6">
      <h2 className="flex items-center gap-2 font-semibold"><KeyRound size={18} />{t("clockPin.title")}</h2>
      <p className="text-sm text-darkBlue/70">{t(configured === false ? "clockPin.setup" : "clockPin.description", { restaurant: restaurant.name })}</p>
      <div className="flex flex-wrap items-center gap-2">
        {configured && <>
          <span className="min-w-24 rounded-xl border border-darkBlue/10 bg-white px-3 py-2 text-center font-mono font-semibold tracking-widest"
            aria-label={pin === null ? t("clockPin.hidden") : undefined}>
            {pin ?? "••••"}
          </span>
          <button type="button" className={secondary} onClick={togglePin} disabled={busy}>
            {pin === null ? <Eye size={17} aria-hidden="true" /> : <EyeOff size={17} aria-hidden="true" />}
            {t(pin === null ? "clockPin.show" : "clockPin.hide")}
          </button>
        </>}
        <button type="button" className={secondary} disabled={busy || configured === null} onClick={() => {
          setError("");
          setSaved(false);
          setConfirming(true);
        }}>
          <RefreshCw size={17} aria-hidden="true" />{t(configured ? "clockPin.regenerate" : "clockPin.generate")}
        </button>
      </div>
      {saved && <p role="status" className="text-sm font-medium text-emerald-800">{t("clockPin.saved")}</p>}
      {error && !confirming && <p role="alert" className="text-sm font-medium text-red">{t(error)}</p>}
      {confirming && <ClockDialog title={t(configured ? "clockPin.regenerate" : "clockPin.generate")}
        onClose={() => { if (!busy) setConfirming(false); }}>
        <div className="grid gap-4">
          <p className="text-sm text-darkBlue/70">{t(configured ? "clockPin.confirmRotate" : "clockPin.confirmGenerate")}</p>
          {error && <p role="alert" className="text-sm text-red">{t(error)}</p>}
          <div className="flex flex-wrap justify-end gap-2">
            <button type="button" className={secondary} disabled={busy} onClick={() => setConfirming(false)}>{t("clockPin.cancel")}</button>
            <button type="button" className={primary} disabled={busy} onClick={regenerate}>{t("clockPin.confirmAction")}</button>
          </div>
        </div>
      </ClockDialog>}
    </section>
  );
}
