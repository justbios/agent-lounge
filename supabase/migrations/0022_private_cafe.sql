-- Relay private café — a personal site closes itself to cafés it has never seen
-- Opt-in: applying this changes nothing until the site's owner runs, in the SQL editor,
--   select public.relay_private(true);    -- closed: no new cafés
--   select public.relay_private(false);   -- open again
--  · every room the site knows when it closes stays open: its shared key, personal keys and team invites go on working
--  · while closed, a room the site has never seen can't send events, keep a cat or a theme, chat, keep scores, take a
--    push subscription or start personal keys; relay_ingest answers 'cafe closed', which the hook route turns into 410
--  · a new café of the owner's own (a separate team café, a fresh key) needs the site open until its Claude sends one
--    event; closing again keeps it
--  · NEXT_PUBLIC_RELAY_PRIVATE=1 is the browser's half: no fresh key for a visitor, a pointer to the project instead.
--    The public key reaches every relay_* RPC directly, so this gate is the one that holds.

create table if not exists public.relay_settings (
  id        boolean primary key default true check (id),
  closed    boolean not null default false,
  closed_at timestamptz
);

insert into public.relay_settings (id) values (true) on conflict (id) do nothing;
alter table public.relay_settings enable row level security;
revoke all on table public.relay_settings from anon, authenticated;

-- The gate: while closed, a first row for a room that isn't in relay_room_seen is refused. relay_ingest files every
-- room it hasn't seen there before its first event, so a refusal on relay_room_seen stops the events too.

create or replace function public.relay_gate_room()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if exists (select 1 from public.relay_settings s where s.closed)
     and (tg_table_name = 'relay_room_seen'
          or not exists (select 1 from public.relay_room_seen s where s.room = new.room)) then
    raise exception 'cafe closed';
  end if;
  return new;
end
$$;

revoke all on function public.relay_gate_room() from public, anon, authenticated;

do $$
declare
  t text;
begin
  foreach t in array array['relay_room_seen', 'relay_rooms', 'relay_member_rooms', 'relay_keys', 'relay_chat',
                           'relay_scores', 'relay_push_subs'] loop
    continue when to_regclass('public.' || t) is null;
    execute format('drop trigger if exists relay_gate_room on public.%I', t);
    execute format('create trigger relay_gate_room before insert on public.%I '
                   'for each row execute function public.relay_gate_room()', t);
  end loop;
end
$$;

-- The switch, for the owner only (no anon, no authenticated). Closing first files every room the site holds as seen,
-- so a café that has a cat or keys but no events yet stays open; seeded rooms don't count toward 0021's hourly cap.

create or replace function public.relay_private(p_closed boolean)
returns jsonb
language plpgsql
set search_path = ''
as $$
begin
  update public.relay_settings set closed = false where id;
  if p_closed then
    insert into public.relay_room_seen (room, first_at)
    select x.room, now() - interval '1 hour'
    from (
      select e.room from public.relay_events e
      union select r.room from public.relay_rooms r
      union select k.room from public.relay_keys k
      union select m.room from public.relay_member_rooms m
      union select c.room from public.relay_chat c
      union select s.room from public.relay_scores s
      union select p.room from public.relay_push_subs p
    ) x
    on conflict (room) do nothing;
    update public.relay_settings set closed = true, closed_at = now() where id;
  else
    update public.relay_settings set closed_at = null where id;
  end if;
  return jsonb_build_object('closed', p_closed, 'rooms', (select count(*) from public.relay_room_seen));
end
$$;

revoke all on function public.relay_private(boolean) from public, anon, authenticated;
