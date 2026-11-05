-- Natrix: "All meets" search
-- Run this ONCE in the Supabase SQL editor (project: swim track -sg-2).
-- It ADDS three new functions. It does not change any existing table or function.
-- Meet name / date are read defensively so this works whatever the exact column names are.

-- 1) Search every meet in the database (by name words and/or year)
create or replace function public.search_meets(
  p_query text default null,
  p_year  integer default null
)
returns table (
  meet_id       text,
  meet_name     text,
  start_date    text,
  result_count  bigint,
  swimmer_count bigint
)
language sql
stable
security definer
set search_path = public
as $$
  with mm as (
    select
      m.id::text as mid,
      coalesce(
        nullif(to_jsonb(m)->>'name', ''),
        nullif(to_jsonb(m)->>'meet_name', ''),
        nullif(to_jsonb(m)->>'title', ''),
        'Untitled meet'
      ) as mname,
      to_jsonb(m)->>'parsed_start_date' as sdate
    from meets m
  ),
  tokens as (
    select distinct lower(t) as tok
    from regexp_split_to_table(coalesce(p_query, ''), '\s+') as t
    where length(t) >= 1
  )
  select
    mm.mid,
    mm.mname,
    mm.sdate,
    count(*)::bigint,
    count(distinct r.swimmer_name)::bigint
  from mm
  join meet_results r on r.meet_id::text = mm.mid
  where not exists (
          select 1 from tokens t
          where position(t.tok in lower(mm.mname)) = 0
        )
    and (p_year is null or left(coalesce(mm.sdate, ''), 4) = p_year::text)
  group by mm.mid, mm.mname, mm.sdate
  order by mm.sdate desc nulls last, mm.mname
  limit 60;
$$;

-- 2) Name + date of one meet (for the page header)
create or replace function public.get_meet_info(p_meet_id text)
returns table (
  meet_name  text,
  start_date text
)
language sql
stable
security definer
set search_path = public
as $$
  select
    coalesce(
      nullif(to_jsonb(m)->>'name', ''),
      nullif(to_jsonb(m)->>'meet_name', ''),
      nullif(to_jsonb(m)->>'title', ''),
      'Untitled meet'
    ),
    to_jsonb(m)->>'parsed_start_date'
  from meets m
  where m.id::text = p_meet_id
  limit 1;
$$;

-- 3) Every result row in one meet (returned as JSON so it can't break on column names)
create or replace function public.get_meet_results(p_meet_id text)
returns setof jsonb
language sql
stable
security definer
set search_path = public
as $$
  select to_jsonb(r)
  from meet_results r
  where r.meet_id::text = p_meet_id
  limit 8000;
$$;

-- only logged-in users can call them
revoke all on function public.search_meets(text, integer)  from public, anon;
revoke all on function public.get_meet_info(text)          from public, anon;
revoke all on function public.get_meet_results(text)       from public, anon;
grant execute on function public.search_meets(text, integer) to authenticated;
grant execute on function public.get_meet_info(text)         to authenticated;
grant execute on function public.get_meet_results(text)      to authenticated;
