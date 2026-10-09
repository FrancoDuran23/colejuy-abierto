import type { Metadata } from "next";
import Link from "next/link";
import Logo from "@/components/Logo";
import { Plate } from "@/components/Plate";
import { allLines } from "@/lib/lines";
import { CITY, jsonLd, properName, SITE } from "@/lib/site";

export const revalidate = 86400;

export const metadata: Metadata = {
  title: "Líneas de colectivos de San Salvador de Jujuy",
  description: "Todas las líneas de colectivos urbanos de San Salvador de Jujuy, con el recorrido y las paradas de cada una. Santa Ana, El Urbano y la línea 26.",
  alternates: { canonical: "/lineas" },
};

export default async function Lines() {
  const lines = await allLines();
  const live = lines.filter((l) => l.live);
  const routeOnly = lines.filter((l) => !l.live);
  const list = {
    "@context": "https://schema.org",
    "@type": "ItemList",
    name: `Líneas de colectivos de ${CITY}`,
    numberOfItems: lines.length,
    itemListElement: lines.map((l, i) => ({ "@type": "ListItem", position: i + 1, name: properName(l.name), url: `${SITE}/linea/${encodeURIComponent(l.id)}` })),
  };
  return (
    <main className="doc">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLd(list) }} />
      <Link href="/" className="doc-brand">
        <Logo size={28} />
        <span>colejuy</span>
      </Link>
      <h1>Líneas de colectivos de {CITY}</h1>
      <p>
        La ciudad tiene {lines.length} líneas urbanas cargadas en este sitio. De {live.length}, que opera Santa Ana, se conocen el recorrido y las
        paradas. De las otras {routeOnly.length} se conoce solo el recorrido, publicado por la Municipalidad.
      </p>
      <p>
        <Link href="/" className="doc-action">
          Abrir el mapa
        </Link>
      </p>

      <h2>Líneas de Santa Ana, con paradas</h2>
      <ul className="doc-lines">
        {live.map((l) => (
          <li key={l.id}>
            <Link href={`/linea/${encodeURIComponent(l.id)}`}>
              <Plate line={l} />
              <span>{properName(l.name)}</span>
            </Link>
          </li>
        ))}
      </ul>

      <h2>Líneas con solo el recorrido</h2>
      <ul className="doc-lines">
        {routeOnly.map((l) => (
          <li key={l.id}>
            <Link href={`/linea/${encodeURIComponent(l.id)}`}>
              <Plate line={l} />
              <span>
                {properName(l.name)}
                {l.operator ? ` · ${l.operator}` : ""}
              </span>
            </Link>
          </li>
        ))}
      </ul>
      <p className="doc-foot">
        <Link href="/acerca">Qué es colejuy y de dónde salen los datos</Link>
      </p>
    </main>
  );
}
