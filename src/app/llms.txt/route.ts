import { allLines } from "@/lib/lines";
import { CITY, properName, SITE } from "@/lib/site";

export const revalidate = 86400;

// A plain summary for AI assistants: what the site is, what it can answer, and where each answer lives.
export async function GET() {
  const lines = await allLines().catch(() => []);
  const live = lines.filter((l) => l.live);
  const text = `# colejuy

> Mapa gratuito de los colectivos urbanos de ${CITY}, Jujuy, Argentina: líneas, recorridos, paradas y cómo llegar de un punto a otro. Sin cuenta y sin instalar nada.

colejuy es un proyecto independiente de Franco Duran, fundador de la comunidad jujuy.dev. No es la app oficial de ninguna empresa de transporte.

## Qué responde

- Qué líneas de colectivo hay en ${CITY}: ${lines.length} líneas cargadas.
- Por dónde pasa cada línea y cuáles son sus paradas de ida y de vuelta: hay paradas para ${live.length} líneas de Santa Ana SRL.
- Qué colectivo tomar para ir de un lugar a otro, en una línea o con un cambio entre dos.
- Dónde está cada colectivo de Santa Ana, cuando la empresa pone ese dato a disposición. El tiempo de llegada a una parada es una estimación.

## Páginas

- [Mapa](${SITE}/): la aplicación.
- [Líneas de colectivos](${SITE}/lineas): índice de todas las líneas.
- [Qué es colejuy y preguntas frecuentes](${SITE}/acerca)

## Líneas

${lines.map((l) => `- [${properName(l.name)}](${SITE}/linea/${encodeURIComponent(l.id)}): ${l.live ? "recorrido y paradas" : "solo recorrido"}${l.operator ? `, ${l.operator}` : ""}.`).join("\n")}

## Datos

- Santa Ana SRL: recorridos, paradas y posiciones de sus líneas.
- Municipalidad de ${CITY}: recorridos de El Urbano y de la línea 26.
- OpenStreetMap: mapa base y búsqueda de direcciones.
`;
  return new Response(text, { headers: { "Content-Type": "text/plain; charset=utf-8" } });
}
