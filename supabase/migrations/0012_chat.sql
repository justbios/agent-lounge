-- Relay chat — the team's group chat at the bar: messages by key, each one broadcast to the room's social channel
-- Additive: one table, a guarded writer, readers by key and by view room; nothing existing changes

create table if not exists public.relay_chat (
  id     bigint generated always as identity primary key,
  room   text not null,
  at     timestamptz not null default now(),
  author text not null,
  body   text not null
);
create index if not exists relay_chat_room_idx on public.relay_chat (room, id);

alter table public.relay_chat enable row level security;
revoke all on table public.relay_chat from anon, authenticated;

create or replace function public.relay_chat_json(c public.relay_chat)
returns jsonb
language sql
immutable
set search_path = ''
as $$
  select jsonb_build_object(
    'id', c.id,
    'at', floor(extract(epoch from c.at) * 1000)::bigint,
    'author', c.author,
    'body', c.body
  )
$$;

create or replace function public.relay_chat_add(p_key text, p_author text, p_body text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  r text;
  a text := btrim(regexp_replace(coalesce(p_author, ''), '\s+', ' ', 'g'));
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
  perform realtime.send(jsonb_build_object('id', c.id), 'chat', 'relay-social:' || r, false);
  return public.relay_chat_json(c);
end
$$;

create or replace function public.relay_chat_rows(p_room text)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(jsonb_agg(public.relay_chat_json(c) order by c.id), '[]'::jsonb)
  from (
    select * from public.relay_chat
    where p_room ~ '^[0-9a-f]{64}$' and room = p_room
    order by id desc
    limit 200
  ) c
$$;

create or replace function public.relay_chat_get(p_key text)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select public.relay_chat_rows(public.relay_room(p_key))
$$;

create or replace function public.relay_chat_room(p_room text)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select public.relay_chat_rows(p_room)
$$;

revoke all on function public.relay_chat_json(public.relay_chat) from public, anon, authenticated;
revoke all on function public.relay_chat_add(text, text, text) from public;
revoke all on function public.relay_chat_rows(text) from public, anon, authenticated;
revoke all on function public.relay_chat_get(text) from public;
revoke all on function public.relay_chat_room(text) from public;
grant execute on function public.relay_chat_add(text, text, text) to anon, authenticated;
grant execute on function public.relay_chat_get(text) to anon, authenticated;
grant execute on function public.relay_chat_room(text) to anon, authenticated;
