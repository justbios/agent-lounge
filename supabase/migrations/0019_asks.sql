-- Relay permission asks — while its owner is away from the computer, Claude's permission prompt waits in the café
-- Additive: two tables and new RPCs, reachable only with a personal key; nothing existing changes

create table if not exists public.relay_away (
  key_hash text primary key,
  until    timestamptz not null
);

alter table public.relay_away enable row level security;
revoke all on table public.relay_away from anon, authenticated;

create table if not exists public.relay_asks (
  id          uuid primary key default gen_random_uuid(),
  key_hash    text not null,
  session     text not null,
  label       text not null,
  tool        text not null,
  detail      text not null,
  created_at  timestamptz not null default now(),
  answer      text check (answer in ('allow', 'deny')),
  answered_at timestamptz
);

create index if not exists relay_asks_open on public.relay_asks (key_hash, created_at) where answer is null;

alter table public.relay_asks enable row level security;
revoke all on table public.relay_asks from anon, authenticated;

create or replace function public.relay_ask_hash(p_key text)
returns text
language plpgsql
stable
set search_path = ''
as $$
declare
  h text;
begin
  if p_key is null or length(p_key) < 20 or length(p_key) > 128 then
    raise exception 'bad key';
  end if;
  h := encode(extensions.digest(p_key, 'sha256'), 'hex');
  if not exists (select 1 from public.relay_keys x where x.key_hash = h and x.revoked_at is null) then
    raise exception 'personal key only';
  end if;
  return h;
end
$$;

create or replace function public.relay_away_set(p_key text, p_on boolean)
returns timestamptz
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  h text := public.relay_ask_hash(p_key);
  u timestamptz := case when p_on then now() + interval '12 hours' else now() end;
begin
  insert into public.relay_away as a (key_hash, until) values (h, u)
  on conflict (key_hash) do update set until = excluded.until;
  return case when p_on then u end;
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
  u timestamptz := (select a.until from public.relay_away a where a.key_hash = h and a.until > now());
begin
  return jsonb_build_object(
    'until', u,
    'asks', coalesce((
      select jsonb_agg(jsonb_build_object('id', x.id, 'session', x.session, 'label', x.label, 'tool', x.tool,
        'detail', x.detail, 'at', x.created_at) order by x.created_at)
      from public.relay_asks x
      where u is not null and x.key_hash = h and x.answer is null and x.created_at > now() - interval '10 minutes'
    ), '[]'::jsonb)
  );
end
$$;

create or replace function public.relay_ask_open(p_key text, p_session text, p_label text, p_tool text, p_detail text)
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
  if not exists (select 1 from public.relay_away a where a.key_hash = h and a.until > now()) then
    return null;
  end if;
  if (select count(*) from public.relay_asks x
      where x.key_hash = h and x.answer is null and x.created_at > now() - interval '10 minutes') >= 8 then
    return null;
  end if;
  insert into public.relay_asks (key_hash, session, label, tool, detail)
  values (h, left(coalesce(p_session, ''), 100), left(coalesce(p_label, ''), 80), left(coalesce(p_tool, ''), 80),
    left(coalesce(p_detail, ''), 600))
  returning id into v;
  return v;
end
$$;

-- 'gone' once the ask expired or its owner came back: the hook then lets the terminal ask as usual
create or replace function public.relay_ask_wait(p_key text, p_id uuid)
returns text
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  h text := public.relay_ask_hash(p_key);
  x record;
begin
  select a.answer, a.created_at into x from public.relay_asks a where a.id = p_id and a.key_hash = h;
  if not found then
    return 'gone';
  end if;
  if x.answer is not null then
    return x.answer;
  end if;
  if x.created_at <= now() - interval '10 minutes'
     or not exists (select 1 from public.relay_away a where a.key_hash = h and a.until > now()) then
    return 'gone';
  end if;
  return 'open';
end
$$;

create or replace function public.relay_ask_answer(p_key text, p_id uuid, p_allow boolean)
returns boolean
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  h text := public.relay_ask_hash(p_key);
begin
  update public.relay_asks a
  set answer = case when p_allow then 'allow' else 'deny' end, answered_at = now()
  where a.id = p_id and a.key_hash = h and a.answer is null and a.created_at > now() - interval '10 minutes';
  return found;
end
$$;

revoke all on function public.relay_ask_hash(text) from public, anon, authenticated;
revoke all on function public.relay_away_set(text, boolean) from public;
revoke all on function public.relay_asks_list(text) from public;
revoke all on function public.relay_ask_open(text, text, text, text, text) from public;
revoke all on function public.relay_ask_wait(text, uuid) from public;
revoke all on function public.relay_ask_answer(text, uuid, boolean) from public;
grant execute on function public.relay_away_set(text, boolean) to anon, authenticated;
grant execute on function public.relay_asks_list(text) to anon, authenticated;
grant execute on function public.relay_ask_open(text, text, text, text, text) to anon, authenticated;
grant execute on function public.relay_ask_wait(text, uuid) to anon, authenticated;
grant execute on function public.relay_ask_answer(text, uuid, boolean) to anon, authenticated;
