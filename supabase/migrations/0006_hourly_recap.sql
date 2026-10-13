-- Relay recap — hourly counters per room, so the day and week summaries outlive the 24-hour event log
-- Additive: one table, an AFTER INSERT trigger that can never fail an insert, two read RPCs, a one-time backfill

create table if not exists public.relay_hourly (
  room       text not null,
  hour       timestamptz not null,
  prompts    int not null default 0,
  tools      int not null default 0,
  dispatches int not null default 0,
  fails      int not null default 0,
  answers    int not null default 0,
  asks       int not null default 0,
  sessions   jsonb not null default '{}'::jsonb,
  agents     jsonb not null default '{}'::jsonb,
  tools_by   jsonb not null default '{}'::jsonb,
  projects   jsonb not null default '{}'::jsonb,
  mins       jsonb not null default '{}'::jsonb,
  primary key (room, hour)
);

alter table public.relay_hourly enable row level security;
revoke all on table public.relay_hourly from anon, authenticated;

create or replace function public.relay_jsonb_add(a jsonb, b jsonb)
returns jsonb
language sql
immutable
set search_path = ''
as $$
  select coalesce(jsonb_object_agg(k, coalesce((a->>k)::int, 0) + coalesce((b->>k)::int, 0)), '{}'::jsonb)
  from (select jsonb_object_keys(a) as k union select jsonb_object_keys(b)) s
$$;

create or replace function public.relay_hourly_add(p_room text, p_at timestamptz, e jsonb)
returns void
language plpgsql
set search_path = ''
as $$
declare
  k text := e->>'kind';
  cwd text := e->>'cwd';
  label text;
  one jsonb;
begin
  if k is null or k = 'roster' then
    return;
  end if;
  label := coalesce(substring(cwd from '/worktrees/([^/]+)'), nullif(regexp_replace(rtrim(cwd, '/'), '^.*/', ''), ''));
  insert into public.relay_hourly as t
    (room, hour, prompts, tools, dispatches, fails, answers, asks, sessions, agents, tools_by, projects, mins)
  values (
    p_room,
    date_trunc('hour', p_at),
    (k = 'prompt' and e->>'tool' = 'питання')::int,
    (k = 'tool')::int,
    (k = 'dispatch')::int,
    (k = 'fail')::int,
    (k = 'stop')::int,
    (k = 'notify')::int,
    case when e->>'session' is not null then jsonb_build_object(e->>'session', 1) else '{}'::jsonb end,
    case when k = 'dispatch' then jsonb_build_object(coalesce(e->>'target', 'agent'), 1) else '{}'::jsonb end,
    case when k = 'tool' then jsonb_build_object(coalesce(e->>'tool', '?'), 1) else '{}'::jsonb end,
    case when label is not null and k = 'prompt' then jsonb_build_object(label, 1) else '{}'::jsonb end,
    jsonb_build_object(extract(minute from p_at)::int::text, 1)
  )
  on conflict (room, hour) do update set
    prompts    = t.prompts + excluded.prompts,
    tools      = t.tools + excluded.tools,
    dispatches = t.dispatches + excluded.dispatches,
    fails      = t.fails + excluded.fails,
    answers    = t.answers + excluded.answers,
    asks       = t.asks + excluded.asks,
    sessions   = t.sessions || excluded.sessions,
    agents     = public.relay_jsonb_add(t.agents, excluded.agents),
    tools_by   = public.relay_jsonb_add(t.tools_by, excluded.tools_by),
    projects   = public.relay_jsonb_add(t.projects, excluded.projects),
    mins       = t.mins || excluded.mins;
end
$$;

create or replace function public.relay_hourly_bump()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  begin
    perform public.relay_hourly_add(new.room, new.at, new.event);
  exception when others then
    null;
  end;
  return null;
end
$$;

create or replace trigger relay_events_hourly
after insert on public.relay_events
for each row execute function public.relay_hourly_bump();

create or replace function public.relay_recap_rows(p_room text, p_since timestamptz)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(jsonb_agg(to_jsonb(h) - 'room' order by h.hour), '[]'::jsonb)
  from public.relay_hourly h
  where p_room ~ '^[0-9a-f]{64}$'
    and h.room = p_room
    and h.hour >= greatest(p_since, now() - interval '35 days')
$$;

create or replace function public.relay_recap(p_key text, p_since timestamptz)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select public.relay_recap_rows(public.relay_room(p_key), p_since)
$$;

create or replace function public.relay_recap_room(p_room text, p_since timestamptz)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select public.relay_recap_rows(p_room, p_since)
$$;

revoke all on function public.relay_jsonb_add(jsonb, jsonb) from public, anon, authenticated;
revoke all on function public.relay_hourly_add(text, timestamptz, jsonb) from public, anon, authenticated;
revoke all on function public.relay_hourly_bump() from public, anon, authenticated;
revoke all on function public.relay_recap_rows(text, timestamptz) from public, anon, authenticated;
revoke all on function public.relay_recap(text, timestamptz) from public;
revoke all on function public.relay_recap_room(text, timestamptz) from public;
grant execute on function public.relay_recap(text, timestamptz) to anon, authenticated;
grant execute on function public.relay_recap_room(text, timestamptz) to anon, authenticated;

do $$
begin
  if not exists (select 1 from public.relay_hourly) then
    perform public.relay_hourly_add(room, at, event) from public.relay_events order by id;
  end if;
end
$$;
