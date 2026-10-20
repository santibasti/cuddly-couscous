/**
 * Central, editable business facts.
 * Anything set to `null` / empty is NOT yet verified and is hidden or shown as
 * "to be confirmed" on the site. Fill these in only with confirmed information.
 */
export const site = {
  name: "Alex Car Restoration",
  shortName: "ACR",
  tagline: "Heritage. Precision. Perfection.",
  url: process.env.NEXT_PUBLIC_SITE_URL ?? "https://www.example.com",
  country: "PH",
  description:
    "Alex Car Restoration is a Philippines-based specialist in classic, vintage and luxury vehicle restoration, bodywork and refinishing.",

  // ---- VERIFY BEFORE PUBLISHING -------------------------------------------
  contact: {
    phone: null as string | null, // e.g. "+63 9XX XXX XXXX"
    whatsapp: null as string | null, // digits only, e.g. "639XXXXXXXXX"
    messenger: null as string | null, // e.g. "alexcarrestoration" (m.me/<username>)
    email: null as string | null,
    address: "66 Fernando Poe Jr. Ave, San Francisco del Monte, Quezon City, Metro Manila, Philippines" as string | null, // from the Google Business listing; confirm
    mapEmbedUrl: "https://www.google.com/maps?q=66+Fernando+Poe+Jr.+Ave,+San+Francisco+del+Monte,+Quezon+City,+Philippines&output=embed" as string | null, // swap for the official "Embed a map" URL if preferred
    mapLink: "https://www.google.com/maps/search/?api=1&query=Alex+Car+Restoration+66+Fernando+Poe+Jr.+Ave+Quezon+City" as string | null,
    hours: null as string | null,
  },
  locality: { city: "Quezon City", region: "Metro Manila" },
  // Google Business Profile summary. Update when the numbers change.
  rating: { value: 4.9, count: 7, source: "Google", asOf: "October 2026", url: "https://www.google.com/search?q=alex+car+restoration" },
  // Verified service areas, e.g. ["Metro Manila", "Cavite"]. Empty until confirmed.
  serviceAreas: [] as string[],
  social: {
    facebook: "https://www.facebook.com/alexrestoration" as string | null, // from workshop signage; confirm
    instagram: null as string | null,
    youtube: null as string | null,
  },
  // Editable fields for later verification. Never invent these.
  facts: {
    yearFounded: "1992" as string | null, // "Established 1992" on workshop signage (supplied photo); confirm
    yearsOfExperience: null as string | null,
    certifications: [] as string[],
    awards: [] as string[],
  },
} as const;

export const nav = [
  { label: "Home", href: "/#top" },
  { label: "About", href: "/#about" },
  { label: "Services", href: "/#services" },
  { label: "Our Work", href: "/#work" },
  { label: "Our Process", href: "/#process" },
  { label: "Contact", href: "/#contact" },
];
