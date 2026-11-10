-- Natrix: makes Supabase "knock" on the reminder sender once every minute.
-- Run this in the Supabase SQL editor AFTER push_reminders.sql
-- and AFTER you have added CRON_SECRET in Vercel.
--
-- ONLY ONE THING TO EDIT: replace PASTE_YOUR_CRON_SECRET_HERE below with the
-- exact same secret you saved as CRON_SECRET in Vercel (keep the word Bearer
-- and the space before it).
--
-- Safe to re-run: it replaces the job if it already exists.

select cron.schedule(
  'natrix-send-reminders',
  '* * * * *',
  $$
  select net.http_post(
    url     := 'https://swimnatrix.vercel.app/api/send-reminders',
    headers := jsonb_build_object(
      'Content-Type',  'application/json',
      'Authorization', 'Bearer PASTE_YOUR_CRON_SECRET_HERE'
    ),
    body    := '{}'::jsonb
  );
  $$
);

-- To switch reminders off for everyone later:
--   select cron.unschedule('natrix-send-reminders');
