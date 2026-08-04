-- ReadPulse v3 database setup.
-- Safe to run more than once. Existing tables and data are preserved.

create extension if not exists pgcrypto;

create table if not exists public.reading_sessions (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  text_type text,
  topic text,
  focus_area text,
  group_name text,
  target_students text[] not null default '{}',
  reading_time_minutes integer not null default 5,
  sections jsonb not null default '[]'::jsonb,
  vocabulary_list jsonb not null default '[]'::jsonb,
  comprehension_qs jsonb not null default '[]'::jsonb,
  is_pushed boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.student_progress (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.reading_sessions(id) on delete cascade,
  student_name text not null,
  status text not null default 'assigned',
  opened_at timestamptz,
  completed_at timestamptz,
  answers jsonb not null default '[]'::jsonb,
  student_reflection text,
  created_at timestamptz not null default now(),
  unique(session_id, student_name)
);

create index if not exists reading_sessions_created_at_idx on public.reading_sessions(created_at desc);
create index if not exists student_progress_session_idx on public.student_progress(session_id);
create index if not exists student_progress_student_idx on public.student_progress(student_name);

alter table public.reading_sessions enable row level security;
alter table public.student_progress enable row level security;

-- Classroom prototype policies. Anyone with the app link can read/write these tables.
-- For wider use, replace this with authenticated teacher/student policies.
do $$ begin
  create policy "ReadPulse sessions select" on public.reading_sessions for select to anon using (true);
exception when duplicate_object then null; end $$;
do $$ begin
  create policy "ReadPulse sessions insert" on public.reading_sessions for insert to anon with check (true);
exception when duplicate_object then null; end $$;
do $$ begin
  create policy "ReadPulse sessions update" on public.reading_sessions for update to anon using (true) with check (true);
exception when duplicate_object then null; end $$;
do $$ begin
  create policy "ReadPulse progress select" on public.student_progress for select to anon using (true);
exception when duplicate_object then null; end $$;
do $$ begin
  create policy "ReadPulse progress insert" on public.student_progress for insert to anon with check (true);
exception when duplicate_object then null; end $$;
do $$ begin
  create policy "ReadPulse progress update" on public.student_progress for update to anon using (true) with check (true);
exception when duplicate_object then null; end $$;

-- Add the tables to Realtime where possible.
do $$ begin
  alter publication supabase_realtime add table public.reading_sessions;
exception when duplicate_object then null; end $$;
do $$ begin
  alter publication supabase_realtime add table public.student_progress;
exception when duplicate_object then null; end $$;

notify pgrst, 'reload schema';
