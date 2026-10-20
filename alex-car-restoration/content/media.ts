/**
 * Authorised photography. Drop files in /public/images and set the paths here.
 * `undefined` renders a clearly marked placeholder. Add `alt` text for every image.
 */
type M = { src?: string; alt: string; label: string };

export const media = {
  hero: { src: "/images/vespa-showroom.webp", alt: "Restored vintage Vespa scooter in a deep red finish with a brown leather seat", label: "Hero" } as M,
  about: [
    { src: "/images/craftsman-rolls-royce.webp", alt: "Craftsman performing detailed work on the front wing of a Rolls-Royce", label: "Craftsman at work" },
    { src: "/images/vespa-detail.webp", alt: "Detail of a restored vintage Vespa with chrome trim and period accessories", label: "Restoration detail" },
  ] as M[],
  workshop: [
    { src: "/images/craftsman-rolls-royce.webp", alt: "Technician carefully working on a luxury vehicle in the workshop", label: "Technicians" },
    { src: "/images/vespa-detail.webp", alt: "Close-up of a restored Vespa's paintwork, spare wheel and chrome", label: "Detailed craftsmanship" },
    { src: "/images/vespa-showroom.webp", alt: "Finished vintage Vespa presented in the showroom", label: "Final presentation" },
    { src: "/images/show-trophy-1.webp", alt: "Alex Car Restoration team member lifting a trophy at a car show", label: "At the show" },
    { src: "/images/show-trophy-2.webp", alt: "Speaking beside a restored classic car at a car show", label: "At the show" },
  ] as M[],
};
