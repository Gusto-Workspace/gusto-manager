export function ItalicSvg(props) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width={props.width ?? 800}
      height={props.height ?? 800}
      viewBox="0 0 1920 1920"
    >
      <path
        fill={props.fillColor ?? "black"}
        d="M738.077 0v147.692h348.554L680.477 1772.308H295V1920h886.302v-147.692H832.748l406.006-1624.616h385.477V0z"
      />
    </svg>
  );
}
