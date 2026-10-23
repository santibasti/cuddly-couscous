/**
 * Colour & interior visualiser options (editable).
 * ILLUSTRATIVE ONLY: a generic demo car, not a specific vehicle or any Alex
 * Restoration project. Names are placeholders; replace with the real paint,
 * leather and trim options once confirmed. Colours are approximate on screen.
 */
export type Option = { id: string; name: string; hex: string };

export const visualiserIntro = {
  eyebrow: "Design Visualiser",
  title: "Imagine it. Then we build it.",
  intro: "Explore paint, wheel and interior combinations on an illustrative demo car. It is a design aid only; final colours and materials are chosen with you at consultation.",
  disclaimer: "Illustrative demo car, not a specific vehicle or past project. On-screen colours are approximate; physical paint and trim samples are confirmed at consultation.",
};

export const paints: Option[] = [
  { id: "obsidian", name: "Obsidian Black", hex: "#0E1012" },
  { id: "racing", name: "Racing Red", hex: "#A51C30" },
  { id: "ivory", name: "Ivory White", hex: "#E7E3D6" },
  { id: "silver", name: "Metallic Silver", hex: "#A9AEB4" },
  { id: "racing-green", name: "British Racing Green", hex: "#1F4A38" },
  { id: "midnight", name: "Midnight Blue", hex: "#1B2B4D" },
  { id: "bronze", name: "Bronze", hex: "#8A6034" },
  { id: "slate", name: "Slate Grey", hex: "#4A4F55" },
];

export const wheels: Option[] = [
  { id: "polished", name: "Polished", hex: "#C9CDD1" },
  { id: "graphite", name: "Graphite", hex: "#43474C" },
  { id: "gold", name: "Gold", hex: "#B59A6D" },
];

export const leathers: Option[] = [
  { id: "black", name: "Black", hex: "#17181A" },
  { id: "tan", name: "Tan", hex: "#A8713F" },
  { id: "cognac", name: "Cognac", hex: "#7A3F1D" },
  { id: "cream", name: "Cream", hex: "#D9CFB8" },
  { id: "red", name: "Red", hex: "#7E1626" },
  { id: "grey", name: "Grey", hex: "#6B6F74" },
];

export const stitching: Option[] = [
  { id: "contrast-cream", name: "Cream", hex: "#EDE6D3" },
  { id: "contrast-red", name: "Red", hex: "#C32A40" },
  { id: "contrast-black", name: "Black", hex: "#0B0D0F" },
];

export const carpets: Option[] = [
  { id: "carbon", name: "Charcoal", hex: "#202225" },
  { id: "sand", name: "Sand", hex: "#B7A98C" },
  { id: "oxblood", name: "Oxblood", hex: "#3E1119" },
];
