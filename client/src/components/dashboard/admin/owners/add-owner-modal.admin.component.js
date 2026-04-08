import { useEffect, useRef, useState } from "react";
import { useForm } from "react-hook-form";
import axios from "axios";
import { useTranslation } from "next-i18next";
import { getAdminAuthConfig } from "../_shared/utils/admin-auth.utils";

// COMPONENTS
import FormInputComponent from "@/components/_shared/inputs/form-input.component";

// ICONS
import { X, Users } from "lucide-react";

const CLOSE_MS = 280;
const SWIPE_VELOCITY = 0.6;
const CLOSE_RATIO = 0.25;

export default function AddOwnerModalComponent(props) {
  const { t } = useTranslation("admin");

  const [loading, setLoading] = useState(false);
  const [isVisible, setIsVisible] = useState(false);
  const [isTabletUp, setIsTabletUp] = useState(false);
  const [viewportReady, setViewportReady] = useState(false);
  const [panelH, setPanelH] = useState(null);
  const [dragY, setDragY] = useState(0);

  // ✅ lock edit/create mode (évite que password apparaisse si props.owner devient null)
  const [initialIsEdit] = useState(() => !!props.owner);
  const [initialOwnerId] = useState(() => props.owner?._id || null);
  const panelRef = useRef(null);
  const dragStateRef = useRef({
    active: false,
    startY: 0,
    lastY: 0,
    startT: 0,
    lastT: 0,
  });

  const {
    register,
    handleSubmit,
    formState: { errors },
    reset,
  } = useForm();

  const measurePanel = () => {
    const element = panelRef.current;
    if (!element) return;
    const height = element.getBoundingClientRect().height || 0;
    if (height > 0) setPanelH(height);
  };

  useEffect(() => {
    if (typeof window === "undefined") return;

    const mq = window.matchMedia("(min-width: 768px)");
    const update = () => {
      setIsTabletUp(mq.matches);
      setViewportReady(true);
    };

    update();
    if (mq.addEventListener) mq.addEventListener("change", update);
    else mq.addListener(update);

    return () => {
      if (mq.removeEventListener) mq.removeEventListener("change", update);
      else mq.removeListener(update);
    };
  }, []);

  useEffect(() => {
    // ✅ entrée : on déclenche au frame suivant pour que la transition s'applique (mobile)
    const raf = requestAnimationFrame(() => {
      setIsVisible(true);
      setDragY(0);
      requestAnimationFrame(measurePanel);
    });
    const onResize = () => requestAnimationFrame(measurePanel);
    window.addEventListener("resize", onResize);

    // ✅ init form une seule fois
    if (initialIsEdit && props.owner) {
      reset({
        ownerData: {
          firstname: props.owner.firstname,
          lastname: props.owner.lastname,
          email: props.owner.email,
          phoneNumber: props.owner.phoneNumber,
        },
      });
    } else if (!initialIsEdit) {
      reset();
    }

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", onResize);
    };

    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // init only

  function closeWithAnimation() {
    // ✅ Sur tablet+ : fermeture instantanée
    const isTabletUp =
      typeof window !== "undefined" &&
      window.matchMedia("(min-width: 768px)").matches;

    if (isTabletUp) {
      props.closeModal();
      return;
    }

    // ✅ Sur mobile : slide down + fade
    setIsVisible(false);
    setDragY(0);
    setTimeout(() => props.closeModal(), CLOSE_MS);
  }

  const panelFallback = 720;
  const dragMaxPx = Math.max(240, (panelH || panelFallback) - 12);
  const swipeClosePx = Math.max(
    90,
    Math.floor((panelH || panelFallback) * CLOSE_RATIO),
  );

  const onPointerDown = (event) => {
    if (isTabletUp) return;
    if (event.pointerType === "mouse" && event.button !== 0) return;

    dragStateRef.current.active = true;
    dragStateRef.current.startY = event.clientY;
    dragStateRef.current.lastY = event.clientY;
    dragStateRef.current.startT = performance.now();
    dragStateRef.current.lastT = dragStateRef.current.startT;

    try {
      event.currentTarget.setPointerCapture?.(event.pointerId);
    } catch {}
  };

  const onPointerMove = (event) => {
    if (isTabletUp) return;
    if (!dragStateRef.current.active) return;

    const nextY = event.clientY;
    const deltaY = nextY - dragStateRef.current.startY;

    dragStateRef.current.lastY = nextY;
    dragStateRef.current.lastT = performance.now();

    setDragY(Math.max(0, Math.min(dragMaxPx, deltaY)));
  };

  const onPointerUp = () => {
    if (isTabletUp) return;
    if (!dragStateRef.current.active) return;
    dragStateRef.current.active = false;

    const elapsed = Math.max(
      1,
      dragStateRef.current.lastT - dragStateRef.current.startT,
    );
    const velocity =
      (dragStateRef.current.lastY - dragStateRef.current.startY) / elapsed;

    if (dragY >= swipeClosePx || velocity >= SWIPE_VELOCITY) {
      closeWithAnimation();
      return;
    }

    setDragY(0);
  };

  async function onSubmit(data) {
    const ownerData = data.ownerData;

    try {
      setLoading(true);

      let response;

      if (initialIsEdit && initialOwnerId) {
        response = await axios.put(
          `${process.env.NEXT_PUBLIC_API_URL}/admin/owners/${initialOwnerId}`,
          { ownerData },
          getAdminAuthConfig(),
        );
        props.handleEditOwner(response.data.owner);
      } else {
        response = await axios.post(
          `${process.env.NEXT_PUBLIC_API_URL}/admin/add-owner`,
          { ownerData },
          getAdminAuthConfig(),
        );
        props.handleAddOwner(response.data.owner);
      }

      setLoading(false);
      closeWithAnimation();
    } catch (error) {
      console.error(
        "Erreur lors de l'ajout/mise à jour du propriétaire:",
        error,
      );
      alert("Erreur lors de l'ajout/mise à jour du propriétaire.");
      setLoading(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-[200] flex items-end tablet:items-center justify-center"
      role="dialog"
      aria-modal="true"
    >
      {/* Backdrop */}
      <div
        className={`absolute inset-0 bg-black/35 transition-opacity ease-out ${
          isVisible ? "opacity-100" : "opacity-0"
        }`}
        style={{ transitionDuration: `${CLOSE_MS}ms`, willChange: "opacity" }}
        onClick={() => {
          if (!loading) closeWithAnimation();
        }}
      />

      {/* Panel */}
      <div
        ref={panelRef}
        className={`
          relative z-[1]
          w-full tablet:w-[720px]
          max-h-[90vh] tablet:max-h-[86vh]
          overflow-y-auto
          bg-lightGrey
          border border-darkBlue/10
          shadow-[0_18px_45px_rgba(19,30,54,0.18)]
          rounded-t-3xl tablet:rounded-2xl
          hide-scrollbar

          transform-gpu transition-transform ease-out will-change-transform
          ${isVisible ? "translate-y-0" : "translate-y-full"}
          tablet:translate-y-0 tablet:transition-none tablet:transform-none
        `}
        style={
          !viewportReady || isTabletUp
            ? {
                backfaceVisibility: "hidden",
              }
            : {
                transform: isVisible
                  ? `translate3d(0, ${dragY}px, 0)`
                  : "translate3d(0, 100%, 0)",
                transition: dragStateRef.current.active
                  ? "none"
                  : `transform ${CLOSE_MS}ms ease-out`,
                willChange: "transform",
                backfaceVisibility: "hidden",
              }
        }
      >
        <div className="sticky top-0 z-10 bg-white">
          <div
            className="tablet:hidden cursor-grab active:cursor-grabbing touch-none"
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onPointerCancel={onPointerUp}
          >
            <div className="py-3 flex justify-center bg-white">
              <div className="h-1.5 w-12 rounded-full bg-darkBlue/20" />
            </div>
          </div>

          {/* Header */}
          <div className="bg-white border-b border-darkBlue/10 px-4 py-3">
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-2 min-w-0">
                <div className="inline-flex size-9 items-center justify-center rounded-xl bg-darkBlue/5 border border-darkBlue/10">
                  <Users className="size-4 text-darkBlue/70" />
                </div>

                <div className="min-w-0">
                  <h2 className="text-base font-semibold text-darkBlue truncate">
                    {initialIsEdit ? t("owner.form.edit") : t("owner.form.add")}
                  </h2>
                  <p className="text-xs text-darkBlue/50 truncate">
                    {t("owner.form.infos")}
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={() => {
                  if (!loading) closeWithAnimation();
                }}
                className="inline-flex items-center justify-center rounded-xl border border-darkBlue/10 bg-white hover:bg-darkBlue/5 transition p-2"
                aria-label="Close"
              >
                <X className="size-4 text-darkBlue/70" />
              </button>
            </div>
          </div>
        </div>

        {/* Form */}
        <div className="mx-4 my-4">
          <form
            onSubmit={handleSubmit(onSubmit)}
            className="flex flex-col gap-4"
          >
            <div className="rounded-2xl bg-white/70 border border-darkBlue/10 p-4">
              <div className="grid grid-cols-1 mobile:grid-cols-2 gap-2">
                <FormInputComponent
                  name="ownerData.firstname"
                  placeholder={t("owner.form.firstname")}
                  register={register}
                  required={true}
                  errors={errors}
                />

                <FormInputComponent
                  name="ownerData.lastname"
                  placeholder={t("owner.form.lastname")}
                  register={register}
                  required={true}
                  errors={errors}
                />
              </div>

              <div className="mt-3 flex flex-col gap-3">
                <FormInputComponent
                  name="ownerData.email"
                  placeholder={t("owner.form.email")}
                  register={register}
                  required={true}
                  errors={errors}
                />

                <FormInputComponent
                  name="ownerData.phoneNumber"
                  placeholder={t("owner.form.phoneNumber")}
                  register={register}
                  required={true}
                  errors={errors}
                />

                {/* ✅ Password uniquement en création (mode verrouillé) */}
                {!initialIsEdit && (
                  <FormInputComponent
                    name="ownerData.password"
                    placeholder={t("owner.form.password")}
                    register={register}
                    required={true}
                    errors={errors}
                    type="password"
                  />
                )}
              </div>
            </div>

            {/* Actions */}
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => {
                  if (!loading) closeWithAnimation();
                }}
                className="flex-1 inline-flex items-center justify-center rounded-xl border border-red bg-red/85 hover:bg-red/75 transition py-2 text-sm font-semibold text-white disabled:opacity-60"
                disabled={loading}
              >
                {t("owner.list.buttons.cancel")}
              </button>

              <button
                type="submit"
                disabled={loading}
                className="flex-1 inline-flex items-center justify-center gap-2 rounded-xl bg-blue text-white py-2 text-sm font-semibold shadow-sm hover:bg-blue/90 disabled:opacity-60"
              >
                {loading
                  ? t("buttons.loading")
                  : initialIsEdit
                    ? t("owner.list.buttons.edit")
                    : t("owner.list.buttons.add")}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
