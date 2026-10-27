-- Material usado en los partes de trabajo + descuento automático de stock del almacén.
-- Ejecutar una vez en el SQL Editor de Supabase.
--
-- Cada parte guarda en `materiales` una lista de líneas:
--   {"articuloId": "<id del almacén o vacío>", "descripcion": "...", "cantidad": 2, "unidad": "ud"}
-- Solo las líneas con articuloId descuentan stock. El trigger calcula la diferencia entre el
-- material anterior y el nuevo, de modo que al editar o borrar un parte el stock se ajusta/devuelve.

alter table public.partes_trabajo
  add column if not exists materiales jsonb not null default '[]'::jsonb;

-- La tabla usa permisos de lectura por columna: la nueva columna debe poder leerse
grant select (materiales) on table public.partes_trabajo to authenticated;

-- Las cantidades pueden ser decimales (litros, metros...): el stock debe admitirlos
do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'almacen' and column_name = 'stock'
      and data_type in ('smallint', 'integer', 'bigint')
  ) then
    alter table public.almacen alter column stock type numeric;
  end if;
end $$;

create or replace function public.apply_part_material_stock()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  old_m jsonb := '[]'::jsonb;
  new_m jsonb := '[]'::jsonb;
  r record;
begin
  if tg_op in ('UPDATE', 'DELETE') and jsonb_typeof(old.materiales) = 'array' then
    old_m := old.materiales;
  end if;
  if tg_op in ('INSERT', 'UPDATE') and jsonb_typeof(new.materiales) = 'array' then
    new_m := new.materiales;
  end if;

  for r in
    with old_items as (
      select i ->> 'articuloId' as aid,
             sum(coalesce(nullif(i ->> 'cantidad', '')::numeric, 0)) as qty
      from jsonb_array_elements(old_m) i
      where coalesce(i ->> 'articuloId', '') <> ''
      group by 1
    ), new_items as (
      select i ->> 'articuloId' as aid,
             sum(coalesce(nullif(i ->> 'cantidad', '')::numeric, 0)) as qty
      from jsonb_array_elements(new_m) i
      where coalesce(i ->> 'articuloId', '') <> ''
      group by 1
    )
    select coalesce(n.aid, o.aid) as aid,
           coalesce(n.qty, 0) - coalesce(o.qty, 0) as delta
    from new_items n full join old_items o on o.aid = n.aid
  loop
    if r.delta <> 0 then
      update public.almacen set stock = coalesce(stock, 0) - r.delta where id::text = r.aid;
    end if;
  end loop;

  return null;
end;
$$;

revoke all on function public.apply_part_material_stock() from public, anon, authenticated;

drop trigger if exists trg_apply_part_material_stock on public.partes_trabajo;
create trigger trg_apply_part_material_stock
  after insert or delete or update of materiales on public.partes_trabajo
  for each row execute function public.apply_part_material_stock();

notify pgrst, 'reload schema';

-- ============================================================
-- MIGRACIÓN: parte de trabajo "Desplazamiento interno"
-- (recogida de material, taller... sin cliente; sus KMs cuentan
--  para el vehículo pero no se asignan a ningún cliente)
-- Ejecutar UNA VEZ en Supabase > SQL Editor. Es idempotente.
-- ============================================================
alter table public.partes_trabajo add column if not exists interno boolean not null default false;
alter table public.partes_trabajo add column if not exists motivointerno text;

grant select (interno, motivointerno) on table public.partes_trabajo to authenticated;
grant select (interno, motivointerno) on table public.partes_trabajo to anon;

notify pgrst, 'reload schema';
