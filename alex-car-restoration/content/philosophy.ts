/**
 * Restoration philosophy: Source -> Restore -> Manufacture.
 * `image`: authorised photograph (put in /public). Unset = marked placeholder.
 */
export const philosophy = {
  eyebrow: "Our Restoration Philosophy",
  heading: "Originality is our priority.",
  motto: ["Source", "Restore", "Manufacture"],
  body: [
    "Our priority is to source original, period-correct components whenever available.",
    "When original parts cannot be sourced, we explore restoration of existing components or the careful manufacture of replacement parts while respecting the vehicle’s original design, specifications, and character.",
  ],
  principles: [
    { n: "01", title: "Source", text: "Original, period-correct components are our first priority whenever they are available.",
      image: "/alex-restoration/images/vespa/vespa-restoration-detail-06.webp", imageAlt: "Period instrument and detailing on a vintage Vespa" },
    { n: "02", title: "Restore", text: "When original parts cannot be sourced, we explore restoring the existing components.",
      image: "/images/panel-beating.webp", imageAlt: "Craftsman shaping a body panel by hand with a hammer" },
    { n: "03", title: "Manufacture", text: "Where needed, replacement parts are carefully manufactured, respecting the vehicle’s original design, specifications, and character.",
      image: undefined as string | undefined, imageAlt: "Replacement part being carefully manufactured" },
  ],
};
