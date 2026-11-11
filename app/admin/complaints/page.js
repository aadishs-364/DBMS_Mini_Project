import { query } from '@/lib/db';
import { requireRole } from '@/lib/auth';
import { embedForDb } from '@/lib/embed.mjs';
import { STATUSES, statusLabel } from '@/lib/format';
import ComplaintTable from '@/components/ComplaintTable';

export default async function AdminComplaintsPage({ searchParams }) {
  await requireRole('ADMIN');
  const { ward = '', department = '', status = '', q = '' } = await searchParams;

  const [wards, departments] = await Promise.all([
    query('SELECT ward_id, ward_number, ward_name FROM ward ORDER BY ward_number'),
    query('SELECT department_id, dept_name FROM department ORDER BY dept_name'),
  ]);

  // Build the WHERE clause from whichever filters are set. Values are always parameters.
  const where = [];
  const params = [];
  if (Number(ward)) {
    params.push(Number(ward));
    where.push(`c.ward_id = $${params.length}`);
  }
  if (Number(department)) {
    params.push(Number(department));
    where.push(`d.department_id = $${params.length}`);
  }
  if (STATUSES.includes(status)) {
    params.push(status);
    where.push(`c.status = $${params.length}`);
  }

  // Search by meaning: embed the search text and order by cosine distance (pgvector).
  const search = q.trim();
  let similarity = 'NULL::numeric AS similarity';
  let orderBy = 'c.created_at DESC';
  if (search) {
    params.push(await embedForDb(search));
    similarity = `ROUND((1 - (v.embedding <=> $${params.length}::vector))::numeric, 2) AS similarity`;
    orderBy = `v.embedding <=> $${params.length}::vector`;
    where.push('v.embedding IS NOT NULL');
  }

  const complaints = await query(
    `SELECT c.complaint_id, c.title, c.status, c.priority, c.created_at, c.sla_due_at,
            w.ward_name, cat.category_name, d.dept_name, cit.full_name AS citizen_name,
            cl.report_count, ${similarity}
     FROM complaint c
     JOIN ward w              ON w.ward_id = c.ward_id
     JOIN app_user cit        ON cit.user_id = c.citizen_id
     LEFT JOIN category cat   ON cat.category_id = c.category_id
     LEFT JOIN department d   ON d.department_id = cat.department_id
     LEFT JOIN complaint_cluster cl ON cl.cluster_id = c.cluster_id
     LEFT JOIN complaint_vector v   ON v.complaint_id = c.complaint_id
     ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
     ORDER BY ${orderBy}
     LIMIT ${search ? 20 : 200}`,
    params
  );

  return (
    <>
      <div className="page-head">
        <h1>All complaints</h1>
        <p className="muted">
          The search box finds complaints by meaning, not exact words: &quot;road is dark at night&quot; also finds
          streetlight complaints.
        </p>
      </div>

      <form className="filters" method="get">
        <div style={{ flex: 2 }}>
          <label htmlFor="q">Search by meaning</label>
          <input id="q" name="q" defaultValue={q} placeholder="Describe the problem" />
        </div>
        <div>
          <label htmlFor="ward">Ward</label>
          <select id="ward" name="ward" defaultValue={ward}>
            <option value="">All</option>
            {wards.map((w) => (
              <option key={w.ward_id} value={w.ward_id}>{w.ward_number} - {w.ward_name}</option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="department">Department</label>
          <select id="department" name="department" defaultValue={department}>
            <option value="">All</option>
            {departments.map((d) => (
              <option key={d.department_id} value={d.department_id}>{d.dept_name}</option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="status">Status</label>
          <select id="status" name="status" defaultValue={status}>
            <option value="">All</option>
            {STATUSES.map((s) => (
              <option key={s} value={s}>{statusLabel(s)}</option>
            ))}
          </select>
        </div>
        <button type="submit" className="plain">Apply</button>
      </form>

      <p className="small muted">
        {complaints.length} complaint(s){search ? ', closest match first' : ''}. Open a complaint to assign an officer.
      </p>
      <ComplaintTable
        rows={complaints}
        extra={search ? ['ward', 'department', 'citizen', 'similarity'] : ['ward', 'department', 'citizen', 'reports']}
      />
    </>
  );
}
