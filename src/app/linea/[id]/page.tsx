import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import Logo from "@/components/Logo";
import { Plate } from "@/components/Plate";
import { allLines, lineDetail } from "@/lib/lines";
import type { Stop } from "@/lib/santa-ana";
import { CITY, jsonLd, properName, SITE } from "@/lib/site";

export const revalidate = 86400;

export async function generateStaticParams() {
  try {
    return (await allLines()).map((l) => ({ id: l.id }));
  } catch {
    // If the source is down while building, each page is made the first time someone asks for it.
    return [];
  }
}

const inOrder = (stops: Stop[], direction: string) =>
  stops.filter((s) => s.direction === direction && s.order !== null).sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
const name = (s: Stop) => s.name.trim() || "Parada sin nombre";
// Inside a sentence only the word "Línea" goes lowercase; the rest of the name keeps its capitals.
const inSentence = (title: string) => title.replace(/^Línea\b/, "línea");

async function load(id: string) {
  const detail = await lineDetail(decodeURIComponent(id));
  if (!detail) return null;
  const ida = inOrder(detail.stops, "ida");
  const vuelta = inOrder(detail.stops, "vuelta");
  return { ...detail, ida, vuelta, title: properName(detail.line.name) };
}

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const data = await load((await params).id);
  if (!data) return { title: "Línea no encontrada" };
  const { line, ida, vuelta, title } = data;
  const ends = ida.length > 1 ? ` De ${name(ida[0])} a ${name(ida[ida.length - 1])}.` : "";
  const description = line.live
    ? `Recorrido y las ${ida.length + vuelta.length} paradas de la ${inSentence(title)} de colectivos de ${CITY}, de ida y de vuelta.${ends}`
    : `Recorrido de la ${inSentence(title)} de colectivos de ${CITY}${line.operator ? `, de ${line.operator}` : ""}.`;
  return {
    // A line known only by its route does not promise stops.
    title: `${title}: ${line.live ? "recorrido y paradas" : "recorrido"} en ${CITY}`,
    description,
    alternates: { canonical: `/linea/${encodeURIComponent(line.id)}` },
    openGraph: { title: `${title}: ${line.live ? "recorrido y paradas" : "recorrido"}`, description, url: `/linea/${encodeURIComponent(line.id)}`, images: ["/opengraph-image"] },
  };
}

function Stops({ title, stops }: { title: string; stops: Stop[] }) {
  if (stops.length === 0) return null;
  return (
    <section>
      <h2>
        {title} ({stops.length} paradas)
      </h2>
      <p>
        De <b>{name(stops[0])}</b> a <b>{name(stops[stops.length - 1])}</b>.
      </p>
      <ol className="doc-stops">
        {stops.map((s) => (
          <li key={s.id}>{name(s)}</li>
        ))}
      </ol>
    </section>
  );
}

export default async function LinePage({ params }: { params: Promise<{ id: string }> }) {
  const data = await load((await params).id);
  if (!data) notFound();
  const { line, ida, vuelta, title } = data;
  const url = `${SITE}/linea/${encodeURIComponent(line.id)}`;
  const structured = [
    {
      "@context": "https://schema.org",
      "@type": "BreadcrumbList",
      itemListElement: [
        { "@type": "ListItem", position: 1, name: "colejuy", item: `${SITE}/` },
        { "@type": "ListItem", position: 2, name: "Líneas", item: `${SITE}/lineas` },
        { "@type": "ListItem", position: 3, name: title, item: url },
      ],
    },
    ...(ida.length + vuelta.length > 0
      ? [
          {
            "@context": "https://schema.org",
            "@type": "ItemList",
            name: `Paradas de la ${title}`,
            numberOfItems: ida.length + vuelta.length,
            itemListElement: [...ida, ...vuelta].map((s, i) => ({
              "@type": "ListItem",
              position: i + 1,
              item: { "@type": "BusStop", name: name(s), geo: { "@type": "GeoCoordinates", latitude: s.lat, longitude: s.lng }, address: { "@type": "PostalAddress", addressLocality: CITY, addressRegion: "Jujuy", addressCountry: "AR" } },
            })),
          },
        ]
      : []),
  ];
  return (
    <main className="doc">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLd(structured) }} />
      <Link href="/" className="doc-brand">
        <Logo size={28} />
        <span>colejuy</span>
      </Link>
      <p className="doc-crumbs">
        <Link href="/lineas">Líneas de colectivos</Link>
      </p>
      <div className="doc-line">
        {/* The plate repeats the number the heading already says, so it stays out of the heading. */}
        <span aria-hidden="true">
          <Plate line={line} size="large" />
        </span>
        <h1>
          {title} de colectivos en {CITY}
        </h1>
      </div>
      {line.live ? (
        <p>
          La {inSentence(title)} es una línea urbana de {line.operator} en {CITY}, Jujuy. Tiene {ida.length + vuelta.length} paradas cargadas:{" "}
          {ida.length} de ida y {vuelta.length} de vuelta.
        </p>
      ) : (
        <p>
          La {inSentence(title)} es una línea urbana de {CITY}, Jujuy{line.operator ? `, operada por ${line.operator}` : ""}. De esta línea se conoce
          el recorrido, publicado por la Municipalidad; no tiene paradas ni posiciones cargadas.
        </p>
      )}
      <p>
        <Link href={`/?linea=${encodeURIComponent(line.id)}`} className="doc-action">
          Ver la {inSentence(title)} en el mapa
        </Link>
      </p>
      <Stops title="Paradas de ida" stops={ida} />
      <Stops title="Paradas de vuelta" stops={vuelta} />
      <p className="doc-foot">
        Paradas y recorrido según los datos que publica {line.live ? "Santa Ana SRL" : `la Municipalidad de ${CITY}`}. <Link href="/acerca">De dónde salen los datos</Link>
      </p>
    </main>
  );
}
