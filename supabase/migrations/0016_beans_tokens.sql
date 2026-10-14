-- Relay beans from tokens — the bean counters also return the tokens written and the hours three or more agents worked
-- Additive: two read-only functions gain two fields; nothing is stored or removed

create or replace function public.relay_beans_rows(p_room text, p_since timestamptz)
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
    'minutes', coalesce(sum((select count(*) from jsonb_object_keys(h.mins))), 0),
    'out', coalesce(sum(h.tok_out), 0),
    'crowded', count(*) filter (where (select count(*) from jsonb_object_keys(h.agents)) >= 3)
  )
  from public.relay_hourly h
  where p_room ~ '^[0-9a-f]{64}$'
    and h.room = p_room
    and h.hour >= p_since
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
    'minutes', coalesce(sum((select count(*) from jsonb_object_keys(h.mins))), 0),
    'out', coalesce(sum(h.tok_out), 0),
    'crowded', count(*) filter (where (select count(*) from jsonb_object_keys(h.agents)) >= 3)
  )
  from public.relay_hourly_members h
  where h.room = p_room and h.member = p_member and h.hour >= p_since
$$;
