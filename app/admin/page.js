import { query } from '@/lib/db';
import { requireRole } from '@/lib/auth';
import { LIST_SQL } from '@/lib/complaints';
import ComplaintTable from '@/components/ComplaintTable';
import ActionButton from '@/components/ActionButton';

export default async function AdminDashboardPage() {
  await requireRole('ADMIN');

  const [totals, deptLoad, byWard, resolution, overdue, last7, workload] = await Promise.all([
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
    query(
      `SELECT d::date AS day, COUNT(c.complaint_id)::int AS complaints
       FROM generate_series(CURRENT_DATE - 6, CURRENT_DATE, INTERVAL '1 day') AS d
       LEFT JOIN complaint c ON c.created_at::date = d::date
       GROUP BY d
       ORDER BY d`
    ),
    query('SELECT * FROM v_officer_workload'),
  ]);

  const t = totals[0];
  const chartMax = Math.max(1, ...last7.map((d) => Number(d.complaints)));
  const colors = ['#2563eb', '#8b5cf6', '#14b8a6', '#f59e0b', '#ef4444', '#ec4899'];
  const totalOpen = deptLoad.reduce((sum, d) => sum + Number(d.open_complaints), 0);
  let angle = 0;
  const donutStops = deptLoad.map((d, i) => {
    const next = angle + (totalOpen ? Number(d.open_complaints) / totalOpen : 1 / Math.max(1, deptLoad.length)) * 360;
    const stop = `${colors[i % colors.length]} ${angle}deg ${next}deg`;
    angle = next;
    return stop;
  }).join(', ');
  const points = last7.map((d, i) => `${(i / Math.max(1, last7.length - 1)) * 100},${100 - (Number(d.complaints) / chartMax) * 84 - 8}`).join(' ');

  return (
    <>
      <div className="page-head">
        <h1>Dashboard</h1>
        <p className="muted">Live figures from the database.</p>
      </div>

      <div className="stats">
        <div className="stat"><span className="stat-icon">◉</span><b>{t.total}</b><span>Reports received</span></div>
        <div className="stat"><span className="stat-icon">◌</span><b>{t.open}</b><span>Open</span></div>
        <div className="stat"><span className="stat-icon">!</span><b>{t.escalated}</b><span>Escalated</span></div>
        <div className="stat"><span className="stat-icon">✓</span><b>{t.resolved_today}</b><span>Resolved today</span></div>
        <div className="stat"><span className="stat-icon">↗</span><b>{t.duplicate_clusters}</b><span>Issues reported more than once</span></div>
        <div className="stat"><span className="stat-icon">↘</span><b>{t.tickets_saved}</b><span>Duplicate tickets avoided</span></div>
      </div>

      <div className="columns" style={{ marginTop: 6 }}>
        <div>
          <h2>Open complaints by department</h2>
          <div className="box chart-card donut-layout">
            <div className="donut" style={{ background: `conic-gradient(${donutStops || '#dbeafe 0 360deg'})` }} />
            <div className="legend">
              {deptLoad.map((d, i) => <span key={d.department_id}><i style={{ background: colors[i % colors.length] }} />{d.dept_name} <strong>{d.open_complaints}</strong></span>)}
            </div>
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

      <div className="columns" style={{ marginTop: 6 }}>
        <div>
          <h2>Complaints filed, last 7 days</h2>
          <div className="box chart-card">
            <svg className="area-chart" viewBox="0 0 100 110" preserveAspectRatio="none" role="img" aria-label="Complaints filed over the last seven days">
              <polyline points={`0,102 ${points} 100,102`} fill="#dbeafe" opacity=".8" />
              <polyline points={points} fill="none" stroke="#2563eb" strokeWidth="1.8" vectorEffect="non-scaling-stroke" />
              {last7.map((d, i) => <text key={d.day} x={(i / Math.max(1, last7.length - 1)) * 100} y="108" textAnchor="middle" fontSize="4" fill="#64748b">{new Date(d.day).toLocaleDateString(undefined, { weekday: 'short' })}</text>)}
            </svg>
          </div>
        </div>
        <div>
          <h2>Officer workload</h2>
          <div className="table-wrap">
            <table>
              <thead><tr><th>Officer</th><th>Department</th><th className="num">Open</th><th className="num">Past deadline</th></tr></thead>
              <tbody>{workload.map((o) => <tr key={o.officer_id}><td>{o.officer_name}</td><td>{o.dept_name ?? '-'}</td><td className="num">{o.open_complaints}</td><td className={`num ${Number(o.overdue_complaints) ? 'late' : ''}`}>{o.overdue_complaints}</td></tr>)}</tbody>
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
