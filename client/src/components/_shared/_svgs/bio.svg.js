export function BioSvg(props) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width={props.width ?? 800}
      height={props.height ?? 800}
      viewBox="0 0 24 24"
      className={props.className ?? ""}
    >
      <path
        fill={props.fillColor ?? "black"}
        d="M17 8C8 10 5.9 16.17 3.82 21.34l1.89.66 1-2.3A4.49 4.49 0 0 0 8 20C19 20 22 3 22 3c-1 2-8 2.25-13 3.25S2 11.5 2 13.5a6.22 6.22 0 0 0 1.75 3.75C7 8 17 8 17 8Z"
      />
      <path fill="none" d="M0 0h24v24H0z" />
    </svg>
  );
}
