import { z } from "zod";

// Input/output contracts of the tools. Structured output is what machines read (see format.ts).

// The same bounds /api/geocode enforces; a longer query would come back as a 400.
export const GEOCODE_MAX = 80;

export const readOnly = { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true } as const;

export const LineInput = z.string().min(1).max(60).describe("Número, nombre o id de la línea. Ej: \"44\", \"49bis\", \"2-savio\".");
export const PlaceInput = z.string().min(3).max(GEOCODE_MAX);

export const BusOut = z.object({
  id: z.number(),
  number: z.string().nullable(),
  line: z.string().nullable(),
  lat: z.number(),
  lng: z.number(),
  speedKmh: z.number(),
  bearing: z.number().nullable(),
  ramp: z.boolean(),
  moving: z.boolean(),
  fresh: z.boolean(),
  ageSeconds: z.number(),
});
export const StopOut = z.object({
  id: z.string(),
  name: z.string(),
  lat: z.number(),
  lng: z.number(),
  direction: z.string().nullable(),
  order: z.number().nullable(),
});
export const LineOut = z.object({ id: z.string(), number: z.string(), name: z.string(), live: z.boolean(), operator: z.string().nullable() });
export const PlaceOut = z.object({ name: z.string(), lat: z.number(), lng: z.number() });
export const PointOut = z.object({ lat: z.number(), lng: z.number(), label: z.string() });
