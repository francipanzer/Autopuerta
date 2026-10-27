-- ═══
-- POLÍTICAS DE STORAGE para el bucket 'medidas-fotos'
-- (fotos de plantillas de hoja de medidas y tickets de repostaje)
--
-- El bucket ya existe (SUPABASE_MEDIDAS_ALBARAN.sql) pero NO tenía
-- políticas sobre storage.objects, por eso toda subida fallaba con:
--   400 Bad Request — "new row violates row-level security policy"
--
-- Ejecutar una vez en Supabase > SQL Editor.
-- ═══

-- El bucket es público (para poder incrustar la imagen en PDFs) y admite hasta 8 MB
update storage.buckets set
  public = true,
  file_size_limit = 8388608,
  allowed_mime_types = array['image/jpeg','image/png','image/webp']
where id = 'medidas-fotos';

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('medidas-fotos', 'medidas-fotos', true, 8388608, array['image/jpeg','image/png','image/webp'])
on conflict (id) do nothing;

-- Subir: solo usuarios autenticados y activos, cada uno a su carpeta <uid>/...
drop policy if exists "Active users upload own medidas photos" on storage.objects;
create policy "Active users upload own medidas photos"
on storage.objects for insert to authenticated
with check (
  bucket_id = 'medidas-fotos'
  and (storage.foldername(name))[1] = (select auth.uid())::text
  and public.app_is_active_user()
);

-- Borrar: solo el propietario de la carpeta
drop policy if exists "Users delete own medidas photos" on storage.objects;
create policy "Users delete own medidas photos"
on storage.objects for delete to authenticated
using (
  bucket_id = 'medidas-fotos'
  and (storage.foldername(name))[1] = (select auth.uid())::text
);

-- Actualizar (reemplazos): solo el propietario
drop policy if exists "Users update own medidas photos" on storage.objects;
create policy "Users update own medidas photos"
on storage.objects for update to authenticated
using (
  bucket_id = 'medidas-fotos'
  and (storage.foldername(name))[1] = (select auth.uid())::text
);

-- ═══
-- TABLA DE REPOSTAJES (tickets de combustible)
-- La rellena el técnico desde Informes KMs con foto + OCR del ticket.
-- ═══
create table if not exists public.repostajes (
  id text primary key,
  matricula text not null,
  fecha date not null,
  litros numeric(10,3),
  preciobtanol numeric(10,3),
  importe numeric(10,2),
  kms numeric(10,1),
  gasolinera text,
  foto_url text,
  ocr text,                       -- texto crudo leído del ticket (para auditoría)
  createdby uuid references auth.users(id),
  createdat timestamptz default now(),
  updatedat timestamptz default now()
);

alter table public.repostajes enable row level security;

drop policy if exists "Active users read repostajes" on public.repostajes;
create policy "Active users read repostajes"
on public.repostajes for select to authenticated
using (public.app_is_active_user());

drop policy if exists "Active users insert repostajes" on public.repostajes;
create policy "Active users insert repostajes"
on public.repostajes for insert to authenticated
with check (public.app_is_active_user());

drop policy if exists "Active users update repostajes" on public.repostajes;
create policy "Active users update repostajes"
on public.repostajes for update to authenticated
using (public.app_is_active_user())
with check (public.app_is_active_user());

drop policy if exists "Admins delete repostajes" on public.repostajes;
create policy "Admins delete repostajes"
on public.repostajes for delete to authenticated
using (public.app_is_admin());

grant select, insert, update, delete on public.repostajes to authenticated;

notify pgrst, 'reload schema';
