-- ============================================================
-- CivicResolve - queries for the report (chapters 6, 7 and 8)
-- Run these one by one in psql / the Neon SQL editor AFTER the
-- database is set up, and take a screenshot of each result.
-- ============================================================

-- ---------- 6. DML ----------
-- INSERT
INSERT INTO ward (ward_number, ward_name, zone) VALUES (99, 'Hebbal', 'North');

-- UPDATE
UPDATE ward SET zone = 'North-East' WHERE ward_number = 99;

-- DELETE
DELETE FROM ward WHERE ward_number = 99;

-- SELECT
SELECT complaint_id, title, status, priority, created_at
FROM complaint
ORDER BY created_at DESC
LIMIT 10;

-- ---------- 7.1 JOIN + GROUP BY + aggregate + ORDER BY ----------
-- complaints per ward with how many are still open
SELECT w.ward_number, w.ward_name,
       COUNT(*)                                                    AS total_complaints,
       COUNT(*) FILTER (WHERE c.status NOT IN ('RESOLVED','CLOSED')) AS still_open
FROM complaint c
JOIN ward w ON w.ward_id = c.ward_id
GROUP BY w.ward_number, w.ward_name
ORDER BY total_complaints DESC;

-- GROUP BY + HAVING: departments whose average resolution time is above 24 hours
SELECT d.dept_name,
       COUNT(*)                                                             AS resolved,
       ROUND(AVG(EXTRACT(EPOCH FROM (c.resolved_at - c.created_at)) / 3600)::numeric, 1) AS avg_hours
FROM complaint c
JOIN category cat ON cat.category_id = c.category_id
JOIN department d ON d.department_id = cat.department_id
WHERE c.resolved_at IS NOT NULL
GROUP BY d.dept_name
HAVING AVG(EXTRACT(EPOCH FROM (c.resolved_at - c.created_at)) / 3600) > 24
ORDER BY avg_hours DESC;

-- ---------- 7.2 UPDATE (fires trg_complaint_status_history) ----------
BEGIN;
SELECT set_config('app.remarks', 'Crew sent to the site', true);
UPDATE complaint SET status = 'IN_PROGRESS'
WHERE complaint_id = (SELECT MIN(complaint_id) FROM complaint WHERE status = 'OPEN');
SELECT * FROM status_history ORDER BY history_id DESC LIMIT 3;   -- row written by the trigger
ROLLBACK;                                                        -- keep the demo data unchanged

-- ---------- 7.3 DELETE (and a constraint refusing it) ----------
-- allowed: a comment has no dependants
DELETE FROM comment WHERE comment_id = (SELECT MAX(comment_id) FROM comment);

-- refused: complaints still reference this department's categories (foreign key)
DELETE FROM department WHERE dept_name = 'Electrical';

-- ---------- 7.4 Correlated subquery ----------
-- complaints that waited longer than the average of their own category
SELECT c.complaint_id, c.title, cat.category_name,
       ROUND((EXTRACT(EPOCH FROM (COALESCE(c.resolved_at, NOW()) - c.created_at)) / 3600)::numeric, 1) AS hours_open
FROM complaint c
JOIN category cat ON cat.category_id = c.category_id
WHERE COALESCE(c.resolved_at, NOW()) - c.created_at >
      (SELECT AVG(COALESCE(c2.resolved_at, NOW()) - c2.created_at)
       FROM complaint c2
       WHERE c2.category_id = c.category_id)
ORDER BY hours_open DESC;

-- ---------- 7.5 Nested subquery ----------
-- categories that have no open complaint right now
SELECT cat.category_name
FROM category cat
WHERE cat.category_id NOT IN (SELECT c.category_id
                              FROM complaint c
                              WHERE c.category_id IS NOT NULL
                                AND c.status NOT IN ('RESOLVED','CLOSED'));

-- wards with more complaints than the average ward
SELECT w.ward_name, t.n
FROM ward w
JOIN (SELECT ward_id, COUNT(*) AS n FROM complaint GROUP BY ward_id) t ON t.ward_id = w.ward_id
WHERE t.n > (SELECT AVG(n) FROM (SELECT COUNT(*) AS n FROM complaint GROUP BY ward_id) x);

-- ---------- View ----------
SELECT * FROM v_department_open_load ORDER BY open_complaints DESC;
SELECT * FROM v_officer_workload;

-- ---------- Vector similarity search (pgvector) ----------
-- the 5 complaints closest in meaning to complaint #1 (<=> is cosine distance)
SELECT c.complaint_id, c.title,
       ROUND((1 - (v.embedding <=> q.embedding))::numeric, 3) AS similarity
FROM complaint_vector v
JOIN complaint c ON c.complaint_id = v.complaint_id
CROSS JOIN (SELECT embedding FROM complaint_vector WHERE complaint_id = 1) q
WHERE v.complaint_id <> 1
ORDER BY v.embedding <=> q.embedding
LIMIT 5;

-- duplicate clusters: issues reported by more than one citizen
SELECT cl.cluster_id, cl.report_count, c.title AS first_report, w.ward_name
FROM complaint_cluster cl
JOIN complaint c ON c.complaint_id = cl.representative_complaint_id
JOIN ward w ON w.ward_id = c.ward_id
WHERE cl.report_count > 1
ORDER BY cl.report_count DESC;

-- ---------- Index usage ----------
EXPLAIN ANALYZE SELECT * FROM complaint WHERE status = 'OPEN' AND ward_id = 1;
EXPLAIN ANALYZE
SELECT a.*
FROM assignment a
WHERE a.complaint_id = 1
ORDER BY a.assigned_at DESC
LIMIT 1;

-- ---------- 8. Stored procedure, function, triggers ----------
CALL sp_escalate_overdue();
SELECT complaint_id, old_status, new_status, changed_by, remarks, changed_at
FROM status_history WHERE new_status = 'ESCALATED' ORDER BY changed_at DESC;

-- list the triggers and routines that exist
SELECT trigger_name, event_manipulation, event_object_table
FROM information_schema.triggers WHERE trigger_schema = 'public' ORDER BY event_object_table;

SELECT routine_name, routine_type
FROM information_schema.routines WHERE routine_schema = 'public' AND routine_name LIKE ANY (ARRAY['fn_%','sp_%']);

-- ---------- Constraints rejecting bad data (validation at database level) ----------
INSERT INTO app_user (full_name, email, phone, password_hash, role_id)
VALUES ('Bad Phone', 'bad@example.test', '12345', 'x', 1);            -- CHECK on phone fails

INSERT INTO sla_policy (category_id, resolution_hours, escalation_hours)
VALUES (1, 48, 12);                                                    -- UNIQUE / CHECK fails

INSERT INTO complaint (title, description, citizen_id, ward_id)
VALUES ('abc', 'The lamp post outside my house is broken.', 6, 1);                                     -- CHECK on title length fails
