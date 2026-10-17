-- The day the client booked the service (shown on the Job Order as "Booking date"); the booking form lets staff set it, e.g. when a booking is entered later than it was made.
alter table public.jobs add column booking_date date;
