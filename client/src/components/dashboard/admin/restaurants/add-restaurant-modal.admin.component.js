import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/router";

// REACT HOOK FORM
import { useForm } from "react-hook-form";

// AXIOS
import axios from "axios";

// I18N
import { useTranslation } from "next-i18next";
import { getAdminAuthConfig } from "../_shared/utils/admin-auth.utils";

// COMPONENTS
import FormInputComponent from "@/components/_shared/inputs/form-input.component";
import { VisibleSvg } from "@/components/_shared/_svgs/visible.svg";
import { NoVisibleSvg } from "@/components/_shared/_svgs/no-visible.svg";

// ICONS (lucide)
import { X, Store, MapPin, Settings2, CreditCard, Users } from "lucide-react";

const CLOSE_MS = 280;
const SWIPE_VELOCITY = 0.6;
const CLOSE_RATIO = 0.25;

export default function AddRestaurantModal(props) {
  const { t } = useTranslation("admin");
  const router = useRouter();

  const [owners, setOwners] = useState([]);
  const [loading, setLoading] = useState(false);
  const [showStripeKey, setShowStripeKey] = useState(false);
  const [submitError, setSubmitError] = useState("");

  // ✅ animation (mobile only thanks to tablet: overrides)
  const [isVisible, setIsVisible] = useState(false);
  const [isTabletUp, setIsTabletUp] = useState(false);
  const [viewportReady, setViewportReady] = useState(false);
  const [panelH, setPanelH] = useState(null);
  const [dragY, setDragY] = useState(0);

  // ✅ lock "edit" mode
  const [initialIsEdit] = useState(() => !!props.restaurant);
  const [initialRestaurantId] = useState(() => props.restaurant?._id || null);
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
    setValue,
    watch,
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

  useEffect(() => {
    // ✅ entrée : on déclenche au mount => mobile slide-up / tablet instant (car overrides)
    const raf = requestAnimationFrame(() => {
      setIsVisible(true);
      setDragY(0);
      requestAnimationFrame(measurePanel);
    });
    const onResize = () => requestAnimationFrame(measurePanel);
    window.addEventListener("resize", onResize);

    async function fetchOwners() {
      try {
        const response = await axios.get(
          `${process.env.NEXT_PUBLIC_API_URL}/admin/owners`,
          getAdminAuthConfig(),
        );
        setOwners(response.data.owners);

        if (props.restaurant?.owner_id?._id) {
          setValue("existingOwnerId", props.restaurant.owner_id._id);
        }
      } catch (error) {
        console.error("Erreur lors du chargement des propriétaires:", error);
      }
    }

    async function fetchStripeKey() {
      if (!props.restaurant?._id) return;
      try {
        const response = await axios.get(
          `${process.env.NEXT_PUBLIC_API_URL}/admin/restaurants/${props.restaurant._id}/stripe-key`,
          getAdminAuthConfig(),
        );
        setValue("stripeSecretKey", response.data.stripeKey || "");
      } catch (error) {
        console.error(
          "Erreur lors de la récupération de la clé Stripe:",
          error,
        );
      }
    }

    fetchOwners();
    fetchStripeKey();

    // init form (1 fois)
    if (props.restaurant) {
      reset({
        restaurantData: {
          name: props.restaurant.name,
          address: {
            line1: props.restaurant.address?.line1 || "",
            zipCode: props.restaurant.address?.zipCode || "",
            city: props.restaurant.address?.city || "",
            country: props.restaurant.address?.country || "France",
          },
          phone: props.restaurant.phone,
          email: props.restaurant.email,
          website: props.restaurant.website,
          options: {
            dishes: props.restaurant.options?.dishes ?? true,
            menus: props.restaurant.options?.menus ?? true,
            drinks: props.restaurant.options?.drinks ?? true,
            wines: props.restaurant.options?.wines ?? true,
            news: props.restaurant.options?.news ?? true,
            gift_card: props.restaurant.options?.gift_card ?? false,
            reservations: props.restaurant.options?.reservations ?? false,
            customers: props.restaurant.options?.customers ?? false,
            employees: props.restaurant.options?.employees ?? false,
            take_away: props.restaurant.options?.take_away ?? false,
            health_control_plan:
              props.restaurant.options?.health_control_plan ?? false,
          },
        },
      });
    } else {
      reset();
      props.setIsExistingOwner(false);
    }

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", onResize);
    };

    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // init only

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
    const restaurantData = data.restaurantData;
    const stripeSecretKey = data.stripeSecretKey;

    let ownerData = null;
    let existingOwnerId = null;

    if (props.isExistingOwner) existingOwnerId = data.existingOwnerId;
    else ownerData = data.ownerData;

    try {
      setLoading(true);
      setSubmitError("");

      const payload = {
        restaurantData,
        ownerData,
        existingOwnerId,
        stripeSecretKey,
      };

      let response;

      if (initialIsEdit && initialRestaurantId) {
        response = await axios.put(
          `${process.env.NEXT_PUBLIC_API_URL}/admin/restaurants/${initialRestaurantId}`,
          payload,
          getAdminAuthConfig(),
        );
        props.handleEditRestaurant(response.data.restaurant);

        if (response.data.payerChangeRequired && response.data.payerChange) {
          setLoading(false);
          closeWithAnimation();

          setTimeout(() => {
            router.push(
              `/dashboard/admin/subscriptions/change-payer/${response.data.payerChange.restaurantId}`,
            );
          }, CLOSE_MS);
          return;
        }
      } else {
        response = await axios.post(
          `${process.env.NEXT_PUBLIC_API_URL}/admin/add-restaurant`,
          payload,
          getAdminAuthConfig(),
        );
        props.handleAddRestaurant(response.data.restaurant);
      }

      setLoading(false);
      closeWithAnimation();
    } catch (error) {
      console.error("Erreur lors de l'ajout/mise à jour du restaurant:", error);
      setSubmitError(
        error?.response?.data?.message ||
          "Erreur lors de l'ajout ou de la mise à jour du restaurant.",
      );
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

          {/* Header sticky */}
          <div className="bg-white border-b border-darkBlue/10 px-4 py-3">
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-2 min-w-0">
                <div className="inline-flex size-9 items-center justify-center rounded-xl bg-darkBlue/5 border border-darkBlue/10">
                  <Store className="size-4 text-darkBlue/70" />
                </div>

                <div className="min-w-0">
                  <h2 className="text-base font-semibold text-darkBlue truncate">
                    {initialIsEdit
                      ? t("restaurants.form.edit")
                      : t("restaurants.form.add")}
                  </h2>
                  <p className="text-xs text-darkBlue/50 truncate">
                    {t("restaurants.form.contact")}
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
            {submitError ? (
              <div className="rounded-xl border border-red/20 bg-red/10 px-4 py-3 text-sm text-red">
                {submitError}
              </div>
            ) : null}

            {/* CARD: Restaurant */}
            <div className="rounded-2xl bg-white/70 border border-darkBlue/10 p-4">
              <div className="flex items-center gap-2 mb-3">
                <div className="inline-flex size-8 items-center justify-center rounded-xl bg-darkBlue/5 border border-darkBlue/10">
                  <Store className="size-4 text-darkBlue/70" />
                </div>
                <h3 className="text-sm font-semibold text-darkBlue">
                  {t("restaurants.form.name")}
                </h3>
              </div>

              <FormInputComponent
                name="restaurantData.name"
                placeholder={t("restaurants.form.name")}
                register={register}
                required={true}
                errors={errors}
              />
            </div>

            {/* CARD: Contact */}
            <div className="rounded-2xl bg-white/70 border border-darkBlue/10 p-4">
              <div className="flex items-center gap-2 mb-3">
                <div className="inline-flex size-8 items-center justify-center rounded-xl bg-darkBlue/5 border border-darkBlue/10">
                  <MapPin className="size-4 text-darkBlue/70" />
                </div>
                <h3 className="text-sm font-semibold text-darkBlue">
                  {t("restaurants.form.contact")}
                </h3>
              </div>

              <div className="flex flex-col gap-3">
                <FormInputComponent
                  name="restaurantData.address.line1"
                  placeholder={t("restaurants.form.address.line1")}
                  register={register}
                  required={true}
                  errors={errors}
                />

                <div className="grid grid-cols-1 mobile:grid-cols-2 gap-2">
                  <FormInputComponent
                    name="restaurantData.address.zipCode"
                    placeholder={t("restaurants.form.address.zipCode")}
                    register={register}
                    required={true}
                    errors={errors}
                  />
                  <FormInputComponent
                    name="restaurantData.address.city"
                    placeholder={t("restaurants.form.address.city")}
                    register={register}
                    required={true}
                    errors={errors}
                  />
                </div>

                <FormInputComponent
                  name="restaurantData.address.country"
                  placeholder={t("restaurants.form.address.country")}
                  register={register}
                  required={true}
                  errors={errors}
                  defaultValue="France"
                />

                <div className="grid grid-cols-1 mobile:grid-cols-2 gap-2">
                  <FormInputComponent
                    name="restaurantData.email"
                    placeholder={t("restaurants.form.email")}
                    register={register}
                    required={true}
                    errors={errors}
                  />
                  <FormInputComponent
                    name="restaurantData.phone"
                    placeholder={t("restaurants.form.phone")}
                    register={register}
                    required={true}
                    errors={errors}
                  />
                </div>

                <FormInputComponent
                  name="restaurantData.website"
                  placeholder={t("restaurants.form.web")}
                  register={register}
                  required={true}
                  errors={errors}
                />
              </div>
            </div>

            {/* CARD: Options */}
            <div className="rounded-2xl bg-white/70 border border-darkBlue/10 p-4">
              <div className="flex items-center gap-2 mb-3">
                <div className="inline-flex size-8 items-center justify-center rounded-xl bg-darkBlue/5 border border-darkBlue/10">
                  <Settings2 className="size-4 text-darkBlue/70" />
                </div>
                <h3 className="text-sm font-semibold text-darkBlue">
                  {t("restaurants.form.options.title")}
                </h3>
              </div>

              <div className="grid grid-cols-1 mobile:grid-cols-2 gap-2">
                {[
                  { key: "dishes", label: "La carte" },
                  { key: "menus", label: "Les menus" },
                  { key: "drinks", label: "Les boissons" },
                  { key: "wines", label: "Les vins" },
                  { key: "news", label: "Les actualités" },
                  {
                    key: "gift_card",
                    label: t("restaurants.form.options.giftCard"),
                  },
                  {
                    key: "reservations",
                    label: t("restaurants.form.options.reservations"),
                  },
                  {
                    key: "customers",
                    label: t("restaurants.form.options.customers"),
                  },
                  { key: "employees", label: "Gestion du personnel" },
                  {
                    key: "take_away",
                    label: t("restaurants.form.options.takeAway"),
                  },
                  {
                    key: "health_control_plan",
                    label: t("restaurants.form.options.healthControlPlan"),
                  },
                ].map((opt) => (
                  <label
                    key={opt.key}
                    className="flex items-center gap-3 rounded-xl border border-darkBlue/10 bg-white/60 px-3 py-2 hover:bg-darkBlue/5 transition cursor-pointer"
                  >
                    <input
                      className="size-4 accent-blue"
                      type="checkbox"
                      {...register(`restaurantData.options.${opt.key}`)}
                    />
                    <span className="text-sm text-darkBlue/80">
                      {opt.label}
                    </span>
                  </label>
                ))}
              </div>
            </div>

            {/* CARD: Stripe */}
            <div className="rounded-2xl bg-white/70 border border-darkBlue/10 p-4">
              <div className="flex items-center gap-2 mb-3">
                <div className="inline-flex size-8 items-center justify-center rounded-xl bg-darkBlue/5 border border-darkBlue/10">
                  <CreditCard className="size-4 text-darkBlue/70" />
                </div>
                <h3 className="text-sm font-semibold text-darkBlue">
                  {t("restaurants.form.stripeSecretKey")}
                </h3>
              </div>

              <div className="flex items-center gap-3">
                <div className="flex-1">
                  <FormInputComponent
                    name="stripeSecretKey"
                    placeholder={
                      watch("stripeSecretKey")
                        ? "••••••••••••••••••••••••••••"
                        : "Saisir la clé Stripe"
                    }
                    register={register}
                    errors={errors}
                    disabled={showStripeKey ? false : true}
                    type={showStripeKey ? "text" : "password"}
                  />
                </div>

                <button
                  type="button"
                  onClick={() => setShowStripeKey(!showStripeKey)}
                  className="inline-flex items-center justify-center rounded-xl border border-darkBlue/10 bg-white hover:bg-darkBlue/5 transition p-3"
                  aria-label="Toggle Stripe key visibility"
                >
                  {showStripeKey ? (
                    <VisibleSvg width={22} height={22} />
                  ) : (
                    <NoVisibleSvg width={22} height={22} />
                  )}
                </button>
              </div>
            </div>

            {/* CARD: Owner */}
            <div className="rounded-2xl bg-white/70 border border-darkBlue/10 p-4">
              <div className="flex items-center gap-2 mb-3">
                <div className="inline-flex size-8 items-center justify-center rounded-xl bg-darkBlue/5 border border-darkBlue/10">
                  <Users className="size-4 text-darkBlue/70" />
                </div>
                <h3 className="text-sm font-semibold text-darkBlue">
                  {t("owner.form.infos")}
                </h3>
              </div>

              <div className="flex gap-4 flex-wrap">
                <label className="flex gap-2 items-center text-sm text-darkBlue/80">
                  <input
                    type="radio"
                    name="ownerType"
                    value="new"
                    checked={!props.isExistingOwner}
                    onChange={() => props.setIsExistingOwner(false)}
                    className="accent-blue"
                  />
                  {t("owner.form.createNew")}
                </label>

                <label className="flex gap-2 items-center text-sm text-darkBlue/80">
                  <input
                    type="radio"
                    name="ownerType"
                    value="existing"
                    checked={props.isExistingOwner}
                    onChange={() => props.setIsExistingOwner(true)}
                    className="accent-blue"
                  />
                  {t("owner.form.selectExisting")}
                </label>
              </div>

              {props.isExistingOwner ? (
                <div className="w-full mt-3">
                  <select
                    name="existingOwnerId"
                    {...register("existingOwnerId", { required: true })}
                    value={watch("existingOwnerId") || ""}
                    onChange={(e) =>
                      setValue("existingOwnerId", e.target.value)
                    }
                    className={`
                      w-full rounded-xl bg-white/70 px-3 py-2 text-sm outline-none transition
                      border ${errors.existingOwnerId ? "border-red" : "border-darkBlue/10"}
                      focus:border-blue/40
                    `}
                  >
                    <option value="">{t("owner.form.select")}</option>
                    {owners.map((owner) => (
                      <option key={owner._id} value={owner._id}>
                        {owner.firstname} {owner.lastname} ({owner.email})
                      </option>
                    ))}
                  </select>
                </div>
              ) : (
                <div className="flex flex-col gap-3 mt-3">
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

                  <FormInputComponent
                    name="ownerData.phoneNumber"
                    placeholder={t("owner.form.phoneNumber")}
                    register={register}
                    required={true}
                    errors={errors}
                  />

                  <FormInputComponent
                    name="ownerData.email"
                    placeholder={t("owner.form.email")}
                    register={register}
                    required={true}
                    errors={errors}
                  />

                  <FormInputComponent
                    name="ownerData.password"
                    placeholder={t("owner.form.password")}
                    register={register}
                    required={true}
                    errors={errors}
                    type="password"
                  />
                </div>
              )}
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
                {t("restaurants.form.buttons.cancel")}
              </button>

              <button
                type="submit"
                disabled={loading}
                className="flex-1 inline-flex items-center justify-center gap-2 rounded-xl bg-blue text-white py-2 text-sm font-semibold shadow-sm hover:bg-blue/90 disabled:opacity-60"
              >
                {loading
                  ? t("buttons.loading")
                  : initialIsEdit
                    ? t("restaurants.form.buttons.edit")
                    : t("restaurants.form.buttons.add")}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
