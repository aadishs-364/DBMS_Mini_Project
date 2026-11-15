// Creates the whole database from scratch and loads demo data.
//   npm run db:setup
// WARNING: this drops and recreates every CivicResolve table.

import { readFile } from 'node:fs/promises';
import pg from 'pg';
import { embedForDb } from '../lib/embed.mjs';
import { SAMPLE_COMPLAINTS } from './sample-complaints.mjs';

if (!process.env.DATABASE_URL) {
  console.error('DATABASE_URL is not set. Copy .env.example to .env.local and fill it in.');
  process.exit(1);
}

const THRESHOLD = Number(process.env.DEDUP_THRESHOLD ?? 0.7);
const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
await client.connect();

const sqlFile = (name) => readFile(new URL(`../db/${name}`, import.meta.url), 'utf8');
const one = async (text, params) => (await client.query(text, params)).rows[0];

try {
  // ---- 1. schema, functions/triggers, master data ----
  for (const file of ['01_schema.sql', '02_functions_triggers.sql', '03_seed.sql']) {
    await client.query(await sqlFile(file));
    console.log(`ran db/${file}`);
  }

  // ---- 2. category embeddings (what complaints are routed against) ----
  const categories = (await client.query('SELECT category_id, category_name, description FROM category')).rows;
  for (const c of categories) {
    const vector = await embedForDb(`${c.category_name}: ${c.description}`);
    await client.query('UPDATE category SET embedding = $1::vector WHERE category_id = $2', [vector, c.category_id]);
  }
  console.log(`embedded ${categories.length} categories\n`);

  // ---- 3. file the sample complaints through the database function ----
  const admin = await one(
    `SELECT user_id FROM app_user WHERE role_id = (SELECT role_id FROM role WHERE role_name = 'ADMIN') LIMIT 1`
  );
  const followUps = [];

  for (const s of SAMPLE_COMPLAINTS) {
    const citizen = await one('SELECT user_id FROM app_user WHERE email = $1', [s.by]);
    const ward = await one('SELECT ward_id FROM ward WHERE ward_number = $1', [s.ward]);
    const vector = await embedForDb(`${s.title}. ${s.description}`);

    await client.query('BEGIN');
    const r = await one('SELECT * FROM fn_file_complaint($1, $2, $3, $4, $5::vector, $6)', [
      citizen.user_id, ward.ward_id, s.title, s.description, vector, THRESHOLD,
    ]);
    // back-date it so the dashboard has deadlines that are already missed
    await client.query(
      `UPDATE complaint SET created_at = NOW() - make_interval(hours => $2) WHERE complaint_id = $1`,
      [r.new_complaint_id, s.hoursAgo]
    );
    await client.query(
      `UPDATE status_history SET changed_at = NOW() - make_interval(hours => $2) WHERE complaint_id = $1`,
      [r.new_complaint_id, s.hoursAgo]
    );
    await client.query('COMMIT');

    const best = r.best_similarity == null ? 'none' : Number(r.best_similarity).toFixed(2);
    console.log(
      `#${String(r.new_complaint_id).padEnd(3)} ${r.merged ? 'MERGED' : 'new   '} (closest match in ward: ${best})  ${s.title}`
    );
    if (s.then && !r.merged) followUps.push({ id: r.new_complaint_id, cluster: r.new_cluster_id, then: s.then });
  }

  // ---- 4. some officer activity, so every status appears in the demo ----
  const setStatus = async (userId, cluster, status, remarks) => {
    await client.query('BEGIN');
    await client.query("SELECT set_config('app.user_id', $1, true), set_config('app.remarks', $2, true)", [
      String(userId), remarks,
    ]);
    await client.query('UPDATE complaint SET status = $1 WHERE cluster_id = $2', [status, cluster]);
    await client.query('COMMIT');
  };

  for (const f of followUps) {
    const officer = await one(
      `SELECT u.user_id, u.full_name
       FROM complaint c
       JOIN category cat ON cat.category_id = c.category_id
       JOIN app_user u   ON u.department_id = cat.department_id
       WHERE c.complaint_id = $1
       LIMIT 1`,
      [f.id]
    );
    if (!officer) continue;

    await client.query('INSERT INTO assignment (complaint_id, officer_id, assigned_by) VALUES ($1, $2, $3)', [
      f.id, officer.user_id, admin.user_id,
    ]);
    await setStatus(admin.user_id, f.cluster, 'ASSIGNED', `Assigned to ${officer.full_name}`);
    if (f.then === 'progress' || f.then === 'resolve') {
      await setStatus(officer.user_id, f.cluster, 'IN_PROGRESS', 'Inspected the spot, work scheduled');
      await client.query('INSERT INTO comment (complaint_id, author_id, body) VALUES ($1, $2, $3)', [
        f.id, officer.user_id, 'Our team has visited the location. Work will start shortly.',
      ]);
    }
    if (f.then === 'resolve') {
      await setStatus(officer.user_id, f.cluster, 'RESOLVED', 'Work completed and checked on site');
    }
  }

  // ---- 5. escalate whatever is past its escalation time ----
  await client.query('CALL sp_escalate_overdue()');
  await client.query('DELETE FROM audit_log'); // start the demo with an empty audit log

  const summary = (await client.query('SELECT status, COUNT(*)::int AS n FROM complaint GROUP BY status ORDER BY status')).rows;
  const clusters = await one('SELECT COUNT(*)::int AS n FROM complaint_cluster WHERE report_count > 1');
  console.log('\nComplaints by status:', summary.map((r) => `${r.status}=${r.n}`).join(', '));
  console.log(`Issues reported more than once: ${clusters.n} (expected 6 with the sample data)`);
  if (clusters.n !== 6) {
    console.log(
      'Not 5: look at the "closest match" numbers above and adjust DEDUP_THRESHOLD in .env.local,\n' +
        'then run this script again. Duplicates should score above the threshold, unrelated complaints below it.'
    );
  }
  console.log('\nDone. Demo logins are listed in db/03_seed.sql.');
} catch (err) {
  await client.query('ROLLBACK').catch(() => {});
  console.error('\nSetup failed:', err.message);
  process.exitCode = 1;
} finally {
  await client.end();
}
