-- Relay personal keys — a café's owner hands each teammate a key of their own and can take it back
-- Additive: one table, two columns, new RPCs; existing functions keep their behaviour for cafés on a shared key

create table if not exists public.relay_keys (
  key_hash   text primary key,
  room       text not null,
  name       text not null,
  role       text not null check (role in ('owner', 'member')),
  created_at timestamptz not null default now(),
  revoked_at timestamptz
);

create unique index if not exists relay_keys_room_name
  on public.relay_keys (room, lower(name)) where revoked_at is null;

alter table public.relay_keys enable row level security;
revoke all on table public.relay_keys from anon, authenticated;

alter table public.relay_rooms add column if not exists locked boolean not null default false;
alter table public.relay_rooms add column if not exists alias text;
create unique index if not exists relay_rooms_alias on public.relay_rooms (alias) where alias is not null;

create or replace function public.relay_room(p_key text)
returns text
language plpgsql
stable
set search_path = ''
as $$
declare
  h text := encode(extensions.digest(p_key, 'sha256'), 'hex');
  k record;
begin
  select x.room, x.revoked_at into k from public.relay_keys x where x.key_hash = h;
  if found then
    if k.revoked_at is not null then
      raise exception 'key revoked';
    end if;
    return k.room;
  end if;
  if exists (select 1 from public.relay_rooms x where x.room = h and x.locked) then
    raise exception 'key retired';
  end if;
  return h;
end
$$;

create or replace function public.relay_key_name(p_key text)
returns text
language sql
stable
set search_path = ''
as $$
  select x.name from public.relay_keys x
  where x.key_hash = encode(extensions.digest(p_key, 'sha256'), 'hex') and x.revoked_at is null
$$;

create or replace function public.relay_topic(p_room text)
returns text
language sql
stable
set search_path = ''
as $$
  select coalesce((select x.alias from public.relay_rooms x where x.room = p_room and x.locked), p_room)
$$;

create or replace function public.relay_view_room(p_room text)
returns text
language sql
stable
set search_path = ''
as $$
  select coalesce(
    (select x.room from public.relay_rooms x where x.alias = p_room and x.locked),
    (select p_room where p_room ~ '^[0-9a-f]{64}$'
       and not exists (select 1 from public.relay_rooms x where x.room = p_room and x.locked))
  )
$$;

create or replace function public.relay_new_key()
returns text
language sql
volatile
set search_path = ''
as $$
  select translate(encode(extensions.gen_random_bytes(24), 'base64'), '+/', '-_')
$$;

create or replace function public.relay_clean_name(p_name text)
returns text
language plpgsql
immutable
set search_path = ''
as $$
declare
  n text := btrim(regexp_replace(coalesce(p_name, ''), '\s+', ' ', 'g'));
begin
  if n = '' or length(n) > 24 or n ~ '[[:cntrl:]<>"\\]' then
    raise exception 'bad name';
  end if;
  return n;
end
$$;

create or replace function public.relay_owner_room(p_key text)
returns text
language plpgsql
stable
set search_path = ''
as $$
declare
  r text;
begin
  select x.room into r from public.relay_keys x
  where x.key_hash = encode(extensions.digest(p_key, 'sha256'), 'hex') and x.revoked_at is null and x.role = 'owner';
  if r is null then
    raise exception 'not owner';
  end if;
  return r;
end
$$;

create or replace function public.relay_keys_rows(p_room text)
returns jsonb
language sql
stable
set search_path = ''
as $$
  select coalesce(jsonb_agg(jsonb_build_object('name', x.name, 'role', x.role, 'since', x.created_at)
    order by x.role = 'owner' desc, x.created_at), '[]'::jsonb)
  from public.relay_keys x
  where x.room = p_room and x.revoked_at is null
$$;

create or replace function public.relay_whoami(p_key text)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  r text;
  k record;
begin
  if p_key is null or length(p_key) < 20 or length(p_key) > 128 then
    raise exception 'bad key';
  end if;
  r := public.relay_room(p_key);
  select x.name, x.role into k from public.relay_keys x
  where x.key_hash = encode(extensions.digest(p_key, 'sha256'), 'hex');
  return jsonb_build_object(
    'topic', public.relay_topic(r),
    'name', k.name,
    'role', k.role,
    'locked', coalesce((select x.locked from public.relay_rooms x where x.room = r), false)
  );
end
$$;

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
  perform realtime.send('{}'::jsonb, 'rekey', 'relay:' || r, false);
  return jsonb_build_object('key', k, 'name', n);
end
$$;

create or replace function public.relay_key_invite(p_key text, p_name text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  r text := public.relay_owner_room(p_key);
  n text := public.relay_clean_name(p_name);
  k text := public.relay_new_key();
begin
  perform pg_advisory_xact_lock(hashtext('relay_keys:' || r));
  if exists (
    select 1 from public.relay_keys x where x.room = r and x.revoked_at is null and lower(x.name) = lower(n)
  ) then
    raise exception 'name taken';
  end if;
  if (select count(*) from public.relay_keys x where x.room = r and x.revoked_at is null) >= 30 then
    raise exception 'too many';
  end if;
  insert into public.relay_keys (key_hash, room, name, role)
  values (encode(extensions.digest(k, 'sha256'), 'hex'), r, n, 'member');
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
  perform realtime.send('{}'::jsonb, 'rekey', 'relay:' || old, false);
  return public.relay_keys_rows(r);
end
$$;

create or replace function public.relay_keys_list(p_key text)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if p_key is null or length(p_key) < 20 or length(p_key) > 128 then
    raise exception 'bad key';
  end if;
  return public.relay_keys_rows(public.relay_room(p_key));
end
$$;

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
  delete from public.relay_events
  where room = r and id <= (
    select id from public.relay_events where room = r order by id desc offset 5000 limit 1
  );
end
$$;

create or replace function public.relay_chat_add(p_key text, p_author text, p_body text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  r text;
  a text := coalesce(public.relay_key_name(p_key), btrim(regexp_replace(coalesce(p_author, ''), '\s+', ' ', 'g')));
  b text := btrim(coalesce(p_body, ''));
  c public.relay_chat;
begin
  if p_key is null or length(p_key) < 20 or length(p_key) > 128 then
    raise exception 'bad key';
  end if;
  if a = '' or length(a) > 24 then
    raise exception 'bad author';
  end if;
  if b = '' or length(b) > 500 then
    raise exception 'bad body';
  end if;
  r := public.relay_room(p_key);
  if (select count(*) from public.relay_chat x where x.room = r and x.at > now() - interval '1 minute') >= 20 then
    raise exception 'too fast';
  end if;
  insert into public.relay_chat (room, author, body) values (r, a, b) returning * into c;
  perform realtime.send(jsonb_build_object('id', c.id), 'chat', 'relay-social:' || public.relay_topic(r), false);
  return public.relay_chat_json(c);
end
$$;

create or replace function public.relay_push_subscribe(p_key text, p_sub jsonb, p_done boolean, p_member text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  r text;
  ep text := p_sub->>'endpoint';
  m text := coalesce(public.relay_key_name(p_key), nullif(btrim(p_member), ''));
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
    set room = excluded.room, sub = excluded.sub, done = excluded.done, member = excluded.member, active = true,
        updated_at = now();
end
$$;

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
    where room = public.relay_view_room(p_room)
    order by id desc
    limit 5000
  ) x
$$;

create or replace function public.relay_progress_room(p_room text, p_tz_min int)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select public.relay_progress_rows(public.relay_view_room(p_room), p_tz_min)
$$;

create or replace function public.relay_recap_room(p_room text, p_since timestamptz)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select public.relay_recap_rows(public.relay_view_room(p_room), p_since)
$$;

create or replace function public.relay_chat_room(p_room text)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select public.relay_chat_rows(public.relay_view_room(p_room))
$$;

create or replace function public.relay_scores_room(p_room text)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select public.relay_scores_rows(public.relay_view_room(p_room))
$$;

create or replace function public.relay_beans_room(p_room text, p_since timestamptz)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select public.relay_beans_rows(public.relay_view_room(p_room), p_since)
$$;

revoke all on function public.relay_key_name(text) from public, anon, authenticated;
revoke all on function public.relay_topic(text) from public, anon, authenticated;
revoke all on function public.relay_view_room(text) from public, anon, authenticated;
revoke all on function public.relay_new_key() from public, anon, authenticated;
revoke all on function public.relay_clean_name(text) from public, anon, authenticated;
revoke all on function public.relay_owner_room(text) from public, anon, authenticated;
revoke all on function public.relay_keys_rows(text) from public, anon, authenticated;
revoke all on function public.relay_whoami(text) from public;
revoke all on function public.relay_keys_start(text, text) from public;
revoke all on function public.relay_key_invite(text, text) from public;
revoke all on function public.relay_key_remove(text, text) from public;
revoke all on function public.relay_keys_list(text) from public;
grant execute on function public.relay_whoami(text) to anon, authenticated;
grant execute on function public.relay_keys_start(text, text) to anon, authenticated;
grant execute on function public.relay_key_invite(text, text) to anon, authenticated;
grant execute on function public.relay_key_remove(text, text) to anon, authenticated;
grant execute on function public.relay_keys_list(text) to anon, authenticated;
