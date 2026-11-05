-- Natrix: swimmer search with filters (name, club, age, gender).
-- Run this ONCE in the Supabase SQL editor (project: swim track -sg-2).
-- It REPLACES the earlier search_all_swimmers function with a version that also
-- filters by club, age and gender. Nothing else is touched, and your data is not changed.
-- Safe to run BEFORE or AFTER the new app code goes live.
--
-- Gender: read from a gender column if the results have one, otherwise worked
-- out from the event name ("Girls 10 Years 50m Freestyle", "Women ...", "Boys ...", "Men ...").

drop function if exists public.search_all_swimmers(text);
drop function if exists public.search_all_swimmers(text, text, integer);

create or replace function public.search_all_swimmers(
  p_query  text    default null,   -- name words, e.g. "alex tan" or "tan, alex"
  p_club   text    default null,   -- club words, e.g. "singapore swimming"
  p_age    integer default null,   -- the swimmer's most recent age in our data
  p_gender text    default null    -- 'F' or 'M'
)
returns table (
  swimmer_name text,
  team_name    text,
  latest_age   integer,
  result_count bigint,
  meet_count   bigint,
  gender       text
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
  ),
  rows_g as (
    select
      r.swimmer_name,
      r.team_name,
      r.swimmer_age,
      r.meet_id,
      to_jsonb(m)->>'parsed_start_date' as sdate,
      case
        when lower(coalesce(to_jsonb(r)->>'gender', to_jsonb(r)->>'swimmer_gender', to_jsonb(r)->>'sex', ''))
             in ('f', 'female', 'w', 'women', 'woman', 'girl', 'girls') then 'F'
        when lower(coalesce(to_jsonb(r)->>'gender', to_jsonb(r)->>'swimmer_gender', to_jsonb(r)->>'sex', ''))
             in ('m', 'male', 'men', 'man', 'boy', 'boys') then 'M'
        when lower(coalesce(to_jsonb(r)->>'event_name', to_jsonb(r)->>'event', ''))
             ~ '\m(women|womens|woman|girls|girl|ladies|female)\M' then 'F'
        when lower(coalesce(to_jsonb(r)->>'event_name', to_jsonb(r)->>'event', ''))
             ~ '\m(men|mens|man|boys|boy|male)\M' then 'M'
        else null
      end as g
    from meet_results r
    left join meets m on m.id = r.meet_id
    where
      -- need at least one filter, otherwise we'd return everyone
      ((select count(*) from name_tokens) + (select count(*) from club_tokens) > 0
        or p_age is not null
        or p_gender is not null)
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
  )
  select s.swimmer_name, s.team_name, s.latest_age, s.result_count, s.meet_count, s.gender
  from (
    select
      g.swimmer_name,
      g.team_name,
      (array_agg(g.swimmer_age order by g.sdate desc nulls last))[1] as latest_age,
      count(*)::bigint as result_count,
      count(distinct g.meet_id)::bigint as meet_count,
      max(g.g) as gender
    from rows_g g
    group by g.swimmer_name, g.team_name
  ) s
  where (p_age is null or s.latest_age = p_age)
    and (p_gender is null or s.gender = upper(left(p_gender, 1)))
  order by s.result_count desc, s.swimmer_name
  limit 40;
$$;

revoke all on function public.search_all_swimmers(text, text, integer, text) from public, anon;
grant execute on function public.search_all_swimmers(text, text, integer, text) to authenticated;
