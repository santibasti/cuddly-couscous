/**
 * Portfolio data. Shaped so it can later be fetched from a CMS
 * (see lib/data.ts, the single access point used by all pages).
 *
 * Every entry below is a PLACEHOLDER (`placeholder: true`) and is clearly
 * labelled as such on the site. Replace with real, authorised projects and
 * photographs (put images in /public/projects/<slug>/ and reference them).
 */
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
  hero?: string;
  before?: string;
  after?: string;
  gallery?: string[];
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
    hero: "/images/vespa-showroom.webp", gallery: ["/images/vespa-detail.webp"],
    summary: "A vintage Vespa in deep red with a brown leather seat.", narrative: pending, scope: [] },
];
