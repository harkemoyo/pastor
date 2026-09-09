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

-- Optional row-level security policy for admin-only reads and writes.
-- The project can enable RLS in Supabase and then apply app-specific admin policies.

alter table public.students enable row level security;

-- Example policy:
-- create policy "Admins can manage students"
-- on public.students
-- for all
-- using (auth.jwt() ->> 'role' = 'admin')
-- with check (auth.jwt() ->> 'role' = 'admin');
