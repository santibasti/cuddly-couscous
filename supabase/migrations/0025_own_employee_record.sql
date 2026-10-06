-- Crew and Team Leaders must be able to read THEIR OWN employee record (the app uses it to know who is clocking in).
-- Without this a crew login, although linked to its employee, saw "Your user account is not linked to an employee record".
-- Only the person's own row is opened; pay, bank and ID details of colleagues stay hidden (those need employees.view / payroll.view etc.).
create policy employees_self on public.employees for select using (id = app.my_employee());
