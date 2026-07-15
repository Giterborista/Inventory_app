export function ActivityFlowDiagram() {
  const inputColor = "var(--diagram-input)";
  const red = "#ef4b41";

  return (
    <svg
      aria-label="An activity receives materials, energy, water, and auxiliaries as inputs and creates a product or service, waste, co-products, and direct emissions as outputs."
      className="h-auto w-full"
      role="img"
      viewBox="0 0 1000 720"
    >
      <text fill="var(--muted)" fontSize="30" fontWeight="800" letterSpacing="1" x="88" y="48">INPUTS</text>
      <text fill={red} fontSize="30" fontWeight="800" letterSpacing="1" x="760" y="48">OUTPUTS</text>

      <g fill={inputColor} fontFamily="Arial, sans-serif" fontSize="23" fontWeight="700" textAnchor="middle">
        {[
          [24, 95, "Materials"],
          [24, 257, "Energy"],
          [24, 419, "Water"],
          [24, 581, "Auxiliaries"],
        ].map(([x, y, label]) => (
          <g key={label as string}>
            <rect fill={inputColor} height="122" rx="14" width="210" x={x as number} y={y as number} />
            <text fill="var(--diagram-input-text)" x={(x as number) + 105} y={(y as number) + 74}>{label as string}</text>
          </g>
        ))}
      </g>

      <g fill="none" stroke={inputColor} strokeLinecap="round" strokeLinejoin="round" strokeWidth="5">
        <path d="M234 156H340V350H405" />
        <path d="M234 318H340V350H405" />
        <path d="M234 480H340V412H405" />
        <path d="M234 642H340V412H405" />
        <path d="m389 339 20 11-20 11" />
        <path d="m389 401 20 11-20 11" />
      </g>

      <rect fill="#dc4b4b" height="196" rx="16" width="210" x="405" y="282" />
      <text fill="#ffffff" fontFamily="Arial, sans-serif" fontSize="25" fontWeight="700" textAnchor="middle" x="510" y="365">Activity /</text>
      <text fill="#ffffff" fontFamily="Arial, sans-serif" fontSize="25" fontWeight="700" textAnchor="middle" x="510" y="400">process</text>

      <g fill="none" stroke={red} strokeLinecap="round" strokeLinejoin="round" strokeWidth="5">
        <path d="M615 350H690V156H765" />
        <path d="M615 350H690V318H765" />
        <path d="M615 412H690V480H765" />
        <path d="M615 412H690V642H765" />
        <path d="m749 145 20 11-20 11" />
        <path d="m749 307 20 11-20 11" />
        <path d="m749 469 20 11-20 11" />
        <path d="m749 631 20 11-20 11" />
      </g>

      <g fontFamily="Arial, sans-serif" fontSize="22" fontWeight="700">
        <rect fill="var(--diagram-output)" height="122" rx="14" stroke={red} strokeWidth="8" width="212" x="765" y="95" />
        <text fill={red} x="855" y="147">Product /</text>
        <text fill={red} x="855" y="177">service</text>

        {[
          [257, "Waste"],
          [419, "Co-products"],
          [581, "Direct"],
        ].map(([y, label]) => (
          <g key={label as string}>
            <rect fill="var(--diagram-output)" height="122" rx="14" stroke={red} strokeWidth="3" width="212" x="765" y={y as number} />
            <text fill={red} x="855" y={(y as number) + (label === "Direct" ? 51 : 74)}>{label as string}</text>
            {label === "Direct" ? <text fill={red} x="855" y={(y as number) + 81}>emissions</text> : null}
          </g>
        ))}
      </g>
    </svg>
  );
}
