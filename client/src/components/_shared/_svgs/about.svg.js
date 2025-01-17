export function AboutSvg(props) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width={props.width ?? 800}
      height={props.height ?? 800}
      viewBox="0 0 52 52"
    >
      <path
        fill={props.fillColor ?? "#131E36"}
        d="M26 52A26 26 0 0 1 22.88.19 25.78 25.78 0 0 1 34.73 1.5a2 2 0 1 1-1.35 3.77 22 22 0 0 0-21 38 22 22 0 0 0 35.41-20 2 2 0 1 1 4-.48A26 26 0 0 1 26 52Z"
      />
      <path
        fill={props.fillColor ?? "#131E36"}
        d="M26 43.86a2 2 0 0 1-2-2v-19.2a2 2 0 1 1 4 0v19.2a2 2 0 0 1-2 2Z"
      />
      <circle fill={props.fillColor ?? "#131E36"} cx={26} cy={15.71} r={2.57} />
    </svg>
  );
}
