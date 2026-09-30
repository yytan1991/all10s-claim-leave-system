-- =========================================================
-- ALL10S ERP / WiiTeam — Simplify classes to a plain name (migration 21)
--
-- Removes the separate subjects table — admin just names a class
-- directly (e.g. "Standard 1 Maths") instead of picking from a
-- managed subject list. Existing classes keep their name, copied
-- over from whatever subject they were using.
-- =========================================================

alter table classes add column if not exists name text;

update classes
set name = subjects.name
from subjects
where classes.subject_id = subjects.id and classes.name is null;

update classes set name = 'Untitled class' where name is null;

alter table classes alter column name set not null;
alter table classes drop column if exists subject_id;

drop table if exists subjects;
