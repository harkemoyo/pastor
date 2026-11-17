-- Add additional pastor signup fields to public.students
alter table public.students
  add column if not exists cohort text,
  add column if not exists church_size text,
  add column if not exists age integer,
  add column if not exists profile_picture text;
