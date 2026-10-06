import axios from "axios";

export const STYLES = [
  "Minimaliste",
  "Éditorial",
  "Patrimonial",
  "Brutaliste",
  "Luxe",
  "Chaleureux",
  "Méditerranéen",
  "Bistrot",
  "Contemporain",
];
export const ASSET_ROLES = [
  "logo",
  "restaurantExterior",
  "restaurantInterior",
  "food",
  "chef",
  "team",
  "terrace",
  "signatureGraphic",
  "texture",
  "illustration",
  "badge",
  "other",
];
export const STATUS = {
  draft: "Brouillon",
  brief_ready: "Brief prêt",
  analyzing: "Analyse en cours",
  directions_ready: "Directions prêtes",
  generating: "Génération en cours",
  exploration: "Exploration",
  approved: "Maquette approuvée",
};

export function api(method, path, data, { timeout = 300000 } = {}) {
  const token =
    typeof window === "undefined" ? "" : localStorage.getItem("admin-token");
  return axios({
    method,
    url: `${process.env.NEXT_PUBLIC_API_URL}/admin/design-lab${path}`,
    data,
    headers: { Authorization: `Bearer ${token}` },
    timeout,
  }).then((response) => response.data);
}

export function message(error) {
  return (
    error?.response?.data?.message ||
    error?.message ||
    "Une erreur est survenue."
  );
}

export function styleFrameErrorMessage(value) {
  return /The server had an error while processing your request/i.test(String(value || ""))
    ? "Génération interrompue par le service d’image OpenAI. Aucun Style Frame n’a été enregistré. Vous pouvez relancer manuellement."
    : value;
}

export const panel =
  "rounded-[24px] border border-darkBlue/10 bg-white p-5 shadow-[0_16px_40px_rgba(19,30,54,0.05)]";
export const input =
  "w-full rounded-xl border border-darkBlue/15 bg-white px-3 py-2.5 text-sm outline-none focus:border-blue";
export const button =
  "inline-flex items-center justify-center gap-2 rounded-xl bg-blue px-4 py-2.5 text-sm font-semibold text-white transition hover:opacity-90 disabled:opacity-50";
export const secondaryButton =
  "inline-flex items-center justify-center gap-2 rounded-xl border border-darkBlue/15 bg-white px-4 py-2.5 text-sm font-semibold text-darkBlue transition hover:bg-lightGrey disabled:opacity-50";
