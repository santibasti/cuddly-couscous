import Hero from "@/components/Hero";
import About from "@/components/About";
import Services from "@/components/Services";
import Portfolio from "@/components/Portfolio";
import Process from "@/components/Process";
import Provenance from "@/components/Provenance";
import Workshop from "@/components/Workshop";
import Testimonials from "@/components/Testimonials";
import Contact from "@/components/Contact";
import { getProjects, getServices, getTestimonials } from "@/lib/data";

export default async function Home() {
  const [projects, services, testimonials] = await Promise.all([getProjects(), getServices(), getTestimonials()]);
  return (
    <>
      <Hero />
      <About />
      <Services services={services} />
      <Portfolio projects={projects} limit={4} />
      <Process />
      <Provenance />
      <Workshop />
      <Testimonials items={testimonials} />
      <Contact />
    </>
  );
}
