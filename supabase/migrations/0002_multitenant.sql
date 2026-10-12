-- Relay — multitenancy (P2)
-- Each pipeline is a "project". A secret ingest_token authorizes writes;
-- a public slug lets the dashboard view a project's live runs.
-- (Accounts/auth are a follow-up: owner is nullable for now.)

create extension if not exists "pgcrypto";

create table if not exists public.relay_projects (
  id           uuid primary key default gen_random_uuid(),
  slug         text unique not null,
  name         text not null default 'My pipeline',
  ingest_token text unique not null default encode(gen_random_bytes(18), 'hex'),
  owner        uuid,
  created_at   timestamptz not null default now()
);

-- Scope the existing event store to a project.
alter table public.agent_runs   add column if not exists project_id uuid references public.relay_projects (id) on delete cascade;
alter table public.agent_events add column if not exists project_id uuid references public.relay_projects (id) on delete cascade;

-- Carry display metadata so the frontend can build the roster with zero hardcoding.
alter table public.agent_events add column if not exists agent_name text;
alter table public.agent_events add column if not exists agent_color text;
alter table public.agent_events add column if not exists agent_order int;

create index if not exists agent_events_project_run_idx on public.agent_events (project_id, run_id, seq);

alter table public.relay_projects enable row level security;

-- Anon can look up a project by slug, but NEVER read the secret token.
create policy "public read project (no token)" on public.relay_projects
  for select using (true);
revoke select (ingest_token) on public.relay_projects from anon;

-- Runs/events: public read (view a shared pipeline); writes go through the
-- service role in /api/ingest only.
-- (agent_runs / agent_events already have "public read" + RLS from 0001.)

alter publication supabase_realtime add table public.relay_projects;
