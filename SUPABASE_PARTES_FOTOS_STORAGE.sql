-- Fotos de partes de trabajo en Storage (en vez de base64 dentro de la fila).
-- Ejecutar una vez en Supabase > SQL Editor, después de SUPABASE_AUTH_ROLES.sql.
-- El bucket es público para que el enlace del PDF abra la foto; los nombres de
-- archivo son aleatorios (no adivinables) y solo se puede subir a la carpeta propia.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('parte-fotos', 'parte-fotos', true, 5242880, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update set
  public = true,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "Active users upload own part photos" on storage.objects;
create policy "Active users upload own part photos"
on storage.objects for insert to authenticated
with check (
  bucket_id = 'parte-fotos'
  and (storage.foldername(name))[1] = (select auth.uid())::text
  and public.app_is_active_user()
);

drop policy if exists "Users delete own part photos" on storage.objects;
create policy "Users delete own part photos"
on storage.objects for delete to authenticated
using (
  bucket_id = 'parte-fotos'
  and (storage.foldername(name))[1] = (select auth.uid())::text
);
