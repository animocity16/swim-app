-- Natrix: search ANY swimmer in the saved meet data (no age lock, no need to follow).
-- Run this ONCE in the Supabase SQL editor (project: swim track -sg-2).
-- It ADDS two new functions. It does not change any existing table or function.

-- 1) Find swimmers by name across every saved meet
create or replace function public.search_all_swimmers(p_query text)
returns table (
  swimmer_name text,   -- as stored, e.g. "Tan, Alex"
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
  with tokens as (
    -- "alex tan" and "tan, alex" behave the same
    select distinct lower(t) as tok
    from regexp_split_to_table(
           regexp_replace(coalesce(p_query, ''), '[,]+', ' ', 'g'),
           '\s+'
         ) as t
    where length(t) >= 2
  )
  select
    r.swimmer_name,
    r.team_name,
    (array_agg(r.swimmer_age order by to_jsonb(m)->>'parsed_start_date' desc nulls last))[1] as latest_age,
    count(*)::bigint as result_count,
    count(distinct r.meet_id)::bigint as meet_count
  from meet_results r
  left join meets m on m.id = r.meet_id
  where (select count(*) from tokens) > 0
    and not exists (
      select 1 from tokens t
      where position(t.tok in lower(r.swimmer_name)) = 0
    )
  group by r.swimmer_name, r.team_name
  order by count(*) desc, r.swimmer_name
  limit 40;
$$;

-- 2) Every result for one swimmer (JSON, with the meet's name and date added)
create or replace function public.get_swimmer_results(
  p_swimmer_name text,
  p_team_name    text default null
)
returns setof jsonb
language sql
stable
security definer
set search_path = public
as $$
  select
    to_jsonb(r) || jsonb_build_object(
      '_meet_name', coalesce(
        nullif(to_jsonb(m)->>'name', ''),
        nullif(to_jsonb(m)->>'meet_name', ''),
        nullif(to_jsonb(m)->>'title', ''),
        'Untitled meet'
      ),
      '_meet_date', to_jsonb(m)->>'parsed_start_date'
    )
  from meet_results r
  left join meets m on m.id = r.meet_id
  where r.swimmer_name = p_swimmer_name
    and (p_team_name is null or r.team_name = p_team_name)
  order by to_jsonb(m)->>'parsed_start_date' desc nulls last
  limit 3000;
$$;

-- only logged-in users can call them
revoke all on function public.search_all_swimmers(text)          from public, anon;
revoke all on function public.get_swimmer_results(text, text)    from public, anon;
grant execute on function public.search_all_swimmers(text)       to authenticated;
grant execute on function public.get_swimmer_results(text, text) to authenticated;
