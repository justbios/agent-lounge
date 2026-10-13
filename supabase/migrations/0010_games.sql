-- Relay games — wins, rounds played and best score per player for the café's mini-games
-- Additive: one table, a guarded writer that adds one finished game at a time, readers by key and by view room

create table if not exists public.relay_scores (
  room       text not null,
  player     text not null,
  game       text not null,
  wins       int not null default 0,
  played     int not null default 0,
  best       int not null default 0,
  updated_at timestamptz not null default now(),
  primary key (room, player, game)
);

alter table public.relay_scores enable row level security;
revoke all on table public.relay_scores from anon, authenticated;

create or replace function public.relay_score_add(p_key text, p_player text, p_game text, p_win boolean, p_value int)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  r text;
  pl text := btrim(coalesce(p_player, ''));
begin
  if p_key is null or length(p_key) < 20 or length(p_key) > 128 then
    raise exception 'bad key';
  end if;
  if pl = '' or length(pl) > 24 then
    raise exception 'bad player';
  end if;
  if p_game is null or p_game !~ '^[a-z]{2,16}$' then
    raise exception 'bad game';
  end if;
  if p_value is not null and (p_value < 0 or p_value > 100000) then
    raise exception 'bad value';
  end if;
  r := public.relay_room(p_key);
  if not exists (select 1 from public.relay_scores s where s.room = r and s.player = pl and s.game = p_game)
     and (select count(*) from public.relay_scores s where s.room = r) >= 300 then
    return;
  end if;
  insert into public.relay_scores as t (room, player, game, wins, played, best)
  values (r, pl, p_game, coalesce(p_win, false)::int, 1, coalesce(p_value, 0))
  on conflict (room, player, game) do update set
    wins = t.wins + excluded.wins,
    played = t.played + 1,
    best = greatest(t.best, excluded.best),
    updated_at = now()
  where t.updated_at < now() - interval '2 seconds';
end
$$;

create or replace function public.relay_scores_rows(p_room text)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    jsonb_agg(jsonb_build_object('player', s.player, 'game', s.game, 'wins', s.wins, 'played', s.played, 'best', s.best)),
    '[]'::jsonb
  )
  from (
    select * from public.relay_scores
    where p_room ~ '^[0-9a-f]{64}$' and room = p_room
    order by updated_at desc
    limit 300
  ) s
$$;

create or replace function public.relay_scores_get(p_key text)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select public.relay_scores_rows(public.relay_room(p_key))
$$;

create or replace function public.relay_scores_room(p_room text)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select public.relay_scores_rows(p_room)
$$;

revoke all on function public.relay_score_add(text, text, text, boolean, int) from public;
revoke all on function public.relay_scores_rows(text) from public, anon, authenticated;
revoke all on function public.relay_scores_get(text) from public;
revoke all on function public.relay_scores_room(text) from public;
grant execute on function public.relay_score_add(text, text, text, boolean, int) to anon, authenticated;
grant execute on function public.relay_scores_get(text) to anon, authenticated;
grant execute on function public.relay_scores_room(text) to anon, authenticated;
