// Where the site lives, without a trailing slash. Canonical links, the sitemap and structured data use it.
export const SITE = (process.env.NEXT_PUBLIC_SITE_URL?.trim() || "https://colejuy.vercel.app").replace(/\/+$/, "");
export const NAME = "colejuy";
export const CITY = "San Salvador de Jujuy";

// The source writes "Linea 12"; in running text it is written properly.
export const properName = (name: string) => name.replace(/^Linea\b/, "Línea").replace(/\bx\b/g, "por");

// JSON-LD has to be inlined as text; "<" is escaped so no value can close the script tag.
export const jsonLd = (data: unknown) => JSON.stringify(data).replace(/</g, "\\u003c");
