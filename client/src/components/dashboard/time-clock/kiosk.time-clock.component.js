import { useCallback, useEffect, useRef, useState } from "react";
import { ArrowLeft, Check, Clock3, Delete, LogIn, LogOut, Pause, PenLine, Play, Wifi, WifiOff } from "lucide-react";
import SignaturePad from "./signature-pad.time-clock.component";
import {
  clockDeviceQueueCounts, forgetClockVault, getClockDevice, identifyClockEmployee,
  isClockDeviceRevoked, isClockNetworkError, pairClockDevice, recordClockPunch,
  refreshClockVault, syncClockDevice,
} from "./time-clock.device";
import { emitTimeClockRefresh, getTimeClockSituationLabel, TIME_CLOCK_ACTIONS } from "./time-clock.utils";

const dateFormat = new Intl.DateTimeFormat("fr-FR", { dateStyle: "full", timeZone: "Europe/Paris" });
const timeFormat = new Intl.DateTimeFormat("fr-FR", { hour: "2-digit", minute: "2-digit", timeZone: "Europe/Paris" });
const actions = {
  [TIME_CLOCK_ACTIONS.CLOCK_IN]: { label: "Arrivée", icon: LogIn },
  [TIME_CLOCK_ACTIONS.CLOCK_OUT]: { label: "Départ", icon: LogOut },
  [TIME_CLOCK_ACTIONS.BREAK_START]: { label: "Début de pause", icon: Pause },
  [TIME_CLOCK_ACTIONS.BREAK_END]: { label: "Fin de pause", icon: Play },
};
const primary = "inline-flex min-h-14 items-center justify-center gap-3 rounded-2xl bg-darkBlue px-6 py-3 font-semibold text-white transition hover:bg-blue focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-blue disabled:opacity-50";
const secondary = "inline-flex min-h-12 items-center justify-center gap-2 rounded-2xl border border-darkBlue/15 bg-white px-4 py-2 font-semibold transition hover:bg-lightGrey focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue disabled:opacity-50";

export default function TimeClockKiosk() {
  const [device, setDevice] = useState(null);
  const [ready, setReady] = useState(false);
  const [pairing, setPairing] = useState(null);
  const [now, setNow] = useState(null);
  const [online, setOnline] = useState(true);
  const [reachable, setReachable] = useState(true);
  const [blocked, setBlocked] = useState(false);
  const [counts, setCounts] = useState({ pending: 0, refused: 0 });
  const [phase, setPhase] = useState("home");
  const [pin, setPin] = useState("");
  const [identity, setIdentity] = useState(null);
  const [action, setAction] = useState("");
  const [strokes, setStrokes] = useState([]);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const requestVersion = useRef(0);
  const inputLock = useRef(false);
  const synchronizing = useRef(false);
  const pinDialog = useRef(null);
  const isConnected = online && reachable;

  const goHome = useCallback(() => {
    requestVersion.current += 1;
    inputLock.current = false;
    setPhase("home");
    setPin("");
    setIdentity(null);
    setAction("");
    setStrokes([]);
    setError("");
    setBusy(false);
  }, []);

  useEffect(() => {
    let mounted = true;
    const code = new URLSearchParams(window.location.hash.slice(1)).get("association");
    if (code) {
      setPairing(code);
      window.history.replaceState(window.history.state, "", window.location.pathname + window.location.search);
    }
    getClockDevice()
      .then((stored) => { if (mounted) setDevice(stored); })
      .catch(() => { if (mounted) setError("Le stockage de la tablette est inaccessible."); })
      .finally(() => { if (mounted) setReady(true); });
    return () => { mounted = false; };
  }, []);

  useEffect(() => {
    const updateClock = () => setNow(new Date());
    const updateConnection = () => setOnline(navigator.onLine);
    updateClock();
    updateConnection();
    const interval = window.setInterval(updateClock, 1000);
    window.addEventListener("online", updateConnection);
    window.addEventListener("offline", updateConnection);
    return () => {
      window.clearInterval(interval);
      window.removeEventListener("online", updateConnection);
      window.removeEventListener("offline", updateConnection);
    };
  }, []);

  useEffect(() => {
    if (phase === "home") return;
    function onVisibility() {
      if (document.hidden) goHome();
    }
    const timer = window.setTimeout(goHome, 75_000);
    document.addEventListener("visibilitychange", onVisibility);
    if (phase === "pin") pinDialog.current?.focus();
    return () => {
      window.clearTimeout(timer);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [goHome, phase]);

  useEffect(() => {
    if (!notice) return;
    const timer = window.setTimeout(() => setNotice(""), 5200);
    return () => window.clearTimeout(timer);
  }, [notice]);

  const refreshCounts = useCallback(async (active) => {
    setCounts(await clockDeviceQueueCounts(active));
  }, []);

  const handleDeviceError = useCallback(async (error, current) => {
    if (isClockDeviceRevoked(error)) {
      goHome();
      setBlocked(true);
      setError(error.response.data.message);
      await forgetClockVault(current);
    } else if (isClockNetworkError(error)) {
      setReachable(false);
    }
  }, [goHome]);

  const synchronize = useCallback(async (current, refreshVault = true) => {
    if (synchronizing.current) return null;
    synchronizing.current = true;
    try {
      const result = await syncClockDevice(current);
      if (result.accepted.length) emitTimeClockRefresh();
      if (result.error) {
        await handleDeviceError(result.error, current);
      } else if (refreshVault) {
        await refreshClockVault(current);
        setReachable(true);
      }
      return result;
    } catch (error) {
      await handleDeviceError(error, current);
      return null;
    } finally {
      synchronizing.current = false;
      await refreshCounts(current).catch(() => setNotice("Vérifiez le stockage de la tablette."));
    }
  }, [handleDeviceError, refreshCounts]);

  useEffect(() => {
    if (!device) return;
    refreshCounts(device).catch(() => setError("Impossible de lire les pointages conservés sur la tablette."));
    if (!online || blocked || pairing !== null) return;
    synchronize(device);
    const timer = window.setInterval(() => synchronize(device), 45_000);
    return () => window.clearInterval(timer);
  }, [blocked, device, online, pairing, refreshCounts, synchronize]);

  async function enroll(event) {
    event.preventDefault();
    if (inputLock.current || !pairing?.trim()) return;
    inputLock.current = true;
    setBusy(true);
    setError("");
    try {
      const next = await pairClockDevice(pairing.trim());
      setDevice(next);
      setBlocked(false);
      setReachable(true);
      setPairing(null);
    } catch (failure) {
      setError(failure.response?.data?.message || failure.message || "Impossible d’associer cette tablette.");
    } finally {
      inputLock.current = false;
      setBusy(false);
    }
  }

  async function enterDigit(digit) {
    if (inputLock.current || pin.length >= 4) return;
    const digits = pin + digit;
    setPin(digits);
    setError("");
    if (digits.length < 4) return;
    inputLock.current = true;
    setBusy(true);
    const version = requestVersion.current;
    try {
      const next = await identifyClockEmployee(device, digits, online);
      if (version !== requestVersion.current) return;
      setIdentity(next);
      setPhase("actions");
    } catch (failure) {
      if (version !== requestVersion.current) return;
      await handleDeviceError(failure, device);
      setError(failure.response?.data?.message || failure.message);
    } finally {
      if (version === requestVersion.current) {
        setPin("");
        setBusy(false);
        inputLock.current = false;
      }
    }
  }

  function handleKey(event) {
    if (event.key === "Escape" && (phase !== "signature" || !busy)) goHome();
    if (phase !== "pin" || event.altKey || event.ctrlKey || event.metaKey) return;
    if (/^[0-9]$/.test(event.key)) {
      event.preventDefault();
      enterDigit(event.key);
    }
    if (event.key === "Backspace") {
      event.preventDefault();
      if (!inputLock.current) setPin((value) => value.slice(0, -1));
    }
  }

  async function confirmPunch() {
    if (inputLock.current || !strokes.some((stroke) => stroke.points.length > 1)) return;
    if (Date.now() >= identity.expiresAt) {
      goHome();
      setNotice("Identification expirée. Saisissez à nouveau votre PIN.");
      return;
    }
    inputLock.current = true;
    setBusy(true);
    setError("");
    const version = requestVersion.current;
    try {
      const id = await recordClockPunch(device, identity, action, strokes);
      goHome();
      setNotice("Pointage conservé sur la tablette.");
      await refreshCounts(device);
      if (!online) return;
      const result = await synchronize(device, false);
      if (result?.accepted.includes(id)) setNotice("Pointage enregistré.");
      if (result?.refused.includes(id)) setNotice("Pointage conservé pour régularisation.");
    } catch {
      if (version === requestVersion.current) {
        setError("Le pointage n’a pas pu être conservé. Réessayez.");
        setBusy(false);
        inputLock.current = false;
      }
    }
  }

  const connectionIcon = isConnected ? <Wifi size={17} /> : <WifiOff size={17} />;
  const employee = identity?.kiosk.employee;
  const showPairing = ready && (!device || blocked || pairing !== null);
  return (
    <main className="min-h-[100dvh] bg-[#f4f6f8] px-4 py-5 text-darkBlue sm:px-8" onKeyDown={handleKey}>
      <div className="mx-auto flex min-h-[calc(100dvh-2.5rem)] max-w-5xl flex-col">
        <header className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2 text-lg font-bold sm:text-xl">
            <span className="grid size-10 place-items-center rounded-xl bg-darkBlue text-white"><Clock3 size={22} /></span>
            Gusto <span className="font-medium text-darkBlue/65">Pointeuse</span>
          </div>
          <div role="status" className={`inline-flex items-center gap-2 whitespace-nowrap rounded-full px-3 py-2 text-sm font-semibold ${isConnected ? "bg-emerald-100 text-emerald-900" : "bg-amber-100 text-amber-900"}`}>
            {connectionIcon} {isConnected ? "En ligne" : "Hors ligne"}
          </div>
        </header>

        {!ready ? <p className="m-auto text-sm" role="status">Chargement de la Pointeuse…</p> : showPairing ? (
          <section className="m-auto w-full max-w-lg rounded-3xl border border-darkBlue/10 bg-white p-6 sm:p-8">
            <h1 className="text-2xl font-bold">Associer cette tablette</h1>
            <p className="mt-3 text-sm text-darkBlue/70">Utilisez le lien d’association généré dans la Pointeuse du dashboard Gusto.</p>
            <form onSubmit={enroll} className="mt-5 flex flex-col gap-4">
              <label className="grid gap-2 text-sm font-semibold">Code d’association
                <input type="password" autoComplete="off" value={pairing ?? ""} onChange={(event) => setPairing(event.target.value)}
                  spellCheck={false} maxLength={32} className="rounded-xl border border-darkBlue/20 px-3 py-3" />
              </label>
              {error && <p role="alert" className="text-sm text-red">{error}</p>}
              <button className={primary} disabled={busy || !online || !pairing?.trim()}>Associer la tablette</button>
              {device && !blocked && <button type="button" className={secondary} onClick={() => { setPairing(null); setError(""); }}>Annuler</button>}
            </form>
          </section>
        ) : phase === "home" ? (
          <div className="m-auto flex w-full flex-col items-center justify-center gap-5 py-8 text-center">
            <div className="grid justify-items-center">
              <p className="text-lg font-medium capitalize text-darkBlue/65 sm:text-2xl">{now ? dateFormat.format(now) : ""}</p>
              <h1 className="text-[clamp(5rem,18vw,11rem)] font-semibold leading-none tabular-nums">
                <span className="inline-block pe-[0.055em] tracking-[-0.055em]">{now ? timeFormat.format(now) : "–:–"}</span>
              </h1>
            </div>
            <button type="button" className={`${primary} mt-2 w-full max-w-sm !min-h-24 !rounded-3xl text-3xl shadow-lg`}
              onClick={() => { setNotice(""); setError(""); setPhase("pin"); }}>
              <PenLine size={32} /> Signer
            </button>
            {notice && <p role="status" className="flex items-center gap-2 rounded-xl bg-white px-4 py-2 font-medium"><Check size={17} />{notice}</p>}
          </div>
        ) : (
          <section className="mx-auto my-auto w-full max-w-lg py-5" ref={pinDialog} tabIndex={-1}>
            <div className="rounded-3xl border border-darkBlue/10 bg-white p-5 shadow-sm sm:p-7">
              <button className="flex min-h-10 items-center gap-2 text-sm font-semibold text-darkBlue/70" type="button"
                onClick={goHome} disabled={phase === "signature" && busy}><ArrowLeft size={18} /> Annuler</button>
              {phase === "pin" && <>
                <h1 className="mt-2 text-center text-2xl font-bold">Saisissez votre code PIN</h1>
                <div className="my-4 flex justify-center gap-4" role="status" aria-label={`${pin.length} chiffre(s) saisi(s) sur 4`}>
                  {Array.from({ length: 4 }, (_, index) => <span key={index} className={`size-3 rounded-full border border-darkBlue/40 ${index < pin.length ? "bg-darkBlue" : "bg-transparent"}`} />)}
                </div>
                <div className="grid grid-cols-3 gap-2">
                  {[1, 2, 3, 4, 5, 6, 7, 8, 9, "", 0].map((value) => value === "" ? <span key="empty" /> :
                    <button key={value} type="button" className={`${secondary} touch-manipulation !min-h-[3.25rem] text-2xl`}
                      disabled={busy} onClick={() => enterDigit(String(value))}>{value}</button>)}
                  <button type="button" aria-label="Effacer le dernier chiffre" className={secondary} disabled={busy || !pin}
                    onClick={() => setPin((value) => value.slice(0, -1))}><Delete size={21} /></button>
                </div>
                {busy && <p role="status" className="mt-3 text-center text-sm">Vérification du code…</p>}
              </>}
              {phase === "actions" && <>
                <h1 className="mt-3 text-2xl font-bold">{employee?.firstname} {employee?.lastname}</h1>
                <p className="mt-1 text-sm text-darkBlue/65">{getTimeClockSituationLabel(identity.kiosk.state.situation)}</p>
                <div className="mt-6 grid gap-3">
                  {identity.kiosk.state.availableActions.map((type) => {
                    const { icon: Icon, label } = actions[type];
                    return <button type="button" key={type} className={`${primary} !justify-start`}
                      onClick={() => { setAction(type); setPhase("signature"); }}><Icon size={21} />{label}</button>;
                  })}
                </div>
              </>}
              {phase === "signature" && <>
                <h1 className="my-3 text-2xl font-bold">{actions[action].label}</h1>
                <SignaturePad height={155} onChange={setStrokes} disabled={busy} />
                <button type="button" className={`${primary} mt-4 w-full`} onClick={confirmPunch}
                  disabled={busy || !strokes.some((stroke) => stroke.points.length > 1)}>
                  <Check size={20} /> Confirmer le pointage
                </button>
              </>}
              {error && <p role="alert" className="mt-4 text-center text-sm font-medium text-red">{error}</p>}
            </div>
          </section>
        )}
        {(counts.pending > 0 || counts.refused > 0) && <p role="status" className="mt-4 text-center text-sm font-medium text-darkBlue/70">
          {counts.pending > 0 && `${counts.pending} pointage(s) en attente de synchronisation.`}
          {counts.pending > 0 && counts.refused > 0 && " "}
          {counts.refused > 0 && `${counts.refused} pointage(s) à régulariser depuis le dashboard sur cet appareil.`}
        </p>}
      </div>
    </main>
  );
}
