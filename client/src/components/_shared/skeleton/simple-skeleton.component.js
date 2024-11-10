export default function SimpleSkeletonComponent(props) {
  return (
    <div className={`gap-2 w-full animate-pulse flex ${props.justify}`}>
      <div className="bg-black bg-opacity-15 h-6 w-44 rounded-lg " />
    </div>
  );
}
