export function YoutubeSvg(props) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width={props.width ?? 800}
      height={props.height ?? 800}
      viewBox="-143 145 512 512"
    >
      <path
        fill={props.fillColor ?? "black"}
        stroke={props.strokeColor ?? "black"}
        d="m78.9 450.3 83.8-49.2-83.8-49.2z"
      />
      <path
        fill={props.fillColor ?? "black"}
        stroke={props.strokeColor ?? "black"}
        d="M113 145c-141.4 0-256 114.6-256 256s114.6 256 256 256 256-114.6 256-256-114.6-256-256-256zm128 301.8c0 44.1-44.1 44.1-44.1 44.1H29.1c-44.1 0-44.1-44.1-44.1-44.1v-91.5c0-44.1 44.1-44.1 44.1-44.1h167.8c44.1 0 44.1 44.1 44.1 44.1v91.5z"
      />
    </svg>
  );
}
