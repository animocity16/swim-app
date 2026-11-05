-- Natrix: give each start-list event a calendar day, so a multi-day meet's
-- Day fuel plan is built one day at a time instead of mixing every day together.
-- Run this ONCE in the Supabase SQL editor (project: swim track -sg-2),
-- BEFORE you deploy the new meet page.
-- It only ADDS one empty column. Existing events keep all their data and simply
-- show as "Day not set" until you pick a day for them in the app.

alter table public.meet_events
  add column if not exists event_date date;
