-- ============================================================
-- CivicResolve - schema (PostgreSQL 15+ with pgvector)
-- Run order: 01_schema.sql -> 02_functions_triggers.sql -> 03_seed.sql
-- ============================================================

-- Clean start (DROP)
DROP VIEW  IF EXISTS v_department_open_load;
DROP VIEW  IF EXISTS v_officer_workload;
DROP TABLE IF EXISTS audit_log, comment, attachment, status_history,
                     assignment, complaint_vector, complaint,
                     complaint_cluster, sla_policy, category,
                     department, app_user, ward, role CASCADE;

CREATE EXTENSION IF NOT EXISTS vector;     -- pgvector: vector type + similarity operators
CREATE EXTENSION IF NOT EXISTS pgcrypto;   -- crypt()/gen_salt() for bcrypt hashes in the seed

-- ---------- Master tables ----------
CREATE TABLE role (
    role_id   SERIAL PRIMARY KEY,
    role_name VARCHAR(20) NOT NULL UNIQUE
              CHECK (role_name IN ('CITIZEN','OFFICER','ADMIN'))
);

CREATE TABLE ward (
    ward_id     SERIAL PRIMARY KEY,
    ward_number INT NOT NULL UNIQUE CHECK (ward_number > 0),
    ward_name   VARCHAR(80) NOT NULL,
    zone        VARCHAR(40) NOT NULL
);

CREATE TABLE department (
    department_id SERIAL PRIMARY KEY,
    dept_name     VARCHAR(80) NOT NULL UNIQUE,
    description   VARCHAR(255)
);

CREATE TABLE category (
    category_id   SERIAL PRIMARY KEY,
    category_name VARCHAR(80) NOT NULL,
    description   TEXT,                    -- typical wording of complaints in this category
    department_id INT NOT NULL,
    embedding     vector(384),             -- embedding of name + description, used for routing
    CONSTRAINT fk_category_dept
        FOREIGN KEY (department_id) REFERENCES department(department_id),
    CONSTRAINT uq_category UNIQUE (category_name, department_id)
);

CREATE TABLE sla_policy (
    sla_id           SERIAL PRIMARY KEY,
    category_id      INT NOT NULL UNIQUE,
    resolution_hours INT NOT NULL CHECK (resolution_hours > 0),
    escalation_hours INT NOT NULL CHECK (escalation_hours > 0),
    CONSTRAINT fk_sla_category
        FOREIGN KEY (category_id) REFERENCES category(category_id) ON DELETE CASCADE,
    CONSTRAINT chk_escalation_after_resolution
        CHECK (escalation_hours >= resolution_hours)
);

-- ---------- Users ----------
CREATE TABLE app_user (
    user_id       SERIAL PRIMARY KEY,
    full_name     VARCHAR(100) NOT NULL CHECK (length(trim(full_name)) >= 2),
    email         VARCHAR(120) NOT NULL UNIQUE
                  CHECK (email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
    phone         VARCHAR(15)  CHECK (phone ~ '^[0-9]{10}$'),
    password_hash VARCHAR(255) NOT NULL,   -- bcrypt hash, never the password itself
    role_id       INT NOT NULL,
    ward_id       INT,                     -- home ward (citizen) / posting ward (officer)
    created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT fk_user_role FOREIGN KEY (role_id) REFERENCES role(role_id),
    CONSTRAINT fk_user_ward FOREIGN KEY (ward_id) REFERENCES ward(ward_id)
);

-- ALTER: officers also belong to a department, so routed complaints reach the right desk
ALTER TABLE app_user
    ADD COLUMN department_id INT,
    ADD CONSTRAINT fk_user_department
        FOREIGN KEY (department_id) REFERENCES department(department_id);

-- ---------- Clusters (one row per real-world issue) ----------
CREATE TABLE complaint_cluster (
    cluster_id                  SERIAL PRIMARY KEY,
    representative_complaint_id INT,       -- first complaint of the cluster; FK added below
    report_count                INT NOT NULL DEFAULT 1 CHECK (report_count >= 1),
    centroid_summary            TEXT,
    created_at                  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ---------- Complaints ----------
CREATE TABLE complaint (
    complaint_id SERIAL PRIMARY KEY,
    title        VARCHAR(150) NOT NULL CHECK (length(trim(title)) >= 5),
    description  TEXT NOT NULL CHECK (length(trim(description)) >= 10),
    citizen_id   INT NOT NULL,
    ward_id      INT NOT NULL,
    category_id  INT,                      -- set by semantic routing
    cluster_id   INT,
    status       VARCHAR(20) NOT NULL DEFAULT 'OPEN'
                 CHECK (status IN ('OPEN','ASSIGNED','IN_PROGRESS','RESOLVED','CLOSED','ESCALATED')),
    priority     VARCHAR(10) NOT NULL DEFAULT 'MEDIUM'
                 CHECK (priority IN ('LOW','MEDIUM','HIGH')),
    created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    sla_due_at   TIMESTAMPTZ,              -- filled by trigger from sla_policy
    resolved_at  TIMESTAMPTZ,              -- filled by trigger when status becomes RESOLVED
    CONSTRAINT fk_complaint_citizen  FOREIGN KEY (citizen_id)  REFERENCES app_user(user_id),
    CONSTRAINT fk_complaint_ward     FOREIGN KEY (ward_id)     REFERENCES ward(ward_id),
    CONSTRAINT fk_complaint_category FOREIGN KEY (category_id) REFERENCES category(category_id),
    CONSTRAINT fk_complaint_cluster  FOREIGN KEY (cluster_id)  REFERENCES complaint_cluster(cluster_id),
    CONSTRAINT chk_resolved_after_created
        CHECK (resolved_at IS NULL OR resolved_at >= created_at)
);

-- ALTER: the cluster -> complaint FK can only be added once complaint exists
ALTER TABLE complaint_cluster
    ADD CONSTRAINT fk_cluster_rep_complaint
    FOREIGN KEY (representative_complaint_id) REFERENCES complaint(complaint_id);

-- ---------- Vector store ----------
CREATE TABLE complaint_vector (
    complaint_id INT PRIMARY KEY,
    embedding    vector(384) NOT NULL,     -- all-MiniLM-L6-v2 embedding of title + description
    CONSTRAINT fk_vec_complaint FOREIGN KEY (complaint_id)
        REFERENCES complaint(complaint_id) ON DELETE CASCADE
);

-- ---------- Workflow tables ----------
CREATE TABLE assignment (
    assignment_id SERIAL PRIMARY KEY,
    complaint_id  INT NOT NULL,
    officer_id    INT NOT NULL,
    assigned_by   INT NOT NULL,
    assigned_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT fk_assign_complaint FOREIGN KEY (complaint_id) REFERENCES complaint(complaint_id) ON DELETE CASCADE,
    CONSTRAINT fk_assign_officer   FOREIGN KEY (officer_id)   REFERENCES app_user(user_id),
    CONSTRAINT fk_assign_by        FOREIGN KEY (assigned_by)  REFERENCES app_user(user_id)
);

CREATE TABLE status_history (
    history_id   SERIAL PRIMARY KEY,
    complaint_id INT NOT NULL,
    old_status   VARCHAR(20),
    new_status   VARCHAR(20) NOT NULL,
    changed_by   INT,                      -- NULL = changed by the system (SLA escalation)
    remarks      TEXT,
    changed_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT fk_hist_complaint FOREIGN KEY (complaint_id) REFERENCES complaint(complaint_id) ON DELETE CASCADE,
    CONSTRAINT fk_hist_user      FOREIGN KEY (changed_by)   REFERENCES app_user(user_id)
);

CREATE TABLE attachment (
    attachment_id SERIAL PRIMARY KEY,
    complaint_id  INT NOT NULL,
    file_url      VARCHAR(255) NOT NULL CHECK (file_url ~* '^https?://'),
    file_type     VARCHAR(20),
    uploaded_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT fk_att_complaint FOREIGN KEY (complaint_id) REFERENCES complaint(complaint_id) ON DELETE CASCADE
);

CREATE TABLE comment (
    comment_id   SERIAL PRIMARY KEY,
    complaint_id INT NOT NULL,
    author_id    INT NOT NULL,
    body         TEXT NOT NULL CHECK (length(trim(body)) >= 1),
    created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT fk_comment_complaint FOREIGN KEY (complaint_id) REFERENCES complaint(complaint_id) ON DELETE CASCADE,
    CONSTRAINT fk_comment_author    FOREIGN KEY (author_id)    REFERENCES app_user(user_id)
);

CREATE TABLE audit_log (
    log_id     SERIAL PRIMARY KEY,
    user_id    INT,
    action     VARCHAR(50) NOT NULL,
    entity     VARCHAR(40) NOT NULL,
    entity_id  INT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT fk_audit_user FOREIGN KEY (user_id) REFERENCES app_user(user_id) ON DELETE SET NULL
);

-- ============================================================
-- Indexes
-- ============================================================
CREATE INDEX idx_complaint_status   ON complaint(status);
CREATE INDEX idx_complaint_ward     ON complaint(ward_id);
CREATE INDEX idx_complaint_category ON complaint(category_id);
CREATE INDEX idx_complaint_cluster  ON complaint(cluster_id);
CREATE INDEX idx_complaint_citizen  ON complaint(citizen_id);
CREATE INDEX idx_complaint_created  ON complaint(created_at DESC);
CREATE INDEX idx_assignment_officer ON assignment(officer_id);
CREATE INDEX idx_assignment_complaint ON assignment(complaint_id, assigned_at DESC);
CREATE INDEX idx_history_complaint  ON status_history(complaint_id, changed_at);

-- Partial index: only unresolved complaints matter for the SLA check
CREATE INDEX idx_complaint_sla_open ON complaint(sla_due_at)
    WHERE status IN ('OPEN','ASSIGNED','IN_PROGRESS');

-- Vector index: approximate nearest neighbour search on cosine distance
CREATE INDEX idx_complaint_embedding
    ON complaint_vector USING hnsw (embedding vector_cosine_ops);

-- ============================================================
-- View: open-complaint load per department (used on the admin dashboard)
-- ============================================================
CREATE VIEW v_department_open_load AS
SELECT  d.department_id,
        d.dept_name,
        COUNT(c.complaint_id)                                        AS open_complaints,
        COUNT(c.complaint_id) FILTER (WHERE c.sla_due_at < NOW())    AS overdue_complaints
FROM    department d
LEFT JOIN category  cat ON cat.department_id = d.department_id
LEFT JOIN complaint c   ON c.category_id = cat.category_id
                       AND c.status IN ('OPEN','ASSIGNED','IN_PROGRESS','ESCALATED')
GROUP BY d.department_id, d.dept_name;

-- View: current open workload per officer, including officers with no assignments
CREATE VIEW v_officer_workload AS
SELECT u.user_id AS officer_id,
       u.full_name AS officer_name,
       d.dept_name,
       COUNT(c.complaint_id)::int AS open_complaints,
       COUNT(c.complaint_id) FILTER (WHERE c.sla_due_at < NOW())::int AS overdue_complaints
FROM app_user u
JOIN role r ON r.role_id = u.role_id AND r.role_name = 'OFFICER'
LEFT JOIN department d ON d.department_id = u.department_id
LEFT JOIN (
    SELECT DISTINCT ON (a.complaint_id)
           a.complaint_id, a.officer_id
    FROM assignment a
    ORDER BY a.complaint_id, a.assigned_at DESC, a.assignment_id DESC
) current_assignment ON current_assignment.officer_id = u.user_id
LEFT JOIN complaint c ON c.complaint_id = current_assignment.complaint_id
                       AND c.status IN ('OPEN','ASSIGNED','IN_PROGRESS','ESCALATED')
GROUP BY u.user_id, u.full_name, d.dept_name
ORDER BY d.dept_name NULLS LAST, u.full_name;
