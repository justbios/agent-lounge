-- Relay cloud mode — one private room per secret key, events live 24 hours
-- Claude Code hooks → /api/claude-hook?k=<key> → relay_ingest → realtime broadcast on relay:<room>

create table if not exists public.relay_events (
  id    bigint generated always as identity primary key,
  room  text not null,
  at    timestamptz not null default now(),
  event jsonb not null
);
create index if not exists relay_events_room_idx on public.relay_events (room, id);
create index if not exists relay_events_at_idx on public.relay_events (at);

alter table public.relay_events enable row level security;
revoke all on table public.relay_events from anon, authenticated;

create or replace function public.relay_room(p_key text)
returns text
language sql
immutable
set search_path = ''
as $$
  select encode(extensions.digest(p_key, 'sha256'), 'hex')
$$;

create or replace function public.relay_ingest(p_key text, p_events jsonb)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  r text;
  e jsonb;
  new_id bigint;
begin
  if p_key is null or length(p_key) < 20 or length(p_key) > 128 then
    raise exception 'bad key';
  end if;
  if jsonb_typeof(p_events) <> 'array' or jsonb_array_length(p_events) > 10 then
    raise exception 'bad events';
  end if;
  r := public.relay_room(p_key);
  for e in select value from jsonb_array_elements(p_events) loop
    continue when jsonb_typeof(e) <> 'object' or length(e::text) > 4000;
    insert into public.relay_events (room, event) values (r, e) returning id into new_id;
    perform realtime.send(e || jsonb_build_object('seq', new_id), 'ev', 'relay:' || r, false);
  end loop;
  delete from public.relay_events
  where room = r and id <= (
    select id from public.relay_events where room = r order by id desc offset 5000 limit 1
  );
end
$$;

create or replace function public.relay_snapshot(p_key text)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'room', public.relay_room(p_key),
    'events', coalesce(jsonb_agg(x.ev order by x.id), '[]'::jsonb)
  )
  from (
    select id, event || jsonb_build_object('seq', id) as ev
    from public.relay_events
    where room = public.relay_room(p_key)
    order by id desc
    limit 5000
  ) x
$$;

revoke all on function public.relay_room(text) from public, anon, authenticated;
revoke all on function public.relay_ingest(text, jsonb) from public;
revoke all on function public.relay_snapshot(text) from public;
grant execute on function public.relay_ingest(text, jsonb) to anon, authenticated;
grant execute on function public.relay_snapshot(text) to anon, authenticated;

create extension if not exists pg_cron;
select cron.schedule(
  'relay-events-retention',
  '17 * * * *',
  $$delete from public.relay_events where at < now() - interval '24 hours'$$
);
