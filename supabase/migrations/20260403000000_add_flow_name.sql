-- Add name column to support multiple named flows
alter table public.flowchart_trees
  add column if not exists name text not null default 'Untitled';
