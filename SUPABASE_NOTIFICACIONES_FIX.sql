-- Ejecutar en Supabase > SQL Editor. Es seguro repetirlo.
-- Garantiza que partes y solicitudes tengan fecha de creacion (necesaria para los contadores).
-- Si la columna ya existia sin valor por defecto, los nuevos partes quedaban sin fecha y no contaban.

do $$
declare
  parts_table regclass := coalesce(to_regclass('public.partes_trabajo'), to_regclass('public."partesTrabajo"'));
begin
  execute format('alter table %s add column if not exists createdat timestamptz default now()', parts_table);
  execute format('alter table %s alter column createdat set default now()', parts_table);
end $$;

alter table public.solicitudes_material add column if not exists createdat timestamptz default now();
alter table public.solicitudes_material alter column createdat set default now();

create or replace function public.set_createdat_if_null()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.createdat := coalesce(new.createdat, now());
  return new;
end $$;

do $$
declare
  parts_table regclass := coalesce(to_regclass('public.partes_trabajo'), to_regclass('public."partesTrabajo"'));
begin
  execute format('drop trigger if exists set_createdat_partes on %s', parts_table);
  execute format('create trigger set_createdat_partes before insert on %s for each row execute function public.set_createdat_if_null()', parts_table);
end $$;

drop trigger if exists set_createdat_solicitudes on public.solicitudes_material;
create trigger set_createdat_solicitudes before insert on public.solicitudes_material
  for each row execute function public.set_createdat_if_null();

-- Comprobacion: debe devolver los ultimos partes con su fecha de creacion rellena.
-- select id, createdat, createdby from public.partes_trabajo order by createdat desc nulls last limit 5;
