import { Pool } from 'pg';

// One pool for the whole server. In dev, Next reloads modules often, so the
// pool is kept on globalThis to avoid opening a new one on every reload.
const pool =
  globalThis._civicPool ??
  new Pool({ connectionString: process.env.DATABASE_URL, max: Number(process.env.DATABASE_POOL_MAX ?? 5) });
globalThis._civicPool = pool;

/** Run one parameterised query and return its rows. */
export async function query(text, params = []) {
  const result = await pool.query(text, params);
  return result.rows;
}

/**
 * Run several statements as one transaction.
 * userId is handed to the database (app.user_id) so that the triggers can
 * record who made the change. remarks (optional) goes into status_history.
 */
export async function withTransaction(userId, fn, remarks = '') {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query(
      "SELECT set_config('app.user_id', $1, true), set_config('app.remarks', $2, true)",
      [userId ? String(userId) : '', remarks]
    );
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

/** Turn a PostgreSQL constraint error into a message a user can read. */
export function dbErrorMessage(err) {
  const name = err.constraint ? ` (${err.constraint})` : '';
  switch (err.code) {
    case '23505':
      return `That value already exists${name}.`;
    case '23503':
      return `This record is linked to other records, so the database refused the change${name}.`;
    case '23514':
      return `The database rejected a value that breaks a rule${name}.`;
    case '23502':
      return `A required field is missing (${err.column}).`;
    case '22P02':
    case '22001':
      return 'One of the values has the wrong format or is too long.';
    default:
      return null;
  }
}
