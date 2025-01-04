export default function SimpleSkeletonComponent(props) {
  return (
    <div className={`gap-2 animate-pulse flex ${props.justify}`}>
      <div className={`bg-black bg-opacity-15 w-32 tablet:w-44 rounded-lg ${props.height ?? "h-6"}`} />
    </div>
  );
}
