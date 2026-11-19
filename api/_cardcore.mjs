// supabase/functions/_shared/rates.ts
const P = (price, panels) => ({
	price,
	panels
});
const A = P(4799, 31);
const B = P(5799, 41);
const C = P(12799, 51);
const mk = (group, entries) => entries.map(([place, r]) => ({
	place,
	group,
	...r
}));
/** Package rate by location (extra panels beyond the package are ₱140 each everywhere). */
const RATES = [
	...mk("Metro Manila", [
		["Caloocan", A],
		["Las Piñas", B],
		["Makati", A],
		["Malabon", A],
		["Mandaluyong", A],
		["Manila", A],
		["Marikina", A],
		["Muntinlupa", B],
		["Navotas", A],
		["Parañaque", B],
		["Pasay", A],
		["Pasig", A],
		["Pateros", A],
		["Quezon City", A],
		["San Juan", A],
		["Taguig", A],
		["Valenzuela", A]
	]),
	...mk("Cavite", [
		["Alfonso", C],
		["Amadeo", C],
		["Bacoor", B],
		["Carmona", C],
		["Cavite City", B],
		["Dasmariñas", B],
		["General Trias", P(6799, 41)],
		["Imus", B],
		["Silang", C],
		["Tagaytay", C]
	]),
	...mk("Bulacan", [
		["Bocaue", B],
		["Marilao", B],
		["San Jose del Monte", B],
		["Santa Maria", B]
	]),
	...mk("Rizal", [
		["Antipolo", B],
		["Cainta", B],
		["Rodriguez (Montalban)", B]
	]),
	...mk("Province-level rate", [["Laguna", C], ["Batangas", C]])
];
/** Other services: rate, unit and minimum quantity (billed at the minimum until measured). */
const OTHER = [
	{
		match: /roof/i,
		code: "ROOF",
		name: "Roof Cleaning",
		rate: 145,
		unit: "sqm",
		min: 100
	},
	{
		match: /solar/i,
		code: "SOLAR",
		name: "Solar Panel Cleaning",
		rate: 245,
		unit: "panel",
		min: 20
	},
	{
		match: /floor|driveway|hardscape/i,
		code: "FLOOR",
		name: "Floor / Driveway Cleaning",
		rate: 125,
		unit: "sqm",
		min: 50
	},
	{
		match: /wall/i,
		code: "WALL",
		name: "Exterior Wall Cleaning",
		rate: 125,
		unit: "sqm",
		min: 50
	}
];
const norm = (s) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/ñ/g, "n");
const ALIASES = {
	"Rodriguez (Montalban)": ["rodriguez", "montalban"],
	"Quezon City": ["quezon city", "qc"],
	"Cavite City": ["cavite city"],
	"Parañaque": ["paranaque"],
	"Las Piñas": ["las pinas"],
	"Dasmariñas": ["dasmarinas", "dasma"],
	"San Jose del Monte": ["san jose del monte", "sjdm"]
};
/** Finds the city (or province) in an address; the longest name wins and "Metro Manila" is never mistaken for the city of Manila. */
function findRate(address) {
	const t = " " + norm(address).replace(/metro manila|ncr|national capital region/g, " ").replace(/[^a-z0-9]+/g, " ") + " ";
	const names = RATES.flatMap((r) => (ALIASES[r.place] ?? [norm(r.place)]).map((n) => ({
		r,
		n: norm(n)
	}))).sort((a, b) => b.n.length - a.n.length);
	for (const { r, n } of names) if (t.includes(" " + n + " ") || r.group !== "Province-level rate" && t.includes(" " + n + " city ")) return r;
}
function classify(service) {
	const t = String(service ?? "").trim();
	if (/solar/i.test(t)) return "SOLAR";
	if (/gutter|acp|cladding|ceiling|interior|indoor|post[- ]?construction|facade|façade|curtain\s*wall|rope|high[- ]?rise|pool/i.test(t)) return "custom";
	if (/^\s*$|glass|window|salamin|bintana|panel/i.test(t)) return "glass";
	const o = OTHER.find((x) => x.match.test(t));
	return o ? o.code : "custom";
}
// supabase/functions/_shared/estimate.ts
const peso$1 = (n) => `₱${n.toLocaleString("en-PH")}`;
const NOTE_EN = "The final amount is confirmed on site.";
const NOTE_TL = "Estimate lang po ito: ang crew po namin ang gagawa ng final count sa site, at ang final na halaga ay base sa bilang na iyon.";
const NOTE_TG = "Estimate lang po ito ha, kasi ang crew namin ang magbibilang ng final count sa site, at doon po ibabase ang final amount.";
const VERIFY = {
	en: "Let me have our team verify the correct rate for your location po.",
	tl: "Ipa-verify ko po sa aming team ang tamang rate para sa inyong lokasyon.",
	tg: "Paki-verify ko po muna sa team namin ang tamang rate para sa location ninyo, para sigurado po tayo sa presyo."
};
/** The starting rates (and, when a quantity is given, the estimate) for a service at an address. `qty` = glass panels, solar panels or square metres. */
const ASSESS = {
	custom: {
		en: "This service is priced after an assessment, so I do not have a fixed rate to quote. Our team will review the details and prepare a quotation po.",
		tl: "Ang serbisyong ito po ay pini-presyuhan pagkatapos ng assessment, kaya wala po akong fixed na rate na masasabi. Susuriin po ng aming team ang detalye at maghahanda sila ng quotation.",
		tg: "Ang service na ito po ay pini-presyuhan after ng assessment, kaya wala po akong fixed rate na masasabi. Ire-review po ng team namin ang details at gagawa sila ng quotation."
	},
	commercial: {
		en: "For commercial properties, may we have the property address po? Our team will do an initial assessment first, before scheduling an ocular visit. The ocular fee is ₱2,500, which is deductible once you proceed with the service.",
		tl: "",
		tg: ""
	}
};
const needsPerson = (kind) => ({
	ok: false,
	kind,
	rates_en: ASSESS[kind].en,
	rates_tl: ASSESS[kind].tl,
	rates_tglish: ASSESS[kind].tg,
	estimate_en: ASSESS[kind].en,
	estimate_tl: ASSESS[kind].tl,
	estimate_tglish: ASSESS[kind].tg
});
/** The rates only apply to what the rate table covers: residential glass packages and the roof / wall / floor / solar rates. Commercial properties and everything else are quoted by a person. */
/** Every language gets the same short English-first text (the Tagalog-heavy variants were retired in V2: they made the AI answer in Tagalog and too long). */
function estimate(address, service, qty, property = "residential", withMain = false) {
	const e = estimateEn(address, service, qty, property, withMain);
	return {
		...e,
		rates_tl: e.rates_en,
		rates_tglish: e.rates_en,
		estimate_tl: e.estimate_en,
		estimate_tglish: e.estimate_en
	};
}
function estimateEn(address, service, qty, property = "residential", withMain = false) {
	const q = Number.isFinite(Number(qty)) && Number(qty) > 0 ? Math.round(Number(qty)) : void 0;
	if (/commercial|business|office|store|company|building|condo(minium)? ?(corp|association)|hotel|school|hospital|warehouse|factory/i.test(property)) return needsPerson("commercial");
	const kindOf = classify(service);
	if (kindOf === "custom") return needsPerson("custom");
	const other = kindOf === "glass" ? void 0 : OTHER.find((o) => o.code === kindOf);
	if (other) {
		const total = (withMain ? q ?? 0 : Math.max(q ?? other.min, other.min)) * other.rate, kind = other.code === "SOLAR" ? "solar" : "area";
		const rates_en = withMain ? `${other.name} is ₱${other.rate} per ${other.unit}. Booked together with another main service (like a window cleaning package or roof cleaning), there is no minimum charge: you pay per ${other.unit} only for the quantity our crew counts.` : `${other.name} is ₱${other.rate} per ${other.unit}, with a minimum of ${other.min} ${other.unit}${other.unit === "panel" && other.min > 1 ? "s" : ""} (${peso$1(other.rate * other.min)}).`;
		const rates_tl = withMain ? `Ang ${other.name} po ay ₱${other.rate} bawat ${other.unit}. Kapag isinabay sa isa pang main service (tulad ng window cleaning package o roof cleaning), walang minimum na singil: ang babayaran lang po ay ang dami na bibilangin ng aming crew, bawat ${other.unit}.` : `Ang ${other.name} po ay ₱${other.rate} bawat ${other.unit}, may minimum na ${other.min} ${other.unit} (${peso$1(other.rate * other.min)}).`;
		const rates_tglish = withMain ? `Ang ${other.name} po namin ay ₱${other.rate} per ${other.unit}. Kapag isinabay sa isa pang main service (like window cleaning package o roof cleaning), walang minimum charge po: ang babayaran lang ay ang quantity na bibilangin ng crew namin, per ${other.unit}.` : `Ang ${other.name} po namin ay ₱${other.rate} per ${other.unit}, may minimum na ${other.min} ${other.unit} (${peso$1(other.rate * other.min)}).`;
		if (!q) return {
			ok: true,
			kind,
			unit: other.unit,
			rates_en,
			rates_tl,
			rates_tglish,
			estimate_en: "",
			estimate_tl: "",
			estimate_tglish: ""
		};
		const under = !withMain && q < other.min;
		const u = other.unit === "panel" && q > 1 ? "panels" : other.unit;
		return {
			ok: true,
			kind,
			unit: other.unit,
			qty: q,
			estimate: total,
			rates_en,
			rates_tl,
			rates_tglish,
			estimate_tglish: `Para sa ${q} ${u}${under ? ` (below sa ${other.min} minimum, kaya minimum po ang singil)` : ""}, ang estimate po ay ${peso$1(total)}. ${NOTE_TG}`,
			estimate_en: `For ${q} ${u}${under ? ` (below the ${other.min} minimum, so the minimum applies)` : ""}, the estimate is ${peso$1(total)}. ${NOTE_EN}`,
			estimate_tl: `Para sa ${q} ${u}${under ? ` (mas mababa sa minimum na ${other.min}, kaya minimum ang sisingilin)` : ""}, ang estimate po ay ${peso$1(total)}. ${NOTE_TL}`
		};
	}
	const rate = findRate(address);
	if (!rate) return {
		ok: false,
		kind: "unknown",
		rates_en: VERIFY.en,
		rates_tl: VERIFY.tl,
		rates_tglish: VERIFY.tg,
		estimate_en: VERIFY.en,
		estimate_tl: VERIFY.tl,
		estimate_tglish: VERIFY.tg
	};
	const extra = Math.max(0, (q ?? 0) - rate.panels), total = rate.price + extra * 140;
	const prov = rate.group === "Province-level rate";
	const PV = {
		en: prov ? ` This is our ${rate.place} province rate; our team will confirm your exact municipality and coverage.` : "",
		tl: prov ? ` Ito po ang province rate namin sa ${rate.place}; kokumpirmahin po ng aming team ang eksaktong munisipyo at coverage.` : "",
		tg: prov ? ` Ito ang province rate namin sa ${rate.place}; ico-confirm po ng team ang exact municipality at coverage.` : ""
	};
	const rates_en = `Our window cleaning package in ${rate.place} starts at ${peso$1(rate.price)}, covering up to ${rate.panels} glass panels. Additional panels are ${peso$1(140)} each.${PV.en}`;
	const rates_tl = `Ang window cleaning package po namin sa ${rate.place} ay nagsisimula sa ${peso$1(rate.price)}, para sa hanggang ${rate.panels} glass panels. Ang karagdagang panel po ay ${peso$1(140)} bawat isa.${PV.tl}`;
	const rates_tglish = `Hi po! Sa ${rate.place}, ang window cleaning package namin ay nagsisimula sa ${peso$1(rate.price)} para sa hanggang ${rate.panels} glass panels. Ang additional panel ay ${peso$1(140)} each po.${PV.tg}`;
	const base = {
		ok: true,
		kind: "glass",
		place: rate.place,
		package_price: rate.price,
		included: rate.panels,
		extra_rate: 140,
		rates_en,
		rates_tl,
		rates_tglish
	};
	if (!q) return {
		...base,
		estimate_en: "",
		estimate_tl: "",
		estimate_tglish: ""
	};
	const how_en = extra ? `the ${peso$1(rate.price)} package plus ${extra} additional panel${extra > 1 ? "s" : ""} at ${peso$1(140)}` : `within the ${peso$1(rate.price)} package, with no additional panels`;
	const how_tl = extra ? `ang ${peso$1(rate.price)} na package at ${extra} karagdagang panel na ${peso$1(140)} bawat isa` : `sakop ng ${peso$1(rate.price)} na package, walang karagdagang panel`;
	const tg = extra ? `Para sa around ${q} panels, ang estimated total po ay ${peso$1(total)} (${peso$1(rate.price)} package + ${extra} additional panel${extra > 1 ? "s" : ""} na ${peso$1(140)} each). ${NOTE_TG}${PV.tg}` : `Para sa ${q} panels ninyo, sakop pa po siya ng package, so ang estimate ay ${peso$1(total)}. ${NOTE_TG}${PV.tg}`;
	return {
		...base,
		qty: q,
		extra_qty: extra,
		estimate: total,
		estimate_tglish: tg,
		estimate_en: `For about ${q} panels, the estimated total is ${peso$1(total)} (${how_en}). ${NOTE_EN}${PV.en}`,
		estimate_tl: `Para sa humigit-kumulang ${q} panels, ang estimated total po ay ${peso$1(total)} (${how_tl}). ${NOTE_TL}${PV.tl}`
	};
}
// supabase/functions/_shared/logoimg.ts
const LOGO_DATA_URI = "data:image/png;base64,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";
// supabase/functions/_shared/estimatecard.ts
const peso = (n) => "₱" + Math.round(n).toLocaleString("en-US");
const esc = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
/** Break a sentence into lines of at most `max` characters. */
function wrapText(s, max) {
	const out = [];
	let cur = "";
	for (const w of s.split(/\s+/).filter(Boolean)) if ((cur + " " + w).trim().length > max && cur) {
		out.push(cur);
		cur = w;
	} else cur = (cur + " " + w).trim();
	if (cur) out.push(cur);
	return out;
}
/** Lines of the calculation, in plain words, from the estimate figures. */
function cardLines(e) {
	if (!e.ok || e.estimate == null || e.qty == null) return null;
	if (e.kind === "glass" && e.package_price != null && e.included != null && e.extra_rate != null) {
		const extra = e.extra_qty ?? Math.max(0, e.qty - e.included);
		return {
			title: "Glass & window cleaning",
			lines: [
				`${peso(e.package_price)} package includes up to ${e.included} panels.`,
				extra > 0 ? `${extra} extra × ${peso(e.extra_rate)} = ${peso(extra * e.extra_rate)}.` : "No extra panels.",
				`Total entered: ${e.qty} panels.`
			]
		};
	}
	if (e.kind === "area" || e.kind === "solar") {
		const unit = e.unit ?? (e.kind === "solar" ? "panel" : "sqm");
		const rate = e.extra_rate ?? e.package_price;
		return {
			title: e.kind === "solar" ? "Solar panel cleaning" : "Exterior cleaning",
			lines: [`Rate ${rate != null ? peso(rate) : ""} per ${unit}.`, `Quantity: ${e.qty} ${unit}${e.qty === 1 ? "" : "s"}.`]
		};
	}
	return null;
}
function estimateCardSvg(e, o = {}) {
	const c = cardLines(e);
	if (!c || e.estimate == null) return null;
	const where = [e.place, o.property ?? "Residential"].filter(Boolean).join(" · ");
	const note = wrapText("An estimate is not a booking or final quotation. TopMop confirms panel counts, surface condition, access, travel charges and applicable taxes, and the complete total, before work is agreed.", 78);
	const f = "font-family=\"Inter, Segoe UI, Helvetica, Arial, sans-serif\"";
	let y = 470;
	const body = c.lines.flatMap((l) => wrapText(l, 56)).map((l) => {
		y += 42;
		return `<text x="90" y="${y}" ${f} font-size="31" fill="#dff2ea">${esc(l)}</text>`;
	}).join("");
	const afterBody = y + 62;
	return `<svg xmlns="http://www.w3.org/2000/svg" width="1080" height="1080" viewBox="0 0 1080 1080" role="img" aria-label="TopMop estimate">
<rect width="1080" height="1080" fill="#eef3f0"/>
<rect x="40" y="40" width="1000" height="1000" rx="36" fill="#0d2a35"/>
<image href="${LOGO_DATA_URI}" x="72" y="64" width="92" height="92"/>
<text x="184" y="112" ${f} font-size="38" font-weight="800" fill="#fff" letter-spacing="1">TOPMOP</text>
<text x="184" y="140" ${f} font-size="16" fill="#9fd8bd" letter-spacing="1.5">WINDOW CLEANING · EXTERIOR AND PROPERTY CARE</text>
<text x="90" y="240" ${f} font-size="20" font-weight="700" fill="#8fd6b0" letter-spacing="3">YOUR ESTIMATE</text>
<text x="90" y="310" ${f} font-size="58" font-weight="800" fill="#fff">See your calculated total.</text>
<text x="90" y="368" ${f} font-size="28" fill="#bfe3d2">${esc(where)}</text>
<line x1="90" y1="400" x2="990" y2="400" stroke="#2c5160" stroke-width="2"/>
<text x="90" y="456" ${f} font-size="36" font-weight="800" fill="#fff">${esc(c.title)} — ${peso(e.estimate)}</text>
${body}
<line x1="90" y1="${afterBody - 24}" x2="990" y2="${afterBody - 24}" stroke="#2c5160" stroke-width="2"/>
<text x="90" y="${afterBody + 44}" ${f} font-size="28" font-weight="700" fill="#8fd6b0">Estimated total</text>
<text x="90" y="${afterBody + 134}" ${f} font-size="96" font-weight="800" fill="#fff">${peso(e.estimate)}</text>
<rect x="90" y="${afterBody + 168}" width="900" height="64" rx="12" fill="#b9d8a2"/>
<text x="540" y="${afterBody + 210}" text-anchor="middle" ${f} font-size="27" font-weight="800" fill="#0d2a35">The final amount follows the crew's count on site</text>
${note.map((l, i) => `<text x="90" y="${afterBody + 274 + i * 27}" ${f} font-size="19" fill="#b9d6c8">${esc(l)}</text>`).join("")}
<text x="540" y="1012" text-anchor="middle" ${f} font-size="22" font-weight="700" fill="#8fd6b0">www.topmop.ph</text>
</svg>`;
}
// src/lib/cardserver.ts
const one = (v) => (Array.isArray(v) ? v[0] : v) ?? "";
function cardSvgFromQuery(q) {
	const address = one(q.address || q.city).trim().slice(0, 80), service = one(q.service).trim().slice(0, 60), qty = Number(one(q.qty || q.panels)), property = one(q.property).trim().slice(0, 20) || "Residential";
	if (!address) return { error: "address is required" };
	if (!Number.isFinite(qty) || qty < 1 || qty > 5e3) return { error: "qty must be between 1 and 5000" };
	const svg = estimateCardSvg(estimate(address, service || "window cleaning", qty, property), { property: /^commercial/i.test(property) ? "Commercial" : "Residential" });
	return svg ? { svg } : { error: "no card: a person has to price this" };
}
export { cardSvgFromQuery };
