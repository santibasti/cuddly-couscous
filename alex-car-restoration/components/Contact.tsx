"use client";
import { useState, type FormEvent } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { CheckCircle2, MessageCircle, Phone, MapPin, Mail } from "lucide-react";
import Reveal from "./Reveal";
import { site } from "@/content/site";
import { services } from "@/content/services";

type Status = "idle" | "sending" | "done" | "error";

export default function Contact() {
  const [status, setStatus] = useState<Status>("idle");
  const [error, setError] = useState("");
  const [appointment, setAppointment] = useState(false);
  const c = site.contact;

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setStatus("sending"); setError("");
    try {
      const res = await fetch("/api/inquiry", { method: "POST", body: new FormData(e.currentTarget) });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error ?? "Something went wrong.");
      setStatus("done");
      (window as any).gtag?.("event", "generate_lead", { form: "project_inquiry" });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
      setStatus("error");
    }
  }

  const direct = [
    c.phone && { icon: Phone, label: "Call", value: c.phone, href: `tel:${c.phone.replace(/\s/g, "")}` },
    c.whatsapp && { icon: MessageCircle, label: "WhatsApp", value: "Message us", href: `https://wa.me/${c.whatsapp}` },
    c.messenger && { icon: MessageCircle, label: "Messenger", value: "Message us", href: `https://m.me/${c.messenger}` },
    c.email && { icon: Mail, label: "Email", value: c.email, href: `mailto:${c.email}` },
    c.address && { icon: MapPin, label: "Workshop", value: c.address, href: c.mapLink ?? undefined },
  ].filter(Boolean) as { icon: typeof Phone; label: string; value: string; href?: string }[];

  return (
    <section id="contact" className="bg-obsidian py-24 lg:py-40">
      <div className="container-x grid gap-16 lg:grid-cols-12">
        <div className="lg:col-span-5">
          <Reveal><p className="eyebrow mb-6">Project Inquiry</p></Reveal>
          <Reveal delay={0.1}><h2 className="h-display text-[clamp(2rem,4.6vw,4.2rem)]">Your vehicle deserves exceptional craftsmanship.</h2></Reveal>
          <Reveal delay={0.2}><p className="mt-8 max-w-md text-base leading-relaxed text-warm/70">Tell us about your vehicle and the restoration you envision.</p></Reveal>

          <Reveal delay={0.3}>
            {direct.length > 0 ? (
              <ul className="mt-12 space-y-5">
                {direct.map(({ icon: Icon, label, value, href }) => (
                  <li key={label} className="flex items-start gap-4">
                    <Icon size={18} className="mt-1 text-silver" aria-hidden />
                    <div><p className="eyebrow">{label}</p>
                      {href ? <a href={href} className="text-sm hover:text-silver">{value}</a> : <p className="text-sm">{value}</p>}
                    </div>
                  </li>
                ))}
                {c.hours && <li className="pl-9 text-sm text-warm/70">{c.hours}</li>}
              </ul>
            ) : (
              <p className="mt-12 border-l border-silver/30 pl-5 text-sm text-silver">Verified contact details (phone, messaging, address and map) will appear here once confirmed by the business.</p>
            )}
            {c.mapEmbedUrl && (
              <iframe title="Workshop location on Google Maps" src={c.mapEmbedUrl} loading="lazy" referrerPolicy="no-referrer-when-downgrade"
                className="mt-10 aspect-video w-full border-0 grayscale" />
            )}
            {site.serviceAreas.length > 0 && <p className="mt-6 text-xs uppercase tracking-[0.18em] text-silver">Serving: {site.serviceAreas.join(" · ")}</p>}
          </Reveal>
        </div>

        <div className="lg:col-span-7">
          <AnimatePresence mode="wait">
            {status === "done" ? (
              <motion.div key="done" initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} role="status"
                className="border border-silver/20 bg-graphite p-10 sm:p-14">
                <CheckCircle2 className="text-silver" size={32} aria-hidden />
                <h3 className="mt-6 font-display text-3xl font-semibold uppercase tracking-tight">Thank you.</h3>
                <p className="mt-4 max-w-md text-sm leading-relaxed text-warm/75">Your inquiry has been received. We will review the details of your vehicle and be in touch through your preferred contact method.</p>
              </motion.div>
            ) : (
              <motion.form key="form" onSubmit={onSubmit} noValidate={false} className="bg-graphite p-6 sm:p-10" aria-describedby="form-error">
                <div className="grid gap-x-8 gap-y-6 sm:grid-cols-2">
                  <div><label className="label" htmlFor="name">Full Name *</label><input className="field" id="name" name="name" required autoComplete="name" /></div>
                  <div><label className="label" htmlFor="email">Email Address *</label><input className="field" id="email" name="email" type="email" required autoComplete="email" /></div>
                  <div><label className="label" htmlFor="phone">Mobile Number *</label><input className="field" id="phone" name="phone" type="tel" required autoComplete="tel" /></div>
                  <div><label className="label" htmlFor="service">Service Required</label>
                    <select className="field" id="service" name="service" defaultValue="">
                      <option value="" className="bg-graphite">Select a service</option>
                      {services.map((s) => <option key={s.id} value={s.title} className="bg-graphite">{s.title}</option>)}
                    </select></div>
                  <div><label className="label" htmlFor="brand">Vehicle Brand</label><input className="field" id="brand" name="brand" /></div>
                  <div><label className="label" htmlFor="model">Vehicle Model</label><input className="field" id="model" name="model" /></div>
                  <div><label className="label" htmlFor="year">Vehicle Year</label><input className="field" id="year" name="year" inputMode="numeric" maxLength={4} /></div>
                  <div><label className="label" htmlFor="contactMethod">Preferred Contact Method</label>
                    <select className="field" id="contactMethod" name="contactMethod" defaultValue="Phone call">
                      {["Phone call", "WhatsApp", "Messenger", "Email"].map((m) => <option key={m} className="bg-graphite">{m}</option>)}
                    </select></div>
                  <div className="sm:col-span-2"><label className="label" htmlFor="description">Project Description *</label>
                    <textarea className="field resize-none" id="description" name="description" rows={4} required /></div>
                  <div className="sm:col-span-2"><label className="label" htmlFor="photos">Upload Vehicle Photos (up to 6 images, 5 MB each)</label>
                    <input className="field file:mr-4 file:border-0 file:bg-obsidian file:px-4 file:py-2 file:text-[11px] file:uppercase file:tracking-[0.18em] file:text-silver" id="photos" name="photos" type="file" accept="image/*" multiple /></div>
                  <div className="sm:col-span-2">
                    <label className="flex items-center gap-3 text-sm text-warm/80">
                      <input type="checkbox" name="appointment" value="yes" checked={appointment} onChange={(e) => setAppointment(e.target.checked)} className="h-4 w-4 accent-[#A51C30]" />
                      I would like to request an appointment
                    </label>
                    {appointment && (<div className="mt-4"><label className="label" htmlFor="preferredDate">Preferred date &amp; time</label><input className="field" id="preferredDate" name="preferredDate" type="datetime-local" /></div>)}
                  </div>
                  {/* honeypot */}
                  <div className="hidden" aria-hidden><label>Website<input name="website" tabIndex={-1} autoComplete="off" /></label></div>
                </div>
                <p id="form-error" role="alert" className="mt-6 min-h-5 text-sm text-racing">{status === "error" ? error : ""}</p>
                <button type="submit" disabled={status === "sending"} className="btn-primary mt-4 w-full disabled:opacity-60 sm:w-auto">
                  {status === "sending" ? "Sending…" : "Submit Inquiry"}
                </button>
              </motion.form>
            )}
          </AnimatePresence>
        </div>
      </div>
    </section>
  );
}
