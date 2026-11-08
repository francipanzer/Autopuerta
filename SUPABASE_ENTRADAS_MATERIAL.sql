-- Entrada de material en Almacén desde albarán/factura de proveedor (foto o PDF).
-- Ejecutar UNA vez en Supabase > SQL Editor, DESPUÉS de SUPABASE_AUTH_ROLES.sql. Es seguro repetirlo.
--
--  entradas_material : historial de cada albarán/factura registrado (cabecera + líneas + ruta del archivo).
--  almacen_alias     : memoria "este texto de este proveedor = este artículo" para emparejar solo la próxima vez.
--  Bucket 'entradas_material': la foto/PDF del documento (privado; solo administradores).

create table if not exists public.entradas_material (
  id text primary key,
  proveedor text not null default '',
  numero text not null default '',
  fecha date,
  total numeric,
  lineas jsonb not null default '[]'::jsonb,
  archivo_path text,
  creadopor text,
  createdat timestamptz not null default now(),
  updatedat timestamptz not null default now()
);

create index if not exists entradas_material_prov_num_idx on public.entradas_material (lower(proveedor), lower(numero));

create table if not exists public.almacen_alias (
  id text primary key,
  proveedor text not null default '',
  clave text not null,
  articuloid text not null,
  usos integer not null default 1,
  createdat timestamptz not null default now(),
  updatedat timestamptz not null default now()
);

alter table public.entradas_material enable row level security;
alter table public.almacen_alias enable row level security;
revoke all on public.entradas_material from anon;
revoke all on public.almacen_alias from anon;
grant select, insert, update, delete on public.entradas_material to authenticated;
grant select, insert, update, delete on public.almacen_alias to authenticated;

drop policy if exists "admins manage entradas_material" on public.entradas_material;
create policy "admins manage entradas_material" on public.entradas_material for all to authenticated
  using (public.app_is_admin()) with check (public.app_is_admin());

drop policy if exists "admins manage almacen_alias" on public.almacen_alias;
create policy "admins manage almacen_alias" on public.almacen_alias for all to authenticated
  using (public.app_is_admin()) with check (public.app_is_admin());

-- Archivos de los documentos
insert into storage.buckets (id, name, public)
values ('entradas_material', 'entradas_material', false)
on conflict (id) do nothing;

drop policy if exists "entradas_material read" on storage.objects;
drop policy if exists "entradas_material write" on storage.objects;
drop policy if exists "entradas_material delete" on storage.objects;
create policy "entradas_material read" on storage.objects for select to authenticated
  using (bucket_id = 'entradas_material' and public.app_is_admin());
create policy "entradas_material write" on storage.objects for insert to authenticated
  with check (bucket_id = 'entradas_material' and public.app_is_admin());
create policy "entradas_material delete" on storage.objects for delete to authenticated
  using (bucket_id = 'entradas_material' and public.app_is_admin());

notify pgrst, 'reload schema';
