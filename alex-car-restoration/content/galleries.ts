/**
 * Real photography supplied by the business (files in /public/alex-restoration).
 *
 * Alt text and captions describe only what is visible. Do NOT add restoration
 * scope, dates, clients, event names, award names or people's identities
 * without verification. Confirm image rights and consent for identifiable
 * people (event photos) before public deployment.
 *
 * These galleries do not document the Frame-On / Frame-Off processes or the
 * Provenance Book, and must not be described as such.
 */
export type GalleryImage = {
  src: string;
  alt: string;
  width: number;
  height: number;
  caption?: string;
};

export type GalleryGroup = {
  id: string;
  eyebrow: string;
  title: string;
  intro: string;
  /** Index of the image shown large above the grid */
  lead: number;
  items: GalleryImage[];
};

export const vespaImages: GalleryImage[] = [
    { src: "/alex-restoration/images/vespa/vespa-restoration-detail-01.webp", alt: "A red vintage Vespa scooter in the Alex Restoration showroom, with a trophy cabinet behind", width: 1440, height: 962 },
    { src: "/alex-restoration/images/vespa/vespa-restoration-detail-02.webp", alt: "Close-up of the red front shield, chrome trim and badge of a vintage Vespa", width: 1440, height: 962 },
    { src: "/alex-restoration/images/vespa/vespa-restoration-detail-03.webp", alt: "Spare wheel on a red vintage Vespa with a vintage Esso 2-T oil can strapped in the centre", width: 1440, height: 962 },
    { src: "/alex-restoration/images/vespa/vespa-restoration-detail-04.webp", alt: "Stitched brown leather handlebar grip on a vintage Vespa", width: 1440, height: 962 },
    { src: "/alex-restoration/images/vespa/vespa-restoration-detail-05.webp", alt: "Chrome bar-end and gear indicator numerals on a vintage Vespa handlebar", width: 1440, height: 962 },
    { src: "/alex-restoration/images/vespa/vespa-restoration-detail-06.webp", alt: "Vintage Vespa speedometer with a cream dial set in glossy red paintwork", width: 1440, height: 962 },
    { src: "/alex-restoration/images/vespa/vespa-restoration-detail-07.webp", alt: "Chrome fuel cap and gold pinstriping on the red body of a vintage Vespa", width: 1440, height: 962 },
    { src: "/alex-restoration/images/vespa/vespa-restoration-detail-08.webp", alt: "Front wheel and mudguard of a red vintage Vespa on a polished floor", width: 1440, height: 962 },
    { src: "/alex-restoration/images/vespa/vespa-restoration-detail-09.webp", alt: "Engine cowl, vents and rear wheel of a red vintage Vespa", width: 1440, height: 962 },
    { src: "/alex-restoration/images/vespa/vespa-restoration-detail-10.webp", alt: "Brown leather Piaggio seat on a vintage Vespa with trophies blurred behind", width: 1440, height: 962 },
    { src: "/alex-restoration/images/vespa/vespa-restoration-detail-11.webp", alt: "Front view of a red vintage Vespa with its headlight and handlebars", width: 1440, height: 962 },
    { src: "/alex-restoration/images/vespa/vespa-restoration-detail-12.webp", alt: "Opened seat of a vintage Vespa revealing its interior, with trophies behind", width: 1440, height: 962 },
    { src: "/alex-restoration/images/vespa/vespa-restoration-detail-13.webp", alt: "Rear three-quarter view of a red vintage Vespa with a brown leather seat and Alex Restoration plate", width: 1440, height: 962 },
];

export const landCruiserImages: GalleryImage[] = [
    { src: "/alex-restoration/images/land-cruiser/toyota-land-cruiser-before-after-bodykit.webp", alt: "Before and after views of a white Toyota Land Cruiser during a body-kit installation", width: 1920, height: 1280, caption: "Body-kit installation: before and after" },
    { src: "/alex-restoration/images/land-cruiser/toyota-land-cruiser-rear-workshop.webp", alt: "Rear three-quarter view of a white Toyota Land Cruiser in the workshop", width: 1920, height: 1280 },
    { src: "/alex-restoration/images/land-cruiser/toyota-land-cruiser-detail-01.webp", alt: "Front view of a white Toyota Land Cruiser in the workshop", width: 1920, height: 1280 },
    { src: "/alex-restoration/images/land-cruiser/toyota-land-cruiser-detail-02.webp", alt: "Wheel arch and body-kit flare on a white Toyota Land Cruiser", width: 1920, height: 1280 },
    { src: "/alex-restoration/images/land-cruiser/toyota-land-cruiser-detail-03.webp", alt: "Toyota badge and Land Cruiser lettering on the rear of a white Toyota Land Cruiser", width: 1920, height: 1280 },
];

export const eventImages: GalleryImage[] = [
    { src: "/alex-restoration/images/events/alex-restoration-awards.webp", alt: "Trophies arranged on a display beside an Alex Restoration sign", width: 1920, height: 1281 },
    { src: "/alex-restoration/images/events/automotive-event-01.webp", alt: "A trophy being raised on stage at an automotive show", width: 1920, height: 1279 },
    { src: "/alex-restoration/images/events/automotive-event-02.webp", alt: "Group holding trophies beside a classic car at an automotive show", width: 1920, height: 1281 },
    { src: "/alex-restoration/images/events/automotive-event-03.webp", alt: "Team and guests gathered beside a classic car at an automotive show", width: 1920, height: 1281 },
    { src: "/alex-restoration/images/events/automotive-event-04.webp", alt: "A speaker addressing a crowd beside a classic car at an automotive show", width: 1920, height: 1281 },
    { src: "/alex-restoration/images/events/automotive-event-05.webp", alt: "Visitors walking among classic cars in an exhibition hall", width: 1200, height: 1600 },
    { src: "/alex-restoration/images/events/automotive-event-06.webp", alt: "Classic cars on display in a roped-off exhibition hall", width: 1142, height: 1523 },
];

export const featuredGalleries: GalleryGroup[] = [
  {
    id: "vespa",
    eyebrow: "Gallery",
    title: "A red vintage Vespa, in detail.",
    intro: "A closer look at the paintwork, chrome, leather and period details of a vintage Vespa photographed in the Alex Restoration showroom.",
    lead: 0,
    items: vespaImages,
  },
  {
    id: "land-cruiser",
    eyebrow: "Gallery",
    title: "Toyota Land Cruiser body-kit installation.",
    intro: "A white Toyota Land Cruiser photographed in the workshop, including a before-and-after view of its body-kit installation.",
    lead: 0,
    items: landCruiserImages,
  },
];

export const eventsGallery = {
  eyebrow: "Events & Recognition",
  title: "Alex Car Restoration at automotive events.",
  intro: "Moments from automotive shows and gatherings.",
  items: eventImages,
};
