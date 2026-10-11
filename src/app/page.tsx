import App from "@/components/App";
import { CITY, jsonLd, SITE } from "@/lib/site";

// What the site is, in the vocabulary search engines and assistants read.
const structured = [{
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
  author: { "@type": "Person", name: "Franco Durán", url: "https://jujuy.dev.ar" },
},
{
  "@context": "https://schema.org",
  "@type": "WebSite",
  name: "colejuy",
  alternateName: "Colectivos Jujuy",
  url: `${SITE}/`,
  inLanguage: "es-AR",
  publisher: { "@type": "Person", name: "Franco Durán", url: "https://jujuy.dev.ar" },
},
{
  "@context": "https://schema.org",
  "@type": "Person",
  name: "Franco Durán",
  url: "https://jujuy.dev.ar",
  jobTitle: "Fundador de jujuy.dev",
  worksFor: { "@type": "Organization", name: "jujuy.dev", url: "https://jujuy.dev.ar" },
  address: { "@type": "PostalAddress", addressLocality: CITY, addressRegion: "Jujuy", addressCountry: "AR" },
}];

export default function Home() {
  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLd(structured) }} />
      <App />
    </>
  );
}
