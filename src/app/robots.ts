import type { MetadataRoute } from "next";
import { SITE } from "@/lib/site";

// Search and AI assistants are welcome on the public pages; named so the policy is explicit.
const AI_BOTS = ["GPTBot", "ChatGPT-User", "OAI-SearchBot", "PerplexityBot", "Perplexity-User", "ClaudeBot", "Claude-User", "Claude-SearchBot", "Google-Extended", "Applebot-Extended", "CCBot", "Bingbot", "Googlebot"];

export default function robots(): MetadataRoute.Robots {
  return {
    // The API answers the map, not a reader: indexing it would only spend the source's quota.
    rules: [
      { userAgent: "*", allow: "/", disallow: "/api/" },
      ...AI_BOTS.map((userAgent) => ({ userAgent, allow: "/", disallow: "/api/" })),
    ],
    sitemap: `${SITE}/sitemap.xml`,
    host: SITE,
  };
}
