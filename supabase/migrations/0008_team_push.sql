-- Relay team café — a push device belongs to one teammate, so a teammate's Claude does not ring everyone's phone
-- Additive: one nullable column, a 4-argument subscribe beside the 3-argument one, targets also report the member

alter table public.relay_push_subs add column if not exists member text;

create or replace function public.relay_push_subscribe(p_key text, p_sub jsonb, p_done boolean, p_member text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  r text;
  ep text := p_sub->>'endpoint';
  m text := nullif(btrim(p_member), '');
begin
  if p_key is null or length(p_key) < 20 or length(p_key) > 128 then
    raise exception 'bad key';
  end if;
  if ep is null or ep !~ '^https://' or length(ep) > 1000 or length(p_sub::text) > 2000
     or coalesce(p_sub->'keys'->>'p256dh', '') = '' or coalesce(p_sub->'keys'->>'auth', '') = '' then
    raise exception 'bad subscription';
  end if;
  if m is not null and length(m) > 24 then
    raise exception 'bad member';
  end if;
  r := public.relay_room(p_key);
  if (select count(*) from public.relay_push_subs where room = r and active and endpoint <> ep) >= 10 then
    raise exception 'too many devices';
  end if;
  insert into public.relay_push_subs (room, endpoint, sub, done, member)
  values (r, ep, jsonb_build_object('endpoint', ep, 'keys', p_sub->'keys'), coalesce(p_done, false), m)
  on conflict (endpoint) do update
    set room = excluded.room, sub = excluded.sub, done = excluded.done, member = excluded.member, active = true, updated_at = now();
end
$$;

create or replace function public.relay_push_targets(p_key text, p_session text)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'targets', coalesce((
      select jsonb_agg(jsonb_build_object('sub', s.sub, 'done', s.done, 'member', s.member))
      from public.relay_push_subs s
      where s.room = public.relay_room(p_key) and s.active
    ), '[]'::jsonb),
    'ask', (
      select e.event->>'text'
      from public.relay_events e
      where e.room = public.relay_room(p_key)
        and e.event->>'session' = p_session
        and e.event->>'kind' = 'prompt'
        and e.event->>'tool' = 'питання'
      order by e.id desc
      limit 1
    )
  )
$$;

revoke all on function public.relay_push_subscribe(text, jsonb, boolean, text) from public;
grant execute on function public.relay_push_subscribe(text, jsonb, boolean, text) to anon, authenticated;
