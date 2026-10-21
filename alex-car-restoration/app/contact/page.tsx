import type { Metadata } from "next";
import Contact from "@/components/Contact";
import FaqSection from "@/components/FaqSection";

export const metadata: Metadata = {
  title: "Contact & Project Inquiry",
  description: "Tell us about your vehicle and the restoration you envision. Book a consultation with Alex Car Restoration in Quezon City, Philippines.",
  alternates: { canonical: "/contact" },
};

export default function ContactPage() {
  return (
    <>
      <Contact as="h1" />
      <FaqSection />
    </>
  );
}
