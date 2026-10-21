/**
 * PORTFOLIO DATA: the single place to add or edit projects.
 *
 * HOW TO ADD A NEW CAR (no design changes needed)
 *  1. Put the optimised WebP photos in /public/projects/<slug>/ (one folder per
 *     vehicle; never mix two vehicles in one folder).
 *  2. Add one entry to `projects` below (copy the TEMPLATE comment).
 *  3. Each photo needs: src, alt (describe only what is visible), width, height
 *     (the file's real pixel size, so aspect ratios are preserved).
 *  4. Leave `scope` empty and `detailsConfirmed: false` until the work done has
 *     been verified. Only set `before`/`after` when the sequence is verified.
 *
 * The card on the homepage / Our Work page, the detail page, the gallery with
 * full-screen viewer, filters, SEO and sitemap are all generated from this data.
 * Shaped so it can later be fetched from a CMS (see lib/data.ts).
 *
 * TEMPLATE
 *   { slug: "make-model", make: "Make", model: "Model", category: "classic",
 *     headline: "Optional page headline.", // defaults to "Make Model"
 *     summary: "One neutral sentence about what the photos show.",
 *     narrative: pending, scope: [], detailsConfirmed: false, placeholder: false,
 *     hero: "/projects/make-model/01.webp",
 *     gallery: [ { src: "/projects/make-model/01.webp", alt: "...", width: 1920, height: 1280 } ] },
 */
import type { GalleryImage } from "./galleries";
import { vespaImages, landCruiserImages } from "./galleries";

export type ProjectCategory = "classic" | "luxury" | "body" | "custom";

export type Project = {
  slug: string;
  make: string;
  model: string;
  category: ProjectCategory;
  summary: string;
  narrative: string[];
  /** Leave empty until the scope of work is confirmed; it is then hidden. */
  scope: string[];
  /** false = show only the vehicle and photos, no claims about the work done */
  detailsConfirmed: boolean;
  /** Optional page headline (defaults to "Make Model") */
  headline?: string;
  /** Cover image used on cards and as the large page image */
  hero?: string;
  /** Only when the real before/after sequence is verified */
  before?: string;
  after?: string;
  /** Project photographs: one vehicle per project */
  gallery?: GalleryImage[];
  placeholder: boolean;
};

export const categoryLabels: Record<ProjectCategory, string> = {
  classic: "Classic",
  luxury: "Luxury",
  body: "Body & Paint",
  custom: "Custom",
};

/**
 * Vehicles below are real cars photographed at the workshop (authorised
 * photography supplied by the business). Make/model are read from the photos;
 * categories are provisional. Add `summary`, `narrative`, `scope`, before/after
 * and set `detailsConfirmed: true` once the work done on each car is verified.
 */
const pending = ["The full project story and scope of work will be added once confirmed by the workshop."];

export const projects: Project[] = [
  { slug: "ford-mustang", make: "Ford", model: "Mustang", category: "classic", placeholder: false, detailsConfirmed: false,
    hero: "/images/mustang-showroom.webp", summary: "A classic Mustang presented in the Alex Restoration studio.", narrative: pending, scope: [] },
  { slug: "porsche-911", make: "Porsche", model: "911", category: "custom", placeholder: false, detailsConfirmed: false,
    hero: "/images/porsche-911-white.webp", summary: "A white 911 with carbon-fibre details and forged wheels.", narrative: pending, scope: [] },
  { slug: "ford-gt", make: "Ford", model: "GT", category: "luxury", placeholder: false, detailsConfirmed: false,
    hero: "/images/ford-gt-rear.webp", summary: "A Ford GT presented in the finishing studio.", narrative: pending, scope: [] },
  { slug: "nissan-gt-r", make: "Nissan", model: "GT-R", category: "custom", placeholder: false, detailsConfirmed: false,
    hero: "/images/shopfront-gtr.webp", summary: "A blue GT-R outside the Alex Restoration workshop.", narrative: pending, scope: [] },
  { slug: "suzuki-jimny", make: "Suzuki", model: "Jimny", category: "custom", placeholder: false, detailsConfirmed: false,
    hero: "/images/suzuki-jimny.webp", summary: "A lime-green Jimny presented in the finishing studio.", narrative: pending, scope: [] },
  { slug: "vespa", make: "Vespa", model: "Vintage Scooter", category: "classic", placeholder: false, detailsConfirmed: false,
    hero: "/images/vespa-showroom.webp", gallery: vespaImages,
    summary: "A vintage Vespa in deep red with a brown leather seat.", narrative: pending, scope: [] },
  { slug: "toyota-land-cruiser", make: "Toyota", model: "Land Cruiser", category: "custom", placeholder: false, detailsConfirmed: false,
    hero: "/alex-restoration/images/land-cruiser/toyota-land-cruiser-rear-workshop.webp", gallery: landCruiserImages,
    summary: "A white Land Cruiser photographed in the workshop, including a body-kit installation view.", narrative: pending, scope: [] },
];
