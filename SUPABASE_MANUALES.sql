-- Manuales PDF. Ejecutar UNA vez en el SQL Editor de Supabase, DESPUES de SUPABASE_AUTH_ROLES.sql.
-- Es seguro repetirlo.
create table if not exists public.manuales (
  id text primary key,
  titulo text not null default '',
  tipopuerta text,
  tipoaveria text not null default '',
  pdfdata text,
  createdat timestamptz not null default now(),
  updatedat timestamptz not null default now()
);

alter table public.manuales enable row level security;
revoke all on public.manuales from anon;
grant select, insert, update, delete on public.manuales to authenticated;

drop policy if exists "active users read manuales" on public.manuales;
drop policy if exists "admins manage manuales" on public.manuales;
create policy "active users read manuales" on public.manuales for select to authenticated
  using (public.app_is_active_user());
create policy "admins manage manuales" on public.manuales for all to authenticated
  using (public.app_is_admin()) with check (public.app_is_admin());

-- Refresca la caché de esquema de la API.
notify pgrst, 'reload schema';
