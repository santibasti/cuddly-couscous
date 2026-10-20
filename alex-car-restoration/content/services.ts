export type Service = {
  id: string;
  number: string;
  title: string;
  description: string;
  /** Optional authorised photograph in /public. Falls back to a marked placeholder. */
  image?: string;
  category: "classic" | "luxury" | "body" | "custom";
};

// All services must be confirmed with the business before publication.
export const services: Service[] = [
  { id: "classic-vintage", number: "01", title: "Classic & Vintage Restoration", category: "classic",
    description: "Careful restoration of iconic automobiles, preserving their original character and timeless appeal." },
  { id: "luxury", number: "02", title: "Luxury Vehicle Restoration", category: "luxury",
    description: "Specialized restoration and refinishing services for prestigious automotive marques." },
  { id: "bodywork", number: "03", title: "Precision Bodywork & Refinishing", category: "body",
    description: "High-quality body repairs, surface preparation, and professional automotive refinishing." },
  { id: "custom", number: "04", title: "Custom Automotive Projects", category: "custom",
    description: "Personalized automotive craftsmanship, custom bodywork, and bespoke finishes." },
  { id: "paint-correction", number: "05", title: "Paint Correction & Detailing", category: "body",
    description: "Professional paint enhancement, finishing, and detailing services." },
  { id: "transformation", number: "06", title: "Complete Vehicle Transformation", category: "classic",
    description: "Comprehensive restoration projects from initial assessment through final presentation." },
];
