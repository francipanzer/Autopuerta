-- Ejecutar una vez después de SUPABASE_AUTH_ROLES.sql.
-- Administradores editan la ficha; los usuarios activos pueden leerla para generar PDF.
create table if not exists public.company_settings (
  id boolean primary key default true check (id),
  trade_name text not null default 'Valgom',
  legal_name text not null default '',
  tax_id text not null default '',
  address text not null default '',
  phone text not null default '',
  email text not null default '',
  website text not null default '',
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id) on delete set null
);

insert into public.company_settings (id, trade_name)
values (true, 'Valgom')
on conflict (id) do nothing;

alter table public.company_settings enable row level security;
revoke all on public.company_settings from anon;
grant select, insert, update on public.company_settings to authenticated;

drop policy if exists "Active users read company settings" on public.company_settings;
create policy "Active users read company settings"
on public.company_settings for select to authenticated
using (public.app_is_active_user());

drop policy if exists "Admins manage company settings" on public.company_settings;
create policy "Admins manage company settings"
on public.company_settings for all to authenticated
using (public.app_is_admin())
with check (public.app_is_admin());