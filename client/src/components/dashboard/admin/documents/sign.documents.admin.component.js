import { useContext, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/router";
import axios from "axios";
import { ArrowLeft, Loader2, RotateCcw, CheckCircle2 } from "lucide-react";

import { GlobalContext } from "@/contexts/global.context";

// --- auth helpers ---
function getAdminToken() {
  if (typeof window === "undefined") return null;
  return localStorage.getItem("admin-token");
}
function axiosCfg() {
  const token = getAdminToken();
  return token ? { headers: { Authorization: `Bearer ${token}` } } : null;
}

function formatType(type) {
  if (type === "QUOTE") return "Devis";
  if (type === "INVOICE") return "Facture";
  if (type === "CONTRACT") return "Contrat";
  return "Document";
}

// --- local persistence helpers (NO BDD / NO CLOUD) ---
function sigStorageKey(documentId) {
  return `gm_admin_signature_strokes:${documentId}`;
}

function safeJsonParse(str, fallback) {
  try {
    return JSON.parse(str);
  } catch {
    return fallback;
  }
}

export default function SignDocumentAdminComponent({ documentId }) {
  const router = useRouter();
  const { adminContext } = useContext(GlobalContext);

  const canvasRef = useRef(null);
  const ctxRef = useRef(null);

  const [loading, setLoading] = useState(true);
  const [signing, setSigning] = useState(false);
  const [sending, setSending] = useState(false);

  const [doc, setDoc] = useState(null);
  const [errorMsg, setErrorMsg] = useState("");
  const [successMsg, setSuccessMsg] = useState("");
  const [placeOfSignature, setPlaceOfSignature] = useState("");

  const [signatureReady, setSignatureReady] = useState(false);
  const signatureDataUrlRef = useRef(null);

  const [hasDrawn, setHasDrawn] = useState(false);

  // drawing refs
  const drawingRef = useRef(false);
  const lastPointRef = useRef({ x: 0, y: 0 });
  const activePointerIdRef = useRef(null);

  // ✅ strokes persistence (lightweight)
  // strokes: Array<{ points: Array<{x:number,y:number}> }>
  const strokesRef = useRef([]);
  const currentStrokeRef = useRef(null);

  // ✅ cache strokes loaded from localStorage
  const persistedStrokesRef = useRef(null);

  const isSigned = signatureReady;

  const canDraw = useMemo(() => {
    return doc?.type === "CONTRACT" && !isSigned;
  }, [doc, isSigned]);

  // ----- draw helpers (replay strokes exactly like canvas) -----
  function paintWhiteBackground(width, height) {
    const ctx = ctxRef.current;
    if (!ctx) return;
    ctx.fillStyle = "#FFFFFF";
    ctx.fillRect(0, 0, width, height);
  }

  function redrawAllStrokes(strokes) {
    const ctx = ctxRef.current;
    const canvas = canvasRef.current;
    if (!ctx || !canvas) return;

    // use CSS pixels after ctx already scaled by DPR
    const rect = canvas.getBoundingClientRect();
    const w = rect.width;
    const h = rect.height;

    // reset to white then replay
    ctx.clearRect(0, 0, w, h);
    paintWhiteBackground(w, h);

    ctx.beginPath();
    for (const stroke of strokes || []) {
      const pts = stroke?.points || [];
      if (pts.length === 0) continue;

      // start
      ctx.beginPath();
      ctx.moveTo(pts[0].x, pts[0].y);

      // smooth like your existing quadratic logic
      for (let i = 1; i < pts.length; i++) {
        const prev = pts[i - 1];
        const cur = pts[i];
        const midX = (prev.x + cur.x) / 2;
        const midY = (prev.y + cur.y) / 2;
        ctx.quadraticCurveTo(prev.x, prev.y, midX, midY);
      }
      ctx.stroke();
    }

    setHasDrawn(Boolean(strokes && strokes.length));
  }

  function loadPersistedStrokes() {
    if (typeof window === "undefined") return null;
    if (!documentId) return null;

    const raw = localStorage.getItem(sigStorageKey(documentId));
    if (!raw) return null;

    const parsed = safeJsonParse(raw, null);
    // expected shape: { strokes: [...], savedAt: "...", placeOfSignature?: "..." }
    if (!parsed?.strokes || !Array.isArray(parsed.strokes)) return null;
    return parsed;
  }

  function persistStrokes({ strokes, placeOfSignatureValue }) {
    if (typeof window === "undefined") return;
    if (!documentId) return;

    const payload = {
      strokes: strokes || [],
      savedAt: new Date().toISOString(),
      placeOfSignature: placeOfSignatureValue || "",
    };
    localStorage.setItem(sigStorageKey(documentId), JSON.stringify(payload));
  }

  function clearPersistedStrokes() {
    if (typeof window === "undefined") return;
    if (!documentId) return;
    localStorage.removeItem(sigStorageKey(documentId));
  }

  // ----- load doc -----
  useEffect(() => {
    if (!documentId) return;

    let cancelled = false;

    async function load() {
      setLoading(true);
      setErrorMsg("");
      setSuccessMsg("");

      const cfg = axiosCfg();
      if (!cfg) {
        setErrorMsg("Tu n'es pas connecté (token admin manquant).");
        setLoading(false);
        return;
      }

      try {
        const { data } = await axios.get(
          `${process.env.NEXT_PUBLIC_API_URL}/admin/documents/${documentId}`,
          cfg,
        );

        if (cancelled) return;

        const d = data?.document;
        setDoc(d);
        setPlaceOfSignature(d?.placeOfSignature || "");

        if (d?.type !== "CONTRACT") {
          setErrorMsg("La signature est réservée aux contrats.");
        }
      } catch (e) {
        console.error(e);
        setErrorMsg("Impossible de charger le document.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [documentId]);

  // ✅ load signature strokes from localStorage on mount / doc change
  useEffect(() => {
    if (!documentId) return;
    const persisted = loadPersistedStrokes();
    persistedStrokesRef.current = persisted; // keep cached
  }, [documentId]);

  // ----- canvas init (run when loading becomes false AND canvas exists) -----
  useEffect(() => {
    if (loading) return;

    const canvas = canvasRef.current;
    if (!canvas) return;

    const parent = canvas.parentElement;
    if (!parent) return;

    const dpr = window.devicePixelRatio || 1;
    const width = parent.clientWidth || 600; // fallback
    const height = 220;

    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;
    canvas.style.touchAction = "none"; // iOS
    canvas.width = Math.floor(width * dpr);
    canvas.height = Math.floor(height * dpr);

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.scale(dpr, dpr);

    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.lineWidth = 2.2;
    ctx.strokeStyle = "#131E36";

    // white background
    ctx.fillStyle = "#FFFFFF";
    ctx.fillRect(0, 0, width, height);

    ctxRef.current = ctx;

    // ✅ if there is persisted signature, redraw it (even if doc is SIGNED)
    const persisted = persistedStrokesRef.current || loadPersistedStrokes();
    if (persisted?.strokes?.length) {
      strokesRef.current = persisted.strokes; // keep in memory too
      redrawAllStrokes(persisted.strokes);
    } else {
      strokesRef.current = [];
      setHasDrawn(false);
    }

    // resize observer => keep signature visible after resize
    const ro = new ResizeObserver(() => {
      const newWidth = parent.clientWidth || width;
      canvas.style.width = `${newWidth}px`;
      canvas.style.height = `${height}px`;
      canvas.width = Math.floor(newWidth * dpr);
      canvas.height = Math.floor(height * dpr);

      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.scale(dpr, dpr);

      // redraw background + strokes (IMPORTANT: don’t wipe signature)
      const persisted2 = persistedStrokesRef.current || loadPersistedStrokes();
      const strokesToDraw = persisted2?.strokes?.length
        ? persisted2.strokes
        : strokesRef.current;

      redrawAllStrokes(strokesToDraw || []);
    });

    ro.observe(parent);

    return () => {
      ro.disconnect();
    };
  }, [loading, documentId]);

  // ----- utils -----
  function getCanvasPointFromClient(clientX, clientY) {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    return { x: clientX - rect.left, y: clientY - rect.top };
  }

  function startStrokeAt(x, y) {
    const ctx = ctxRef.current;
    if (!ctx) return;

    drawingRef.current = true;
    lastPointRef.current = { x, y };

    // begin paint
    ctx.beginPath();
    ctx.moveTo(x, y);

    // start new stroke in memory
    const stroke = { points: [{ x, y }] };
    currentStrokeRef.current = stroke;

    setHasDrawn(true);
  }

  function strokeTo(x, y) {
    if (!drawingRef.current) return;
    const ctx = ctxRef.current;
    if (!ctx) return;

    const last = lastPointRef.current;
    const midX = (last.x + x) / 2;
    const midY = (last.y + y) / 2;

    ctx.quadraticCurveTo(last.x, last.y, midX, midY);
    ctx.stroke();

    lastPointRef.current = { x, y };

    // store point
    if (currentStrokeRef.current) {
      currentStrokeRef.current.points.push({ x, y });
    }
  }

  function endStroke() {
    drawingRef.current = false;
    activePointerIdRef.current = null;

    // commit stroke
    if (currentStrokeRef.current?.points?.length) {
      strokesRef.current = [
        ...(strokesRef.current || []),
        currentStrokeRef.current,
      ];
    }
    currentStrokeRef.current = null;
  }

  function clearCanvas() {
    const canvas = canvasRef.current;
    const ctx = ctxRef.current;
    if (!canvas || !ctx) return;

    const rect = canvas.getBoundingClientRect();
    const w = rect.width;
    const h = rect.height;

    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = "#FFFFFF";
    ctx.fillRect(0, 0, w, h);

    setHasDrawn(false);
    strokesRef.current = [];
    currentStrokeRef.current = null;

    // if you want, also clear local saved signature:
    clearPersistedStrokes();
    persistedStrokesRef.current = null;
  }

  // ----- NATIVE EVENTS -----
  useEffect(() => {
    if (loading) return;

    // ✅ if already signed => lock drawing, but still show persisted signature (done by redraw)
    if (!canDraw) return;

    const canvas = canvasRef.current;
    if (!canvas) return;

    const onPointerDown = (e) => {
      if (!canDraw) return;
      e.preventDefault();

      activePointerIdRef.current = e.pointerId;
      try {
        canvas.setPointerCapture(e.pointerId);
      } catch {}

      const p = getCanvasPointFromClient(e.clientX, e.clientY);
      startStrokeAt(p.x, p.y);
    };

    const onPointerMove = (e) => {
      if (!drawingRef.current) return;
      if (
        activePointerIdRef.current !== null &&
        e.pointerId !== activePointerIdRef.current
      )
        return;

      e.preventDefault();
      const p = getCanvasPointFromClient(e.clientX, e.clientY);
      strokeTo(p.x, p.y);
    };

    const onPointerUp = (e) => {
      e.preventDefault();
      try {
        if (e.pointerId != null) canvas.releasePointerCapture(e.pointerId);
      } catch {}
      endStroke();
    };

    const onPointerCancel = (e) => {
      e.preventDefault();
      endStroke();
    };

    // touch fallback (iOS)
    const onTouchStart = (e) => {
      if (!canDraw) return;
      e.preventDefault();
      const t = e.touches?.[0];
      if (!t) return;
      const p = getCanvasPointFromClient(t.clientX, t.clientY);
      startStrokeAt(p.x, p.y);
    };

    const onTouchMove = (e) => {
      if (!drawingRef.current) return;
      e.preventDefault();
      const t = e.touches?.[0];
      if (!t) return;
      const p = getCanvasPointFromClient(t.clientX, t.clientY);
      strokeTo(p.x, p.y);
    };

    const onTouchEnd = (e) => {
      e.preventDefault();
      endStroke();
    };

    // mouse fallback
    const onMouseDown = (e) => {
      if (!canDraw) return;
      e.preventDefault();
      const p = getCanvasPointFromClient(e.clientX, e.clientY);
      startStrokeAt(p.x, p.y);
    };

    const onMouseMove = (e) => {
      if (!drawingRef.current) return;
      e.preventDefault();
      const p = getCanvasPointFromClient(e.clientX, e.clientY);
      strokeTo(p.x, p.y);
    };

    const onMouseUp = (e) => {
      e.preventDefault();
      endStroke();
    };

    canvas.addEventListener("pointerdown", onPointerDown, { passive: false });
    canvas.addEventListener("pointermove", onPointerMove, { passive: false });
    canvas.addEventListener("pointerup", onPointerUp, { passive: false });
    canvas.addEventListener("pointercancel", onPointerCancel, {
      passive: false,
    });

    canvas.addEventListener("touchstart", onTouchStart, { passive: false });
    canvas.addEventListener("touchmove", onTouchMove, { passive: false });
    canvas.addEventListener("touchend", onTouchEnd, { passive: false });
    canvas.addEventListener("touchcancel", onTouchEnd, { passive: false });

    canvas.addEventListener("mousedown", onMouseDown, { passive: false });
    window.addEventListener("mousemove", onMouseMove, { passive: false });
    window.addEventListener("mouseup", onMouseUp, { passive: false });

    return () => {
      canvas.removeEventListener("pointerdown", onPointerDown);
      canvas.removeEventListener("pointermove", onPointerMove);
      canvas.removeEventListener("pointerup", onPointerUp);
      canvas.removeEventListener("pointercancel", onPointerCancel);

      canvas.removeEventListener("touchstart", onTouchStart);
      canvas.removeEventListener("touchmove", onTouchMove);
      canvas.removeEventListener("touchend", onTouchEnd);
      canvas.removeEventListener("touchcancel", onTouchEnd);

      canvas.removeEventListener("mousedown", onMouseDown);
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("mouseup", onMouseUp);
    };
  }, [loading, canDraw]);

  async function handleSign() {
    if (!doc?._id) return;

    setErrorMsg("");
    setSuccessMsg("");

    if (!placeOfSignature.trim()) {
      setErrorMsg("Merci de renseigner le champ “Fait à”.");
      return;
    }

    if (!hasDrawn || !strokesRef.current?.length) {
      setErrorMsg("Signature requise (dessine dans le cadre).");
      return;
    }

    const canvas = canvasRef.current;
    if (!canvas) return;

    // ✅ on prépare la signature localement, sans changer le statut en BDD
    signatureDataUrlRef.current = canvas.toDataURL("image/png");
    setSignatureReady(true);
  }

  async function handleSendContract() {
    if (!doc?._id) return;

    setErrorMsg("");
    setSuccessMsg("");

    const cfg = axiosCfg();
    if (!cfg) {
      setErrorMsg("Tu n'es pas connecté (token admin manquant).");
      return;
    }

    if (!signatureReady || !signatureDataUrlRef.current) {
      setErrorMsg("Valide d’abord la signature avant l’envoi.");
      return;
    }

    setSending(true);
    try {
      const { data } = await axios.post(
        `${process.env.NEXT_PUBLIC_API_URL}/admin/documents/${doc._id}/send`,
        {
          signatureDataUrl: signatureDataUrlRef.current,
          placeOfSignature: placeOfSignature.trim(),
        },
        cfg,
      );

      setDoc((prev) => ({
        ...(prev || {}),
        status: data?.status || "SIGNED",
        pdf: data?.pdf || prev?.pdf,
        signature: { signedAt: data?.sentAt || new Date().toISOString() },
      }));

      adminContext.setDocumentsList((prev) =>
        (prev || []).map((d) =>
          d?._id === doc._id
            ? {
                ...d,
                status: data?.status || "SIGNED",
                pdf: data?.pdf || d?.pdf,
                signature: {
                  signedAt: data?.sentAt || new Date().toISOString(),
                },
                sentAt: data?.sentAt || new Date().toISOString(),
              }
            : d,
        ),
      );

      // ✅ reset complet (re-signer possible si on revient)
      clearPersistedStrokes();
      persistedStrokesRef.current = null;
      strokesRef.current = [];
      currentStrokeRef.current = null;
      signatureDataUrlRef.current = null;
      setSignatureReady(false);

      router.push(`/dashboard/admin/documents/add/${doc._id}`);
    } catch (e) {
      console.error(e);
      setErrorMsg("Erreur lors de l'envoi.");
      if (e?.response?.data?.message) setErrorMsg(e.response.data.message);
    } finally {
      setSending(false);
    }
  }

  useEffect(() => {
    const onRouteChangeStart = () => {
      clearPersistedStrokes();
    };

    router.events.on("routeChangeStart", onRouteChangeStart);
    return () => {
      router.events.off("routeChangeStart", onRouteChangeStart);
    };
  }, [router, documentId]);

  return (
    <section className="flex flex-col gap-4">
      <div className="ml-16 mobile:ml-12 tablet:ml-0 px-4 pt-4">
        <button
          onClick={() => {
            clearPersistedStrokes();
            persistedStrokesRef.current = null;
            strokesRef.current = [];
            currentStrokeRef.current = null;

            router.push(`/dashboard/admin/documents/add/${documentId}`);
          }}
          className="inline-flex items-center gap-2 text-sm h-[38px] font-semibold text-darkBlue hover:underline"
        >
          <ArrowLeft className="size-4" />
          Retour
        </button>
      </div>

      <div className="ml-16 mobile:ml-12 tablet:ml-0">
        <div className="rounded-2xl bg-white/50 border border-darkBlue/10 shadow-sm p-5">
          {loading ? (
            <div className="flex items-center gap-2 text-sm text-darkBlue/70">
              <Loader2 className="size-4 animate-spin" />
              Chargement…
            </div>
          ) : (
            <>
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <h1 className="text-lg font-semibold text-darkBlue">
                    Signer le contrat{" "}
                    <span className="text-darkBlue/50 font-medium">
                      {doc?.docNumber ? `• ${doc.docNumber}` : ""}
                    </span>
                  </h1>
                  <p className="text-sm text-darkBlue/60 mt-1">
                    Client :{" "}
                    <span className="font-semibold">
                      {doc?.party?.restaurantName || "—"}
                    </span>{" "}
                    {doc?.party?.email ? `• ${doc.party.email}` : ""}
                  </p>
                  <p className="text-xs text-darkBlue/50 mt-1">
                    Type : {formatType(doc?.type)} • Statut :{" "}
                    {doc?.status || "-"}
                  </p>
                </div>
              </div>

              <div className="mt-4 flex flex-col">
                <label className="text-sm font-semibold text-darkBlue">
                  Fait à
                </label>
                <input
                  value={placeOfSignature}
                  onChange={(e) => setPlaceOfSignature(e.target.value)}
                  placeholder="Ex : Paris"
                  className="mt-2 max-w-[200px] w-full rounded-xl border border-darkBlue/10 bg-white px-3 py-2 text-sm text-darkBlue outline-none focus:ring-2 focus:ring-blue/20"
                  disabled={!canDraw}
                />
              </div>

              {errorMsg ? (
                <div className="mt-4 rounded-xl border border-red/20 bg-red/10 px-3 py-2 text-sm text-red">
                  {errorMsg}
                </div>
              ) : null}

              {successMsg ? (
                <div className="mt-4 rounded-xl border border-green-200 bg-green-50 px-3 py-2 text-sm text-green-800 flex items-center gap-2">
                  <CheckCircle2 className="size-4" />
                  {successMsg}
                </div>
              ) : null}

              <div className="mt-6">
                <p className="text-sm font-semibold text-darkBlue">Signature</p>

                <div className="mt-3 rounded-2xl border max-w-[500px] border-darkBlue/10 bg-white p-3">
                  <div
                    className="max-w-[500px] w-full"
                    style={{ touchAction: "none" }}
                  >
                    <canvas
                      ref={canvasRef}
                      className="max-w-[500px] w-full rounded-xl border border-darkBlue/10 bg-white"
                      style={{
                        touchAction: "none",
                        display: "block",
                        // ✅ petit feedback visuel quand c'est verrouillé
                        cursor: canDraw ? "crosshair" : "not-allowed",
                        opacity: canDraw ? 1 : 0.95,
                      }}
                    />
                  </div>

                  {canDraw ? (
                    <div className="mt-3 flex flex-wrap gap-2 justify-between">
                      <button
                        type="button"
                        onClick={clearCanvas}
                        disabled={signing || sending}
                        className="inline-flex items-center gap-2 rounded-xl border border-darkBlue/10 bg-white px-3 py-2 text-sm font-semibold text-darkBlue hover:bg-darkBlue/5 disabled:opacity-60"
                      >
                        <RotateCcw className="size-4 text-darkBlue/60" />
                        Effacer
                      </button>

                      <div className="flex flex-wrap gap-2 justify-end">
                        <button
                          type="button"
                          onClick={handleSign}
                          disabled={signing || sending}
                          className="inline-flex items-center justify-center gap-2 rounded-xl bg-blue px-4 py-2 text-white text-sm font-semibold shadow-sm hover:bg-blue/90 disabled:opacity-60"
                        >
                          {signing ? (
                            <>
                              <Loader2 className="size-4 animate-spin" />
                              Signature…
                            </>
                          ) : (
                            "Valider la signature"
                          )}
                        </button>
                      </div>
                    </div>
                  ) : null}
                </div>

                <button
                  type="button"
                  onClick={handleSendContract}
                  disabled={!isSigned || sending || signing}
                  className="inline-flex items-center justify-center gap-2 rounded-xl bg-blue px-4 py-2 mt-3 text-white text-sm font-semibold shadow-sm hover:bg-blue/90 disabled:opacity-60"
                  title={
                    !isSigned
                      ? "Signez le contrat pour activer l’envoi"
                      : "Envoyer le contrat signé"
                  }
                >
                  {sending ? (
                    <>
                      <Loader2 className="size-4 animate-spin" />
                      Envoi…
                    </>
                  ) : (
                    "Envoyer le contrat"
                  )}
                </button>

                <p className="mt-3 text-xs text-darkBlue/60 max-w-[520px]">
                  Le bouton <b>Envoyer le contrat</b> s’active uniquement après
                  validation de <b>Fait à</b> + <b>signature</b>.
                </p>
              </div>
            </>
          )}
        </div>
      </div>
    </section>
  );
}
