/**
 * Official restoration methodologies (two, 10 stages each).
 *
 * - `title` and `summary` are the official wording supplied by the business.
 * - `detail` is the expanded explanation: DRAFT wording elaborating on the
 *   summary only. Confirm or edit with the workshop before publication.
 * - `image` on a stage: authorised project photograph for that stage (put it in
 *   /public/images and set the path). Until supplied, a clearly marked
 *   placeholder is shown; never use unrelated stock imagery.
 * - `image` on a methodology: decorative studio photograph for the selector card.
 */
export type ProcessStage = {
  n: string;
  title: string;
  summary: string;
  detail: string;
  image?: string;
  imageAlt: string;
};

const frameOnStages: ProcessStage[] = [
  { n: "01", title: "Body Disassembly",
    summary: "All body panels and components are carefully removed and catalogued through a comprehensive parts inventory.",
    detail: "Panels, trim and fittings are removed with care and each part is logged in the parts inventory, so every component can be tracked, assessed and returned to the vehicle correctly.",
    imageAlt: "Technician carefully removing body panels and components" },
  { n: "02", title: "Mechanical & Electrical Retention",
    summary: "Mechanical and electrical systems remain intact throughout the frame-on restoration process.",
    detail: "In a frame-on restoration the mechanical and electrical systems stay in place and are protected throughout the work, keeping the focus on the body and its finish.",
    imageAlt: "Vehicle with mechanical and electrical systems left intact during restoration" },
  { n: "03", title: "Bare-Shell Reduction",
    summary: "The vehicle body is reduced to a bare shell in preparation for detailed restoration.",
    detail: "Remaining trim and fittings are taken off, leaving the bare body shell so every surface can be inspected and worked on properly.",
    imageAlt: "Vehicle body reduced to a bare shell" },
  { n: "04", title: "Metal Stripping",
    summary: "The shell is stripped to bare metal and treated to prevent corrosion.",
    detail: "Old paint and coatings are removed down to bare metal, revealing the true condition of the panels. The exposed metal is then treated to prevent corrosion.",
    imageAlt: "Body shell stripped back to bare metal" },
  { n: "05", title: "Rustproofing & Cavity Wax Protection",
    summary: "Protective treatments are applied to body panels and concealed cavities to help prevent corrosion and preserve the vehicle.",
    detail: "Rustproofing is applied to the panels and wax is worked into hidden cavities where moisture can collect, helping protect areas that are difficult to reach.",
    imageAlt: "Rustproofing and cavity wax being applied to the body" },
  { n: "06", title: "Primer Application & Body Repair",
    summary: "Protective primer is applied, and structural bodywork and necessary repairs are addressed.",
    detail: "Primer protects the prepared metal, while structural bodywork and any necessary repairs restore the shape and integrity of the shell.",
    imageAlt: "Primer application and body repair in progress" },
  { n: "07", title: "Paint Preparation",
    summary: "Body filling, sculpting, surface shaping, and meticulous preparation for refinishing.",
    detail: "Body filler is applied and sculpted, and surfaces are shaped and refined until panels, lines and gaps are ready for refinishing.",
    imageAlt: "Surface preparation and body filling before paint" },
  { n: "08", title: "Paint Correction",
    summary: "Final paint application and refinement to achieve a high-quality finish.",
    detail: "The final paint is applied and then refined through correction and polishing to bring out depth and gloss.",
    imageAlt: "Paintwork being refined and corrected" },
  { n: "09", title: "Ceramic Coating",
    summary: "A protective ceramic coating is applied to help preserve the finished paintwork.",
    detail: "A protective ceramic coating is applied over the finished paintwork to help preserve the finish.",
    imageAlt: "Ceramic coating applied to finished paintwork" },
  { n: "10", title: "Quality Check",
    summary: "Final inspection to confirm that the completed restoration meets established quality standards.",
    detail: "Every panel, line and finish is inspected against the workshop's quality standards before the vehicle is presented and handed over.",
    imageAlt: "Final quality inspection of the completed restoration" },
];

const frameOffStages: ProcessStage[] = [
  { n: "01", title: "Body Disassembly",
    summary: "All body panels and components are removed and catalogued through a comprehensive parts list.",
    detail: "Panels, trim and fittings are removed with care and each part is recorded on the parts list, so every component can be tracked, assessed and returned to the vehicle correctly.",
    imageAlt: "Technician removing body panels and components" },
  { n: "02", title: "Mechanical & Electrical Removal",
    summary: "Drivetrain and engine are fully removed. The engine is sent to a specialist engine builder for rebuilding.",
    detail: "With the mechanical and electrical components taken out, the body can be restored on its own. The engine goes to a specialist engine builder for rebuilding.",
    imageAlt: "Engine and drivetrain removed from the vehicle" },
  { n: "03", title: "Bare-Shell Reduction",
    summary: "The vehicle is reduced to a bare shell.",
    detail: "Remaining trim and fittings are taken off, leaving the bare body shell so every surface can be inspected and worked on properly.",
    imageAlt: "Vehicle body reduced to a bare shell" },
  { n: "04", title: "Metal Stripping",
    summary: "The shell is stripped to bare metal and treated to prevent corrosion.",
    detail: "Old paint and coatings are removed down to bare metal, revealing the true condition of the panels. The exposed metal is then treated to prevent corrosion.",
    imageAlt: "Body shell stripped back to bare metal" },
  { n: "05", title: "Rustproofing & Cavity Wax Protection",
    summary: "Body panels and hidden cavities receive protective corrosion treatments.",
    detail: "Rustproofing is applied to the panels and wax is worked into hidden cavities where moisture can collect, helping protect areas that are difficult to reach.",
    imageAlt: "Rustproofing and cavity wax being applied to the body" },
  { n: "06", title: "Primer Application & Body Repair",
    summary: "Protective primer is applied and structural bodywork is addressed.",
    detail: "Primer protects the prepared metal, while structural bodywork restores the shape and integrity of the shell.",
    imageAlt: "Primer application and body repair in progress" },
  { n: "07", title: "Paint Preparation",
    summary: "Body filling, sculpting, and surface shaping are performed.",
    detail: "Body filler is applied and sculpted, and surfaces are shaped and refined until panels, lines and gaps are ready for refinishing.",
    imageAlt: "Surface preparation and body filling before paint" },
  { n: "08", title: "Paint Correction",
    summary: "Final paint is applied and refined.",
    detail: "The final paint is applied and then refined through correction and polishing to bring out depth and gloss.",
    imageAlt: "Paintwork being refined and corrected" },
  { n: "09", title: "Ceramic Coating",
    summary: "A long-term protective ceramic coating is applied.",
    detail: "A long-term protective ceramic coating is applied over the finished paintwork to help preserve the finish.",
    imageAlt: "Ceramic coating applied to finished paintwork" },
  { n: "10", title: "Quality Check",
    summary: "Final inspection is conducted to confirm restoration standards.",
    detail: "Every panel, line and finish is inspected against the workshop's restoration standards before the vehicle is presented and handed over.",
    imageAlt: "Final quality inspection of the completed restoration" },
];

export type Methodology = {
  id: "frame-on" | "frame-off";
  name: string;
  description: string;
  /** Decorative studio photograph for the selector card (not a claim about a specific project). */
  image?: string;
  imageAlt: string;
  stages: ProcessStage[];
};

export const methodologies: Methodology[] = [
  {
    id: "frame-on",
    name: "Frame-On Restoration",
    description: "A comprehensive body restoration process that retains the vehicle's mechanical and electrical systems.",
    image: "/images/mustang-showroom.webp",
    imageAlt: "Classic Ford Mustang presented in the Alex Restoration studio",
    stages: frameOnStages,
  },
  {
    id: "frame-off",
    name: "Frame-Off Restoration",
    description: "An extensive restoration process involving the removal of mechanical and electrical components, including the drivetrain and engine, for specialized rebuilding where specified.",
    image: "/images/porsche-911-black-hero.webp",
    imageAlt: "Black classic Porsche 911 in the Alex Restoration studio",
    stages: frameOffStages,
  },
];
