-- Natrix: central start lists.
-- Run this ONCE in the Supabase SQL editor (project: swim track -sg-2),
-- BEFORE you deploy the new admin page and meet page.
--
-- What it does:
--   * adds ONE new table, meet_start_list_entries, holding every swimmer from
--     the start list PDFs you upload in /admin/meets
--   * every logged-in user can READ it (so each parent's Meets page can pick
--     out their own swimmers)
--   * only YOU (the admin user) can add, change or delete rows
-- It does not touch meet_events or any existing data.

do $$
declare
  meet_id_type text;
begin
  -- Match whatever type upcoming_meets.id already is (uuid or number).
  select format_type(a.atttypid, a.atttypmod)
    into meet_id_type
    from pg_attribute a
   where a.attrelid = 'public.upcoming_meets'::regclass
     and a.attname = 'id'
     and not a.attisdropped;

  execute format($f$
    create table if not exists public.meet_start_list_entries (
      id            uuid primary key default gen_random_uuid(),
      meet_id       %s not null references public.upcoming_meets(id) on delete cascade,
      event_date    date not null,
      event_number  int  not null,
      event_name    text not null,
      distance      int,
      stroke        text,
      category      text,
      heat          int  not null,
      lane          int  not null,
      seed_time     text,
      start_time    text,
      swimmer_name  text not null,
      age           int,
      team          text,
      created_at    timestamptz not null default now(),
      unique (meet_id, event_date, event_number, heat, lane)
    )
  $f$, meet_id_type);
end $$;

create index if not exists meet_start_list_entries_meet_idx
  on public.meet_start_list_entries (meet_id);

alter table public.meet_start_list_entries enable row level security;

drop policy if exists "start list entries: logged-in users can read" on public.meet_start_list_entries;
create policy "start list entries: logged-in users can read"
  on public.meet_start_list_entries
  for select
  to authenticated
  using (true);

drop policy if exists "start list entries: admin can write" on public.meet_start_list_entries;
create policy "start list entries: admin can write"
  on public.meet_start_list_entries
  for all
  to authenticated
  using (auth.uid() = '9156c797-d133-4a7f-aa93-03688f2bdfd1'::uuid)
  with check (auth.uid() = '9156c797-d133-4a7f-aa93-03688f2bdfd1'::uuid);
