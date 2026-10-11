import type { Metadata, Viewport } from "next";
import { Analytics } from "@vercel/analytics/next";
import { Barlow } from "next/font/google";
import Script from "next/script";
import { SITE } from "@/lib/site";
import ThemeProvider from "@/components/ThemeProvider";
import "./globals.css";

// Google Analytics measurement ID ("G-..."). Without it, nothing from Google is loaded.
const GA_ID = process.env.NEXT_PUBLIC_GA_ID?.trim();
const SERVICE_WORKER_SCRIPT = process.env.NODE_ENV === "production"
  ? `(function () {
      window.__bip = window.__bip || null;
      window.addEventListener("beforeinstallprompt", function (event) {
        event.preventDefault();
        window.__bip = event;
      });
      if ("serviceWorker" in navigator) navigator.serviceWorker.register("/sw.js", { scope: "/", updateViaCache: "none" }).catch(function () {});
    })();`
  : `(function () {
      if (!("serviceWorker" in navigator)) return;
      Promise.all([
        navigator.serviceWorker.getRegistrations().then(function (registrations) {
          return Promise.all(registrations.map(function (registration) { return registration.unregister(); }));
        }),
        "caches" in window ? caches.keys().then(function (keys) {
          return Promise.all(keys.filter(function (key) { return key.indexOf("colejuy-") === 0; }).map(function (key) { return caches.delete(key); }));
        }) : Promise.resolve()
      ]).then(function () {
        if (navigator.serviceWorker.controller && !sessionStorage.getItem("colejuy-sw-dev-clean")) {
          sessionStorage.setItem("colejuy-sw-dev-clean", "1");
          window.location.reload();
        }
      }).catch(function () {});
    })();`;

// Barlow comes from road and transit signage, which is where a bus number lives.
const barlow = Barlow({
  variable: "--font-barlow",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
});

export const metadata: Metadata = {
  metadataBase: new URL(SITE),
  // Each page gives its own title; the name of the site goes after it.
  title: { default: "ColeJUY", template: "%s | ColeJUY" },
  description: "Colectivos de San Salvador de Jujuy en el mapa: líneas de Santa Ana y El Urbano, recorridos, paradas, posiciones en vivo y cómo llegar. Gratis, sin cuenta y sin instalar nada.",
  keywords: ["colectivos Jujuy", "colectivos San Salvador de Jujuy", "colectivos en vivo Jujuy", "horarios colectivos Jujuy", "Santa Ana colectivos", "paradas de colectivo Jujuy", "cómo llegar en colectivo Jujuy", "líneas de colectivo Jujuy"],
  applicationName: "ColeJUY",
  alternates: { canonical: "/" },
  openGraph: { type: "website", siteName: "ColeJUY", locale: "es_AR", url: "/", title: "ColeJUY", description: "Líneas, recorridos, paradas, colectivos en vivo y cómo llegar en San Salvador de Jujuy. Gratis y sin cuenta." },
  twitter: { card: "summary_large_image", creator: "@fdurandev", title: "ColeJUY", description: "Líneas, recorridos, paradas, colectivos en vivo y cómo llegar en San Salvador de Jujuy." },
  manifest: "/manifest.webmanifest",
  authors: [{ name: "Franco Durán", url: "https://jujuy.dev.ar" }],
  appleWebApp: { capable: true, title: "ColeJUY", statusBarStyle: "default" },
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
  maximumScale: 1,
  userScalable: false,
  viewportFit: "cover",
  themeColor: "#f3f0e8",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="es-AR" suppressHydrationWarning>
      <body className={barlow.variable}>
        <script
          id="theme-early"
          dangerouslySetInnerHTML={{
            __html: `(function () {
              try {
                var saved = localStorage.getItem("colejuy-theme");
                var dark = saved === "dark" || ((saved === "system" || !saved) && window.matchMedia("(prefers-color-scheme: dark)").matches);
                document.documentElement.classList.toggle("dark", dark);
                document.documentElement.style.colorScheme = dark ? "dark" : "light";
                var meta = document.querySelector('meta[name="theme-color"]');
                if (meta) meta.setAttribute("content", dark ? "#171714" : "#f3f0e8");
              } catch (_) {}
            })();`,
          }}
        />
        {/* beforeinstallprompt can fire before the Next bundle runs. A plain script
            executes while the HTML is parsed; next/script would wait for that bundle. */}
        <script
          id="install-early"
          dangerouslySetInnerHTML={{
            __html: SERVICE_WORKER_SCRIPT,
          }}
        />
        <ThemeProvider>{children}</ThemeProvider>
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
