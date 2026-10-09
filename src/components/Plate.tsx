import { textOn, tone } from "@/lib/color";
import type { Line } from "@/lib/santa-ana";

export function plateLabel(line: Pick<Line, "number">) {
  return /^\d+$/.test(line.number) ? line.number : line.number.replace(/^servicio a\s+/i, "").slice(0, 3);
}

// What tells apart two lines that share a number: "x Peron", "bis", "10 Hectareas".
export function variant(line: Pick<Line, "number" | "name">) {
  const rest = line.name.replace(new RegExp(`^l[ií]nea\\s+${line.number}\\b`, "i"), "").trim();
  return rest === line.name ? line.name : rest.replace(/^x\s+/i, "");
}

export function Plate({ line, size }: { line: Pick<Line, "number" | "color">; size?: "large" }) {
  const color = tone(line.color);
  return (
    <span className={size === "large" ? "plate plate-large" : "plate"} style={{ background: color, color: textOn(color) }}>
      {plateLabel(line)}
    </span>
  );
}
