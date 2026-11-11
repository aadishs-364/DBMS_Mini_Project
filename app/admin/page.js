import { query } from '@/lib/db';
import { requireRole } from '@/lib/auth';
import { LIST_SQL } from '@/lib/complaints';
import ComplaintTable from '@/components/ComplaintTable';
import ActionButton from '@/components/ActionButton';

export default async function AdminDashboardPage() {
  await requireRole('ADMIN');

  const [totals, deptLoad, byWard, resolution, overdue] = await Promise.all([
    // aggregate with FILTER: several counts in one pass over the table
    query(
      `SELECT COUNT(*)::int                                                        AS total,
              COUNT(*) FILTER (WHERE status IN ('OPEN','ASSIGNED','IN_PROGRESS'))::int AS open,
              COUNT(*) FILTER (WHERE status = 'ESCALATED')::int                    AS escalated,
              COUNT(*) FILTER (WHERE resolved_at::date = CURRENT_DATE)::int        AS resolved_today,
              (SELECT COUNT(*)::int FROM complaint_cluster WHERE report_count > 1) AS duplicate_clusters,
              (SELECT COALESCE(SUM(report_count - 1), 0)::int FROM complaint_cluster) AS tickets_saved
       FROM complaint`
    ),
    // the view defined in db/01_schema.sql
    query('SELECT * FROM v_department_open_load ORDER BY open_complaints DESC, dept_name'),
    // JOIN + GROUP BY + ORDER BY
    query(
      `SELECT w.ward_number, w.ward_name,
              COUNT(c.complaint_id)::int AS total,
              COUNT(c.complaint_id) FILTER (WHERE c.status NOT IN ('RESOLVED','CLOSED'))::int AS open
       FROM ward w
       LEFT JOIN complaint c ON c.ward_id = w.ward_id
       GROUP BY w.ward_id, w.ward_number, w.ward_name
       ORDER BY total DESC, w.ward_number`
    ),
    // GROUP BY + HAVING: only departments that have resolved something
    query(
      `SELECT d.dept_name,
              COUNT(*)::int AS resolved,
              ROUND(AVG(EXTRACT(EPOCH FROM (c.resolved_at - c.created_at)) / 3600)::numeric, 1) AS avg_hours
       FROM complaint c
       JOIN category cat ON cat.category_id = c.category_id
       JOIN department d ON d.department_id = cat.department_id
       WHERE c.resolved_at IS NOT NULL
       GROUP BY d.dept_name
       HAVING COUNT(*) >= 1
       ORDER BY avg_hours`
    ),
    query(
      `${LIST_SQL}
       WHERE cl.representative_complaint_id = c.complaint_id
         AND c.status NOT IN ('RESOLVED','CLOSED')
         AND c.sla_due_at < NOW()
       ORDER BY c.sla_due_at
       LIMIT 15`
    ),
  ]);

  const t = totals[0];
  const maxOpen = Math.max(1, ...deptLoad.map((d) => Number(d.open_complaints)));

  return (
    <>
      <div className="page-head">
        <h1>Dashboard</h1>
        <p className="muted">Live figures from the database.</p>
      </div>

      <div className="stats">
        <div className="stat"><b>{t.total}</b><span>Reports received</span></div>
        <div className="stat"><b>{t.open}</b><span>Open</span></div>
        <div className="stat"><b>{t.escalated}</b><span>Escalated</span></div>
        <div className="stat"><b>{t.resolved_today}</b><span>Resolved today</span></div>
        <div className="stat"><b>{t.duplicate_clusters}</b><span>Issues reported more than once</span></div>
        <div className="stat"><b>{t.tickets_saved}</b><span>Duplicate tickets avoided</span></div>
      </div>

      <div className="columns" style={{ marginTop: 6 }}>
        <div>
          <h2>Open complaints by department</h2>
          <div className="table-wrap">
            <table>
              <thead>
                <tr><th>Department</th><th className="num">Open</th><th className="num">Past deadline</th><th></th></tr>
              </thead>
              <tbody>
                {deptLoad.map((d) => (
                  <tr key={d.department_id}>
                    <td>{d.dept_name}</td>
                    <td className="num">{d.open_complaints}</td>
                    <td className={`num ${Number(d.overdue_complaints) ? 'late' : ''}`}>{d.overdue_complaints}</td>
                    <td>
                      <div className="bar"><i style={{ width: `${(Number(d.open_complaints) / maxOpen) * 100}%` }} /></div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <h2>Average time to resolve</h2>
          <div className="table-wrap">
            {resolution.length === 0 ? (
              <div className="empty">Nothing has been resolved yet.</div>
            ) : (
              <table>
                <thead>
                  <tr><th>Department</th><th className="num">Resolved</th><th className="num">Average hours</th></tr>
                </thead>
                <tbody>
                  {resolution.map((r) => (
                    <tr key={r.dept_name}>
                      <td>{r.dept_name}</td>
                      <td className="num">{r.resolved}</td>
                      <td className="num">{r.avg_hours}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>

        <div>
          <h2>Complaints by ward</h2>
          <div className="table-wrap">
            <table>
              <thead>
                <tr><th>Ward</th><th className="num">Total</th><th className="num">Open</th></tr>
              </thead>
              <tbody>
                {byWard.map((w) => (
                  <tr key={w.ward_number}>
                    <td>{w.ward_number} - {w.ward_name}</td>
                    <td className="num">{w.total}</td>
                    <td className="num">{w.open}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      <h2>Past deadline</h2>
      <p className="small muted">
        Complaints that cross their escalation time are escalated by the stored procedure sp_escalate_overdue.{' '}
        <ActionButton action="/api/admin/escalate">Run the check now</ActionButton>
      </p>
      <ComplaintTable rows={overdue} extra={['ward', 'department', 'reports']} emptyText="No complaint is past its deadline." />
    </>
  );
}
