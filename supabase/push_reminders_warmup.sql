-- Natrix: warm-up reminder notifications ("Time to start warming up").
-- Run this ONCE in the Supabase SQL editor (project: swim-track-sg-2).
-- It only ADDS one column to the existing push_subscriptions table.

alter table public.push_subscriptions
  add column if not exists warmup_enabled boolean not null default true;
