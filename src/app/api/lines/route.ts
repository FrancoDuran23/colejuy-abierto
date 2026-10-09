import { allLines } from "@/lib/lines";

export const revalidate = 86400;

// No try/catch: if the source fails during the daily rebuild, the error has to reach Next
// so it keeps serving the last good copy instead of caching a failure for a day.
export async function GET() {
  return Response.json({ lines: await allLines() });
}
