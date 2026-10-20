import { NextResponse } from "next/server";

export const runtime = "nodejs";

const MAX_FILES = 6;
const MAX_FILE_BYTES = 5 * 1024 * 1024;
const FIELDS = ["name", "email", "phone", "brand", "model", "year", "service", "description", "contactMethod", "appointment", "preferredDate"] as const;
const clean = (v: FormDataEntryValue | null, max = 2000) => (typeof v === "string" ? v.trim().slice(0, max) : "");

export async function POST(req: Request) {
  let form: FormData;
  try { form = await req.formData(); } catch { return NextResponse.json({ error: "Invalid request." }, { status: 400 }); }

  // Honeypot: bots fill this hidden field.
  if (clean(form.get("website"))) return NextResponse.json({ ok: true });

  const data: Record<string, string> = {};
  for (const f of FIELDS) data[f] = clean(form.get(f), f === "description" ? 5000 : 200);

  if (!data.name || !/^\S+@\S+\.\S+$/.test(data.email) || !data.phone || !data.description) {
    return NextResponse.json({ error: "Please complete name, a valid email, mobile number and project description." }, { status: 422 });
  }

  const files = form.getAll("photos").filter((f): f is File => f instanceof File && f.size > 0);
  if (files.length > MAX_FILES) return NextResponse.json({ error: `Please attach up to ${MAX_FILES} photos.` }, { status: 422 });
  for (const f of files) {
    if (!f.type.startsWith("image/") || f.size > MAX_FILE_BYTES) {
      return NextResponse.json({ error: "Photos must be images under 5 MB each." }, { status: 422 });
    }
  }

  const webhook = process.env.INQUIRY_WEBHOOK_URL;
  if (!webhook) {
    if (process.env.NODE_ENV === "production") {
      console.error("INQUIRY_WEBHOOK_URL is not configured; inquiry not delivered.");
      return NextResponse.json({ error: "Inquiries are temporarily unavailable. Please contact us directly." }, { status: 503 });
    }
    console.log("[inquiry:dev]", data, `${files.length} photo(s)`);
    return NextResponse.json({ ok: true });
  }

  const out = new FormData();
  for (const [k, v] of Object.entries(data)) out.append(k, v);
  files.forEach((f) => out.append("photos", f, f.name));
  try {
    const res = await fetch(webhook, { method: "POST", body: out, headers: { Accept: "application/json" } });
    if (!res.ok) throw new Error(`Webhook responded ${res.status}`);
  } catch (e) {
    console.error("Inquiry delivery failed", e);
    return NextResponse.json({ error: "We could not send your inquiry. Please try again or contact us directly." }, { status: 502 });
  }
  return NextResponse.json({ ok: true });
}
