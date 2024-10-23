export function UploadSvg(props) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width={props.width ?? 22}
      height={props.height ?? 21}
      fill="none"
    >
      <path
        stroke="#131E36"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="m14.928 7-4.375-4.375L6.178 7M10.553 2.625v10.5M18.428 13.125v3.5a1.75 1.75 0 0 1-1.75 1.75H4.428a1.75 1.75 0 0 1-1.75-1.75v-3.5"
      />
    </svg>
  );
}
