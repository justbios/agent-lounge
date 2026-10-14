-- Relay questions and plans in the café — while its owner is away, Claude's questions and plans wait there too
-- Additive: two columns on relay_asks and new RPCs; the 0019 functions keep working as they are

alter table public.relay_asks add column if not exists body jsonb;
alter table public.relay_asks add column if not exists reply jsonb;

create or replace function public.relay_ask_open(
  p_key text, p_session text, p_label text, p_tool text, p_detail text, p_body jsonb
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
  if p_body is not null and (jsonb_typeof(p_body) <> 'object' or length(p_body::text) > 100000
      or coalesce(p_body->>'tool', '') not in ('AskUserQuestion', 'ExitPlanMode')
      or jsonb_typeof(p_body->'input') is distinct from 'object') then
    return null;
  end if;
  if not exists (select 1 from public.relay_away a where a.key_hash = h and a.until > now()) then
    return null;
  end if;
  if (select count(*) from public.relay_asks x
      where x.key_hash = h and x.answer is null and x.created_at > now() - interval '10 minutes') >= 8 then
    return null;
  end if;
  insert into public.relay_asks (key_hash, session, label, tool, detail, body)
  values (h, left(coalesce(p_session, ''), 100), left(coalesce(p_label, ''), 80), left(coalesce(p_tool, ''), 80),
    left(coalesce(p_detail, ''), 600), p_body)
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
  u timestamptz := (select a.until from public.relay_away a where a.key_hash = h and a.until > now());
begin
  return jsonb_build_object(
    'until', u,
    'asks', coalesce((
      select jsonb_agg(jsonb_build_object('id', x.id, 'session', x.session, 'label', x.label, 'tool', x.tool,
        'detail', x.detail, 'at', x.created_at, 'body', x.body) order by x.created_at)
      from public.relay_asks x
      where u is not null and x.key_hash = h and x.answer is null and x.created_at > now() - interval '10 minutes'
    ), '[]'::jsonb)
  );
end
$$;

-- one option label per question, several only where multiSelect; stored the way Claude Code reads them
create or replace function public.relay_ask_reply(p_key text, p_id uuid, p_answers jsonb)
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
  select a.body into b from public.relay_asks a
  where a.id = p_id and a.key_hash = h and a.answer is null and a.created_at > now() - interval '10 minutes'
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
  update public.relay_asks a set answer = 'allow', reply = out, answered_at = now() where a.id = p_id;
  return true;
end
$$;

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
  select a.answer, a.created_at, a.body, a.reply into x from public.relay_asks a where a.id = p_id and a.key_hash = h;
  if not found then
    return jsonb_build_object('state', 'gone');
  end if;
  if x.answer is not null then
    return jsonb_build_object('state', x.answer, 'body', x.body, 'reply', x.reply);
  end if;
  if x.created_at <= now() - interval '10 minutes'
     or not exists (select 1 from public.relay_away a where a.key_hash = h and a.until > now()) then
    return jsonb_build_object('state', 'gone');
  end if;
  return jsonb_build_object('state', 'open');
end
$$;

revoke all on function public.relay_ask_open(text, text, text, text, text, jsonb) from public;
revoke all on function public.relay_ask_reply(text, uuid, jsonb) from public;
revoke all on function public.relay_ask_result(text, uuid) from public;
grant execute on function public.relay_ask_open(text, text, text, text, text, jsonb) to anon, authenticated;
grant execute on function public.relay_ask_reply(text, uuid, jsonb) to anon, authenticated;
grant execute on function public.relay_ask_result(text, uuid) to anon, authenticated;
