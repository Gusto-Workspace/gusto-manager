export default function DashboardAdminComponent() {
  return (
    <section className="flex flex-col gap-4">
      {/* Header sticky (même style que les autres listes) */}
      <div className="sticky top-6 z-20 ml-16 mobile:ml-12 tablet:ml-0 px-4 pt-4 pb-3 bg-white/70 backdrop-blur border-b rounded-xl border-darkBlue/10">
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <h1 className="text-lg font-semibold text-darkBlue truncate">
              Dashboard
            </h1>
            <p className="text-xs text-darkBlue/50">
              Admin
            </p>
          </div>
        </div>
      </div>

      {/* Content placeholder (optionnel, vide mais aligné) */}
      <div className="rounded-xl bg-white/60 border border-darkBlue/10 shadow-sm p-6">
        <p className="text-sm text-darkBlue/60 italic">
          À venir…
        </p>
      </div>
    </section>
  );
}
