import { CSSProperties } from "react";

/** Eight pixel sparks flying out from the middle of a square, for a piece being taken. */
const SPARKS = Array.from({ length: 8 }, (_, i) => {
  const a = (i / 8) * 2 * Math.PI + 0.3;
  return { "--sx": `${Math.round(Math.cos(a) * 26)}px`, "--sy": `${Math.round(Math.sin(a) * 26)}px` } as CSSProperties;
});

export function Sparks() {
  return (
    <>
      {SPARKS.map((style, i) => (
        <i key={i} className="spark" style={style} />
      ))}
    </>
  );
}
