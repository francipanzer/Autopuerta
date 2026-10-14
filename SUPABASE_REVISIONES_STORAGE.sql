-- Ejecutar una vez después de SUPABASE_AUTH_ROLES.sql.
-- Los PDFs son privados; solo cada usuario autenticado puede subir a su carpeta.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('revision-pdfs', 'revision-pdfs', false, 20971520, array['application/pdf'])
on conflict (id) do update set
  public = false,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "Active users upload own revision PDFs" on storage.objects;
create policy "Active users upload own revision PDFs"
on storage.objects for insert to authenticated
with check (
  bucket_id = 'revision-pdfs'
  and (storage.foldername(name))[1] = (select auth.uid())::text
  and public.app_is_active_user()
);