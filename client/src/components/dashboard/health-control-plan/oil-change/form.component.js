// app/(components)/oil/OilChangeForm.jsx
"use client";
import { useEffect, useMemo, useRef, useState, useCallback } from "react";
import { useForm } from "react-hook-form";
import axios from "axios";
import {
  CalendarClock,
  FileText,
  Hash,
  Link as LinkIcon,
  Loader2,
  Wrench,
  Droplet,
  Building2,
  Percent,
  Filter,
  Palette,
  Wind,
  Tag,
} from "lucide-react";
import { createPortal } from "react-dom";

function toDatetimeLocalValue(value) {
  const base = value ? new Date(value) : new Date();
  if (Number.isNaN(base.getTime())) {
    const fallback = new Date();
    const offset = fallback.getTimezoneOffset() * 60000;
    return new Date(fallback.getTime() - offset).toISOString().slice(0, 16);
  }
  const offset = base.getTimezoneOffset() * 60000;
  return new Date(base.getTime() - offset).toISOString().slice(0, 16);
}

function buildFormDefaults(record) {
  return {
    fryerId: record?.fryerId ?? "",
    performedAt: toDatetimeLocalValue(record?.performedAt),

    litersRemoved:
      record?.litersRemoved !== undefined && record?.litersRemoved !== null
        ? String(record.litersRemoved)
        : "",

    // Huile neuve
    batchNumber: record?.newOilBatch?.batchNumber ?? "",
    supplier: record?.newOilBatch?.supplier
      ? String(record.newOilBatch.supplier)
      : "",

    // Qualité
    tpmPercent:
      record?.tpmPercent !== undefined && record?.tpmPercent !== null
        ? String(record.tpmPercent)
        : "",
    filteredBeforeChange: Boolean(record?.filteredBeforeChange ?? false),
    colorIndex: record?.colorIndex ?? "",
    odorCheck: record?.odorCheck ?? "",
    oilBrand: record?.oilBrand ?? "",

    qualityNotes: record?.qualityNotes ?? "",
    disposalDocumentUrl: record?.disposalDocumentUrl ?? "",
  };
}

export default function OilChangeForm({
  restaurantId,
  initial = null,
  onSuccess,
  onCancel,
}) {
  const {
    register,
    handleSubmit,
    reset,
    setValue,
    watch,
    formState: { errors, isSubmitting },
  } = useForm({ defaultValues: buildFormDefaults(initial) });

  useEffect(() => {
    reset(buildFormDefaults(initial));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initial]);

  const onSubmit = async (data) => {
    const token = localStorage.getItem("token");
    if (!token) return;

    const payload = {
      fryerId: data.fryerId || undefined,
      performedAt: data.performedAt ? new Date(data.performedAt) : undefined,

      litersRemoved:
        data.litersRemoved !== "" && data.litersRemoved != null
          ? Number(String(data.litersRemoved).replace(",", "."))
          : undefined,

      newOilBatch:
        data.batchNumber || data.supplier
          ? {
              ...(data.batchNumber ? { batchNumber: data.batchNumber } : {}),
              ...(data.supplier ? { supplier: data.supplier } : {}),
            }
          : undefined,

      tpmPercent:
        data.tpmPercent !== "" && data.tpmPercent != null
          ? Number(String(data.tpmPercent).replace(",", "."))
          : undefined,

      filteredBeforeChange: !!data.filteredBeforeChange,
      colorIndex: data.colorIndex || undefined,
      odorCheck: data.odorCheck || undefined,
      oilBrand: data.oilBrand || undefined,

      qualityNotes: data.qualityNotes || undefined,
      disposalDocumentUrl: data.disposalDocumentUrl || undefined,
    };

    const url = initial?._id
      ? `${process.env.NEXT_PUBLIC_API_URL}/restaurants/${restaurantId}/oil-changes/${initial._id}`
      : `${process.env.NEXT_PUBLIC_API_URL}/restaurants/${restaurantId}/oil-changes`;
    const method = initial?._id ? "put" : "post";

    const { data: saved } = await axios[method](url, payload, {
      headers: { Authorization: `Bearer ${token}` },
    });

    window.dispatchEvent(
      new CustomEvent("oil-change:upsert", { detail: { doc: saved } })
    );

    reset(buildFormDefaults(null));
    onSuccess?.(saved);
  };

  // --- Styles
  const fieldWrap =
    "group relative rounded-xl bg-white/50 backdrop-blur-sm px-3 py-2 h-[80px] transition-shadow";
  const labelCls =
    "flex items-center gap-2 text-xs font-medium text-darkBlue/60 mb-1";
  const inputCls =
    "h-11 w-full rounded-lg border border-darkBlue/20 bg-white px-3 text-[15px] outline-none transition placeholder:text-darkBlue/40";
  const selectCls =
    "h-11 w-full appearance-none rounded-lg border border-darkBlue/20 bg-white px-3 text-[15px] outline-none transition";
  const btnPrimary =
    "text-nowrap inline-flex items-center justify-center gap-2 h-[38px] rounded-lg bg-blue px-4 py-2 text-sm font-medium text-white shadow disabled:opacity-60";
  const btnSecondary =
    "inline-flex items-center justify-center gap-2 rounded-lg border border-red bg-white px-4 py-2 text-sm font-medium text-red";
  const okBorder = "border-darkBlue/20";

  const notesVal = watch("qualityNotes");
  const filtered = watch("filteredBeforeChange");
  const fryerVal = watch("fryerId") || "";

  /* ------------------ SUGGESTIONS FRITEUSE / ÉQUIPEMENT ------------------ */

  const norm = (s) =>
    String(s || "")
      .trim()
      .toLowerCase();

  // container + portal + ANCHOR INPUT
  const eqBoxRef = useRef(null); // wrapper (pour outside click)
  const eqPortalRef = useRef(null); // portal node
  const eqInputRef = useRef(null); // ⬅️ ancre exacte = INPUT

  // état
  const [eqOpen, setEqOpen] = useState(false);
  const [eqItems, setEqItems] = useState([]); // valeurs uniques (strings)
  const [eqFiltered, setEqFiltered] = useState([]);
  const [eqLoading, setEqLoading] = useState(false);
  const [eqError, setEqError] = useState(false);
  const [eqActiveIndex, setEqActiveIndex] = useState(-1);

  // pagination & guards
  const eqPageRef = useRef(0);
  const eqPagesRef = useRef(1);
  const eqLoadingRef = useRef(false);

  // debouncing + flag "l’utilisateur tape réellement"
  const eqDebounceRef = useRef(null);
  const eqUserTypedRef = useRef(false);

  // éviter fermeture au clic dans le portal
  const pointerInPortalRef = useRef(false);
  useEffect(() => {
    const down = (e) => {
      if (eqPortalRef.current?.contains(e.target)) {
        pointerInPortalRef.current = true;
      }
    };
    const up = () => setTimeout(() => (pointerInPortalRef.current = false), 0);
    document.addEventListener("mousedown", down, true);
    document.addEventListener("mouseup", up, true);
    return () => {
      document.removeEventListener("mousedown", down, true);
      document.removeEventListener("mouseup", up, true);
    };
  }, []);

  // fermeture si clic à l’extérieur
  useEffect(() => {
    const onClickOutside = (e) => {
      if (eqPortalRef.current?.contains(e.target)) return;
      if (eqBoxRef.current?.contains(e.target)) return;
      setEqOpen(false);
      setEqActiveIndex(-1);
    };
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, []);

  // --- visualViewport (stabilise la position du portal sur mobile/tablette)
  const vvRef = useRef({
    offsetTop: 0,
    offsetLeft: 0,
    width: 0,
    height: 0,
    scale: 1,
  });
  const [, bumpVvTick] = useState(0);
  const [isClient, setIsClient] = useState(false);
  useEffect(() => setIsClient(true), []);

  useEffect(() => {
    const vv = window.visualViewport;
    if (!vv) return;
    const sync = () => {
      vvRef.current = {
        offsetTop: vv.offsetTop || 0,
        offsetLeft: vv.offsetLeft || 0,
        width: vv.width || window.innerWidth,
        height: vv.height || window.innerHeight,
        scale: vv.scale || 1,
      };
      bumpVvTick((n) => n + 1);
    };
    sync();
    vv.addEventListener("scroll", sync);
    vv.addEventListener("resize", sync);
    window.addEventListener("orientationchange", sync);
    return () => {
      vv.removeEventListener("scroll", sync);
      vv.removeEventListener("resize", sync);
      window.removeEventListener("orientationchange", sync);
    };
  }, []);

  // helper de positionnement (même largeur que l'INPUT, petit espace entre les deux)
  function getDropdownStyle(anchorEl, { margin = -4, maxListPx = 256 } = {}) {
    if (!anchorEl) return null;
    const rect = anchorEl.getBoundingClientRect();
    const { offsetTop, offsetLeft, height: vvH } = vvRef.current;

    // place 4px SOUS l'input (margin = -4 => +4px)
    let top = rect.bottom + offsetTop - margin;
    let left = rect.left + offsetLeft;
    const width = rect.width;

    // flip si peu de place en bas
    const spaceBelow = vvH - (rect.bottom + 0);
    const willFlip = spaceBelow < 140;
    if (willFlip) {
      top = rect.top + offsetTop - Math.min(maxListPx, rect.top - 4);
    }

    const maxHeight = willFlip
      ? Math.min(maxListPx, rect.top - 4)
      : Math.min(maxListPx, vvH - (rect.bottom + 4));

    return {
      position: "fixed",
      left,
      top,
      width, // ⬅️ même largeur que l'input
      zIndex: 1000,
      maxHeight: Math.max(120, maxHeight),
      overflow: "auto",
      WebkitOverflowScrolling: "touch",
      overscrollBehavior: "contain",
      willChange: "transform",
      transform: "translateZ(0)",
    };
  }

  // repositionnement du portal sur scroll/resize (document & containers)
  const [, forceTick] = useState(0);
  useEffect(() => {
    const onScrollOrResize = () => forceTick((v) => v + 1);
    window.addEventListener("resize", onScrollOrResize, true);
    window.addEventListener("scroll", onScrollOrResize, true);
    return () => {
      window.removeEventListener("resize", onScrollOrResize, true);
      window.removeEventListener("scroll", onScrollOrResize, true);
    };
  }, []);

  // scroll infini (si tu veux explorer davantage l'historique des valeurs)
  const onEqScroll = async (e) => {
    const el = e.currentTarget;
    if (!el) return;
    const nearBottom = el.scrollTop + el.clientHeight >= el.scrollHeight - 16;
    const hasMore = eqPageRef.current < eqPagesRef.current;
    if (nearBottom && hasMore && !eqLoadingRef.current) {
      await loadEquipPage(eqPageRef.current + 1);
    }
  };

  const addDistinct = (prev, arr) => {
    const seen = new Set(prev.map((x) => norm(x)));
    const out = [...prev];
    for (const it of arr) {
      const v = String(it || "").trim();
      if (!v) continue;
      const n = norm(v);
      if (seen.has(n)) continue;
      seen.add(n);
      out.push(v);
    }
    return out;
  };

  // charge une page et ajoute les fryerId uniques
  const loadEquipPage = useCallback(
    async (page = 1) => {
      if (!restaurantId) return;
      if (eqLoadingRef.current) return;
      const token = localStorage.getItem("token");
      if (!token) return;

      eqLoadingRef.current = true;
      setEqLoading(true);
      setEqError(false);
      try {
        const url = `${process.env.NEXT_PUBLIC_API_URL}/restaurants/${restaurantId}/list-oil-changes`;
        const { data } = await axios.get(url, {
          headers: { Authorization: `Bearer ${token}` },
          params: { page, limit: 50 },
        });

        const items = Array.isArray(data?.items) ? data.items : [];
        const fryers = items.map((it) => it?.fryerId).filter(Boolean);
        setEqItems((prev) => addDistinct(prev, fryers));

        const pages = Math.max(1, Number(data?.meta?.pages || 1));
        eqPageRef.current = page;
        eqPagesRef.current = pages;
      } catch {
        setEqError(true);
      } finally {
        eqLoadingRef.current = false;
        setEqLoading(false);
      }
    },
    [restaurantId]
  );

  // met à jour la liste filtrée et l’ouverture du menu
  const updateFiltered = useCallback(
    (q) => {
      const query = norm(q);
      if (!query || query.length < 1) {
        setEqFiltered([]);
        setEqOpen(false);
        setEqActiveIndex(-1);
        return;
      }
      const matches = eqItems
        .filter((v) => norm(v).includes(query))
        .sort((a, b) =>
          String(a).localeCompare(String(b), "fr", { sensitivity: "base" })
        )
        .slice(0, 8);

      setEqFiltered(matches);
      setEqOpen(matches.length > 0);
      setEqActiveIndex(matches.length ? 0 : -1);
    },
    [eqItems]
  );

  // ouverture uniquement à la FRAPPE
  useEffect(() => {
    if (!eqUserTypedRef.current) {
      setEqOpen(false);
      return;
    }
    if (eqDebounceRef.current) clearTimeout(eqDebounceRef.current);

    const q = String(fryerVal || "");
    if (q.trim().length < 1) {
      setEqFiltered([]);
      setEqOpen(false);
      setEqActiveIndex(-1);
      return;
    }

    eqDebounceRef.current = setTimeout(async () => {
      if (eqPageRef.current === 0) {
        await loadEquipPage(1);
      }
      updateFiltered(q);
    }, 160);

    return () => {
      if (eqDebounceRef.current) clearTimeout(eqDebounceRef.current);
    };
  }, [fryerVal, loadEquipPage, updateFiltered]);

  const pickEq = (val) => {
    setValue("fryerId", val, { shouldDirty: true, shouldValidate: true });
    setEqOpen(false);
    setEqActiveIndex(-1);
    eqUserTypedRef.current = false;
  };

  const onEqKeyDown = (e) => {
    if (!eqOpen) return;
    if (e.key === "Escape") {
      e.preventDefault();
      setEqOpen(false);
      setEqActiveIndex(-1);
      return;
    }
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setEqActiveIndex((i) => Math.min((eqFiltered?.length || 0) - 1, i + 1));
      return;
    }
    if (e.key === "ArrowUp") {
      e.preventDefault();
      setEqActiveIndex((i) => Math.max(0, i - 1));
      return;
    }
    if (e.key === "Enter") {
      e.preventDefault();
      if (eqActiveIndex >= 0 && eqFiltered[eqActiveIndex]) {
        pickEq(eqFiltered[eqActiveIndex]);
      } else {
        setEqOpen(false);
        setEqActiveIndex(-1);
      }
    }
  };

  // Empêcher le “sur-scroll” de la page quand un dropdown est ouvert (clavier mobile)
  const anyDropdownOpen = eqOpen;
  useEffect(() => {
    const html = document.documentElement;
    const prevY = html.style.overscrollBehaviorY;
    const prevX = html.style.overscrollBehaviorX;
    if (anyDropdownOpen) {
      html.style.overscrollBehaviorY = "contain";
      html.style.overscrollBehaviorX = "none";
    } else {
      html.style.overscrollBehaviorY = prevY || "";
      html.style.overscrollBehaviorX = prevX || "";
    }
    return () => {
      html.style.overscrollBehaviorY = prevY || "";
      html.style.overscrollBehaviorX = prevX || "";
    };
  }, [anyDropdownOpen]);

  // ---------------------------------- JSX ----------------------------------

  return (
    <form
      onSubmit={handleSubmit(onSubmit)}
      className="relative flex flex-col gap-2"
    >
      {/* Ligne 1 : Matériel / Date */}
      <div className="grid grid-cols-1 gap-2 midTablet:grid-cols-2">
        <div className={fieldWrap} ref={eqBoxRef}>
          <label className={labelCls}>
            <Wrench className="size-4" />
            Friteuse / Équipement
          </label>

          <div className="relative">
            {(() => {
              // Chaîner RHF + notre ref pour l'ancre exacte (INPUT)
              const fryerReg = register("fryerId", {
                onChange: () => {
                  eqUserTypedRef.current = true; // n’ouvre que si l’utilisateur tape
                },
              });
              return (
                <input
                  type="text"
                  placeholder="ex: fryer-1 / cuisine"
                  autoComplete="off"
                  spellCheck={false}
                  autoCorrect="off"
                  {...fryerReg}
                  ref={(el) => {
                    eqInputRef.current = el; // ⬅️ ancre exacte
                    fryerReg.ref(el); // garder la ref RHF
                  }}
                  className={`${inputCls} ${okBorder}`}
                  onKeyDown={onEqKeyDown}
                  onBlur={() =>
                    setTimeout(() => {
                      if (!pointerInPortalRef.current) {
                        setEqOpen(false);
                        setEqActiveIndex(-1);
                      }
                    }, 0)
                  }
                />
              );
            })()}

            {/* Suggestions ÉQUIPEMENT — via PORTAL, largeur = input, marge -4 */}
            {isClient &&
              eqOpen &&
              createPortal(
                (() => {
                  const anchor = eqInputRef.current;
                  if (!anchor) return null;
                  const style = getDropdownStyle(anchor, {
                    margin: -4,
                    maxListPx: 256,
                  });
                  return (
                    <div
                      ref={eqPortalRef}
                      style={style}
                      className="rounded-lg border border-darkBlue/15 bg-white shadow"
                      role="listbox"
                      aria-label="Suggestions équipements"
                      onScroll={onEqScroll}
                    >
                      {eqFiltered.map((name, idx) => {
                        const active = idx === eqActiveIndex;
                        return (
                          <button
                            key={`${name}-${idx}`}
                            type="button"
                            onMouseDown={(e) => e.preventDefault()}
                            onMouseEnter={() => setEqActiveIndex(idx)}
                            onClick={() => pickEq(name)}
                            className={`w-full text-left px-3 py-2 text-sm hover:bg-blue/5 ${
                              active ? "bg-blue/5" : ""
                            }`}
                            role="option"
                            aria-selected={active}
                            title={name}
                          >
                            {name}
                          </button>
                        );
                      })}

                      {/* états */}
                      {eqLoading && (
                        <div className="px-3 py-2 text-xs text-darkBlue/60">
                          Chargement…
                        </div>
                      )}
                      {eqError && (
                        <div className="px-3 py-2 text-xs text-red">
                          Erreur de chargement
                        </div>
                      )}
                      {eqFiltered.length === 0 && !eqLoading && !eqError && (
                        <div className="px-3 py-2 text-xs text-darkBlue/40">
                          Aucun résultat
                        </div>
                      )}
                    </div>
                  );
                })(),
                document.body
              )}
          </div>
        </div>

        <div className={fieldWrap}>
          <label className={labelCls}>
            <CalendarClock className="size-4" />
            Date / heure *
          </label>
          <input
            type="datetime-local"
            {...register("performedAt", { required: "Requis" })}
            className={selectCls}
          />
          {errors.performedAt && (
            <p className="mt-1 text-xs text-red">
              {errors.performedAt.message}
            </p>
          )}
        </div>
      </div>

      {/* Ligne 2 : Volume retiré / Lot / Fournisseur */}
      <div className="grid grid-cols-1 gap-2 midTablet:grid-cols-3">
        <div className={fieldWrap}>
          <label className={labelCls}>
            <Droplet className="size-4" />
            Litres retirés
          </label>
          <input
            type="number"
            step="0.1"
            placeholder="ex: 12.5"
            onWheel={(e) => e.currentTarget.blur()}
            {...register("litersRemoved")}
            className={inputCls}
          />
        </div>

        <div className={fieldWrap}>
          <label className={labelCls}>
            <Hash className="size-4" />
            N° lot (huile neuve)
          </label>
          <input
            type="text"
            placeholder="ex: OIL-2025-07-18-A"
            {...register("batchNumber")}
            className={inputCls}
            autoComplete="off"
            spellCheck={false}
            autoCorrect="off"
          />
        </div>

        <div className={fieldWrap}>
          <label className={labelCls}>
            <Building2 className="size-4" />
            Fournisseur
          </label>
          <input
            type="text"
            placeholder="Nom du fournisseur"
            {...register("supplier")}
            className={inputCls}
            autoComplete="off"
            spellCheck={false}
            autoCorrect="off"
          />
        </div>
      </div>

      {/* Ligne 3 : TPM + Filtrage (switch) */}
      <div className="grid grid-cols-1 gap-2 midTablet:grid-cols-3">
        <div className={fieldWrap}>
          <label className={labelCls}>
            <Percent className="size-4" />% TPM
          </label>
          <input
            type="number"
            step="0.1"
            min="0"
            max="100"
            onWheel={(e) => e.currentTarget.blur()}
            placeholder="ex: 22.5"
            {...register("tpmPercent")}
            className={inputCls}
          />
        </div>

        <div className={`${fieldWrap} midTablet:col-span-2`}>
          <label className={labelCls}>
            <Filter className="size-4" />
            Filtrage (service)
          </label>

          <label
            role="switch"
            aria-checked={!!filtered}
            className="group inline-flex justify-between h-11 w-full items-center gap-3 rounded-lg border border-darkBlue/20 bg-white px-3 py-2 cursor-pointer select-none"
          >
            <span className="text-sm text-darkBlue/70">
              {filtered ? "Filtrée avant/pendant" : "Non filtrée"}
            </span>

            <input
              type="checkbox"
              {...register("filteredBeforeChange")}
              className="sr-only peer"
              onChange={(e) =>
                setValue("filteredBeforeChange", e.target.checked, {
                  shouldDirty: true,
                })
              }
            />

            <span className="relative inline-flex h-6 w-11 items-center rounded-full bg-darkBlue/20 transition-colors peer-checked:bg-darkBlue/80">
              <span className="absolute left-1 top-1/2 -translate-y-1/2 size-4 rounded-full bg-white shadow transition-transform will-change-transform translate-x-0 peer-checked:translate-x-5" />
            </span>
          </label>
        </div>
      </div>

      {/* Ligne 4 : Couleur / Odeur / Marque */}
      <div className="grid grid-cols-1 gap-2 midTablet:grid-cols-3">
        <div className={fieldWrap}>
          <label className={labelCls}>
            <Palette className="size-4" />
            Couleur / Indice
          </label>
          <input
            type="text"
            placeholder="ex: dorée / ambrée / foncée…"
            {...register("colorIndex")}
            className={inputCls}
            autoComplete="off"
            spellCheck={false}
            autoCorrect="off"
          />
        </div>

        <div className={fieldWrap}>
          <label className={labelCls}>
            <Wind className="size-4" />
            Odeur
          </label>
          <input
            type="text"
            placeholder="ex: neutre, ok, rance…"
            {...register("odorCheck")}
            className={inputCls}
            autoComplete="off"
            spellCheck={false}
            autoCorrect="off"
          />
        </div>

        <div className={fieldWrap}>
          <label className={labelCls}>
            <Tag className="size-4" />
            Marque d’huile
          </label>
          <input
            type="text"
            placeholder="ex: XYZ ProFry"
            {...register("oilBrand")}
            className={inputCls}
            autoComplete="off"
            spellCheck={false}
            autoCorrect="off"
          />
        </div>
      </div>

      {/* Ligne 5 : Observations / Lien doc */}
      <div className="grid grid-cols-1 gap-2 midTablet:grid-cols-2">
        <div className={fieldWrap}>
          <label className={labelCls}>
            <FileText className="size-4" />
            Observations qualité
          </label>
          <div className="relative">
            <textarea
              rows={1}
              {...register("qualityNotes")}
              className="w-full resize-none rounded-lg border border-darkBlue/20 bg-white p-[10px] pr-16 text-[15px] outline-none transition placeholder:text-darkBlue/40"
              placeholder="Couleur, odeur, particules, filtrage, seuil TPM, etc."
            />
            <span className="pointer-events-none absolute bottom-2 right-3 select-none text-[11px] text-darkBlue/40">
              {(notesVal?.length ?? 0).toString()}
            </span>
          </div>
        </div>

        <div className={fieldWrap}>
          <label className={labelCls}>
            <LinkIcon className="size-4" />
            Lien doc. élimination (URL)
          </label>
          <input
            type="url"
            placeholder="https://… (BSDA, ticket collecte, etc.)"
            {...register("disposalDocumentUrl")}
            className={inputCls}
            autoComplete="off"
            spellCheck={false}
            autoCorrect="off"
          />
        </div>
      </div>

      {/* Actions */}
      <div className="flex flex-col gap-2 mt-3 mobile:flex-row">
        <button type="submit" disabled={isSubmitting} className={btnPrimary}>
          {isSubmitting ? (
            <div className="flex items-center gap-2">
              <Loader2 className="size-4 animate-spin" />
              <span>Enregistrement…</span>
            </div>
          ) : initial?._id ? (
            <>
              <FileText className="size-4" />
              Mettre à jour
            </>
          ) : (
            <>
              <FileText className="size-4" />
              Enregistrer
            </>
          )}
        </button>

        {initial?._id && (
          <button
            type="button"
            onClick={() => {
              reset(buildFormDefaults(null));
              onCancel?.();
            }}
            className={btnSecondary}
          >
            Annuler
          </button>
        )}
      </div>
    </form>
  );
}
