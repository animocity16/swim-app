-- Natrix: let the swimmer search's Club filter understand short names (SSC, CSC, APSC ...).
-- Run this ONCE in the Supabase SQL editor (project: swim track -sg-2).
-- It REPLACES search_all_swimmers with a smarter version. Your data is not changed.
-- It reads your existing "clubs" table (full names + short codes) without needing
-- to know its column names, so "csc" finds the Singapore Chinese Swimming Club and
-- "singapore chinese" finds swimmers whose club is stored as "CSC".
-- Safe to run BEFORE or AFTER the new app code goes live.

create or replace function public.search_all_swimmers(
  p_query  text    default null,   -- name words, e.g. "alex tan" or "tan, alex"
  p_club   text    default null,   -- club words or short name, e.g. "ssc" or "singapore swimming"
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
  -- For every club name in the results, collect ALL the names we know for it:
  -- the name as saved, plus every text value in the matching row of the clubs table
  -- (full name, short code, ...). Only built when a club filter is being used.
  team_text as (
    select
      t.team_name,
      lower(t.team_name) || ' ' || coalesce((
        select string_agg(lower(e.value), ' ')
        from public.clubs c
        cross join lateral jsonb_each_text(to_jsonb(c)) e
        where e.value !~ '^[0-9a-fA-F-]{20,}$'
          and e.value !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}'
          and length(e.value) <= 120
          and exists (
            select 1 from jsonb_each_text(to_jsonb(c)) x
            where lower(x.value) = lower(t.team_name)
          )
      ), '') as txt
    from (select distinct mr.team_name from meet_results mr where mr.team_name is not null) t
    where (select count(*) from club_tokens) > 0
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
    left join team_text tt on tt.team_name = r.team_name
    where
      ((select count(*) from name_tokens) + (select count(*) from club_tokens) > 0
        or p_age is not null
        or p_gender is not null)
      and not exists (
        select 1 from name_tokens t
        where position(t.tok in lower(coalesce(r.swimmer_name, ''))) = 0
      )
      -- every club word must appear in the club's name OR any of its known short names
      and not exists (
        select 1 from club_tokens c
        where position(c.tok in coalesce(tt.txt, lower(coalesce(r.team_name, '')))) = 0
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
