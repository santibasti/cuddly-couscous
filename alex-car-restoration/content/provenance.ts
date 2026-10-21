/**
 * The Alex Car Restoration Provenance Book: exclusive to frame-off restorations.
 *
 * Wording is the business's own. Keep it that way: do not imply the book is
 * included with frame-on work, and do not imply the certificate verifies the
 * vehicle's original manufacturing authenticity (see `note` on item 04).
 *
 * `image`: authorised photograph of the ACTUAL item (put it in /public/images
 * and set the path). Until supplied, a clearly marked placeholder is shown.
 */
export type ProvenanceItem = {
  n: string;
  title: string;
  description: string;
  /** Optional clarification shown beneath the description. */
  note?: string;
  image?: string;
  imageAlt: string;
};

export const provenanceIntro = {
  eyebrow: "Exclusive to Frame-Off Restorations",
  heading: "A legacy worth preserving.",
  subheading:
    "Every exceptional restoration deserves a permanent record. The Alex Car Restoration Provenance Book preserves the craftsmanship, specifications, and journey behind each completed frame-off restoration.",
  statement: "The car gets restored once. Its story gets preserved forever.",
  collection: {
    image: undefined as string | undefined,
    imageAlt: "The complete Alex Car Restoration Provenance Collection",
    label: "Finished collection",
  },
  cta: {
    heading: "Preserve more than a vehicle. Preserve its story.",
    button: "Discuss Your Frame-Off Restoration",
    href: "/contact",
  },
};

export const provenanceItems: ProvenanceItem[] = [
  { n: "01", title: "Custom Narra Wooden Box",
    description: "A bespoke wooden presentation case designed to preserve the provenance materials.",
    imageAlt: "Custom Narra wooden presentation box" },
  { n: "02", title: "Outer Hard Box",
    description: "Protective packaging that enhances the presentation and unboxing experience.",
    imageAlt: "Outer hard box packaging" },
  { n: "03", title: "Fino Leather-Bound Provenance Book",
    description: "A permanent archival record of the vehicle, its restoration journey, specifications, and work completed by Alex Car Restoration.",
    imageAlt: "Fino leather-bound Provenance Book" },
  { n: "04", title: "Certificate of Authenticity",
    description: "Official documentation certifying that the vehicle was restored by Alex Car Restoration.",
    note: "This certificate verifies the restoration work performed by Alex Car Restoration. It does not certify the vehicle's original manufacture or provenance.",
    imageAlt: "Alex Car Restoration Certificate of Authenticity" },
  { n: "05", title: "Custom Metal Plates",
    description: "Physical identifiers associated with the vehicle and its restoration documentation.",
    imageAlt: "Custom metal plates" },
  { n: "06", title: "Alex Car Restoration Metal Logo",
    description: "A permanent signature representing the company's craftsmanship.",
    imageAlt: "Alex Car Restoration metal logo" },
];
