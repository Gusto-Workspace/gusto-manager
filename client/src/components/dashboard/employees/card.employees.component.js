import { useRouter } from 'next/router'

// I18N
import { useTranslation } from "next-i18next";

// SVG
import {
  AvatarSvg,
  DeleteSvg,
  RightArrowSvg,
} from "@/components/_shared/_svgs/_index";

export default function CardEmployeesComponent(props) {
  const { t } = useTranslation("employees");
  const router = useRouter()

  return (
    <div className="relative bg-white rounded-lg drop-shadow-sm px-6 pt-12 pb-2 flex flex-col items-center gap-2 h-fit z-[4]">
      <div className="absolute flex items-center justify-center -top-6 left-1/2 -translate-x-1/2 border border-darkBlue/5 w-14 h-14 rounded-full bg-lightGrey overflow-hidden">
        {props.employee.profilePicture ? (
          <img
            src={props.employee.profilePicture.url}
            className="w-full h-full object-cover"
            alt="profile"
          />
        ) : (
          <AvatarSvg width={30} fillColor="#131E3690" />
        )}
      </div>

      <h3 className="font-semibold">
        {props.employee.firstname} {props.employee.lastname}
      </h3>

      <h4 className="text-sm opacity-70">{props.employee.post}</h4>

      <hr className="bg-darkBlue h-[1px] w-[90%] opacity-20 mx-auto" />

      <div className="flex w-full justify-center">
        <div className="w-1/2 flex justify-center">
          <button
            onClick={() => router.push(`/dashboard/employees/${props.employee._id}`)}
            className="flex flex-col items-center gap-1 p-2"
          >
            <div className="hover:bg-[#634FD2] bg-[#634FD299] p-[6px] rounded-full transition-colors duration-300">
              <RightArrowSvg
                width={15}
                height={15}
                strokeColor="white"
                fillColor="white"
              />
            </div>
            <p className="text-xs text-center">Voir</p>
          </button>
        </div>

        <div className="w-1/2 flex justify-center">
          <button
            onClick={(e) => {
              props.handleDeleteClick(props.employee);
              e.stopPropagation();
            }}
            className="flex flex-col items-center gap-1 p-2"
          >
            <div className="hover:bg-[#FF7664] bg-[#FF766499] p-[6px] rounded-full transition-colors duration-300">
              <DeleteSvg
                width={15}
                height={15}
                strokeColor="white"
                fillColor="white"
              />
            </div>
            <p className="text-xs text-center">Supprimer</p>
          </button>
        </div>
      </div>
    </div>
  );
}
