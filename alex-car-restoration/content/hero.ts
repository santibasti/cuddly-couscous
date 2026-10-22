/**
 * Homepage hero carousel slides (editable). Images are the exact supplied
 * Alex Car Restoration photographs, in /public/hero. `position` is the
 * object-position used when the image has to be cropped on desktop.
 */
export type HeroSlide = {
  id: string;
  image: string;
  imageAlt: string;
  position: string;
  headline: string[];
  subheading: string;
  primary: { label: string; href: string };
  secondary: { label: string; href: string };
};

export const heroSlides: HeroSlide[] = [
  {
    id: "sls",
    image: "/hero/mercedes-sls-gullwing.webp",
    imageAlt: "Silver Mercedes-Benz SLS AMG with its gullwing doors open in the Alex Restoration studio",
    position: "50% 38%",
    headline: ["Automotive art.", "Preserved."],
    subheading: "Since 1992, preserving the craftsmanship, character, and heritage of exceptional automobiles.",
    secondary: { label: "Explore Our Work", href: "/portfolio" },
    primary: { label: "Book a Consultation", href: "/contact" },
  },
  {
    id: "heritage",
    image: "/hero/mercedes-classics-trio.webp",
    imageAlt: "A white classic Mercedes-Benz convertible in front of two blue classic Mercedes-Benz cars in the Alex Restoration workshop",
    position: "50% 55%",
    headline: ["Preserving heritage", "since 1992."],
    subheading: "More than three decades dedicated to the art of automotive restoration.",
    secondary: { label: "Discover Our Story", href: "/about" },
    primary: { label: "View Our Restorations", href: "/portfolio" },
  },
];

export const heroTiming = { intervalMs: 7000, fadeMs: 1200 };
