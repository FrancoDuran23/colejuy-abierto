import type { Metadata } from "next";
import Link from "next/link";
import Logo from "@/components/Logo";
import { allLines } from "@/lib/lines";
import { CITY, jsonLd, SITE } from "@/lib/site";

export const revalidate = 86400;

export const metadata: Metadata = {
  title: "Qué es colejuy: colectivos de Jujuy en el mapa",
  description: "colejuy muestra en un mapa las líneas de colectivos de San Salvador de Jujuy, sus paradas y cómo llegar de un punto a otro. Gratis y sin cuenta.",
  alternates: { canonical: "/acerca" },
  openGraph: { title: "Qué es colejuy y preguntas frecuentes", description: "Cómo saber cuándo llega el colectivo en Jujuy, qué líneas hay, cómo llegar y de dónde salen los datos.", url: "/acerca", images: ["/opengraph-image"] },
};

export default async function About() {
  const lines = await allLines();
  const live = lines.filter((l) => l.live).length;
  // Each answer is written to stand on its own, so it can be quoted without the question.
  const faq: [string, string][] = [
    ["¿Cómo sé cuándo llega el colectivo en Jujuy?", "En colejuy se toca una parada y se ve qué líneas pasan y cuánto falta para la próxima, calculado con la posición del colectivo y la distancia por el recorrido. Solo hay posición en vivo para las líneas de Santa Ana, y el tiempo es una estimación, no un horario fijo."],
    ["¿Qué líneas de colectivo hay en San Salvador de Jujuy?", `colejuy tiene ${lines.length} líneas cargadas: las de Santa Ana SRL, que tienen recorrido, paradas y posiciones, y las de El Urbano y la línea 26, de las que se conoce el recorrido. La lista completa está en la página de líneas.`],
    ["¿Colejuy es gratis?", "Sí. Es gratis, no tiene publicidad y no hay que crear una cuenta ni instalar nada."],
    ["¿Cómo llego de un punto a otro en colectivo en Jujuy?", `En colejuy se elige "Cómo llegar", se escribe una dirección o se marca un punto en el mapa y el sitio indica qué línea tomar, dónde subir y dónde bajar, con un cambio de línea si hace falta.`],
    ["¿De dónde salen los datos?", `Los recorridos, paradas y posiciones de las líneas de Santa Ana los publica Santa Ana SRL; los recorridos de El Urbano y de la línea 26, la Municipalidad de ${CITY}. El mapa es de OpenStreetMap.`],
    ["¿Qué es colejuy?", `colejuy es un sitio web gratuito que muestra en un mapa las ${lines.length} líneas de colectivos urbanos de ${CITY}, con sus recorridos y paradas. No pide cuenta y no hay que instalar nada: se abre desde el navegador del celular.`],
    ["¿Cómo sé qué colectivo tomar para ir a un lugar en Jujuy?", `En colejuy se elige "Cómo llegar", se escribe una dirección o se marca un punto en el mapa, y el sitio indica qué línea tomar, en qué parada subir y en cuál bajar. Si ninguna línea llega directo, propone una combinación de dos líneas y dónde hacer el cambio.`],
    ["¿Dónde veo las paradas de una línea de colectivo de Jujuy?", `Cada línea tiene su página en colejuy con la lista de paradas de ida y de vuelta en orden. Hay paradas cargadas para ${live} líneas de Santa Ana; de las demás se conoce solo el recorrido.`],
    ["¿Se puede ver dónde está el colectivo en tiempo real?", `colejuy muestra la posición de los colectivos de Santa Ana cuando la empresa pone ese dato a disposición. La posición llega con unos segundos de atraso respecto de la calle, y el tiempo de llegada a una parada es una estimación calculada con la distancia por el recorrido.`],
    ["¿Qué empresas de colectivos están en colejuy?", `Están las líneas de Santa Ana SRL, con recorrido y paradas, y las de El Urbano y la línea 26, con el recorrido que publica la Municipalidad de ${CITY}.`],
    ["¿colejuy es la app oficial de Santa Ana?", `No. colejuy es un proyecto independiente de Franco Durán, fundador de la comunidad jujuy.dev. Usa datos que publican Santa Ana SRL y la Municipalidad de ${CITY}.`],
    ["¿colejuy tiene costo o publicidad?", "No. Es gratis, no tiene publicidad y no pide registrarse."],
    ["¿Puedo recibir un aviso cuando viene mi colectivo?", "Sí, por Telegram: desde una parada se pide un aviso y el bot escribe cuando el colectivo de esa línea está por llegar. Funciona mientras haya posiciones en vivo."],
  ];
  const structured = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: faq.map(([q, a]) => ({ "@type": "Question", name: q, acceptedAnswer: { "@type": "Answer", text: a } })),
  };
  return (
    <main className="doc">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLd(structured) }} />
      <Link href="/" className="doc-brand">
        <Logo size={28} />
        <span>colejuy</span>
      </Link>
      <h1>Colectivos de {CITY} en el mapa</h1>
      <p>
        colejuy muestra las líneas de colectivos de {CITY}, sus recorridos y sus paradas, y dice qué línea tomar para ir de un punto a otro. Es
        gratis, no pide cuenta y se usa desde el navegador.
      </p>
      <p>
        <Link href="/" className="doc-action">
          Abrir el mapa
        </Link>
      </p>

      <h2>Sobre colejuy</h2>
      <p>
        colejuy es un proyecto independiente de Franco Durán, fundador de la comunidad jujuy.dev. No es la aplicación oficial de ninguna empresa de colectivos.
      </p>

      <h2>Preguntas frecuentes</h2>
      {faq.map(([q, a]) => (
        <section key={q}>
          <h3>{q}</h3>
          <p>{a}</p>
        </section>
      ))}

      <h2>De dónde salen los datos</h2>
      <ul>
        <li>Recorridos, paradas y posiciones de Santa Ana: los publica Santa Ana SRL.</li>
        <li>Recorridos de El Urbano y de la línea 26: los publica la Municipalidad de {CITY}.</li>
        <li>Mapa: OpenStreetMap, a través de OpenFreeMap.</li>
      </ul>
      <p className="doc-foot">
        <Link href="/lineas">Todas las líneas</Link> · Hecho por Franco Durán, fundador de{" "}
        <a href="https://jujuy.dev.ar" rel="noopener noreferrer">
          jujuy.dev
        </a>{" "}
        · {SITE.replace("https://", "")}
      </p>
    </main>
  );
}
