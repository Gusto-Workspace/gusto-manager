import { useEffect, useState } from "react";
import axios from "axios";
import { PenLine } from "lucide-react";
import { secondary } from "./register-controls.time-clock.component";
import SignaturePreview from "./signature-preview.time-clock.component";
import { getAuthConfig, getTimeClockActionLabel } from "./time-clock.utils";

const dateTime = new Intl.DateTimeFormat("fr-FR", {
  timeZone: "Europe/Paris", dateStyle: "medium", timeStyle: "short",
});

export default function ClockSessionEvents({ root, sessionId }) {
  const [events, setEvents] = useState(null);
  const [selected, setSelected] = useState(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    axios.get(`${root}/sessions/${sessionId}/events`, getAuthConfig({ signal: controller.signal }))
      .then(({ data }) => {
        if (!controller.signal.aborted) setEvents(data.events);
      })
      .catch(() => {
        if (!controller.signal.aborted) setError(true);
      });
    return () => controller.abort();
  }, [root, sessionId]);

  if (error) return <p role="alert" className="text-sm text-red">Impossible de charger les événements de ce service.</p>;
  if (events === null) return <p role="status" className="text-sm text-darkBlue/70">Chargement des événements…</p>;
  if (!events.length) return <p className="text-sm text-darkBlue/70">Aucun événement de pointage pour ce service.</p>;

  return (
    <ul className="grid gap-2">
      {events.map((event) => (
        <li key={event.id} className="grid gap-3 rounded-xl border border-darkBlue/10 p-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <p className="text-sm font-semibold">{getTimeClockActionLabel(event.type)}</p>
              {event.at && <p className="text-xs text-darkBlue/65">{dateTime.format(new Date(event.at))}</p>}
            </div>
            {event.signature && (
              <button type="button" className={secondary} aria-expanded={selected === event.id}
                onClick={() => setSelected((current) => current === event.id ? null : event.id)}>
                <PenLine size={16} aria-hidden="true" />
                {selected === event.id ? "Masquer la signature" : "Voir la signature"}
              </button>
            )}
          </div>
          {event.signature && selected === event.id && <SignaturePreview signature={event.signature} height={155} />}
        </li>
      ))}
    </ul>
  );
}
