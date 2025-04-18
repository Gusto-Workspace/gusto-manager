export function GlutenFreeSvg(props) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width={props.width ?? 800}
      height={props.height ?? 800}
      fill="none"
      viewBox="0 0 24 24"
      className={props.className ?? ""}
    >
      <path
        fill={props.fillColor ?? "black"}
        fillRule="evenodd"
        d="M13 3a1 1 0 1 0-2 0v3.528a5.98 5.98 0 0 0-3-1.445V5a1 1 0 1 0-2 0v8c0 .708.123 1.388.348 2.019l1.678-1.558A4.041 4.041 0 0 1 8 13v-.874c.36.093.7.234 1.014.417l1.509-1.4A5.969 5.969 0 0 0 8 10.082V7.126a4.003 4.003 0 0 1 2.99 3.583l6.65-6.175c.05-.048.105-.093.16-.134A.999.999 0 0 0 16 5v.083a5.98 5.98 0 0 0-3 1.445V3Zm-2 15.917a5.962 5.962 0 0 1-2.12-.79l1.555-1.445c.182.078.37.142.565.192v-.716l2.925-2.716A3.983 3.983 0 0 0 13 16v.874c1.725-.444 3-2.01 3-3.874v-.874a3.98 3.98 0 0 0-1.322.617L18 9.658V13a6.002 6.002 0 0 1-5 5.917V21a1 1 0 1 1-2 0v-2.083Zm8.68-12.184a1 1 0 0 0-1.36-1.466l-14 13a1 1 0 0 0 1.36 1.466l14-13Z"
        clipRule="evenodd"
      />
    </svg>
  );
}
