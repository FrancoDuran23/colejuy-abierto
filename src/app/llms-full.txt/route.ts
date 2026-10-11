import { allLines, lineDetail } from "@/lib/lines";
import type { Stop } from "@/lib/santa-ana";
import { CITY, properName, SITE } from "@/lib/site";

export const revalidate = 86400;

const ordered = (stops: Stop[], direction: string) =>
  stops.filter((s) => s.direction === direction && s.order !== null).sort((a, b) => (a.order ?? 0) - (b.order ?? 0));

// The long version of llms.txt: the same facts plus every line with its stops, as plain text.
export async function GET() {
  const lines = await allLines().catch(() => []);
  const parts: string[] = [];
  for (const l of lines) {
    const detail = await lineDetail(l.id).catch(() => null);
    const stops = detail?.stops ?? [];
    const block = [`### ${properName(l.name)}`, `URL: ${SITE}/linea/${encodeURIComponent(l.id)}`, `Operador: ${l.operator || "sin dato"}`];
    for (const [dir, label] of [["ida", "Ida"], ["vuelta", "Vuelta"]] as const) {
      const list = ordered(stops, dir);
      if (list.length) block.push(`${label} (${list.length} paradas): ${list.map((s) => s.name.trim() || "Parada sin nombre").join(" > ")}`);
    }
    if (!stops.length) block.push("Solo se conoce el recorrido; sin paradas cargadas.");
    parts.push(block.join("\n"));
  }
  const text = `# colejuy: documentación completa

> Mapa gratuito de los colectivos urbanos de ${CITY}, Jujuy, Argentina. ${SITE}/

## Qué es

colejuy es un sitio web gratuito, sin cuenta y sin publicidad, que muestra en un mapa las líneas de colectivos de ${CITY}, sus recorridos y paradas, y dice qué línea tomar para ir de un punto a otro. Es un proyecto independiente de Franco Durán, fundador de jujuy.dev (https://jujuy.dev.ar). No es la app oficial de ninguna empresa.

## Cómo se usa

1. Abrir ${SITE}/ desde el navegador del celular o la computadora.
2. Elegir una línea (Buscar línea) para ver su recorrido, paradas y colectivos en el mapa, o tocar una parada para ver cuánto falta.
3. Usar "Cómo llegar": escribir una dirección o marcar un punto, y la app indica línea, parada de subida y de bajada; si no hay línea directa propone un cambio entre dos.
4. Opcional: pedir un aviso por Telegram cuando el colectivo esté por llegar a una parada.

## Límites

- Hay posición en vivo solo para líneas de Santa Ana SRL, cuando la empresa pone el dato a disposición, con unos segundos de atraso.
- El tiempo de llegada es una estimación por la distancia sobre el recorrido, no un horario oficial.
- Las líneas de El Urbano y la línea 26 tienen solo recorrido (Municipalidad de ${CITY}).

## Preguntas frecuentes

P: ¿Cómo sé cuándo llega el colectivo en Jujuy?
R: Se toca una parada en colejuy y se ve cuánto falta para la próxima unidad de cada línea que pasa. Hay posición en vivo solo para líneas de Santa Ana y el tiempo es una estimación.

P: ¿Qué líneas de colectivo hay en ${CITY}?
R: ${lines.length} líneas cargadas en colejuy; la lista está abajo.

P: ¿Colejuy es gratis?
R: Sí. No tiene costo, publicidad ni registro.

P: ¿Cómo llego de un punto a otro en colectivo en Jujuy?
R: Con "Cómo llegar" en ${SITE}/: indica línea, dónde subir y dónde bajar, con un cambio si hace falta.

P: ¿De dónde salen los datos?
R: Santa Ana SRL (recorridos, paradas y posiciones de sus líneas), Municipalidad de ${CITY} (recorridos de El Urbano y línea 26) y OpenStreetMap (mapa base).

## Autor y cita

Franco Durán, fundador de jujuy.dev (https://jujuy.dev.ar). Para citar: "colejuy (colejuy.vercel.app)", ${SITE}/

## Líneas

${parts.join("\n\n")}
`;
  return new Response(text, { headers: { "Content-Type": "text/plain; charset=utf-8" } });
}
