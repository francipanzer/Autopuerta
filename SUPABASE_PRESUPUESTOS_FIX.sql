-- Alinea la tabla presupuestos con los nombres de columna que usa la app (minúsculas).
-- Ejecutar en Supabase > SQL Editor. Es idempotente.

create table if not exists public.presupuestos (id text primary key);

-- 1) Renombra columnas con mayúsculas o con guion bajo si existían
do $$
declare
  r record;
  pairs text[][] := array[
    ['clienteId','clienteid'], ['cliente_id','clienteid'],
    ['clienteNombre','clientenombre'], ['cliente_nombre','clientenombre'],
    ['validoHasta','validohasta'], ['valido_hasta','validohasta'],
    ['lineItems','lineitems'], ['line_items','lineitems'],
    ['createdAt','createdat'], ['updatedAt','updatedat']
  ];
  i int;
begin
  for i in 1..array_length(pairs, 1) loop
    if exists (select 1 from information_schema.columns
               where table_schema='public' and table_name='presupuestos' and column_name=pairs[i][1])
       and not exists (select 1 from information_schema.columns
               where table_schema='public' and table_name='presupuestos' and column_name=pairs[i][2]) then
      execute format('alter table public.presupuestos rename column %I to %I', pairs[i][1], pairs[i][2]);
    end if;
  end loop;
end $$;

-- 2) Añade las que falten
alter table public.presupuestos add column if not exists clienteid text;
alter table public.presupuestos add column if not exists clientenombre text;
alter table public.presupuestos add column if not exists fecha text;
alter table public.presupuestos add column if not exists validohasta text;
alter table public.presupuestos add column if not exists estado text default 'borrador';
alter table public.presupuestos add column if not exists notas text;
alter table public.presupuestos add column if not exists lineitems jsonb not null default '[]'::jsonb;
alter table public.presupuestos add column if not exists subtotal numeric default 0;
alter table public.presupuestos add column if not exists iva numeric default 0;
alter table public.presupuestos add column if not exists total numeric default 0;
alter table public.presupuestos add column if not exists createdat timestamptz default now();
alter table public.presupuestos add column if not exists updatedat timestamptz default now();
-- Parte de trabajo asociado al presupuesto (opcional; null = presupuesto individual)
alter table public.presupuestos add column if not exists parteid text;
-- Hoja de medidas adjunta (sistema hoja-v1: imagen + campos + valores)
alter table public.presupuestos add column if not exists medidasplanta jsonb;
-- Foto del artículo del almacén (opcional, base64 JPEG comprimido)
alter table public.almacen add column if not exists foto text;

-- 3) Refresca la caché de esquema de PostgREST
notify pgrst, 'reload schema';
