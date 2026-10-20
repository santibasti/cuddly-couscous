/**
 * Authorised photography. Drop files in /public/images and set the paths here.
 * `undefined` renders a clearly marked placeholder. Add `alt` text for every image.
 */
type M = { src?: string; alt: string; label: string };

export const media = {
  hero: { src: undefined, alt: "Restored classic Porsche 911 inside the workshop", label: "Hero — classic 911 in workshop" } as M,
  about: [
    { src: undefined, alt: "Craftsman performing detailed bodywork", label: "Craftsman at work" },
    { src: undefined, alt: "Workshop restoration in progress", label: "Restoration process" },
  ] as M[],
  workshop: [
    { src: undefined, alt: "Technician working on a premium vehicle", label: "Technicians" },
    { src: undefined, alt: "Paint preparation", label: "Paint preparation" },
    { src: undefined, alt: "Precision bodywork", label: "Precision bodywork" },
    { src: undefined, alt: "Detailed craftsmanship", label: "Detail craftsmanship" },
    { src: undefined, alt: "Final inspection", label: "Final inspection" },
  ] as M[],
};
