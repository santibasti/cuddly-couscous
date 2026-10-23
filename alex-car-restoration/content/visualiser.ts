/**
 * Colour & interior visualiser (editable).
 *
 * The page recolours a studio photograph in the browser: the paint panels and
 * the red upholstery are masked in /public/visualiser/*-masks.png (R = paint,
 * G = interior). It is ILLUSTRATIVE ONLY: not one of Alex Restoration's
 * projects. Colour names are placeholders; replace with the real paint and
 * leather options once confirmed. On-screen colours are approximate.
 *
 * To change the demo car: supply a new base photo + a mask PNG (same size) and
 * update `car` below; the swatches and the page need no other changes.
 */
export type Option = { id: string; name: string; hex: string };

export const visualiserIntro = {
  eyebrow: "Design Visualiser",
  title: "Imagine it. Then we build it.",
  intro: "Explore paint and interior combinations on illustrative classic cars. It is a design aid only; final colours and materials are chosen with you at consultation.",
  disclaimer: "Illustrative recolour of a studio photograph, not a specific vehicle or past project. On-screen colours are approximate; physical paint and trim samples are confirmed at consultation.",
};

export type DemoCar = {
  id: string;
  name: string;
  base: string;
  masks: string;
  width: number;
  height: number;
  alt: string;
  /** Median luminance of the original paint / upholstery, used to keep real shading */
  paintRef: number;
  interiorRef: number;
  /** false = no recolourable interior in this photo (hides the interior swatches) */
  hasInterior: boolean;
  /** Photo credit / licence note (fill in if required) */
  credit: string;
};

export const cars: DemoCar[] = [
  {
    id: "roadster",
    name: "Classic Roadster",
    base: "/visualiser/mercedes-190sl-base.webp",
    masks: "/visualiser/mercedes-190sl-masks.png",
    width: 1200, height: 900,
    alt: "Classic white roadster with a red interior, shown in a studio. Paint and interior colours can be changed.",
    paintRef: 0.884, interiorRef: 0.366, hasInterior: true, credit: "",
  },
  {
    id: "coupe",
    name: "Classic Coupe",
    base: "/visualiser/coupe-base.webp",
    masks: "/visualiser/coupe-masks.png",
    width: 1200, height: 900,
    alt: "Classic red sports coupe on a dark background. The paint colour can be changed.",
    paintRef: 0.298, interiorRef: 0.366, hasInterior: false, credit: "",
  },
];

export const paints: Option[] = [
  { id: "ivory", name: "Ivory White", hex: "#E7E3D6" },
  { id: "racing", name: "Racing Red", hex: "#A51C30" },
  { id: "obsidian", name: "Obsidian Black", hex: "#0E1012" },
  { id: "silver", name: "Metallic Silver", hex: "#A9AEB4" },
  { id: "racing-green", name: "British Racing Green", hex: "#1F4A38" },
  { id: "midnight", name: "Midnight Blue", hex: "#1B2B4D" },
  { id: "bronze", name: "Bronze", hex: "#8A6034" },
  { id: "slate", name: "Slate Grey", hex: "#4A4F55" },
];

export const leathers: Option[] = [
  { id: "red", name: "Red", hex: "#B3242F" },
  { id: "tan", name: "Tan", hex: "#A8713F" },
  { id: "cognac", name: "Cognac", hex: "#7A3F1D" },
  { id: "cream", name: "Cream", hex: "#D9CFB8" },
  { id: "black", name: "Black", hex: "#17181A" },
  { id: "grey", name: "Grey", hex: "#6B6F74" },
];
