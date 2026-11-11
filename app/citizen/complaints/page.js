import Link from 'next/link';
import { query } from '@/lib/db';
import { requireRole } from '@/lib/auth';
import { LIST_SQL } from '@/lib/complaints';
import { STATUSES } from '@/lib/format';
import ComplaintTable from '@/components/ComplaintTable';
import StatusFilter from '@/components/StatusFilter';

export default async function MyComplaintsPage({ searchParams }) {
  const user = await requireRole('CITIZEN');
  const { status = '', q = '' } = await searchParams;

  const where = ['c.citizen_id = $1'];
  const params = [user.id];
  if (STATUSES.includes(status)) {
    params.push(status);
    where.push(`c.status = $${params.length}`);
  }
  if (q.trim()) {
    params.push(`%${q.trim()}%`);
    where.push(`(c.title ILIKE $${params.length} OR c.description ILIKE $${params.length})`);
  }

  const complaints = await query(
    `${LIST_SQL} WHERE ${where.join(' AND ')} ORDER BY c.created_at DESC`,
    params
  );

  return (
    <>
      <div className="page-head">
        <h1>My complaints</h1>
        <p className="muted">Everything you have reported, newest first.</p>
      </div>
      <StatusFilter status={status} q={q} searchLabel="Search in title or description" />
      <ComplaintTable
        rows={complaints}
        extra={['ward', 'department', 'reports']}
        emptyText="You have not reported anything yet, or nothing matches the filter."
      />
      <div className="actions">
        <Link href="/citizen/new" className="button">
          Report an issue
        </Link>
      </div>
    </>
  );
}
