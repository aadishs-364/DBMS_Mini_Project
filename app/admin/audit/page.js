import { query } from '@/lib/db';
import { requireRole } from '@/lib/auth';
import { formatDate } from '@/lib/format';

const ACTION_TEXT = { INSERT: 'Added', UPDATE: 'Changed', DELETE: 'Deleted' };

export default async function AuditLogPage() {
  await requireRole('ADMIN');

  // Rows are written by the fn_audit trigger, never by the application.
  const rows = await query(
    `SELECT a.log_id, a.action, a.entity, a.entity_id, a.created_at, u.full_name
     FROM audit_log a
     LEFT JOIN app_user u ON u.user_id = a.user_id
     ORDER BY a.created_at DESC, a.log_id DESC
     LIMIT 200`
  );

  return (
    <>
      <div className="page-head">
        <h1>Audit log</h1>
        <p className="muted">Changes to master data, users and assignments. Read-only, latest 200 entries.</p>
      </div>
      {rows.length === 0 ? (
        <div className="table-wrap empty">Nothing has been changed yet.</div>
      ) : (
        <div className="table-wrap">
          <table>
            <thead>
              <tr><th>When</th><th>Who</th><th>Action</th><th>Table</th><th className="num">Record no.</th></tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.log_id}>
                  <td className="small">{formatDate(r.created_at)}</td>
                  <td>{r.full_name ?? 'System / self-registration'}</td>
                  <td>{ACTION_TEXT[r.action] ?? r.action}</td>
                  <td>{r.entity}</td>
                  <td className="num">{r.entity_id}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
