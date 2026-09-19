-- RLS de organizations e organization_users (§5 da spec).
--
-- A API fala com o banco como `postgres` / service_role, que ignora RLS: o isolamento por
-- tenant na API é feito pelo middleware de tenant + filtro por organization_id em toda query.
-- Estas policies são a segunda barreira, para quem acessar o banco direto pela API do Supabase
-- com o JWT do usuário (role `authenticated`).
--
-- As funções auxiliares são SECURITY DEFINER para consultar organization_users sem disparar a
-- própria policy da tabela (evita recursão infinita de RLS).

create or replace function public.current_user_organization_ids()
returns setof uuid
language sql
stable
security definer
set search_path = public
as $$
  select organization_id
  from public.organization_users
  where auth_user_id = auth.uid();
$$;

create or replace function public.current_user_role_in(target_organization_id uuid)
returns public.organization_role
language sql
stable
security definer
set search_path = public
as $$
  select role
  from public.organization_users
  where organization_id = target_organization_id
    and auth_user_id = auth.uid()
  limit 1;
$$;

revoke all on function public.current_user_organization_ids() from public;
revoke all on function public.current_user_role_in(uuid) from public;
grant execute on function public.current_user_organization_ids() to authenticated, service_role;
grant execute on function public.current_user_role_in(uuid) to authenticated, service_role;

alter table public.organizations enable row level security;
alter table public.organization_users enable row level security;

-- organizations: membro lê; owner/admin edita. Criação e exclusão só pela API (service_role).
create policy "organizations_select_member"
  on public.organizations
  for select
  to authenticated
  using (id in (select public.current_user_organization_ids()));

create policy "organizations_update_owner_admin"
  on public.organizations
  for update
  to authenticated
  using (public.current_user_role_in(id) in ('owner', 'admin'))
  with check (public.current_user_role_in(id) in ('owner', 'admin'));

-- organization_users: membro vê os colegas da própria organização. Escrita só pela API.
create policy "organization_users_select_member"
  on public.organization_users
  for select
  to authenticated
  using (organization_id in (select public.current_user_organization_ids()));
