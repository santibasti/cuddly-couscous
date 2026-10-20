import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import Nav from "@/components/Nav";
import Footer from "@/components/Footer";
import MobileCTA from "@/components/MobileCTA";
import Analytics from "@/components/Analytics";
import { site } from "@/content/site";

const inter = Inter({ subsets: ["latin"], variable: "--font-inter", display: "swap" });

export const metadata: Metadata = {
  metadataBase: new URL(site.url),
  title: { default: "Alex Car Restoration | Classic & Luxury Car Restoration in the Philippines", template: "%s | Alex Car Restoration" },
  description: "Classic, vintage and luxury vehicle restoration, precision bodywork and refinishing in the Philippines. Heritage. Precision. Perfection.",
  alternates: { canonical: "/" },
  openGraph: { type: "website", locale: "en_PH", siteName: site.name, title: "Alex Car Restoration — Craftsmanship Beyond Restoration", description: site.description },
  twitter: { card: "summary_large_image" },
  verification: process.env.NEXT_PUBLIC_GSC_VERIFICATION ? { google: process.env.NEXT_PUBLIC_GSC_VERIFICATION } : undefined,
};
export const viewport: Viewport = { themeColor: "#0B0D0F", width: "device-width", initialScale: 1 };

// Structured data contains only business facts that have been verified in content/site.ts.
const c = site.contact;
const jsonLd = {
  "@context": "https://schema.org",
  "@type": "AutoBodyShop",
  name: site.name,
  url: site.url,
  description: site.description,
  address: { "@type": "PostalAddress", addressCountry: "PH", ...(c.address ? { streetAddress: c.address } : {}) },
  ...(c.phone ? { telephone: c.phone } : {}),
  ...(c.email ? { email: c.email } : {}),
  ...(site.serviceAreas.length ? { areaServed: site.serviceAreas } : {}),
  ...(Object.values(site.social).some(Boolean) ? { sameAs: Object.values(site.social).filter(Boolean) } : {}),
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en-PH" className={inter.variable}>
      <body className="font-sans">
        <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-[60] focus:bg-warm focus:px-4 focus:py-2 focus:text-obsidian">Skip to content</a>
        <Nav />
        <main id="main">{children}</main>
        <Footer />
        <MobileCTA />
        <Analytics />
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
      </body>
    </html>
  );
}
