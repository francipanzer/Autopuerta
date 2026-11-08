-- Puntos de recogida de material (proveedores / talleres / delegaciones).
-- Se usan como origen o destino de los desplazamientos internos de los partes.
-- Ejecutar UNA VEZ en Supabase > SQL Editor, DESPUES de SUPABASE_AUTH_ROLES.sql.
-- Es seguro repetirlo.

create table if not exists public.proveedores (
  id text primary key,
  nombre text not null,
  direccion text not null default '',
  lat double precision,
  lng double precision,
  notas text not null default '',
  createdat timestamptz not null default now(),
  updatedat timestamptz not null default now()
);

alter table public.proveedores enable row level security;
revoke all on public.proveedores from anon;
grant select, insert, update, delete on public.proveedores to authenticated;

drop policy if exists "active users read proveedores" on public.proveedores;
drop policy if exists "admins manage proveedores" on public.proveedores;
create policy "active users read proveedores" on public.proveedores for select to authenticated
  using (public.app_is_active_user());
create policy "admins manage proveedores" on public.proveedores for all to authenticated
  using (public.app_is_admin()) with check (public.app_is_admin());

notify pgrst, 'reload schema';
