import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import axios from "axios";
import { useTranslation } from "next-i18next";

// COMPONENTS
import FormInputComponent from "@/components/_shared/inputs/form-input.component";

// ICONS
import { X, Users } from "lucide-react";

const CLOSE_MS = 250;

export default function AddOwnerModalComponent(props) {
  const { t } = useTranslation("admin");

  const [loading, setLoading] = useState(false);
  const [isVisible, setIsVisible] = useState(false);

  // ✅ lock edit/create mode (évite que password apparaisse si props.owner devient null)
  const [initialIsEdit] = useState(() => !!props.owner);
  const [initialOwnerId] = useState(() => props.owner?._id || null);

  const {
    register,
    handleSubmit,
    formState: { errors },
    reset,
  } = useForm();

  useEffect(() => {
    // ✅ entrée : on déclenche au frame suivant pour que la transition s'applique (mobile)
    const raf = requestAnimationFrame(() => setIsVisible(true));

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

    return () => cancelAnimationFrame(raf);

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
    setTimeout(() => props.closeModal(), CLOSE_MS);
  }

  async function onSubmit(data) {
    const ownerData = data.ownerData;

    try {
      setLoading(true);

      let response;

      if (initialIsEdit && initialOwnerId) {
        response = await axios.put(
          `${process.env.NEXT_PUBLIC_API_URL}/admin/owners/${initialOwnerId}`,
          { ownerData },
        );
        props.handleEditOwner(response.data.owner);
      } else {
        response = await axios.post(
          `${process.env.NEXT_PUBLIC_API_URL}/admin/add-owner`,
          { ownerData },
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
        className={`
          absolute inset-0 bg-black/35
          transition-opacity duration-200
          ${isVisible ? "opacity-100" : "opacity-0"}
          tablet:opacity-100 tablet:transition-none
        `}
        onClick={() => {
          if (!loading) closeWithAnimation();
        }}
      />

      {/* Panel */}
      <div
        className={`
          relative z-[1]
          w-full tablet:w-[720px]
          max-h-[92vh] tablet:max-h-[86vh]
          overflow-y-auto
          bg-lightGrey
          border border-darkBlue/10
          shadow-[0_18px_45px_rgba(19,30,54,0.18)]
          rounded-t-2xl tablet:rounded-2xl
          hide-scrollbar

          transform transition-transform duration-300 ease-out
          ${isVisible ? "translate-y-0" : "translate-y-full"}

          tablet:translate-y-0 tablet:transition-none tablet:transform-none
        `}
      >
        {/* Header */}
        <div className="sticky top-0 z-10 bg-white border-b border-darkBlue/10 px-4 py-3">
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
