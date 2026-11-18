/** Paragraphs are separated by a blank line. A "Process:" block lists steps as "Name: what happens"; a "Note:" paragraph is shown as a callout. */
const DEFAULT_METHODOLOGY = `We utilize a Water-Fed Pole System with Deionized Water Technology, ensuring a spot-free, streak-free finish without the need for harsh chemicals. This system allows us to clean windows efficiently and safely from the ground, minimizing the need for scaffolding or ladders.

Process:
Pre-Rinse: Removes loose dirt and debris.
Deep Cleaning: Our water-fed pole with soft bristle brush gently scrubs the glass while deionized water dissolves contaminants.
Final Rinse: Leaves the surface crystal clear, as deionized water naturally dries without residue or streaks.

This method ensures maximum cleanliness, safety, and efficiency while maintaining the integrity of your glass surfaces.

Note: We will use your property's water connection to operate our Water-Fed Pole System. Rest assured, the water consumption is minimal and environmentally friendly.`;
const defaultIntro = (s) => s?.default_intro?.trim() || "We are pleased to present our Professional Cleaning Services, utilizing the Advanced Infinity Series System to deliver streak-free and spotless results for glass, ceilings, solar panels, roofs, ACP and walls. Our expertise, eco-friendly methods and attention to detail ensure your property achieves a polished, refreshed appearance.";
const defaultMethodology = (s) => s?.default_methodology?.trim() || "We utilize a Water-Fed Pole System with Deionized Water Technology, ensuring a spot-free, streak-free finish without the need for harsh chemicals. This system allows us to clean windows efficiently and safely from the ground, minimizing the need for scaffolding or ladders.\n\nProcess:\nPre-Rinse: Removes loose dirt and debris.\nDeep Cleaning: Our water-fed pole with soft bristle brush gently scrubs the glass while deionized water dissolves contaminants.\nFinal Rinse: Leaves the surface crystal clear, as deionized water naturally dries without residue or streaks.\n\nThis method ensures maximum cleanliness, safety, and efficiency while maintaining the integrity of your glass surfaces.\n\nNote: We will use your property's water connection to operate our Water-Fed Pole System. Rest assured, the water consumption is minimal and environmentally friendly.";
const defaultCrew = (s) => s?.default_crew_size?.trim() || "6-7";
const defaultDisclaimer = (s) => s?.default_disclaimer?.trim() || "Our cleaning process is designed to effectively remove loose dirt, dust, and general surface contaminants using professional equipment and specialized cleaning techniques. However, certain conditions such as hard water stains, mineral deposits, paint residue, adhesive residue, silicone residue, and other permanent or chemically bonded contaminants may not be fully removable through standard cleaning procedures.\n\nWhile our team will apply the appropriate cleaning methods and make every reasonable effort to improve the appearance of the surface, complete removal of these types of stains cannot be guaranteed, as the final outcome will depend on the actual surface condition, material composition, and duration of stain exposure.\n\nIn some cases, these marks may already be etched, embedded, or permanently bonded to the surface, and their true condition will only become fully visible after the cleaning process has been completed.";
/** How the client pays: on completion of the job, or net N days after the invoice date. Chosen on each quotation. */
/** Ocular done: the exact price is agreed, so the quotation shows amounts. Not done: only the agreed rates are shown (the final amount depends on the count on site). */
const quoteShowsAmounts = (q) => q.ocular_done ?? !!q.ocular_visit_id;
/** days allowed to pay after the invoice date (0 = payable upon completion) */
const paymentDays = (opt) => !opt ? void 0 : opt === "completion" ? 0 : Number(opt.replace("net_", "")) || void 0;
const paymentSentence = (opt) => {
	const d = paymentDays(opt);
	if (d === void 0) return void 0;
	return d === 0 ? "Payment is due upon completion of the job." : `Payment is due within ${d} days (net ${d}) from the invoice date.`;
};
/** Starting text for each service; Admin can edit it (Admin → Service pricing) and Sales can edit it again for a single quotation. */
const SERVICE_METHOD_DEFAULTS = {
	GLASS_EXT: {
		materials: "Water-fed pole system, deionized (DI) water, soft-bristle brush, no harsh chemicals",
		methodology: DEFAULT_METHODOLOGY
	},
	GLASS_INT: {
		materials: "Microfiber cloths, squeegee, neutral glass cleaner, drop sheets",
		methodology: `Interior glass is cleaned by hand, with drop sheets to protect floors and furniture.\n\nProcess:\nProtect: Drop sheets and floor protection are placed under the work area.\nClean: The glass is washed with a neutral cleaner and a microfiber applicator.\nSqueegee & detail: Squeegee finish, then frames and sills are wiped dry.\n\nNote: Furniture within reach of the windows should be moved or covered before we arrive.`
	},
	ROOF: {
		materials: "Low-pressure rinse, soft brush, eco-safe roof cleaner, fall-protection harness and anchor lines",
		methodology: `We clean the roof with a low-pressure rinse and a soft brush, using eco-safe roof cleaner only when needed, so the roofing is not damaged. The crew works with certified work-at-height equipment.\n\nProcess:\nSafety setup: Anchor points, harnesses and barricades are set before work starts.\nDry removal: Loose debris, leaves and dust are cleared first.\nWash: Moss, algae and stains are loosened with a soft brush and low-pressure rinse.\nFinal rinse: The roof and gutters are rinsed clear.\n\nNote: Roofs that are too steep or fragile may need extra safety measures and are quoted separately.`
	},
	WALL: {
		materials: "Low-pressure washer, soft brush, eco-safe cleaner, water supply from the property",
		methodology: `Walls and floors are cleaned with a low-pressure wash and a soft brush, so paint and surfaces are not damaged.\n\nProcess:\nPre-wet: The surface is wetted to loosen dirt.\nScrub: Stains, moss and algae are scrubbed with a soft brush and eco-safe cleaner where needed.\nRinse: The area is rinsed clear and the wash water is directed away.\n\nNote: We will use your property's water connection. Stubborn paint or oil stains may need a separate quotation.`
	},
	FLOOR: {
		materials: "Surface cleaner, low-pressure washer, stiff brush, eco-safe degreaser, wet vacuum if needed",
		methodology: `Hardscape and floors are cleaned with a surface cleaner and low-pressure wash that lifts dirt without damaging the surface.\n\nProcess:\nSweep: Loose dirt and debris are cleared.\nWash: The surface is cleaned with a surface cleaner and degreaser where needed.\nRinse: Wash water is rinsed away or collected, leaving the surface clean.\n\nNote: We will use your property's water connection. Drainage for the wash water should be available.`
	},
	SOLAR: {
		materials: "Deionized (DI) water, soft-bristle brush, water-fed pole, no detergents or abrasives",
		methodology: `Solar panels are cleaned with deionized water and a soft brush only, with no chemicals and no pressure washer, to protect the panel coating and the warranty.\n\nProcess:\nInspect: Panels are checked for cracks and loose parts before cleaning.\nBrush: A soft brush with deionized water lifts dust and bird droppings.\nRinse: Final rinse leaves a spot-free surface that dries without residue.\n\nNote: We clean in the early morning or late afternoon, when panels are cool.`
	},
	ACP: {
		materials: "Soft brush, pH-neutral cleaner, low-pressure rinse, work-at-height equipment",
		methodology: `ACP and cladding panels are cleaned with a pH-neutral cleaner and a soft brush to keep the finish intact.\n\nProcess:\nRinse: Loose dirt is rinsed off from the top down.\nClean: Panels are washed with a pH-neutral cleaner and soft brush.\nFinal rinse: Panels are rinsed clear and left to dry.`
	},
	CEILING: {
		materials: "Microfiber tools, dry sponge, vacuum, drop sheets",
		methodology: `Ceilings are cleaned dry or damp, depending on the material, with drop sheets protecting everything below.\n\nProcess:\nProtect: Floors and furniture are covered.\nDust: Dust and cobwebs are removed with microfiber tools and a vacuum.\nSpot clean: Marks are removed with a damp cloth where the material allows.`
	},
	GUTTER: {
		materials: "Gloves, scoops, hose, work-at-height equipment",
		methodology: `Gutters are cleared by hand and flushed with water so rainwater flows freely.\n\nProcess:\nClear: Leaves and debris are removed by hand.\nFlush: Gutters and downpipes are flushed to check the flow.\nCheck: Joints and outlets are checked for blockages and leaks.`
	}
};
/** One section per distinct service on the quotation (in order), keeping what was already edited for a service that is still on it. */
function syncMethodSections(services, itemCodes, existing = []) {
	const out = [];
	for (const code of itemCodes) {
		if (code === "OTHER" || out.some((s) => s.code === code)) continue;
		const kept = existing.find((s) => s.code === code);
		if (kept) {
			out.push(kept);
			continue;
		}
		const sv = services.find((x) => x.code === code);
		const d = SERVICE_METHOD_DEFAULTS[code];
		const methodology = (sv?.methodology ?? d?.methodology ?? "").trim();
		if (!methodology && !(sv?.materials ?? d?.materials)) continue;
		out.push({
			code,
			name: sv?.name ?? code,
			materials: (sv?.materials ?? d?.materials ?? "").trim() || void 0,
			methodology
		});
	}
	return out;
}
new Intl.DateTimeFormat("en-CA", {
	timeZone: "Asia/Manila",
	year: "numeric",
	month: "2-digit",
	day: "2-digit",
	hour: "2-digit",
	minute: "2-digit",
	hourCycle: "h23"
});
new Intl.NumberFormat("en-PH", {
	style: "currency",
	currency: "PHP",
	minimumFractionDigits: 2,
	maximumFractionDigits: 2
});
new Intl.NumberFormat("en-PH", {
	style: "currency",
	currency: "PHP",
	minimumFractionDigits: 0,
	maximumFractionDigits: 0
});
const round2 = (n) => Math.round((n + Number.EPSILON) * 100) / 100;
new Intl.DateTimeFormat("en-PH", {
	timeZone: "UTC",
	month: "short",
	day: "numeric",
	year: "numeric"
});
const sum = (a, f) => a.reduce((s, x) => s + f(x), 0);
// src/lib/business.ts
/** Crew on the road or on site, work not yet complete. */
const FIELD_JOB = [
	"Dispatched",
	"On Site",
	"In Progress"
];
[...FIELD_JOB];
[...FIELD_JOB];
[...FIELD_JOB];
/** Apply TopMop's default pricing rules for one service and quantity. Returns quotation line(s). */
function priceService(s, qty, pkg) {
	if (s.custom_quote) return {
		lines: [{
			service_code: s.code,
			description: s.name,
			qty,
			unit: s.unit,
			rate: s.rate,
			discount: 0
		}],
		billableQty: qty,
		note: "Custom-quoted service – set the rate manually."
	};
	const p = pkg ?? (s.package_price && s.package_qty ? {
		price: s.package_price,
		qty: s.package_qty,
		excess_rate: s.excess_rate ?? s.rate
	} : void 0);
	if (p) {
		const lines = [{
			service_code: s.code,
			description: `${s.name} – Starter Package (up to ${p.qty} panels)`,
			qty: 1,
			unit: "package",
			rate: p.price,
			discount: 0,
			package_qty: p.qty
		}];
		const excess = Math.max(0, qty - p.qty);
		if (excess > 0) lines.push({
			service_code: s.code,
			description: `Excess panels beyond ${p.qty}`,
			qty: excess,
			unit: "panel",
			rate: p.excess_rate,
			discount: 0
		});
		return {
			lines,
			billableQty: qty,
			note: `${qty} panels: package + ${excess} excess.`
		};
	}
	const billable = Math.max(qty, s.minimum_qty);
	return {
		lines: [{
			service_code: s.code,
			description: s.name,
			qty: billable,
			unit: s.unit,
			rate: s.rate,
			discount: 0
		}],
		billableQty: billable,
		note: qty < s.minimum_qty ? `Minimum of ${s.minimum_qty} ${s.unit} applied.` : ""
	};
}
function docTotals(items, discount, mode, vatRate) {
	const billed = items.filter((i) => !i.measure);
	const gross = sum(billed, (i) => i.qty * i.rate);
	const lineDiscount = sum(billed, (i) => i.discount || 0);
	const after = Math.max(0, gross - lineDiscount - (discount || 0));
	const r = vatRate / 100;
	let net = after, vat = 0, total = after;
	if (mode === "exclusive") {
		vat = after * r;
		total = after + vat;
	} else if (mode === "inclusive") {
		net = after / (1 + r);
		vat = after - net;
	}
	return {
		gross: round2(gross),
		lineDiscount: round2(lineDiscount),
		discount: round2((discount || 0) + lineDiscount),
		net: round2(net),
		vat: round2(vat),
		total: round2(total)
	};
}
const invoiceTotals = (i) => {
	const t = docTotals(i.items, i.discount, i.vat_mode, i.vat_rate);
	const wht = round2(t.net * (i.withholding_rate / 100));
	return {
		...t,
		wht,
		collectible: round2(t.total - wht)
	};
};
const payStatus = (p) => p.status ?? "Verified";
/** A payment counts towards the invoice, statement, aging, revenue and profitability only when it is Verified — and, for a cheque, Cleared. */
const paymentCounts = (p) => !p.deleted_at && !p.reversed && payStatus(p) === "Verified" && (p.method !== "Cheque" || (p.cheque_status ?? "Cleared") === "Cleared");
/** Recorded but not yet counted: awaiting verification, or a verified cheque that has not cleared. */
const paymentPending = (p) => !p.deleted_at && !p.reversed && (payStatus(p) === "Pending Verification" || payStatus(p) === "Verified" && p.method === "Cheque" && !paymentCounts(p) && p.cheque_status !== "Bounced");
function invoiceSettled(db, inv) {
	const pays = db.payments.filter((p) => p.invoice_id === inv.id && paymentCounts(p));
	const cash = sum(pays, (p) => p.amount);
	const wht = sum(pays, (p) => p.wht_amount);
	return {
		cash,
		wht,
		settled: round2(cash + wht)
	};
}
/** Final bill − verified payments = outstanding balance; plus what is still waiting to be verified / cleared. */
function invoiceLedger(db, inv) {
	const total = invoiceTotals(inv).total;
	const received = invoiceSettled(db, inv).settled;
	const waiting = sum(db.payments.filter((p) => p.invoice_id === inv.id && paymentPending(p)), (p) => p.amount + p.wht_amount);
	return {
		total,
		received,
		balance: round2(total - received),
		waiting: round2(waiting),
		available: round2(total - received - waiting)
	};
}
const variationTotals = (v) => {
	const t = docTotals(v.items, v.discount, v.vat_mode, v.vat_rate);
	return v.kind === "reduction" ? {
		gross: -t.gross,
		lineDiscount: -t.lineDiscount,
		discount: -t.discount,
		net: -t.net,
		vat: -t.vat,
		total: -t.total
	} : t;
};
/** Original quotation + approved variations − management-approved discount = final contract value (the original quotation is never modified). */
function finalContract(d, job) {
	const q = d.quotations.find((x) => x.id === job.quotation_id);
	const orig = q ? docTotals(q.items, q.discount, q.vat_mode, q.vat_rate) : void 0;
	const approved = d.variations.filter((v) => v.job_id === job.id && v.status === "Approved" && !v.deleted_at).map(variationTotals);
	const varTotal = sum(approved, (t) => t.total), varNet = sum(approved, (t) => t.net);
	const originalNet = orig?.net ?? round2(job.contract_amount - varNet), originalTotal = orig?.total ?? originalNet;
	const dr = d.discount_requests ? appliedDiscount({ discount_requests: d.discount_requests }, job.id) : void 0;
	const discount = dr?.approved_amount ?? 0, discountNet = dr?.net_amount ?? 0;
	return {
		originalTotal: round2(originalTotal),
		originalNet: round2(originalNet),
		variationsTotal: round2(varTotal),
		variationsNet: round2(varNet),
		finalTotal: round2(originalTotal + varTotal),
		finalNet: round2(originalNet + varNet),
		discount,
		discountNet,
		payableTotal: round2(originalTotal + varTotal - discount),
		payableNet: round2(originalNet + varNet - discountNet)
	};
}
/** Original quote + additional work → final bill. `pending` previews additions that the client has not approved yet. */
/** After an ocular visit the price was agreed earlier, so the on-site screens and the signed Final Quote do not repeat the original amounts, unless the booking's Job Order is set to show the quotation amounts. */
const hideAgreedAmounts = (q, job) => !!q && quoteShowsAmounts(q) && job.jo_prices !== "show";
function finalQuoteSummary(d, job, o = {}) {
	const q = d.quotations.find((x) => x.id === job.quotation_id);
	const orig = q ? docTotals(q.items, q.discount, q.vat_mode, q.vat_rate) : void 0;
	const fc = finalContract(d, job);
	const approved = d.variations.filter((v) => v.job_id === job.id && v.status === "Approved" && !v.deleted_at).map(variationTotals);
	const pend = o.pending?.items.length ? docTotals(o.pending.items, 0, o.pending.vat_mode, o.pending.vat_rate) : void 0;
	const parts = pend ? [...approved, pend] : approved;
	const additionalTotal = round2(sum(parts, (t) => t.total)), additionalNet = round2(sum(parts, (t) => t.net)), additionalDiscount = round2(sum(parts, (t) => t.discount)), additionalVat = round2(sum(parts, (t) => t.vat));
	const originalTotal = orig?.total ?? fc.originalTotal;
	const subtotal = round2(originalTotal + additionalTotal);
	const request = d.discount_requests ? appliedDiscount({ discount_requests: d.discount_requests }, job.id) : void 0;
	const granted = request?.approved_amount ?? 0;
	const finalTotal = round2(subtotal - granted);
	const deposit = round2(Math.max(0, o.deposit ?? 0));
	return {
		originalTotal,
		originalNet: orig?.net ?? fc.originalNet,
		originalDiscount: orig?.discount ?? 0,
		originalVat: orig?.vat ?? 0,
		additionalTotal,
		additionalNet,
		additionalDiscount,
		additionalVat,
		discount: round2((orig?.discount ?? 0) + additionalDiscount),
		vat: round2((orig?.vat ?? 0) + additionalVat - (granted ? vatPortion(granted, q?.vat_mode ?? "none", q?.vat_rate ?? 0) : 0)),
		hideOriginal: hideAgreedAmounts(q, job),
		subtotal,
		granted,
		request,
		finalTotal,
		deposit,
		balance: round2(Math.max(0, finalTotal - deposit))
	};
}
/** VAT contained in a VAT-inclusive amount. */
const vatPortion = (amount, mode, rate) => mode === "none" ? 0 : round2(amount * rate / (100 + rate));
const jobRequests = (d, jobId) => d.discount_requests.filter((r) => r.job_id === jobId && !r.deleted_at).sort((a, b) => a.submitted_at.localeCompare(b.submitted_at));
const appliedDiscount = (d, jobId) => [...jobRequests(d, jobId)].reverse().find((r) => r.status === "Applied");
// src/lib/joborder-core.ts
const hhmm = (s) => s.slice(11, 16);
const addMin = (hm, m) => {
	const t = +hm.slice(0, 2) * 60 + +hm.slice(3, 5) + m;
	return `${String(Math.floor(t / 60) % 24).padStart(2, "0")}:${String(t % 60).padStart(2, "0")}`;
};
const line = (i) => ({
	description: i.description,
	qty: i.qty,
	unit: i.unit,
	rate: i.rate,
	amount: round2(i.qty * i.rate - (i.discount || 0))
});
/** Client-facing content for a job, pulled only from its approved quotation, approved variations and the booking. */
function buildContent(db, job) {
	const s = db.settings;
	const c = db.clients.find((x) => x.id === job.client_id);
	const site = db.sites.find((x) => x.id === job.site_id);
	const q = db.quotations.find((x) => x.id === job.quotation_id && !x.deleted_at);
	const approvedQ = q && q.status === "Approved" ? q : void 0;
	const vars = db.variations.filter((v) => v.job_id === job.id && v.status === "Approved" && !v.deleted_at);
	const names = (ids) => ids.map((id) => db.employees.find((e) => e.id === id)?.full_name).filter(Boolean);
	const leader = job.leader_id ? db.employees.find((e) => e.id === job.leader_id)?.full_name : void 0;
	const crew = names(job.crew_ids).filter((n) => n !== leader);
	const start = hhmm(job.start_at);
	const hours = Math.max(.5, Math.round((Date.parse(job.end_at + ":00Z") - Date.parse(job.start_at + ":00Z")) / 36e5 * 2) / 2);
	const sum = approvedQ ? finalQuoteSummary(db, job) : void 0;
	const dr = appliedDiscount(db, job.id);
	const qt = approvedQ ? docTotals(approvedQ.items, approvedQ.discount, approvedQ.vat_mode, approvedQ.vat_rate) : void 0;
	const discounts = [
		...qt && qt.discount > 0 ? [{
			label: "Quotation discount",
			amount: qt.discount
		}] : [],
		...vars.filter((v) => variationTotals(v).discount > 0).map((v) => ({
			label: `Discount on additional work ${v.number}`,
			amount: variationTotals(v).discount
		})),
		...dr && (dr.approved_amount ?? 0) > 0 ? [{
			label: "Approved discount",
			amount: dr.approved_amount
		}] : []
	];
	const total = sum?.finalTotal ?? 0;
	const vat = sum?.vat ?? 0;
	const inv = db.invoices.find((i) => i.job_id === job.id && i.status === "Approved" && !i.deleted_at);
	let payment_status = "No payment is due yet — the invoice is issued after the service is completed.";
	if (inv) {
		const lg = invoiceLedger(db, inv);
		payment_status = lg.balance <= .005 ? "Paid" : lg.received > 0 ? "Partially paid" : "Unpaid";
	}
	const terms = [paymentSentence(approvedQ?.payment_option) ?? `Payment is due within ${s.payment_terms_days} days of the invoice date.`, approvedQ?.terms?.trim()].filter(Boolean).join(" ");
	const vatMode = approvedQ?.vat_mode ?? "none";
	const vatRate = approvedQ?.vat_rate ?? 0;
	return {
		company: {
			name: s.company?.name ?? "",
			tagline: s.company?.tagline ?? "",
			address: s.company?.address ?? "",
			phone: s.company?.phone ?? "",
			email: s.company?.email ?? "",
			tin: s.company?.tin ?? ""
		},
		client: {
			name: c?.name ?? "",
			contact_person: site?.contact_person || c?.contact_person || "",
			email: c?.email || void 0
		},
		client_address: (c?.address || c?.billing_address || "").trim() || void 0,
		...c?.vip ? { vip: c.vip_note?.trim() || "VIP client" } : {},
		...vehicleOf(db, job) ? { vehicle: vehicleOf(db, job) } : {},
		disclaimer: approvedQ?.disclaimer?.trim() || defaultDisclaimer(s) || void 0,
		location: {
			name: site?.name ?? "",
			address: site?.address ?? "",
			contact_person: site?.contact_person || c?.contact_person || "",
			contact_mobile: site?.contact_mobile || c?.mobile || ""
		},
		booking_date: job.booking_date ?? job.created_at.slice(0, 10),
		service_date: job.start_at.slice(0, 10),
		arrival_from: start,
		arrival_to: addMin(start, 30),
		duration_hours: hours,
		service_types: job.service_codes.map((code) => db.services.find((x) => x.code === code)?.name ?? code),
		scope: (approvedQ?.scope || job.scope || "").trim(),
		items: approvedQ ? approvedQ.items.map(line) : [],
		additions: vars.map((v) => ({
			number: v.number,
			reason: v.reason,
			items: v.items.map(line),
			total: variationTotals(v).total
		})),
		discounts: discounts.map((d) => ({
			...d,
			amount: round2(d.amount)
		})),
		subtotal: round2(total - vat),
		vat_label: vatMode === "none" ? "VAT" : `VAT (${vatRate}%${vatMode === "inclusive" ? ", included" : ""})`,
		vat: round2(vat),
		total: round2(total),
		payment_terms: terms,
		payment_status,
		team: {
			leader,
			crew
		},
		access_notes: [site?.access_instructions, c?.access_instructions].map((x) => (x ?? "").trim()).filter((x, i, a) => x && a.indexOf(x) === i),
		price_mode: jobOrderPriceMode(job.jo_prices, !!(approvedQ?.ocular_done ?? !!approvedQ?.ocular_visit_id)),
		...job.jo_prices ? { price_choice: job.jo_prices } : {},
		blocker: approvedQ ? void 0 : "No approved quotation is linked to this booking. Link the approved quotation before sending."
	};
}
/** The vehicle assigned to a booking as the Job Order shows it (undefined when none is assigned). */
function vehicleOf(db, job) {
	const a = job.vehicle_id ? db.assets.find((x) => x.id === job.vehicle_id && !x.deleted_at) : void 0;
	return a ? {
		name: a.name,
		...a.code ? { code: a.code } : {}
	} : void 0;
}
/** What a client would notice changing: when, where, what, how much, who. (Payment status moves on its own and is not part of this.) */
function contentKey(c) {
	const core = JSON.stringify([
		c.service_date,
		c.arrival_from,
		c.arrival_to,
		c.duration_hours,
		c.location,
		c.client,
		c.service_types,
		c.scope,
		c.items,
		c.additions,
		c.discounts,
		c.subtotal,
		c.vat,
		c.total,
		c.payment_terms,
		c.team,
		c.access_notes,
		!!c.blocker
	]) + (c.price_choice ? `|${c.price_choice}:${c.price_mode ?? "rates"}` : "");
	let h = 5381;
	for (let i = 0; i < core.length; i++) h = (h << 5) + h + core.charCodeAt(i) | 0;
	return (h >>> 0).toString(36) + ":" + core.length;
}
/** What the client's Job Order shows for prices. Automatic: nothing after an ocular visit (the exact price is already agreed), the approved rates otherwise. 'show': the quotation's amounts when the price is exact (ocular done), else the rates (the final amount depends on the count on site). 'hide': no prices. */
function jobOrderPriceMode(choice, ocularDone) {
	if (choice === "hide") return "none";
	if (choice === "show") return ocularDone ? "amounts" : "rates";
	return ocularDone ? "none" : "rates";
}
export { buildContent, contentKey, defaultCrew, defaultDisclaimer, defaultIntro, defaultMethodology, docTotals, priceService, syncMethodSections };
