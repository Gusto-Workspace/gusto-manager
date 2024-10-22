export function DeleteSvg(props) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width={props.width ?? 800}
      height={props.height ?? 800}
      fill="none"
      viewBox="0 0 1024 1024"
      className={props.className ?? ""}
    >
      <path
        fill={props.fillColor ?? "black"}
        d="M960 160H668.8a160 160 0 0 0-313.6 0H64a32 32 0 0 0 0 64h896a32 32 0 0 0 0-64zM512 96a96 96 0 0 1 90.24 64H421.76A96 96 0 0 1 512 96zm332.16 194.56a32 32 0 0 0-34.88 6.72A32 32 0 0 0 800 320a32 32 0 1 0 64 0 33.6 33.6 0 0 0-9.28-22.72 32 32 0 0 0-10.56-6.72zM832 416a32 32 0 0 0-32 32v96a32 32 0 0 0 64 0v-96a32 32 0 0 0-32-32zm0 224a32 32 0 0 0-32 32v224a32 32 0 0 1-32 32H256a32 32 0 0 1-32-32V320a32 32 0 0 0-64 0v576a96 96 0 0 0 96 96h512a96 96 0 0 0 96-96V672a32 32 0 0 0-32-32z"
      />
      <path
        fill={props.fillColor ?? "black"}
        d="M384 768V352a32 32 0 0 0-64 0v416a32 32 0 0 0 64 0zm160 0V352a32 32 0 0 0-64 0v416a32 32 0 0 0 64 0zm160 0V352a32 32 0 0 0-64 0v416a32 32 0 0 0 64 0z"
      />
    </svg>
  );
}
