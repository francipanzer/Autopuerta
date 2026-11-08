-- ═══════════════════════════════════════════════════════════════════════════
-- SUPABASE_REESTRUCTURA_CLIENTES.sql
-- Reestructura de clientes / ubicaciones / rutas / revisiones (nov 2026)
--
-- MODELO NUEVO
--   cliente individual  → una nave, sus puertas cuelgan directamente de él.
--   cliente CENTRAL     → clientes.central = true. Tiene varias UBICACIONES
--                         (tabla ubicaciones, con todos los datos de un cliente)
--                         y cada ubicación tiene sus PUERTAS (puertas.ubicacionid).
--   ruta                → pertenece a un cliente central (rutas.clienteid) y agrupa
--                         varias de sus ubicaciones (ubicaciones.rutaid).
--   mantenimiento       → clientes.mantenimiento = true: tiene revisiones contratadas.
--   periodicidad        → ya no depende de la ruta: se calcula por puerta
--                         (uso + criterio de la tabla de periodicidades).
--
-- QUÉ HACE ESTE SCRIPT
--   1. Copias de seguridad (bk_reestructura_*).
--   2. Añade las columnas nuevas.
--   3. Migra los datos antiguos: cada cadena → cliente central; cada tienda
--      (cliente con cadena/padre) → ubicación; sus puertas y todos los documentos
--      que apuntaban a la tienda (partes, presupuestos, albaranes…) pasan a apuntar
--      al cliente central + ubicación; la tienda deja de ser un cliente suelto.
--   4. Nueva versión de update_door_revision_schedule (la próxima revisión la
--      calcula la app según la periodicidad de la puerta).
--
-- Ejecutar UNA vez en Supabase → SQL Editor. Es idempotente (se puede repetir).
-- La tabla 'cadenas' y las columnas antiguas (escadena, padreid, cadenaid, rutaid,
-- ordenruta, rutas.cadenaid, rutas.frecuenciameses) NO se borran: quedan como
-- respaldo y la app ya no las usa.
-- ═══════════════════════════════════════════════════════════════════════════

-- 1) COPIAS DE SEGURIDAD (solo la primera vez) ─────────────────────────────
do $$
declare t text;
begin
  foreach t in array array['clientes','ubicaciones','rutas','cadenas','puertas'] loop
    if to_regclass('public.'||t) is not null
       and to_regclass('public.bk_reestructura_'||t) is null then
      execute format('create table public.bk_reestructura_%I as select * from public.%I', t, t);
      execute format('alter table public.bk_reestructura_%I enable row level security', t);
      raise notice 'Copia de seguridad creada: bk_reestructura_%', t;
    end if;
  end loop;
end $$;

-- 2) COLUMNAS NUEVAS ───────────────────────────────────────────────────────
alter table public.clientes    add column if not exists central        boolean not null default false;
alter table public.clientes    add column if not exists mantenimiento  boolean not null default false;

-- Una ubicación guarda TODOS los datos de un cliente
alter table public.ubicaciones add column if not exists contacto       text;
alter table public.ubicaciones add column if not exists telefono       text;
alter table public.ubicaciones add column if not exists email          text;
alter table public.ubicaciones add column if not exists rutaid         text;
alter table public.ubicaciones add column if not exists ordenruta      integer;
alter table public.ubicaciones add column if not exists activa         boolean not null default true;
alter table public.ubicaciones add column if not exists clienteorigenid text;   -- id de la tienda antigua (trazabilidad)
alter table public.ubicaciones add column if not exists notas          text;
alter table public.ubicaciones add column if not exists lat            double precision;
alter table public.ubicaciones add column if not exists lng            double precision;

-- La ruta cuelga del cliente central
alter table public.rutas       add column if not exists clienteid      text;

-- La periodicidad se calcula por puerta (tabla de periodicidades)
alter table public.puertas     add column if not exists ubicacionid    text;
alter table public.puertas     add column if not exists uso            text;      -- garaje | industrial | comercial
alter table public.puertas     add column if not exists nvehiculos     integer;   -- garaje: nº de vehículos
alter table public.puertas     add column if not exists usoestacional  boolean not null default false;
alter table public.puertas     add column if not exists ciclosdia      integer;   -- comercial: ciclos/día
alter table public.puertas     add column if not exists frecuenciameses integer;  -- resultado calculado
alter table public.puertas     add column if not exists ultimorevision date;
alter table public.puertas     add column if not exists proximarevision date;

create index if not exists idx_ubicaciones_cliente on public.ubicaciones(clienteid);
create index if not exists idx_ubicaciones_ruta    on public.ubicaciones(rutaid);
create index if not exists idx_puertas_ubicacion   on public.puertas(ubicacionid);
create index if not exists idx_rutas_cliente       on public.rutas(clienteid);

-- 3) MIGRACIÓN DE DATOS: cadenas/tiendas → centrales/ubicaciones ───────────
do $$
declare
  cad        record;
  tienda     record;
  t          record;
  parent_id  text;
  ubi_id     text;
  n_cad      integer := 0;
  n_ubi      integer := 0;
  tiene_cadenas boolean := to_regclass('public.cadenas') is not null;
  tiene_partes  boolean := to_regclass('public.partes_trabajo') is not null;
begin
  create temp table if not exists _map_cadena(cadenaid text primary key, clienteid text) on commit drop;
  truncate _map_cadena;

  -- 3a) Cada cadena → cliente central (se reutiliza el cliente padre homónimo si existe)
  if tiene_cadenas then
    for cad in execute 'select id::text as id, nombre from public.cadenas' loop
      select c.id::text into parent_id
        from public.clientes c
       where c.escadena is true
         and lower(trim(c.nombre)) = lower(trim(cad.nombre))
       limit 1;
      if parent_id is null then
        parent_id := 'CLI-CAD-' || cad.id;
        insert into public.clientes(id, nombre, tipo, escadena, central, mantenimiento)
        values (parent_id, cad.nombre, 'empresa', true, true, true)
        on conflict (id) do nothing;
      end if;
      insert into _map_cadena values (cad.id, parent_id) on conflict do nothing;
      n_cad := n_cad + 1;
    end loop;
  end if;

  -- los clientes que ya eran "empresa/cadena principal" pasan a ser centrales
  update public.clientes set central = true where escadena is true and central is false;

  -- 3b) Cada tienda (cliente con cadena o padre) → ubicación del cliente central
  for tienda in
    select c.*
      from public.clientes c
     where coalesce(c.escadena, false) = false
       and (c.padreid is not null or c.cadenaid is not null)
  loop
    parent_id := null;
    -- 1º el cliente padre explícito; 2º el cliente central de su cadena
    if tienda.padreid is not null and tienda.padreid::text <> tienda.id::text
       and exists (select 1 from public.clientes p where p.id::text = tienda.padreid::text) then
      parent_id := tienda.padreid::text;
    elsif tienda.cadenaid is not null then
      select m.clienteid into parent_id from _map_cadena m where m.cadenaid = tienda.cadenaid::text;
    end if;
    continue when parent_id is null or parent_id = tienda.id::text;

    update public.clientes set central = true where id::text = parent_id and central is false;

    ubi_id := 'UBI-' || tienda.id::text;
    insert into public.ubicaciones(id, clienteid, denominacion, direccion, contacto, telefono, email,
                                   notas, lat, lng, rutaid, ordenruta, activa, clienteorigenid)
    values (ubi_id, parent_id, tienda.nombre, tienda.direccion, tienda.contacto, tienda.telefono, tienda.email,
            tienda.nota, tienda.lat, tienda.lng, tienda.rutaid::text, tienda.ordenruta, true, tienda.id::text)
    on conflict (id) do nothing;

    -- Partes de trabajo: se anota la ubicación antes de redirigir el cliente
    if tiene_partes then
      execute 'update public.partes_trabajo set ubicacionid = $1,
                      ubicacionnombre = coalesce(nullif(ubicacionnombre, ''''), $2),
                      ubicaciondireccion = coalesce(nullif(ubicaciondireccion, ''''), $3)
                where clienteid::text = $4 and (ubicacionid is null or ubicacionid = '''')'
        using ubi_id, tienda.nombre, tienda.direccion, tienda.id::text;
    end if;

    -- Puertas de la tienda → cliente central + ubicación
    update public.puertas
       set clienteid = parent_id, ubicacionid = ubi_id
     where clienteid::text = tienda.id::text;

    -- Cualquier otra tabla con clienteid (partes, presupuestos, albaranes, revisiones, incidencias…)
    for t in
      select c.table_name
        from information_schema.columns c
        join information_schema.tables  tb on tb.table_schema = c.table_schema and tb.table_name = c.table_name
       where c.table_schema = 'public' and c.column_name = 'clienteid'
         and tb.table_type = 'BASE TABLE'
         and c.table_name not in ('clientes','puertas','ubicaciones','rutas')
         and c.table_name not like 'bk\_reestructura\_%'
    loop
      begin
        execute format('update public.%I set clienteid = $1 where clienteid::text = $2', t.table_name)
          using parent_id, tienda.id::text;
      exception when others then
        raise notice 'No se pudo redirigir % (%): %', t.table_name, tienda.id, sqlerrm;
      end;
    end loop;

    -- La tienda ya no es un cliente suelto: es una ubicación
    delete from public.clientes where id::text = tienda.id::text;
    n_ubi := n_ubi + 1;
  end loop;

  -- 3c) Rutas → cuelgan del cliente central
  if tiene_cadenas then
    update public.rutas r set clienteid = m.clienteid
      from _map_cadena m
     where r.clienteid is null and r.cadenaid::text = m.cadenaid;
  end if;

  -- 3d) Mantenimiento contratado: centrales que venían de una cadena y clientes
  --     con alguna puerta ya programada (ajustable luego desde la ficha del cliente)
  update public.clientes set mantenimiento = true
   where id::text in (select clienteid from _map_cadena);
  update public.clientes set mantenimiento = true
   where id::text in (select distinct clienteid::text from public.puertas where proximarevision is not null);

  raise notice 'Migración completada: % cadenas → centrales, % tiendas → ubicaciones', n_cad, n_ubi;
end $$;

-- 4) RPC: el técnico registra la revisión de una puerta ─────────────────────
-- La próxima revisión ya no sale de la ruta: la calcula la app según la
-- periodicidad de la puerta y se pasa en p_next_revision (se valida aquí).
create or replace function public.update_door_revision_schedule(
  p_id text,
  p_last_revision date,
  p_state text,
  p_next_revision date
)
returns date
language plpgsql security definer
set search_path = ''
as $$
declare
  updated_rows integer;
begin
  if not public.app_is_active_user() or not (public.app_is_admin() or public.app_is_technician()) then
    raise exception 'Not authorized';
  end if;
  if p_last_revision is null or p_last_revision > current_date then
    raise exception 'Invalid revision date';
  end if;
  if p_next_revision is null or p_next_revision <= p_last_revision
     or p_next_revision > (p_last_revision + interval '25 months')::date then
    raise exception 'Invalid next revision date';
  end if;
  if p_state is not null and p_state not in ('operativa', 'averiada', 'fuera_servicio') then
    raise exception 'Invalid door state';
  end if;
  update public.puertas
     set ultimorevision = p_last_revision,
         proximarevision = p_next_revision,
         estado = coalesce(p_state, estado)
   where id::text = p_id;
  get diagnostics updated_rows = row_count;
  if updated_rows = 0 then raise exception 'Door not found'; end if;
  return p_next_revision;
end;
$$;
revoke all on function public.update_door_revision_schedule(text, date, text, date) from public, anon;
grant execute on function public.update_door_revision_schedule(text, date, text, date) to authenticated;

notify pgrst, 'reload schema';
