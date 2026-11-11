# CivicResolve

Grievance deduplication and smart routing for urban local bodies.
DBMS Experiential Learning, Level 3 project.

| Team member | SRN |
|---|---|
| Aadish Sarin | PES2UG24CS007 |
| Aditya Alur | PES2UG24CS052 |

## What it does

Citizens report civic problems (potholes, dead streetlights, water leaks) in their own words.
Municipal portals usually get the same problem from many people, and complaints often land in
the wrong department. CivicResolve:

- **merges duplicates** - a new complaint is compared, by meaning, with open complaints in the
  same ward. If it matches, it joins that complaint's cluster and raises its "reported by N
  citizens" count instead of becoming a second ticket.
- **routes automatically** - the complaint goes to the category (and so the department) whose
  description it is closest to. The citizen never picks a department.
- **enforces deadlines** - each category has an SLA. Complaints past their escalation time are
  escalated by a stored procedure.

## Stack

| Layer | Technology |
|---|---|
| Frontend | Next.js (App Router), React, plain CSS |
| Backend / API | Next.js Route Handlers under `app/api` |
| Relational database | PostgreSQL |
| Vector database | pgvector extension in the same PostgreSQL |
| Embeddings | `all-MiniLM-L6-v2` (384 dimensions) run locally with Transformers.js |
| Auth | bcrypt password hashes, signed httpOnly session cookie, 3 roles |

**Why PostgreSQL + pgvector:** users, wards, complaints, assignments and history are structured
and need foreign keys and transactions, so they are relational. Complaint text is free text
where the same problem is worded differently every time, so matching needs vector similarity.
Keeping both in one database means one transaction can insert the complaint, store its vector
and update the cluster count together.

## Folder guide

```
db/01_schema.sql              tables, constraints, indexes, view (DDL)
db/02_functions_triggers.sql  4 triggers, fn_file_complaint(), sp_escalate_overdue()
db/03_seed.sql                master data and demo users (DML)
db/04_report_queries.sql      queries to run and screenshot for the report
scripts/local-db.mjs          local PostgreSQL for development (npm run db:local)
scripts/setup-db.mjs          builds the database and files the sample complaints
scripts/test-api.mjs          32 end-to-end test cases (npm test)
lib/                          db connection, auth, embeddings, shared SQL
app/api/                      backend routes (all writes go through these)
app/                          pages: login, citizen, officer, admin
components/                   forms and tables used by the pages
docs/                         report, diagrams, screenshots, design document
```

## Setup

You need Node.js 20.6 or newer. Nothing else has to be installed.

1. Install packages
   ```bash
   npm install
   ```
2. Create `.env.local` from the example and set `SESSION_SECRET` to any random string of 32 or
   more characters
   ```bash
   cp .env.example .env.local
   ```
3. Start the local database and leave it running in its own terminal
   ```bash
   npm run db:local
   ```
4. In a second terminal, build the tables and load the demo data. The first run downloads the
   embedding model (about 25 MB).
   ```bash
   npm run db:setup
   ```
   The script prints, for every sample complaint, whether it was merged and its closest match
   score. With the sample data, 5 issues end up reported more than once.
5. Start the app and open http://localhost:3000
   ```bash
   npm run dev
   ```

Demo accounts (one admin, four officers, six citizens) and their password are in
`db/03_seed.sql`.

### Using a hosted PostgreSQL instead

The local database is PostgreSQL 18 compiled to WebAssembly (PGlite) with pgvector. To use a
normal PostgreSQL server (for example a free Neon or Supabase project), put its connection
string in `DATABASE_URL`, remove `DATABASE_POOL_MAX`, skip step 3 and run step 4 again. No code
changes are needed; the `vector` and `pgcrypto` extensions must be available.

## Tests

With the database and the app running:

```bash
npm test
```

This runs 32 end-to-end cases (login, roles, deduplication, routing, constraints, triggers,
transactions, stored procedure, search by meaning) and prints a pass/fail table. The tests
change data, so run `npm run db:setup` again afterwards.

## Documents

| File | What it is |
|---|---|
| `docs/CivicResolve_DBMS_Project_Report.docx` (and `.pdf`) | The project report |
| `docs/diagrams/` | ER diagram, relational schema, system architecture |
| `docs/screenshots/` | Screens of the running application |
| `docs/CivicResolve_DBMS_Level3_Submission.md` | The first design document |

## Where each DBMS concept is

| Concept | Where |
|---|---|
| CREATE / ALTER / DROP, keys, constraints | `db/01_schema.sql` |
| Indexes (B-tree, partial, HNSW vector) | `db/01_schema.sql` |
| View | `v_department_open_load`, shown on the admin dashboard |
| Triggers | SLA deadline + resolved time, status history, priority bump, audit log |
| Function | `fn_file_complaint()` - dedup, routing, insert, all in one call |
| Stored procedure | `sp_escalate_overdue()` - "Run the check now" on the dashboard |
| Transactions | `withTransaction()` in `lib/db.js`: filing, assigning, status change, un-merging |
| Vector similarity search | filing a complaint, "Has this been reported already?", admin search |
| JOIN, GROUP BY, HAVING, aggregates, subqueries | admin dashboard, officer queue, `db/04_report_queries.sql` |
| Validation at database level | CHECK / UNIQUE / FK constraints; the Master data screen shows the refusal |
| Roles | Citizen, Officer, Admin - checked on every page and every API route |

## Security notes

- Passwords are stored only as bcrypt hashes.
- Database credentials and the session secret live in `.env.local`, which is git-ignored.
- Every query uses parameters; table and column names never come from the request.
- The session cookie is httpOnly and signed; role checks happen on the server.

## Known limits

- Photos are attached as a link, not uploaded.
- Escalation runs when an admin presses the button. A production system would schedule it
  (for example with `pg_cron`).
