import Link from 'next/link';
import { query } from '@/lib/db';
import { requireRole } from '@/lib/auth';
import { formatDate, statusLabel } from '@/lib/format';

export default async function ClustersPage() {
  await requireRole('ADMIN');

  // Issues reported by more than one citizen, with how closely the reports match.
  const clusters = await query(
    `SELECT cl.cluster_id, cl.report_count, cl.representative_complaint_id,
            rep.title, rep.status, rep.created_at, w.ward_name, cat.category_name,
            ROUND(MIN(1 - (v.embedding <=> rv.embedding))::numeric, 2) AS weakest_match
     FROM complaint_cluster cl
     JOIN complaint rep        ON rep.complaint_id = cl.representative_complaint_id
     JOIN ward w               ON w.ward_id = rep.ward_id
     LEFT JOIN category cat    ON cat.category_id = rep.category_id
     JOIN complaint m          ON m.cluster_id = cl.cluster_id AND m.complaint_id <> rep.complaint_id
     JOIN complaint_vector v   ON v.complaint_id = m.complaint_id
     JOIN complaint_vector rv  ON rv.complaint_id = rep.complaint_id
     WHERE cl.report_count > 1
     GROUP BY cl.cluster_id, rep.complaint_id, w.ward_name, cat.category_name
     ORDER BY cl.report_count DESC, rep.created_at DESC`
  );

  return (
    <>
      <div className="page-head">
        <h1>Duplicate reports</h1>
        <p className="muted">
          Issues that several citizens reported and the system merged. Open one to see every report and to separate a
          report that was merged by mistake.
        </p>
      </div>

      {clusters.length === 0 ? (
        <div className="table-wrap empty">No issue has been reported more than once yet.</div>
      ) : (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Issue (first report)</th>
                <th>Ward</th>
                <th>Category</th>
                <th>Status</th>
                <th className="num">Reports</th>
                <th className="num">Weakest match</th>
                <th>First reported</th>
              </tr>
            </thead>
            <tbody>
              {clusters.map((cl) => (
                <tr key={cl.cluster_id}>
                  <td>
                    <Link href={`/complaints/${cl.representative_complaint_id}`}>{cl.title}</Link>
                  </td>
                  <td>{cl.ward_name}</td>
                  <td>{cl.category_name ?? '-'}</td>
                  <td>
                    <span className={`status ${cl.status}`}>{statusLabel(cl.status)}</span>
                  </td>
                  <td className="num">{cl.report_count}</td>
                  <td className="num">{Math.round(cl.weakest_match * 100)}%</td>
                  <td className="small">{formatDate(cl.created_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
