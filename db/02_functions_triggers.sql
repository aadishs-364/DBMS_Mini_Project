-- ============================================================
-- CivicResolve - functions, stored procedure and triggers
-- ============================================================
-- The application tells the database who is acting by setting two
-- transaction-local settings before it writes:
--     SELECT set_config('app.user_id', '<id>', true);
--     SELECT set_config('app.remarks', '<text>', true);
-- The triggers below read them, so history and audit rows are written
-- by the database itself and cannot be skipped by the application.

-- ------------------------------------------------------------
-- TRIGGER 1: keep sla_due_at and resolved_at correct
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION fn_complaint_before_write() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
    v_hours   INT;
    v_recalc  BOOLEAN := (TG_OP = 'INSERT');
BEGIN
    IF TG_OP = 'UPDATE' THEN            -- OLD only exists for UPDATE
        v_recalc := NEW.category_id IS DISTINCT FROM OLD.category_id
                 OR NEW.created_at  IS DISTINCT FROM OLD.created_at;
        IF NEW.status = 'RESOLVED' AND OLD.status <> 'RESOLVED' THEN
            NEW.resolved_at := NOW();
        END IF;
    END IF;

    IF v_recalc THEN
        SELECT resolution_hours INTO v_hours
        FROM sla_policy WHERE category_id = NEW.category_id;
        NEW.sla_due_at := NEW.created_at + make_interval(hours => COALESCE(v_hours, 72));
    END IF;
    RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_complaint_before_write ON complaint;
CREATE TRIGGER trg_complaint_before_write
BEFORE INSERT OR UPDATE OF category_id, created_at, status ON complaint
FOR EACH ROW EXECUTE FUNCTION fn_complaint_before_write();

-- ------------------------------------------------------------
-- TRIGGER 2: every status change is written to status_history
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION fn_log_status_change() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
    INSERT INTO status_history (complaint_id, old_status, new_status, changed_by, remarks)
    VALUES (NEW.complaint_id, OLD.status, NEW.status,
            NULLIF(current_setting('app.user_id', true), '')::INT,
            NULLIF(current_setting('app.remarks', true), ''));
    RETURN NULL;
END $$;

DROP TRIGGER IF EXISTS trg_complaint_status_history ON complaint;
CREATE TRIGGER trg_complaint_status_history
AFTER UPDATE OF status ON complaint
FOR EACH ROW WHEN (OLD.status IS DISTINCT FROM NEW.status)
EXECUTE FUNCTION fn_log_status_change();

-- ------------------------------------------------------------
-- TRIGGER 3: an issue reported by 3 or more citizens becomes HIGH priority
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION fn_bump_cluster_priority() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
    IF NEW.report_count >= 3 THEN
        UPDATE complaint SET priority = 'HIGH'
        WHERE cluster_id = NEW.cluster_id AND priority <> 'HIGH';
    END IF;
    RETURN NULL;
END $$;

DROP TRIGGER IF EXISTS trg_cluster_priority ON complaint_cluster;
CREATE TRIGGER trg_cluster_priority
AFTER UPDATE OF report_count ON complaint_cluster
FOR EACH ROW WHEN (NEW.report_count > OLD.report_count)
EXECUTE FUNCTION fn_bump_cluster_priority();

-- ------------------------------------------------------------
-- TRIGGER 4: audit log for master data. TG_ARGV[0] = primary key column name
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION fn_audit() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
    v_row JSONB;
BEGIN
    IF TG_OP = 'DELETE' THEN v_row := to_jsonb(OLD); ELSE v_row := to_jsonb(NEW); END IF;
    INSERT INTO audit_log (user_id, action, entity, entity_id)
    VALUES (NULLIF(current_setting('app.user_id', true), '')::INT,
            TG_OP, TG_TABLE_NAME, (v_row ->> TG_ARGV[0])::INT);
    RETURN NULL;
END $$;

DROP TRIGGER IF EXISTS trg_audit_ward ON ward;
CREATE TRIGGER trg_audit_ward AFTER INSERT OR UPDATE OR DELETE ON ward
FOR EACH ROW EXECUTE FUNCTION fn_audit('ward_id');

DROP TRIGGER IF EXISTS trg_audit_department ON department;
CREATE TRIGGER trg_audit_department AFTER INSERT OR UPDATE OR DELETE ON department
FOR EACH ROW EXECUTE FUNCTION fn_audit('department_id');

DROP TRIGGER IF EXISTS trg_audit_category ON category;
CREATE TRIGGER trg_audit_category AFTER INSERT OR UPDATE OR DELETE ON category
FOR EACH ROW EXECUTE FUNCTION fn_audit('category_id');

DROP TRIGGER IF EXISTS trg_audit_sla ON sla_policy;
CREATE TRIGGER trg_audit_sla AFTER INSERT OR UPDATE OR DELETE ON sla_policy
FOR EACH ROW EXECUTE FUNCTION fn_audit('sla_id');

DROP TRIGGER IF EXISTS trg_audit_user ON app_user;
CREATE TRIGGER trg_audit_user AFTER INSERT OR UPDATE OR DELETE ON app_user
FOR EACH ROW EXECUTE FUNCTION fn_audit('user_id');

DROP TRIGGER IF EXISTS trg_audit_assignment ON assignment;
CREATE TRIGGER trg_audit_assignment AFTER INSERT ON assignment
FOR EACH ROW EXECUTE FUNCTION fn_audit('complaint_id');

-- ------------------------------------------------------------
-- FUNCTION: file a complaint, or merge it into an existing cluster
--   1. find the most similar unresolved complaint in the same ward
--   2. similarity >= threshold -> duplicate: join that cluster, count + 1
--      otherwise               -> new cluster, category chosen by nearest
--                                 category embedding (semantic routing)
--   3. store the embedding and the first history row
-- Everything runs inside the caller's transaction, so it is all-or-nothing.
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION fn_file_complaint(
    p_citizen_id  INT,
    p_ward_id     INT,
    p_title       VARCHAR,
    p_description TEXT,
    p_embedding   vector(384),
    p_threshold   REAL DEFAULT 0.70
)
RETURNS TABLE (new_complaint_id INT, new_cluster_id INT, merged BOOLEAN, best_similarity REAL)
LANGUAGE plpgsql AS $$
DECLARE
    v_match_id   INT;
    v_cluster_id INT;
    v_category   INT;
    v_status     VARCHAR(20);
    v_priority   VARCHAR(10);
    v_sim        REAL;
    v_new_id     INT;
    v_merged     BOOLEAN := FALSE;
BEGIN
    SELECT c.complaint_id, c.cluster_id, c.category_id, c.status, c.priority,
           1 - (v.embedding <=> p_embedding)
      INTO v_match_id, v_cluster_id, v_category, v_status, v_priority, v_sim
    FROM complaint_vector v
    JOIN complaint c ON c.complaint_id = v.complaint_id
    WHERE c.ward_id = p_ward_id
      AND c.status NOT IN ('RESOLVED','CLOSED')
    ORDER BY v.embedding <=> p_embedding
    LIMIT 1;

    IF v_match_id IS NOT NULL AND v_sim >= p_threshold THEN
        v_merged := TRUE;
        INSERT INTO complaint (title, description, citizen_id, ward_id, category_id,
                               cluster_id, status, priority)
        VALUES (p_title, p_description, p_citizen_id, p_ward_id, v_category,
                v_cluster_id, v_status, v_priority)
        RETURNING complaint_id INTO v_new_id;

        -- fires trg_cluster_priority
        UPDATE complaint_cluster SET report_count = report_count + 1
        WHERE cluster_id = v_cluster_id;
    ELSE
        SELECT cat.category_id INTO v_category
        FROM category cat
        WHERE cat.embedding IS NOT NULL
        ORDER BY cat.embedding <=> p_embedding
        LIMIT 1;

        INSERT INTO complaint_cluster (centroid_summary) VALUES (p_title)
        RETURNING cluster_id INTO v_cluster_id;

        INSERT INTO complaint (title, description, citizen_id, ward_id, category_id, cluster_id)
        VALUES (p_title, p_description, p_citizen_id, p_ward_id, v_category, v_cluster_id)
        RETURNING complaint_id INTO v_new_id;

        UPDATE complaint_cluster SET representative_complaint_id = v_new_id
        WHERE cluster_id = v_cluster_id;
    END IF;

    INSERT INTO complaint_vector (complaint_id, embedding) VALUES (v_new_id, p_embedding);

    INSERT INTO status_history (complaint_id, old_status, new_status, changed_by, remarks)
    VALUES (v_new_id, NULL, CASE WHEN v_merged THEN v_status ELSE 'OPEN' END, p_citizen_id,
            CASE WHEN v_merged
                 THEN 'Reported again - merged with complaint #' || v_match_id
                 ELSE 'Complaint filed' END);

    RETURN QUERY SELECT v_new_id, v_cluster_id, v_merged, v_sim;
END $$;

-- ------------------------------------------------------------
-- STORED PROCEDURE: escalate complaints that crossed their escalation time.
-- Run with: CALL sp_escalate_overdue();
-- (The admin dashboard has a button for it; in production a scheduler
--  such as pg_cron would call it every few minutes.)
-- ------------------------------------------------------------
CREATE OR REPLACE PROCEDURE sp_escalate_overdue()
LANGUAGE plpgsql AS $$
BEGIN
    PERFORM set_config('app.user_id', '', true);
    PERFORM set_config('app.remarks', 'Escalation time crossed - escalated automatically', true);

    -- the clock of an issue starts at its FIRST report, so every report
    -- in the cluster is escalated together
    UPDATE complaint c
    SET status = 'ESCALATED', priority = 'HIGH'
    FROM complaint_cluster cl
    JOIN complaint rep ON rep.complaint_id = cl.representative_complaint_id
    JOIN sla_policy s  ON s.category_id = rep.category_id
    WHERE cl.cluster_id = c.cluster_id
      AND c.status IN ('OPEN','ASSIGNED','IN_PROGRESS')
      AND NOW() > rep.created_at + make_interval(hours => s.escalation_hours);
END $$;
