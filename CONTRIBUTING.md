# Cómo contribuir: completar la fuente de datos en vivo

Este repositorio es la copia pública de Colejuy. Trae toda la interfaz, las páginas, el SEO, los datos
estáticos (paradas, recorridos, líneas municipales) y los tests. **No trae la conexión con los
servidores de Santa Ana**: ahí falta la pieza que lee dónde está cada colectivo. Eso es lo que se pide completar.

## Dónde enchufar la fuente

- `src/lib/fleet-provider.ts`: interfaz `FleetProvider { fetchFleet(lines?: string[]): Promise<Fleet> }`.
  - `emptyProvider` (por defecto): flota vacía con `unavailable: "down"`. El mapa muestra recorridos y paradas sin coches.
  - `mockProvider` (`FLEET_MOCK=1`): coches ficticios para desarrollar la interfaz.
  - `setFleetProvider(p)` registra el tuyo, o cambiá `getFleetProvider()`.
- `src/lib/santa-ana.ts`: tipos (`Fleet`, `Bus`, `Line`, `Stop`, `SourceError`), datos del snapshot y `fetchFleet`, que delega en el provider.
- `src/app/api/fleet/route.ts`: ya arma la respuesta y las cabeceras de caché; no hace falta tocarlo.

## Formato esperado de `GET /api/fleet`

`GET /api/fleet` (opcional `?lines=20,21`, hasta 10 ids) responde siempre HTTP 200 con JSON:

```json
{
  "updatedAt": "2026-10-11T16:00:00.000Z",
  "buses": [
    { "id": 123, "line": "20", "number": "45", "lat": -24.1858, "lng": -65.2995,
      "speed": 18, "course": 90, "ramp": false, "moving": true, "fresh": true, "age": 7 }
  ],
  "unavailable": "auth | rate | down"
}
```

- `line` es el id de línea (ver `src/data/santa-ana-routes.json`); `course` en grados o `null`; `age` en segundos.
- `fresh` es `false` si `age` supera `STALE_SECONDS` (120); un coche con `age` mayor a `HIDE_SECONDS` (900) se omite.
- `unavailable` solo aparece si la fuente rechazó el pedido. Lanzá `SourceError(path, status, retryAfter)`:
  401/403 → `"auth"`, 429 → `"rate"`, otro → `"down"`. La ruta lo convierte y lo cachea.
- Las coordenadas van en `lat`/`lng`. (Los recorridos del snapshot están en `[lat, lng]` y `santa-ana.ts` los invierte a `[lng, lat]`.)

## Reglas

- Nada de secretos en el código ni en commits: claves, tokens, sesiones, IMEIs. Usá variables de entorno y documentá solo su nombre en `.env.example`.
- Con el provider vacío o mock, `npm run build` y `npm test` tienen que pasar.
- Los pull requests van a `main`; escribí qué fuente conectaste y cómo la probaste.

## Desarrollo

```
npm install
FLEET_MOCK=1 npm run dev
npm test
npm run lint
```
