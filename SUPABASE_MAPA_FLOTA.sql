-- ============================================================
-- MAPA DE FLOTA: posiciones GPS de los vehículos
-- Los técnicos con la app abierta actualizan su fila cada 3 min.
-- Un registro por matrícula (upsert, clave = matricula).
-- Ejecutar UNA VEZ en Supabase > SQL Editor. Es idempotente.
-- ============================================================

create table if not exists public.posiciones_vehiculo (
  matricula text primary key,
  user_id uuid,
  lat double precision not null,
  lng double precision not null,
  velocidad int,
  actualizado_en timestamptz not null default now()
);

-- Solo administración lee las posiciones de toda la flota;
-- cualquier usuario autenticado puede actualizar la suya.
alter table public.posiciones_vehiculo enable row level security;

drop policy if exists "posiciones_select_admin" on public.posiciones_vehiculo;
create policy "posiciones_select_admin"
  on public.posiciones_vehiculo for select
  using (
    exists (
      select 1 from public.user_profiles p
      where p.id = auth.uid() and p.role = 'admin' and p.is_active
    )
  );

drop policy if exists "posiciones_insert_any" on public.posiciones_vehiculo;
create policy "posiciones_insert_any"
  on public.posiciones_vehiculo for insert
  with check (auth.uid() is not null);

drop policy if exists "posiciones_update_own" on public.posiciones_vehiculo;
create policy "posiciones_update_own"
  on public.posiciones_vehiculo for update
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

notify pgrst, 'reload schema';
