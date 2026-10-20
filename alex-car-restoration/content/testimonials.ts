export type Testimonial = {
  quote: string;
  client: string; // name as shown publicly on the source
  vehicle?: string;
  category?: string;
  source?: string;
  /** Text was cut off at the source ("…") */
  truncated?: boolean;
  /** Machine-translated by the source platform */
  translated?: boolean;
};

/**
 * Only genuine, verified reviews. These are quoted verbatim from the public
 * Google Business Profile (visible text only; no wording edited).
 * Confirm the business is happy to display them.
 */
export const testimonials: Testimonial[] = [
  {
    quote:
      "I just got my PPF removed, had a few panels repainted, and the whole car ceramic coated here, and I\u2019m really happy with how it turned out. These guys actually do things the right way\u2014no shortcuts, no rushing through steps just to get the",
    client: "GRY",
    category: "PPF removal · Repaint · Ceramic coating",
    source: "Google",
    truncated: true,
  },
  {
    quote:
      "Highly recommended Alex Car Restoration! I was very satisfied with the service experience from the beginning until the car was released. You can feel the professionalism of the team and the car was really polished and looked like new when",
    client: "Sherwin Dela Paz",
    source: "Google",
    truncated: true,
    translated: true,
  },
  { quote: "Awesome", client: "TJ", source: "Google" },
];
