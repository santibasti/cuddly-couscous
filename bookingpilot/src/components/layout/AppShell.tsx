import { useEffect, useMemo, useState } from 'react';
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import {
  Bell, Building2, CalendarDays, Check, ChevronsUpDown, Inbox, LayoutDashboard, LogOut, Menu, Plug, Plus, Search, Settings, Users, UserSquare2, BarChart3, BedDouble, ClipboardList,
} from 'lucide-react';
import { useStore } from '@/store/store';
import { useOrg } from '@/store/hooks';
import { useFlow } from '@/store/flow';
import { buildAttention } from '@/domain/attention';
import { ROLE_LABEL, type Permission } from '@/domain/permissions';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger, Popover, PopoverContent, PopoverTrigger, TooltipProvider } from '@/components/ui/overlays';
import { Logo } from '@/components/common/Logo';
import { BookingFormHost } from '@/components/bookings/BookingForm';
import { ConflictModalHost } from '@/components/bookings/ConflictModal';
import { GlobalSearch } from './GlobalSearch';
import { cn, initials } from '@/lib/utils';
import { Toaster } from 'sonner';

const NAV: { to: string; label: string; icon: typeof Building2; perm?: Permission }[] = [
  { to: '/', label: 'Dashboard', icon: LayoutDashboard },
  { to: '/calendar', label: 'Master Calendar', icon: CalendarDays },
  { to: '/bookings', label: 'Bookings', icon: ClipboardList, perm: 'bookings.view' },
  { to: '/properties', label: 'Properties / Resources', icon: BedDouble, perm: 'properties.view' },
  { to: '/channels', label: 'Channels', icon: Plug, perm: 'channels.view' },
  { to: '/guests', label: 'Guests', icon: UserSquare2, perm: 'guests.view' },
  { to: '/inbox', label: 'Inbox', icon: Inbox, perm: 'inbox.view' },
  { to: '/reports', label: 'Reports', icon: BarChart3, perm: 'reports.view' },
  { to: '/team', label: 'Team', icon: Users, perm: 'team.view' },
  { to: '/settings', label: 'Settings', icon: Settings, perm: 'settings.view' },
];

function Sidebar({ onNavigate }: { onNavigate?: () => void }) {
  const org = useOrg()!;
  const switchOrg = useStore((s) => s.switchOrg);
  const unread = org.messages.filter((m) => m.direction === 'in' && !m.readAt).length;
  const conflicts = org.alerts.filter((a) => a.status === 'open').length;
  return (
    <div className="flex h-full flex-col bg-navy-900 text-white">
      <div className="px-5 pt-5 pb-4"><Logo /></div>
      <div className="px-3">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button className="flex w-full items-center gap-3 rounded-xl bg-white/[0.07] px-3 py-2.5 text-left hover:bg-white/10" aria-label="Switch organization">
              <span className="flex size-8 items-center justify-center rounded-lg bg-brand-600 text-xs font-bold">{initials(org.org.name)}</span>
              <span className="min-w-0 flex-1"><span className="block truncate text-sm font-semibold">{org.org.name}</span><span className="block truncate text-[11px] text-navy-300">{ROLE_LABEL[org.role]}</span></span>
              <ChevronsUpDown className="size-4 text-navy-300" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-64">
            <DropdownMenuLabel>Organizations</DropdownMenuLabel>
            {org.memberships.map(({ org: o, member }) => (
              <DropdownMenuItem key={o.id} onSelect={() => { switchOrg(o.id); onNavigate?.(); }}>
                <Building2 /><span className="flex-1"><span className="block font-semibold">{o.name}</span><span className="block text-xs text-ink-mute">{ROLE_LABEL[member.role]}</span></span>{o.id === org.org.id && <Check className="text-ok-600" />}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
      <nav className="mt-4 flex-1 space-y-0.5 overflow-y-auto px-3 pb-4 scroll-thin" aria-label="Main">
        {NAV.filter((n) => !n.perm || org.can(n.perm)).map((n) => (
          <NavLink key={n.to} to={n.to} end={n.to === '/'} onClick={onNavigate} className={({ isActive }) => cn('group flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-colors', isActive ? 'bg-white text-navy-900 shadow-sm' : 'text-navy-300 hover:bg-white/[0.07] hover:text-white')}>
            <n.icon className="size-[18px]" />
            <span className="flex-1">{n.label}</span>
            {n.to === '/inbox' && unread > 0 && <span className="rounded-full bg-brand-600 px-1.5 py-0.5 text-[10px] font-bold text-white">{unread}</span>}
            {n.to === '/calendar' && conflicts > 0 && <span className="rounded-full bg-coral-600 px-1.5 py-0.5 text-[10px] font-bold text-white">{conflicts}</span>}
          </NavLink>
        ))}
      </nav>
      <div className="m-3 rounded-xl bg-white/[0.06] p-3 text-[11px] leading-relaxed text-navy-300">One calendar. Every channel. <span className="font-semibold text-white">No conflicts.</span></div>
    </div>
  );
}

function Notifications() {
  const org = useOrg()!;
  const nav = useNavigate();
  const [open, setOpen] = useState(false);
  const items = useMemo(() => buildAttention(org), [org]);
  const urgent = items.filter((i) => i.severity === 'urgent').length;
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="icon" className="relative" aria-label="Notifications"><Bell className="size-5" />{items.length > 0 && <span className={cn('absolute right-1 top-1 flex min-w-4 items-center justify-center rounded-full px-1 text-[10px] font-bold text-white', urgent ? 'bg-coral-600' : 'bg-warn-600')}>{items.length}</span>}</Button>
      </PopoverTrigger>
      <PopoverContent className="w-[22rem]">
        <div className="border-b border-line px-4 py-3 font-display font-bold">Notifications <span className="text-xs font-normal text-ink-mute">· {items.length} need attention</span></div>
        <div className="max-h-96 divide-y divide-line/70 overflow-y-auto scroll-thin">
          {items.length === 0 && <p className="p-6 text-center text-sm text-ink-mute">You’re all caught up.</p>}
          {items.slice(0, 12).map((i) => (
            <button key={i.id} className="flex w-full items-start gap-3 px-4 py-3 text-left hover:bg-brand-50/50" onClick={() => { setOpen(false); nav(i.to); }}>
              <span className={cn('mt-1.5 size-2 shrink-0 rounded-full', i.severity === 'urgent' ? 'bg-coral-600' : i.severity === 'action' ? 'bg-warn-500' : 'bg-brand-500')} />
              <span className="min-w-0"><span className="block text-sm font-semibold">{i.title}</span><span className="block truncate text-xs text-ink-soft">{i.detail}</span></span>
            </button>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
}

export default function AppShell() {
  const org = useOrg();
  const logout = useStore((s) => s.logout);
  const nav = useNavigate();
  const loc = useLocation();
  const [drawer, setDrawer] = useState(false);
  const setSearchOpen = useFlow((s) => s.setSearchOpen);
  const openForm = useFlow((s) => s.openForm);

  useEffect(() => { setDrawer(false); window.scrollTo(0, 0); }, [loc.pathname]);
  useEffect(() => {
    const h = (e: KeyboardEvent) => { if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); setSearchOpen(true); } };
    window.addEventListener('keydown', h); return () => window.removeEventListener('keydown', h);
  }, [setSearchOpen]);
  useEffect(() => { if (!org) nav('/login', { replace: true }); }, [org, nav]);
  if (!org) return null;

  return (
    <TooltipProvider>
      <div className="flex h-full">
        <aside className="hidden w-64 shrink-0 lg:block"><div className="fixed inset-y-0 left-0 w-64"><Sidebar /></div></aside>
        <Dialog open={drawer} onOpenChange={setDrawer}>
          <DialogContent title="Menu" className="!inset-y-0 !left-0 !right-auto !top-0 !h-full !max-h-none !w-72 !max-w-[85vw] !translate-x-0 !translate-y-0 !rounded-none bg-navy-900 p-0 [&>div:first-child]:hidden" hideClose><Sidebar onNavigate={() => setDrawer(false)} /></DialogContent>
        </Dialog>

        <div className="flex min-w-0 flex-1 flex-col">
          <header className="sticky top-0 z-40 flex h-16 items-center gap-3 border-b border-line bg-white/90 px-4 backdrop-blur sm:px-6">
            <Button variant="ghost" size="icon" className="lg:hidden" onClick={() => setDrawer(true)} aria-label="Open menu"><Menu className="size-5" /></Button>
            <button onClick={() => setSearchOpen(true)} className="flex h-10 min-w-0 flex-1 items-center gap-2.5 rounded-xl border border-line bg-canvas/70 px-3.5 text-left text-sm text-ink-mute hover:bg-white sm:max-w-md">
              <Search className="size-4 shrink-0" /><span className="truncate">Search bookings, guests, properties…</span><kbd className="ml-auto hidden rounded border border-line bg-white px-1.5 py-0.5 text-[10px] font-semibold sm:block">⌘K</kbd>
            </button>
            <div className="ml-auto flex items-center gap-1.5">
              {org.can('bookings.create') && <Button className="hidden sm:inline-flex" onClick={() => openForm({})}><Plus />New booking</Button>}
              <Notifications />
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button className="flex items-center gap-2.5 rounded-xl p-1 pr-2 hover:bg-black/5" aria-label="Profile menu">
                    <span className="flex size-9 items-center justify-center rounded-full bg-navy-900 text-xs font-bold text-white">{initials(org.user.name)}</span>
                    <span className="hidden text-left leading-tight md:block"><span className="block text-sm font-semibold">{org.user.name}</span><span className="block text-[11px] text-ink-mute">{ROLE_LABEL[org.role]}</span></span>
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent>
                  <DropdownMenuLabel>{org.user.email}</DropdownMenuLabel>
                  {org.can('settings.view') && <DropdownMenuItem onSelect={() => nav('/settings')}><Settings />Settings</DropdownMenuItem>}
                  <DropdownMenuSeparator />
                  <DropdownMenuItem danger onSelect={() => { logout(); nav('/login'); }}><LogOut />Sign out</DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </header>
          <main className="mx-auto w-full max-w-[1500px] flex-1 px-4 py-6 sm:px-6"><div key={org.org.id}><Outlet /></div></main>
        </div>
      </div>
      <GlobalSearch />
      <BookingFormHost />
      <ConflictModalHost />
      <Toaster position="top-right" richColors closeButton />
    </TooltipProvider>
  );
}
