export function UnderlineSvg(props) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width={props.width ?? 800}
      height={props.height ?? 800}
      viewBox="0 0 20 20"
    >
      <path
        fill={props.fillColor ?? "black"}
        d="M0 20h20v-2H0v2ZM2 7V0h2v7c0 9.333 12 9.333 12 0V0h2v7C18 19 2 19 2 7Z"
      />
    </svg>
  );
}
