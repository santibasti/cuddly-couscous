/**
 * Authorised photography. Drop files in /public/images and set the paths here.
 * `undefined` renders a clearly marked placeholder. Add `alt` text for every image.
 */
type M = { src?: string; alt: string; label: string };

export const media = {
  hero: { src: "/images/porsche-911-white.webp", alt: "White Porsche 911 with carbon-fibre side intake and forged wheels in the workshop", label: "Hero" } as M,
  about: [
    { src: "/images/craftsman-rolls-royce.webp", alt: "Craftsman performing detailed work on the front wing of a Rolls-Royce", label: "Craftsman at work" },
    { src: "/images/shopfront-gtr.webp", alt: "Blue Nissan GT-R parked outside the Alex Restoration workshop", label: "Workshop" },
  ] as M[],
  workshop: [
    { src: "/images/craftsman-rolls-royce.webp", alt: "Technician carefully working on a luxury vehicle in the workshop", label: "Technicians" },
    { src: "/images/panel-beating.webp", alt: "Craftsman shaping a body panel by hand with a hammer", label: "Precision bodywork" },
    { src: "/images/landcruiser-teardown.webp", alt: "Technician working inside a stripped-down SUV during restoration", label: "Restoration in progress" },
    { src: "/images/technicians-assembly.webp", alt: "Two technicians refitting a headlamp assembly in the preparation area", label: "Preparation" },
    { src: "/images/vespa-detail.webp", alt: "Close-up of a restored Vespa's paintwork, spare wheel and chrome", label: "Detailed craftsmanship" },
    { src: "/images/porsche-polish-team.webp", alt: "Three technicians machine-polishing a blue Porsche in the finishing studio", label: "Paint finishing" },
    { src: "/images/g-class-front-end.webp", alt: "Technicians inspecting the front end of a black SUV during reassembly", label: "Inspection" },
    { src: "/images/silver-suv-polish.webp", alt: "Technician hand-finishing the paint of a silver SUV", label: "Paint correction" },
    { src: "/images/lamborghini-paint-booth.webp", alt: "Two technicians masking and preparing a yellow Lamborghini in the paint booth", label: "Preparation" },
    { src: "/images/steam-cleaning.webp", alt: "Technician steam-cleaning the bonnet of a white car with black stripes", label: "Steam cleaning" },
    { src: "/images/team-workshop.webp", alt: "The Alex Car Restoration team in the workshop", label: "The team" },
  ] as M[],
};
