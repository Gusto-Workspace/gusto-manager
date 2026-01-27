export default function DoubleSkeletonComponent(props) {
  return (
    <div
      className={`flex ${props.justify ?? "justify-end"} gap-2 w-full animate-pulse`}
    >
      <div className={`bg-black bg-opacity-15 ${props.height ?? "h-6"} w-16 rounded-lg `} />

      <div className={`bg-black bg-opacity-15 ${props.height ?? "h-6"} w-16 rounded-lg `} />
    </div>
  );
}
