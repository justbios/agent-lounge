-- Relay learning achievements — every day of progress also lists the tools used that day and the most different
-- agents handed work in one of its hours. Additive: two read-only functions gain two fields; nothing is stored

create or replace function public.relay_progress_rows(p_room text, p_tz_min int)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  with h as (
    select *, hour + make_interval(mins => greatest(-840, least(840, coalesce(p_tz_min, 0)))) as lh
    from public.relay_hourly
    where p_room ~ '^[0-9a-f]{64}$' and room = p_room
  ),
  d as (
    select lh::date as day,
      sum(prompts)::int as prompts,
      sum(tools)::int as tools,
      sum(dispatches)::int as dispatches,
      sum(fails)::int as fails,
      sum(answers)::int as answers,
      max(dispatches)::int as peak_hour,
      sum((select count(*) from jsonb_object_keys(mins)))::int as minutes,
      bool_or(extract(hour from lh) < 5 and prompts > 0) as night,
      bool_or(extract(hour from lh) between 5 and 6 and prompts > 0) as early,
      sum(tok_in + tok_cw + tok_cr + tok_out)::bigint as tokens,
      max((select count(*) from jsonb_object_keys(agents)))::int as crowd
    from h
    group by 1
  ),
  kd as (
    select lh::date as day, jsonb_agg(distinct t) as kinds
    from h, jsonb_object_keys(h.tools_by) t
    group by 1
  )
  select jsonb_build_object(
    'days', coalesce(
      (select jsonb_agg(to_jsonb(d) || jsonb_build_object('kinds', coalesce(kd.kinds, '[]'::jsonb)) order by d.day)
       from d left join kd using (day)),
      '[]'::jsonb
    ),
    'agents', (select count(distinct k) from h, jsonb_object_keys(h.agents) k),
    'tools', (select count(distinct k) from h, jsonb_object_keys(h.tools_by) k),
    'projects', (select count(distinct k) from h, jsonb_object_keys(h.projects) k),
    'chats', (select count(distinct k) from h, jsonb_object_keys(h.sessions) k),
    'room', (
      select jsonb_build_object('cat_name', r.cat_name, 'theme', r.theme, 'interior', r.interior)
      from public.relay_rooms r where r.room = p_room
    )
  )
$$;

create or replace function public.relay_member_progress_rows(p_room text, p_member text, p_tz_min int)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  with h as (
    select *, hour + make_interval(mins => greatest(-840, least(840, coalesce(p_tz_min, 0)))) as lh
    from public.relay_hourly_members
    where room = p_room and member = p_member
  ),
  d as (
    select lh::date as day,
      sum(prompts)::int as prompts,
      sum(tools)::int as tools,
      sum(dispatches)::int as dispatches,
      sum(fails)::int as fails,
      sum(answers)::int as answers,
      max(dispatches)::int as peak_hour,
      sum((select count(*) from jsonb_object_keys(mins)))::int as minutes,
      bool_or(extract(hour from lh) < 5 and prompts > 0) as night,
      bool_or(extract(hour from lh) between 5 and 6 and prompts > 0) as early,
      sum(tok_in + tok_cw + tok_cr + tok_out)::bigint as tokens,
      max((select count(*) from jsonb_object_keys(agents)))::int as crowd
    from h
    group by 1
  ),
  kd as (
    select lh::date as day, jsonb_agg(distinct t) as kinds
    from h, jsonb_object_keys(h.tools_by) t
    group by 1
  )
  select jsonb_build_object(
    'days', coalesce(
      (select jsonb_agg(to_jsonb(d) || jsonb_build_object('kinds', coalesce(kd.kinds, '[]'::jsonb)) order by d.day)
       from d left join kd using (day)),
      '[]'::jsonb
    ),
    'agents', (select count(distinct k) from h, jsonb_object_keys(h.agents) k),
    'tools', (select count(distinct k) from h, jsonb_object_keys(h.tools_by) k),
    'projects', (select count(distinct k) from h, jsonb_object_keys(h.projects) k),
    'chats', (select count(distinct k) from h, jsonb_object_keys(h.sessions) k),
    'room', (
      select jsonb_build_object('cat_name', r.cat_name, 'theme', r.theme, 'interior', r.interior)
      from public.relay_member_rooms r where r.room = p_room and r.member = p_member
    )
  )
$$;
