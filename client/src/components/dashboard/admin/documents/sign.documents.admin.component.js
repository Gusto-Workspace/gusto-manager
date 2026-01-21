import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/router";
import axios from "axios";
import { ArrowLeft, Loader2, RotateCcw, CheckCircle2 } from "lucide-react";

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

export default function SignDocumentAdminComponent({ documentId }) {
  const router = useRouter();

  const canvasRef = useRef(null);
  const ctxRef = useRef(null);

  const [loading, setLoading] = useState(true);
  const [signing, setSigning] = useState(false);
  const [sending, setSending] = useState(false);

  const [doc, setDoc] = useState(null);
  const [errorMsg, setErrorMsg] = useState("");
  const [successMsg, setSuccessMsg] = useState("");
  const [placeOfSignature, setPlaceOfSignature] = useState("");

  const [hasDrawn, setHasDrawn] = useState(false);

  // drawing refs
  const drawingRef = useRef(false);
  const lastPointRef = useRef({ x: 0, y: 0 });
  const activePointerIdRef = useRef(null);

  const canSign = useMemo(() => {
    return doc?.type === "CONTRACT" && doc?.status !== "SIGNED";
  }, [doc]);

  const isSigned = useMemo(() => {
    return Boolean(doc?.signature?.signedAt) || doc?.status === "SIGNED";
  }, [doc]);

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
        } else if (d?.status === "SIGNED" && d?.signature?.signedAt) {
          // OK: signé, on peut proposer l'envoi
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

  // ----- canvas init (IMPORTANT: run when loading becomes false AND canvas exists) -----
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
    setHasDrawn(false);

    // optional: resize observer to keep correct size
    const ro = new ResizeObserver(() => {
      const newWidth = parent.clientWidth || width;
      canvas.style.width = `${newWidth}px`;
      canvas.style.height = `${height}px`;
      canvas.width = Math.floor(newWidth * dpr);
      canvas.height = Math.floor(height * dpr);

      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.scale(dpr, dpr);

      // reset background (simple MVP)
      ctx.fillStyle = "#FFFFFF";
      ctx.fillRect(0, 0, newWidth, height);

      setHasDrawn(false);
    });

    ro.observe(parent);

    return () => {
      ro.disconnect();
    };
  }, [loading]);

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
    ctx.beginPath();
    ctx.moveTo(x, y);
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
  }

  function endStroke() {
    drawingRef.current = false;
    activePointerIdRef.current = null;
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
  }

  // ----- NATIVE EVENTS (bind AFTER loading false so canvas exists) -----
  useEffect(() => {
    if (loading) return;

    const canvas = canvasRef.current;
    if (!canvas) return;

    const onPointerDown = (e) => {
      if (!canSign) return;
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
      if (!canSign) return;
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
      if (!canSign) return;
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
  }, [loading, canSign]);

  async function handleSign() {
    if (!doc?._id) return;

    setErrorMsg("");
    setSuccessMsg("");

    if (!placeOfSignature.trim()) {
      setErrorMsg("Merci de renseigner le champ “Fait à”.");
      return;
    }

    if (!hasDrawn) {
      setErrorMsg("Signature requise (dessine dans le cadre).");
      return;
    }

    const cfg = axiosCfg();
    if (!cfg) {
      setErrorMsg("Tu n'es pas connecté (token admin manquant).");
      return;
    }

    const canvas = canvasRef.current;
    if (!canvas) return;

    const signatureDataUrl = canvas.toDataURL("image/png");

    setSigning(true);
    try {
      // 1) Sauver "Fait à"
      await axios.patch(
        `${process.env.NEXT_PUBLIC_API_URL}/admin/documents/${doc._id}`,
        { placeOfSignature: placeOfSignature.trim() },
        cfg,
      );

      // 2) Signer (génère pdf signé + status SIGNED côté back)
      const { data } = await axios.post(
        `${process.env.NEXT_PUBLIC_API_URL}/admin/documents/${doc._id}/sign`,
        { signatureDataUrl },
        cfg,
      );

      setSuccessMsg("Contrat signé ✅ (tu peux maintenant l’envoyer)");

      // ✅ on met le state local en SIGNED (important pour activer "Envoyer")
      setDoc((prev) => ({
        ...(prev || {}),
        status: "SIGNED",
        signature: { signedAt: new Date().toISOString() },
        pdf: data?.pdf || prev?.pdf,
        placeOfSignature: placeOfSignature.trim(),
      }));
    } catch (e) {
      console.error(e);
      setErrorMsg("Erreur lors de la signature.");
      if (e?.response?.data?.message) setErrorMsg(e.response.data.message);
    } finally {
      setSigning(false);
    }
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

    setSending(true);
    try {
      await axios.post(
        `${process.env.NEXT_PUBLIC_API_URL}/admin/documents/${doc._id}/send`,
        {},
        cfg,
      );

      setSuccessMsg("Contrat envoyé ✅");

      setDoc((prev) => ({
        ...(prev || {}),
        sentAt: new Date().toISOString(),
      }));

      setTimeout(() => {
        router.push(`/dashboard/admin/documents/add/${doc._id}`);
      }, 900);
    } catch (e) {
      console.error(e);
      setErrorMsg("Erreur lors de l'envoi.");
      if (e?.response?.data?.message) setErrorMsg(e.response.data.message);
    } finally {
      setSending(false);
    }
  }

  return (
    <section className="flex flex-col gap-4">
      <div className="ml-16 mobile:ml-12 tablet:ml-0 px-4 pt-4">
        <button
          onClick={() =>
            router.push(`/dashboard/admin/documents/add/${documentId}`)
          }
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
                      style={{ touchAction: "none", display: "block" }}
                    />
                  </div>

                  <div className="mt-3 flex flex-wrap gap-2 justify-between">
                    <button
                      type="button"
                      onClick={clearCanvas}
                      disabled={!canSign || signing || sending}
                      className="inline-flex items-center gap-2 rounded-xl border border-darkBlue/10 bg-white px-3 py-2 text-sm font-semibold text-darkBlue hover:bg-darkBlue/5 disabled:opacity-60"
                    >
                      <RotateCcw className="size-4 text-darkBlue/60" />
                      Effacer
                    </button>

                    <div className="flex flex-wrap gap-2 justify-end">
                      <button
                        type="button"
                        onClick={handleSign}
                        disabled={!canSign || signing || sending}
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

                      <button
                        type="button"
                        onClick={handleSendContract}
                        disabled={!isSigned || sending || signing}
                        className="inline-flex items-center justify-center gap-2 rounded-xl bg-blue px-4 py-2 text-white text-sm font-semibold shadow-sm hover:bg-blue/90 disabled:opacity-60"
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
                    </div>
                  </div>
                </div>

                <p className="mt-3 text-xs text-darkBlue/60 max-w-[520px]">
                  Le bouton <b>Envoyer le contrat</b> s’active uniquement après
                  validation de <b>Fait à</b> + <b>signature</b>. (Le backend
                  doit aussi refuser l’envoi si le contrat n’est pas signé.)
                </p>
              </div>
            </>
          )}
        </div>
      </div>
    </section>
  );
}
