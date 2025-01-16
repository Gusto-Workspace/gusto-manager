export default function NoAvailableComponent(props) {
  return (
    <div className="flex items-center justify-center flex-1">
      {props.dataLoading ? (
        <p className="italic">Chargement ...</p>
      ) : (
        <p className="italic">Vous n'avez pas souscrit à cette option</p>
      )}
    </div>
  );
}
