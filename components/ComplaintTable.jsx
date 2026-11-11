import Link from 'next/link';
import { formatDate, statusLabel, dueText, isOverdue } from '@/lib/format';

/**
 * Complaint list used by the citizen, officer and admin screens.
 * `extra` adds optional columns: 'ward', 'department', 'citizen', 'reports', 'similarity', 'officer'.
 */
export default function ComplaintTable({ rows, extra = [], emptyText = 'No complaints to show.', action }) {
  if (!rows.length) return <div className="table-wrap empty">{emptyText}</div>;
  const has = (name) => extra.includes(name);

  return (
    <div className="table-wrap">
      <table>
        <thead>
          <tr>
            <th>No.</th>
            <th>Issue</th>
            {has('ward') && <th>Ward</th>}
            {has('department') && <th>Department</th>}
            {has('citizen') && <th>Reported by</th>}
            {has('officer') && <th>Officer</th>}
            <th>Status</th>
            <th>Priority</th>
            {has('reports') && <th className="num">Reports</th>}
            <th>Deadline</th>
            <th>Filed</th>
            {has('similarity') && <th className="num">Match</th>}
            {action && <th></th>}
          </tr>
        </thead>
        <tbody>
          {rows.map((c) => {
            const late = isOverdue(c.sla_due_at, c.status);
            return (
              <tr key={c.complaint_id} className={late ? 'overdue' : undefined}>
                <td>{c.complaint_id}</td>
                <td>
                  <Link href={`/complaints/${c.complaint_id}`}>{c.title}</Link>
                  {c.category_name && <div className="small muted">{c.category_name}</div>}
                </td>
                {has('ward') && <td>{c.ward_name}</td>}
                {has('department') && <td>{c.dept_name ?? '-'}</td>}
                {has('citizen') && <td>{c.citizen_name}</td>}
                {has('officer') && <td>{c.officer_name ?? 'Unassigned'}</td>}
                <td>
                  <span className={`status ${c.status}`}>{statusLabel(c.status)}</span>
                </td>
                <td>{c.priority.charAt(0) + c.priority.slice(1).toLowerCase()}</td>
                {has('reports') && <td className="num">{c.report_count}</td>}
                <td className={late ? 'late' : undefined}>{dueText(c.sla_due_at, c.status)}</td>
                <td className="small">{formatDate(c.created_at)}</td>
                {has('similarity') && (
                  <td className="num">{c.similarity == null ? '-' : `${Math.round(c.similarity * 100)}%`}</td>
                )}
                {action && <td>{action(c)}</td>}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
