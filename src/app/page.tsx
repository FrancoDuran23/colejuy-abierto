import App from "@/components/App";
import { CITY, jsonLd, SITE } from "@/lib/site";

// What the site is, in the vocabulary search engines and assistants read.
const structured = {
  "@context": "https://schema.org",
  "@type": "WebApplication",
  name: "colejuy",
  url: `${SITE}/`,
  description: `Mapa de los colectivos urbanos de ${CITY}: líneas, recorridos, paradas y cómo llegar de un punto a otro.`,
  applicationCategory: "TravelApplication",
  operatingSystem: "Web",
  inLanguage: "es-AR",
  isAccessibleForFree: true,
  offers: { "@type": "Offer", price: 0, priceCurrency: "ARS" },
  areaServed: { "@type": "City", name: CITY, containedInPlace: { "@type": "AdministrativeArea", name: "Jujuy, Argentina" } },
  author: { "@type": "Person", name: "Franco Duran", url: "https://jujuy.dev.ar" },
};

export default function Home() {
  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLd(structured) }} />
      <App />
    </>
  );
}
