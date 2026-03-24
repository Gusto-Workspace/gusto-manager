import { LoaderIcon } from "lucide-react";

export default function NoAvailableComponent({ dataLoading }) {
  return (
    <div className="flex items-center justify-center flex-1 h-[100dvh]">
      {dataLoading ? (
        <p className="italic">
          <LoaderIcon className="size-8 animate-spin" />
        </p>
      ) : (
        <p className="italic">Vous n'avez pas souscrit à cette option</p>
      )}
    </div>
  );
}
