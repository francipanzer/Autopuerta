-- Vinculo incidencia → parte de trabajo.
-- Ejecutar UNA vez en el SQL Editor de Supabase. Es seguro repetirlo.
-- Al marcar una incidencia como resuelta, la app ofrece crear un parte de trabajo
-- vinculado (partes_trabajo.incidenciaid = id de la incidencia).
-- get_app_work_parts / get_app_work_parts_list devuelven la fila completa en jsonb
-- (solo recortan DNI/firmas/fotos), así que la columna nueva viaja sin cambios.

-- 1. Columna del vínculo en partes_trabajo
alter table public.partes_trabajo
  add column if not exists incidenciaid text;

comment on column public.partes_trabajo.incidenciaid is
  'Si el parte se creó al resolver una incidencia, id de esa incidencia (tabla incidencias).';

-- 2. Índice para consultar "el parte de esta incidencia" rápido.
create index if not exists partes_trabajo_incidenciaid_idx
  on public.partes_trabajo (incidenciaid);
