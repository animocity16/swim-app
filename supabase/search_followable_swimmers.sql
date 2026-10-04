-- Natrix stage 1: search-first "Follow swimmer"
-- Run this once in the Supabase SQL editor (project: swim track -sg-2).
-- It ADDS one new function. It does not change any existing table or function.

create or replace function public.search_followable_swimmers(
  p_query text,
  p_age   integer default null
)
returns table (
  swimmer_name text,   -- as stored, e.g. "Tan, Alex"
  team_name    text,
  latest_age   integer,
  result_count bigint
)
language sql
stable
security definer
set search_path = public
as $$
  with tokens as (
    -- split what the parent typed into words; "alex tan" and "tan, alex" behave the same
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
    -- age from the swimmer's most recent dated meet
    (array_agg(r.swimmer_age order by m.parsed_start_date desc nulls last))[1] as latest_age,
    count(*) as result_count
  from meet_results r
  left join meets m on m.id = r.meet_id
  where (select count(*) from tokens) > 0
    -- every word the parent typed must appear in the name
    and not exists (
      select 1 from tokens t
      where position(t.tok in lower(r.swimmer_name)) = 0
    )
  group by r.swimmer_name, r.team_name
  -- optional "same age" lock: within 1 year of the age passed in
  having p_age is null
      or abs(
           (array_agg(r.swimmer_age order by m.parsed_start_date desc nulls last))[1] - p_age
         ) <= 1
  order by count(*) desc, r.swimmer_name
  limit 30;
$$;

-- only logged-in users can call it
revoke all on function public.search_followable_swimmers(text, integer) from public, anon;
grant execute on function public.search_followable_swimmers(text, integer) to authenticated;
