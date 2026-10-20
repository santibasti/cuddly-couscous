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
  scope: string[];
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

const lorem = (kind: string) => [
  `Placeholder narrative for a ${kind} project. Replace with the real story of the vehicle: its history, the owner's goals and the challenges faced during the restoration.`,
  "Describe the approach taken, the decisions made to preserve the vehicle's character and the result delivered at handover.",
];

export const projects: Project[] = [
  { slug: "placeholder-classic-sports-coupe", make: "Classic Marque", model: "Sports Coupe", category: "classic", placeholder: true,
    summary: "Placeholder: a full restoration of a classic sports coupe.",
    narrative: lorem("classic restoration"),
    scope: ["Assessment & documentation", "Body preparation", "Refinishing", "Final inspection"] },
  { slug: "placeholder-luxury-saloon", make: "Luxury Marque", model: "Grand Saloon", category: "luxury", placeholder: true,
    summary: "Placeholder: restoration and refinishing of a prestigious saloon.",
    narrative: lorem("luxury restoration"),
    scope: ["Panel restoration", "Paint correction", "Detailing", "Handover"] },
  { slug: "placeholder-body-and-paint", make: "Collector Marque", model: "Convertible", category: "body", placeholder: true,
    summary: "Placeholder: precision bodywork and a flawless new finish.",
    narrative: lorem("bodywork and refinishing"),
    scope: ["Surface preparation", "Bodywork", "Paint & clear coat", "Quality inspection"] },
  { slug: "placeholder-custom-build", make: "Custom", model: "Bespoke Build", category: "custom", placeholder: true,
    summary: "Placeholder: bespoke bodywork and a one-of-one finish.",
    narrative: lorem("custom"),
    scope: ["Design consultation", "Custom bodywork", "Bespoke finish", "Final presentation"] },
  { slug: "placeholder-vintage-tourer", make: "Vintage Marque", model: "Touring Car", category: "classic", placeholder: true,
    summary: "Placeholder: a vintage tourer returned to its former character.",
    narrative: lorem("vintage restoration"),
    scope: ["Strip & assessment", "Metalwork", "Refinishing", "Reassembly"] },
  { slug: "placeholder-luxury-gt", make: "Luxury Marque", model: "Grand Tourer", category: "luxury", placeholder: true,
    summary: "Placeholder: refinishing and detailing of a grand tourer.",
    narrative: lorem("luxury refinishing"),
    scope: ["Paint correction", "Refinishing", "Protection", "Handover"] },
];
