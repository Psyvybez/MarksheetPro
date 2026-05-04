-- Stores one-reservation notification contacts for SMS readiness alerts.
-- This table keeps encrypted phone values server-side only.

create table if not exists public.reservation_notification_contacts (
  id uuid primary key default gen_random_uuid(),
  reservation_id text not null,
  student_card_id text not null,
  student_name text not null,
  student_card_number text not null,
  book_title text not null,
  phone_hash text not null,
  encrypted_phone text not null,
  expires_at timestamptz not null,
  consumed_at timestamptz,
  created_at timestamptz not null default timezone('utc', now())
);

create index if not exists reservation_notification_contacts_reservation_idx
  on public.reservation_notification_contacts (reservation_id);

create index if not exists reservation_notification_contacts_expires_idx
  on public.reservation_notification_contacts (expires_at);

alter table public.reservation_notification_contacts enable row level security;

-- Edge functions use service role; keep direct client access disabled.
drop policy if exists "No direct selects" on public.reservation_notification_contacts;
create policy "No direct selects"
  on public.reservation_notification_contacts
  for select
  using (false);

drop policy if exists "No direct inserts" on public.reservation_notification_contacts;
create policy "No direct inserts"
  on public.reservation_notification_contacts
  for insert
  with check (false);

drop policy if exists "No direct updates" on public.reservation_notification_contacts;
create policy "No direct updates"
  on public.reservation_notification_contacts
  for update
  using (false)
  with check (false);

drop policy if exists "No direct deletes" on public.reservation_notification_contacts;
create policy "No direct deletes"
  on public.reservation_notification_contacts
  for delete
  using (false);
