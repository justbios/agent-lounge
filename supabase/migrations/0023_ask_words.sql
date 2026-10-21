-- Relay asks in your own words — a question answered with text of your own, a denial with what you wrote beside it
--  · a question: each answer is option labels and at most one text of the user's own (≤ 1000 characters, not blank),
--    which Claude gets after the labels, «label, label, own text»; a single-choice question takes one or the other
--  · a denial of a permission or a plan may carry a note: u is then one JSON string (≤ 1000 characters), which
--    relay.sh 8 hands Claude after its fixed sentence; an older script ignores it
--  · as before, the computer accepts only what a paired browser signed (id:answer:sha256(hook JSON):u), so the
--    server can't write in your name; these checks only keep the rows to the shapes relay.sh expects
-- Replaces relay_ask_answer and relay_ask_reply from 0021_security.sql; their grants stay as they were.

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
  said text;
begin
  if p_sig is null or p_sig !~ '^[0-9a-f]{64}$' or length(coalesce(p_u, '')) > 110000 then
    return false;
  end if;
  select a.body into b from public.relay_asks a
  where a.id = p_id and a.key_hash = h and a.answer is null and a.kid is not null
    and a.created_at > now() - interval '10 minutes'
  for update;
  if not found or coalesce(p_allow and b->>'tool' = 'AskUserQuestion', false) then
    return false;
  end if;
  if p_allow then
    -- an approved plan passes Claude's input back; an allowed permission passes nothing
    if coalesce(b->>'tool' = 'ExitPlanMode', false) <> (coalesce(p_u, '') <> '') then
      return false;
    end if;
  elsif coalesce(p_u, '') <> '' then
    begin
      said := (p_u::jsonb) #>> '{}';
      if jsonb_typeof(p_u::jsonb) is distinct from 'string' or btrim(said) = '' or length(said) > 1000 then
        return false;
      end if;
    exception when others then
      return false;
    end;
  end if;
  update public.relay_asks a
  set answer = case when p_allow then 'allow' else 'deny' end, u = nullif(p_u, ''), sig = p_sig,
    answered_at = now(), answered_by = public.relay_key_name(p_key)
  where a.id = p_id;
  return true;
end
$$;

-- option labels and at most one own text per question, several only where multiSelect; u must carry exactly those
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
  own text[];
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
    if exists (select 1 from jsonb_array_elements(picked) as p(value) where jsonb_typeof(p.value) <> 'string') then
      return false;
    end if;
    select array_agg(o.value->>'label' order by o.ord) into labels
    from jsonb_array_elements(q->'options') with ordinality as o(value, ord);
    if labels is null or array_position(labels, null) is not null
       or (q->>'multiSelect' is distinct from 'true' and jsonb_array_length(picked) > 1) then
      return false;
    end if;
    select array_agg(p.value #>> '{}') filter (where (p.value #>> '{}') = any(labels)),
           array_agg(p.value #>> '{}') filter (where not ((p.value #>> '{}') = any(labels)))
      into chosen, own
    from jsonb_array_elements(picked) as p(value);
    if coalesce(array_length(own, 1), 0) > 1
       or (own is not null and (btrim(own[1]) = '' or length(own[1]) > 1000)) then
      return false;
    end if;
    out := out || jsonb_build_object(q->>'question', concat_ws(', ',
      (select string_agg(l.label, ', ' order by l.ord) from unnest(labels) with ordinality as l(label, ord)
       where l.label = any(coalesce(chosen, '{}'::text[]))),
      own[1]));
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
