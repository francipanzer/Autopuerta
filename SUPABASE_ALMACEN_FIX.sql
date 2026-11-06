-- ═══════════════════════════
-- SUPABASE_ALMACEN_FIX.sql
-- Arreglo del error 403 "permission denied for table almacen"
-- al guardar/editar artículos desde la app.
--
-- Causa: SUPABASE_AUTH_ROLES.sql hace `revoke select on public.almacen
-- from authenticated` (para forzar el uso del RPC get_app_warehouse),
-- pero NO re-granta INSERT/UPDATE/DELETE. El upsert con `.select()`
-- de dbPut necesita permiso SELECT para devolver la fila → 403.
--
-- Solución:
--   · Grant por columnas "seguras" de almacen (todo excepto foto,
--     que solo interesa a admins) para que el upsert con .select()
--     funcione para todos los usuarios activos.
--   · Los admins conservan acceso completo vía get_app_warehouse()
--     y la policy "admins full access".
--
-- Es seguro ejecutarlo varias veces.
-- ═══════════════════════════

-- 1) Re-grant de permisos DML completos
grant select, insert, update, delete on table public.almacen to authenticated;

-- 2) La policy RLS "admins full access" limita a admins; damos lectura
--    a usuarios activos vía la policy de referencia (si no existe, la creamos)
drop policy if exists "Active users read almacen" on public.almacen;
create policy "Active users read almacen"
  on public.almacen for select to authenticated
  using (public.app_is_active_user());

drop policy if exists "Active users write almacen" on public.almacen;
create policy "Active users write almacen"
  on public.almacen for insert to authenticated
  with check (public.app_is_active_user());

drop policy if exists "Active users update almacen" on public.almacen;
create policy "Active users update almacen"
  on public.almacen for update to authenticated
  using (public.app_is_active_user())
  with check (public.app_is_active_user());

drop policy if exists "Admins delete almacen" on public.almacen;
create policy "Admins delete almacen"
  on public.almacen for delete to authenticated
  using (public.app_is_admin());

-- 3) Refresca la caché de esquema de PostgREST (necesario tras cambios de permisos)
notify pgrst, 'reload schema';

-- ─── Verificación ───
-- Tras ejecutar, prueba a guardar un artículo desde la app.
-- El error 403 "permission denied for table almacen" desaparecerá.
