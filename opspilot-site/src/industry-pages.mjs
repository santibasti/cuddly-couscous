// Copy for the dedicated industry pages. Page file = `<id>.html`.
// Keep wording factual: no client claims, no unsupported savings, no medical-records or GPS promises.

export const industryPages = {
  'service-contractors': {
    name: 'Cleaning and maintenance contractors', short: 'Contractors',
    title: 'Cleaning & Maintenance Contractor System | OpsPilot',
    desc: 'Custom system for cleaning and maintenance contractors in the Philippines: crew attendance, equipment tracking, quotations, service reports and collections.',
    h1: 'Operations system for cleaning and maintenance contractors',
    lead: 'Crews on several sites, equipment moving around, extra work agreed on the spot and bills to collect. OpsPilot puts attendance, equipment, quotations, service reports and collections in one set of records your supervisors can actually keep up to date.',
    problems: [
      ['Crew attendance and job records live in different files.', 'Attendance is recorded against the job and the crew, so one record shows who worked where and when, ready for payroll preparation.'],
      ['Equipment goes out and nobody is sure who has it.', 'Every item is issued to a named person or crew and returned with a date, with overdue items flagged.'],
      ['Extra work agreed on site never reaches the bill.', 'Additional work is recorded and approved against the quotation, then carried into the bill.'],
      ['It is hard to see who has paid and who has not.', 'Payments are logged against each bill, with outstanding balances by client and by job.'],
    ],
    faqs: [
      ['Can our supervisors record attendance from their phones?', 'Yes. The system is built for use in a web browser on phones and tablets, so supervisors can record attendance and complete service reports on site. It needs an internet connection; offline use is not a standard feature.'],
      ['Does it calculate payroll for us?', 'It prepares payroll figures from verified attendance and the pay rules your business has approved. Final payroll, deductions and statutory obligations remain your business’s responsibility, and we do not claim automatic legal compliance.'],
      ['Can clients sign off completed jobs?', 'Yes. A service report can be completed on a phone or tablet and the client’s acknowledgement recorded with the job.'],
    ],
  },
  'driving-ranges': {
    name: 'Driving ranges and recreation facilities', short: 'Driving ranges',
    title: 'Driving Range Management System | OpsPilot',
    desc: 'Custom system for driving ranges in the Philippines: bay availability, player tabs, buckets, café orders, checkout and daily reports.',
    h1: 'Management system for driving ranges and recreation facilities',
    lead: 'Bays that fill up, players running tabs, buckets to count and a café on the side. OpsPilot keeps bay availability, tabs, bucket sales, food and beverage orders and checkout in one place, with daily and shift reports.',
    problems: [
      ['Nobody can tell at a glance which bays are free.', 'A bay board shows which bays are open, in use or reserved, so staff can seat players quickly.'],
      ['Player tabs are written on paper and totals go missing.', 'Each player’s buckets and café orders add up on one tab, ready for checkout.'],
      ['Buckets and café items are counted by hand at closing.', 'Sales are recorded as they happen, so the day’s totals are already there at the end of the shift.'],
      ['Owners have to ask staff for the day’s numbers.', 'A daily and shift report summarises sales, payments and open tabs.'],
    ],
    faqs: [
      ['Is there a working example I can look at?', 'We have a working demo for a driving range and café that covers bay availability, player tabs, buckets, food and beverage orders and checkout. It is a demonstration, not a deployment at a client’s business.'],
      ['Can it handle both the range and the café?', 'Yes. Range sales and café orders can sit on the same player tab and be checked out together.'],
      ['Does it work on a tablet at the counter?', 'Yes. It runs in a web browser, so a tablet or a computer at the counter works. It needs an internet connection.'],
    ],
  },
  'car-washes': {
    name: 'Car washes', short: 'Car washes',
    title: 'Car Wash Management System, Philippines | OpsPilot',
    desc: 'Custom system for car washes in the Philippines: job queue by bay, vehicle service records, supplies tracking and daily sales.',
    h1: 'Management system for car washes',
    lead: 'Vehicles waiting, bays in use, supplies running low and cash coming in all day. OpsPilot gives your car wash a job queue by bay, a service record for each vehicle, supply tracking and daily sales.',
    problems: [
      ['The queue is in someone’s head or on a notepad.', 'A job queue by bay shows what is waiting, washing, drying and ready.'],
      ['Service records for repeat customers are not kept.', 'Each vehicle has a record of services done and amounts paid.'],
      ['Soap, wax and other supplies run out unexpectedly.', 'Supplies are tracked so low stock is flagged before it stops work.'],
      ['It takes effort to add up the day’s sales.', 'Sales and payments are recorded per job, so the day’s totals are ready at closing.'],
    ],
    faqs: [
      ['Can staff update jobs from a phone or tablet?', 'Yes. The system runs in a web browser, so a phone or tablet at the bay works. It needs an internet connection.'],
      ['Is there an example I can see?', 'We have a concept prototype for a car wash using sample data. It shows how a job queue, service records, supplies and sales could fit together; it is not a deployment at a client’s business.'],
      ['Can it work with our existing price list?', 'Yes. Your services and prices are set up during configuration, and agreed in writing before work begins.'],
    ],
  },
  clinics: {
    name: 'Clinics', short: 'Clinics',
    title: 'Clinic Operations & Billing System | OpsPilot',
    desc: 'Custom operations system for clinics in the Philippines: appointments by doctor and room, staff schedules, supplies, billing and collections.',
    h1: 'Operations and billing system for clinics',
    lead: 'Appointments by doctor and room, staff schedules, supplies and billing, all in one place. OpsPilot covers the day-to-day running of a clinic: scheduling, stock, payments and balances. Patient clinical records are a separate and sensitive scope, discussed case by case.',
    problems: [
      ['Appointments are tracked in a notebook or chat messages.', 'A schedule by doctor and room shows what is booked, done and free, and which appointments need confirming.'],
      ['Staff duty schedules and attendance are kept separately.', 'Duty schedules and attendance sit in the same system as the appointment schedule.'],
      ['Supplies run low without warning.', 'Clinic supplies and equipment are tracked, with low items flagged for reordering.'],
      ['Unpaid balances are hard to follow up.', 'Payments are recorded per account, with outstanding balances and how long they have been open.'],
    ],
    faqs: [
      ['Does it store patient medical records?', 'Not as part of the standard scope. The standard modules cover scheduling, staff, supplies and billing. Clinical records are sensitive and carry privacy obligations, so we would discuss them separately before agreeing anything, and we make no compliance claims.'],
      ['Can patients book online?', 'Not as a standard feature. Appointments are entered by your team. If you want something different, we can discuss it during scoping.'],
      ['Is there a working example?', 'We have a dashboard example with sample data that shows how a clinic’s schedule, supplies and billing could look. It is illustrative and not a deployment at a client’s clinic.'],
    ],
  },
  dental: {
    name: 'Dental practices', short: 'Dental practices',
    title: 'Dental Practice Management System | OpsPilot',
    desc: 'Custom system for dental clinics in the Philippines: chair and appointment scheduling, dentist schedules, supplies, instruments and treatment billing.',
    h1: 'Operations and billing system for dental practices',
    lead: 'Chairs to fill, dentists and assistants to schedule, instruments to track and treatments to bill. OpsPilot covers chair and appointment scheduling, supplies and instrument tracking, and billing with balances. Clinical patient records are a separate and sensitive scope, discussed case by case.',
    problems: [
      ['Chair schedules clash or leave gaps.', 'Chairs and appointments are shown together, with chair status and what is coming next.'],
      ['Dentist and assistant schedules are hard to line up.', 'Dentist and assistant schedules are kept alongside the chair schedule.'],
      ['Instruments and supplies are not tracked closely.', 'Supplies and instrument sets are tracked, with low items flagged for reordering.'],
      ['Treatment payments and installments are tracked by hand.', 'Treatment billing, payments and balances are recorded per account, with due dates in view.'],
    ],
    faqs: [
      ['Does it include dental charts or X-rays?', 'Not as part of the standard scope. Clinical records are sensitive and carry privacy obligations, so we would discuss them separately, and we make no compliance claims.'],
      ['Can it manage several chairs and dentists?', 'Yes. Chairs, dentists and assistants are set up during configuration, and their schedules are managed together.'],
      ['Can we start with scheduling only?', 'Yes. You can begin with one module, such as scheduling or billing, and add others later. Additional modules are quoted separately.'],
    ],
  },
  'tourist-buses': {
    name: 'Tourist bus fleets', short: 'Tourist buses',
    title: 'Tourist Bus Fleet Operations System | OpsPilot',
    desc: 'Custom system for tourist bus operators in the Philippines: charter bookings, bus and driver assignment, quotations, trip expenses and collections.',
    h1: 'Operations system for tourist bus fleets',
    lead: 'Charters to quote, buses and drivers to assign, deposits to collect and expenses to track per vehicle. OpsPilot keeps bookings, assignments, quotations, trip expenses and collections together. Records are entered by your team; live vehicle tracking is not part of the system.',
    problems: [
      ['Charter bookings and assignments are scattered across messages.', 'Bookings are recorded with the bus and driver assigned, so conflicts are easy to see.'],
      ['Quotes change and the final bill no longer matches.', 'Quotations and approved itinerary changes are recorded and carried into the bill.'],
      ['Fuel, toll and repair costs are not tied to each bus.', 'Expenses are recorded per vehicle, so you can see what each bus costs to run.'],
      ['Deposits and balances are hard to follow.', 'Deposits and payments are logged per booking, with balances still due.'],
    ],
    faqs: [
      ['Does it track our buses by GPS?', 'No. Live vehicle tracking is not part of the system. Trip and assignment records are entered by your team.'],
      ['Can it manage driver and conductor attendance?', 'Yes. Attendance is recorded and can feed payroll preparation based on verified attendance and the rules your business has approved.'],
      ['Is there an example I can look at?', 'There is a sample dashboard on this page showing how trips, charters and collections could look. It uses sample data and is not a deployment at a client’s business.'],
    ],
  },
  'taxi-fleets': {
    name: 'Taxi and van fleets', short: 'Taxi and van fleets',
    title: 'Taxi & Van Fleet Management System | OpsPilot',
    desc: 'Custom system for taxi and van fleets in the Philippines: shift assignment, boundary collections, remittances, maintenance and driver attendance.',
    h1: 'Management system for taxi and van fleets',
    lead: 'Vehicles on different shifts, boundary or rental to collect, remittances to check and maintenance coming due. OpsPilot records assignments, collections, remittances, maintenance and driver attendance. Records are entered by your team; live vehicle tracking is not part of the system.',
    problems: [
      ['It is unclear who has which vehicle on which shift.', 'Vehicles and drivers are assigned by shift, with the assignment recorded.'],
      ['Boundary and rental collections are written in notebooks.', 'Daily collections are recorded per vehicle against the expected amount.'],
      ['Short or late remittances are noticed too late.', 'Remittances are checked against what was due, with shortfalls flagged for follow-up.'],
      ['Maintenance is missed until a vehicle breaks down.', 'Maintenance and repair schedules are kept per vehicle, with those coming due flagged.'],
    ],
    faqs: [
      ['Does it track vehicles by GPS?', 'No. Live vehicle tracking is not part of the system. Collections, assignments and maintenance are recorded by your team.'],
      ['Can drivers submit their own remittance?', 'Not as a standard feature. Your team records remittances. If you want something different, we can discuss it during scoping.'],
      ['Can it handle both taxis and vans?', 'Yes. Vehicle types, shifts and collection rules are set up during configuration and agreed in writing.'],
    ],
  },
  salons: {
    name: 'Salons and spas', short: 'Salons and spas',
    title: 'Salon & Spa Management System | OpsPilot',
    desc: 'Custom system for salons, barbershops and spas in the Philippines: appointments by stylist, staff schedules, product stock and daily sales.',
    h1: 'Management system for salons and spas',
    lead: 'Stylists to schedule, appointments to keep, products to stock and sales to add up. OpsPilot covers appointments by stylist or therapist, staff schedules and attendance, product stock, service and product sales, and a daily sales report.',
    problems: [
      ['Appointments clash or leave stylists idle.', 'A schedule by stylist or therapist shows booked, free and break slots.'],
      ['Staff schedules and attendance are tracked separately.', 'Schedules and attendance are recorded together.'],
      ['Product stock runs low unexpectedly.', 'Product stock and usage are tracked, with low items flagged for reordering.'],
      ['Adding up the day’s sales takes time.', 'Service sales, product sales and payments are recorded as they happen and summarised daily.'],
    ],
    faqs: [
      ['Can customers book online?', 'Not as a standard feature. Appointments are entered by your team. If you want something different, we can discuss it during scoping.'],
      ['Can it handle commissions?', 'It can record services per stylist, which can feed commission or payroll preparation based on the rules your business has approved. Final payroll remains your business’s responsibility.'],
      ['We have several branches. Can it handle that?', 'It can be set up for more than one branch. This is scoped during discovery and agreed in writing.'],
    ],
  },
  laundry: {
    name: 'Laundry shops', short: 'Laundry shops',
    title: 'Laundry Shop Management System | OpsPilot',
    desc: 'Custom system for laundry shops in the Philippines: jobs by stage from received to ready, claim tickets, supplies, payments and unpaid balances.',
    h1: 'Management system for laundry shops',
    lead: 'Loads received, washed, dried and waiting for pickup. OpsPilot tracks every job by stage with a claim ticket, records payments and unpaid balances, and keeps an eye on detergent and supplies.',
    problems: [
      ['It is hard to tell where each customer’s load is.', 'Each job moves through stages from received to ready, with a claim ticket number.'],
      ['Finished laundry sits unclaimed.', 'Ready and unclaimed tickets are listed, so you can send a reminder.'],
      ['Supplies run out in the middle of the day.', 'Detergent and other supplies are tracked, with low stock flagged.'],
      ['Unpaid balances are forgotten.', 'Payments and unpaid balances are recorded per ticket.'],
    ],
    faqs: [
      ['Can it print claim tickets?', 'Ticket numbers are generated for each job. Printing and any receipt format are discussed during scoping.'],
      ['Does it send SMS reminders?', 'Not as a standard feature. Messaging integrations are scoped separately, and we do not assume them.'],
      ['Can we price by kilo or by item?', 'Yes. Your price rules are set up during configuration and agreed in writing.'],
    ],
  },
  'auto-repair': {
    name: 'Auto repair shops', short: 'Auto repair shops',
    title: 'Auto Repair Shop Management System | OpsPilot',
    desc: 'Custom system for auto repair shops in the Philippines: job orders by bay, quotations and extra work, parts stock, service reports and billing.',
    h1: 'Management system for auto repair shops',
    lead: 'Vehicles in several bays, parts on order, quotes to approve and extra work found along the way. OpsPilot tracks job orders by bay and mechanic, quotations and approved additions, parts and supplies, service reports and billing.',
    problems: [
      ['Job orders are on paper and hard to follow.', 'A bay board shows each vehicle, its mechanic and progress.'],
      ['Extra work is found mid-job and not charged.', 'Additional work is quoted, approved and carried into the bill.'],
      ['Parts and supplies are not tracked closely.', 'Parts and supplies are recorded, with low stock flagged for reordering.'],
      ['Customers are not notified or invoices are late.', 'Vehicles ready for pickup are listed, and billing and balances are recorded per job.'],
    ],
    faqs: [
      ['Can customers approve quotes through the system?', 'Approvals are recorded by your team against the quotation. Customer self-service approval is not a standard feature.'],
      ['Does it keep a history per vehicle?', 'Yes. Job orders and services are recorded per vehicle, so earlier work can be looked up.'],
      ['Can mechanics use tablets in the bays?', 'Yes. It runs in a web browser, so a tablet in the bay works. It needs an internet connection.'],
    ],
  },
};

export const industryOrder = ['service-contractors', 'driving-ranges', 'car-washes', 'clinics', 'dental', 'tourist-buses', 'taxi-fleets', 'salons', 'laundry', 'auto-repair'];
export const related = {
  'service-contractors': ['car-washes', 'auto-repair', 'laundry'],
  'driving-ranges': ['salons', 'car-washes', 'laundry'],
  'car-washes': ['auto-repair', 'laundry', 'taxi-fleets'],
  clinics: ['dental', 'salons', 'laundry'],
  dental: ['clinics', 'salons', 'auto-repair'],
  'tourist-buses': ['taxi-fleets', 'auto-repair', 'service-contractors'],
  'taxi-fleets': ['tourist-buses', 'auto-repair', 'car-washes'],
  salons: ['dental', 'clinics', 'laundry'],
  laundry: ['car-washes', 'salons', 'service-contractors'],
  'auto-repair': ['car-washes', 'taxi-fleets', 'tourist-buses'],
};
