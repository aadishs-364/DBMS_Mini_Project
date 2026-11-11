// A local PostgreSQL for development, with nothing to install:
//   npm run db:local        (leave it running in its own terminal)
//
// It runs PGlite - PostgreSQL compiled to WebAssembly - with the pgvector and
// pgcrypto extensions, and listens on 127.0.0.1:5433 like a normal server.
// Data is kept in the .localdb folder. For the final demo you can point
// DATABASE_URL at a hosted PostgreSQL (Neon, Supabase) instead; no code changes.

import { PGlite } from '@electric-sql/pglite';
import { vector } from '@electric-sql/pglite-pgvector';
import { pgcrypto } from '@electric-sql/pglite/contrib/pgcrypto';
import { PGLiteSocketServer } from '@electric-sql/pglite-socket';

const PORT = Number(process.env.LOCAL_DB_PORT ?? 5433);

const db = await PGlite.create({
  dataDir: new URL('../.localdb', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'),
  extensions: { vector, pgcrypto },
});
const server = new PGLiteSocketServer({ db, port: PORT, host: '127.0.0.1', maxConnections: 10 });
await server.start();

const { rows } = await db.query('SELECT version()');
console.log(rows[0].version.split(' on ')[0]);
console.log(`Local database ready on 127.0.0.1:${PORT}. Press Ctrl+C to stop.`);

process.on('SIGINT', async () => {
  await server.stop();
  await db.close();
  process.exit(0);
});
