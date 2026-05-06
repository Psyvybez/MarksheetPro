-- Stores email preferences per student (one email per student card ID).
-- This table keeps encrypted email values server-side only.

create table if not exists public.student_notification_emails (
  id uuid primary key default gen_random_uuid(),
  student_card_id text not null unique,
  student_card_number text not null,
  student_name text not null,
  email_hash text not null,
  encrypted_email text not null,
  updated_at timestamptz not null default timezone('utc', now()),
  created_at timestamptz not null default timezone('utc', now())
);

create index if not exists student_notification_emails_student_card_id_idx
  on public.student_notification_emails (student_card_id);

alter table public.student_notification_emails enable row level security;

-- Edge functions use service role; keep direct client access disabled.
drop policy if exists "No direct selects" on public.student_notification_emails;
create policy "No direct selects"
  on public.student_notification_emails
  for select
  using (false);

drop policy if exists "No direct inserts" on public.student_notification_emails;
create policy "No direct inserts"
  on public.student_notification_emails
  for insert
  with check (false);

drop policy if exists "No direct updates" on public.student_notification_emails;
create policy "No direct updates"
  on public.student_notification_emails
  for update
  using (false)
  with check (false);

drop policy if exists "No direct deletes" on public.student_notification_emails;
create policy "No direct deletes"
  on public.student_notification_emails
  for delete
  using (false);

-- Migration: Optional - copy existing emails from reservation_notification_contacts if you have data
-- select distinct on (student_card_id) student_card_id, student_card_number, student_name, encrypted_email
-- from reservation_notification_contacts
-- order by student_card_id, created_at;
