import { useState } from "react";
import { Building2, ChevronDown, KeyRound, Mail } from "lucide-react";
import CommercialLayout from "@/components/commercial/commercial-layout";
import { commercialApi, setCommercialSession } from "@/components/commercial/commercial-api";
import { CommercialAvatar, CommercialHeader, CommercialSubheading, commercialPanel, commercialSecondary } from "@/components/commercial/commercial-ui";

function AccountForm({ account }) {
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function update(event, password = false) {
    event.preventDefault();
    setBusy(true);
    setError("");
    setMessage("");
    const body = Object.fromEntries(new FormData(event.currentTarget));
    try {
      await commercialApi(password ? "/me/password" : "/me", { method: password ? "PUT" : "PATCH", body });
      if (password) {
        setCommercialSession(null);
        window.dispatchEvent(new Event("gusto-commercial-session-ended"));
      } else setMessage("Coordonnées enregistrées.");
    } catch (error) {
      setError(error.message);
    } finally {
      setBusy(false);
    }
  }

  const name = `${account.firstName} ${account.lastName}`;
  return <div className="grid min-w-0 gap-4">
    <CommercialHeader title="Mon compte" />
    <div className="grid min-w-0 items-start gap-4 midTablet:grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)]">
      <section className={`${commercialPanel} grid gap-4 p-4 midTablet:p-5`}>
        <div className="flex min-w-0 items-center gap-3">
          <CommercialAvatar name={name} large />
          <div className="min-w-0">
            <h2 className="break-words text-xl font-bold tracking-tight">{name}</h2>
            {account.companyName && <p className="break-words text-sm text-darkBlue/75">{account.companyName}</p>}
          </div>
        </div>
        <div className="grid grid-cols-[auto_minmax(0,1fr)] gap-2 rounded-xl bg-[#f7f5fc] p-3">
          <Mail size={18} className="text-violet" aria-hidden="true" />
          <div className="min-w-0"><p className="text-xs font-semibold text-darkBlue/70">Adresse de connexion</p><p className="break-all text-sm font-semibold">{account.email}</p></div>
        </div>
        {(account.siret || account.startedAt) && <dl className="grid gap-3 border-t border-darkBlue/10 pt-3 text-sm">
          {account.siret && <div><dt className="text-darkBlue/70">SIRET</dt><dd className="break-all font-semibold tabular-nums">{account.siret}</dd></div>}
          {account.startedAt && <div><dt className="text-darkBlue/70">Début de collaboration</dt><dd className="font-semibold">
            {new Intl.DateTimeFormat("fr-FR", { dateStyle: "long", timeZone: "Europe/Paris" }).format(new Date(account.startedAt))}
          </dd></div>}
        </dl>}
      </section>
      <div className="grid min-w-0 gap-4">
        <section className={`${commercialPanel} grid gap-4 p-4 midTablet:p-5`}>
          <CommercialSubheading icon={Building2} title="Coordonnées professionnelles" description="Mettez à jour vos coordonnées de contact." />
          <form onSubmit={update} className="grid gap-3">
            <label className="grid gap-1 text-sm">Téléphone<input type="tel" name="phone" autoComplete="tel" defaultValue={account.phone} className="input-commercial" maxLength={40} /></label>
            <label className="grid gap-1 text-sm">Adresse professionnelle<input name="businessAddress" autoComplete="street-address" defaultValue={account.businessAddress} className="input-commercial" maxLength={400} /></label>
            <button type="submit" disabled={busy} className="button-commercial justify-self-start">Enregistrer les coordonnées</button>
          </form>
        </section>
        <details className={`${commercialPanel} group p-4 midTablet:p-5`}>
          <summary className="flex min-h-11 cursor-pointer list-none items-center gap-2 font-bold [&::-webkit-details-marker]:hidden">
            <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-violet/10 text-violet"><KeyRound size={18} aria-hidden="true" /></span>Modifier le mot de passe
            <ChevronDown size={17} className="ml-auto shrink-0 text-violet transition group-open:rotate-180" aria-hidden="true" />
          </summary>
          <form onSubmit={(event) => update(event, true)} className="mt-4 grid gap-3">
            <label className="grid gap-1 text-sm">Mot de passe actuel<input type="password" name="currentPassword" autoComplete="current-password" required className="input-commercial" /></label>
            <label className="grid gap-1 text-sm">Nouveau mot de passe<input type="password" name="newPassword" autoComplete="new-password" minLength={12} required className="input-commercial" /></label>
            <button type="submit" disabled={busy} className={`${commercialSecondary} justify-self-start`}>Modifier le mot de passe</button>
          </form>
        </details>
        {message && <p role="status" className="rounded-xl bg-[#e3f4e9] p-3 text-sm text-[#205d3d]">{message}</p>}
        {error && <p className="rounded-xl bg-[#fce9e7] p-3 text-sm text-[#972e27]" role="alert">{error}</p>}
      </div>
    </div>
  </div>;
}

export default function CommercialAccountPage() {
  return <CommercialLayout title="Mon compte">{(account) => <AccountForm account={account} />}</CommercialLayout>;
}
export { getCommercialStaticProps as getStaticProps } from "@/components/commercial/commercial-translations.server";

