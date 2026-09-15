import Head from "next/head";
import Image from "next/image";
import { useRouter } from "next/router";
import { useEffect, useMemo, useRef, useState } from "react";
import axios from "axios";
import SignatureCanvas from "react-signature-canvas";
import {
  CheckCircle2,
  ExternalLink,
  FileSignature,
  Loader2,
  RotateCcw,
  ShieldCheck,
} from "lucide-react";
import { serverSideTranslations } from "next-i18next/serverSideTranslations";

function money(value, currency = "EUR") {
  try {
    return new Intl.NumberFormat("fr-FR", {
      style: "currency",
      currency: String(currency || "EUR").toUpperCase(),
    }).format(Number(value || 0));
  } catch {
    return `${Number(value || 0).toFixed(2)} ${currency || ""}`.trim();
  }
}

function recurrence(value = {}) {
  const count = Math.max(1, Number(value.intervalCount || 1));
  const interval = value.interval || "month";
  const labels = {
    day: count === 1 ? "jour" : `${count} jours`,
    week: count === 1 ? "semaine" : `${count} semaines`,
    month: count === 1 ? "mois" : `${count} mois`,
    year: count === 1 ? "an" : `${count} ans`,
  };
  return labels[interval] || (count === 1 ? interval : `${count} ${interval}`);
}

function recurringPrice(value, amount) {
  return `${money(amount, value?.currency)} / ${recurrence(value)}`;
}

function formatDate(value, withTime = false) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleString("fr-FR", {
    day: "2-digit",
    month: "long",
    year: "numeric",
    ...(withTime ? { hour: "2-digit", minute: "2-digit" } : {}),
  });
}

function requestStateMessage(state) {
  if (state === "EXPIRED") {
    return "Ce lien a expiré. Demandez à votre interlocuteur Gusto Manager de vous envoyer un nouveau lien.";
  }
  if (state === "REVOKED") {
    return "Ce lien a été révoqué et ne permet plus de consulter ou signer le document.";
  }
  if (state === "SIGNING") {
    return "Une signature est en cours de validation. Actualisez la page dans quelques instants.";
  }
  return "Ce lien de signature est invalide ou n’est plus disponible.";
}

export default function PublicContractSignaturePage() {
  const router = useRouter();
  const signatureRef = useRef(null);
  const signatureContainerRef = useRef(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [payload, setPayload] = useState(null);
  const [error, setError] = useState("");
  const [signerName, setSignerName] = useState("");
  const [placeOfSignature, setPlaceOfSignature] = useState("");
  const [accepted, setAccepted] = useState(false);
  const [emailWarning, setEmailWarning] = useState("");
  const [signatureSize, setSignatureSize] = useState({ width: 1, height: 180 });

  const token =
    typeof router.query.token === "string" ? router.query.token : "";
  const apiBase = process.env.NEXT_PUBLIC_API_URL;
  const pdfUrl = useMemo(
    () =>
      token
        ? `${apiBase}/public/contract-signatures/${encodeURIComponent(token)}/pdf`
        : "",
    [apiBase, token],
  );

  useEffect(() => {
    if (!router.isReady || !token) return;
    let canceled = false;

    async function loadDocument() {
      setLoading(true);
      setError("");
      try {
        const { data } = await axios.get(
          `${apiBase}/public/contract-signatures/${encodeURIComponent(token)}`,
          { headers: { "Cache-Control": "no-store" } },
        );
        if (canceled) return;
        setPayload(data);
        setSignerName(data?.document?.party?.ownerName || "");
      } catch (requestError) {
        if (!canceled) {
          setError(
            requestError?.response?.data?.message ||
              "Impossible de charger le document.",
          );
        }
      } finally {
        if (!canceled) setLoading(false);
      }
    }

    loadDocument();
    return () => {
      canceled = true;
    };
  }, [apiBase, router.isReady, token]);

  useEffect(() => {
    const container = signatureContainerRef.current;
    if (!container || typeof ResizeObserver === "undefined") return undefined;

    const updateSize = () => {
      setSignatureSize({
        width: Math.max(1, Math.round(container.clientWidth)),
        height: Math.max(1, Math.round(container.clientHeight)),
      });
    };
    const observer = new ResizeObserver(updateSize);
    observer.observe(container);
    updateSize();
    return () => observer.disconnect();
  }, [payload?.state]);

  async function handleSubmit(event) {
    event.preventDefault();
    setError("");
    setEmailWarning("");

    if (!accepted) {
      setError("Vous devez confirmer explicitement votre acceptation.");
      return;
    }
    if (!signerName.trim() || !placeOfSignature.trim()) {
      setError("Renseignez votre identité et le lieu de signature.");
      return;
    }
    if (!signatureRef.current || signatureRef.current.isEmpty()) {
      setError("Dessinez votre signature dans le cadre prévu.");
      return;
    }

    setSubmitting(true);
    try {
      const signatureDataUrl = signatureRef.current
        .getCanvas()
        .toDataURL("image/png");
      const { data } = await axios.post(
        `${apiBase}/public/contract-signatures/${encodeURIComponent(token)}/sign`,
        {
          signerName: signerName.trim(),
          placeOfSignature: placeOfSignature.trim(),
          accepted: true,
          signatureDataUrl,
        },
      );
      setEmailWarning(data.emailWarning || "");
      setPayload((previous) => ({
        ...(previous || {}),
        state: "SIGNED",
        signedAt: data.signedAt,
        signerName: data.signerName,
        emailStatus: data.emailWarning ? "FAILED" : "SENT",
      }));
      window.scrollTo({ top: 0, behavior: "smooth" });
    } catch (requestError) {
      setError(
        requestError?.response?.data?.message ||
          "La signature n’a pas pu être validée.",
      );
    } finally {
      setSubmitting(false);
    }
  }

  const document = payload?.document;
  const isPending = payload?.state === "PENDING";
  const isSigned = payload?.state === "SIGNED";

  return (
    <>
      <Head>
        <title>Signature de votre document | Gusto Manager</title>
        <meta name="robots" content="noindex,nofollow,noarchive" />
      </Head>

      <main className="min-h-screen bg-lightGrey px-4 py-6 text-darkBlue mobile:py-10">
        <div className="mx-auto w-full max-w-5xl">
          <header className="mb-6 flex items-center justify-between gap-4">
            <Image
              src="/img/logo-nav.png"
              alt="Gusto Manager"
              width={180}
              height={48}
              className="h-10 w-auto object-contain mobile:h-12"
            />
            <div className="flex items-center gap-2 text-xs font-semibold text-darkBlue/60">
              <ShieldCheck className="size-4 text-blue" />
              Lien personnel sécurisé
            </div>
          </header>

          {loading ? (
            <div className="flex min-h-[55vh] items-center justify-center rounded-3xl border border-darkBlue/10 bg-white">
              <Loader2 className="size-7 animate-spin text-blue" />
            </div>
          ) : error && !payload ? (
            <div className="rounded-3xl border border-red/20 bg-white p-6 text-center shadow-sm">
              <p className="font-semibold text-red">{error}</p>
            </div>
          ) : isSigned ? (
            <div className="rounded-3xl border border-green-200 bg-white p-6 text-center shadow-sm mobile:p-10">
              <CheckCircle2 className="mx-auto size-14 text-green-600" />
              <h1 className="mt-4 text-2xl font-semibold">
                Document signé avec succès
              </h1>
              <p className="mx-auto mt-2 max-w-xl text-darkBlue/65">
                Votre signature a été enregistrée définitivement
                {payload.signedAt
                  ? ` le ${formatDate(payload.signedAt, true)}`
                  : ""}
                .
                {!emailWarning && payload.emailStatus === "SENT"
                  ? " Une copie du PDF signé vous a été envoyée par email."
                  : ""}
              </p>
              {emailWarning || payload.emailStatus === "FAILED" ? (
                <p className="mx-auto mt-4 max-w-xl rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
                  {emailWarning ||
                    "Le document est bien signé et conservé, mais sa copie n’a pas pu être envoyée par email. Contactez Gusto Manager pour un renvoi."}
                </p>
              ) : null}
              <a
                href={pdfUrl}
                target="_blank"
                rel="noreferrer"
                className="mt-6 inline-flex items-center gap-2 rounded-xl bg-blue px-5 py-3 text-sm font-semibold text-white"
              >
                Consulter le PDF signé
                <ExternalLink className="size-4" />
              </a>
            </div>
          ) : !isPending || !document ? (
            <div className="rounded-3xl border border-darkBlue/10 bg-white p-6 text-center shadow-sm mobile:p-10">
              <ShieldCheck className="mx-auto size-12 text-darkBlue/35" />
              <h1 className="mt-4 text-xl font-semibold">
                Document indisponible
              </h1>
              <p className="mx-auto mt-2 max-w-xl text-sm text-darkBlue/65">
                {requestStateMessage(payload?.state)}
              </p>
            </div>
          ) : (
            <div className="grid gap-6 desktop:grid-cols-[minmax(0,1.25fr)_minmax(330px,0.75fr)]">
              <section className="overflow-hidden rounded-3xl border border-darkBlue/10 bg-white shadow-sm">
                <div className="border-b border-darkBlue/10 p-5 mobile:p-6">
                  <div className="flex items-start gap-3">
                    <div className="flex size-11 shrink-0 items-center justify-center rounded-2xl bg-blue/10 text-blue">
                      <FileSignature className="size-5" />
                    </div>
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-[0.14em] text-blue">
                        {document.contractKind === "AMENDMENT"
                          ? "Avenant contractuel"
                          : "Contrat de service"}
                      </p>
                      <h1 className="mt-1 text-xl font-semibold mobile:text-2xl">
                        {document.party?.restaurantName || "Votre document"}
                      </h1>
                      <p className="mt-1 text-sm text-darkBlue/60">
                        {document.docNumber} · {formatDate(document.issueDate)}
                      </p>
                    </div>
                  </div>

                  <div className="mt-5 grid gap-3 rounded-2xl bg-lightGrey p-4 text-sm mobile:grid-cols-2">
                    <div>
                      <p className="text-xs text-darkBlue/45">Établissement</p>
                      <p className="mt-1 font-semibold">
                        {document.party?.restaurantName || "—"}
                      </p>
                      <p className="text-darkBlue/60">
                        {document.party?.address || ""}
                      </p>
                    </div>
                    <div>
                      <p className="text-xs text-darkBlue/45">Représenté par</p>
                      <p className="mt-1 font-semibold">
                        {document.party?.ownerName || "—"}
                      </p>
                    </div>
                  </div>
                </div>

                <div className="p-5 mobile:p-6">
                  <div className="mb-5 rounded-2xl border border-darkBlue/10 p-4">
                    <h2 className="text-sm font-semibold">
                      {document.contractKind === "AMENDMENT"
                        ? "Nouvelle situation contractuelle complète"
                        : "Prestations principales"}
                    </h2>
                    <div className="mt-3 flex flex-col gap-2 text-sm">
                      {document.subscription?.name ||
                      Number(document.subscription?.priceMonthly) > 0 ? (
                        <div className="flex items-center justify-between gap-3">
                          <span>
                            {document.subscription?.name ||
                              "Abonnement Gusto Manager"}
                            {Number(document.subscription?.quantity || 1) > 1
                              ? ` × ${document.subscription.quantity}`
                              : ""}
                          </span>
                          <strong>
                            {recurringPrice(
                              document.subscription,
                              Number(document.subscription?.priceMonthly || 0) *
                                Number(document.subscription?.quantity || 1),
                            )}
                          </strong>
                        </div>
                      ) : null}
                      {(document.modules || []).map((module, index) => (
                        <div
                          key={`${module.code || module.name}-${index}`}
                          className="flex items-center justify-between gap-3"
                        >
                          <span>
                            {module.name}
                            {Number(module.quantity || 1) > 1
                              ? ` × ${module.quantity}`
                              : ""}
                          </span>
                          <strong>
                            {module.offered ||
                            Number(module.priceMonthly || 0) <= 0
                              ? "Offert"
                              : recurringPrice(
                                  module,
                                  Number(module.priceMonthly || 0) *
                                    Number(module.quantity || 1),
                                )}
                          </strong>
                        </div>
                      ))}
                      {(document.lines || [])
                        .filter((line) => line.active !== false && line.label)
                        .map((line, index) => (
                          <div
                            key={`${line.kind || "line"}-${line.label}-${index}`}
                            className="flex items-center justify-between gap-3"
                          >
                            <span>
                              {line.label}
                              {Number(line.qty || 1) > 1
                                ? ` × ${line.qty}`
                                : ""}
                            </span>
                            <strong>
                              {line.offered || Number(line.unitPrice || 0) <= 0
                                ? "Offert"
                                : money(
                                    Number(line.unitPrice || 0) *
                                      Number(line.qty || 1),
                                  )}
                            </strong>
                          </div>
                        ))}
                      {document.timeClockTerminalRental?.enabled ? (
                        <div className="flex items-center justify-between gap-3">
                          <span>
                            Location tablette ×{" "}
                            {document.timeClockTerminalRental.quantity || 1}
                          </span>
                          <strong>
                            {recurringPrice(
                              document.timeClockTerminalRental,
                              Number(
                                document.timeClockTerminalRental
                                  .priceMonthly || 0,
                              ) *
                                Number(
                                  document.timeClockTerminalRental.quantity ||
                                    1,
                                ),
                            )}
                          </strong>
                        </div>
                      ) : null}
                    </div>
                    {document.comments ? (
                      <div className="mt-4 border-t border-darkBlue/10 pt-3 text-sm text-darkBlue/70">
                        <p className="font-semibold text-darkBlue">
                          Conditions particulières
                        </p>
                        <p className="mt-1 whitespace-pre-line">
                          {document.comments}
                        </p>
                      </div>
                    ) : null}
                  </div>

                  <div className="flex items-center justify-between gap-3">
                    <h2 className="font-semibold">Document complet</h2>
                    <a
                      href={pdfUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-1.5 text-xs font-semibold text-blue hover:underline"
                    >
                      Ouvrir le PDF
                      <ExternalLink className="size-3.5" />
                    </a>
                  </div>
                  <iframe
                    title="Document contractuel à signer"
                    src={pdfUrl}
                    className="mt-3 h-[62vh] min-h-[460px] w-full rounded-xl border border-darkBlue/10 bg-lightGrey"
                  />
                </div>
              </section>

              <aside className="self-start rounded-3xl border border-darkBlue/10 bg-white p-5 shadow-sm desktop:sticky desktop:top-6 mobile:p-6">
                <h2 className="text-lg font-semibold">Signer le document</h2>
                <p className="mt-1 text-sm text-darkBlue/60">
                  Vérifiez l’intégralité du document avant de confirmer.
                </p>

                <form
                  onSubmit={handleSubmit}
                  className="mt-5 flex flex-col gap-4"
                >
                  <label className="flex flex-col gap-1.5 text-sm font-semibold">
                    Nom complet du signataire
                    <input
                      value={signerName}
                      onChange={(event) => setSignerName(event.target.value)}
                      maxLength={160}
                      autoComplete="name"
                      className="rounded-xl border border-darkBlue/15 px-3 py-2.5 font-normal outline-none focus:border-blue focus:ring-2 focus:ring-blue/15"
                    />
                  </label>

                  <label className="flex flex-col gap-1.5 text-sm font-semibold">
                    Fait à
                    <input
                      value={placeOfSignature}
                      onChange={(event) =>
                        setPlaceOfSignature(event.target.value)
                      }
                      maxLength={160}
                      placeholder="Ex. Paris"
                      className="rounded-xl border border-darkBlue/15 px-3 py-2.5 font-normal outline-none focus:border-blue focus:ring-2 focus:ring-blue/15"
                    />
                  </label>

                  <div>
                    <div className="flex items-center justify-between gap-3">
                      <p className="text-sm font-semibold">
                        Signature manuscrite
                      </p>
                      <button
                        type="button"
                        onClick={() => signatureRef.current?.clear()}
                        className="inline-flex items-center gap-1 text-xs font-semibold text-darkBlue/55 hover:text-darkBlue"
                      >
                        <RotateCcw className="size-3.5" />
                        Effacer
                      </button>
                    </div>
                    <div
                      ref={signatureContainerRef}
                      className="mt-2 h-[180px] overflow-hidden rounded-xl border border-darkBlue/15 bg-white"
                    >
                      <SignatureCanvas
                        key={`${signatureSize.width}x${signatureSize.height}`}
                        ref={signatureRef}
                        penColor="#131E36"
                        minWidth={1.2}
                        maxWidth={2.5}
                        canvasProps={{
                          width: signatureSize.width,
                          height: signatureSize.height,
                          className:
                            "block size-full touch-none bg-white",
                        }}
                      />
                    </div>
                  </div>

                  <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-darkBlue/10 bg-lightGrey p-3 text-sm leading-relaxed">
                    <input
                      type="checkbox"
                      checked={accepted}
                      onChange={(event) => setAccepted(event.target.checked)}
                      className="mt-1 size-4 shrink-0"
                    />
                    <span>
                      Je confirme avoir lu l’intégralité du document et accepter
                      définitivement ses conditions.
                    </span>
                  </label>

                  {error ? (
                    <p className="rounded-xl border border-red/20 bg-red/5 p-3 text-sm text-red">
                      {error}
                    </p>
                  ) : null}

                  <button
                    type="submit"
                    disabled={submitting}
                    className="inline-flex items-center justify-center gap-2 rounded-xl bg-blue px-4 py-3 text-sm font-semibold text-white shadow-sm hover:bg-blue/90 disabled:opacity-60"
                  >
                    {submitting ? (
                      <Loader2 className="size-4 animate-spin" />
                    ) : (
                      <ShieldCheck className="size-4" />
                    )}
                    {submitting
                      ? "Validation en cours…"
                      : "Signer définitivement"}
                  </button>

                  <p className="text-center text-xs text-darkBlue/45">
                    Lien valable jusqu’au {formatDate(payload.expiresAt)}.
                  </p>
                </form>
              </aside>
            </div>
          )}
        </div>
      </main>
    </>
  );
}

export async function getServerSideProps({ locale }) {
  return {
    props: {
      ...(await serverSideTranslations(locale, ["common"])),
    },
  };
}
