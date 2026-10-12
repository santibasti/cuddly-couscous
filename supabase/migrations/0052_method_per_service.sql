-- materials & methodology per service (printed on quotations); a quotation can carry its own copy per service
alter table public.services add column if not exists materials text, add column if not exists methodology text;
alter table public.quotations add column if not exists method_sections jsonb;

update public.services set materials = $m$Water-fed pole system, deionized (DI) water, soft-bristle brush, no harsh chemicals$m$, methodology = $m$We utilize a Water-Fed Pole System with Deionized Water Technology, ensuring a spot-free, streak-free finish without the need for harsh chemicals. This system allows us to clean windows efficiently and safely from the ground, minimizing the need for scaffolding or ladders.

Process:
Pre-Rinse: Removes loose dirt and debris.
Deep Cleaning: Our water-fed pole with soft bristle brush gently scrubs the glass while deionized water dissolves contaminants.
Final Rinse: Leaves the surface crystal clear, as deionized water naturally dries without residue or streaks.

This method ensures maximum cleanliness, safety, and efficiency while maintaining the integrity of your glass surfaces.

Note: We will use your property's water connection to operate our Water-Fed Pole System. Rest assured, the water consumption is minimal and environmentally friendly.$m$ where code = 'GLASS_EXT' and methodology is null and materials is null;
update public.services set materials = $m$Microfiber cloths, squeegee, neutral glass cleaner, drop sheets$m$, methodology = $m$Interior glass is cleaned by hand, with drop sheets to protect floors and furniture.

Process:
Protect: Drop sheets and floor protection are placed under the work area.
Clean: The glass is washed with a neutral cleaner and a microfiber applicator.
Squeegee & detail: Squeegee finish, then frames and sills are wiped dry.

Note: Furniture within reach of the windows should be moved or covered before we arrive.$m$ where code = 'GLASS_INT' and methodology is null and materials is null;
update public.services set materials = $m$Low-pressure rinse, soft brush, eco-safe roof cleaner, fall-protection harness and anchor lines$m$, methodology = $m$We clean the roof with a low-pressure rinse and a soft brush, using eco-safe roof cleaner only when needed, so the roofing is not damaged. The crew works with certified work-at-height equipment.

Process:
Safety setup: Anchor points, harnesses and barricades are set before work starts.
Dry removal: Loose debris, leaves and dust are cleared first.
Wash: Moss, algae and stains are loosened with a soft brush and low-pressure rinse.
Final rinse: The roof and gutters are rinsed clear.

Note: Roofs that are too steep or fragile may need extra safety measures and are quoted separately.$m$ where code = 'ROOF' and methodology is null and materials is null;
update public.services set materials = $m$Low-pressure washer, soft brush, eco-safe cleaner, water supply from the property$m$, methodology = $m$Walls and floors are cleaned with a low-pressure wash and a soft brush, so paint and surfaces are not damaged.

Process:
Pre-wet: The surface is wetted to loosen dirt.
Scrub: Stains, moss and algae are scrubbed with a soft brush and eco-safe cleaner where needed.
Rinse: The area is rinsed clear and the wash water is directed away.

Note: We will use your property's water connection. Stubborn paint or oil stains may need a separate quotation.$m$ where code = 'WALL' and methodology is null and materials is null;
update public.services set materials = $m$Surface cleaner, low-pressure washer, stiff brush, eco-safe degreaser, wet vacuum if needed$m$, methodology = $m$Hardscape and floors are cleaned with a surface cleaner and low-pressure wash that lifts dirt without damaging the surface.

Process:
Sweep: Loose dirt and debris are cleared.
Wash: The surface is cleaned with a surface cleaner and degreaser where needed.
Rinse: Wash water is rinsed away or collected, leaving the surface clean.

Note: We will use your property's water connection. Drainage for the wash water should be available.$m$ where code = 'FLOOR' and methodology is null and materials is null;
update public.services set materials = $m$Deionized (DI) water, soft-bristle brush, water-fed pole, no detergents or abrasives$m$, methodology = $m$Solar panels are cleaned with deionized water and a soft brush only, with no chemicals and no pressure washer, to protect the panel coating and the warranty.

Process:
Inspect: Panels are checked for cracks and loose parts before cleaning.
Brush: A soft brush with deionized water lifts dust and bird droppings.
Rinse: Final rinse leaves a spot-free surface that dries without residue.

Note: We clean in the early morning or late afternoon, when panels are cool.$m$ where code = 'SOLAR' and methodology is null and materials is null;
update public.services set materials = $m$Soft brush, pH-neutral cleaner, low-pressure rinse, work-at-height equipment$m$, methodology = $m$ACP and cladding panels are cleaned with a pH-neutral cleaner and a soft brush to keep the finish intact.

Process:
Rinse: Loose dirt is rinsed off from the top down.
Clean: Panels are washed with a pH-neutral cleaner and soft brush.
Final rinse: Panels are rinsed clear and left to dry.$m$ where code = 'ACP' and methodology is null and materials is null;
update public.services set materials = $m$Microfiber tools, dry sponge, vacuum, drop sheets$m$, methodology = $m$Ceilings are cleaned dry or damp, depending on the material, with drop sheets protecting everything below.

Process:
Protect: Floors and furniture are covered.
Dust: Dust and cobwebs are removed with microfiber tools and a vacuum.
Spot clean: Marks are removed with a damp cloth where the material allows.$m$ where code = 'CEILING' and methodology is null and materials is null;
update public.services set materials = $m$Gloves, scoops, hose, work-at-height equipment$m$, methodology = $m$Gutters are cleared by hand and flushed with water so rainwater flows freely.

Process:
Clear: Leaves and debris are removed by hand.
Flush: Gutters and downpipes are flushed to check the flow.
Check: Joints and outlets are checked for blockages and leaks.$m$ where code = 'GUTTER' and methodology is null and materials is null;

-- the client link needs the per-service sections
create or replace function public.get_quotation_public(p_token text) returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'quotation', jsonb_build_object('number', q.number, 'status', q.status, 'issue_date', q.issue_date, 'valid_until', q.valid_until, 'scope', q.scope, 'items', q.items,
      'vat_mode', q.vat_mode, 'vat_rate', q.vat_rate, 'discount', q.discount, 'terms', q.terms, 'payment_option', q.payment_option, 'method_sections', q.method_sections, 'ocular_done', coalesce(q.ocular_done, q.ocular_visit_id is not null), 'crew_size', q.crew_size, 'safety_officer', q.safety_officer,
      'work_days', q.work_days, 'disclaimer', q.disclaimer, 'intro', q.intro, 'methodology', q.methodology, 'sent_at', q.sent_at, 'decided_at', q.decided_at,
      'client_sig', q.client_sig, 'client_sig_name', q.client_sig_name, 'client_sig_at', q.client_sig_at),
    'client', jsonb_build_object('name', c.name, 'contact_person', c.contact_person, 'address', coalesce(nullif(c.address, ''), c.billing_address)),
    'site', case when s.id is null then null else jsonb_build_object('name', s.name, 'address', s.address) end,
    'company', (select data -> 'company' from public.settings where id = 'main'),
    'defaults', (select jsonb_build_object('intro', data ->> 'default_intro', 'methodology', data ->> 'default_methodology', 'disclaimer', data ->> 'default_disclaimer', 'crew', data ->> 'default_crew_size') from public.settings where id = 'main'))
  from public.quotations q join public.clients c on c.id = q.client_id left join public.sites s on s.id = q.site_id
  where q.share_token = p_token and q.status in ('Sent', 'Approved') and q.deleted_at is null $$;
