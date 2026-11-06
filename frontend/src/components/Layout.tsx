import { Bell, Calendar, Leaf, LogOut, Menu, UserRound } from 'lucide-react';
import { useState } from 'react';
import { Link, NavLink, Outlet } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { http } from '../api/client';
import { firstName } from '../lib/time';
import { useAuth } from '../auth/AuthProvider';

const linkClass = ({ isActive }: { isActive: boolean }) =>
  `rounded-lg px-3 py-2 text-sm ${isActive ? 'bg-mist text-mossdeep' : 'text-ink hover:bg-paper'}`;

export function Layout() {
  const { user, logout } = useAuth();
  const [open, setOpen] = useState(false);
  const unread = useQuery({
    queryKey: ['unread-count'],
    queryFn: async () => (await http.get('/notifications/unread-count')).data.data.count as number,
    enabled: Boolean(user),
    refetchInterval: 30_000,
  });

  if (!user) return null;
  const links =
    user.role === 'MEMBER'
      ? [
          { to: '/dashboard', label: 'Home' },
          { to: '/professionals', label: 'Professionals' },
          { to: '/sessions', label: 'My sessions' },
          { to: '/notifications', label: 'Notifications' },
          { to: '/settings', label: 'Profile' },
        ]
      : [
          { to: '/dashboard', label: 'Home' },
          { to: '/availability', label: 'Availability' },
          { to: '/sessions', label: 'Schedule' },
          { to: '/notifications', label: 'Notifications' },
          { to: '/settings', label: 'Profile' },
        ];

  return (
    <div className="min-h-screen bg-paper">
      <header className="sticky top-0 z-20 border-b border-line bg-sand/95 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4">
          <Link to="/dashboard" className="flex items-center gap-2">
            <span className="grid h-9 w-9 place-items-center rounded-xl bg-moss text-white">
              <Leaf className="h-5 w-5" aria-hidden="true" />
            </span>
            <span className="font-serif text-xl">ThoughtFull</span>
          </Link>
          <nav className="hidden items-center gap-1 md:flex" aria-label="Primary">
            {links.map((link) => (
              <NavLink key={link.to} to={link.to} className={linkClass}>
                {link.label}
              </NavLink>
            ))}
          </nav>
          <div className="flex items-center gap-2">
            <Link to="/notifications" className="relative rounded-lg p-2 hover:bg-paper" aria-label="Notifications">
              <Bell className="h-5 w-5" />
              {unread.data ? (
                <span className="absolute right-1 top-1 grid h-4 min-w-4 place-items-center rounded-full bg-clay px-1 text-[10px] text-white">
                  {unread.data}
                </span>
              ) : null}
            </Link>
            <button type="button" className="hidden items-center gap-2 rounded-lg px-2 py-1 text-sm hover:bg-paper md:inline-flex" onClick={() => void logout()}>
              <UserRound className="h-4 w-4" aria-hidden="true" />
              {firstName(user.name)}
              <LogOut className="h-4 w-4" aria-hidden="true" />
            </button>
            <button type="button" className="rounded-lg p-2 md:hidden" aria-label="Open menu" onClick={() => setOpen((value) => !value)}>
              <Menu className="h-5 w-5" />
            </button>
          </div>
        </div>
        {open ? (
          <nav className="space-y-1 border-t border-line px-4 py-3 md:hidden" aria-label="Mobile">
            {links.map((link) => (
              <NavLink key={link.to} to={link.to} className={linkClass} onClick={() => setOpen(false)}>
                {link.label}
              </NavLink>
            ))}
            <button type="button" className="btn-secondary mt-2 w-full" onClick={() => void logout()}>
              Log out
            </button>
          </nav>
        ) : null}
      </header>
      <main className="mx-auto max-w-6xl px-4 py-8">
        <Outlet />
      </main>
      <footer className="mx-auto flex max-w-6xl items-center gap-2 px-4 pb-8 text-xs text-muted">
        <Calendar className="h-3.5 w-3.5" aria-hidden="true" />
        Sessions are 50 minutes. Times follow your timezone, {user.timezone}.
      </footer>
    </div>
  );
}
