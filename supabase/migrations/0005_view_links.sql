-- Relay view links — a read-only room snapshot by sha256(key), for /#v=<room>
-- Additive: one new read-only RPC; the live channel relay:<room> was already readable by its name

create or replace function public.relay_snapshot_room(p_room text)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'room', p_room,
    'events', coalesce(jsonb_agg(x.ev order by x.id), '[]'::jsonb)
  )
  from (
    select id, event || jsonb_build_object('seq', id) as ev
    from public.relay_events
    where p_room ~ '^[0-9a-f]{64}$' and room = p_room
    order by id desc
    limit 5000
  ) x
$$;

revoke all on function public.relay_snapshot_room(text) from public;
grant execute on function public.relay_snapshot_room(text) to anon, authenticated;
