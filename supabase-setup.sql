create table if not exists public.routeledger_data (
  owner_id uuid not null references auth.users(id) on delete cascade default auth.uid(),
  data_key text not null,
  payload jsonb not null,
  updated_at timestamptz not null default now(),
  primary key (owner_id, data_key)
);

alter table public.routeledger_data enable row level security;

drop policy if exists "Users can read their own RouteLedger data" on public.routeledger_data;
create policy "Users can read their own RouteLedger data"
  on public.routeledger_data for select
  to authenticated
  using ((select auth.uid()) = owner_id);

drop policy if exists "Users can create their own RouteLedger data" on public.routeledger_data;
create policy "Users can create their own RouteLedger data"
  on public.routeledger_data for insert
  to authenticated
  with check ((select auth.uid()) = owner_id);

drop policy if exists "Users can update their own RouteLedger data" on public.routeledger_data;
create policy "Users can update their own RouteLedger data"
  on public.routeledger_data for update
  to authenticated
  using ((select auth.uid()) = owner_id)
  with check ((select auth.uid()) = owner_id);

revoke all on public.routeledger_data from anon;
grant select, insert, update on public.routeledger_data to authenticated;
