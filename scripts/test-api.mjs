// End-to-end test cases. They call the running app's API and then look in the
// database to confirm what the triggers, constraints and transactions did.
//
//   1. npm run db:setup      (fresh demo data)
//   2. npm run dev           (in another terminal)
//   3. npm test
//
// The tests change data, so run db:setup again afterwards.

import { readFile, writeFile } from 'node:fs/promises';
import pg from 'pg';

const BASE = process.env.TEST_BASE_URL ?? 'http://localhost:3000';
const seed = await readFile(new URL('../db/03_seed.sql', import.meta.url), 'utf8');
const PASSWORD = seed.match(/SELECT '([^']+)'::TEXT AS pw/)[1]; // demo password from the seed file

const db = new pg.Client({ connectionString: process.env.DATABASE_URL });
await db.connect();
const one = async (text, params) => (await db.query(text, params)).rows[0];

/** A logged-in (or anonymous) API client that remembers its session cookie. */
function client() {
  let cookie = '';
  const call = async (path, body, method = 'POST') => {
    const res = await fetch(BASE + path, {
      method,
      redirect: 'manual',
      headers: { 'Content-Type': 'application/json', Cookie: cookie },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const setCookie = res.headers.get('set-cookie');
    if (setCookie) cookie = setCookie.split(';')[0];
    const text = await res.text();
    let data = null;
    try { data = JSON.parse(text); } catch { /* an HTML page */ }
    return { status: res.status, data, text, location: res.headers.get('location') };
  };
  return {
    post: (path, body) => call(path, body ?? {}, 'POST'),
    put: (path, body) => call(path, body, 'PUT'),
    del: (path) => call(path, undefined, 'DELETE'),
    get: (path) => call(path, undefined, 'GET'),
    login: (email, password = PASSWORD) => call('/api/auth/login', { email, password }),
  };
}

const results = [];
async function test(id, name, fn) {
  try {
    const detail = await fn();
    results.push({ id, test: name, result: 'PASS', detail: detail ?? '' });
  } catch (err) {
    results.push({ id, test: name, result: 'FAIL', detail: err.message });
  }
}
function expect(condition, message) {
  if (!condition) throw new Error(message);
}

const ward12 = (await one('SELECT ward_id FROM ward WHERE ward_number = 12')).ward_id;
const anon = client();
const citizen = client();
const officer = client();
const admin = client();

// ---------------- Authentication ----------------
await test('T01', 'Login with a wrong password is refused', async () => {
  const r = await anon.login('aarav@example.test', 'not-the-password');
  expect(r.status === 401, `expected 401, got ${r.status}`);
  return r.data.error;
});
await test('T02', 'SQL injection in the login form does not log in', async () => {
  const r = await anon.login("' OR '1'='1' --", "' OR '1'='1");
  expect(r.status === 401, `expected 401, got ${r.status}`);
});
await test('T03', 'API call without logging in is refused', async () => {
  const r = await anon.post('/api/complaints', { title: 'x' });
  expect(r.status === 401, `expected 401, got ${r.status}`);
});
await test('T04', 'Citizen, officer and admin can log in', async () => {
  for (const [c, email] of [[citizen, 'aarav@example.test'], [officer, 'roads@civicresolve.test'], [admin, 'admin@civicresolve.test']]) {
    const r = await c.login(email);
    expect(r.status === 200, `${email}: got ${r.status}`);
  }
});
await test('T05', 'Passwords are stored as bcrypt hashes, not text', async () => {
  const r = await one(`SELECT COUNT(*)::int AS n FROM app_user WHERE password_hash NOT LIKE '$2%'`);
  expect(r.n === 0, `${r.n} users without a bcrypt hash`);
});
await test('T06', 'Registration with a 5-digit phone is rejected by the CHECK constraint', async () => {
  const r = await client().post('/api/auth/register', { full_name: 'Test User', email: 'bad.phone@example.test', phone: '12345', password: 'longenough1', ward_id: ward12 });
  expect(r.status === 400, `expected 400, got ${r.status}`);
  return r.data.error;
});
await test('T07', 'Registration with an email already in use is rejected (UNIQUE)', async () => {
  const r = await client().post('/api/auth/register', { full_name: 'Copy Cat', email: 'aarav@example.test', password: 'longenough1', ward_id: ward12 });
  expect(r.status === 400, `expected 400, got ${r.status}`);
  return r.data.error;
});

// ---------------- Role-based access ----------------
await test('T08', 'Citizen opening an admin page is sent to the no-access page', async () => {
  const r = await citizen.get('/admin');
  expect(r.status === 307 && r.location.includes('/forbidden'), `status ${r.status}, location ${r.location}`);
});
await test('T09', 'Citizen cannot change a complaint status', async () => {
  const r = await citizen.post('/api/complaints/1/status', { status: 'RESOLVED', remarks: 'x' });
  expect(r.status === 403, `expected 403, got ${r.status}`);
});
await test('T10', 'Citizen cannot use the master-data API', async () => {
  const r = await citizen.post('/api/admin/master/ward', { ward_number: 500, ward_name: 'x', zone: 'y' });
  expect(r.status === 403, `expected 403, got ${r.status}`);
});
await test('T11', "Citizen cannot comment on another citizen's complaint", async () => {
  const r = await citizen.post('/api/complaints/4/comments', { body: 'hello' });
  expect(r.status === 403, `expected 403, got ${r.status}`);
});

// ---------------- Filing, deduplication, routing ----------------
await test('T12', 'Similar-report preview finds the pothole worded differently', async () => {
  const r = await citizen.post('/api/complaints/similar', { ward_id: ward12, title: 'Huge crater on 100 Feet Road by the metro pillar', description: 'Bikes are skidding because of a deep hole in the road near pillar 64.' });
  expect(r.status === 200 && r.data.matches.length > 0, 'no matches returned');
  expect(/pothole/i.test(r.data.matches[0].title), `top match was "${r.data.matches[0].title}"`);
  return `top match ${Math.round(r.data.matches[0].similarity * 100)}%: ${r.data.matches[0].title}`;
});
let duplicateId;
await test('T13', 'A duplicate complaint is merged and the report count goes up', async () => {
  const before = await one('SELECT cl.report_count FROM complaint c JOIN complaint_cluster cl USING (cluster_id) WHERE c.complaint_id = 1');
  const r = await citizen.post('/api/complaints', { ward_id: ward12, title: 'Huge pothole on 100 Feet Road at metro pillar 64', description: 'Deep pothole on 100 Feet Road next to metro pillar 64. Bikes swerve to avoid it and riders have fallen.' });
  expect(r.status === 200 && r.data.merged === true, `status ${r.status}, merged ${r.data?.merged}`);
  duplicateId = r.data.complaint_id;
  const after = await one('SELECT c.cluster_id, c.status, cl.report_count FROM complaint c JOIN complaint_cluster cl USING (cluster_id) WHERE c.complaint_id = $1', [duplicateId]);
  expect(after.report_count === before.report_count + 1, `count ${before.report_count} -> ${after.report_count}`);
  return `report count ${before.report_count} -> ${after.report_count}`;
});
await test('T14', 'A new kind of complaint gets its own cluster, category, deadline and vector', async () => {
  const r = await citizen.post('/api/complaints', { ward_id: ward12, title: 'Streetlight fused opposite the Domlur bus depot', description: 'The lamp post opposite Domlur bus depot has not been lighting up for a week and the stop is dark.', photo_url: 'https://example.com/lamp.jpg' });
  expect(r.status === 200 && r.data.merged === false, `status ${r.status}, merged ${r.data?.merged}`);
  const row = await one(
    `SELECT cat.category_name, c.sla_due_at, cl.report_count,
            (SELECT COUNT(*)::int FROM complaint_vector v WHERE v.complaint_id = c.complaint_id) AS vectors,
            (SELECT COUNT(*)::int FROM attachment a WHERE a.complaint_id = c.complaint_id) AS photos
     FROM complaint c JOIN category cat USING (category_id) JOIN complaint_cluster cl USING (cluster_id)
     WHERE c.complaint_id = $1`, [r.data.complaint_id]);
  expect(row.category_name === 'Streetlight not working', `routed to ${row.category_name}`);
  expect(row.sla_due_at && row.vectors === 1 && row.photos === 1 && row.report_count === 1, JSON.stringify(row));
  return `routed to "${row.category_name}"`;
});
await test('T15', 'A 3-letter title is rejected by the CHECK constraint', async () => {
  const r = await citizen.post('/api/complaints', { ward_id: ward12, title: 'abc', description: 'this description is long enough' });
  expect(r.status === 400, `expected 400, got ${r.status}`);
  return r.data.error;
});
await test('T16', 'Transaction rollback: a bad photo link leaves no half-saved complaint', async () => {
  const before = await one('SELECT (SELECT COUNT(*) FROM complaint)::int AS c, (SELECT COUNT(*) FROM complaint_cluster)::int AS cl, (SELECT COUNT(*) FROM complaint_vector)::int AS v');
  const r = await citizen.post('/api/complaints', { ward_id: ward12, title: 'Bench broken in the park', description: 'The bench near the park gate is broken and unsafe.', photo_url: 'ftp://not-allowed' });
  expect(r.status === 400, `expected 400, got ${r.status}`);
  const after = await one('SELECT (SELECT COUNT(*) FROM complaint)::int AS c, (SELECT COUNT(*) FROM complaint_cluster)::int AS cl, (SELECT COUNT(*) FROM complaint_vector)::int AS v');
  expect(before.c === after.c && before.cl === after.cl && before.v === after.v, `rows changed: ${JSON.stringify(before)} -> ${JSON.stringify(after)}`);
  return 'complaint, cluster and vector counts unchanged';
});
await test('T17', 'A ward that does not exist is rejected by the foreign key', async () => {
  const r = await citizen.post('/api/complaints', { ward_id: 99999, title: 'Valid title here', description: 'this description is long enough' });
  expect(r.status === 400, `expected 400, got ${r.status}`);
  return r.data.error;
});

// ---------------- Officer workflow, triggers ----------------
const roadOfficer = await one(`SELECT user_id FROM app_user WHERE email = 'roads@civicresolve.test'`);
await test('T18', 'Officer cannot take a complaint of another department', async () => {
  const other = await one(`SELECT c.complaint_id FROM complaint c JOIN category cat USING (category_id) JOIN department d USING (department_id) WHERE d.dept_name = 'Electrical' AND c.status = 'OPEN' LIMIT 1`);
  const r = await officer.post(`/api/complaints/${other.complaint_id}/assign`);
  expect(r.status === 403, `expected 403, got ${r.status}`);
});
await test('T19', 'Officer takes the pothole issue: assignment row is written', async () => {
  const r = await officer.post('/api/complaints/1/assign');
  expect(r.status === 200, `expected 200, got ${r.status}: ${r.data?.error}`);
  const a = await one('SELECT officer_id, assigned_by FROM assignment WHERE complaint_id = 1');
  expect(a.officer_id === roadOfficer.user_id, 'assignment row missing');
});
await test('T20', 'Status change without a remark is refused', async () => {
  const r = await officer.post('/api/complaints/1/status', { status: 'IN_PROGRESS', remarks: '' });
  expect(r.status === 400, `expected 400, got ${r.status}`);
});
await test('T21', 'Status change updates every report of the issue; trigger logs who and why', async () => {
  const r = await officer.post('/api/complaints/1/status', { status: 'IN_PROGRESS', remarks: 'Road crew scheduled for tonight' });
  expect(r.status === 200, `expected 200, got ${r.status}: ${r.data?.error}`);
  const members = await one(`SELECT COUNT(*)::int AS n, COUNT(*) FILTER (WHERE status = 'IN_PROGRESS')::int AS moved FROM complaint WHERE cluster_id = (SELECT cluster_id FROM complaint WHERE complaint_id = 1)`);
  expect(members.n === members.moved && members.n >= 4, JSON.stringify(members));
  const h = await one(`SELECT changed_by, remarks, old_status FROM status_history WHERE complaint_id = $1 ORDER BY history_id DESC LIMIT 1`, [duplicateId]);
  expect(h.changed_by === roadOfficer.user_id && h.remarks === 'Road crew scheduled for tonight', JSON.stringify(h));
  return `${members.n} reports moved, history written by trigger`;
});
await test('T22', 'Resolving sets resolved_at through the trigger', async () => {
  const r = await officer.post('/api/complaints/1/status', { status: 'RESOLVED', remarks: 'Pothole filled and levelled' });
  expect(r.status === 200, `expected 200, got ${r.status}`);
  const c = await one('SELECT resolved_at FROM complaint WHERE complaint_id = 1');
  expect(c.resolved_at !== null, 'resolved_at is still NULL');
});
await test('T23', 'Reports merged 3 or more times were raised to HIGH priority by the trigger', async () => {
  const r = await one(`SELECT COUNT(*)::int AS n FROM complaint c JOIN complaint_cluster cl USING (cluster_id) WHERE cl.report_count >= 3 AND c.priority <> 'HIGH'`);
  expect(r.n === 0, `${r.n} complaints not raised`);
});

// ---------------- Admin: constraints, audit, procedure ----------------
await test('T24', 'Duplicate ward number is rejected (UNIQUE)', async () => {
  const r = await admin.post('/api/admin/master/ward', { ward_number: 12, ward_name: 'Copy', zone: 'East' });
  expect(r.status === 400, `expected 400, got ${r.status}`);
  return r.data.error;
});
await test('T25', 'SLA with escalation earlier than resolution is rejected (CHECK)', async () => {
  const sla = await one('SELECT sla_id FROM sla_policy LIMIT 1');
  const r = await admin.put(`/api/admin/master/sla_policy/${sla.sla_id}`, { resolution_hours: 48, escalation_hours: 12 });
  expect(r.status === 400, `expected 400, got ${r.status}`);
  return r.data.error;
});
await test('T26', 'Deleting a department that still has categories is refused (FOREIGN KEY)', async () => {
  const d = await one(`SELECT department_id FROM department WHERE dept_name = 'Electrical'`);
  const r = await admin.del(`/api/admin/master/department/${d.department_id}`);
  expect(r.status === 400, `expected 400, got ${r.status}`);
  return r.data.error;
});
await test('T27', 'Add, edit and delete a ward; the audit trigger records all three with the admin', async () => {
  const adminRow = await one(`SELECT user_id FROM app_user WHERE email = 'admin@civicresolve.test'`);
  const before = await one(`SELECT COUNT(*)::int AS n FROM audit_log WHERE entity = 'ward' AND user_id = $1`, [adminRow.user_id]);
  expect((await admin.post('/api/admin/master/ward', { ward_number: 777, ward_name: 'Test Ward', zone: 'North' })).status === 200, 'insert failed');
  const w = await one('SELECT ward_id FROM ward WHERE ward_number = 777');
  expect((await admin.put(`/api/admin/master/ward/${w.ward_id}`, { ward_number: 777, ward_name: 'Renamed', zone: 'North' })).status === 200, 'update failed');
  expect((await admin.del(`/api/admin/master/ward/${w.ward_id}`)).status === 200, 'delete failed');
  const after = await one(`SELECT COUNT(*)::int AS n FROM audit_log WHERE entity = 'ward' AND user_id = $1`, [adminRow.user_id]);
  expect(after.n === before.n + 3, `audit rows ${before.n} -> ${after.n}`);
});
await test('T28', 'Admin separates a wrongly merged report into its own complaint', async () => {
  const before = await one('SELECT cluster_id, (SELECT report_count FROM complaint_cluster cl WHERE cl.cluster_id = c.cluster_id) AS n FROM complaint c WHERE complaint_id = 5');
  const r = await admin.post('/api/admin/clusters/split', { complaint_id: 5 });
  expect(r.status === 200, `expected 200, got ${r.status}: ${r.data?.error}`);
  const after = await one('SELECT c.cluster_id, cl.report_count, cl.representative_complaint_id FROM complaint c JOIN complaint_cluster cl USING (cluster_id) WHERE complaint_id = 5');
  const old = await one('SELECT report_count FROM complaint_cluster WHERE cluster_id = $1', [before.cluster_id]);
  expect(after.cluster_id !== before.cluster_id && after.representative_complaint_id === 5 && old.report_count === before.n - 1, JSON.stringify({ before, after, old }));
});
await test('T29', 'The first report of an issue cannot be separated', async () => {
  const r = await admin.post('/api/admin/clusters/split', { complaint_id: 4 });
  expect(r.status === 400, `expected 400, got ${r.status}`);
});
await test('T30', 'Stored procedure escalates a complaint past its escalation time', async () => {
  const target = await one(`SELECT complaint_id FROM complaint WHERE status = 'OPEN' ORDER BY created_at LIMIT 1`);
  await db.query(`UPDATE complaint SET created_at = NOW() - INTERVAL '30 days' WHERE complaint_id = $1`, [target.complaint_id]);
  const r = await admin.post('/api/admin/escalate');
  expect(r.status === 200 && r.data.escalated >= 1, `status ${r.status}, escalated ${r.data?.escalated}`);
  const c = await one('SELECT status, priority FROM complaint WHERE complaint_id = $1', [target.complaint_id]);
  expect(c.status === 'ESCALATED' && c.priority === 'HIGH', JSON.stringify(c));
  const h = await one('SELECT changed_by, remarks FROM status_history WHERE complaint_id = $1 ORDER BY history_id DESC LIMIT 1', [target.complaint_id]);
  expect(h.changed_by === null, 'escalation should be recorded as a system change');
  return `${r.data.escalated} escalated; history says: ${h.remarks}`;
});
await test('T31', 'Search by meaning: "road is dark at night" finds streetlight complaints first', async () => {
  const r = await admin.get('/admin/complaints?q=' + encodeURIComponent('road is dark at night'));
  expect(r.status === 200, `expected 200, got ${r.status}`);
  const firstRow = r.text.slice(r.text.indexOf('<tbody')).match(/<a href="\/complaints\/\d+">([^<]+)<\/a>/);
  expect(firstRow && /streetlight|dark|lamp/i.test(firstRow[1]), `first result: ${firstRow?.[1]}`);
  return `first result: ${firstRow[1]}`;
});
await test('T32', 'Every page opens for its role without a server error', async () => {
  const pages = [
    [citizen, ['/citizen/complaints', '/citizen/new', '/complaints/1']],
    [officer, ['/officer/queue', '/complaints/1']],
    [admin, ['/admin', '/admin/complaints', '/admin/clusters', '/admin/master?tab=app_user', '/admin/master?tab=category', '/admin/audit', '/complaints/4']],
  ];
  for (const [c, paths] of pages) {
    for (const p of paths) {
      const r = await c.get(p);
      expect(r.status === 200, `${p} returned ${r.status}`);
    }
  }
});

await db.end();
console.table(results);
if (process.env.TEST_REPORT) await writeFile(process.env.TEST_REPORT, JSON.stringify(results, null, 1));
const failed = results.filter((r) => r.result === 'FAIL').length;
console.log(`${results.length - failed} passed, ${failed} failed`);
process.exitCode = failed ? 1 : 0;
