import type { Metadata } from "next";
import About from "@/components/About";
import Philosophy from "@/components/Philosophy";
import Workshop from "@/components/Workshop";
import EventsGallery from "@/components/EventsGallery";
import Testimonials from "@/components/Testimonials";
import ConsultationCta from "@/components/ConsultationCta";
import { getTestimonials } from "@/lib/data";

export const metadata: Metadata = {
  title: "About Alex Car Restoration | Since 1992",
  description: "Since 1992, Alex Car Restoration has restored classic, vintage and luxury vehicles in Quezon City, Philippines, with originality, craftsmanship and respect for each vehicle's story.",
  alternates: { canonical: "/about" },
};

export default async function AboutPage() {
  const testimonials = await getTestimonials();
  return (
    <>
      <About as="h1" />
      <Philosophy />
      <Workshop />
      <EventsGallery />
      <Testimonials items={testimonials} />
      <ConsultationCta />
    </>
  );
}
