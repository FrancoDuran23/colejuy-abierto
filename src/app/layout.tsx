import type { Metadata, Viewport } from "next";
import { Analytics } from "@vercel/analytics/next";
import { Barlow } from "next/font/google";
import Script from "next/script";
import { SITE } from "@/lib/site";
import "./globals.css";

// Google Analytics measurement ID ("G-..."). Without it, nothing from Google is loaded.
const GA_ID = process.env.NEXT_PUBLIC_GA_ID?.trim();

// Barlow comes from road and transit signage, which is where a bus number lives.
const barlow = Barlow({
  variable: "--font-barlow",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
});

export const metadata: Metadata = {
  metadataBase: new URL(SITE),
  // Each page gives its own title; the name of the site goes after it.
  title: { default: "colejuy: colectivos de San Salvador de Jujuy en el mapa", template: "%s | colejuy" },
  description: "Mapa de los colectivos de San Salvador de Jujuy: líneas, recorridos, paradas y qué colectivo tomar para llegar. Gratis, sin cuenta y sin instalar nada.",
  applicationName: "colejuy",
  alternates: { canonical: "/" },
  openGraph: { type: "website", siteName: "colejuy", locale: "es_AR", url: "/" },
  twitter: { card: "summary_large_image", creator: "@fdurandev" },
  authors: [{ name: "Franco Duran", url: "https://jujuy.dev.ar" }],
  appleWebApp: { capable: true, title: "Colectivos Jujuy", statusBarStyle: "default" },
  icons: {
    icon: [
      { url: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { url: "/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
    apple: [{ url: "/apple-touch-icon.png", sizes: "180x180", type: "image/png" }],
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#f3f0e8",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="es-AR">
      <body className={barlow.variable}>
        {children}
        {/* Counts visits without cookies; the numbers are in the Vercel project, under Analytics. */}
        <Analytics />
        {GA_ID && (
          <>
            <Script src={`https://www.googletagmanager.com/gtag/js?id=${GA_ID}`} strategy="afterInteractive" />
            <Script id="ga" strategy="afterInteractive">
              {`window.dataLayer = window.dataLayer || []; function gtag(){dataLayer.push(arguments);} gtag("js", new Date()); gtag("config", ${JSON.stringify(GA_ID)});`}
            </Script>
          </>
        )}
      </body>
    </html>
  );
}
