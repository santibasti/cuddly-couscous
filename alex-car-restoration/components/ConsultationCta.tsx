import Link from "next/link";
import Reveal from "./Reveal";

type Props = { heading?: string; text?: string; button?: string; href?: string; className?: string };

/** Reusable closing call to action. Links to the inquiry form on /contact. */
export default function ConsultationCta({
  heading = "Every great restoration begins with a conversation.",
  text = "Every restoration begins with a careful assessment of your vehicle and your goals.",
  button = "Book a Consultation",
  href = "/contact",
  className = "bg-obsidian",
}: Props) {
  return (
    <section aria-label="Book a consultation" className={`${className} border-t border-silver/10 py-14 sm:py-20 lg:py-32`}>
      <div className="container-x lg:flex lg:items-end lg:justify-between lg:gap-12">
        <Reveal>
          <div className="max-w-3xl">
            <h2 className="h-display text-[clamp(1.75rem,4vw,3.5rem)]">{heading}</h2>
            <p className="mt-5 text-base leading-relaxed text-warm/75 sm:text-lg">{text}</p>
          </div>
        </Reveal>
        <Reveal delay={0.1}><Link href={href} className="btn-primary mt-8 w-full lg:mt-0 lg:w-auto lg:shrink-0">{button}</Link></Reveal>
      </div>
    </section>
  );
}
