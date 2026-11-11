import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { query } from '@/lib/db';
import { requireRole } from '@/lib/auth';
import { loadComplaint, canView } from '@/lib/complaints';
import { formatDate, statusLabel, dueText, isOverdue, isFinished } from '@/lib/format';
import ApiForm from '@/components/ApiForm';
import ActionButton from '@/components/ActionButton';

export default async function ComplaintPage({ params, searchParams }) {
  const user = await requireRole();
  const { id } = await params;
  const { filed } = await searchParams;

  const c = await loadComplaint(id);
  if (!c) notFound();
  if (!canView(user, c)) redirect('/forbidden');

  const staff = user.role !== 'CITIZEN';
  const isAssignee = c.officer_id === user.id;
  const canUpdate = user.role === 'ADMIN' || isAssignee;
  const canTake = user.role === 'OFFICER' && !c.officer_id && !isFinished(c.status);

  // independent queries, run together
  const [history, comments, attachments, members, officers] = await Promise.all([
    query(
      `SELECT h.old_status, h.new_status, h.remarks, h.changed_at, u.full_name
       FROM status_history h
       LEFT JOIN app_user u ON u.user_id = h.changed_by
       WHERE h.complaint_id = $1
       ORDER BY h.changed_at, h.history_id`,
      [c.complaint_id]
    ),
    // comments are shared by every report of the same issue
    query(
      `SELECT cm.comment_id, cm.body, cm.created_at, u.full_name, r.role_name
       FROM comment cm
       JOIN app_user u ON u.user_id = cm.author_id
       JOIN role r     ON r.role_id = u.role_id
       WHERE cm.complaint_id IN (SELECT complaint_id FROM complaint WHERE cluster_id = $1)
       ORDER BY cm.created_at`,
      [c.cluster_id]
    ),
    query('SELECT attachment_id, file_url FROM attachment WHERE complaint_id = $1', [c.complaint_id]),
    staff
      ? query(
          `SELECT m.complaint_id, m.title, m.created_at, u.full_name,
                  ROUND((1 - (v.embedding <=> rep.embedding))::numeric, 2) AS similarity
           FROM complaint m
           JOIN app_user u               ON u.user_id = m.citizen_id
           LEFT JOIN complaint_vector v   ON v.complaint_id = m.complaint_id
           LEFT JOIN complaint_vector rep ON rep.complaint_id = $2
           WHERE m.cluster_id = $1
           ORDER BY m.created_at`,
          [c.cluster_id, c.representative_complaint_id]
        )
      : [],
    user.role === 'ADMIN'
      ? query(
          `SELECT u.user_id, u.full_name, d.dept_name
           FROM app_user u
           JOIN role r ON r.role_id = u.role_id AND r.role_name = 'OFFICER'
           LEFT JOIN department d ON d.department_id = u.department_id
           ORDER BY (u.department_id = $1) DESC NULLS LAST, u.full_name`,
          [c.department_id]
        )
      : [],
  ]);

  const isDuplicate = c.representative_complaint_id !== c.complaint_id;

  return (
    <>
      {filed === 'merged' && (
        <div className="notice">
          This issue had already been reported, so your report was added to the existing complaint. It has now been
          reported by {c.report_count} citizens, which raises its priority.
        </div>
      )}
      {filed === 'new' && (
        <div className="notice">
          Complaint registered and sent to {c.dept_name ?? 'the municipal office'}. You can follow its progress on this
          page.
        </div>
      )}

      <div className="page-head">
        <p className="small muted">Complaint no. {c.complaint_id}</p>
        <h1>{c.title}</h1>
      </div>

      <div className="columns">
        <div>
          <div className="box">
            <dl className="details">
              <dt>Status</dt>
              <dd>
                <span className={`status ${c.status}`}>{statusLabel(c.status)}</span>
              </dd>
              <dt>Priority</dt>
              <dd>{c.priority.charAt(0) + c.priority.slice(1).toLowerCase()}</dd>
              <dt>Ward</dt>
              <dd>
                {c.ward_number} - {c.ward_name}
              </dd>
              <dt>Category</dt>
              <dd>{c.category_name ?? 'Not classified'}</dd>
              <dt>Department</dt>
              <dd>{c.dept_name ?? '-'}</dd>
              <dt>Officer</dt>
              <dd>{c.officer_name ?? 'Not assigned yet'}</dd>
              <dt>Reported by</dt>
              <dd>
                {c.citizen_name}
                {c.report_count > 1 && ` and ${c.report_count - 1} other citizen(s)`}
              </dd>
              <dt>Filed on</dt>
              <dd>{formatDate(c.created_at)}</dd>
              <dt>Deadline</dt>
              <dd className={isOverdue(c.sla_due_at, c.status) ? 'late' : undefined}>
                {formatDate(c.sla_due_at)}
                {!isFinished(c.status) && ` (${dueText(c.sla_due_at, c.status)})`}
              </dd>
              {c.resolved_at && (
                <>
                  <dt>Resolved on</dt>
                  <dd>{formatDate(c.resolved_at)}</dd>
                </>
              )}
            </dl>

            <h2>Description</h2>
            <p style={{ whiteSpace: 'pre-wrap' }}>{c.description}</p>

            {attachments.length > 0 && (
              <p>
                {attachments.map((a) => (
                  <a key={a.attachment_id} href={a.file_url} target="_blank" rel="noopener noreferrer">
                    View attached photo
                  </a>
                ))}
              </p>
            )}
            {isDuplicate && staff && (
              <p className="small muted">
                Merged into complaint{' '}
                <Link href={`/complaints/${c.representative_complaint_id}`}>no. {c.representative_complaint_id}</Link>,
                which is the one being worked on.
              </p>
            )}
          </div>

          <h2>Comments</h2>
          <div className="box">
            {comments.length === 0 && <p className="muted">No comments yet.</p>}
            {comments.map((cm) => (
              <div key={cm.comment_id} className="comment">
                <div className="small muted">
                  {cm.full_name} ({cm.role_name.toLowerCase()}) - {formatDate(cm.created_at)}
                </div>
                <div style={{ whiteSpace: 'pre-wrap' }}>{cm.body}</div>
              </div>
            ))}
            <ApiForm action={`/api/complaints/${c.complaint_id}/comments`} submitLabel="Add comment" reset>
              <label htmlFor="body">Add a comment</label>
              <textarea id="body" name="body" required style={{ minHeight: 70 }} />
            </ApiForm>
          </div>
        </div>

        <div>
          {canTake && (
            <div className="box" style={{ marginBottom: 18 }}>
              <p>Nobody is handling this complaint yet.</p>
              <ActionButton action={`/api/complaints/${c.complaint_id}/assign`} body={{}} className="">
                Take this complaint
              </ActionButton>
            </div>
          )}

          {user.role === 'ADMIN' && !isFinished(c.status) && (
            <div className="box" style={{ marginBottom: 18 }}>
              <h2 style={{ marginTop: 0 }}>Assign an officer</h2>
              <ApiForm action={`/api/complaints/${c.complaint_id}/assign`} submitLabel="Assign">
                <select name="officer_id" required defaultValue={c.officer_id ?? ''} aria-label="Officer">
                  <option value="" disabled>
                    Choose an officer
                  </option>
                  {officers.map((o) => (
                    <option key={o.user_id} value={o.user_id}>
                      {o.full_name} ({o.dept_name ?? 'no department'})
                    </option>
                  ))}
                </select>
              </ApiForm>
            </div>
          )}

          {staff && canUpdate && c.status !== 'CLOSED' && (
            <div className="box" style={{ marginBottom: 18 }}>
              <h2 style={{ marginTop: 0 }}>Update status</h2>
              <ApiForm action={`/api/complaints/${c.complaint_id}/status`} submitLabel="Save" reset>
                <select name="status" required defaultValue="" aria-label="New status">
                  <option value="" disabled>
                    Choose the new status
                  </option>
                  <option value="IN_PROGRESS">In progress</option>
                  <option value="RESOLVED">Resolved</option>
                  {user.role === 'ADMIN' && <option value="CLOSED">Closed</option>}
                  {user.role === 'ADMIN' && <option value="OPEN">Re-open</option>}
                </select>
                <label htmlFor="remarks">Remark</label>
                <textarea id="remarks" name="remarks" required style={{ minHeight: 70 }} placeholder="What was done" />
              </ApiForm>
            </div>
          )}

          <div className="box">
            <h2 style={{ marginTop: 0 }}>History</h2>
            <ol className="timeline">
              {history.map((h, i) => (
                <li key={i}>
                  <strong>
                    {h.old_status ? `${statusLabel(h.old_status)} → ${statusLabel(h.new_status)}` : statusLabel(h.new_status)}
                  </strong>
                  <div className="small muted">
                    {formatDate(h.changed_at)} - {h.full_name ?? 'System'}
                  </div>
                  {h.remarks && <div>{h.remarks}</div>}
                </li>
              ))}
            </ol>
          </div>
        </div>
      </div>

      {staff && members.length > 1 && (
        <>
          <h2>All reports of this issue ({members.length})</h2>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>No.</th>
                  <th>Title as written by the citizen</th>
                  <th>Reported by</th>
                  <th>Filed</th>
                  <th className="num">Match with first report</th>
                  {user.role === 'ADMIN' && <th></th>}
                </tr>
              </thead>
              <tbody>
                {members.map((m) => {
                  const first = m.complaint_id === c.representative_complaint_id;
                  return (
                    <tr key={m.complaint_id}>
                      <td>
                        <Link href={`/complaints/${m.complaint_id}`}>{m.complaint_id}</Link>
                      </td>
                      <td>{m.title}</td>
                      <td>{m.full_name}</td>
                      <td className="small">{formatDate(m.created_at)}</td>
                      <td className="num">
                        {first ? 'first report' : m.similarity == null ? '-' : `${Math.round(m.similarity * 100)}%`}
                      </td>
                      {user.role === 'ADMIN' && (
                        <td>
                          {!first && (
                            <ActionButton
                              action="/api/admin/clusters/split"
                              body={{ complaint_id: m.complaint_id }}
                              confirmText="Separate this report into its own complaint?"
                            >
                              Not a duplicate
                            </ActionButton>
                          )}
                        </td>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </>
      )}
    </>
  );
}
