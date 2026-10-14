-- Relay member rooms — on personal keys each teammate keeps a room, beans and achievements; the lobby stays shared
-- Additive: two tables, a second trigger on relay_events, new RPCs; relay_keys_start gives the owner the café's look

create table if not exists public.relay_hourly_members (
  room       text not null,
  member     text not null,
  hour       timestamptz not null,
  prompts    int not null default 0,
  tools      int not null default 0,
  dispatches int not null default 0,
  fails      int not null default 0,
  answers    int not null default 0,
  sessions   jsonb not null default '{}'::jsonb,
  agents     jsonb not null default '{}'::jsonb,
  tools_by   jsonb not null default '{}'::jsonb,
  projects   jsonb not null default '{}'::jsonb,
  mins       jsonb not null default '{}'::jsonb,
  tok_in     bigint not null default 0,
  tok_cw     bigint not null default 0,
  tok_cr     bigint not null default 0,
  tok_out    bigint not null default 0,
  primary key (room, member, hour)
);

alter table public.relay_hourly_members enable row level security;
revoke all on table public.relay_hourly_members from anon, authenticated;

create table if not exists public.relay_member_rooms (
  room       text not null,
  member     text not null,
  cat_name   text,
  theme      text,
  interior   jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  primary key (room, member)
);

alter table public.relay_member_rooms enable row level security;
revoke all on table public.relay_member_rooms from anon, authenticated;

create or replace function public.relay_hourly_member_add(p_room text, p_at timestamptz, e jsonb)
returns void
language plpgsql
set search_path = ''
as $$
declare
  k text := e->>'kind';
  m text := left(btrim(coalesce(e->>'member', '')), 24);
  cwd text := e->>'cwd';
  u jsonb := case when jsonb_typeof(e->'usage') = 'object' then e->'usage' else '{}'::jsonb end;
  label text;
begin
  if k is null or k = 'roster' or m = '' then
    return;
  end if;
  label := coalesce(substring(cwd from '/worktrees/([^/]+)'), nullif(regexp_replace(rtrim(cwd, '/'), '^.*/', ''), ''));
  insert into public.relay_hourly_members as t
    (room, member, hour, prompts, tools, dispatches, fails, answers, sessions, agents, tools_by, projects, mins,
     tok_in, tok_cw, tok_cr, tok_out)
  values (
    p_room,
    m,
    date_trunc('hour', p_at),
    (k = 'prompt' and e->>'tool' = 'питання')::int,
    (k = 'tool')::int,
    (k = 'dispatch')::int,
    (k = 'fail')::int,
    (k = 'stop')::int,
    case when e->>'session' is not null then jsonb_build_object(e->>'session', 1) else '{}'::jsonb end,
    case when k = 'dispatch' then jsonb_build_object(coalesce(e->>'target', 'agent'), 1) else '{}'::jsonb end,
    case when k = 'tool' then jsonb_build_object(coalesce(e->>'tool', '?'), 1) else '{}'::jsonb end,
    case when label is not null and k = 'prompt' then jsonb_build_object(label, 1) else '{}'::jsonb end,
    jsonb_build_object(extract(minute from p_at)::int::text, 1),
    public.relay_tok(u, 'in'),
    public.relay_tok(u, 'cw'),
    public.relay_tok(u, 'cr'),
    public.relay_tok(u, 'out')
  )
  on conflict (room, member, hour) do update set
    prompts    = t.prompts + excluded.prompts,
    tools      = t.tools + excluded.tools,
    dispatches = t.dispatches + excluded.dispatches,
    fails      = t.fails + excluded.fails,
    answers    = t.answers + excluded.answers,
    sessions   = t.sessions || excluded.sessions,
    agents     = public.relay_jsonb_add(t.agents, excluded.agents),
    tools_by   = public.relay_jsonb_add(t.tools_by, excluded.tools_by),
    projects   = public.relay_jsonb_add(t.projects, excluded.projects),
    mins       = t.mins || excluded.mins,
    tok_in     = t.tok_in + excluded.tok_in,
    tok_cw     = t.tok_cw + excluded.tok_cw,
    tok_cr     = t.tok_cr + excluded.tok_cr,
    tok_out    = t.tok_out + excluded.tok_out;
end
$$;

create or replace function public.relay_hourly_member_bump()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  begin
    perform public.relay_hourly_member_add(new.room, new.at, new.event);
  exception when others then
    null;
  end;
  return null;
end
$$;

do $$
begin
  if not exists (select 1 from public.relay_hourly_members) then
    perform public.relay_hourly_member_add(room, at, event) from public.relay_events order by id;
  end if;
end
$$;

create or replace trigger relay_events_hourly_member
after insert on public.relay_events
for each row execute function public.relay_hourly_member_bump();

create or replace function public.relay_member_progress_rows(p_room text, p_member text, p_tz_min int)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  with h as (
    select *, hour + make_interval(mins => greatest(-840, least(840, coalesce(p_tz_min, 0)))) as lh
    from public.relay_hourly_members
    where room = p_room and member = p_member
  ),
  d as (
    select lh::date as day,
      sum(prompts)::int as prompts,
      sum(tools)::int as tools,
      sum(dispatches)::int as dispatches,
      sum(fails)::int as fails,
      sum(answers)::int as answers,
      max(dispatches)::int as peak_hour,
      sum((select count(*) from jsonb_object_keys(mins)))::int as minutes,
      bool_or(extract(hour from lh) < 5 and prompts > 0) as night,
      bool_or(extract(hour from lh) between 5 and 6 and prompts > 0) as early,
      sum(tok_in + tok_cw + tok_cr + tok_out)::bigint as tokens
    from h
    group by 1
  )
  select jsonb_build_object(
    'days', coalesce((select jsonb_agg(to_jsonb(d) order by d.day) from d), '[]'::jsonb),
    'agents', (select count(distinct k) from h, jsonb_object_keys(h.agents) k),
    'tools', (select count(distinct k) from h, jsonb_object_keys(h.tools_by) k),
    'projects', (select count(distinct k) from h, jsonb_object_keys(h.projects) k),
    'chats', (select count(distinct k) from h, jsonb_object_keys(h.sessions) k),
    'room', (
      select jsonb_build_object('cat_name', r.cat_name, 'theme', r.theme, 'interior', r.interior)
      from public.relay_member_rooms r where r.room = p_room and r.member = p_member
    )
  )
$$;

create or replace function public.relay_member_beans_rows(p_room text, p_member text, p_since timestamptz)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'prompts', coalesce(sum(h.prompts), 0),
    'tools', coalesce(sum(h.tools), 0),
    'dispatches', coalesce(sum(h.dispatches), 0),
    'answers', coalesce(sum(h.answers), 0),
    'minutes', coalesce(sum((select count(*) from jsonb_object_keys(h.mins))), 0)
  )
  from public.relay_hourly_members h
  where h.room = p_room and h.member = p_member and h.hour >= p_since
$$;

create or replace function public.relay_members_rows(p_room text, p_tz_min int, p_since timestamptz)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'locked', coalesce((select x.locked from public.relay_rooms x where x.room = p_room), false),
    'members', coalesce((
      select jsonb_object_agg(m.member, jsonb_build_object(
        'progress', public.relay_member_progress_rows(p_room, m.member, p_tz_min),
        'work', public.relay_member_beans_rows(p_room, m.member, p_since)
      ))
      from (
        select u.member from (
          select h.member from public.relay_hourly_members h where h.room = p_room
          union
          select k.name from public.relay_keys k where k.room = p_room and k.revoked_at is null
          union
          select r.member from public.relay_member_rooms r where r.room = p_room
        ) u
        order by u.member
        limit 40
      ) m
      where p_room ~ '^[0-9a-f]{64}$'
    ), '{}'::jsonb)
  )
$$;

create or replace function public.relay_members(p_key text, p_tz_min int, p_since timestamptz)
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
  return public.relay_members_rows(public.relay_room(p_key), p_tz_min, p_since);
end
$$;

create or replace function public.relay_members_room(p_room text, p_tz_min int, p_since timestamptz)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select public.relay_members_rows(public.relay_view_room(p_room), p_tz_min, p_since)
$$;

create or replace function public.relay_member_set(p_key text, p_patch jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  r text;
  n text;
  cat text := nullif(btrim(p_patch->>'cat_name'), '');
  th text := nullif(p_patch->>'theme', '');
  inr jsonb := p_patch->'interior';
begin
  if p_key is null or length(p_key) < 20 or length(p_key) > 128 then
    raise exception 'bad key';
  end if;
  if cat is not null and length(cat) > 24 then
    raise exception 'cat name too long';
  end if;
  if th is not null and th !~ '^[a-z]{2,16}$' then
    raise exception 'bad theme';
  end if;
  if p_patch ? 'interior' and (jsonb_typeof(inr) <> 'object' or octet_length(inr::text) > 16384) then
    raise exception 'bad interior';
  end if;
  r := public.relay_room(p_key);
  n := public.relay_key_name(p_key);
  if n is null then
    raise exception 'not personal';
  end if;
  insert into public.relay_member_rooms as t (room, member, cat_name, theme, interior)
  values (r, n, cat, th, coalesce(inr, '{}'::jsonb))
  on conflict (room, member) do update set
    cat_name = case when p_patch ? 'cat_name' then excluded.cat_name else t.cat_name end,
    theme = case when p_patch ? 'theme' then excluded.theme else t.theme end,
    interior = case when p_patch ? 'interior' then excluded.interior else t.interior end,
    updated_at = now();
  return (
    select jsonb_build_object('cat_name', x.cat_name, 'theme', x.theme, 'interior', x.interior)
    from public.relay_member_rooms x where x.room = r and x.member = n
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
  insert into public.relay_member_rooms (room, member, cat_name, theme, interior)
  select r, n, x.cat_name, x.theme, x.interior - 'paid' from public.relay_rooms x where x.room = r
  on conflict (room, member) do nothing;
  perform realtime.send('{}'::jsonb, 'rekey', 'relay:' || r, false);
  return jsonb_build_object('key', k, 'name', n);
end
$$;

insert into public.relay_member_rooms (room, member, cat_name, theme, interior)
select k.room, k.name, x.cat_name, x.theme, x.interior - 'paid'
from public.relay_keys k
join public.relay_rooms x on x.room = k.room
where k.role = 'owner' and k.revoked_at is null and x.locked
on conflict (room, member) do nothing;

revoke all on function public.relay_hourly_member_add(text, timestamptz, jsonb) from public, anon, authenticated;
revoke all on function public.relay_hourly_member_bump() from public, anon, authenticated;
revoke all on function public.relay_member_progress_rows(text, text, int) from public, anon, authenticated;
revoke all on function public.relay_member_beans_rows(text, text, timestamptz) from public, anon, authenticated;
revoke all on function public.relay_members_rows(text, int, timestamptz) from public, anon, authenticated;
revoke all on function public.relay_members(text, int, timestamptz) from public;
revoke all on function public.relay_members_room(text, int, timestamptz) from public;
revoke all on function public.relay_member_set(text, jsonb) from public;
revoke all on function public.relay_keys_start(text, text) from public;
grant execute on function public.relay_members(text, int, timestamptz) to anon, authenticated;
grant execute on function public.relay_members_room(text, int, timestamptz) to anon, authenticated;
grant execute on function public.relay_member_set(text, jsonb) to anon, authenticated;
grant execute on function public.relay_keys_start(text, text) to anon, authenticated;
