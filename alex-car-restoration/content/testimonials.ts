export type Testimonial = {
  quote: string;
  client: string; // only with the client's written permission
  vehicle: string;
  category: string;
};

/**
 * Only add genuine, verified testimonials with the client's permission.
 * Intentionally empty: no fictional reviews are generated.
 */
export const testimonials: Testimonial[] = [];
