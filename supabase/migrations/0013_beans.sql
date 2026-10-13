-- Relay beans — what a café did since a moment, summed over all its hours, so beans count from the economy's restart
-- Additive: read-only RPCs by key and by view room over relay_hourly; nothing existing changes

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
    'minutes', coalesce(sum((select count(*) from jsonb_object_keys(h.mins))), 0)
  )
  from public.relay_hourly h
  where p_room ~ '^[0-9a-f]{64}$'
    and h.room = p_room
    and h.hour >= p_since
$$;

create or replace function public.relay_beans(p_key text, p_since timestamptz)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select public.relay_beans_rows(public.relay_room(p_key), p_since)
$$;

create or replace function public.relay_beans_room(p_room text, p_since timestamptz)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select public.relay_beans_rows(p_room, p_since)
$$;

revoke all on function public.relay_beans_rows(text, timestamptz) from public, anon, authenticated;
revoke all on function public.relay_beans(text, timestamptz) from public;
revoke all on function public.relay_beans_room(text, timestamptz) from public;
grant execute on function public.relay_beans(text, timestamptz) to anon, authenticated;
grant execute on function public.relay_beans_room(text, timestamptz) to anon, authenticated;
