import { useEffect, useState } from "react";
import axios from "axios";
import { useTranslation } from "next-i18next";
import { StudySvg } from "@/components/_shared/_svgs/_index";

function fmtDate(d) {
  try {
    if (!d) return "—";
    const date = new Date(d);
    return new Intl.DateTimeFormat("fr-FR", {
      dateStyle: "medium",
      timeStyle: "short",
    }).format(date);
  } catch {
    return d || "—";
  }
}

function endFromStartAndMinutes(start, minutes) {
  if (!start || !minutes) return null;
  const d = new Date(start);
  d.setMinutes(d.getMinutes() + Number(minutes || 0));
  return d.toISOString();
}

// ——— Statuts autorisés (sans "excused") ———
const STATUS_LABEL = {
  attended: "Présent",
  absent: "Absent",
};

const STATUS_BG_CLASS = {
  attended: "bg-green",
  absent: "bg-red",
};

export default function TrainingSessionsMySpaceComponent(props) {
  const { t } = useTranslation("myspace");
  const [trainingSessions, setTrainingSessions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState({}); // { [sessionId]: boolean }

  // Modale de confirmation
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [toConfirm, setToConfirm] = useState(null);
  // { session, nextStatus: 'attended' | 'absent' }

  useEffect(() => {
    if (confirmOpen) {
      document.body.classList.add("overflow-hidden");
    } else {
      document.body.classList.remove("overflow-hidden");
    }
    return () => document.body.classList.remove("overflow-hidden");
  }, [confirmOpen]);

  useEffect(() => {
    (async () => {
      try {
        const token = localStorage.getItem("token");
        const { data } = await axios.get(
          `${process.env.NEXT_PUBLIC_API_URL}/employees/${props.employeeId}/training-sessions`,
          { headers: { Authorization: `Bearer ${token}` } }
        );
        setTrainingSessions(data.trainingSessions || []);
      } catch (e) {
        console.error(e);
      } finally {
        setLoading(false);
      }
    })();
  }, [props.employeeId]);

  function askConfirm(session, nextVal) {
    const current = session.myStatus || "attended";
    if (nextVal === current) return;
    setToConfirm({ session, nextStatus: nextVal });
    setConfirmOpen(true);
  }

  async function confirmChange() {
    if (!toConfirm) return;
    const { session, nextStatus } = toConfirm;
    const token = localStorage.getItem("token");
    const sessionId = session._id;
    const restaurantId = session.restaurantId;

    setSaving((s) => ({ ...s, [sessionId]: true }));
    try {
      const { data } = await axios.put(
        `${process.env.NEXT_PUBLIC_API_URL}/restaurants/${restaurantId}/training-sessions/${sessionId}`,
        {
          attendanceUpdate: {
            employeeId: props.employeeId,
            status: nextStatus, // "attended" | "absent"
          },
        },
        { headers: { Authorization: `Bearer ${token}` } }
      );

      // Maj locale du statut
      setTrainingSessions((arr) =>
        arr.map((s) =>
          s._id === sessionId ? { ...s, myStatus: data.myStatus } : s
        )
      );
    } catch (e) {
      console.error(e);
      window.alert("Impossible de mettre à jour le statut.");
    } finally {
      setSaving((s) => ({ ...s, [sessionId]: false }));
      setConfirmOpen(false);
      setToConfirm(null);
    }
  }

  function cancelChange() {
    setConfirmOpen(false);
    setToConfirm(null);
  }

  return (
    <section className="flex flex-col gap-6">
      {/* En-tête */}
      <div className="flex justify-between items-center">
        <div className="flex gap-2 items-center">
          <StudySvg
            width={30}
            height={30}
            fillColor="#131E3690"
            strokeColor="#131E3690"
          />
          <h1 className="pl-2 py-1 text-xl tablet:text-2xl">Mes formations</h1>
        </div>
      </div>

      {/* Liste */}
      <div>
        {loading ? (
          <p className="text-center italic">Chargement…</p>
        ) : trainingSessions.length === 0 ? (
          <p className="text-center italic">Aucune formation</p>
        ) : (
          <ul className="space-y-2">
            {trainingSessions.map((tra) => {
              const title = tra.title || tra.topic || "Formation";
              const endISO = endFromStartAndMinutes(
                tra.date,
                tra.durationMinutes
              );
              const myStatus = tra.myStatus || "attended"; // défaut Présent
              const statusBgCls = STATUS_BG_CLASS[myStatus] || "";

              return (
                <li key={tra._id} className="p-4 bg-white rounded-lg shadow">
                  <div className="flex justify-between gap-12">
                    <div className="flex flex-col">
                      <h3 className="font-medium">{title}</h3>

                      <div className="text-sm text-gray-600">
                        {tra.date && <>Le {fmtDate(tra.date)}</>}
                        {endISO && <> · Fin estimée : {fmtDate(endISO)}</>}
                        {tra.location && <> · {tra.location}</>}
                        {tra.provider && <> · {tra.provider}</>}
                      </div>

                      {tra.myNotes && (
                        <p className="text-sm italic line-clamp-2">
                          - {tra.myNotes}
                        </p>
                      )}
                    </div>

                    {/* Select statut (vert/rouge) */}
                    <label className="text-sm flex items-center gap-2">
                      <select
                        className={`text-white rounded px-2 py-1 ${statusBgCls}`}
                        value={myStatus}
                        disabled={!!saving[tra._id]}
                        onChange={(e) => askConfirm(tra, e.target.value)}
                      >
                        <option value="attended">Présent</option>
                        <option value="absent">Absent</option>
                      </select>
                    </label>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {/* Modale de confirmation (personnalisée) */}
      {confirmOpen && toConfirm && (
        <div className="fixed inset-0 flex items-center justify-center z-[100]">
          <div
            className="absolute inset-0 bg-black bg-opacity-40"
            onClick={cancelChange}
          />
          <div className="bg-white p-6 rounded-lg shadow-lg z-10 w-[350px] text-center">
            <h2 className="text-lg font-semibold mb-4">Confirmer le statut</h2>

            {toConfirm.nextStatus === "absent" ? (
              <p className="mb-4 text-balance">
                Vous serez considéré comme <strong>absent</strong> pour cette
                formation.
              </p>
            ) : (
              <p className="mb-4 text-balance">
                Vous confirmez votre présence à la formation&nbsp;?
              </p>
            )}

            <div className="flex justify-center gap-4">
              <button
                type="button"
                onClick={confirmChange}
                className="px-4 py-2 bg-blue text-white rounded-lg"
              >
                {toConfirm.nextStatus === "absent" ? "Confirmer" : "Oui"}
              </button>
              <button
                type="button"
                onClick={cancelChange}
                className="px-4 py-2 bg-red text-white rounded-lg"
              >
                Annuler
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
