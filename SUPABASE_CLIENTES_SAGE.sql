-- ═══
-- MIGRACIÓN para importación de clientes de SAGE 50 (INFORME.xlsx)
-- Ejecutar una vez en Supabase > SQL Editor.
--
-- Añade a `clientes`:
--   - lat / lng     (coordenadas de geocodificación automática)
--   - sageCodigo    (código de cliente en Sage, para dedup/futuras sincronizaciones)
--   - sageDatos     (jsonb: datos crudos que no encajan en columnas, nunca se pierden)
-- ═══

alter table public.clientes add column if not exists lat double precision;
alter table public.clientes add column if not exists lng double precision;
alter table public.clientes add column if not exists sagecodigo text;
alter table public.clientes add column if not exists sagedatos jsonb;
alter table public.partes_trabajo add column if not exists emailsecundario text;
alter table public.partes_trabajo add column if not exists sellocliente text;
alter table public.partes_trabajo add column if not exists motivointerno text;
alter table public.partes_trabajo add column if not exists internoorigen text;
alter table public.partes_trabajo add column if not exists internodestino text;
alter table public.partes_trabajo add column if not exists interno boolean default false;

-- El albarán solo existe en partes internos; la columna no puede ser NOT NULL
alter table public.partes_trabajo alter column fotosalbaran drop not null;
alter table public.partes_trabajo alter column sellocliente drop not null;
alter table public.partes_trabajo alter column emailsecundario drop not null;
alter table public.partes_trabajo alter column motivointerno drop not null;
alter table public.partes_trabajo alter column internoorigen drop not null;
alter table public.partes_trabajo alter column internodestino drop not null;

notify pgrst, 'reload schema';
