import './globals.css';
import { getUser } from '@/lib/auth';
import AppShell from '@/components/AppShell';

export const metadata = {
  title: 'CivicResolve',
  description: 'Report and track civic issues in your ward',
};

export const LINKS = {
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
      <body><AppShell user={user} links={LINKS}>{children}</AppShell></body>
    </html>
  );
}
