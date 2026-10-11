import type { Fleet } from "./santa-ana";

/**
 * Punto de enchufe de la fuente de datos EN VIVO.
 *
 * Este repositorio público no incluye la conexión con los servidores de Santa Ana
 * (autenticación, endpoints, caché por línea). Quien quiera completarla implementa
 * `FleetProvider` y la registra con `setFleetProvider()` (o edita `defaultProvider`).
 * Ver CONTRIBUTING.md para el formato esperado de /api/fleet.
 *
 * Contrato:
 *  - `fetchFleet()` sin argumentos devuelve toda la flota; con `lines` (ids de línea), solo esas.
 *  - Si la fuente rechaza el pedido, lanzá `SourceError` (de ./santa-ana) con el status HTTP:
 *    401/403 => la UI muestra "auth", 429 => "rate", otro => "down".
 *  - Nunca pongas secretos en el código: usá variables de entorno.
 */
export interface FleetProvider {
  fetchFleet(lines?: string[]): Promise<Fleet>;
}

/** Sin fuente en vivo: el mapa muestra recorridos y paradas, sin coches. */
export const emptyProvider: FleetProvider = {
  async fetchFleet() {
    return { updatedAt: new Date().toISOString(), buses: [], unavailable: "down" };
  },
};

/** Datos de ejemplo para desarrollar la interfaz (FLEET_MOCK=1). Coches ficticios en el centro de Jujuy. */
export const mockProvider: FleetProvider = {
  async fetchFleet(lines) {
    const ids = lines && lines.length ? lines : ["1", "2", "3"];
    const t = Date.now() / 1000;
    return {
      updatedAt: new Date().toISOString(),
      buses: ids.map((line, i) => ({
        id: 900000 + i,
        line,
        number: `M${i + 1}`,
        lat: -24.1858 + 0.004 * Math.sin(t / 60 + i),
        lng: -65.2995 + 0.004 * Math.cos(t / 60 + i),
        speed: 18,
        course: 90,
        ramp: false,
        moving: true,
        fresh: true,
        age: 0,
      })),
    };
  },
};

let current: FleetProvider | null = null;

export function setFleetProvider(p: FleetProvider | null) {
  current = p;
}

export function getFleetProvider(): FleetProvider {
  if (current) return current;
  return process.env.FLEET_MOCK === "1" ? mockProvider : emptyProvider;
}
