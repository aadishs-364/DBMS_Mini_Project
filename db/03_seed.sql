-- ============================================================
-- CivicResolve - master data (DML: INSERT)
-- Sample complaints are NOT inserted here: they need embeddings, so
-- scripts/setup-db.mjs files them through fn_file_complaint().
-- ============================================================

INSERT INTO role (role_name) VALUES ('CITIZEN'), ('OFFICER'), ('ADMIN');

INSERT INTO ward (ward_number, ward_name, zone) VALUES
    (12, 'Indiranagar',  'East'),
    (24, 'Jayanagar',    'South'),
    (45, 'Malleshwaram', 'West'),
    (68, 'Koramangala',  'South'),
    (81, 'Whitefield',   'Mahadevapura');

INSERT INTO department (dept_name, description) VALUES
    ('Roads and Infrastructure', 'Road surface, footpaths, storm water drains'),
    ('Electrical',               'Streetlights and public electrical fittings'),
    ('Water Supply and Sewerage','Drinking water lines, sewage and manholes'),
    ('Solid Waste Management',   'Garbage collection, dumping spots, street sweeping');

-- description = how citizens usually word these complaints; it is embedded and used for routing
INSERT INTO category (category_name, description, department_id) VALUES
    ('Pothole / damaged road',
     'pothole, crater or pit on the road, broken tar, damaged road surface, vehicles skidding',
     (SELECT department_id FROM department WHERE dept_name = 'Roads and Infrastructure')),
    ('Broken footpath',
     'broken footpath slabs, missing paver blocks, open drain cover on the pavement, pedestrians tripping',
     (SELECT department_id FROM department WHERE dept_name = 'Roads and Infrastructure')),
    ('Streetlight not working',
     'streetlight not working, lamp post dark, road is dark at night, bulb fused, flickering light',
     (SELECT department_id FROM department WHERE dept_name = 'Electrical')),
    ('Exposed wiring / sparking pole',
     'electric pole sparking, exposed live wire, open junction box, risk of electric shock',
     (SELECT department_id FROM department WHERE dept_name = 'Electrical')),
    ('Water pipe leak',
     'water pipeline burst, drinking water leaking on the road, no water supply in taps, low pressure',
     (SELECT department_id FROM department WHERE dept_name = 'Water Supply and Sewerage')),
    ('Sewage overflow',
     'sewage overflowing from manhole, blocked drain, foul smell, dirty water on the street',
     (SELECT department_id FROM department WHERE dept_name = 'Water Supply and Sewerage')),
    ('Garbage not collected',
     'garbage not collected for days, waste piled up at the corner, overflowing bin, stray dogs around trash',
     (SELECT department_id FROM department WHERE dept_name = 'Solid Waste Management')),
    ('Illegal dumping / burning',
     'construction debris dumped on roadside, garbage being burnt, smoke from burning waste',
     (SELECT department_id FROM department WHERE dept_name = 'Solid Waste Management'));

INSERT INTO sla_policy (category_id, resolution_hours, escalation_hours)
SELECT category_id,
       CASE category_name
            WHEN 'Exposed wiring / sparking pole' THEN 12
            WHEN 'Water pipe leak'                THEN 24
            WHEN 'Sewage overflow'                THEN 24
            WHEN 'Streetlight not working'        THEN 48
            WHEN 'Garbage not collected'          THEN 48
            ELSE 72 END,
       CASE category_name
            WHEN 'Exposed wiring / sparking pole' THEN 18
            WHEN 'Water pipe leak'                THEN 36
            WHEN 'Sewage overflow'                THEN 36
            WHEN 'Streetlight not working'        THEN 72
            WHEN 'Garbage not collected'          THEN 72
            ELSE 120 END
FROM category;

-- Demo accounts. Every account uses the same demo password, hashed with bcrypt
-- by pgcrypto. Change the value of pw below before running if you want another one.
-- (This file is the only place the demo password is written down.)
WITH demo AS (SELECT 'Civic@2026'::TEXT AS pw)
INSERT INTO app_user (full_name, email, phone, password_hash, role_id, ward_id, department_id)
SELECT u.full_name, u.email, u.phone,
       crypt(demo.pw, gen_salt('bf', 10)),
       (SELECT role_id FROM role WHERE role_name = u.role_name),
       (SELECT ward_id FROM ward WHERE ward_number = u.ward_number),
       (SELECT department_id FROM department WHERE dept_name = u.dept_name)
FROM demo, (VALUES
    ('Meera Iyer',        'admin@civicresolve.test',   '9000000001', 'ADMIN',   NULL, NULL),
    ('Ramesh Gowda',      'roads@civicresolve.test',   '9000000002', 'OFFICER', 12,   'Roads and Infrastructure'),
    ('Kavitha Rao',       'electrical@civicresolve.test','9000000003','OFFICER', 68,   'Electrical'),
    ('Suresh Babu',       'water@civicresolve.test',   '9000000004', 'OFFICER', 45,   'Water Supply and Sewerage'),
    ('Farah Khan',        'waste@civicresolve.test',   '9000000005', 'OFFICER', 24,   'Solid Waste Management'),
    ('Aarav Sharma',      'aarav@example.test',        '9000000011', 'CITIZEN', 12,   NULL),
    ('Divya Krishnan',    'divya@example.test',        '9000000012', 'CITIZEN', 68,   NULL),
    ('Rohan Kulkarni',    'rohan@example.test',        '9000000013', 'CITIZEN', 12,   NULL),
    ('Sneha Pai',         'sneha@example.test',        '9000000014', 'CITIZEN', 45,   NULL),
    ('Nikhil Reddy',      'nikhil@example.test',       '9000000015', 'CITIZEN', 81,   NULL),
    ('Lakshmi Narayanan', 'lakshmi@example.test',      '9000000016', 'CITIZEN', 24,   NULL)
) AS u(full_name, email, phone, role_name, ward_number, dept_name);

-- the inserts above were made by the setup script, not by a logged-in user
DELETE FROM audit_log;
