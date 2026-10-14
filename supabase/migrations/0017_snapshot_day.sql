-- Relay whole-day snapshot — a room keeps up to 12000 events instead of 5000; the snapshot sends the day's
-- prompts, handoffs and answers in full and only the last 3000 tool calls, so a busy day no longer forgets its morning
-- Additive for the data: the cap only rises, nothing is deleted that the old rule would have kept

create index if not exists relay_events_room_tool_idx
  on public.relay_events (room, id) where event->>'kind' = 'tool';
create index if not exists relay_events_room_story_idx
  on public.relay_events (room, id) where event->>'kind' is distinct from 'tool';

create or replace function public.relay_ingest(p_key text, p_events jsonb)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  r text;
  t text;
  m text;
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
  t := public.relay_topic(r);
  m := public.relay_key_name(p_key);
  for e in select value from jsonb_array_elements(p_events) loop
    continue when jsonb_typeof(e) <> 'object' or length(e::text) > 4000;
    if m is not null then
      e := e || jsonb_build_object('member', m);
    end if;
    insert into public.relay_events (room, event) values (r, e) returning id into new_id;
    perform realtime.send(e || jsonb_build_object('seq', new_id), 'ev', 'relay:' || t, false);
  end loop;
  -- the cap is checked every 50th event: a full scan per tool call costs more than 50 spare rows
  if new_id % 50 = 0 then
    delete from public.relay_events
    where room = r and id <= (
      select id from public.relay_events where room = r order by id desc offset 12000 limit 1
    );
  end if;
end
$$;

create or replace function public.relay_snapshot(p_key text)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  with room as (select public.relay_room(p_key) as r)
  select jsonb_build_object(
    'room', (select r from room),
    'events', coalesce(jsonb_agg(x.event || jsonb_build_object('seq', x.id) order by x.id), '[]'::jsonb)
  )
  from (
    (select id, event from public.relay_events
     where room = (select r from room) and event->>'kind' is distinct from 'tool' order by id desc limit 3000)
    union all
    (select id, event from public.relay_events
     where room = (select r from room) and event->>'kind' = 'tool' order by id desc limit 3000)
  ) x
$$;

create or replace function public.relay_snapshot_room(p_room text)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  with room as (select public.relay_view_room(p_room) as r)
  select jsonb_build_object(
    'room', p_room,
    'events', coalesce(jsonb_agg(x.event || jsonb_build_object('seq', x.id) order by x.id), '[]'::jsonb)
  )
  from (
    (select id, event from public.relay_events
     where room = (select r from room) and event->>'kind' is distinct from 'tool' order by id desc limit 3000)
    union all
    (select id, event from public.relay_events
     where room = (select r from room) and event->>'kind' = 'tool' order by id desc limit 3000)
  ) x
$$;
