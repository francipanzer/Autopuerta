-- ═══════════════════════════════════════════════════════════════════════════
-- SUPABASE_ARTICULOS_SAGE.sql
-- Artículos de Sage 50 en el almacén + stock bidireccional.
-- Ejecutar UNA vez en Supabase > SQL Editor (es seguro repetirlo).
--
--  1) almacen: columnas nuevas. `sagecodigo` es la CLAVE COMÚN con Sage 50.
--  2) almacen_movimientos: libro de movimientos de stock. Un trigger apunta TODO cambio de
--     stock (partes, entradas de material, ajustes manuales...) y marca si ya consta en Sage.
--       app → Sage : los movimientos con exportadosage = false se exportan y se marcan.
--       Sage → app : al importar existencias, stock = existencias de Sage + lo pendiente de enviar.
--  3) Artículos con controlstock = false (mano de obra, seguros...) nunca mueven stock.
--  4) get_app_warehouse: los técnicos reciben además baja / controlstock / sagecodigo.
-- ═══════════════════════════════════════════════════════════════════════════

-- 1) Columnas del artículo ---------------------------------------------------
alter table public.almacen add column if not exists sagecodigo  text;
alter table public.almacen add column if not exists codigoalt   text;
alter table public.almacen add column if not exists familia     text;
alter table public.almacen add column if not exists codfamilia  text;
alter table public.almacen add column if not exists descripcion text;
alter table public.almacen add column if not exists localizacion text;
alter table public.almacen add column if not exists baja        boolean not null default false;
alter table public.almacen add column if not exists fechabaja   date;
alter table public.almacen add column if not exists controlstock boolean not null default true;
alter table public.almacen add column if not exists sagestock   numeric;      -- última existencia comunicada por Sage
alter table public.almacen add column if not exists sagesyncat  timestamptz;  -- cuándo
alter table public.almacen add column if not exists sagedatos   jsonb;        -- campos de Sage sin columna propia (nunca se pierden)

-- Un código de Sage = un único artículo (Sage distingue mayúsculas: «ni000062» y «NI000062» son distintos)
create unique index if not exists almacen_sagecodigo_uidx
  on public.almacen (btrim(sagecodigo)) where sagecodigo is not null and btrim(sagecodigo) <> '';

-- 2) Libro de movimientos ----------------------------------------------------
create table if not exists public.almacen_movimientos (
  id bigint generated always as identity primary key,
  articuloid text not null,
  sagecodigo text,
  delta numeric not null,
  stockresultante numeric,
  origen text not null default 'app',            -- 'app' | 'sage'
  exportadosage boolean not null default false,  -- true = ya consta en Sage
  exportadoat timestamptz,
  creadopor uuid default auth.uid(),
  createdat timestamptz not null default now()
);
create index if not exists almacen_mov_pend_idx on public.almacen_movimientos (articuloid) where not exportadosage;
create index if not exists almacen_mov_art_idx  on public.almacen_movimientos (articuloid, createdat desc);

alter table public.almacen_movimientos enable row level security;
revoke all on public.almacen_movimientos from anon;
grant select, update on public.almacen_movimientos to authenticated;
drop policy if exists "admins read almacen_movimientos" on public.almacen_movimientos;
create policy "admins read almacen_movimientos" on public.almacen_movimientos for select to authenticated
  using (public.app_is_admin());
drop policy if exists "admins update almacen_movimientos" on public.almacen_movimientos;
create policy "admins update almacen_movimientos" on public.almacen_movimientos for update to authenticated
  using (public.app_is_admin()) with check (public.app_is_admin());

-- 3) Trigger: apunta cada cambio de stock y respeta controlstock = false ------
create or replace function public.almacen_stock_guard()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  desde_sage boolean;
begin
  if tg_op = 'INSERT' then
    if coalesce(new.controlstock, true) and coalesce(new.stock, 0) <> 0 then
      desde_sage := new.sagestock is not null;
      insert into public.almacen_movimientos (articuloid, sagecodigo, delta, stockresultante, origen, exportadosage, exportadoat)
      values (new.id::text, new.sagecodigo, new.stock, new.stock,
              case when desde_sage then 'sage' else 'app' end, desde_sage, case when desde_sage then now() end);
    end if;
    return new;
  end if;

  if new.stock is distinct from old.stock then
    if coalesce(new.controlstock, true) = false then
      new.stock := old.stock;                     -- servicios: no llevan stock
      return new;
    end if;
    desde_sage := new.sagestock is distinct from old.sagestock;
    insert into public.almacen_movimientos (articuloid, sagecodigo, delta, stockresultante, origen, exportadosage, exportadoat)
    values (new.id::text, new.sagecodigo, coalesce(new.stock, 0) - coalesce(old.stock, 0), new.stock,
            case when desde_sage then 'sage' else 'app' end, desde_sage, case when desde_sage then now() end);
  end if;
  return new;
end;
$$;
revoke all on function public.almacen_stock_guard() from public, anon, authenticated;

drop trigger if exists trg_almacen_stock_guard on public.almacen;
create trigger trg_almacen_stock_guard
  before insert or update of stock on public.almacen
  for each row execute function public.almacen_stock_guard();

-- 4) Datos del almacén para técnicos (solo lo imprescindible, ahora con baja / controlstock) ----
create or replace function public.get_app_warehouse()
returns jsonb
language plpgsql stable security definer
set search_path = ''
as $$
declare
  result jsonb;
begin
  if not public.app_is_active_user() then
    raise exception 'Authentication required';
  end if;
  if public.app_is_admin() then
    select coalesce(jsonb_agg(to_jsonb(a)), '[]'::jsonb) into result from public.almacen a;
  else
    select coalesce(jsonb_agg(jsonb_build_object(
      'id', a.id, 'referencia', a.referencia, 'nombre', a.nombre, 'stock', a.stock,
      'sagecodigo', a.sagecodigo, 'baja', a.baja, 'controlstock', a.controlstock
    )), '[]'::jsonb) into result from public.almacen a;
  end if;
  return result;
end;
$$;

notify pgrst, 'reload schema';
