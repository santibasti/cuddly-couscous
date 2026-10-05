import { Navigate, Route, Routes } from 'react-router-dom';
import AppShell from '@/components/layout/AppShell';
import Login from '@/pages/Login';
import CalendarPage from '@/pages/CalendarPage';
import Dashboard from "@/pages/Dashboard";
import Bookings from "@/pages/Bookings";
import BookingDetail from "@/pages/BookingDetail";
import Properties from "@/pages/Properties";
import Channels from "@/pages/Channels";
import Guests from "@/pages/Guests";
import Inbox from "@/pages/Inbox";
import Reports from "@/pages/Reports";
import Team from "@/pages/Team";
import Settings from "@/pages/Settings";
import { useOrg } from '@/store/hooks';
import { can, type Permission } from '@/domain/permissions';

function Guard({ perm, children }: { perm?: Permission; children: React.ReactNode }) {
  const org = useOrg();
  if (perm && org && !can(org.role, perm)) {
    return <div className="mx-auto mt-16 max-w-md rounded-2xl border border-line bg-white p-8 text-center"><h2 className="font-display text-xl font-bold">No access</h2><p className="mt-2 text-sm text-ink-soft">Your role ({org.role}) doesn’t include this area. Ask an owner if you need it.</p></div>;
  }
  return <>{children}</>;
}

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route element={<AppShell />}>
        <Route path="/" element={<Dashboard />} />
        <Route path="/calendar" element={<CalendarPage />} />
        <Route path="/bookings" element={<Guard perm="bookings.view"><Bookings /></Guard>} />
        <Route path="/bookings/:id" element={<Guard perm="bookings.view"><BookingDetail /></Guard>} />
        <Route path="/properties" element={<Guard perm="properties.view"><Properties /></Guard>} />
        <Route path="/channels" element={<Guard perm="channels.view"><Channels /></Guard>} />
        <Route path="/guests" element={<Guard perm="guests.view"><Guests /></Guard>} />
        <Route path="/inbox" element={<Guard perm="inbox.view"><Inbox /></Guard>} />
        <Route path="/reports" element={<Guard perm="reports.view"><Reports /></Guard>} />
        <Route path="/team" element={<Guard perm="team.view"><Team /></Guard>} />
        <Route path="/settings" element={<Guard perm="settings.view"><Settings /></Guard>} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  );
}
export { Guard };
