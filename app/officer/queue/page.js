import { query } from '@/lib/db';
import { requireRole } from '@/lib/auth';
import { LIST_SQL } from '@/lib/complaints';
import { STATUSES } from '@/lib/format';
import ComplaintTable from '@/components/ComplaintTable';
import StatusFilter from '@/components/StatusFilter';
import ActionButton from '@/components/ActionButton';

export default async function OfficerQueuePage({ searchParams }) {
  const user = await requireRole('OFFICER');
  const { status = '' } = await searchParams;

  // Only the first report of each issue is listed; duplicates travel with it.
  const params = [user.id];
  let statusFilter = '';
  if (STATUSES.includes(status)) {
    params.push(status);
    statusFilter = `AND c.status = $${params.length}`;
  }

  const [mine, unassigned] = await Promise.all([
    query(
      `${LIST_SQL}
       WHERE cl.representative_complaint_id = c.complaint_id
         AND (SELECT a.officer_id FROM assignment a
              WHERE a.complaint_id = c.complaint_id
              ORDER BY a.assigned_at DESC LIMIT 1) = $1
         ${statusFilter}
       ORDER BY (c.status IN ('RESOLVED','CLOSED')), c.sla_due_at`,
      params
    ),
    query(
      `${LIST_SQL}
       WHERE cl.representative_complaint_id = c.complaint_id
         AND d.department_id = $1
         AND c.status NOT IN ('RESOLVED','CLOSED')
         AND NOT EXISTS (SELECT 1 FROM assignment a WHERE a.complaint_id = c.complaint_id)
       ORDER BY c.sla_due_at`,
      [user.departmentId]
    ),
  ]);

  return (
    <>
      <div className="page-head">
        <h1>My queue</h1>
        <p className="muted">Sorted by deadline. Rows past their deadline are highlighted.</p>
      </div>

      <StatusFilter status={status} />
      <ComplaintTable rows={mine} extra={['ward', 'reports']} emptyText="Nothing is assigned to you for this filter." />

      <h2>Unassigned in my department</h2>
      <ComplaintTable
        rows={unassigned}
        extra={['ward', 'reports']}
        emptyText="No unassigned complaints in your department."
        action={(c) => (
          <ActionButton action={`/api/complaints/${c.complaint_id}/assign`} body={{}}>
            Take
          </ActionButton>
        )}
      />
    </>
  );
}
