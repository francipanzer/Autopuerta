-- Manuales en Supabase Storage (en lugar de base64 en la tabla).
-- Ejecutar UNA vez en el SQL Editor de Supabase. Es seguro repetirlo.
--
-- PROBLEMA QUE RESUELVE: hasta ahora el PDF iba en base64 dentro de la columna
-- pdfdata de la tabla manuales. Cada listado de manuales descargaba TODOS los
-- archivos enteros (un PDF de 5 MB ocupa ~6,7 MB en base64) y los vídeos eran
-- inviables. Con Storage, la tabla solo guarda metadatos y el archivo se
-- descarga bajo demanda al pulsar «Ver».

-- 1. Bucket de archivos (público-lectura para usuarios autenticados vía URL firmada)
insert into storage.buckets (id, name, public)
values ('manuales', 'manuales', false)
on conflict (id) do nothing;

-- 2. Políticas del bucket: cualquier usuario activo puede leer; solo admins suben/borran
drop policy if exists "manuales read" on storage.objects;
drop policy if exists "manuales write" on storage.objects;
create policy "manuales read" on storage.objects for select to authenticated
  using (bucket_id = 'manuales' and public.app_is_active_user());
create policy "manuales write" on storage.objects for insert to authenticated
  with check (bucket_id = 'manuales' and public.app_is_admin());
create policy "manuales delete" on storage.objects for delete to authenticated
  using (bucket_id = 'manuales' and public.app_is_admin());

-- 3. Columnas nuevas en la tabla: tipo de archivo y ruta en Storage.
--    La columna pdfdata se conserva (lectura de manuales antiguos) pero ya no se usa para subir.
alter table public.manuales
  add column if not exists archivo_path text,
  add column if not exists archivo_tipo text,
  add column if not exists archivo_tamano bigint;

comment on column public.manuales.archivo_path is 'Ruta del archivo en el bucket de Storage (manuales/...).';
comment on column public.manuales.archivo_tipo is 'MIME type: application/pdf, video/mp4, etc.';
