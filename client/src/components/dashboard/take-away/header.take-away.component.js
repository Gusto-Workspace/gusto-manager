import { useRouter } from "next/router";
import { Plus, Settings, ShoppingBag } from "lucide-react";

import CatalogHeaderDashboardComponent from "../_shared/catalog-header.dashboard.component";
import { TakeAwaySvg } from "@/components/_shared/_svgs/_index";

export default function TakeAwayHeaderComponent({
  subtitle = "Commandes",
  actions,
  showBack = false,
  onBack,
}) {
  const router = useRouter();
  const handleBack = onBack || (() => router.push("/dashboard/take-away"));

  const defaultActions = (
    <>
      <button
        type="button"
        onClick={() => router.push("/dashboard/take-away/catalog")}
        className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-darkBlue/10 bg-white/70 transition hover:bg-darkBlue/5"
        aria-label="Catalogue"
        title="Catalogue"
      >
        <ShoppingBag className="size-4 text-darkBlue/70" />
      </button>
      <button
        type="button"
        onClick={() => router.push("/dashboard/take-away/parameters")}
        className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-darkBlue/10 bg-white/70 transition hover:bg-darkBlue/5"
        aria-label="Paramètres"
        title="Paramètres"
      >
        <Settings className="size-4 text-darkBlue/70" />
      </button>
    </>
  );

  return (
    <>
      <hr className="opacity-20" />
      <CatalogHeaderDashboardComponent
        icon={
          <TakeAwaySvg
            width={30}
            height={30}
            className="min-h-[30px] min-w-[30px]"
            fillColor="#131E3690"
          />
        }
        title="Vente à emporter"
        subtitle={subtitle}
        onBack={showBack ? handleBack : undefined}
        backLabel="Retour"
        onTitleClick={() => router.push("/dashboard/take-away")}
        actions={actions || defaultActions}
      />
    </>
  );
}

export function AddOrderAction({ onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-blue text-white shadow-sm transition hover:bg-blue/90 active:scale-[0.98]"
      aria-label="Créer une commande"
      title="Créer une commande"
    >
      <Plus className="size-4" />
    </button>
  );
}
