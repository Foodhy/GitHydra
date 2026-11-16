export function DockGlyph({
  place,
}: {
  place: "top" | "bottom" | "left" | "right" | "center";
}) {
  return (
    <svg viewBox="0 0 16 16" aria-hidden="true" className="size-3.5 shrink-0">
      <rect
        x="1.5"
        y="1.5"
        width="13"
        height="13"
        rx="1.5"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.2"
      />
      {place === "top" ? (
        <rect
          x="3.2"
          y="3.2"
          width="9.6"
          height="3.2"
          rx="0.5"
          fill="currentColor"
        />
      ) : null}
      {place === "bottom" ? (
        <rect
          x="3.2"
          y="9.6"
          width="9.6"
          height="3.2"
          rx="0.5"
          fill="currentColor"
        />
      ) : null}
      {place === "left" ? (
        <rect
          x="3.2"
          y="3.2"
          width="3.2"
          height="9.6"
          rx="0.5"
          fill="currentColor"
        />
      ) : null}
      {place === "right" ? (
        <rect
          x="9.6"
          y="3.2"
          width="3.2"
          height="9.6"
          rx="0.5"
          fill="currentColor"
        />
      ) : null}
      {place === "center" ? (
        <rect x="5" y="5" width="6" height="6" rx="0.5" fill="currentColor" />
      ) : null}
    </svg>
  );
}
