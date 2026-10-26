-- =========================================================
-- ALL10S ERP / WiiTeam — Practice, quizzes and student progress (migration 41)
--
--  * Teachers (their own classes) and admins (any class) build practices and quizzes.
--  * Students play them in the student portal. Marking happens in the database
--    (the functions at the bottom), so students never receive the correct answers.
--  * A "practice" is unlimited tries and is NOT visible to parents.
--    A "quiz" is recorded and its results ARE visible to parents.
--  * Teachers write short progress comments about a student; parents can read them.
-- =========================================================

create table if not exists quizzes (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id),
  class_id uuid not null references classes(id) on delete cascade,
  title text not null,
  description text,
  kind text not null default 'practice' check (kind in ('practice', 'quiz')),
  allow_retake boolean not null default true,
  published boolean not null default true,
  created_by uuid references profiles(id),
  created_at timestamptz default now()
);
create index if not exists quizzes_class_idx on quizzes (class_id, created_at desc);

create table if not exists quiz_questions (
  id uuid primary key default gen_random_uuid(),
  quiz_id uuid not null references quizzes(id) on delete cascade,
  position int not null default 0,
  question_text text not null,
  question_type text not null check (question_type in ('choice', 'text')),
  options jsonb,                 -- list of choices, for 'choice'
  correct_answer text not null,  -- for 'text': several accepted answers can be separated with |
  speak_text text,               -- optional: the device reads this aloud (e.g. a spelling word)
  created_at timestamptz default now()
);
create index if not exists quiz_questions_quiz_idx on quiz_questions (quiz_id, position);

create table if not exists quiz_attempts (
  id uuid primary key default gen_random_uuid(),
  quiz_id uuid not null references quizzes(id) on delete cascade,
  student_id uuid not null references students(id) on delete cascade,
  org_id uuid not null references organizations(id),
  score int not null,
  total int not null,
  answers jsonb not null default '[]'::jsonb,
  created_at timestamptz default now()
);
create index if not exists quiz_attempts_student_idx on quiz_attempts (student_id, created_at desc);
create index if not exists quiz_attempts_quiz_idx on quiz_attempts (quiz_id);

create table if not exists progress_comments (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id),
  student_id uuid not null references students(id) on delete cascade,
  class_id uuid references classes(id) on delete set null,
  comment text not null,
  author_name text,
  created_by uuid references profiles(id),
  created_at timestamptz default now()
);
create index if not exists progress_comments_student_idx on progress_comments (student_id, created_at desc);

-- ---------- helper checks used by the access rules ----------

-- Admins: any class in their centre. Teachers: only classes they teach.
create or replace function can_manage_class_content(p_class_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from classes c
    where c.id = p_class_id
      and (
        is_org_admin(c.org_id)
        or exists (
          select 1
          from class_teachers ct
          join profiles p on p.id = ct.teacher_id
          where ct.class_id = c.id and p.user_id = auth.uid()
        )
      )
  );
$$;

create or replace function is_enrolled_student_in_class(p_class_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from class_enrollments ce
    join student_accounts sa on sa.student_id = ce.student_id
    where ce.class_id = p_class_id and sa.user_id = auth.uid()
  );
$$;

create or replace function parent_has_child_in_class(p_class_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from class_enrollments ce
    where ce.class_id = p_class_id and is_linked_parent_of(ce.student_id)
  );
$$;

-- May this staff member write comments about this student?
-- Admins: any student in their centre. Teachers: students in a class they teach.
create or replace function can_comment_on_student(p_student_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    exists (select 1 from students s where s.id = p_student_id and is_org_admin(s.org_id))
    or exists (
      select 1
      from class_enrollments ce
      join class_teachers ct on ct.class_id = ce.class_id
      join profiles p on p.id = ct.teacher_id
      where ce.student_id = p_student_id and p.user_id = auth.uid()
    );
$$;

grant execute on function can_manage_class_content(uuid) to authenticated;
grant execute on function is_enrolled_student_in_class(uuid) to authenticated;
grant execute on function parent_has_child_in_class(uuid) to authenticated;
grant execute on function can_comment_on_student(uuid) to authenticated;

-- ---------- access rules ----------

alter table quizzes enable row level security;
drop policy if exists "quizzes_staff_read" on quizzes;
create policy "quizzes_staff_read" on quizzes for select using (can_manage_class_content(class_id));
drop policy if exists "quizzes_staff_insert" on quizzes;
create policy "quizzes_staff_insert" on quizzes for insert
  with check (can_manage_class_content(class_id) and org_id = (select c.org_id from classes c where c.id = class_id));
drop policy if exists "quizzes_staff_update" on quizzes;
create policy "quizzes_staff_update" on quizzes for update using (can_manage_class_content(class_id));
drop policy if exists "quizzes_staff_delete" on quizzes;
create policy "quizzes_staff_delete" on quizzes for delete using (can_manage_class_content(class_id));
-- Parents may see the titles of QUIZZES (never practices) for their child's classes, so results have names.
drop policy if exists "quizzes_parent_read" on quizzes;
create policy "quizzes_parent_read" on quizzes for select
  using (published and kind = 'quiz' and parent_has_child_in_class(class_id));

-- Questions (which hold the correct answers) are staff-only. Students get them through the functions below.
alter table quiz_questions enable row level security;
drop policy if exists "quiz_questions_staff_all" on quiz_questions;
create policy "quiz_questions_staff_all" on quiz_questions for all
  using (exists (select 1 from quizzes q where q.id = quiz_questions.quiz_id and can_manage_class_content(q.class_id)))
  with check (exists (select 1 from quizzes q where q.id = quiz_questions.quiz_id and can_manage_class_content(q.class_id)));

-- Attempts are written only by the marking function; nobody inserts directly.
alter table quiz_attempts enable row level security;
drop policy if exists "quiz_attempts_staff_read" on quiz_attempts;
create policy "quiz_attempts_staff_read" on quiz_attempts for select
  using (exists (select 1 from quizzes q where q.id = quiz_attempts.quiz_id and can_manage_class_content(q.class_id)));
drop policy if exists "quiz_attempts_staff_delete" on quiz_attempts;
create policy "quiz_attempts_staff_delete" on quiz_attempts for delete
  using (exists (select 1 from quizzes q where q.id = quiz_attempts.quiz_id and can_manage_class_content(q.class_id)));
drop policy if exists "quiz_attempts_student_read" on quiz_attempts;
create policy "quiz_attempts_student_read" on quiz_attempts for select using (is_own_student_account(student_id));
drop policy if exists "quiz_attempts_parent_read" on quiz_attempts;
create policy "quiz_attempts_parent_read" on quiz_attempts for select
  using (
    is_linked_parent_of(student_id)
    and exists (select 1 from quizzes q where q.id = quiz_attempts.quiz_id and q.kind = 'quiz')
  );

alter table progress_comments enable row level security;
drop policy if exists "progress_comments_staff_read" on progress_comments;
create policy "progress_comments_staff_read" on progress_comments for select using (can_comment_on_student(student_id));
drop policy if exists "progress_comments_staff_insert" on progress_comments;
create policy "progress_comments_staff_insert" on progress_comments for insert
  with check (can_comment_on_student(student_id) and org_id = (select s.org_id from students s where s.id = student_id));
drop policy if exists "progress_comments_staff_delete" on progress_comments;
create policy "progress_comments_staff_delete" on progress_comments for delete using (can_comment_on_student(student_id));
drop policy if exists "progress_comments_parent_read" on progress_comments;
create policy "progress_comments_parent_read" on progress_comments for select using (is_linked_parent_of(student_id));

-- ---------- functions the student portal uses ----------

-- The student's list of practices and quizzes (no answers included).
create or replace function student_quiz_list()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_student uuid;
begin
  select sa.student_id into v_student from student_accounts sa where sa.user_id = auth.uid() limit 1;
  if v_student is null then
    return '[]'::jsonb;
  end if;

  return coalesce((
    select jsonb_agg(
      jsonb_build_object(
        'id', q.id,
        'class_id', q.class_id,
        'class_name', c.name,
        'title', q.title,
        'description', q.description,
        'kind', q.kind,
        'allow_retake', q.allow_retake,
        'question_count', (select count(*) from quiz_questions qq where qq.quiz_id = q.id),
        'attempts', (select count(*) from quiz_attempts a where a.quiz_id = q.id and a.student_id = v_student),
        'best_score', (select max(a.score) from quiz_attempts a where a.quiz_id = q.id and a.student_id = v_student),
        'best_total', (select a.total from quiz_attempts a where a.quiz_id = q.id and a.student_id = v_student order by a.score desc, a.created_at desc limit 1)
      )
      order by c.name, q.kind desc, q.created_at desc
    )
    from quizzes q
    join classes c on c.id = q.class_id
    join class_enrollments ce on ce.class_id = q.class_id and ce.student_id = v_student
    where q.published
  ), '[]'::jsonb);
end;
$$;

-- The questions of one quiz, WITHOUT the correct answers.
create or replace function student_get_quiz(p_quiz_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_student uuid;
  v_quiz quizzes%rowtype;
begin
  select sa.student_id into v_student from student_accounts sa where sa.user_id = auth.uid() limit 1;
  if v_student is null then
    raise exception 'This is not a student login';
  end if;

  select * into v_quiz from quizzes where id = p_quiz_id and published;
  if not found then
    raise exception 'That quiz is not available';
  end if;
  if not exists (select 1 from class_enrollments ce where ce.class_id = v_quiz.class_id and ce.student_id = v_student) then
    raise exception 'You are not in this class';
  end if;
  if v_quiz.kind = 'quiz' and not v_quiz.allow_retake
     and exists (select 1 from quiz_attempts a where a.quiz_id = p_quiz_id and a.student_id = v_student) then
    raise exception 'You have already done this quiz';
  end if;

  return jsonb_build_object(
    'id', v_quiz.id,
    'title', v_quiz.title,
    'description', v_quiz.description,
    'kind', v_quiz.kind,
    'questions', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'id', qq.id,
          'text', qq.question_text,
          'type', qq.question_type,
          'options', qq.options,
          'speak_text', qq.speak_text
        )
        order by qq.position, qq.created_at
      )
      from quiz_questions qq where qq.quiz_id = p_quiz_id
    ), '[]'::jsonb)
  );
end;
$$;

-- Marks the answers and records the attempt. p_answers looks like {"<question id>": "answer", ...}.
create or replace function student_submit_quiz(p_quiz_id uuid, p_answers jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_student uuid;
  v_quiz quizzes%rowtype;
  v_answers jsonb := coalesce(p_answers, '{}'::jsonb);
  v_score int := 0;
  v_total int := 0;
  v_review jsonb := '[]'::jsonb;
  v_item jsonb;
  v_given text;
  v_ok boolean;
  r record;
begin
  select sa.student_id into v_student from student_accounts sa where sa.user_id = auth.uid() limit 1;
  if v_student is null then
    raise exception 'This is not a student login';
  end if;

  select * into v_quiz from quizzes where id = p_quiz_id and published;
  if not found then
    raise exception 'That quiz is not available';
  end if;
  if not exists (select 1 from class_enrollments ce where ce.class_id = v_quiz.class_id and ce.student_id = v_student) then
    raise exception 'You are not in this class';
  end if;
  if v_quiz.kind = 'quiz' and not v_quiz.allow_retake
     and exists (select 1 from quiz_attempts a where a.quiz_id = p_quiz_id and a.student_id = v_student) then
    raise exception 'You have already done this quiz';
  end if;
  if jsonb_typeof(v_answers) <> 'object' then
    v_answers := '{}'::jsonb;
  end if;

  for r in
    select qq.id, qq.question_text, qq.correct_answer
    from quiz_questions qq
    where qq.quiz_id = p_quiz_id
    order by qq.position, qq.created_at
  loop
    v_total := v_total + 1;
    v_given := coalesce(v_answers ->> (r.id::text), '');
    v_ok := lower(btrim(v_given)) = any (
      select lower(btrim(x)) from unnest(string_to_array(r.correct_answer, '|')) as x
    ) and btrim(v_given) <> '';
    if v_ok then
      v_score := v_score + 1;
    end if;

    v_item := jsonb_build_object(
      'question_id', r.id,
      'text', r.question_text,
      'your_answer', v_given,
      'correct', v_ok
    );
    if v_quiz.kind = 'practice' then
      v_item := v_item || jsonb_build_object('correct_answer', replace(r.correct_answer, '|', ' / '));
    end if;
    v_review := v_review || jsonb_build_array(v_item);
  end loop;

  insert into quiz_attempts (quiz_id, student_id, org_id, score, total, answers)
  values (p_quiz_id, v_student, v_quiz.org_id, v_score, v_total, v_review);

  return jsonb_build_object('score', v_score, 'total', v_total, 'kind', v_quiz.kind, 'review', v_review);
end;
$$;

grant execute on function student_quiz_list() to authenticated;
grant execute on function student_get_quiz(uuid) to authenticated;
grant execute on function student_submit_quiz(uuid, jsonb) to authenticated;
