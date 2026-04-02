-- Flowchart tree storage for Fit4Me
-- One row per "slot" (default = the main saved state)

create table if not exists public.flowchart_trees (
  id        text        primary key,          -- e.g. 'default'
  tree      jsonb       not null,             -- serialised TreeNode
  saved_at  timestamptz default now()
);

-- No row-level security needed (writes come from the service-role key server-side only).
-- If you later want user-scoped saves, enable RLS here.
alter table public.flowchart_trees enable row level security;

-- Allow service-role (used by the API routes) to read and write freely.
do $$ begin
  create policy "service role full access"
    on public.flowchart_trees
    as permissive
    for all
    to service_role
    using (true)
    with check (true);
exception when duplicate_object then null;
end $$;
