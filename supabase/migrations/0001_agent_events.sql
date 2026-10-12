-- Relay — event store for live agent pipelines
-- Apply with the Supabase SQL editor or `supabase db push`.

create extension if not exists "pgcrypto";

create table if not exists public.agent_runs (
  id          uuid primary key default gen_random_uuid(),
  label       text,
  status      text not null default 'running',   -- running | done | error
  started_at  timestamptz not null default now(),
  finished_at timestamptz
);

create table if not exists public.agent_events (
  id         uuid primary key default gen_random_uuid(),
  run_id     uuid not null references public.agent_runs (id) on delete cascade,
  seq        int  not null,
  ts         timestamptz not null default now(),
  agent_id   text not null,
  agent_role text,
  type       text not null check (type in ('start', 'thinking', 'tool_call', 'handoff', 'complete', 'error')),
  from_agent text,
  to_agent   text,
  payload    jsonb not null default '{}'::jsonb
);

create index if not exists agent_events_run_seq_idx on public.agent_events (run_id, seq);

-- Row level security: public read for the demo, writes go through the service role.
alter table public.agent_runs   enable row level security;
alter table public.agent_events enable row level security;

create policy "public read runs"   on public.agent_runs   for select using (true);
create policy "public read events" on public.agent_events for select using (true);

-- Realtime: push INSERTs to subscribed browsers.
alter publication supabase_realtime add table public.agent_runs;
alter publication supabase_realtime add table public.agent_events;
