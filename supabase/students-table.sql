-- Create the student table used for applicant records and approved learners.
-- This is separate from the app admin account, which should not be stored as a student.

create table if not exists public.students (
  id uuid primary key default gen_random_uuid(),
  auth_user_id uuid unique,
  username text unique not null,
  email text unique not null,
  full_name text not null,
  first_name text,
  middle_name text,
  last_name text,
  phone text,
  county text,
  town text,
  physical_address text,
  church_name text,
  ministry_role text,
  years_in_ministry integer default 0,
  emergency_contact_name text,
  emergency_contact_phone text,
  relationship text,
  student_id text unique,
  role text not null default 'student' check (role in ('student', 'admin', 'super_admin')),
  status text not null default 'pending' check (status in ('pending', 'active', 'inactive', 'suspended', 'graduated', 'rejected')),
  approval_status text not null default 'pending' check (approval_status in ('pending', 'approved', 'rejected')),
  approved_by text,
  approved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists students_email_idx on public.students(email);
create index if not exists students_status_idx on public.students(status);
create index if not exists students_approval_idx on public.students(approval_status);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists students_set_updated_at on public.students;
create trigger students_set_updated_at
before update on public.students
for each row
execute function public.set_updated_at();

alter table public.students enable row level security;

-- Students can create their own profile row once the auth user has been created.
create policy "Students can insert own profile"
on public.students
for insert
with check (auth.uid() = auth_user_id);

-- Students can read and update only their own row.
create policy "Students can view own profile"
on public.students
for select
using (auth.uid() = auth_user_id);

create policy "Students can update own profile"
on public.students
for update
using (auth.uid() = auth_user_id)
with check (auth.uid() = auth_user_id);

-- Admins can manage all student records.
create policy "Admins can manage students"
on public.students
for all
using (auth.jwt() ->> 'role' = 'admin' or auth.jwt() ->> 'role' = 'super_admin')
with check (auth.jwt() ->> 'role' = 'admin' or auth.jwt() ->> 'role' = 'super_admin');
