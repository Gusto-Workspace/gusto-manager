// SVG
import { AvatarSvg } from "@/components/_shared/_svgs/avatar.svg";
import { EditSvg } from "@/components/_shared/_svgs/edit.svg";

// I18N
import { useTranslation } from "next-i18next";


export default function DataEmployeesComponent(props){
    const { t } = useTranslation("employees");

    return(
        <section className="bg-white p-6 rounded-lg shadow flex flex-col midTablet:flex-row justify-between items-start relative">
       
        {!props?.isEditing && (
          <button
            className="absolute right-0 top-0 p-2"
            onClick={(e) => {
              e.stopPropagation();
              props?.setIsEditing(true);
            }}
          >
            <div className="hover:opacity-100 opacity-20 p-[6px] rounded-full transition-opacity">
              <EditSvg
                width={20}
                height={20}
                strokeColor="#131E36"
                fillColor="#131E36"
              />
            </div>
          </button>
        )}

        <form
          onSubmit={props?.handleDetailsSubmit(props?.onSaveDetails)}
          className="flex flex-col-reverse midTablet:flex-row justify-between items-start w-full gap-6"
        >
          <div className="flex flex-col gap-4 w-full midTablet:w-2/3">
            {props?.isEditing ? (
              <div className="flex gap-2 mb-4">
                <input
                  {...props?.regDetails("firstname", { required: true })}
                  disabled={props?.isSavingDetails}
                  className="w-1/2 p-2 border border-darkBlue/50 rounded-lg"
                />
              
                <input
                  {...props?.regDetails("lastname", { required: true })}
                  disabled={props?.isSavingDetails}
                  className="w-1/2 p-2 border border-darkBlue/50 rounded-lg"
                />
              </div>
            ) : (
              <h2 className="text-2xl font-semibold mb-4 text-center midTablet:text-start">
                {props?.employee.firstname} {props?.employee.lastname}
              </h2>
            )}

            {[
              ["post", t("labels.post"), props?.employee.post],
              [
                "dateOnPost",
                t("labels.dateOnPost"),
                new Date(props?.employee.dateOnPost).toLocaleDateString("fr-FR"),
              ],
              ["email", t("labels.email"), props?.employee.email],
              ["phone", t("labels.phone"), props?.employee.phone],
              ["secuNumber", t("labels.secuNumber"), props?.employee.secuNumber],
              ["address", t("labels.address"), props?.employee.address],
              [
                "emergencyContact",
                t("labels.emergencyContact"),
                props?.employee.emergencyContact,
              ],
            ].map(([field, label, value]) => {
              const isRequired = ![
                "secuNumber",
                "address",
                "emergencyContact",
              ].includes(field);
              return (
                <p className="flex flex-col midTablet:block" key={field}>
                  <strong>{label} :</strong>{" "}
                
                  {props?.isEditing ? (
                    <input
                      type={field === "dateOnPost" ? "date" : "text"}
                      {...props?.regDetails(field, { required: isRequired })}
                      disabled={props?.isSavingDetails}
                      className="p-2 border border-darkBlue/50 rounded-lg"
                      defaultValue={value}
                    />
                  ) : (
                    value
                  )}
                </p>
              );
            })}
          </div>

          {/* Photo */}
          <div className="relative w-44 h-44 flex-shrink-0 mx-auto midTablet:mx-0 rounded-full overflow-hidden border border-darkBlue/20">
            {props?.previewUrl ? (
              <img
                src={props?.previewUrl}
                alt="aperçu"
                className="w-full h-full object-cover"
              />
            ) : (
              <div className="flex items-center justify-center w-full h-full bg-lightGrey">
                <AvatarSvg width={40} height={40} fillColor="#131E3690" />
              </div>
            )}
          
            {props?.isEditing && !props?.isSavingDetails && (
              <div
                className="absolute inset-0 bg-black bg-opacity-30 opacity-0 hover:opacity-100 transition-opacity flex items-center justify-center cursor-pointer"
                onClick={() => props?.fileInputRef.current.click()}
              >
                <EditSvg
                  width={24}
                  height={24}
                  strokeColor="#fff"
                  fillColor="#fff"
                />
              </div>
            )}
         
            <input
              ref={props?.fileInputRef}
              type="file"
              accept=".jpg,.jpeg,.png,.webp"
              className="hidden"
              disabled={props?.isSavingDetails}
              onChange={props?.handleFileSelect}
            />
          </div>
        </form>

        {props?.isEditing && (
          <div className="mt-6 midTablet:mt-0 midTablet:absolute bottom-4 right-4 flex gap-4">
            <button
              type="button"
              disabled={props?.isSavingDetails}
              onClick={() => {
                props.resetDetails({
                  firstname: props?.employee.firstname,
                  lastname: props?.employee.lastname,
                  post: props?.employee.post,
                  dateOnPost: props?.employee.dateOnPost?.slice(0, 10),
                  email: props?.employee.email,
                  phone: props?.employee.phone,
                  secuNumber: props?.employee.secuNumber,
                  address: props?.employee.address,
                  emergencyContact: props?.employee.emergencyContact,
                });
                props?.setProfileFile(null);
                props?.setPreviewUrl(props?.employee.profilePicture?.url || null);
                props?.setIsEditing(false);
              }}
              className="px-4 py-2 rounded-lg bg-red text-white"
            >
              {t("buttons.cancel")}
            </button>

            <button
              type="submit"
              onClick={props?.handleDetailsSubmit(props?.onSaveDetails)}
              disabled={(!props?.detailsDirty && !props?.profileFile) || props?.isSavingDetails}
              className="px-4 py-2 rounded-lg bg-blue text-white disabled:opacity-40"
            >
              {props?.isSavingDetails ? t("buttons.loading") : t("buttons.save")}
            </button>
          </div>
        )}
      </section>
    )
}