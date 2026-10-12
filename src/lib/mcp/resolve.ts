import { matchLines, type LineFacts } from "../ask";
import { allLines, lineDetail } from "../lines";
import { properName } from "../site";
import { briefLine, fail, ok, upstream } from "./format";

// Turning the line an agent typed ("44", "49bis", "2-savio") into one catalog line, and the
// canned answers for the two failure modes: none matched, or more than one did.

export type Resolved = { line: LineFacts } | { matches: LineFacts[] } | { notFound: string };

// A typed line resolves the same way the Telegram bot resolves it.
// More than one match stays ambiguous on purpose: "2" is also "2-savio".
export async function resolveLine(query: string): Promise<Resolved> {
  const lines = await upstream(allLines);
  const facts: LineFacts[] = lines.map((l) => ({ id: l.id, number: l.number, name: l.name, live: l.live, operator: l.operator }));
  const exact = facts.find((l) => l.id === query);
  const matches = exact ? [exact] : matchLines(facts, query);
  if (matches.length === 0) return { notFound: query };
  if (matches.length > 1) return { matches };
  return { line: matches[0] };
}

export const detailOf = (id: string) => upstream(() => lineDetail(id));

export const ambiguous = (matches: LineFacts[]) =>
  ok(
    { error: "ambiguous_line", hint: "Más de una línea coincide; reintentá con el id exacto.", matches: matches.map(briefLine) },
    `Hay más de una línea con ese número. Reintentá con el id exacto:\n${matches.map((l) => `- \`${l.id}\` — ${properName(l.name)}`).join("\n")}`,
  );

export const notFound = (query: string) => fail(`No encontré una línea "${query}". Probá con colejuy_list_lines.`);
