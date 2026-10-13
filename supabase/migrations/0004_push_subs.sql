-- Relay push — phones and browsers that want a ping when Claude waits on you
-- Additive: one new table and three RPCs; nothing existing changes

create table if not exists public.relay_push_subs (
  id         bigint generated always as identity primary key,
  room       text not null,
  endpoint   text not null unique,
  sub        jsonb not null,
  done       boolean not null default false,
  active     boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists relay_push_subs_room_idx on public.relay_push_subs (room) where active;

alter table public.relay_push_subs enable row level security;
revoke all on table public.relay_push_subs from anon, authenticated;

create or replace function public.relay_push_subscribe(p_key text, p_sub jsonb, p_done boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  r text;
  ep text := p_sub->>'endpoint';
begin
  if p_key is null or length(p_key) < 20 or length(p_key) > 128 then
    raise exception 'bad key';
  end if;
  if ep is null or ep !~ '^https://' or length(ep) > 1000 or length(p_sub::text) > 2000
     or coalesce(p_sub->'keys'->>'p256dh', '') = '' or coalesce(p_sub->'keys'->>'auth', '') = '' then
    raise exception 'bad subscription';
  end if;
  r := public.relay_room(p_key);
  if (select count(*) from public.relay_push_subs where room = r and active and endpoint <> ep) >= 10 then
    raise exception 'too many devices';
  end if;
  insert into public.relay_push_subs (room, endpoint, sub, done)
  values (r, ep, jsonb_build_object('endpoint', ep, 'keys', p_sub->'keys'), coalesce(p_done, false))
  on conflict (endpoint) do update
    set room = excluded.room, sub = excluded.sub, done = excluded.done, active = true, updated_at = now();
end
$$;

create or replace function public.relay_push_unsubscribe(p_key text, p_endpoint text)
returns void
language sql
security definer
set search_path = ''
as $$
  update public.relay_push_subs
  set active = false, updated_at = now()
  where endpoint = p_endpoint and room = public.relay_room(p_key)
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
      select jsonb_agg(jsonb_build_object('sub', s.sub, 'done', s.done))
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

revoke all on function public.relay_push_subscribe(text, jsonb, boolean) from public;
revoke all on function public.relay_push_unsubscribe(text, text) from public;
revoke all on function public.relay_push_targets(text, text) from public;
grant execute on function public.relay_push_subscribe(text, jsonb, boolean) to anon, authenticated;
grant execute on function public.relay_push_unsubscribe(text, text) to anon, authenticated;
grant execute on function public.relay_push_targets(text, text) to anon, authenticated;
