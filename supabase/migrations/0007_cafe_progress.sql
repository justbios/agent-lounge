-- Relay café grows — lifetime progress per room for achievements, and per-room café settings (cat name, theme)
-- Additive: one table, read RPCs over relay_hourly, one guarded settings writer

create table if not exists public.relay_rooms (
  room       text primary key,
  cat_name   text,
  theme      text,
  updated_at timestamptz not null default now()
);

alter table public.relay_rooms enable row level security;
revoke all on table public.relay_rooms from anon, authenticated;

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
      bool_or(extract(hour from lh) between 5 and 6 and prompts > 0) as early
    from h
    group by 1
  )
  select jsonb_build_object(
    'days', coalesce((select jsonb_agg(to_jsonb(d) order by d.day) from d), '[]'::jsonb),
    'agents', (select count(distinct k) from h, jsonb_object_keys(h.agents) k),
    'tools', (select count(distinct k) from h, jsonb_object_keys(h.tools_by) k),
    'projects', (select count(distinct k) from h, jsonb_object_keys(h.projects) k),
    'chats', (select count(distinct k) from h, jsonb_object_keys(h.sessions) k),
    'room', (select jsonb_build_object('cat_name', r.cat_name, 'theme', r.theme) from public.relay_rooms r where r.room = p_room)
  )
$$;

create or replace function public.relay_progress(p_key text, p_tz_min int)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select public.relay_progress_rows(public.relay_room(p_key), p_tz_min)
$$;

create or replace function public.relay_progress_room(p_room text, p_tz_min int)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select public.relay_progress_rows(p_room, p_tz_min)
$$;

create or replace function public.relay_room_set(p_key text, p_patch jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  r text;
  cat text := nullif(btrim(p_patch->>'cat_name'), '');
  th text := nullif(p_patch->>'theme', '');
begin
  if p_key is null or length(p_key) < 20 or length(p_key) > 128 then
    raise exception 'bad key';
  end if;
  if cat is not null and length(cat) > 24 then
    raise exception 'cat name too long';
  end if;
  if th is not null and th !~ '^[a-z]{2,16}$' then
    raise exception 'bad theme';
  end if;
  r := public.relay_room(p_key);
  insert into public.relay_rooms as t (room, cat_name, theme)
  values (r, cat, th)
  on conflict (room) do update set
    cat_name = case when p_patch ? 'cat_name' then excluded.cat_name else t.cat_name end,
    theme = case when p_patch ? 'theme' then excluded.theme else t.theme end,
    updated_at = now();
  return (select jsonb_build_object('cat_name', x.cat_name, 'theme', x.theme) from public.relay_rooms x where x.room = r);
end
$$;

revoke all on function public.relay_progress_rows(text, int) from public, anon, authenticated;
revoke all on function public.relay_progress(text, int) from public;
revoke all on function public.relay_progress_room(text, int) from public;
revoke all on function public.relay_room_set(text, jsonb) from public;
grant execute on function public.relay_progress(text, int) to anon, authenticated;
grant execute on function public.relay_progress_room(text, int) to anon, authenticated;
grant execute on function public.relay_room_set(text, jsonb) to anon, authenticated;
