// All page copy lives here so wording can be reviewed in one place.

export const nav = [
  ['Home', 'index.html'],
  ['Solutions', 'solutions.html'],
  ['Industries', 'industries.html'],
  ['Our Work', 'work.html'],
  ['About', 'about.html'],
  ['Contact', 'contact.html'],
];

export const problems = [
  {
    problem: 'Attendance and job records are scattered across different files.',
    capability: 'Attendance tied to the job and crew',
    detail: 'Time-in, time-out and crew assignment are recorded against the job, so there is one record to check instead of several.',
    icon: 'clock',
  },
  {
    problem: 'Equipment is issued without a clear return record.',
    capability: 'Equipment issue and return log',
    detail: 'Every item shows who has it, since when, and whether it came back, with overdue returns flagged.',
    icon: 'box',
  },
  {
    problem: 'Orders or additional work go missing from the bill.',
    capability: 'Approved scope changes flow to billing',
    detail: 'Extra work is recorded and approved against the quotation, then carried into the bill.',
    icon: 'quote',
  },
  {
    problem: 'Payments and outstanding balances are hard to track.',
    capability: 'Payments recorded against each bill',
    detail: 'See what was billed, what was paid and what is still owed, by client and by job.',
    icon: 'wallet',
  },
  {
    problem: 'Owners must ask several people for a daily update.',
    capability: 'One management dashboard',
    detail: 'Jobs, attendance, equipment, sales and items needing attention in a single daily view.',
    icon: 'dashboard',
  },
];

export const solutions = [
  { icon: 'clock', title: 'Attendance and payroll preparation', short: 'Verified attendance, with payroll figures prepared from approved rules.', points: ["Time-in and time-out recorded per job and crew", "Supervisor verification before figures are used", "Payroll figures prepared from approved rules"], text: 'Capture attendance, review and verify it, then prepare payroll figures from verified attendance and the pay rules your business has approved. Final payroll and statutory obligations stay with your business and its advisers.' },
  { icon: 'box', title: 'Inventory and equipment tracking', short: 'Know what is in stock, who has which equipment and what came back.', points: ["Stock levels for supplies and consumables", "Equipment issued to a named person or crew", "Return records with overdue items flagged"], text: 'Track supplies and equipment: what is in stock, what has been issued, to whom, and what has been returned.' },
  { icon: 'calendar', title: 'Bookings, jobs and crew assignments', short: 'Schedule jobs and bookings and assign crews with clear status.', points: ["Job and booking schedule by day", "Crew assignment for each job", "Status from request to completion"], text: 'Schedule jobs or bookings, assign crews and keep status visible from request to completion.' },
  { icon: 'quote', title: 'Quotations and approved scope changes', short: 'Quotations and approved scope changes carried into the bill.', points: ["Quotations prepared from your service list", "Additional work recorded and approved", "Approved changes carried into the bill"], text: 'Prepare quotations, then record approved changes to scope so additional work is traceable to the bill.' },
  { icon: 'report', title: 'Service reports and client sign-off', short: 'Service reports and client sign-off from a phone or tablet.', points: ["Checklist completed on a phone or tablet", "Notes kept together with the job", "Client acknowledgement recorded"], text: 'Complete service reports on a phone or tablet and capture the client’s acknowledgement for your records.' },
  { icon: 'wallet', title: 'Sales, expenses, billing and collections', short: 'Record sales and expenses, bill clients and follow up balances.', points: ["Sales and expenses recorded daily", "Payments logged against each bill", "Outstanding balances by client"], text: 'Record sales and expenses, issue bills, log payments and follow up outstanding balances.' },
  { icon: 'dashboard', title: 'Management dashboards and reports', short: 'One daily view of jobs, people, equipment and money.', points: ["Daily view of jobs, crews and equipment", "Sales, payments and balances in one place", "Items needing attention highlighted"], text: 'Daily and periodic views built from the records your team already enters, so reports need no re-typing.' },
];

export const industries = [
  {
    icon: 'wrench',
    id: 'service-contractors', preview: 'topmop', intro: 'Crew deployment, equipment, quotations, reports and collections for contractors who send teams to client sites.',
    title: 'Service contractors',
    sub: 'Cleaning, maintenance and similar crews',
    items: ['Crew deployment and attendance by site', 'Equipment issued to crews and returned', 'Quotations and approved scope changes', 'Service reports with client sign-off', 'Billing and collections follow-up'],
  },
  {
    icon: 'flag',
    id: 'driving-ranges', preview: 'range', intro: 'Bay availability, player tabs, buckets, food and beverage orders, checkout and reports for recreation facilities.',
    title: 'Driving ranges',
    sub: 'Recreation facilities and cafés',
    items: ['Bay availability', 'Player tabs and bucket tracking', 'Food and beverage orders', 'Checkout and payment recording', 'Daily and shift reports'],
  },
  {
    icon: 'drop',
    id: 'car-washes', preview: 'carwash', intro: 'Job queue, service records, supplies and sales for bay-based service businesses.',
    title: 'Car washes',
    sub: 'Service bays and detailing',
    items: ['Job queue by bay and status', 'Service records per vehicle', 'Supplies used and stock levels', 'Sales and daily totals'],
  },
];

// `group`: 'project' = our own project; 'concept' = prototype built with sample data (never presented as a client deployment).
// To add a real client project later (with the client's written approval), add an entry with group: 'project'
// and a status such as 'Live deployment', then add a matching pill class in styles.css if needed.
export const projects = [
  {
    kind: 'topmop', group: 'project',
    name: 'TopMop service operations',
    status: 'Internal system in development',
    text: 'An operations system for a service business: attendance, crews, equipment, jobs, quotations and collections in one place. It is being developed as an internal system and is not presented as a client deployment.',
    tags: ['Attendance', 'Equipment', 'Jobs', 'Collections'],
  },
  {
    kind: 'range', group: 'project',
    name: 'Driving range and café operations',
    status: 'Working demo',
    text: 'A working demonstration covering bay availability, player tabs, buckets, food and beverage orders and checkout. It shows how the approach adapts to a recreation facility; it is a demo, not a proven external client deployment.',
    tags: ['Bays', 'Player tabs', 'Café orders', 'Checkout'],
  },
  {
    kind: 'carwash', group: 'concept',
    name: 'Car wash operations',
    status: 'Concept prototype',
    text: 'How a job queue by bay, per-vehicle service records, supplies used and daily sales could fit together for a car wash. Built with sample data.',
    tags: ['Job queue', 'Service records', 'Supplies', 'Sales'],
  },
  {
    kind: 'maintenance', group: 'concept',
    name: 'Maintenance visits and sign-off',
    status: 'Concept prototype',
    text: 'Scheduled service visits, a completion checklist on a phone or tablet, client acknowledgement and billing for a maintenance contractor. Built with sample data.',
    tags: ['Scheduled visits', 'Service reports', 'Client sign-off', 'Billing'],
  },
  {
    kind: 'booking', group: 'concept',
    name: 'Appointment-based business',
    status: 'Concept prototype',
    text: 'Staff schedules, bookings, payments recorded per customer and a daily summary for a small appointment-based business. Built with sample data.',
    tags: ['Bookings', 'Staff schedule', 'Payments', 'Daily summary'],
  },
];

export const steps = [
  { icon: 'search', title: 'Understand', text: 'We walk through how work actually happens: who does what, which notebooks and spreadsheets are used, and where records go missing.' },
  { icon: 'target', title: 'Define', text: 'We agree the scope in writing: modules, roles, rules, reports and what is out of scope, so expectations match from day one.' },
  { icon: 'layers', title: 'Build & Pilot', text: 'We build the first modules and test them with realistic scenarios and your own sample records, adjusting before wider use.' },
  { icon: 'rocket', title: 'Launch & Support', text: 'Staff are trained on the screens they will use. After launch, support is provided as defined in your agreement.' },
];

export const principles = [
  { icon: 'users', title: 'Built for the people using it', text: 'Screens are designed for staff on phones, tablets and desks, not just for managers.' },
  { icon: 'layers', title: 'Fitted to your workflow', text: 'We start from how your business runs and configure the system to match, rather than the other way round.' },
  { icon: 'shield', title: 'Clear terms', text: 'Scope, data ownership, export arrangements and support are written down before work begins.' },
];

export const engagement = [
  { title: 'One-time implementation fee', text: 'Covers agreed setup, configuration and staff training for the modules in scope.' },
  { title: 'Monthly package', text: 'Covers hosting, maintenance, backups and defined support, as set out in the agreement.' },
  { title: 'Additional modules and major changes', text: 'Quoted separately, so you only pay for what is added.' },
];

export const faqs = [
  { q: 'Can we start with one module?', a: 'Yes. You can begin with the area that hurts most, such as attendance, equipment or billing, and add modules later. Additional modules are quoted separately.' },
  { q: 'Can staff use phones and tablets?', a: 'The system is designed to be used in a web browser on phones, tablets and computers. It needs an internet connection; offline operation is not currently offered as a standard feature.' },
  { q: 'How does customization work?', a: 'We map your workflow first, then agree which screens, fields, roles and rules to configure. Changes within the agreed scope are part of the build; major changes after launch are quoted separately.' },
  { q: 'What is included in monthly support?', a: 'Hosting, maintenance, backups and defined support. The exact response arrangements and what counts as a major change are set out in your agreement.' },
  { q: 'Can existing records be imported?', a: 'Often, yes, for example staff lists, item lists or client lists kept in spreadsheets. What can be imported depends on the condition of the records, and is confirmed during scoping.' },
  { q: 'What happens to our data if we cancel?', a: 'Data ownership and export arrangements are defined in the agreement before work begins, so you know in advance how you can get your records out.' },
];

export const businessTypes = [
  'Cleaning / maintenance contractor',
  'Golf driving range / recreation facility',
  'Car wash',
  'Clinic / dental practice',
  'Bus / taxi / van fleet',
  'Salon / laundry / repair shop',
  'Other MSME',
];

// Scope builder: `modules` are indexes into `solutions`; `formType` is an index into `businessTypes`.
export const scopeTypes = [
  { id: 'contractor', label: 'Service contractor', hint: 'Cleaning, maintenance, crews', formType: 0, modules: [0, 1, 2, 3, 4, 5] },
  { id: 'range', label: 'Driving range', hint: 'Bays, tabs, café', formType: 1, modules: [1, 2, 5, 6] },
  { id: 'carwash', label: 'Car wash', hint: 'Job queue, supplies, sales', formType: 2, modules: [1, 2, 5, 6] },
  { id: 'clinic', label: 'Clinic or dental', hint: 'Appointments, supplies, billing', formType: 3, modules: [0, 1, 2, 5, 6] },
  { id: 'fleet', label: 'Bus, taxi or van fleet', hint: 'Vehicles, drivers, collections', formType: 4, modules: [0, 1, 2, 5, 6] },
  { id: 'shop', label: 'Salon, laundry or repair', hint: 'Jobs, stock, sales', formType: 5, modules: [1, 2, 4, 5, 6] },
  { id: 'other', label: 'Other MSME', hint: 'Staff, stock, bookings', formType: 6, modules: [] },
];

// More industries (shown as compact cards). `modules` are indexes into `solutions`.
export const moreIndustries = [
  { id: 'clinics', icon: 'cross', title: 'Clinics', sub: 'General and specialty clinics', modules: [0, 1, 2, 5, 6],
    items: ['Appointment schedule by doctor and room', 'Staff duty schedules and attendance', 'Clinic supplies and equipment stock', 'Billing, payments and balances', 'Daily and monthly summaries'],
    note: 'Patient clinical records are sensitive and are a separate scope, discussed case by case.' },
  { id: 'dental', icon: 'tooth', title: 'Dental practices', sub: 'Dental clinics and chairs', modules: [0, 1, 2, 5, 6],
    items: ['Chair and appointment scheduling', 'Dentist and assistant schedules', 'Dental supplies and instrument tracking', 'Treatment billing, payments and balances', 'Daily collection summary'],
    note: 'Patient clinical records are sensitive and are a separate scope, discussed case by case.' },
  { id: 'tourist-buses', icon: 'bus', title: 'Tourist bus fleets', sub: 'Charters, tours and transfers', modules: [0, 1, 2, 3, 5, 6],
    items: ['Trip and charter bookings with vehicle and driver assignment', 'Driver and conductor attendance', 'Quotations and approved itinerary changes', 'Fuel, toll and maintenance expenses per vehicle', 'Billing, deposits and collections'],
    note: 'Records are entered by your team. Live vehicle tracking is not part of the system.' },
  { id: 'taxi-fleets', icon: 'taxi', title: 'Taxi and van fleets', sub: 'Taxis, vans and shuttles', modules: [0, 1, 2, 5, 6],
    items: ['Vehicle and driver assignment by shift', 'Daily boundary or rental collection and remittance', 'Maintenance and repair schedule per vehicle', 'Driver attendance records', 'Fleet summary by vehicle and driver'],
    note: 'Records are entered by your team. Live vehicle tracking is not part of the system.' },
  { id: 'salons', icon: 'scissors', title: 'Salons and spas', sub: 'Salons, barbershops and spas', modules: [0, 1, 2, 5, 6],
    items: ['Appointments by stylist or therapist', 'Staff schedules and attendance', 'Product stock and usage', 'Service sales and payments', 'Daily sales report'] },
  { id: 'laundry', icon: 'laundry', title: 'Laundry shops', sub: 'Laundry and dry cleaning', modules: [1, 2, 5, 6],
    items: ['Job queue by stage: received, washing, ready', 'Customer claim and pickup records', 'Detergent and supplies stock', 'Payments and unpaid balances', 'Daily sales'] },
  { id: 'auto-repair', icon: 'gear', title: 'Auto repair shops', sub: 'Service and repair garages', modules: [1, 2, 3, 4, 5, 6],
    items: ['Job orders by bay and mechanic', 'Quotations and approved additional work', 'Parts and supplies stock', 'Service reports with customer sign-off', 'Billing and collections'] },
];

export const scopeNotes = [
  { id: 'import', label: 'We have existing records (e.g. spreadsheets) to bring in' },
  { id: 'mobile', label: 'Staff will use phones or tablets' },
  { id: 'sites', label: 'We work across several sites or branches' },
];
