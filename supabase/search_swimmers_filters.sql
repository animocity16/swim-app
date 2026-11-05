-- Natrix: swimmer search with filters (name, club, age).
-- Run this ONCE in the Supabase SQL editor (project: swim track -sg-2).
-- It REPLACES the earlier search_all_swimmers function with a version that also
-- filters by club and age. Nothing else is touched, and your data is not changed.
-- Safe to run BEFORE or AFTER the new app code goes live.

drop function if exists public.search_all_swimmers(text);

create or replace function public.search_all_swimmers(
  p_query text    default null,   -- name words, e.g. "alex tan" or "tan, alex"
  p_club  text    default null,   -- club words, e.g. "singapore swimming"
  p_age   integer default null    -- the swimmer's most recent age in our data
)
returns table (
  swimmer_name text,
  team_name    text,
  latest_age   integer,
  result_count bigint,
  meet_count   bigint
)
language sql
stable
security definer
set search_path = public
as $$
  with name_tokens as (
    select distinct lower(t) as tok
    from regexp_split_to_table(
           regexp_replace(coalesce(p_query, ''), '[,]+', ' ', 'g'),
           '\s+'
         ) as t
    where length(t) >= 2
  ),
  club_tokens as (
    select distinct lower(t) as tok
    from regexp_split_to_table(
           regexp_replace(coalesce(p_club, ''), '[,]+', ' ', 'g'),
           '\s+'
         ) as t
    where length(t) >= 2
  )
  select s.swimmer_name, s.team_name, s.latest_age, s.result_count, s.meet_count
  from (
    select
      r.swimmer_name,
      r.team_name,
      (array_agg(r.swimmer_age order by to_jsonb(m)->>'parsed_start_date' desc nulls last))[1] as latest_age,
      count(*)::bigint as result_count,
      count(distinct r.meet_id)::bigint as meet_count
    from meet_results r
    left join meets m on m.id = r.meet_id
    where
      -- need at least one filter, otherwise we'd return everyone
      ((select count(*) from name_tokens) + (select count(*) from club_tokens) > 0
        or p_age is not null)
      -- every name word must appear in the swimmer's name
      and not exists (
        select 1 from name_tokens t
        where position(t.tok in lower(coalesce(r.swimmer_name, ''))) = 0
      )
      -- every club word must appear in the club name
      and not exists (
        select 1 from club_tokens c
        where position(c.tok in lower(coalesce(r.team_name, ''))) = 0
      )
    group by r.swimmer_name, r.team_name
  ) s
  where p_age is null or s.latest_age = p_age
  order by s.result_count desc, s.swimmer_name
  limit 40;
$$;

revoke all on function public.search_all_swimmers(text, text, integer) from public, anon;
grant execute on function public.search_all_swimmers(text, text, integer) to authenticated;
