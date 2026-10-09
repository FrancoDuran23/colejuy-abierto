import type { MetadataRoute } from "next";
import { allLines } from "@/lib/lines";
import { SITE } from "@/lib/site";

export const revalidate = 86400;

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const pages: MetadataRoute.Sitemap = [
    { url: `${SITE}/`, changeFrequency: "daily", priority: 1 },
    { url: `${SITE}/lineas`, changeFrequency: "weekly", priority: 0.9 },
    { url: `${SITE}/acerca`, changeFrequency: "monthly", priority: 0.5 },
  ];
  try {
    for (const line of await allLines()) pages.push({ url: `${SITE}/linea/${encodeURIComponent(line.id)}`, changeFrequency: "weekly", priority: 0.8 });
  } catch (err) {
    // Without the source the sitemap still lists the pages that do not depend on it.
    console.error(err);
  }
  return pages;
}
