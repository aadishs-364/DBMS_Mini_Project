import Link from 'next/link';
import './globals.css';
import { getUser, homeFor } from '@/lib/auth';
import LogoutButton from '@/components/LogoutButton';

export const metadata = {
  title: 'CivicResolve',
  description: 'Report and track civic issues in your ward',
};

const LINKS = {
  CITIZEN: [
    ['/citizen/complaints', 'My complaints'],
    ['/citizen/new', 'Report an issue'],
  ],
  OFFICER: [['/officer/queue', 'My queue']],
  ADMIN: [
    ['/admin', 'Dashboard'],
    ['/admin/complaints', 'Complaints'],
    ['/admin/clusters', 'Duplicates'],
    ['/admin/master', 'Master data'],
    ['/admin/audit', 'Audit log'],
  ],
};

export default async function RootLayout({ children }) {
  const user = await getUser();

  return (
    <html lang="en">
      <body>
        <header className="site-header">
          <div className="inner">
            <Link href={user ? homeFor(user.role) : '/login'} className="name">
              CivicResolve
            </Link>
            <nav>
              {user &&
                LINKS[user.role].map(([href, label]) => (
                  <Link key={href} href={href}>
                    {label}
                  </Link>
                ))}
            </nav>
            {user && (
              <div className="who">
                <span>
                  {user.name} ({user.role.toLowerCase()})
                </span>
                <LogoutButton />
              </div>
            )}
          </div>
        </header>
        <main>{children}</main>
      </body>
    </html>
  );
}
