export function DragSvg(props) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width={props.width ?? 800}
      height={props.height ?? 800}
      fill="none"
      viewBox="0 0 24 24"
    >
      <path
        stroke={props.strokeColor ?? "black"}
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M5 10h14m-5 9-2 2-2-2m4-14-2-2-2 2m-5 9h14"
      />
    </svg>
  );
}
