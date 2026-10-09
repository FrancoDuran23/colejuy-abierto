import { ImageResponse } from "next/og";

export const alt = "colejuy: colectivos de San Salvador de Jujuy en el mapa";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

// The picture shown when the link is shared: the mark, the name and what the site is.
export default function OpenGraphImage() {
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", justifyContent: "center", background: "#1c1b18", color: "#f3f0e8", padding: 96 }}>
        <div style={{ display: "flex", alignItems: "center" }}>
          <svg width="150" height="150" viewBox="0 0 512 512">
            <path d="M333.1 164.1 A120 120 0 1 0 333.1 347.9" fill="none" stroke="#f3f0e8" strokeWidth="56" strokeLinecap="round" />
            <circle cx="333.1" cy="347.9" r="46" fill="#ef7d4f" stroke="#1c1b18" strokeWidth="14" />
          </svg>
          <div style={{ fontSize: 132, fontWeight: 700, marginLeft: 12, letterSpacing: -3 }}>colejuy</div>
        </div>
        <div style={{ fontSize: 50, marginTop: 36, lineHeight: 1.25 }}>Colectivos de San Salvador de Jujuy en el mapa</div>
        <div style={{ fontSize: 34, marginTop: 20, color: "#b9b4a6" }}>Líneas, paradas y cómo llegar. Gratis y sin cuenta.</div>
      </div>
    ),
    size,
  );
}
