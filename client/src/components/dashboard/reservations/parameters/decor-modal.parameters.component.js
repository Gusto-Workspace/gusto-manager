import { X } from "lucide-react";

export default function DecorModalParametersComponent({
  setDecorModalOpen,
  addDecor,
}) {
  function ItemBtn({ label, onClick }) {
    return (
      <button
        type="button"
        onClick={onClick}
        className="w-full text-left rounded-2xl border border-darkBlue/10 bg-white/80 px-3 py-2 hover:bg-darkBlue/5 transition"
      >
        <p className="text-sm font-semibold text-darkBlue">{label}</p>
      </button>
    );
  }

  return (
    <div
      className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/40 p-3"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) setDecorModalOpen(false);
      }}
    >
      <div className="w-full max-w-[720px] max-h-[80vh] rounded-3xl border border-darkBlue/10 bg-lightGrey shadow-xl overflow-auto">
        <div className="flex items-center justify-between px-4 py-3 border-b border-darkBlue/10">
          <div className="min-w-0">
            <p className="text-base font-semibold text-darkBlue">
              Ajouter un élément
            </p>
            <p className="text-xs text-darkBlue/60">
              Clique sur un élément pour l’ajouter au centre du plan.
            </p>
          </div>

          <button
            type="button"
            onClick={() => setDecorModalOpen(false)}
            className="inline-flex items-center justify-center size-10 rounded-2xl border border-darkBlue/10 bg-white hover:bg-darkBlue/5 transition"
            aria-label="Fermer"
          >
            <X className="size-4 text-darkBlue/70" />
          </button>
        </div>

        <div className="p-4 grid grid-cols-1 mobile:grid-cols-2 gap-4">
          {/* 1) STRUCTURE */}
          <div className="rounded-3xl border border-darkBlue/10 bg-white/70 p-3">
            <p className="text-sm font-semibold text-darkBlue">1) Structure</p>

            <div className="mt-3 grid grid-cols-1 gap-2">
              <ItemBtn label="Mur / cloison" onClick={() => addDecor("wall")} />

              <ItemBtn
                label="Porte / entrée"
                onClick={() => addDecor("door")}
              />
              <ItemBtn label="Bar / comptoir" onClick={() => addDecor("bar")} />
              <ItemBtn
                label="Cuisine / passe"
                onClick={() => addDecor("kitchen")}
              />
              <ItemBtn label="Fenêtre" onClick={() => addDecor("window")} />
              <ItemBtn label="Toilettes" onClick={() => addDecor("wc")} />
            </div>
          </div>

          {/* 2) OBSTACLES */}
          <div className="rounded-3xl border border-darkBlue/10 bg-white/70 p-3">
            <p className="text-sm font-semibold text-darkBlue">2) Obstacles</p>

            <div className="mt-3 grid grid-cols-1 gap-2">
              <ItemBtn
                label="Pilier (rond)"
                onClick={() => addDecor("pillar_round")}
              />
              <ItemBtn
                label="Pilier (carré)"
                onClick={() => addDecor("pillar_square")}
              />
              <ItemBtn label="Escalier" onClick={() => addDecor("stairs")} />
              <ItemBtn
                label="Zone interdite"
                onClick={() => addDecor("no_zone")}
              />
            </div>
          </div>

          {/* 3) AMBIANCE */}
          <div className="rounded-3xl border border-darkBlue/10 bg-white/70 p-3 mobile:col-span-2">
            <p className="text-sm font-semibold text-darkBlue">
              3) Ambiance / déco
            </p>

            <div className="mt-3 grid grid-cols-1 mobile:grid-cols-2 gap-2">
              <ItemBtn label="Plante" onClick={() => addDecor("plant")} />
              <ItemBtn label="Parasol" onClick={() => addDecor("parasol")} />
              <ItemBtn label="Banquette" onClick={() => addDecor("bench")} />
              <ItemBtn
                label="Décoration générique"
                onClick={() => addDecor("decor")}
              />
            </div>
          </div>
        </div>

        <div className="px-4 py-3 border-t border-darkBlue/10 flex items-center justify-end">
          <button
            type="button"
            onClick={() => setDecorModalOpen(false)}
            className="inline-flex items-center justify-center rounded-2xl border border-darkBlue/10 bg-white px-4 h-10 text-sm font-semibold text-darkBlue hover:bg-darkBlue/5 transition"
          >
            Fermer
          </button>
        </div>
      </div>
    </div>
  );
}
