-- Relay tokens — what each hour spent: fresh input, cache writes and reads, output; by agent, chat and teammate
-- Additive: zero-default columns on relay_hourly and a bigint jsonb adder; relay_hourly_add and relay_progress_rows keep their signatures

alter table public.relay_hourly
  add column if not exists tok_in      bigint not null default 0,
  add column if not exists tok_cw      bigint not null default 0,
  add column if not exists tok_cr      bigint not null default 0,
  add column if not exists tok_out     bigint not null default 0,
  add column if not exists tok_agents  jsonb not null default '{}'::jsonb,
  add column if not exists tok_chats   jsonb not null default '{}'::jsonb,
  add column if not exists tok_members jsonb not null default '{}'::jsonb;

create or replace function public.relay_jsonb_addb(a jsonb, b jsonb)
returns jsonb
language sql
immutable
set search_path = ''
as $$
  select coalesce(jsonb_object_agg(k, coalesce((a->>k)::bigint, 0) + coalesce((b->>k)::bigint, 0)), '{}'::jsonb)
  from (select jsonb_object_keys(a) as k union select jsonb_object_keys(b)) s
$$;

create or replace function public.relay_tok(u jsonb, k text)
returns bigint
language sql
immutable
set search_path = ''
as $$
  select case
    when jsonb_typeof(u->k) = 'number' and (u->>k)::numeric between 0 and 100000000000 then floor((u->>k)::numeric)::bigint
    else 0
  end
$$;

create or replace function public.relay_hourly_add(p_room text, p_at timestamptz, e jsonb)
returns void
language plpgsql
set search_path = ''
as $$
declare
  k text := e->>'kind';
  cwd text := e->>'cwd';
  u jsonb := case when jsonb_typeof(e->'usage') = 'object' then e->'usage' else '{}'::jsonb end;
  t_in bigint := public.relay_tok(u, 'in');
  t_cw bigint := public.relay_tok(u, 'cw');
  t_cr bigint := public.relay_tok(u, 'cr');
  t_out bigint := public.relay_tok(u, 'out');
  t_all bigint;
  label text;
  who text;
  chat text;
begin
  if k is null or k = 'roster' then
    return;
  end if;
  label := coalesce(substring(cwd from '/worktrees/([^/]+)'), nullif(regexp_replace(rtrim(cwd, '/'), '^.*/', ''), ''));
  t_all := t_in + t_cw + t_cr + t_out;
  who := case when e->>'agent' is not null then left(coalesce(nullif(e->>'agentType', ''), 'агент'), 64) else 'Claude' end;
  chat := left(coalesce(nullif(e->>'title', ''), label, 'чат'), 80);
  insert into public.relay_hourly as t
    (room, hour, prompts, tools, dispatches, fails, answers, asks, sessions, agents, tools_by, projects, mins,
     tok_in, tok_cw, tok_cr, tok_out, tok_agents, tok_chats, tok_members)
  values (
    p_room,
    date_trunc('hour', p_at),
    (k = 'prompt' and e->>'tool' = 'питання')::int,
    (k = 'tool')::int,
    (k = 'dispatch')::int,
    (k = 'fail')::int,
    (k = 'stop')::int,
    (k = 'notify')::int,
    case when e->>'session' is not null then jsonb_build_object(e->>'session', 1) else '{}'::jsonb end,
    case when k = 'dispatch' then jsonb_build_object(coalesce(e->>'target', 'agent'), 1) else '{}'::jsonb end,
    case when k = 'tool' then jsonb_build_object(coalesce(e->>'tool', '?'), 1) else '{}'::jsonb end,
    case when label is not null and k = 'prompt' then jsonb_build_object(label, 1) else '{}'::jsonb end,
    jsonb_build_object(extract(minute from p_at)::int::text, 1),
    t_in,
    t_cw,
    t_cr,
    t_out,
    case when t_all > 0 then jsonb_build_object(who, t_all) else '{}'::jsonb end,
    case when t_all > 0 then jsonb_build_object(chat, t_all) else '{}'::jsonb end,
    case when t_all > 0 and e->>'member' is not null then jsonb_build_object(left(e->>'member', 24), t_all) else '{}'::jsonb end
  )
  on conflict (room, hour) do update set
    prompts     = t.prompts + excluded.prompts,
    tools       = t.tools + excluded.tools,
    dispatches  = t.dispatches + excluded.dispatches,
    fails       = t.fails + excluded.fails,
    answers     = t.answers + excluded.answers,
    asks        = t.asks + excluded.asks,
    sessions    = t.sessions || excluded.sessions,
    agents      = public.relay_jsonb_add(t.agents, excluded.agents),
    tools_by    = public.relay_jsonb_add(t.tools_by, excluded.tools_by),
    projects    = public.relay_jsonb_add(t.projects, excluded.projects),
    mins        = t.mins || excluded.mins,
    tok_in      = t.tok_in + excluded.tok_in,
    tok_cw      = t.tok_cw + excluded.tok_cw,
    tok_cr      = t.tok_cr + excluded.tok_cr,
    tok_out     = t.tok_out + excluded.tok_out,
    tok_agents  = public.relay_jsonb_addb(t.tok_agents, excluded.tok_agents),
    tok_chats   = public.relay_jsonb_addb(t.tok_chats, excluded.tok_chats),
    tok_members = public.relay_jsonb_addb(t.tok_members, excluded.tok_members);
end
$$;

create or replace function public.relay_progress_rows(p_room text, p_tz_min int)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  with h as (
    select *, hour + make_interval(mins => greatest(-840, least(840, coalesce(p_tz_min, 0)))) as lh
    from public.relay_hourly
    where p_room ~ '^[0-9a-f]{64}$' and room = p_room
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
    'room', (select jsonb_build_object('cat_name', r.cat_name, 'theme', r.theme) from public.relay_rooms r where r.room = p_room)
  )
$$;

revoke all on function public.relay_jsonb_addb(jsonb, jsonb) from public, anon, authenticated;
revoke all on function public.relay_tok(jsonb, text) from public, anon, authenticated;
revoke all on function public.relay_hourly_add(text, timestamptz, jsonb) from public, anon, authenticated;
revoke all on function public.relay_progress_rows(text, int) from public, anon, authenticated;
