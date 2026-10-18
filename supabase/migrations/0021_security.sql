-- Relay security — closes what an open-source launch would expose
--  · the old pipeline tables (0001/0002) were readable by anyone with the public key, ingest tokens included;
--    no live code uses them: they are shut, their data is kept
--  · room channels become private Realtime channels that browsers may listen to but not send on, so nobody who
--    knows a room's topic can slip fake events or a fake «rekey» into someone's café
--  · an answer from the café to Claude carries the paired device's signature, which the computer itself checks
--    (relay.sh 6); the unsigned ask RPCs of 0019/0020 are dropped, so an older script never gets a remote answer
--  · events per room per minute and new rooms per hour are capped; old asks lose their text after a day and go
--    after 30 days
-- Ship together with the code that calls the new RPCs: the old code's asks fail closed (the terminal asks).

-- 1. The old pipeline tables: no reads, no writes, no Realtime for anon or authenticated

drop policy if exists "public read runs" on public.agent_runs;
drop policy if exists "public read events" on public.agent_events;
drop policy if exists "public read project (no token)" on public.relay_projects;
revoke all on table public.agent_runs, public.agent_events, public.relay_projects from anon, authenticated;

do $$
declare
  t text;
begin
  foreach t in array array['agent_runs', 'agent_events', 'relay_projects'] loop
    if exists (select 1 from pg_publication_tables p
               where p.pubname = 'supabase_realtime' and p.schemaname = 'public' and p.tablename = t) then
      execute format('alter publication supabase_realtime drop table public.%I', t);
    end if;
  end loop;
end
$$;

-- 2. Room channels: private, listen-only. Only the database sends on relay:<topic>; there is no insert policy, so a
--    browser's own broadcast on a private channel is refused. relay-social and the games stay public channels.

drop policy if exists "relay rooms: listen" on realtime.messages;
create policy "relay rooms: listen" on realtime.messages
  for select to anon, authenticated
  using (realtime.messages.extension = 'broadcast' and (select realtime.topic()) like 'relay:%');

-- 3. Caps: a room takes up to 600 events a minute (Claude with a busy team sends far fewer), and the whole site
--    lets up to 200 new rooms appear an hour. Rooms known before this migration don't count as new.

create table if not exists public.relay_room_seen (
  room     text primary key,
  first_at timestamptz not null default now()
);

create index if not exists relay_room_seen_first on public.relay_room_seen (first_at);
alter table public.relay_room_seen enable row level security;
revoke all on table public.relay_room_seen from anon, authenticated;

insert into public.relay_room_seen (room, first_at)
select x.room, now() - interval '1 hour'
from (
  select e.room from public.relay_events e
  union select r.room from public.relay_rooms r
  union select k.room from public.relay_keys k
) x
on conflict (room) do nothing;

create index if not exists relay_events_room_at_idx on public.relay_events (room, at);

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
  if not exists (select 1 from public.relay_room_seen s where s.room = r) then
    perform pg_advisory_xact_lock(hashtext('relay_room_seen'));
    if (select count(*) from public.relay_room_seen s where s.first_at > now() - interval '1 hour') >= 200 then
      raise exception 'too many new rooms';
    end if;
    insert into public.relay_room_seen (room) values (r) on conflict (room) do nothing;
  end if;
  if (select count(*) from (
        select 1 from public.relay_events x where x.room = r and x.at > now() - interval '1 minute' limit 600
      ) c) >= 600 then
    return;
  end if;
  t := public.relay_topic(r);
  m := public.relay_key_name(p_key);
  for e in select value from jsonb_array_elements(p_events) loop
    continue when jsonb_typeof(e) <> 'object' or length(e::text) > 4000;
    if m is not null then
      e := e || jsonb_build_object('member', m);
    end if;
    insert into public.relay_events (room, event) values (r, e) returning id into new_id;
    perform realtime.send(e || jsonb_build_object('seq', new_id), 'ev', 'relay:' || t, true);
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

-- 4. «rekey» goes out on the private channel too (0015's relay_keys_start and 0014's relay_key_remove otherwise
--    unchanged)

create or replace function public.relay_keys_start(p_key text, p_name text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  n text := public.relay_clean_name(p_name);
  r text;
  k text := public.relay_new_key();
begin
  if p_key is null or length(p_key) < 20 or length(p_key) > 128 then
    raise exception 'bad key';
  end if;
  if public.relay_key_name(p_key) is not null then
    raise exception 'already personal';
  end if;
  r := public.relay_room(p_key);
  perform pg_advisory_xact_lock(hashtext('relay_keys:' || r));
  if exists (select 1 from public.relay_rooms x where x.room = r and x.locked) then
    raise exception 'key retired';
  end if;
  insert into public.relay_keys (key_hash, room, name, role)
  values (encode(extensions.digest(k, 'sha256'), 'hex'), r, n, 'owner');
  insert into public.relay_rooms as t (room, locked, alias)
  values (r, true, encode(extensions.gen_random_bytes(32), 'hex'))
  on conflict (room) do update set locked = true, alias = excluded.alias, updated_at = now();
  insert into public.relay_member_rooms (room, member, cat_name, theme, interior)
  select r, n, x.cat_name, x.theme, x.interior - 'paid' from public.relay_rooms x where x.room = r
  on conflict (room, member) do nothing;
  perform realtime.send('{}'::jsonb, 'rekey', 'relay:' || r, true);
  return jsonb_build_object('key', k, 'name', n);
end
$$;

create or replace function public.relay_key_remove(p_key text, p_name text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  r text := public.relay_owner_room(p_key);
  old text;
  gone int;
begin
  perform pg_advisory_xact_lock(hashtext('relay_keys:' || r));
  update public.relay_keys x set revoked_at = now()
  where x.room = r and x.revoked_at is null and x.role = 'member' and lower(x.name) = lower(btrim(p_name));
  get diagnostics gone = row_count;
  if gone = 0 then
    raise exception 'no such member';
  end if;
  update public.relay_push_subs s set active = false, updated_at = now()
  where s.room = r and s.active and lower(s.member) = lower(btrim(p_name));
  select x.alias into old from public.relay_rooms x where x.room = r;
  update public.relay_rooms x set alias = encode(extensions.gen_random_bytes(32), 'hex'), updated_at = now()
  where x.room = r;
  perform realtime.send('{}'::jsonb, 'rekey', 'relay:' || old, true);
  return public.relay_keys_rows(r);
end
$$;

-- 5. Signed answers. The computer (relay.sh) keeps a secret it shares only with the devices it was paired with;
--    kid names that secret. An ask carries the hook's JSON exactly as the computer sent it (raw), so the device shows
--    what Claude asked, not what the server says, and signs HMAC-SHA256(secret, id:answer:sha256(raw):u), where u is
--    Claude's input to pass back (empty for a permission). The database only keeps the signature; the computer checks
--    it and ignores any answer it can't verify.

alter table public.relay_asks add column if not exists kid text;
alter table public.relay_asks add column if not exists raw text;
alter table public.relay_asks add column if not exists u text;
alter table public.relay_asks add column if not exists sig text;
alter table public.relay_asks add column if not exists answered_by text;

drop function if exists public.relay_ask_open(text, text, text, text, text);
drop function if exists public.relay_ask_open(text, text, text, text, text, jsonb);
drop function if exists public.relay_ask_wait(text, uuid);
drop function if exists public.relay_ask_answer(text, uuid, boolean);
drop function if exists public.relay_ask_reply(text, uuid, jsonb);

create or replace function public.relay_ask_open(
  p_key text, p_session text, p_label text, p_tool text, p_detail text, p_body jsonb, p_kid text, p_raw text
)
returns uuid
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  h text := public.relay_ask_hash(p_key);
  v uuid;
begin
  -- null means only «not away», which switches the computer's side off too; anything else is an error
  if p_kid is null or p_kid !~ '^[0-9a-f]{16}$' or p_raw is null or length(p_raw) < 2 or length(p_raw) > 120000
     or length(coalesce(p_detail, '')) > 4000 then
    raise exception 'bad ask';
  end if;
  if p_body is not null and (jsonb_typeof(p_body) <> 'object' or length(p_body::text) > 100000
      or coalesce(p_body->>'tool', '') not in ('AskUserQuestion', 'ExitPlanMode')
      or jsonb_typeof(p_body->'input') is distinct from 'object') then
    raise exception 'bad ask';
  end if;
  if not exists (select 1 from public.relay_away a where a.key_hash = h and a.until > now()) then
    return null;
  end if;
  if (select count(*) from public.relay_asks x
      where x.key_hash = h and x.answer is null and x.created_at > now() - interval '10 minutes') >= 8 then
    raise exception 'too many asks';
  end if;
  insert into public.relay_asks (key_hash, session, label, tool, detail, body, kid, raw)
  values (h, left(coalesce(p_session, ''), 100), left(coalesce(p_label, ''), 80), left(coalesce(p_tool, ''), 80),
    coalesce(p_detail, ''), p_body, p_kid, p_raw)
  returning id into v;
  return v;
end
$$;

create or replace function public.relay_asks_list(p_key text)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  h text := public.relay_ask_hash(p_key);
  till timestamptz := (select a.until from public.relay_away a where a.key_hash = h and a.until > now());
begin
  return jsonb_build_object(
    'until', till,
    'asks', coalesce((
      select jsonb_agg(jsonb_build_object('id', x.id, 'session', x.session, 'label', x.label, 'tool', x.tool,
        'detail', x.detail, 'at', x.created_at, 'body', x.body, 'kid', x.kid, 'raw', x.raw) order by x.created_at)
      from public.relay_asks x
      where till is not null and x.key_hash = h and x.answer is null and x.kid is not null
        and x.created_at > now() - interval '10 minutes'
    ), '[]'::jsonb)
  );
end
$$;

-- a permission's allow or deny, a plan's approval (u: the plan's input as the device passes it back) or rejection
create or replace function public.relay_ask_answer(p_key text, p_id uuid, p_allow boolean, p_u text, p_sig text)
returns boolean
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  h text := public.relay_ask_hash(p_key);
  b jsonb;
begin
  if p_sig is null or p_sig !~ '^[0-9a-f]{64}$' or length(coalesce(p_u, '')) > 110000 then
    return false;
  end if;
  select a.body into b from public.relay_asks a
  where a.id = p_id and a.key_hash = h and a.answer is null and a.kid is not null
    and a.created_at > now() - interval '10 minutes'
  for update;
  if not found or coalesce(p_allow and b->>'tool' = 'AskUserQuestion', false)
     or coalesce(p_allow and b->>'tool' = 'ExitPlanMode', false) <> (coalesce(p_u, '') <> '') then
    return false;
  end if;
  update public.relay_asks a
  set answer = case when p_allow then 'allow' else 'deny' end, u = nullif(p_u, ''), sig = p_sig,
    answered_at = now(), answered_by = public.relay_key_name(p_key)
  where a.id = p_id;
  return true;
end
$$;

-- one option label per question, several only where multiSelect; u must carry exactly those answers
create or replace function public.relay_ask_reply(p_key text, p_id uuid, p_answers jsonb, p_u text, p_sig text)
returns boolean
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  h text := public.relay_ask_hash(p_key);
  b jsonb;
  q jsonb;
  picked jsonb;
  labels text[];
  chosen text[];
  out jsonb := '{}'::jsonb;
begin
  if p_sig is null or p_sig !~ '^[0-9a-f]{64}$' or p_u is null or length(p_u) > 110000 then
    return false;
  end if;
  select a.body into b from public.relay_asks a
  where a.id = p_id and a.key_hash = h and a.answer is null and a.kid is not null
    and a.created_at > now() - interval '10 minutes'
  for update;
  if not found or b->>'tool' is distinct from 'AskUserQuestion'
     or jsonb_typeof(b #> '{input,questions}') is distinct from 'array'
     or jsonb_typeof(p_answers) is distinct from 'object' then
    return false;
  end if;
  for q in select value from jsonb_array_elements(b #> '{input,questions}') loop
    picked := p_answers -> (q->>'question');
    if jsonb_typeof(picked) is distinct from 'array' or jsonb_array_length(picked) = 0 then
      return false;
    end if;
    if jsonb_typeof(q->'options') is distinct from 'array' then
      return false;
    end if;
    select array_agg(o.value->>'label' order by o.ord) into labels
    from jsonb_array_elements(q->'options') with ordinality as o(value, ord);
    select array_agg(p.value #>> '{}') into chosen from jsonb_array_elements(picked) as p(value);
    if labels is null or array_position(labels, null) is not null or not (chosen <@ labels)
       or (q->>'multiSelect' is distinct from 'true' and array_length(chosen, 1) > 1) then
      return false;
    end if;
    out := out || jsonb_build_object(q->>'question',
      (select string_agg(l.label, ', ' order by l.ord) from unnest(labels) with ordinality as l(label, ord)
       where l.label = any(chosen)));
  end loop;
  begin
    if (p_u::jsonb)->'answers' is distinct from out then
      return false;
    end if;
  exception when others then
    return false;
  end;
  update public.relay_asks a
  set answer = 'allow', reply = out, u = p_u, sig = p_sig, answered_at = now(),
    answered_by = public.relay_key_name(p_key)
  where a.id = p_id;
  return true;
end
$$;

-- 'gone' once the ask expired or its owner came back: the hook then lets the terminal ask as usual
create or replace function public.relay_ask_result(p_key text, p_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  h text := public.relay_ask_hash(p_key);
  x record;
begin
  select a.answer, a.created_at, a.u, a.sig into x from public.relay_asks a where a.id = p_id and a.key_hash = h;
  if not found then
    return jsonb_build_object('state', 'gone');
  end if;
  if x.answer is not null then
    return jsonb_build_object('state', x.answer, 'u', x.u, 'sig', x.sig);
  end if;
  if x.created_at <= now() - interval '10 minutes'
     or not exists (select 1 from public.relay_away a where a.key_hash = h and a.until > now()) then
    return jsonb_build_object('state', 'gone');
  end if;
  return jsonb_build_object('state', 'open');
end
$$;

revoke all on function public.relay_ask_open(text, text, text, text, text, jsonb, text, text) from public;
revoke all on function public.relay_ask_answer(text, uuid, boolean, text, text) from public;
revoke all on function public.relay_ask_reply(text, uuid, jsonb, text, text) from public;
grant execute on function public.relay_ask_open(text, text, text, text, text, jsonb, text, text) to anon, authenticated;
grant execute on function public.relay_ask_answer(text, uuid, boolean, text, text) to anon, authenticated;
grant execute on function public.relay_ask_reply(text, uuid, jsonb, text, text) to anon, authenticated;

-- 6. Hourly: an ask's text (command, question, plan, answers) is kept a day, the ask itself 30 days, a room's first
--    sighting a week after its last event

select cron.unschedule(j.jobid) from cron.job j where j.jobname = 'relay-asks-retention';
select cron.schedule(
  'relay-asks-retention',
  '23 * * * *',
  $$
  update public.relay_asks set detail = '', body = null, reply = null, raw = null, u = null
  where created_at < now() - interval '24 hours'
    and (detail <> '' or body is not null or reply is not null or raw is not null or u is not null);
  delete from public.relay_asks where created_at < now() - interval '30 days';
  delete from public.relay_room_seen s
  where s.first_at < now() - interval '7 days'
    and not exists (select 1 from public.relay_events e where e.room = s.room);
  $$
);
