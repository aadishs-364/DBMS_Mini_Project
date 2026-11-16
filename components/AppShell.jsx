'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useState } from 'react';
import LogoutButton from './LogoutButton';

export default function AppShell({ user, links, children }) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  if (!user) {
    return (
      <main className="public-page">
        <Link href="/login" className="brand public-brand">
          <span className="brand-mark">C</span>
          <span>Civic<span>Resolve</span></span>
        </Link>
        {children}
      </main>
    );
  }

  return (
    <div className="app-shell">
      <button type="button" className="menu-toggle" onClick={() => setOpen(!open)} aria-expanded={open} aria-label="Toggle navigation">
        {open ? '×' : '☰'}
      </button>
      {open && <button type="button" className="sidebar-backdrop" onClick={() => setOpen(false)} aria-label="Close navigation" />}
      <aside className={`sidebar ${open ? 'open' : ''}`}>
        <Link href="/" className="brand" onClick={() => setOpen(false)}>
          <span className="brand-mark">C</span>
          <span>Civic<span>Resolve</span></span>
        </Link>
        <p className="sidebar-label">Workspace</p>
        <nav className="side-nav">
          {links[user.role].map(([href, label]) => {
            const active = pathname === href || (href !== '/' && pathname.startsWith(`${href}/`));
            return (
              <Link key={href} href={href} className={active ? 'active' : ''} onClick={() => setOpen(false)}>
                <span className="nav-dot" />{label}
              </Link>
            );
          })}
        </nav>
        <div className="user-block">
          <div className="avatar">{user.name.charAt(0).toUpperCase()}</div>
          <div className="user-info"><strong>{user.name}</strong><span>{user.role.toLowerCase()}</span></div>
          <LogoutButton />
        </div>
      </aside>
      <main className="app-content">{children}</main>
    </div>
  );
}
