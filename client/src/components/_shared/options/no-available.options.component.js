export default function NoAvailableComponent({
  dataLoading,
  loadingText = "Chargement ...",
  emptyText = "Vous n'avez pas souscrit à cette option",
}) {
  return (
    <div className="flex items-center justify-center flex-1">
      {dataLoading ? (
        <p className="italic">{loadingText}</p>
      ) : (
        <p className="italic">{emptyText}</p>
      )}
    </div>
  );
}
