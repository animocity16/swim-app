-- Natrix: swim reminder notifications ("Time to report to call room").
-- Run this ONCE in the Supabase SQL editor (project: swim track -sg-2).
-- It only ADDS two new tables. Nothing existing is changed.

-- 1) One row per phone/browser that turned reminders on.
create table if not exists public.push_subscriptions (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references auth.users(id) on delete cascade,
  endpoint      text not null unique,
  p256dh        text not null,
  auth          text not null,
  tz            text not null default 'Asia/Singapore',
  lead_minutes  int  not null default 30 check (lead_minutes between 5 and 180),
  device_label  text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create index if not exists push_subscriptions_user_idx
  on public.push_subscriptions (user_id);

alter table public.push_subscriptions enable row level security;

-- Parents can see their own subscriptions (the Settings card reads this).
-- All writes go through the server, so there are no insert/update policies.
drop policy if exists "push subscriptions: read own" on public.push_subscriptions;
create policy "push subscriptions: read own"
  on public.push_subscriptions for select to authenticated
  using (auth.uid() = user_id);

-- 2) A tiny log so each swim only ever sends ONE reminder per parent.
create table if not exists public.reminder_log (
  user_id   uuid not null references auth.users(id) on delete cascade,
  event_id  text not null,
  sent_at   timestamptz not null default now(),
  primary key (user_id, event_id)
);

-- Server-only table: RLS on, no policies, so only the service role can touch it.
alter table public.reminder_log enable row level security;
